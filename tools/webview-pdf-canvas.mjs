const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = list.find((p) => String(p.url).includes('/documents/')) || list[0];
console.log('URL:', page.url, 'visible:', page.description);
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
        reject(new Error('timeout ' + method));
      }
    }, 15000);
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
    msg.method === 'Runtime.consoleAPICalled' ||
    msg.method === 'Runtime.exceptionThrown' ||
    msg.method === 'Log.entryAdded'
  ) {
    logs.push(msg);
  }
});

await new Promise((r, j) => {
  ws.addEventListener('open', r);
  ws.addEventListener('error', j);
});
await send('Runtime.enable');
await send('Log.enable');

const snap = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const canvases = [...document.querySelectorAll('canvas')];
    const info = canvases.slice(0, 5).map((c) => {
      const ctx = c.getContext('2d');
      let sample = null;
      try {
        const w = Math.min(c.width, 40);
        const h = Math.min(c.height, 40);
        if (w > 0 && h > 0) {
          const data = ctx.getImageData(0, 0, w, h).data;
          let nonZero = 0, dark = 0, bright = 0;
          for (let i = 0; i < data.length; i += 4) {
            const a = data[i+3], r = data[i], g = data[i+1], b = data[i+2];
            if (a > 0 && (r+g+b) < 760) nonZero++;
            if (a > 0 && (r+g+b) < 100) dark++;
            if (a > 200 && (r+g+b) > 700) bright++;
          }
          sample = { nonZero, dark, bright, pixels: (data.length/4)|0 };
        }
      } catch (e) {
        sample = { err: String(e) };
      }
      const cs = getComputedStyle(c);
      return {
        w: c.width, h: c.height,
        styleW: c.style.width, styleH: c.style.height,
        className: c.className.slice(0, 80),
        opacity: cs.opacity,
        visibility: cs.visibility,
        display: cs.display,
        transform: cs.transform,
        sample,
      };
    });
    const imgs = [...document.querySelectorAll('img')].slice(0, 5).map((img) => ({
      src: (img.currentSrc || img.src || '').slice(-80),
      w: img.naturalWidth, h: img.naturalHeight,
      complete: img.complete,
    }));
    return {
      href: location.href,
      dpr: devicePixelRatio,
      canvasCount: canvases.length,
      info,
      imgs,
      textSample: (document.getElementById('root')?.innerText || '').replace(/\\s+/g,' ').slice(0, 300),
    };
  })()`,
});
console.log(JSON.stringify(snap.result?.value ?? snap, null, 2));

const more = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const errs = [];
    const layers = [...document.querySelectorAll('.textLayer, [class*=textLayer], [class*=TextLayer]')].slice(0,3);
    return {
      layers: layers.map(el => ({
        html: el.innerHTML.slice(0, 200),
        childCount: el.childElementCount,
        className: el.className,
      })),
      pageWrappers: [...document.querySelectorAll('[data-page-number], [class*=page]')].slice(0,3).map(el => el.className),
    };
  })()`,
});
console.log('LAYERS', JSON.stringify(more.result?.value ?? more, null, 2));

await new Promise((r) => setTimeout(r, 500));
console.log(
  'LOGS',
  JSON.stringify(
    logs
      .map((m) => {
        if (m.method === 'Runtime.exceptionThrown')
          return m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text;
        if (m.method === 'Runtime.consoleAPICalled')
          return (
            m.params?.type +
            ': ' +
            (m.params?.args || []).map((a) => a.value ?? a.description).join(' ')
          );
        if (m.method === 'Log.entryAdded') return m.params?.entry?.level + ': ' + m.params?.entry?.text;
        return null;
      })
      .filter(Boolean)
      .slice(0, 20),
    null,
    2,
  ),
);
ws.close();
