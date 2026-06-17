import type { Env } from '../config/env.js';
import { getApiPublicOrigin } from '../config/api-public-origin.js';
import {
  buildEsiaAuthorizeUrl,
  exchangeEsiaCode,
  fetchEsiaProfile,
  isEsiaConfigured,
} from './esia.js';

export type OAuthProviderId = 'google' | 'yandex' | 'esia';

export type OAuthProfile = {
  providerUserId: string;
  email: string;
  name: string | null;
};

export function getOAuthRedirectUri(env: Env, provider: OAuthProviderId): string {
  return `${getApiPublicOrigin(env)}/auth/oauth/${provider}/callback`;
}

export function isOAuthConfigured(env: Env, provider: OAuthProviderId): boolean {
  if (provider === 'google') {
    return Boolean(env.GOOGLE_OAUTH_CLIENT_ID?.trim() && env.GOOGLE_OAUTH_CLIENT_SECRET?.trim());
  }
  if (provider === 'esia') {
    return isEsiaConfigured(env);
  }
  return Boolean(env.YANDEX_OAUTH_CLIENT_ID?.trim() && env.YANDEX_OAUTH_CLIENT_SECRET?.trim());
}

export function buildOAuthAuthorizeUrl(
  env: Env,
  provider: OAuthProviderId,
  state: string,
): string {
  const redirectUri = encodeURIComponent(getOAuthRedirectUri(env, provider));
  const encodedState = encodeURIComponent(state);

  if (provider === 'google') {
    const scope = encodeURIComponent('openid email profile');
    return (
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(env.GOOGLE_OAUTH_CLIENT_ID!)}` +
      `&redirect_uri=${redirectUri}` +
      `&response_type=code` +
      `&scope=${scope}` +
      `&state=${encodedState}` +
      `&prompt=select_account`
    );
  }

  if (provider === 'esia') {
    return buildEsiaAuthorizeUrl(env, state);
  }

  return (
    `https://oauth.yandex.ru/authorize?` +
    `response_type=code` +
    `&client_id=${encodeURIComponent(env.YANDEX_OAUTH_CLIENT_ID!)}` +
    `&redirect_uri=${redirectUri}` +
    `&state=${encodedState}`
  );
}

async function exchangeCode(
  env: Env,
  provider: OAuthProviderId,
  code: string,
): Promise<string> {
  const redirectUri = getOAuthRedirectUri(env, provider);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  if (provider === 'google') {
    body.set('client_id', env.GOOGLE_OAUTH_CLIENT_ID!);
    body.set('client_secret', env.GOOGLE_OAUTH_CLIENT_SECRET!);
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) throw new Error('Google token missing');
    return data.access_token;
  }

  body.set('client_id', env.YANDEX_OAUTH_CLIENT_ID!);
  body.set('client_secret', env.YANDEX_OAUTH_CLIENT_SECRET!);
  const res = await fetch('https://oauth.yandex.ru/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Yandex token exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Yandex token missing');
  return data.access_token;
}

async function fetchProfile(
  provider: OAuthProviderId,
  accessToken: string,
): Promise<OAuthProfile> {
  if (provider === 'google') {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Google userinfo failed: ${res.status}`);
    const data = (await res.json()) as { id?: string; email?: string; name?: string };
    if (!data.id || !data.email) throw new Error('Google profile incomplete');
    return {
      providerUserId: data.id,
      email: data.email.toLowerCase().trim(),
      name: data.name ?? null,
    };
  }

  const res = await fetch('https://login.yandex.ru/info?format=json', {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Yandex userinfo failed: ${res.status}`);
  const data = (await res.json()) as {
    id?: string;
    default_email?: string;
    emails?: string[];
    display_name?: string;
    real_name?: string;
  };
  const email = (data.default_email ?? data.emails?.[0])?.toLowerCase().trim();
  if (!data.id || !email) throw new Error('Yandex profile incomplete');
  return {
    providerUserId: data.id,
    email,
    name: data.display_name ?? data.real_name ?? null,
  };
}

export async function fetchOAuthProfile(
  env: Env,
  provider: OAuthProviderId,
  code: string,
  state?: string,
): Promise<OAuthProfile> {
  if (provider === 'esia') {
    const accessToken = await exchangeEsiaCode(env, code, state ?? '');
    return fetchEsiaProfile(accessToken, env);
  }
  const accessToken = await exchangeCode(env, provider, code);
  return fetchProfile(provider, accessToken);
}
