export type PdfIntegrityVerdict = 'intact' | 'modified' | 'cannot_verify';
export type PdfIntegritySignal = {
  id: string;
  weight: 'high' | 'medium' | 'low';
  message: string;
};
export type PdfIntegrityDetails = {
  revisionCount: number;
  hasPrevTrailer: boolean;
  creator: string | null;
  producer: string | null;
  creationDate: string | null;
  modDate: string | null;
  hasDigitalSignature: boolean;
  signals: PdfIntegritySignal[];
  analyzedWith: 'qpdf' | 'builtin';
};
export type PdfIntegrityResult = PdfIntegrityDetails & {
  verdict: PdfIntegrityVerdict;
  score: number;
  summary: string;
};
const CONSUMER_TOOL_PATTERN =
  /microsoft word|libreoffice|openoffice|google docs|skia\/pdf|quartz pdfcontext|print to pdf|microsoft print|pdfkit|fpdf|webkit|chrome|canva|ilovepdf|pdf24|wondershare|smallpdf|docx|pages \(mac\)/i;
const EDITOR_PRODUCER_PATTERN =
  /adobe acrobat|adobe pdf library|foxit|nitro|pdf-xchange|pdfsam|qpdf|pdf-lib|folio-mind/i;
export function sanitizePostgresText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const cleaned = value.split('\0').join('');
  return cleaned.length > 0 ? cleaned : null;
}
export function sanitizeIntegrityResult(result: PdfIntegrityResult): PdfIntegrityResult {
  return {
    ...result,
    summary: sanitizePostgresText(result.summary) ?? result.summary,
    creator: sanitizePostgresText(result.creator),
    producer: sanitizePostgresText(result.producer),
    creationDate: sanitizePostgresText(result.creationDate),
    modDate: sanitizePostgresText(result.modDate),
    signals: result.signals.map((signal) => ({
      ...signal,
      message: sanitizePostgresText(signal.message) ?? signal.message,
    })),
  };
}
function decodePdfString(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('(') && s.endsWith(')')) {
    s = s.slice(1, -1);
  } else if (s.startsWith('<') && s.endsWith('>')) {
    try {
      const hex = s.slice(1, -1).replace(/\s/g, '');
      if (/^[0-9a-f]+$/i.test(hex) && hex.length % 2 === 0) {
        s = Buffer.from(hex, 'hex').toString('utf8');
        return sanitizePostgresText(s) ?? '';
      }
    } catch {
      // Fall back to the raw hex body below if decoding fails.
    }
    return s.slice(1, -1);
  }
  s = s.replace(/\\([\\()nrtbf])/g, (_, ch: string) => {
    if (ch === 'n') return '\n';
    if (ch === 'r') return '\r';
    if (ch === 't') return '\t';
    if (ch === 'b') return '\b';
    if (ch === 'f') return '\f';
    return ch;
  });
  return sanitizePostgresText(s) ?? '';
}
export function parsePdfDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = value.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = m;
  const date = new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}
