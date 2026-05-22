import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/** Загружает apps/server/.env (Prisma и dotenv CLI читают его же). */
export function loadAppEnv(): void {
  config({ path: resolve(__dirname, '../../.env') });
}
