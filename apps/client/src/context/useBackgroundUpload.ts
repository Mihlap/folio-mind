import { useContext } from 'react';
import { BackgroundUploadContext } from './background-upload-context-value.js';

export function useBackgroundUpload() {
  const ctx = useContext(BackgroundUploadContext);
  if (!ctx) {
    throw new Error('useBackgroundUpload must be used within BackgroundUploadProvider');
  }
  return ctx;
}