function extractInfoDictionary(latin: string): {
  creator: string | null;
  producer: string | null;
  creationDate: string | null;
  modDate: string | null;
} {
  const blocks = [...latin.matchAll(/<<[\s\S]*?>>/g)].map((m) => m[0]);
  let best: ReturnType<typeof extractInfoDictionary> | null = null;
  for (const block of blocks) {
    if (!/\/(Creator|Producer|CreationDate|ModDate)/.test(block)) continue;
    const pick = (key: string): string | null => {
      const re = new RegExp(
        `/${key}\\s*\\(([^)]*)\\)|/${key}\\s*<([^>]*)>|/${key}\\s*(D:[^\\s/>]+)`,
        'i',
      );
      const match = block.match(re);
      if (!match) return null;
      const raw = match[1] ?? match[2] ?? match[3];
      return raw ? decodePdfString(raw) : null;
    };
    const candidate = {
      creator: pick('Creator'),
      producer: pick('Producer'),
      creationDate: pick('CreationDate'),
      modDate: pick('ModDate'),
    };
    if (candidate.creator || candidate.producer || candidate.creationDate || candidate.modDate) {
      best = candidate;
    }
  }
  return (
    best ?? {
      creator: null,
      producer: null,
      creationDate: null,
      modDate: null,
    }
  );
}
function isConsumerOrigin(creator: string | null, producer: string | null): boolean {
  const hay = `${creator ?? ''} ${producer ?? ''}`.trim();
  if (!hay) return false;
  return CONSUMER_TOOL_PATTERN.test(hay);
}
function isSuspiciousCreatorProducer(creator: string | null, producer: string | null): boolean {
  if (!creator || !producer) return false;
  const c = creator.toLowerCase();
  const p = producer.toLowerCase();
  if (c === p) return false;
  if (CONSUMER_TOOL_PATTERN.test(c) && EDITOR_PRODUCER_PATTERN.test(p)) return true;
  if (/excel|word|powerpoint/.test(c) && /ilovepdf|smallpdf|pdf24|sejda|pdfescape/.test(p))
    return true;
  return false;
}
export function analyzePdfIntegrity(
  pdfBuffer: Buffer,
  analyzedWith: 'qpdf' | 'builtin' = 'builtin',
): PdfIntegrityResult {
  const latin = pdfBuffer.toString('latin1');
  const eofMatches = latin.match(/%%EOF/g);
  const revisionCount = Math.max(1, eofMatches?.length ?? 1);
  const hasPrevTrailer = /\/Prev\s+\d+/.test(latin);
  const hasDigitalSignature = /\/Type\s*\/Sig\b|\/SubFilter\s*\/adbe\.pkcs7/.test(latin);
  const { creator, producer, creationDate, modDate } = extractInfoDictionary(latin);
  const createdAt = parsePdfDate(creationDate);
  const modifiedAt = parsePdfDate(modDate);
  const signals: PdfIntegritySignal[] = [];
  let score = 0;
  if (revisionCount > 1 || hasPrevTrailer) {
    score += revisionCount > 2 ? 45 : 35;
    signals.push({
      id: 'multiple_revisions',
      weight: 'high',
      message: `В файле ${revisionCount} секций сохранения PDF (несколько %%EOF).`,
    });
  }
  if (createdAt && modifiedAt) {
    const deltaMs = modifiedAt.getTime() - createdAt.getTime();
    if (deltaMs < -60000) {
      score += 50;
      signals.push({
        id: 'impossible_dates',
        weight: 'high',
        message: 'Дата изменения раньше даты создания — возможна правка метаданных.',
      });
    } else if (deltaMs > 15000) {
      score += 25;
      signals.push({
        id: 'mod_after_create',
        weight: 'medium',
        message: 'Дата последнего изменения заметно позже даты создания.',
      });
    } else if (revisionCount > 1) {
      score += 12;
      signals.push({
        id: 'equal_dates_with_revisions',
        weight: 'medium',
        message: 'Даты совпадают, но структура файла указывает на повторные сохранения.',
      });
    }
  }
  if (isSuspiciousCreatorProducer(creator, producer)) {
    score += 22;
    signals.push({
      id: 'creator_producer_mismatch',
      weight: 'medium',
      message: `Creator (${creator}) и Producer (${producer}) указывают на разные инструменты.`,
    });
  }
  if (hasDigitalSignature && revisionCount > 1) {
    score += 15;
    signals.push({
      id: 'signature_with_revisions',
      weight: 'medium',
      message: 'Есть цифровая подпись и несколько ревизий файла — проверьте валидность подписи.',
    });
  }
  const consumerOrigin = isConsumerOrigin(creator, producer);
  let verdict: PdfIntegrityVerdict;
  let summary: string;
  if (score >= 45) {
    verdict = 'modified';
    summary = 'Структура PDF указывает на изменения после первоначального создания.';
  } else if (consumerOrigin && score < 30) {
    verdict = 'cannot_verify';
    summary =
      'Файл похож на экспорт из Word/Google/печати в PDF — структурная проверка не даёт надёжного вывода.';
  } else if (score >= 25) {
    verdict = 'modified';
    summary = 'Есть признаки повторного сохранения или правки метаданных.';
  } else {
    verdict = 'intact';
    summary = 'Явных структурных признаков модификации не обнаружено.';
  }
  return sanitizeIntegrityResult({
    verdict,
    score,
    summary,
    revisionCount,
    hasPrevTrailer,
    creator,
    producer,
    creationDate,
    modDate,
    hasDigitalSignature,
    signals,
    analyzedWith,
  });
}
