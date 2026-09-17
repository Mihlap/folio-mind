const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = list[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
const errors = [];

function send(method, params = {}) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout ${method}`));
      }
    }, 20000);
  });
}

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(msg.error);
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(
      msg.params?.exceptionDetails?.exception?.description ||
        msg.params?.exceptionDetails?.text,
    );
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
    errors.push((msg.params.args || []).map((a) => a.value ?? a.description).join(' '));
  }
});

await new Promise((r, j) => {
  ws.addEventListener('open', r);
  ws.addEventListener('error', j);
});
await send('Runtime.enable');
await send('Page.enable');

async function evalv(expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return r.result?.value;
}

const report = {
  startUrl: page.url,
  polyfill: await evalv(`typeof Promise.withResolvers`),
  sw: await evalv(`!!(navigator.serviceWorker && navigator.serviceWorker.controller)`),
  indexScript: await evalv(`[...document.scripts].map(s=>s.src).find(s=>s.includes('/assets/index-')) || null`),
};

await send('Page.navigate', { url: 'https://localhost/login' });
await new Promise((r) => setTimeout(r, 2000));
report.login = await evalv(`({
  href: location.href,
  children: document.getElementById('root')?.childElementCount,
  text: (document.getElementById('root')?.innerText||'').replace(/\\s+/g,' ').slice(0,160),
})`);

await send('Page.navigate', { url: 'https://localhost/app' });
await new Promise((r) => setTimeout(r, 2000));
report.appRedirect = await evalv(`({
  href: location.href,
  text: (document.getElementById('root')?.innerText||'').replace(/\\s+/g,' ').slice(0,160),
})`);

report.pdfProbe = await evalv(`(async () => {
  try {
    // pdfjs already imported in main via setupPdfWorker
    const before = typeof Promise.withResolvers;
    const { promise, resolve } = Promise.withResolvers();
    resolve(42);
    const v = await promise;
    return { before, ok: v === 42 };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
})()`);

report.errors = errors.filter(Boolean).slice(0, 8);
console.log(JSON.stringify(report, null, 2));
ws.close();
