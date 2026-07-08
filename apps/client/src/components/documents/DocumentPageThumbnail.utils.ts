export function isThumbnailEager(page: number, initialPages = 15) {
  return page <= initialPages;
}
