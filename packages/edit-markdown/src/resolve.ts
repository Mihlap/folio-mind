import { hasInlineMarkdownFormatting } from './inline.js';
import {
  markdownFirstLineInlineSource,
  markdownToPlainText,
  normalizeMarkdownInput,
} from './markdown-to-plain.js';
import { markdownInlineToDocxXml, plainMultilineToDocxXml } from './markdown-to-docx.js';
import type { EditContentFormat, ResolvedEditSuggestion } from './types.js';

function inferEditContentFormat(content: string, format: EditContentFormat): EditContentFormat {
  if (format === 'markdown') return 'markdown';
  const normalized = normalizeMarkdownInput(content);
  if (/^[-*+•●]\s|^\d+[.)]\s|&bullet;/im.test(normalized)) return 'markdown';
  return 'plain';
}

export function resolveEditSuggestion(
  content: string,
  format: EditContentFormat,
): ResolvedEditSuggestion {
  const raw = content;
  const normalized = normalizeMarkdownInput(content);
  const effectiveFormat = inferEditContentFormat(content, format);

  if (effectiveFormat !== 'markdown') {
    const trimmed = normalized.trim();
    return {
      raw,
      plain: trimmed,
      docxPlain: trimmed,
      docxRunsXml: plainMultilineToDocxXml(trimmed),
    };
  }

  const plain = markdownToPlainText(normalized);
  const docxPlain = plain;
  const inlineSource = markdownFirstLineInlineSource(normalized);
  let docxRunsXml = hasInlineMarkdownFormatting(inlineSource)
    ? markdownInlineToDocxXml(inlineSource)
    : null;
  if (!docxRunsXml) {
    docxRunsXml = plainMultilineToDocxXml(plain);
  }

  return {
    raw,
    plain,
    docxPlain,
    docxRunsXml,
  };
}
