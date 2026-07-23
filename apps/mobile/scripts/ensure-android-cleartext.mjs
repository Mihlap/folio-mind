import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

if (!existsSync(manifestPath)) {
  console.warn('[ensure-android-cleartext] AndroidManifest.xml не найден — сначала: pnpm add:android');
  process.exit(0);
}

let xml = readFileSync(manifestPath, 'utf8');
if (xml.includes('android:usesCleartextTraffic=')) {
  console.log('[ensure-android-cleartext] already set');
  process.exit(0);
}

if (!xml.includes('<application')) {
  console.error('[ensure-android-cleartext] no <application> tag');
  process.exit(1);
}

xml = xml.replace(
  /<application(\s[^>]*)?>/,
  (full, attrs = '') => {
    if (String(attrs).includes('usesCleartextTraffic')) return full;
    return `<application android:usesCleartextTraffic="true"${attrs}>`;
  },
);

writeFileSync(manifestPath, xml, 'utf8');
console.log('[ensure-android-cleartext] android:usesCleartextTraffic=true');
