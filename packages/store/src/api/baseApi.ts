import { createApi, fetchBaseQuery, type BaseQueryFn, type FetchArgs, type FetchBaseQueryError, type FetchBaseQueryMeta } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../store.js';
import { extractErrorText, extractErrorStatus, formatUserError } from './formatUserError.js';
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
export function normalizeFetchError(error: unknown): Error {
  const message = formatUserError(extractErrorText(error), extractErrorStatus(error));
  const normalized = new Error(message);
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if ('status' in record) {
      Object.defineProperty(normalized, 'status', {
        value: record.status,
        enumerable: true,
        configurable: true,
      });
    }
    if ('data' in record) {
      Object.defineProperty(normalized, 'data', {
        value: record.data,
        enumerable: true,
        configurable: true,
      });
    }
    if ('error' in record) {
      Object.defineProperty(normalized, 'error', {
        value: record.error,
        enumerable: true,
        configurable: true,
      });
    }
  }
  return normalized;
}
type ApiBaseQueryFn = BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError, object, FetchBaseQueryMeta>;
const rawBaseQuery = fetchBaseQuery({
  baseUrl: apiBaseUrl,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return headers;
  },
});
const baseQueryWithErrorNormalization: ApiBaseQueryFn = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error) {
    return { error: normalizeFetchError(result.error) as unknown as FetchBaseQueryError };
  }
  return result;
};
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithErrorNormalization,
  tagTypes: ['Me', 'Documents', 'DocumentMembers', 'DocumentMemberInvites', 'Projects', 'ProjectMembers', 'Annotations', 'AiSuggestions', 'RagSources', 'ShareLinks', 'GuestComments', 'MediaAssets', 'LayoutTemplates', 'Presentations'],
  endpoints: () => ({}),
});
