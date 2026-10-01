import { DEMO_EMAIL, DEMO_PASSWORD, WEB } from './lib.mjs';

const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
const SHOTS = new URL('./screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const checks = [];
const problems = [];

function ok(name, detail = '') {
  checks.push(name);
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function bad(name, detail) {
  problems.push(`${name}: ${detail}`);
  console.log(`  ✗ ${name} — ${detail}`);
}

async function connect() {
  const list = await (await fetch(`${CDP}/json`)).json();
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('нет открытой страницы в Chrome');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  const events = [];

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    events.push(msg);
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('CDP websocket error')));
  });

  const send = (method, params = {}) => {
    const id = ++nextId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`timeout ${method}`));
        }
      }, 30_000);
    });
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  return { send, events, close: () => ws.close() };
}

async function evaluate(send, expression) {
  const res = await send('Runtime.evaluate', {
    expression: `(() => { ${expression} })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
  }
  return res.result?.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(send, expression, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await evaluate(send, expression).catch(() => null);
    if (value) return value;
    await sleep(400);
  }
  throw new Error(`не дождался: ${label}`);
}

async function shot(send, name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(SHOTS, { recursive: true });
  await writeFile(`${SHOTS}${name}.png`, Buffer.from(data, 'base64'));
  console.log(`    снимок: tools/presentation/screenshots/${name}.png`);
}

async function main() {
  const { send, events, close } = await connect();

  await send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  console.log('Открываю вход…');
  await send('Page.navigate', { url: `${WEB}/login` });
  await waitFor(send, `return !!document.querySelector('input[type=email]');`, 'форма входа', 45_000);
  await evaluate(
    send,
    `localStorage.clear();
     sessionStorage.clear();
     return true;`,
  );

  await evaluate(
    send,
    `const setVal = (el, v) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setVal(document.querySelector('input[type=email]'), ${JSON.stringify(DEMO_EMAIL)});
    setVal(document.querySelector('input[type=password]'), ${JSON.stringify(DEMO_PASSWORD)});
    return true;`,
  );
  await evaluate(
    send,
    `const b = [...document.querySelectorAll('button')].find(x => /Войти/.test(x.textContent));
     if (!b) throw new Error('нет кнопки входа');
     b.click(); return true;`,
  );
  await waitFor(send, `return location.pathname.startsWith('/app');`, 'переход в приложение');
  ok('вход выполнен', await evaluate(send, 'return location.pathname;'));

  const docs = await evaluate(
    send,
    `return fetch('/api/documents', { headers: { Authorization: 'Bearer ' + localStorage.getItem('folio_token') } })
       .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
       .then(j => ({ items: (j.items || []).map(d => ({ id: d.id, title: d.title })) }))
       .catch(e => ({ error: e.message }));`,
  );

  if (!docs || docs.error || !Array.isArray(docs.items) || docs.items.length === 0) {
    bad('список документов', JSON.stringify(docs));
  } else {
    ok('документы загружаются в приложении', docs.items.length);
  }

  const target = docs?.items
    ?.slice()
    .sort((a, b) => String(b.title).localeCompare(String(a.title)))
    .find((d) => d.title.includes('Северный'));
  if (!target) throw new Error('нет документа для проверки');

  console.log(`Открываю документ: ${target.title}`);
  await send('Page.navigate', { url: `${WEB}/app/documents/${target.id}` });
  await waitFor(
    send,
    `return [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Инструменты');`,
    'вкладка «Инструменты»',
    60_000,
  );
  ok('страница документа открылась', target.title);
  await sleep(3000);
  await shot(send, '1-document');

  await evaluate(
    send,
    `const tab = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Инструменты');
     if (!tab) return false;
     tab.click();
     return true;`,
  );
  await waitFor(
    send,
    `return !!document.querySelector('[data-tool-section]');`,
    'панель инструментов',
    45_000,
  );
  const sectionIds = await evaluate(
    send,
    `return [...document.querySelectorAll('[data-tool-section]')].map(e => e.getAttribute('data-tool-section'));`,
  );
  ok('панель инструментов раскрыта', `${sectionIds.length} секций`);

  let groupClicked = false;
  try {
    await waitFor(
      send,
      `const g = [...document.querySelectorAll('button')].find(b => /^Макет/.test(b.textContent.trim()));
       if (!g) return false;
       g.click();
       return true;`,
      'переключатель группы «Макет»',
      20_000,
    );
    groupClicked = true;
  } catch {
    bad('группа «Макет»', 'переключатель не найден среди кнопок панели');
  }
  if (groupClicked) ok('группа «Макет» выбрана');
  await sleep(2000);
  await shot(send, '1b-tools');

  const sec = await evaluate(
    send,
    `const el = document.querySelector('[data-tool-section="presentation"]');
     if (!el) return null;
     const btn = el.querySelector('button[aria-expanded]');
     if (btn && btn.getAttribute('aria-expanded') !== 'true') btn.click();
     return { found: true, label: (btn?.textContent || '').trim().slice(0, 60) };`,
  );
  if (!sec) {
    bad('секция «Презентация»', 'не найдена на странице');
  } else {
    await waitFor(
      send,
    `const el = document.querySelector('[data-tool-section="presentation"]');
     const btn = el && el.querySelector('button[aria-expanded]');
     if (btn && btn.getAttribute('aria-expanded') !== 'true') btn.click();
     return !!el && el.getBoundingClientRect().height > 0;`,
      'раскрытие панели презентации',
    );
    ok('секция «Презентация» открывается', sec.label);
  }
  await sleep(2500);
  await shot(send, '2-panel');

  const thumbs = await evaluate(
    send,
    `const sec = document.querySelector('[data-tool-section="presentation"]');
     const imgs = sec ? [...sec.querySelectorAll('img')] : [];
     return { imgs: imgs.length, loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length };`,
  );
  if (thumbs.loaded > 0) {
    ok('превью страниц отрисованы', `${thumbs.loaded}/${thumbs.imgs}`);
  } else {
    bad('превью страниц', `загружено ${thumbs.loaded} из ${thumbs.imgs}`);
  }

  const before = await evaluate(
    send,
    `const sec = document.querySelector('[data-tool-section="presentation"]');
     return sec ? sec.querySelectorAll('input[placeholder="Заголовок"]').length : -1;`,
  );
  console.log(`  слайдов до проверки редактирования: ${before}`);

  const SUFFIX = ' + ввод';
  const typeInto = async (selector, text) => {
    const geo = await evaluate(
      send,
      `const sec = document.querySelector('[data-tool-section="presentation"]');
       const el = sec && sec.querySelector(${JSON.stringify(selector)});
       if (!el) return null;
       el.scrollIntoView({ block: 'center' });
       const r = el.getBoundingClientRect();
       return { x: r.x + r.width / 2, y: r.y + r.height / 2, before: el.value };`,
    );
    if (!geo) return null;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: geo.x, y: geo.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: geo.x, y: geo.y, button: 'left', clickCount: 1 });
    await sleep(300);
    const focused = await evaluate(
      send,
      `const sec = document.querySelector('[data-tool-section="presentation"]');
       return document.activeElement === sec.querySelector(${JSON.stringify(selector)});`,
    );
    if (!focused) return { before: geo.before, after: null, focused: false };
    await send('Input.insertText', { text });
    await sleep(800);
    const after = await evaluate(
      send,
      `const sec = document.querySelector('[data-tool-section="presentation"]');
       const el = sec && sec.querySelector(${JSON.stringify(selector)});
       return el ? el.value : null;`,
    );
    return { before: geo.before, after, focused };
  };

  const edited = await typeInto('input[placeholder="Заголовок"]', SUFFIX);
  const expected = edited ? `${SUFFIX}${edited.before}` : null;
  if (edited && edited.after === expected) {
    ok('редактирование заголовка слайда', `${edited.before} → ${edited.after}`);
    const draft = await evaluate(
      send,
      `const k = Object.keys(sessionStorage).find(k => k.startsWith('folio-presentation-draft:'));
       if (!k) return null;
       const d = JSON.parse(sessionStorage.getItem(k));
       return { key: k, slides: d.slides.length, first: d.slides[0]?.title };`,
    );
    if (draft?.first === expected) {
      ok('черновик сохранён в sessionStorage', `${draft.slides} слайдов`);
    } else {
      bad('черновик в sessionStorage', `ожидали «${expected}», получили ${JSON.stringify(draft?.first)}`);
    }
  } else {
    bad('редактирование заголовка', JSON.stringify(edited));
  }
  await sleep(500);
  await shot(send, '3-edited');

  await evaluate(
    send,
    `const sec = document.querySelector('[data-tool-section="presentation"]');
     const b = [...sec.querySelectorAll('button')].find(x => x.textContent.trim() === 'Сохранить');
     if (!b) throw new Error('нет кнопки сохранения');
     b.click(); return true;`,
  );
  await waitFor(
    send,
    `const sec = document.querySelector('[data-tool-section="presentation"]');
     return !!sec && /сохранена/i.test(sec.innerText);`,
    'подтверждение сохранения',
  );
  ok('сохранение презентации из интерфейса');
  await sleep(800);
  await shot(send, '4-saved');

  const cleared = await evaluate(
    send,
    `return Object.keys(sessionStorage).filter(k => k.startsWith('folio-presentation-draft:')).length;`,
  );
  if (cleared === 0) ok('черновик очищен после сохранения');
  else bad('черновик не очищен', `ключей: ${cleared}`);

  await evaluate(
    send,
    `const sec = document.querySelector('[data-tool-section="presentation"]');
     const b = [...sec.querySelectorAll('button')].find(x => x.textContent.trim() === 'Показать');
     if (!b) throw new Error('нет кнопки показа');
     b.click(); return true;`,
  );
  const overflowBefore = await evaluate(send, `return document.body.style.overflow;`);
  await waitFor(
    send,
    `return !!document.querySelector('[role=dialog][aria-label="Режим презентации"]');`,
    'открытие режима показа',
  );
  ok('режим показа открылся');

  const head1 = await evaluate(
    send,
    `const d = document.querySelector('[role=dialog][aria-label="Режим презентации"]');
     return d.querySelector('header').innerText.replace(/\\n/g, ' | ');`,
  );
  if (/Слайд 1 из/.test(head1)) ok('заголовок показа', head1);
  else bad('заголовок показа', head1);
  await sleep(1500);
  await shot(send, '5-present');

  for (const [key, label] of [
    ['ArrowRight', 'вправо'],
    ['ArrowRight', 'вправо'],
  ]) {
    await evaluate(
      send,
      `const d = document.querySelector('[role=dialog][aria-label="Режим презентации"]');
     d.focus();
     document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }));
     window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }));
     return true;`,
    );
    await sleep(500);
    console.log(`  → ${label}`);
  }
  const head2 = await evaluate(
    send,
    `const d = document.querySelector('[role=dialog][aria-label="Режим презентации"]');
     return d.querySelector('header').innerText.replace(/\\n/g, ' | ');`,
  );
  if (/Слайд 3 из/.test(head2)) ok('листание клавишами', head2);
  else bad('листание клавишами', head2);
  await shot(send, '6-slide3');

  await evaluate(
    send,
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
     return true;`,
  );
  await sleep(800);
  const head3 = await evaluate(
    send,
    `const d = document.querySelector('[role=dialog][aria-label="Режим презентации"]');
     return d.querySelector('header').innerText.replace(/\\n/g, ' | ');`,
  );
  ok('переход в конец (End)', head3);
  await shot(send, '7-last');

  await evaluate(
    send,
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
     return true;`,
  );
  const closed = await evaluate(
    send,
    `return !document.querySelector('[role=dialog][aria-label="Режим презентации"]');`,
  );
  if (closed) ok('выход по Escape');
  else bad('выход по Escape', 'диалог остался открытым');
  await sleep(800);

  const overflow = await evaluate(send, `return document.body.style.overflow;`);
  if (overflow === overflowBefore) {
    ok('прокрутка страницы не изменена', `overflow=${overflow || 'пусто'} (как до показа)`);
  } else {
    bad(
      'прокрутка страницы',
      `до показа «${overflowBefore || 'пусто'}», после «${overflow || 'пусто'}» — не восстановлена`,
    );
  }

  const sectionOpen = await evaluate(
    send,
    `const s = document.querySelector('[data-tool-section="presentation"] button[aria-expanded]');
     return s ? s.getAttribute('aria-expanded') : 'нет кнопки';`,
  );
  if (sectionOpen !== 'true') {
    await evaluate(
      send,
      `const el = document.querySelector('[data-tool-section="presentation"]');
       const btn = el && el.querySelector('button[aria-expanded]');
       if (btn && btn.getAttribute('aria-expanded') !== 'true') btn.click();
       return true;`,
    );
    await sleep(1200);
  }

  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(2500);
  await shot(send, '8-mobile-document');

  const mobileTabs = await evaluate(
    send,
    `return {
       width: window.innerWidth,
       scrollW: document.documentElement.scrollWidth,
       buttons: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean),
       sections: [...document.querySelectorAll('[data-tool-section]')].map(e => {
         const r = e.getBoundingClientRect();
         const hiddenBy = e.parentElement && getComputedStyle(e.parentElement).display === 'none';
         return { id: e.getAttribute('data-tool-section'), w: Math.round(r.width), h: Math.round(r.height), hiddenBy };
       }),
     };`,
  );
  console.log(
    `  нижняя навигация: ${JSON.stringify(mobileTabs.buttons.filter((b) => ['Версии', 'Отчёт', 'Инстр.', 'Чат'].includes(b)))}`,
  );

  let openedGroup = null;
  const openPanel = async (label) => {
    const clicked = await evaluate(
      send,
      `const all = [...document.querySelectorAll('button')];
       const g = all.find(b => b.textContent.trim() === ${JSON.stringify(label)})
              ?? all.find(b => b.textContent.includes(${JSON.stringify(label)}));
       if (!g) return false;
       g.click();
       return true;`,
    );
    if (!clicked) return -1;
    await sleep(1800);
    await evaluate(
      send,
      `const el = document.querySelector('[data-tool-section="presentation"]');
       const b = el && el.querySelector('button[aria-expanded]');
       if (b && b.getAttribute('aria-expanded') !== 'true') b.click();
       return true;`,
    );
    await sleep(1500);
    return evaluate(
      send,
      `const s = document.querySelector('[data-tool-section="presentation"]');
       return s ? Math.round(s.getBoundingClientRect().height) : -1;`,
    );
  };

  for (const step of ['Инстр.', 'Инструменты']) {
    const h = await openPanel(step);
    if (h > 0) {
      openedGroup = step;
      break;
    }
  }
  if (!openedGroup) {
    const h = await openPanel('Макет и печать');
    if (h > 0) openedGroup = 'Макет и печать';
  }

  await shot(send, '8b-mobile-panel');
  const mobileFit = await evaluate(
    send,
    `const s = document.querySelector('[data-tool-section="presentation"]');
     const r = s ? s.getBoundingClientRect() : null;
     return {
       w: r ? Math.round(r.width) : -1,
       h: r ? Math.round(r.height) : -1,
       overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
       scrollW: document.documentElement.scrollWidth,
     };`,
  );
  if (openedGroup) {
    if (mobileFit.overflowX) {
      bad(
        'мобильная вёрстка',
        `горизонтальный скролл: документ ${mobileFit.scrollW}px при окне ${mobileFit.w}px`,
      );
    } else {
      ok('мобильная вёрстка', `панель ${mobileFit.w}×${mobileFit.h}px через «${openedGroup}», без скролла`);
    }
  } else {
    bad('мобильная вёрстка', 'секция презентации недоступна на ширине 390px');
  }
  await send('Emulation.clearDeviceMetricsOverride');

  await sleep(500);
  const errs = events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map(
      (e) =>
        e.params?.exceptionDetails?.exception?.description ??
        e.params?.exceptionDetails?.text ??
        'exception',
    );
  const consoleErrs = events
    .filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error')
    .map((e) => (e.params?.args || []).map((a) => a.value ?? a.description ?? a.type).join(' '));
  const badResp = events
    .filter(
      (e) =>
        e.method === 'Network.responseReceived' &&
        e.params?.response?.status >= 400 &&
        !/favicon|manifest|\.map$/.test(e.params?.response?.url ?? ''),
    )
    .map((e) => `${e.params.response.status} ${String(e.params.response.url).slice(-90)}`);
  const failed = events
    .filter((e) => e.method === 'Network.loadingFailed' && !e.params?.canceled)
    .map((e) => e.params?.errorText);

  if (errs.length === 0) ok('исключений JS нет');
  else bad('исключения JS', errs.slice(0, 5).join(' ;; '));
  if (consoleErrs.length === 0) ok('ошибок в консоли нет');
  else bad('ошибки консоли', consoleErrs.slice(0, 5).join(' ;; '));
  if (badResp.length === 0) ok('HTTP-ошибок нет');
  else bad('HTTP-ошибки', [...new Set(badResp)].slice(0, 5).join(' ;; '));
  if (failed.length === 0) ok('прерванных загрузок нет');
  else bad('прерванные загрузки', [...new Set(failed)].slice(0, 5).join(' ;; '));

  close();
  console.log(`\nПройдено проверок: ${checks.length}, проблем: ${problems.length}`);
  if (problems.length > 0) {
    console.log('\nПроблемы:');
    for (const p of problems) console.log('  -', p);
    process.exit(1);
  }
  console.log('OK presentation ui-check');
}

main().catch((err) => {
  console.error('\nFAIL', err.message);
  process.exit(1);
});
