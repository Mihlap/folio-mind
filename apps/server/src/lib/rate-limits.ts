
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
