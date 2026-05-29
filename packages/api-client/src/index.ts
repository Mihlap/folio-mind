export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  tenantId: string;
  emailVerified?: boolean;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export type HealthResponse = {
  status: 'ok';
  timestamp: string;
  requestId?: string;
};

export type RegisterBody = {
  email: string;
  password: string;
  name?: string;
  tenantName?: string;
  captchaToken?: string;
};

export type RegisterResponse = {
  needsEmailVerification: true;
  email: string;
  message: string;
};

export type VerifyEmailBody = {
  token: string;
};

export type VerifyEmailResponse = {
  ok: true;
};

export type LoginBody = {
  email: string;
  password: string;
  captchaToken?: string;
};
