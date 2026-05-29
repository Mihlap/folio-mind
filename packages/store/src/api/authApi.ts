import type {
  AuthResponse,
  LoginBody,
  RegisterBody,
  RegisterResponse,
  AuthUser,
  VerifyEmailBody,
  VerifyEmailResponse,
} from '@folio-mind/api-client';
import { baseApi } from './baseApi.js';

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    register: build.mutation<RegisterResponse, RegisterBody>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
    }),
    verifyEmail: build.mutation<VerifyEmailResponse, VerifyEmailBody>({
      query: (body) => ({ url: '/auth/verify-email', method: 'POST', body }),
    }),
    resendVerification: build.mutation<{ ok: true }, { email: string }>({
      query: (body) => ({ url: '/auth/resend-verification', method: 'POST', body }),
    }),
    requestMagicLink: build.mutation<{ ok: true }, { email: string; captchaToken?: string }>({
      query: (body) => ({ url: '/auth/magic-link', method: 'POST', body }),
    }),
    verifyMagicLink: build.mutation<VerifyEmailResponse, { token: string }>({
      query: (body) => ({ url: '/auth/magic-link/verify', method: 'POST', body }),
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
    forgotPassword: build.mutation<{ ok: true }, { email: string }>({
      query: (body) => ({ url: '/auth/forgot-password', method: 'POST', body }),
    }),
    resetPassword: build.mutation<{ ok: true }, { token: string; newPassword: string }>({
      query: (body) => ({ url: '/auth/reset-password', method: 'POST', body }),
    }),
  }),
});

export const {
  useRegisterMutation,
  useVerifyEmailMutation,
  useResendVerificationMutation,
  useRequestMagicLinkMutation,
  useVerifyMagicLinkMutation,
  useLoginMutation,
  useMeQuery,
  useHealthQuery,
  useForgotPasswordMutation,
  useResetPasswordMutation,
} = authApi;
