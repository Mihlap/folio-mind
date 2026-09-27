const STORAGE_KEY = 'folio_storage_notice';
const STORAGE_VERSION = '1';

export function isStorageNoticeDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === STORAGE_VERSION;
  } catch {
    return true;
  }
}

export function dismissStorageNotice() {
  try {
    window.localStorage.setItem(STORAGE_KEY, STORAGE_VERSION);
  } catch {
    return;
  }
}

export function resetStorageNotice() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}
