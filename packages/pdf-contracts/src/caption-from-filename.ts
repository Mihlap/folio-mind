export function captionFromFileName(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '');
  return base
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
