export const GLOBAL_RATE_LIMIT = {
  max: 200,
  timeWindow: '1 minute',
} as const;
export const UPLOAD_RATE_LIMIT = {
  max: 30,
  timeWindow: '1 minute',
} as const;
export const AUTH_PASSWORD_RESET_RATE_LIMIT = {
  max: 10,
  timeWindow: '1 minute',
} as const;
export const AUTH_REGISTER_RATE_LIMIT = {
  max: 5,
  timeWindow: '1 minute',
} as const;
export const AUTH_LOGIN_RATE_LIMIT = {
  max: 20,
  timeWindow: '1 minute',
} as const;
export const AUTH_RESEND_VERIFICATION_RATE_LIMIT = {
  max: 3,
  timeWindow: '10 minutes',
} as const;
export const AUTH_MAGIC_LINK_RATE_LIMIT = {
  max: 5,
  timeWindow: '10 minutes',
} as const;
