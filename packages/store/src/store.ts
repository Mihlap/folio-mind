import { configureStore } from '@reduxjs/toolkit';
import './api/authApi.js';
import './api/documentsApi.js';
import './api/aiApi.js';
import './api/annotationsApi.js';
import './api/ragApi.js';
import './api/shareApi.js';
import './api/guestCommentsApi.js';
import './api/mediaApi.js';
import { baseApi } from './api/baseApi.js';
import { authSlice } from './slices/authSlice.js';
import { uiSlice } from './slices/uiSlice.js';
import { viewerSlice } from './slices/viewerSlice.js';
import { backgroundUploadSlice } from './slices/backgroundUploadSlice.js';
export const createAppStore = () =>
  configureStore({
    reducer: {
      auth: authSlice.reducer,
      ui: uiSlice.reducer,
      viewer: viewerSlice.reducer,
      backgroundUpload: backgroundUploadSlice.reducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
