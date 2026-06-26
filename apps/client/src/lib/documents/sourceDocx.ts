export function hasUserSourceDocx(key: string | null | undefined): boolean {
  return Boolean(key?.includes('/originals/'));
}
