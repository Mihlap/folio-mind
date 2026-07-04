import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));

/** Макс. символов справки в промпте чата (остальное — под текст PDF). */
const MAX_GUIDE_CHARS = 48_000;

let cachedGuide: string | null = null;

function findMonorepoRoot(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolveUserGuidePath(): string | null {
  const root = findMonorepoRoot();
  const candidates = [
    root ? join(root, 'USER_GUIDE.md') : null,
    join(moduleDir, '../../../../../USER_GUIDE.md'),
    join(process.cwd(), 'USER_GUIDE.md'),
  ].filter((p): p is string => Boolean(p));

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

export function loadUserGuideText(): string {
  if (cachedGuide) return cachedGuide;

  const path = resolveUserGuidePath();
  if (path) {
    cachedGuide = readFileSync(path, 'utf8').slice(0, MAX_GUIDE_CHARS);
    return cachedGuide;
  }

  cachedGuide = `# РазУм — краткая справка

Шаблоны бюро: Документ → Инструменты → Макет → «Шаблоны бюро» → выбрать шаблон → «Применить на стр. N».
Серые блоки — слоты под фото; заполните из медиатеки (перетащить или «В макет»).
«Применить» накладывает шаблон; «Сохранить текущую страницу как шаблон» — записывает свой макет для организации.
Медиатека: меню → Медиатека. Лимиты: 25 МБ файл, 10 ГБ на организацию.
Полная инструкция: USER_GUIDE.md в корне репозитория.`;
  return cachedGuide;
}
