import type { FastifyPluginAsync } from 'fastify';
import type { Env } from '../lib/config/env.js';
import { createOAuthState, verifyOAuthState } from '../lib/auth/oauth-state.js';
import {
  buildOAuthAuthorizeUrl,
  fetchOAuthProfile,
  isOAuthConfigured,
  type OAuthProviderId,
} from '../lib/auth/oauth-providers.js';
import { findOrCreateUserFromOAuth } from '../lib/auth/oauth-user.js';

const OAUTH_COOKIE = 'oauth_state';
const PROVIDERS: OAuthProviderId[] = ['google', 'yandex', 'esia'];

function oauthErrorRedirect(env: Env, message: string): string {
  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  return `${base}/oauth/callback?error=${encodeURIComponent(message)}`;
}

function oauthSuccessRedirect(env: Env, token: string): string {
  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  return `${base}/oauth/callback?token=${encodeURIComponent(token)}`;
}

export const oauthRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const env = opts.env;

  for (const provider of PROVIDERS) {
    app.get(`/auth/oauth/${provider}/start`, async (request, reply) => {
      if (!isOAuthConfigured(env, provider)) {
        return reply.redirect(oauthErrorRedirect(env, `${provider} OAuth не настроен`));
      }

      const state = createOAuthState(provider, env.JWT_SECRET);
      reply.setCookie(OAUTH_COOKIE, state, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        maxAge: 600,
      });

      const url = buildOAuthAuthorizeUrl(env, provider, state);
      return reply.redirect(url);
    });

    app.get(`/auth/oauth/${provider}/callback`, async (request, reply) => {
      const query = request.query as { code?: string; state?: string; error?: string };
      if (query.error) {
        return reply.redirect(oauthErrorRedirect(env, 'Вход отменён'));
      }

      const code = query.code?.trim();
      const state = query.state?.trim();
      const cookieState = request.cookies[OAUTH_COOKIE];

      if (!code || !state || !cookieState || cookieState !== state) {
        return reply.redirect(oauthErrorRedirect(env, 'Некорректный OAuth-ответ'));
      }
      if (!verifyOAuthState(state, provider, env.JWT_SECRET)) {
        return reply.redirect(oauthErrorRedirect(env, 'Сессия OAuth устарела'));
      }

      reply.clearCookie(OAUTH_COOKIE, { path: '/' });

      if (!isOAuthConfigured(env, provider)) {
        return reply.redirect(oauthErrorRedirect(env, `${provider} OAuth не настроен`));
      }

      try {
        const profile = await fetchOAuthProfile(env, provider, code, state);
        const user = await findOrCreateUserFromOAuth(app.prisma, provider, profile);
        const token = await reply.jwtSign({
          sub: user.id,
          email: user.email,
          tenantId: user.tenantId,
        });
        return reply.redirect(oauthSuccessRedirect(env, token));
      } catch (err) {
        request.log.error({ err, provider }, 'oauth callback failed');
        return reply.redirect(oauthErrorRedirect(env, 'Не удалось войти через OAuth'));
      }
    });
  }
};
