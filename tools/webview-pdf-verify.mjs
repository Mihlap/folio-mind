const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const pageInfo = list[0];
const ws = new WebSocket(pageInfo.webSocketDebuggerUrl);
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
        reject(new Error('timeout ' + method));
      }
    }, 30000);
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
await send('Page.enable');
await send('Page.navigate', {
  url: 'https://localhost/app/documents/cmrvs9p4z0005hvf8bk2m4gxr',
});
await new Promise((r) => setTimeout(r, 6000));

const snap = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const c = document.querySelector('canvas');
    if (!c) {
      return {
        err: 'no canvas',
        href: location.href,
        text: (document.getElementById('root')?.innerText || '').slice(0, 240),
      };
    }
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(100, 200, 120, 120).data;
    let ink = 0, white = 0, a0 = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3], rgb = d[i] + d[i + 1] + d[i + 2];
      if (a === 0) a0++;
      if (a > 200 && rgb < 600) ink++;
      if (a > 200 && rgb > 700) white++;
    }
    const textKids = document.querySelector('.textLayer')?.childElementCount ?? -1;
    return {
      href: location.href,
      size: [c.width, c.height],
      ink,
      white,
      a0,
      textKids,
      ok: ink > 10 || (white > 100 && ink > 0),
    };
  })()`,
});
console.log(JSON.stringify(snap.result?.value ?? snap, null, 2));
ws.close();
