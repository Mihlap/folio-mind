const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const pageInfo = list.find((p) => String(p.url).includes('/documents/')) || list[0];
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

const snap = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const c = document.querySelector('canvas');
    const ctx = c.getContext('2d');
    // downsample scan
    const step = 20;
    let ink = 0, white = 0, gray = 0, samples = 0;
    let firstInk = null;
    for (let y = 0; y < c.height; y += step) {
      for (let x = 0; x < c.width; x += step) {
        const d = ctx.getImageData(x, y, 1, 1).data;
        const a = d[3], rgb = d[0] + d[1] + d[2];
        samples++;
        if (a > 200 && rgb < 500) {
          ink++;
          if (!firstInk) firstInk = { x, y, rgb, r: d[0], g: d[1], b: d[2] };
        } else if (a > 200 && rgb > 700) white++;
        else if (a > 200) gray++;
      }
    }
    const tl = document.querySelector('.textLayer');
    const tlStyle = tl ? getComputedStyle(tl) : null;
    return {
      size: [c.width, c.height],
      samples,
      ink,
      white,
      gray,
      firstInk,
      textKids: tl?.childElementCount ?? -1,
      textOpacity: tlStyle?.opacity,
      textColor: tlStyle?.color,
      sampleSpan: tl?.innerText?.slice(0, 120) || null,
    };
  })()`,
});
console.log(JSON.stringify(snap.result?.value ?? snap, null, 2));
ws.close();
