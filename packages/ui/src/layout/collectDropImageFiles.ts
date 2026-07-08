export async function collectImageFilesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<File[]> {
  const items = dataTransfer.items;
  if (items && items.length > 0) {
    const fromEntries = await collectFromItems(items);
    if (fromEntries.length > 0) return fromEntries;
  }
  return Array.from(dataTransfer.files ?? []).filter(
    (f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name),
  );
}

async function collectFromItems(items: DataTransferItemList): Promise<File[]> {
  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item || item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  if (entries.length === 0) return [];
  const files: File[] = [];
  for (const entry of entries) {
    await walkEntry(entry, files);
  }
  return files.filter(
    (f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name),
  );
}

async function walkEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await readEntryFile(entry as FileSystemFileEntry);
    if (file) out.push(file);
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    let batch = await readDirectoryBatch(reader);
    while (batch.length > 0) {
      for (const child of batch) {
        await walkEntry(child, out);
      }
      batch = await readDirectoryBatch(reader);
    }
  }
}

function readEntryFile(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(null),
    );
  });
}

function readDirectoryBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    reader.readEntries(
      (entries) => resolve(entries),
      () => resolve([]),
    );
  });
}
