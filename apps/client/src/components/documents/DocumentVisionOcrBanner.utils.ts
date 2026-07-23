export function isVisionOcrInProgress(status: string | null | undefined): boolean {
  return status === 'queued' || status === 'processing';
}
