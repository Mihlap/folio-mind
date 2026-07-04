import type { FastifyPluginAsync } from 'fastify';
import type { Env } from '../../lib/config/env.js';
import { registerCreateRoutes } from './register-create.routes.js';
import { registerDeleteRoutes } from './register-delete.routes.js';
import { registerOperationsRoutes } from './register-operations.routes.js';
import { registerReadRoutes } from './register-read.routes.js';
import { registerVersionsRoutes } from './register-versions.routes.js';
import { registerShareRoutes } from './register-share.routes.js';
import { registerGuestCommentsRoutes } from './register-guest-comments.routes.js';
import { registerReviewStatusRoutes } from './register-review-status.routes.js';
import { registerProjectRoutes } from './register-project.routes.js';
export { hashBuffer } from './helpers.js';
export const documentRoutes: FastifyPluginAsync<{
  env: Env;
}> = async (app, opts) => {
  await app.register(registerCreateRoutes, opts);
  await app.register(registerOperationsRoutes, opts);
  await app.register(registerVersionsRoutes, opts);
  await app.register(registerReadRoutes, opts);
  await app.register(registerShareRoutes, opts);
  await app.register(registerGuestCommentsRoutes, opts);
  await app.register(registerReviewStatusRoutes, opts);
  await app.register(registerProjectRoutes, opts);
  await app.register(registerDeleteRoutes, opts);
};
