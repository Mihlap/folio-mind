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
