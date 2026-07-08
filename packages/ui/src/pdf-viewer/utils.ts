export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
export function isRenderCancelled(err: unknown) {
  return (
    err instanceof Error &&
    (err.name === 'RenderingCancelledException' || err.message.includes('cancelled'))
  );
}
export function scrollPageWithinContainer(
  container: HTMLElement,
  pageEl: HTMLElement,
  behavior: ScrollBehavior = 'auto',
) {
  const top =
    pageEl.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop;
  container.scrollTo({ top, behavior });
}
export function highlightTextLayer(container: HTMLDivElement, query: string) {
  const lower = query.toLowerCase();
  for (const span of container.querySelectorAll('span')) {
    const text = span.textContent ?? '';
    const idx = text.toLowerCase().indexOf(lower);
    if (idx === -1) continue;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length);
    span.textContent = '';
    if (before) span.append(document.createTextNode(before));
    const mark = document.createElement('mark');
    mark.className = 'bg-yellow-300 text-inherit';
    mark.textContent = match;
    span.append(mark);
    if (after) span.append(document.createTextNode(after));
  }
}
