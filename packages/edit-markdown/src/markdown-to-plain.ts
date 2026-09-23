import { stripInlineMarkdown } from './inline.js';

export function normalizeMarkdownInput(markdown: string): string {
  const unified = markdown
    .replace(/&bullet;/gi, '•')
    .replace(/&#8226;/g, '•')
    .replace(/&#x2022;/gi, '•')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(/\t+/g, '\n');

  return unified
    .split('\n')
    .flatMap((line) => expandInlineListLine(line))
    .join('\n');
}

function expandInlineListLine(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [''];

  if (/^[-*+]\s+[•●]\s+/.test(trimmed)) {
    return [line];
  }

  const bulletParts = trimmed.split(/\s+[•●]\s+/);
  if (bulletParts.length > 1) {
    const first = bulletParts[0]!.replace(/^[•●]\s*/, '').trim();
    return [`• ${first}`, ...bulletParts.slice(1).map((part) => `• ${part.trim()}`)];
  }

  if (/^-\s+/.test(trimmed) && /\s-\s+/.test(trimmed)) {
    return trimmed.split(/\s+-\s+/).map((part) => `- ${part.replace(/^-\s*/, '').trim()}`);
  }

  return [line];
}

function normalizeLine(line: string): string {
  return line.trim();
}

function formatListLine(line: string): string | null {
  const withoutDashBullet = line.replace(/^[-*+]\s+([•●]\s*)/, '$1');
  const unordered = withoutDashBullet.match(/^[-*+•●]\s+(.+)$/);
  if (unordered) return `• ${stripInlineMarkdown(unordered[1]!)}`;
  const ordered = line.match(/^(\d+[.)])\s+(.+)$/);
  if (ordered) return `${ordered[1]} ${stripInlineMarkdown(ordered[2]!)}`;
  return null;
}

export function markdownToPlainText(markdown: string): string {
  const normalized = normalizeMarkdownInput(markdown);
  const lines = normalized.split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push(stripInlineMarkdown(paragraph.join(' ').trim()));
    paragraph = [];
  }

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    if (!line) {
      flushParagraph();
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      blocks.push(stripInlineMarkdown(heading[1]!));
      continue;
    }
    const listLine = formatListLine(line);
    if (listLine) {
      flushParagraph();
      blocks.push(listLine);
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return blocks.join('\n').trim();
}

export function markdownFirstLinePlain(markdown: string): string {
  const plain = markdownToPlainText(markdown);
  const first = plain.split('\n').find((line) => line.trim().length > 0);
  return first?.trim() ?? stripInlineMarkdown(markdown.replace(/\s+/g, ' ').trim());
}

export function markdownFirstLineInlineSource(markdown: string): string {
  const line =
    markdown
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((part) => part.trim())
      .find((part) => part.length > 0) ?? '';
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+•●]\s+/, '')
    .replace(/^\d+[.)]\s+/, '');
}
