import type { Env } from './env.js';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getApiPublicOrigin(env: Env): string {
  const configured = env.API_PUBLIC_URL?.trim();
  if (configured) return stripTrailingSlash(configured);
  const port = env.PORT;
  if (env.NODE_ENV === 'production') {
    return `http://${env.API_HOST}:${port}`;
  }
  return `http://localhost:${port}`;
}

export function getApiEmulatorOrigin(env: Env): string | null {
  const configured = env.API_EMULATOR_URL?.trim();
  if (configured) {
    const origin = stripTrailingSlash(configured);
    return origin === getApiPublicOrigin(env) ? null : origin;
  }
  if (env.NODE_ENV === 'development') {
    const fallback = `http://10.0.2.2:${env.PORT}`;
    return fallback === getApiPublicOrigin(env) ? null : fallback;
  }
  return null;
}
