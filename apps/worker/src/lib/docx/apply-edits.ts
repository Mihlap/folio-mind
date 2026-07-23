import JSZip from 'jszip';
import { plainMultilineToDocxXml, type EditContentFormat } from '@folio-mind/edit-markdown';
export type DocxEdit = {
  originalText: string;
  suggestion: string;
  page: number;
  contentFormat?: EditContentFormat;
  suggestionPlain?: string;
  suggestionRunsXml?: string | null;
};
export type DocxEditResult = DocxEdit & {
  status: 'applied' | 'failed' | 'ambiguous';
  matchCount?: number;
};
type WtSegment = {
  index: number;
  length: number;
  openTag: string;
  text: string;
};
function stripIllegalXmlControls(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    // XML 1.0 allows TAB (0x09), LF (0x0A), CR (0x0D); other C0 controls are illegal.
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue;
    out += text[i];
  }
  return out;
}

function escapeXml(text: string): string {
  return stripIllegalXmlControls(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
function normalizeWs(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
export function normalizeForMatch(text: string): string {
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
function countOccurrencesInXml(xml: string, search: string): number {
  let total = 0;
  for (const variant of searchVariants(search)) {
    const segments = collectWtSegments(xml);
    if (segments.length === 0) continue;
    const plain = buildPlainWithStructuralSpaces(xml, segments);
    const plainNorm = normalizeForMatch(plain);
    const flexPattern = normalizeForMatch(variant)
      .split(' ')
      .filter(Boolean)
      .map((word) => (/^_{2,}$/.test(word) ? '[_\\s]{2,}' : escapeRegex(word)))
      .join('\\s+');
    if (!flexPattern) continue;
    const re = new RegExp(flexPattern, 'giu');
    const matches = plainNorm.match(re);
    total += matches?.length ?? 0;
    if (total > 0) break;
    if (xml.includes(variant)) total += 1;
  }
  return total;
}

function findRunOpenBefore(xml: string, index: number): number {
  let pos = index;
  while (pos > 0) {
    const found = xml.lastIndexOf('<w:r', pos);
    if (found < 0) return -1;
    const next = xml[found + 4];
    if (next === '>' || next === ' ' || next === '\n' || next === '\r' || next === '/') {
      return found;
    }
    pos = found - 1;
  }
  return -1;
}

function isParagraphOpenTagAt(xml: string, index: number): boolean {
  if (!xml.startsWith('<w:p', index)) return false;
  const next = xml[index + 4];
  return next === '>' || next === ' ' || next === '\t' || next === '\n' || next === '\r';
}

function findParagraphStart(xml: string, beforeIndex: number): number {
  let pos = beforeIndex;
  while (pos > 0) {
    const found = xml.lastIndexOf('<w:p', pos);
    if (found < 0) return -1;
    if (isParagraphOpenTagAt(xml, found)) return found;
    pos = found - 1;
  }
  return -1;
}

function findNextParagraphStart(xml: string, fromIndex: number): number {
  let pos = fromIndex;
  while (pos < xml.length) {
    const found = xml.indexOf('<w:p', pos);
    if (found < 0) return -1;
    if (isParagraphOpenTagAt(xml, found)) return found;
    pos = found + 4;
  }
  return -1;
}

function extractParagraphPPr(xml: string, paraStart: number): string {
  const paraOpenEnd = xml.indexOf('>', paraStart);
  if (paraOpenEnd < 0) return '';
  const paraEnd = xml.indexOf('</w:p>', paraOpenEnd);
  if (paraEnd < 0) return '';
  const inner = xml.slice(paraOpenEnd + 1, paraEnd);
  const match = inner.match(/^\s*<w:pPr[\s\S]*?<\/w:pPr>/);
  return match?.[0] ?? '';
}

function extractRunPr(xml: string, runOpenIndex: number): string {
  if (runOpenIndex < 0) return '';
  const runClose = xml.indexOf('</w:r>', runOpenIndex);
  if (runClose < 0) return '';
  const runChunk = xml.slice(runOpenIndex, runClose);
  const match = runChunk.match(/<w:rPr[\s\S]*?<\/w:rPr>/);
  return match?.[0] ?? '';
}

const HIGHLIGHT_MARKUP =
  '<w:highlight w:val="yellow"/><w:shd w:val="clear" w:color="auto" w:fill="FFFF00"/>';

function mergeRPrHighlight(rPr: string): string {
  if (!rPr) return `<w:rPr>${HIGHLIGHT_MARKUP}</w:rPr>`;
  if (rPr.includes('w:highlight') || rPr.includes('FFFF00')) return rPr;
  return rPr.replace('</w:rPr>', `${HIGHLIGHT_MARKUP}</w:rPr>`);
}

function buildStyledRun(rPr: string, text: string): string {
  const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  return `<w:r>${rPr}<w:t${preserve}>${escapeXml(text)}</w:t></w:r>`;
}

function applyRunPrToRunsFragment(rPr: string, runsXml: string): string {
  if (!rPr || !runsXml || runsXml.includes('<w:rPr')) return runsXml;
  return runsXml.replace(/<w:r>/g, `<w:r>${rPr}`);
}

function buildHighlightRunsXml(sourceRPr: string, suggestionPlain: string): string {
  const highlightRPr = mergeRPrHighlight(sourceRPr);
  const trimmed = suggestionPlain.trim();
  if (!trimmed) return buildStyledRun(highlightRPr, '\u00A0');
  const plainRuns = plainMultilineToDocxXml(trimmed);
  if (plainRuns) return applyRunPrToRunsFragment(highlightRPr, plainRuns);
  return buildStyledRun(highlightRPr, trimmed);
}

function explicitNonEmptyLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function paragraphsSpannedByMatch(
  xml: string,
  segments: WtSegment[],
  startSeg: number,
  endSeg: number,
): number {
  const startSegData = segments[startSeg]!;
  const endSegData = segments[endSeg]!;
  const startRunOpen = findRunOpenBefore(xml, startSegData.index);
  const endRunClose = xml.indexOf('</w:r>', endSegData.index);
  if (startRunOpen < 0 || endRunClose < 0) return 1;

  const startPara = findParagraphStart(xml, startRunOpen);
  const endPara = findParagraphStart(xml, endSegData.index);
  if (startPara < 0) return 1;
  if (endPara < startPara) return 1;

  let count = 0;
  let pos = startPara;
  while (pos >= 0 && pos <= endPara) {
    count++;
    if (pos === endPara) break;
    const next = findNextParagraphStart(xml, pos + 3);
    if (next < 0 || next > endPara) break;
    pos = next;
  }
  return Math.max(1, count);
}

function tryReplaceListExpansion(
  xml: string,
  segments: WtSegment[],
  startSeg: number,
  endSeg: number,
  startOff: number,
  endOff: number,
  originalSearch: string,
  replacement: string,
): string | null {
  const origLines = explicitNonEmptyLines(originalSearch);
  const replLines = explicitNonEmptyLines(replacement);
  if (replLines.length <= origLines.length || origLines.length < 1) return null;
  if (
    origLines.length >= 2 &&
    paragraphsSpannedByMatch(xml, segments, startSeg, endSeg) < origLines.length
  ) {
    return null;
  }

  const startSegData = segments[startSeg]!;
  const endSegData = segments[endSeg]!;
  const startRunOpen = findRunOpenBefore(xml, startSegData.index);
  const endRunClose = xml.indexOf('</w:r>', endSegData.index);
  if (startRunOpen < 0 || endRunClose < 0) return null;

  const paraStart = findParagraphStart(xml, startRunOpen);
  let paraEnd = xml.indexOf('</w:p>', endRunClose);
  if (paraStart < 0 || paraEnd < 0) return null;

  let paraCount = 1;
  let scanPos = paraEnd + '</w:p>'.length;
  while (paraCount < origLines.length) {
    const nextP = findNextParagraphStart(xml, scanPos);
    const nextPEnd = nextP >= 0 ? xml.indexOf('</w:p>', nextP) : -1;
    if (nextP < 0 || nextPEnd < 0) break;
    paraEnd = nextPEnd;
    paraCount++;
    scanPos = paraEnd + '</w:p>'.length;
  }

  const pPr = extractParagraphPPr(xml, paraStart);
  const rPr = extractRunPr(xml, startRunOpen);
  const newParagraphs = replLines
    .map((line) => `<w:p>${pPr}${buildStyledRun(rPr, line)}</w:p>`)
    .join('');
  return xml.slice(0, paraStart) + newParagraphs + xml.slice(paraEnd + '</w:p>'.length);
}

function tryHighlightListBlock(
  xml: string,
  segments: WtSegment[],
  startSeg: number,
  endSeg: number,
  startOff: number,
  endOff: number,
  originalSearch: string,
  suggestionPlain: string,
): string | null {
  const origLines = explicitNonEmptyLines(originalSearch);
  const replLines = explicitNonEmptyLines(suggestionPlain);
  if (origLines.length < 2) return null;
  if (paragraphsSpannedByMatch(xml, segments, startSeg, endSeg) < origLines.length) {
    return null;
  }
  const displayLines = replLines.length > 0 ? replLines : origLines;

  const startSegData = segments[startSeg]!;
  const endSegData = segments[endSeg]!;
  const startRunOpen = findRunOpenBefore(xml, startSegData.index);
  const endRunClose = xml.indexOf('</w:r>', endSegData.index);
  if (startRunOpen < 0 || endRunClose < 0) return null;

  const paraStart = findParagraphStart(xml, startRunOpen);
  let paraEnd = xml.indexOf('</w:p>', endRunClose);
  if (paraStart < 0 || paraEnd < 0) return null;

  let paraCount = 1;
  let scanPos = paraEnd + '</w:p>'.length;
  while (paraCount < origLines.length) {
    const nextP = findNextParagraphStart(xml, scanPos);
    const nextPEnd = nextP >= 0 ? xml.indexOf('</w:p>', nextP) : -1;
    if (nextP < 0 || nextPEnd < 0) break;
    paraEnd = nextPEnd;
    paraCount++;
    scanPos = paraEnd + '</w:p>'.length;
  }

  const pPr = extractParagraphPPr(xml, paraStart);
  const rPr = extractRunPr(xml, startRunOpen);
  const highlightRPr = mergeRPrHighlight(rPr);
  const paragraphs = displayLines.map(
    (line) => `<w:p>${pPr}${buildStyledRun(highlightRPr, line)}</w:p>`,
  );
  return xml.slice(0, paraStart) + paragraphs.join('') + xml.slice(paraEnd + '</w:p>'.length);
}

function insertReplacementRunsXml(
  xml: string,
  segments: WtSegment[],
  startSeg: number,
  endSeg: number,
  startOff: number,
  endOff: number,
  replacementRunsXml: string,
): string | null {
  const startSegData = segments[startSeg]!;
  const endSegData = segments[endSeg]!;
  const startRunOpen = findRunOpenBefore(xml, startSegData.index);
  const endRunClose = xml.indexOf('</w:r>', endSegData.index);
  if (startRunOpen < 0 || endRunClose < 0) return null;

  const before = startSegData.text.slice(0, startOff);
  const after = endSegData.text.slice(endOff);
  const startRPr = extractRunPr(xml, startRunOpen);
  const endRunOpen = findRunOpenBefore(xml, endSegData.index);
  const endRPr = extractRunPr(xml, endRunOpen);
  const beforeRun = before ? buildStyledRun(startRPr, before) : '';
  const afterRun = after ? buildStyledRun(endRPr, after) : '';
  const styledReplacement = applyRunPrToRunsFragment(startRPr, replacementRunsXml);
  return (
    xml.slice(0, startRunOpen) +
    `${beforeRun}${styledReplacement}${afterRun}` +
    xml.slice(endRunClose + '</w:r>'.length)
  );
}

function insertMultilineParagraphsReplacement(
  xml: string,
  segments: WtSegment[],
  startSeg: number,
  endSeg: number,
  startOff: number,
  endOff: number,
  lines: string[],
): string | null {
  if (lines.length <= 1) return null;
  const startSegData = segments[startSeg]!;
  const endSegData = segments[endSeg]!;
  const startRunOpen = findRunOpenBefore(xml, startSegData.index);
  const endRunClose = xml.indexOf('</w:r>', endSegData.index);
  if (startRunOpen < 0 || endRunClose < 0) return null;

  const paraStart = findParagraphStart(xml, startRunOpen);
  const paraEnd = xml.indexOf('</w:p>', endRunClose);
  if (paraStart < 0 || paraEnd < 0) return null;

  const paraOpenEnd = xml.indexOf('>', paraStart);
  if (paraOpenEnd < 0) return null;
  const paraInnerStart = paraOpenEnd + 1;
  const pPr = extractParagraphPPr(xml, paraStart);

  const paraSegments = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => segment.index >= paraInnerStart && segment.index < paraEnd);
  if (paraSegments.length === 0) return null;

  const firstParaSeg = paraSegments[0]!.index;
  const lastParaSeg = paraSegments[paraSegments.length - 1]!.index;
  const coversWholeParagraph =
    startSeg === firstParaSeg &&
    startOff === 0 &&
    endSeg === lastParaSeg &&
    endOff >= segments[lastParaSeg]!.text.length;
  if (!coversWholeParagraph) return null;

  const rPr = extractRunPr(xml, startRunOpen);
  const paragraphs = lines
    .map((line) => `<w:p>${pPr}${buildStyledRun(rPr, line)}</w:p>`)
    .join('');
  return xml.slice(0, paraStart) + paragraphs + xml.slice(paraEnd + '</w:p>'.length);
}

function tryHighlightMultilineParagraphs(
  xml: string,
  segments: WtSegment[],
  startSeg: number,
  endSeg: number,
  startOff: number,
  endOff: number,
  suggestionPlain: string,
): string | null {
  const lines = explicitNonEmptyLines(suggestionPlain);
  if (lines.length <= 1) return null;
  const startSegData = segments[startSeg]!;
  const endSegData = segments[endSeg]!;
  const startRunOpen = findRunOpenBefore(xml, startSegData.index);
  const endRunClose = xml.indexOf('</w:r>', endSegData.index);
  if (startRunOpen < 0 || endRunClose < 0) return null;

  const paraStart = findParagraphStart(xml, startRunOpen);
  const paraEnd = xml.indexOf('</w:p>', endRunClose);
  if (paraStart < 0 || paraEnd < 0) return null;

  const paraOpenEnd = xml.indexOf('>', paraStart);
  if (paraOpenEnd < 0) return null;
  const paraInnerStart = paraOpenEnd + 1;
  const pPr = extractParagraphPPr(xml, paraStart);

  const paraSegments = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => segment.index >= paraInnerStart && segment.index < paraEnd);
  if (paraSegments.length === 0) return null;

  const firstParaSeg = paraSegments[0]!.index;
  const lastParaSeg = paraSegments[paraSegments.length - 1]!.index;
  const coversWholeParagraph =
    startSeg === firstParaSeg &&
    startOff === 0 &&
    endSeg === lastParaSeg &&
    endOff >= segments[lastParaSeg]!.text.length;
  if (!coversWholeParagraph) return null;

  const rPr = extractRunPr(xml, startRunOpen);
  const highlightRPr = mergeRPrHighlight(rPr);
  const paragraphs = lines
    .map((line) => `<w:p>${pPr}${buildStyledRun(highlightRPr, line)}</w:p>`)
    .join('');
  return xml.slice(0, paraStart) + paragraphs + xml.slice(paraEnd + '</w:p>'.length);
}

function resolveReplacementRunsXml(
  replacement: string,
  replacementRunsXml: string | null,
  highlightPlain?: string | null,
): string | null {
  if (highlightPlain != null) return null;
  if (replacementRunsXml) return replacementRunsXml;
  if (replacement.includes('\n')) return plainMultilineToDocxXml(replacement);
  return null;
}

type ReplaceOptions = {
  originalSearch?: string;
  highlightPlain?: string | null;
};

function replaceAcrossWordRuns(
  xml: string,
  search: string,
  replacement: string,
  extraVariants: string[] = [],
  replacementRunsXml: string | null = null,
  options: ReplaceOptions = {},
): {
  xml: string;
  found: boolean;
} {
  const variants = [...extraVariants, ...searchVariants(search)];
  const seen = new Set<string>();
  const originalSearch = options.originalSearch ?? search;
  for (const variant of variants) {
    if (!variant || seen.has(variant)) continue;
    seen.add(variant);
    const hit = replaceAcrossWordRunsOnce(
      xml,
      variant,
      replacement,
      replacementRunsXml,
      originalSearch,
      options.highlightPlain,
    );
    if (hit.found) return hit;
  }
  return { xml, found: false };
}
function replaceAcrossWordRunsOnce(
  xml: string,
  search: string,
  replacement: string,
  replacementRunsXml: string | null = null,
  originalSearch: string = search,
  highlightPlain: string | null = null,
): {
  xml: string;
  found: boolean;
} {
  const trimmed = search.trim();
  if (!trimmed) return { xml, found: false };
  const runsXml = resolveReplacementRunsXml(replacement, replacementRunsXml, highlightPlain);
  if (!runsXml && highlightPlain == null) {
    const directCandidates = [escapeXml(trimmed), trimmed, normalizeWs(trimmed)];
    for (const candidate of directCandidates) {
      if (candidate && xml.includes(candidate)) {
        return { xml: xml.replace(candidate, escapeXml(replacement)), found: true };
      }
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
  const startRunOpen = findRunOpenBefore(xml, segments[startSeg]!.index);
  const sourceRPr = extractRunPr(xml, startRunOpen);

  if (highlightPlain != null) {
    const highlighted = tryHighlightListBlock(
      xml,
      segments,
      startSeg,
      endSeg,
      startOff,
      endOff,
      originalSearch,
      highlightPlain,
    );
    if (highlighted) return { xml: highlighted, found: true };

    const highlightedParagraphs = tryHighlightMultilineParagraphs(
      xml,
      segments,
      startSeg,
      endSeg,
      startOff,
      endOff,
      highlightPlain,
    );
    if (highlightedParagraphs) return { xml: highlightedParagraphs, found: true };

    const highlightRuns = buildHighlightRunsXml(sourceRPr, highlightPlain);
    const inserted = insertReplacementRunsXml(
      xml,
      segments,
      startSeg,
      endSeg,
      startOff,
      endOff,
      highlightRuns,
    );
    if (inserted) return { xml: inserted, found: true };
    return { xml, found: false };
  }

  if (runsXml) {
    const lines = replacement
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const expanded = tryReplaceListExpansion(
      xml,
      segments,
      startSeg,
      endSeg,
      startOff,
      endOff,
      originalSearch,
      replacement,
    );
    if (expanded) return { xml: expanded, found: true };

    const asParagraphs = insertMultilineParagraphsReplacement(
      xml,
      segments,
      startSeg,
      endSeg,
      startOff,
      endOff,
      lines,
    );
    if (asParagraphs) return { xml: asParagraphs, found: true };

    const inserted = insertReplacementRunsXml(
      xml,
      segments,
      startSeg,
      endSeg,
      startOff,
      endOff,
      runsXml,
    );
    if (inserted) return { xml: inserted, found: true };
  }

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
export type ApplyEditsOptions = {
  pageContextVariants?: (edit: DocxEdit) => string[];
  mode?: 'replace' | 'highlight';
};

export async function applyEditsToDocx(
  docxBuffer: Buffer,
  edits: DocxEdit[],
  options?: ApplyEditsOptions,
): Promise<{
  modifiedDocx: Buffer;
  applied: number;
  failed: number;
  ambiguous: number;
  results: DocxEditResult[];
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
  const partXml = new Map<string, string>();
  for (const path of partPaths) {
    const file = zip.file(path);
    if (file) partXml.set(path, await file.async('string'));
  }
  let applied = 0;
  let failed = 0;
  let ambiguous = 0;
  const results: DocxEditResult[] = [];
  for (const edit of sortedEdits) {
    const extraVariants = options?.pageContextVariants?.(edit) ?? [];
    let matchCount = 0;
    for (const xml of partXml.values()) {
      matchCount += countOccurrencesInXml(xml, edit.originalText);
      for (const variant of extraVariants) {
        matchCount += countOccurrencesInXml(xml, variant);
      }
    }
    if (matchCount > 1 && extraVariants.length === 0) {
      ambiguous++;
      results.push({ ...edit, status: 'ambiguous', matchCount });
      continue;
    }
    let found = false;
    const replacementPlain = edit.suggestionPlain ?? edit.suggestion;
    const replacementRuns =
      options?.mode === 'highlight'
        ? null
        : edit.suggestionRunsXml ?? plainMultilineToDocxXml(replacementPlain);
    const highlightPlain = options?.mode === 'highlight' ? replacementPlain : null;
    for (const path of partPaths) {
      const xml = partXml.get(path);
      if (!xml) continue;
      const { xml: next, found: hit } = replaceAcrossWordRuns(
        xml,
        edit.originalText,
        replacementPlain,
        extraVariants,
        replacementRuns,
        {
          originalSearch: edit.originalText,
          highlightPlain,
        },
      );
      if (hit) {
        partXml.set(path, next);
        zip.file(path, next);
        found = true;
        break;
      }
    }
    if (found) {
      applied++;
      results.push({ ...edit, status: 'applied' });
    } else if (matchCount > 1) {
      ambiguous++;
      results.push({ ...edit, status: 'ambiguous', matchCount });
    } else {
      failed++;
      results.push({ ...edit, status: 'failed' });
    }
  }
  const modifiedDocx = Buffer.from(
    await zip.generateAsync({
      type: 'nodebuffer',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
  );
  return { modifiedDocx, applied, failed, ambiguous, results };
}
