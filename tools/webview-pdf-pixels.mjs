const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = list.find((p) => String(p.url).includes('/documents/')) || list[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();

function send(method, params = {}) {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(i, { resolve, reject });
    setTimeout(() => {
      if (pending.has(i)) {
        pending.delete(i);
        reject(new Error('timeout'));
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
  }
});

await new Promise((r, j) => {
  ws.addEventListener('open', r);
  ws.addEventListener('error', j);
});
await send('Runtime.enable');

const probe = await send('Runtime.evaluate', {
  returnByValue: true,
  awaitPromise: true,
  expression: `(() => {
    const c = document.querySelector('canvas');
    const ctx = c.getContext('2d');
    function sample(x, y, w, h) {
      const d = ctx.getImageData(x, y, w, h).data;
      let a0 = 0, a255 = 0, ink = 0, white = 0, sumA = 0;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3], rgb = d[i] + d[i + 1] + d[i + 2];
        sumA += a;
        if (a === 0) a0++;
        else if (a > 250) a255++;
        if (a > 200 && rgb < 600) ink++;
        if (a > 200 && rgb > 700) white++;
      }
      return { a0, a255, ink, white, avgA: Math.round(sumA / (d.length / 4)) };
    }
    return {
      size: [c.width, c.height],
      tl: sample(0, 0, 50, 50),
      center: sample((c.width / 2) | 0, (c.height / 2) | 0, 120, 120),
      mid: sample(200, 300, 150, 150),
    };
  })()`,
});
console.log('PIXELS', JSON.stringify(probe.result.value, null, 2));

const reRender = await send('Runtime.evaluate', {
  returnByValue: true,
  awaitPromise: true,
  expression: `(async () => {
    // Try to find pdf.js document from React fiber is hard; instead fetch PDF bytes via page API if any.
    // Check whether fonts / document are available on window
    const keys = Object.keys(window).filter(k => /pdf|PDF/i.test(k));
    return { keys, fonts: document.fonts ? [...document.fonts].slice(0,5).map(f => f.family + ':' + f.status) : null };
  })()`,
});
console.log('META', JSON.stringify(reRender.result.value, null, 2));

ws.close();
