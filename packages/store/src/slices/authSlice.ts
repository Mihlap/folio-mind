import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser } from '@folio-mind/api-client';
type AuthState = {
  token: string | null;
  user: AuthUser | null;
};
const initialState: AuthState = {
  token: typeof localStorage !== 'undefined' ? localStorage.getItem('folio_token') : null,
  user: null,
};
export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{
        token: string;
        user: AuthUser;
      }>,
    ) => {
      state.token = action.payload.token;
      state.user = action.payload.user;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('folio_token', action.payload.token);
      }
    },
    setToken: (state, action: PayloadAction<string>) => {
      state.token = action.payload;
      state.user = null;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('folio_token', action.payload);
      }
    },
    logout: (state) => {
      state.token = null;
      state.user = null;
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('folio_token');
      }
    },
  },
});
export const { setCredentials, setToken, logout } = authSlice.actions;
