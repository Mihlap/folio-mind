import JSZip from 'jszip';
export type DocxEdit = {
  originalText: string;
  suggestion: string;
  page: number;
};
type WtSegment = {
  index: number;
  length: number;
  openTag: string;
  text: string;
};
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
function normalizeWs(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
function normalizeForMatch(text: string): string {
  return text
    .replace(/\u00A0/g, ' ')
    .replace(/\u00AD/g, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[""«»„"]/g, '"')
    .replace(/[''‚‛]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
function searchVariants(search: string): string[] {
  const trimmed = search.trim();
  if (!trimmed) return [];
  const variants = [
    trimmed,
    normalizeWs(trimmed),
    normalizeForMatch(trimmed),
    normalizeForMatch(trimmed).replace(/[.,;:!?…]+$/, ''),
  ];
  return [...new Set(variants.filter((v) => v.length > 0))];
}
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function collectWtSegments(xml: string): WtSegment[] {
  const segments: WtSegment[] = [];
  const re = /<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    segments.push({
      index: match.index,
      length: match[0].length,
      openTag: `<w:t${match[1] ?? ''}>`,
      text: match[2] ?? '',
    });
  }
  return segments;
}
function buildPlainWithStructuralSpaces(xml: string, segments: WtSegment[]): string {
  let plain = '';
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) {
      const between = xml.slice(
        segments[i - 1]!.index + segments[i - 1]!.length,
        segments[i]!.index,
      );
      if (/<w:br[\s/>]|<\/w:p>\s*<w:p|<w:cr[\s/>]/.test(between)) {
        plain += ' ';
      }
    }
    plain += segments[i]!.text;
  }
  return plain;
}
function mapPlainSpanToSegments(
  xml: string,
  segments: WtSegment[],
  start: number,
  end: number,
): {
  startSeg: number;
  endSeg: number;
  startOff: number;
  endOff: number;
} | null {
  let charPos = 0;
  let startSeg = -1;
  let endSeg = -1;
  let startOff = 0;
  let endOff = 0;
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) {
      const between = xml.slice(
        segments[i - 1]!.index + segments[i - 1]!.length,
        segments[i]!.index,
      );
      if (/<w:br[\s/>]|<\/w:p>\s*<w:p|<w:cr[\s/>]/.test(between)) {
        const spacePos = charPos;
        charPos += 1;
        if (startSeg === -1 && start <= spacePos) {
          startSeg = i;
          startOff = 0;
        }
        if (startSeg !== -1 && end <= charPos) {
          endSeg = i;
          endOff = 0;
          return { startSeg, endSeg, startOff, endOff };
        }
      }
    }
    const segStart = charPos;
    const segEnd = charPos + segments[i]!.text.length;
    if (startSeg === -1 && start < segEnd) {
      startSeg = i;
      startOff = Math.max(0, start - segStart);
    }
    if (end <= segEnd) {
      endSeg = i;
      endOff = Math.max(0, end - segStart);
      return { startSeg, endSeg, startOff, endOff };
    }
    charPos = segEnd;
  }
  if (startSeg === -1 || endSeg === -1) return null;
  return { startSeg, endSeg, startOff, endOff };
}
function replaceAcrossWordRuns(
  xml: string,
  search: string,
  replacement: string,
): {
  xml: string;
  found: boolean;
} {
  for (const variant of searchVariants(search)) {
    const hit = replaceAcrossWordRunsOnce(xml, variant, replacement);
    if (hit.found) return hit;
  }
  return { xml, found: false };
}
function replaceAcrossWordRunsOnce(
  xml: string,
  search: string,
  replacement: string,
): {
  xml: string;
  found: boolean;
} {
  const trimmed = search.trim();
  if (!trimmed) return { xml, found: false };
  const directCandidates = [escapeXml(trimmed), trimmed, normalizeWs(trimmed)];
  for (const candidate of directCandidates) {
    if (candidate && xml.includes(candidate)) {
      return { xml: xml.replace(candidate, escapeXml(replacement)), found: true };
    }
  }
  const segments = collectWtSegments(xml);
  if (segments.length === 0) return { xml, found: false };
  const plain = buildPlainWithStructuralSpaces(xml, segments);
  const plainNorm = normalizeForMatch(plain);
  const flexPattern = normalizeForMatch(trimmed)
    .split(' ')
    .filter(Boolean)
    .map((word) => (/^_{2,}$/.test(word) ? '[_\\s]{2,}' : escapeRegex(word)))
    .join('\\s+');
  if (!flexPattern) return { xml, found: false };
  const plainRe = new RegExp(flexPattern, 'iu');
  const plainMatch = plain.match(plainRe);
  let start: number;
  let end: number;
  if (plainMatch?.index !== undefined) {
    start = plainMatch.index;
    end = start + plainMatch[0].length;
  } else {
    const normMatch = plainNorm.match(plainRe);
    if (normMatch?.index === undefined) return { xml, found: false };
    const span = findPlainSpanForNormMatch(plain, plainNorm, normMatch.index, normMatch[0].length);
    if (!span) return { xml, found: false };
    start = span.start;
    end = span.end;
  }
  const mapped = mapPlainSpanToSegments(xml, segments, start, end);
  if (!mapped) return { xml, found: false };
  const { startSeg, endSeg, startOff, endOff } = mapped;
  let result = xml;
  for (let i = endSeg; i >= startSeg; i--) {
    const seg = segments[i]!;
    let newText: string;
    if (startSeg === endSeg) {
      newText = seg.text.slice(0, startOff) + replacement + seg.text.slice(endOff);
    } else if (i === startSeg) {
      newText = seg.text.slice(0, startOff) + replacement;
    } else if (i === endSeg) {
      newText = seg.text.slice(endOff);
    } else {
      newText = '';
    }
    const newMatch = `${seg.openTag}${escapeXml(newText)}</w:t>`;
    result = result.slice(0, seg.index) + newMatch + result.slice(seg.index + seg.length);
  }
  return { xml: result, found: true };
}
function findPlainSpanForNormMatch(
  plain: string,
  plainNorm: string,
  normStart: number,
  normLen: number,
): {
  start: number;
  end: number;
} | null {
  const target = plainNorm.slice(normStart, normStart + normLen);
  if (!target) return null;
  const maxLen = Math.min(plain.length, target.length * 3 + 32);
  for (let start = 0; start < plain.length; start++) {
    for (let end = start + 1; end <= Math.min(plain.length, start + maxLen); end++) {
      if (normalizeForMatch(plain.slice(start, end)) === target) {
        return { start, end };
      }
    }
  }
  return null;
}
export async function applyEditsToDocx(
  docxBuffer: Buffer,
  edits: DocxEdit[],
): Promise<{
  modifiedDocx: Buffer;
  applied: number;
  failed: number;
}> {
  const sortedEdits = [...edits].sort((a, b) => b.originalText.length - a.originalText.length);
  const zip = await JSZip.loadAsync(docxBuffer);
  const partPaths = Object.keys(zip.files).filter(
    (name) =>
      !zip.files[name]?.dir &&
      (/^word\/document\.xml$/.test(name) ||
        /^word\/header\d*\.xml$/.test(name) ||
        /^word\/footer\d*\.xml$/.test(name)),
  );
  let applied = 0;
  let failed = 0;
  for (const edit of sortedEdits) {
    let found = false;
    for (const path of partPaths) {
      const file = zip.file(path);
      if (!file) continue;
      const xml = await file.async('string');
      const { xml: next, found: hit } = replaceAcrossWordRuns(
        xml,
        edit.originalText,
        edit.suggestion,
      );
      if (hit) {
        zip.file(path, next);
        found = true;
        break;
      }
    }
    if (found) applied++;
    else failed++;
  }
  const modifiedDocx = Buffer.from(
    await zip.generateAsync({
      type: 'nodebuffer',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
  );
  return { modifiedDocx, applied, failed };
}
