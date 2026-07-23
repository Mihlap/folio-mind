# Mobile shell (Capacitor) — РазУм

Обёртка над `apps/client`: тот же React/SPA, сборка в `apps/client/dist`.

## Требования

- Node 20+, pnpm 9
- Android Studio + Android SDK (`%LOCALAPPDATA%\Android\Sdk`)
- JDK: встроенный в Studio (`…\Android Studio\jbr`) или отдельный 17/21
- Один и тот же `pnpm dev` обслуживает **и браузер, и эмулятор**

Проверено (2026-07): Studio в `C:\Program Files\Android\Android Studio`, debug APK собирается.

## Desktop + эмулятор одновременно (рекомендуемый режим)

Один сервер, два клиента — **не переключайте** `API_PUBLIC_URL` между сессиями.

| Клиент | Как ходит в API |
|--------|------------------|
| Браузер | `http://localhost:3001` (`apps/client/.env`) |
| APK на эмуляторе | `http://10.0.2.2:3001` (подставляется при `mobile:sync`) |

В `apps/server/.env` держите стабильно:

```env
API_HOST=0.0.0.0
CORS_ORIGIN=http://localhost:5173,http://localhost:5174,https://localhost
# API_PUBLIC_URL — НЕ задавайте (останется localhost для desktop)
# API_EMULATOR_URL — опционально; в dev вторая ссылка verify уже http://10.0.2.2:3001
```

### Терминал 1 — всегда (desktop + API для AVD)

```powershell
cd c:\Users\m.laptev\folio-mind
Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
pnpm dev
```

Браузер: URL из лога Vite (`http://localhost:5173/` или `5174`).

### Терминал 2 — эмулятор и APK (когда нужен телефон)

```powershell
cd c:\Users\m.laptev\folio-mind

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:Path"

# Эмулятор (окно не закрывать) — лучше в отдельном окне:
Start-Process emulator -ArgumentList "-avd","Razum_API34"
adb devices
# должно быть: emulator-5554   device

# VITE_API_URL для AVD ставит сам build-web.mjs — в shell задавать не обязательно
pnpm mobile:sync
pnpm --filter @folio-mind/mobile assemble:debug
adb install -r apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n ru.razum.app/.MainActivity
```

После этого можно параллельно: работать в браузере и открывать то же API в APK.

### Письмо подтверждения email

В development в письме две ссылки:

1. `http://localhost:3001/...` — открыть на ПК  
2. `http://10.0.2.2:3001/...` — если подтверждаете с эмулятора  

После подтверждения в приложении: **Войти** (не регистрация заново).

### Частые ошибки

| Симптом | Что делать |
|--------|------------|
| Desktop не логинится после сборки APK | В терминале `pnpm dev` сбросить `$env:VITE_API_URL`, открыть URL из лога Vite |
| `adb: no devices` | Сначала эмулятор, потом `adb devices` |
| CORS / 5174 | В CORS уже есть `5174`; рестарт `pnpm dev` после правки `.env` |
| Не ставьте `API_PUBLIC_URL=10.0.2.2` | Ломает desktop; для AVD есть отдельная ссылка в письме |

## Быстрый старт только Android (кратко)

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:Path"

Start-Process emulator -ArgumentList "-avd","Razum_API34"
adb devices

pnpm mobile:sync
pnpm --filter @folio-mind/mobile assemble:debug
adb install -r apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n ru.razum.app/.MainActivity
```

APK: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

Альтернатива GUI: `pnpm mobile:open:android` → открыть папку `apps/mobile/android` → Run.

## PWA (без магазина)

PWA в `apps/client` (`vite-plugin-pwa`). Нужен **HTTPS** в проде.

## Камера → медиатека

На native в **Медиатеке**: «Снять фото» / «Из галереи». На web — обычная загрузка файлов.

## Офлайн-просмотр превью

Онлайн кэш до 30 превью в IndexedDB; офлайн — баннер + миниатюры.

## Live reload (web в эмуляторе)

```powershell
pnpm --filter @folio-mind/client dev -- --host
$env:CAP_SERVER_URL = "http://192.168.1.10:5173"
pnpm --filter @folio-mind/mobile sync
pnpm --filter @folio-mind/mobile open:android
```
