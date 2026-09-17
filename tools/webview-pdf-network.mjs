const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const pageInfo = list.find((p) => String(p.url).includes('/documents/')) || list[0];
const ws = new WebSocket(pageInfo.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const fails = [];
const responses = [];

function send(method, params = {}) {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(i, { resolve, reject });
    setTimeout(() => {
      if (pending.has(i)) {
        pending.delete(i);
        reject(new Error('timeout ' + method));
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
  if (msg.method === 'Network.loadingFailed') {
    fails.push(msg.params);
  }
  if (msg.method === 'Network.responseReceived') {
    const u = msg.params?.response?.url || '';
    if (
      u.includes('download') ||
      u.includes('file') ||
      u.includes('.pdf') ||
      u.includes('pdf.worker') ||
      u.includes('pdf-vendor') ||
      u.includes('s3') ||
      u.includes('timeweb')
    ) {
      responses.push({ status: msg.params.response.status, url: u.slice(0, 160) });
    }
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
    fails.push({
      console: (msg.params.args || []).map((a) => a.value ?? a.description).join(' '),
    });
  }
});

await new Promise((r, j) => {
  ws.addEventListener('open', r);
  ws.addEventListener('error', j);
});
await send('Network.enable');
await send('Runtime.enable');
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 12000));

const res = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => ({
    href: location.href,
    canvas: document.querySelectorAll('canvas').length,
    text: (document.getElementById('root')?.innerText||'').replace(/\\s+/g,' ').slice(0,350),
    resources: performance.getEntriesByType('resource').filter(e =>
      /pdf|download|file|worker|s3|timeweb/i.test(e.name)
    ).map(e => ({ name: e.name.slice(-100), dur: Math.round(e.duration), size: e.transferSize }))
  }))()`,
});
console.log(JSON.stringify({ snap: res.result?.value, responses, fails: fails.slice(0, 15) }, null, 2));
ws.close();
