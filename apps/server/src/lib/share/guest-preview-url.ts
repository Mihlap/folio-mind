import type { FastifyRequest } from 'fastify';
import type { Env } from '../config/env.js';

export function guestPreviewPageUrl(params: {
  env: Env;
  request: FastifyRequest;
  token: string;
  page: number;
}): string {
  const { env, request, token, page } = params;
  const configured = env.API_PUBLIC_URL?.replace(/\/+$/, '');
  if (configured) {
    return `${configured}/public/share/${encodeURIComponent(token)}/pages/${page}`;
  }

  const forwardedProto = request.headers['x-forwarded-proto'];
  const proto =
    (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)?.split(',')[0]?.trim() ??
    'http';
  const forwardedHost = request.headers['x-forwarded-host'];
  const host =
    (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)?.split(',')[0]?.trim() ??
    request.headers.host ??
    'localhost:3001';

  return `${proto}://${host}/public/share/${encodeURIComponent(token)}/pages/${page}`;
}
