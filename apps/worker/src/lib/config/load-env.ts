import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
export function loadAppEnv(): void {
  const serverEnv = resolve(__dirname, '../../../../server/.env');
  const localEnv = resolve(__dirname, '../../../.env');
  if (existsSync(serverEnv)) {
    config({ path: serverEnv });
  }
  if (existsSync(localEnv)) {
    config({ path: localEnv, override: true });
  }
}
