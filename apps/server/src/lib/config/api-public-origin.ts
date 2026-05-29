import type { Env } from './env.js';

/** Публичный origin API для ссылок в письмах и OAuth redirect URI. */
export function getApiPublicOrigin(env: Env): string {
  const port = env.PORT;
  if (env.NODE_ENV === 'production') {
    return env.API_PUBLIC_URL?.replace(/\/+$/, '') ?? `http://${env.API_HOST}:${port}`;
  }
  return `http://localhost:${port}`;
}
