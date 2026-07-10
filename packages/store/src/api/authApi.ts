import type {
  AuthResponse,
  LoginBody,
  RegisterBody,
  RegisterResponse,
  AuthUser,
  VerifyEmailBody,
  VerifyEmailResponse,
  SendCodeBody,
  SendCodeResponse,
  PhoneRegisterBody,
  PhoneLoginBody,
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
    resendVerification: build.mutation<
      {
        ok: true;
      },
      {
        email: string;
      }
    >({
      query: (body) => ({ url: '/auth/resend-verification', method: 'POST', body }),
    }),
    emailVerificationStatus: build.mutation<
      {
        verified: boolean;
      },
      {
        email: string;
      }
    >({
      query: (body) => ({ url: '/auth/email-verification-status', method: 'POST', body }),
    }),
    requestMagicLink: build.mutation<
      {
        ok: true;
      },
      {
        email: string;
        captchaToken?: string;
      }
    >({
      query: (body) => ({ url: '/auth/magic-link', method: 'POST', body }),
    }),
    verifyMagicLink: build.mutation<
      AuthResponse,
      {
        token: string;
      }
    >({
      query: (body) => ({ url: '/auth/magic-link/verify', method: 'POST', body }),
    }),
    login: build.mutation<AuthResponse, LoginBody>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),
    acceptTenantInvite: build.mutation<
      AuthResponse & { documentId: string | null },
      { inviteToken: string }
    >({
      query: (body) => ({ url: '/auth/accept-tenant-invite', method: 'POST', body }),
      invalidatesTags: ['Me', 'Documents', 'DocumentMembers'],
    }),
    me: build.query<AuthUser, void>({
      query: () => '/me',
      providesTags: ['Me'],
    }),
    health: build.query<
      {
        status: string;
        timestamp: string;
      },
      void
    >({
      query: () => '/health',
    }),
    forgotPassword: build.mutation<
      {
        ok: true;
      },
      {
        email: string;
      }
    >({
      query: (body) => ({ url: '/auth/forgot-password', method: 'POST', body }),
    }),
    resetPassword: build.mutation<
      {
        ok: true;
      },
      {
        token: string;
        newPassword: string;
      }
    >({
      query: (body) => ({ url: '/auth/reset-password', method: 'POST', body }),
    }),
    sendPhoneCode: build.mutation<SendCodeResponse, SendCodeBody>({
      query: (body) => ({ url: '/auth/phone/send-code', method: 'POST', body }),
    }),
    phoneRegister: build.mutation<AuthResponse, PhoneRegisterBody>({
      query: (body) => ({ url: '/auth/phone/register', method: 'POST', body }),
    }),
    phoneLogin: build.mutation<AuthResponse, PhoneLoginBody>({
      query: (body) => ({ url: '/auth/phone/login', method: 'POST', body }),
    }),
  }),
});
export const {
  useRegisterMutation,
  useVerifyEmailMutation,
  useResendVerificationMutation,
  useEmailVerificationStatusMutation,
  useRequestMagicLinkMutation,
  useVerifyMagicLinkMutation,
  useLoginMutation,
  useAcceptTenantInviteMutation,
  useMeQuery,
  useHealthQuery,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useSendPhoneCodeMutation,
  usePhoneRegisterMutation,
  usePhoneLoginMutation,
} = authApi;
