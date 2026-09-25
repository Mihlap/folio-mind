export type ScanEditNoticeLevel = 'pending' | 'warning' | 'info';

export type ScanEditNotice = {
  level: ScanEditNoticeLevel;
  title: string;
  description: string;
  blocksTextEdits: boolean;
  blocksTextSelection: boolean;
};

export function scanEditNotice(params: {
  visionOcrStatus?: string | null;
  textSource?: string | null;
  hasSourceDocx: boolean;
}): ScanEditNotice | null {
  const { visionOcrStatus: status, textSource, hasSourceDocx } = params;
  if (!status || status === 'not_needed') return null;

  if (status === 'queued' || status === 'processing') {
    return {
      level: 'pending',
      title: 'Идёт распознавание скана',
      description: hasSourceDocx
        ? 'PDF прочитан как скан: текстового слоя в нём нет. «Применить правки» внесёт их в Word, а PDF пересоберётся из DOCX.'
        : 'PDF прочитан как скан: текстового слоя в нём нет. Выделение текста на странице и правки в PDF не сработают, пока распознавание не завершится.',
      blocksTextEdits: false,
      blocksTextSelection: true,
    };
  }

  if (status === 'failed' || status === 'skipped') {
    if (hasSourceDocx) {
      return {
        level: 'info',
        title: 'PDF читается как скан',
        description:
          'Текстового слоя в PDF нет, но загружен исходный Word: правки будут внесены в DOCX, а PDF пересобран из него.',
        blocksTextEdits: false,
        blocksTextSelection: true,
      };
    }
    return {
      level: 'warning',
      title: 'Файл читается как скан',
      description:
        'В PDF нет текстового слоя, поэтому «Применить правки» и «DOCX с подсветкой» ничего не изменят. Загрузите PDF с текстовым слоем или исходный DOCX. «Собрать PDF с правками» (реестр «было / стало») работает и на скане.',
      blocksTextEdits: true,
      blocksTextSelection: true,
    };
  }

  if (status === 'ready') {
    if (textSource && textSource !== 'vision-ocr') return null;
    return {
      level: 'info',
      title: 'Текст скана распознан',
      description: hasSourceDocx
        ? 'Чат, поиск и извлечение текста работают по распознанному тексту. Правки будут внесены в Word, а PDF пересобран из DOCX.'
        : 'Чат, поиск и извлечение текста работают по распознанному тексту. В самом PDF текстового слоя нет, поэтому «Применить правки» ищет «Было» по распознанному тексту — совпадение не гарантировано. Надёжнее загрузить исходный DOCX.',
      blocksTextEdits: false,
      blocksTextSelection: true,
    };
  }

  return null;
}

export function scanEditNoticeClassName(level: ScanEditNoticeLevel): string {
  if (level === 'pending') return 'border-sky-200 bg-sky-50/90 text-sky-950';
  if (level === 'warning') return 'border-amber-200 bg-amber-50/90 text-amber-950';
  return 'border-slate-200 bg-slate-50 text-slate-800';
}
