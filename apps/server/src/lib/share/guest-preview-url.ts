import type { FastifyRequest } from 'fastify';
import type { Env } from '../config/env.js';

export function guestPreviewPageUrl(params: {
  env: Env;
  request: FastifyRequest;
  token: string;
  page: number;
  access?: string | null;
}): string {
  const { env, request, token, page, access } = params;
  const configured = env.API_PUBLIC_URL?.replace(/\/+$/, '');
  let base: string;
  if (configured) {
    base = `${configured}/public/share/${encodeURIComponent(token)}/pages/${page}`;
  } else {
    const forwardedProto = request.headers['x-forwarded-proto'];
    const proto =
      (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)?.split(',')[0]?.trim() ??
      'http';
    const forwardedHost = request.headers['x-forwarded-host'];
    const host =
      (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)?.split(',')[0]?.trim() ??
      request.headers.host ??
      'localhost:3001';

    base = `${proto}://${host}/public/share/${encodeURIComponent(token)}/pages/${page}`;
  }

  if (!access) return base;
  return `${base}?access=${encodeURIComponent(access)}`;
}
