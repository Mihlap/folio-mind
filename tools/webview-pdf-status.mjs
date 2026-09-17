const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const pageInfo = list.find((p) => String(p.url).includes('/documents/')) || list[0];
console.log('URL', pageInfo.url);
const ws = new WebSocket(pageInfo.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const logs = [];

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
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push(
      msg.params?.exceptionDetails?.exception?.description ||
        msg.params?.exceptionDetails?.text,
    );
  }
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params?.type)) {
    logs.push(
      msg.params.type +
        ': ' +
        (msg.params.args || []).map((a) => a.value ?? a.description).join(' '),
    );
  }
});

await new Promise((r, j) => {
  ws.addEventListener('open', r);
  ws.addEventListener('error', j);
});
await send('Runtime.enable');
await send('Log.enable');
await new Promise((r) => setTimeout(r, 2000));

const snap = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const root = document.getElementById('root');
    const canvases = [...document.querySelectorAll('canvas')];
    const reds = [...document.querySelectorAll('.text-red-600, .text-red-700, [class*=error]')]
      .map((el) => el.innerText.trim())
      .filter(Boolean)
      .slice(0, 5);
    let pixel = null;
    if (canvases[0]) {
      const c = canvases[0];
      const ctx = c.getContext('2d');
      try {
        const d = ctx.getImageData(80, 120, 100, 100).data;
        let ink = 0, white = 0, a0 = 0;
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3], rgb = d[i] + d[i + 1] + d[i + 2];
          if (a === 0) a0++;
          if (a > 200 && rgb < 600) ink++;
          if (a > 200 && rgb > 700) white++;
        }
        pixel = { w: c.width, h: c.height, ink, white, a0 };
      } catch (e) {
        pixel = { err: String(e) };
      }
    }
    return {
      href: location.href,
      canvasCount: canvases.length,
      pixel,
      reds,
      text: (root?.innerText || '').replace(/\\s+/g, ' ').slice(0, 500),
      hasPdfVendor: [...document.scripts].some((s) => (s.src || '').includes('pdf-vendor')),
    };
  })()`,
});
console.log(JSON.stringify({ ...snap.result?.value, logs: logs.slice(0, 10) }, null, 2));
ws.close();
