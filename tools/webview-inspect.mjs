const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = list[0];
if (!page?.webSocketDebuggerUrl) {
  console.error('No WebView page', list);
  process.exit(1);
}
console.log('URL:', page.url);

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
const logs = [];

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
    }, 10000);
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
  if (
    msg.method === 'Runtime.exceptionThrown' ||
    msg.method === 'Log.entryAdded' ||
    msg.method === 'Runtime.consoleAPICalled' ||
    msg.method === 'Network.loadingFailed' ||
    msg.method === 'Network.responseReceived'
  ) {
    logs.push(msg);
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve);
  ws.addEventListener('error', reject);
});

await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');

const snap = await send('Runtime.evaluate', {
  expression: `(() => {
    const root = document.getElementById('root');
    return {
      href: location.href,
      title: document.title,
      rootChildren: root ? root.childElementCount : -1,
      rootText: root ? (root.innerText || '').slice(0, 1500) : null,
      rootHtml: root ? root.innerHTML.slice(0, 2500) : null,
      swController: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
    };
  })()`,
  returnByValue: true,
});
console.log('SNAP:', JSON.stringify(snap.result?.value ?? snap, null, 2));

const res = await send('Runtime.evaluate', {
  expression: `(() => performance.getEntriesByType('resource').slice(-50).map(e => ({
    name: e.name.replace(/^https:\\/\\/localhost/, ''),
    type: e.initiatorType,
    dur: Math.round(e.duration),
    size: e.transferSize,
  })))()`,
  returnByValue: true,
});
console.log('RES:', JSON.stringify(res.result?.value ?? res, null, 2));

const errProbe = await send('Runtime.evaluate', {
  expression: `(() => {
    const out = [];
    try {
      // force read of pdfjs global if present
      out.push({ pdfWorker: window.pdfjsLib?.GlobalWorkerOptions?.workerSrc || 'no-pdfjsLib' });
    } catch (e) { out.push({ e: String(e) }); }
    return out;
  })()`,
  returnByValue: true,
});
console.log('PDF:', JSON.stringify(errProbe.result?.value ?? errProbe, null, 2));

await new Promise((r) => setTimeout(r, 2000));
console.log(
  'LOGS:',
  JSON.stringify(
    logs
      .map((m) => {
        if (m.method === 'Runtime.exceptionThrown') {
          return {
            type: 'exception',
            text:
              m.params?.exceptionDetails?.exception?.description ||
              m.params?.exceptionDetails?.text,
          };
        }
        if (m.method === 'Runtime.consoleAPICalled') {
          return {
            type: 'console.' + m.params?.type,
            text: (m.params?.args || [])
              .map((a) => a.value ?? a.description ?? a.type)
              .join(' '),
          };
        }
        if (m.method === 'Log.entryAdded') {
          return { type: 'log', text: m.params?.entry?.text, level: m.params?.entry?.level };
        }
        if (m.method === 'Network.loadingFailed') {
          return {
            type: 'netfail',
            errorText: m.params?.errorText,
            canceled: m.params?.canceled,
          };
        }
        if (m.method === 'Network.responseReceived') {
          const r = m.params?.response;
          if (r && (r.status >= 400 || String(r.url).includes('pdf') || String(r.url).includes('worker'))) {
            return { type: 'resp', status: r.status, url: String(r.url).slice(-160) };
          }
          return null;
        }
        return null;
      })
      .filter(Boolean),
    null,
    2,
  ),
);

ws.close();
