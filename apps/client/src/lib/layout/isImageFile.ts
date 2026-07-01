const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i;

export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return IMAGE_EXT.test(file.name);
}

export function filterImageFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter(isImageFile);
}
