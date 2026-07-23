/**
 * CLI-сборка debug APK без GUI Android Studio.
 * Требует: ANDROID_HOME / %LOCALAPPDATA%\Android\Sdk, JDK (Studio jbr).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = join(root, 'android');
const gradlew = join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');

const sdkCandidates = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  join(homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
  join(homedir(), 'Library', 'Android', 'sdk'),
  '/opt/android-sdk',
].filter(Boolean);

const sdk = sdkCandidates.find((p) => p && existsSync(p));
if (!sdk) {
  console.error('Android SDK не найден. Установите Android Studio и SDK.');
  process.exit(1);
}

const javaCandidates = [
  process.env.JAVA_HOME,
  'C:\\Program Files\\Android\\Android Studio\\jbr',
  'C:\\Program Files\\Android\\Android Studio\\jre',
].filter(Boolean);
const javaHome = javaCandidates.find((p) => p && existsSync(p));

if (!existsSync(gradlew)) {
  console.error('android/ не найден. Выполните: pnpm add:android && pnpm sync');
  process.exit(1);
}

const env = {
  ...process.env,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  Path: javaHome
    ? `${join(javaHome, 'bin')};${join(sdk, 'platform-tools')};${process.env.Path ?? ''}`
    : process.env.Path,
};

const result = spawnSync(gradlew, ['assembleDebug', '--no-daemon'], {
  cwd: androidDir,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const apk = join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
console.log(`\nAPK ready: ${apk}`);
