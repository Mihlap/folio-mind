export function isDocxBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}
export function isUserUploadedSourceDocxKey(key: string | null | undefined): boolean {
  return Boolean(key?.includes('/originals/'));
}
