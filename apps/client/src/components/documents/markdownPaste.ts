import { normalizeMarkdownInput } from '@folio-mind/edit-markdown';

/** HTML-буфер (Word, браузер) → markdown-список. */
export function htmlListsToMarkdown(html: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const list = doc.querySelector('ul, ol');
    if (!list) return null;
    const items = list.querySelectorAll(':scope > li');
    if (items.length === 0) return null;
    const ordered = list.tagName === 'OL';
    return Array.from(items)
      .map((li, index) => {
        const text = (li.textContent ?? '').replace(/\s+/g, ' ').trim();
        return ordered ? `${index + 1}. ${text}` : `- ${text}`;
      })
      .join('\n');
  } catch {
    return null;
  }
}

export function pasteMarkdownFromClipboard(data: DataTransfer): string | null {
  const html = data.getData('text/html');
  const fromHtml = html ? htmlListsToMarkdown(html) : null;
  const raw = fromHtml ?? data.getData('text/plain');
  if (!raw) return null;
  const normalized = normalizeMarkdownInput(raw);
  if (!fromHtml && normalized === raw) return null;
  return normalized;
}

export function insertTextAtSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  insert: string,
): { next: string; caret: number } {
  const next = value.slice(0, selectionStart) + insert + value.slice(selectionEnd);
  return { next, caret: selectionStart + insert.length };
}
