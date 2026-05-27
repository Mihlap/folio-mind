import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ViewerDisplayMode = 'single' | 'continuous';
export type ViewerZoomMode = 'fit-width' | 'custom';

export type SearchMatch = {
  page: number;
  matchIndex: number;
  snippet: string;
};

type ViewerState = {
  displayMode: ViewerDisplayMode;
  zoomMode: ViewerZoomMode;
  customScale: number;
  searchQuery: string;
  searchMatches: SearchMatch[];
  activeMatchIndex: number;
};

const initialState: ViewerState = {
  displayMode: 'continuous',
  zoomMode: 'fit-width',
  customScale: 1,
  searchQuery: '',
  searchMatches: [],
  activeMatchIndex: 0,
};

export const viewerSlice = createSlice({
  name: 'viewer',
  initialState,
  reducers: {
    setDisplayMode: (state, action: PayloadAction<ViewerDisplayMode>) => {
      state.displayMode = action.payload;
    },
    setZoomMode: (state, action: PayloadAction<ViewerZoomMode>) => {
      state.zoomMode = action.payload;
    },
    setCustomScale: (state, action: PayloadAction<number>) => {
      state.customScale = Math.min(2.5, Math.max(0.5, action.payload));
      state.zoomMode = 'custom';
    },
    zoomIn: (state) => {
      state.zoomMode = 'custom';
      state.customScale = Math.min(2.5, state.customScale + 0.15);
    },
    zoomOut: (state) => {
      state.zoomMode = 'custom';
      state.customScale = Math.max(0.5, state.customScale - 0.15);
    },
    resetZoom: (state) => {
      state.zoomMode = 'fit-width';
      state.customScale = 1;
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
      state.searchMatches = [];
      state.activeMatchIndex = 0;
    },
    setSearchMatches: (state, action: PayloadAction<SearchMatch[]>) => {
      state.searchMatches = action.payload;
      state.activeMatchIndex = 0;
    },
    nextSearchMatch: (state) => {
      if (state.searchMatches.length === 0) return;
      state.activeMatchIndex = (state.activeMatchIndex + 1) % state.searchMatches.length;
    },
    prevSearchMatch: (state) => {
      if (state.searchMatches.length === 0) return;
      state.activeMatchIndex =
        (state.activeMatchIndex - 1 + state.searchMatches.length) % state.searchMatches.length;
    },
    clearSearch: (state) => {
      state.searchQuery = '';
      state.searchMatches = [];
      state.activeMatchIndex = 0;
    },
  },
});

export const {
  setDisplayMode,
  setZoomMode,
  setCustomScale,
  zoomIn,
  zoomOut,
  resetZoom,
  setSearchQuery,
  setSearchMatches,
  nextSearchMatch,
  prevSearchMatch,
  clearSearch,
} = viewerSlice.actions;
