import { spawnSync } from 'node:child_process';

process.env.CAPACITOR = '1';
if (!process.env.VITE_API_URL?.trim()) { 
  process.env.VITE_API_URL = 'http://10.0.2.2:3001';
}
const result = spawnSync(
  'pnpm',
  ['--filter', '@folio-mind/client', 'build'],
  { stdio: 'inherit', env: process.env, shell: true },
);
process.exit(result.status ?? 1);
