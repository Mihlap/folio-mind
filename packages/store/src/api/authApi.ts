import type { AuthResponse, LoginBody, RegisterBody, AuthUser } from '@folio-mind/api-client';
import { baseApi } from './baseApi.js';

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    register: build.mutation<AuthResponse, RegisterBody>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
    }),
    login: build.mutation<AuthResponse, LoginBody>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),
    me: build.query<AuthUser, void>({
      query: () => '/me',
      providesTags: ['Me'],
    }),
    health: build.query<{ status: string; timestamp: string }, void>({
      query: () => '/health',
    }),
  }),
});

export const { useRegisterMutation, useLoginMutation, useMeQuery, useHealthQuery } = authApi;
