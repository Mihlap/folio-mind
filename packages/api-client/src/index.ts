export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  tenantId: string;
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
};

export type LoginBody = {
  email: string;
  password: string;
};
