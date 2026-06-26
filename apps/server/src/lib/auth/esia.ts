import type { Env } from '../config/env.js';
import type { OAuthProfile } from './oauth-providers.js';
import { getApiPublicOrigin } from '../config/api-public-origin.js';
const ESIA_AUTH_URL = 'https://esia.gosuslugi.ru/aas/oauth2/v2/ac';
const ESIA_TOKEN_URL = 'https://esia.gosuslugi.ru/aas/oauth2/v2/te';
const ESIA_PERSON_URL = 'https://esia.gosuslugi.ru/rs/prns';
export function isEsiaConfigured(env: Env): boolean {
  return Boolean(env.ESIA_CLIENT_ID?.trim() && env.ESIA_CLIENT_SECRET?.trim());
}
export function buildEsiaAuthorizeUrl(env: Env, state: string): string {
  const redirectUri = encodeURIComponent(getEsiaRedirectUri(env));
  const params = new URLSearchParams({
    client_id: env.ESIA_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: 'openid fullname email mobile id_doc snils inn',
    response_type: 'code',
    state,
    timestamp: String(Math.floor(Date.now() / 1000)),
    access_type: 'online',
  });
  return `${ESIA_AUTH_URL}?${params}`;
}
export function getEsiaRedirectUri(env: Env): string {
  return `${getApiPublicOrigin(env)}/auth/oauth/esia/callback`;
}
function signEsiaRequest(_env: Env, method: string, url: string, body: string): string {
  void method;
  void url;
  void body;
  throw new Error(
    'ESIA requires PKCS#7 GOST R 34.10-2012 signature for token exchange. ' +
      'Install a qualified certificate and use a GOST crypto library (e.g. node-gost-crypto). ' +
      'Set ESIA_CLIENT_ID and ESIA_CLIENT_SECRET in env to configure.',
  );
}
export async function exchangeEsiaCode(env: Env, code: string, state: string): Promise<string> {
  const redirectUri = getEsiaRedirectUri(env);
  const body = new URLSearchParams({
    client_id: env.ESIA_CLIENT_ID!,
    client_secret: env.ESIA_CLIENT_SECRET!,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    state,
    scope: 'openid fullname email mobile',
  }).toString();
  const signed = signEsiaRequest(env, 'POST', ESIA_TOKEN_URL, body);
  const res = await fetch(ESIA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Signature': signed,
    },
    body,
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`ESIA token exchange failed: ${res.status} ${errBody}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
  };
  if (!data.access_token) {
    throw new Error('ESIA access_token missing in response');
  }
  return data.access_token;
}
export async function fetchEsiaProfile(accessToken: string, _env: Env): Promise<OAuthProfile> {
  const res = await fetch(`${ESIA_PERSON_URL}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`ESIA profile fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    oid?: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    email?: string;
    mobile?: string;
  };
  if (!data.oid) {
    throw new Error('ESIA profile missing oid');
  }
  const email = data.email ?? `${data.oid}@esia.gosuslugi.ru`;
  const name = [data.lastName, data.firstName, data.middleName].filter(Boolean).join(' ') || null;
  return {
    providerUserId: data.oid,
    email: email.toLowerCase().trim(),
    name,
  };
}
