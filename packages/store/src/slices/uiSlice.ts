import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type UiState = {
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
};

const initialState: UiState = {
  sidebarOpen: true,
  theme: 'light',
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload;
    },
  },
});

export const { toggleSidebar, setTheme } = uiSlice.actions;
