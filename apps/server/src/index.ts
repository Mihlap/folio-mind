import { initTracing } from '@folio-mind/observability';
import { buildApp } from './app.js';
import { loadEnv } from './lib/config/env.js';
import { loadAppEnv } from './lib/config/load-env.js';
import { FILES_ROOT } from '@folio-mind/pdf-contracts';
import { initS3, isS3Configured } from './lib/storage/s3.js';
import { startStorageHousekeeping } from './lib/storage/housekeeping.js';
import { startAuthEventRetention } from './lib/metrics/retention.js';
loadAppEnv();
initTracing('folio-mind-api');
async function main() {
  const env = loadEnv();
  initS3(env);
  if (isS3Configured()) {
    console.log(`S3: ${env.S3_BUCKET_NAME} (prefix ${FILES_ROOT}/)`);
  }
  const app = await buildApp({ env });
  await app.listen({ port: env.PORT, host: env.API_HOST });
  console.log(`API http://${env.API_HOST}:${env.PORT}  docs http://localhost:${env.PORT}/docs`);
  if (app.hasDecorator('prisma')) {
    startStorageHousekeeping(app.prisma);
    startAuthEventRetention(app.prisma);
  }
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
