import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type BackgroundUploadKind = 'dashboard' | 'new-document' | 'version';

type BackgroundUploadState = {
  active: boolean;
  kind: BackgroundUploadKind | null;
  fileLabel: string;
  documentId: string | null;
  progress: number;
  showDone: boolean;
  error: string | null;
};

const initialState: BackgroundUploadState = {
  active: false,
  kind: null,
  fileLabel: '',
  documentId: null,
  progress: 0,
  showDone: false,
  error: null,
};

export const backgroundUploadSlice = createSlice({
  name: 'backgroundUpload',
  initialState,
  reducers: {
    uploadStarted(
      state,
      action: PayloadAction<{
        kind: BackgroundUploadKind;
        fileLabel: string;
        documentId?: string;
      }>,
    ) {
      state.active = true;
      state.kind = action.payload.kind;
      state.fileLabel = action.payload.fileLabel;
      state.documentId = action.payload.documentId ?? null;
      state.progress = 0;
      state.showDone = false;
      state.error = null;
    },
    uploadProgress(state, action: PayloadAction<number>) {
      state.progress = action.payload;
    },
    uploadShowDone(state) {
      state.showDone = true;
      state.progress = 100;
    },
    uploadFinished() {
      return initialState;
    },
    uploadFailed(state, action: PayloadAction<string>) {
      state.active = false;
      state.showDone = false;
      state.error = action.payload;
    },
    clearUploadError(state) {
      state.error = null;
    },
  },
});

export const {
  uploadStarted,
  uploadProgress,
  uploadShowDone,
  uploadFinished,
  uploadFailed,
  clearUploadError,
} = backgroundUploadSlice.actions;
