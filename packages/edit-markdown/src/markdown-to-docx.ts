import { parseInlineMarkdown, type InlineSegment } from './inline.js';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function segmentToDocxRun(segment: InlineSegment): string {
  const props: string[] = [];
  if (segment.bold) props.push('<w:b/>');
  if (segment.italic) props.push('<w:i/>');
  if (segment.code) {
    props.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>');
    props.push('<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>');
  }
  const rPr = props.length > 0 ? `<w:rPr>${props.join('')}</w:rPr>` : '';
  const preserve = /^\s|\s$/.test(segment.text) ? ' xml:space="preserve"' : '';
  return `<w:r>${rPr}<w:t${preserve}>${escapeXml(segment.text)}</w:t></w:r>`;
}

export function markdownInlineToDocxXml(text: string): string {
  return parseInlineMarkdown(text).map(segmentToDocxRun).join('');
}

export function plainMultilineToDocxXml(text: string): string | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length <= 1) return null;
  return lines
    .map((line, index) => {
      const preserve = /^\s|\s$/.test(line) ? ' xml:space="preserve"' : '';
      const content = `<w:t${preserve}>${escapeXml(line)}</w:t>`;
      if (index === 0) return `<w:r>${content}</w:r>`;
      return `<w:r><w:br/>${content}</w:r>`;
    })
    .join('');
}
