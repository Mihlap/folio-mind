import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../store.js';
export const apiBaseUrl =
  (typeof import.meta !== 'undefined' &&
    (
      import.meta as {
        env?: {
          VITE_API_URL?: string;
        };
      }
    ).env?.VITE_API_URL) ||
  (typeof process !== 'undefined' && process.env.VITE_API_URL) ||
  'http://localhost:3001';
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: apiBaseUrl,
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.token;
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ['Me', 'Documents', 'Annotations', 'AiSuggestions', 'RagSources'],
  endpoints: () => ({}),
});
