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
        reject(new Error('timeout ' + method));
      }
    }, 60000);
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

const result = await send('Runtime.evaluate', {
  returnByValue: true,
  awaitPromise: true,
  expression: `(async () => {
    const pdfjs = window.pdfjsLib;
    if (!pdfjs) return { err: 'no pdfjsLib' };

    // Prefer current page PDF if we can get bytes from performance resource of download-url / file
    const token = localStorage.getItem('folio_token');
    const docId = location.pathname.split('/').pop();
    const meta = await fetch('http://10.0.2.2:3001/documents/' + docId, {
      headers: { Authorization: 'Bearer ' + token },
    }).then((r) => r.json());
    const versionId = meta.latestVersion?.id || meta.versions?.[0]?.id;
    const dl = await fetch(
      'http://10.0.2.2:3001/documents/' + docId + '/versions/' + versionId + '/download-url',
      { headers: { Authorization: 'Bearer ' + token } },
    ).then((r) => r.json());
    const pdfUrl = dl.url || dl.downloadUrl;
    const loadingTask = pdfjs.getDocument({
      url: pdfUrl,
      // Android WebView font path
      disableFontFace: false,
      useSystemFonts: true,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const dpr = window.devicePixelRatio || 1;
    const cssScale = 371.135 / page.getViewport({ scale: 1 }).width;
    const viewport = page.getViewport({ scale: cssScale });
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = Math.floor(viewport.width) + 'px';
    canvas.style.height = Math.floor(viewport.height) + 'px';
    const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;
    await page.render({ canvasContext: ctx, viewport, transform }).promise;

    const data = ctx.getImageData(100, 150, 80, 80).data;
    let ink = 0, white = 0, a0 = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3], rgb = data[i] + data[i + 1] + data[i + 2];
      if (a === 0) a0++;
      if (a > 200 && rgb < 600) ink++;
      if (a > 200 && rgb > 700) white++;
    }
    return {
      pages: pdf.numPages,
      ink,
      white,
      a0,
      size: [canvas.width, canvas.height],
      pdfUrlHost: String(pdfUrl).slice(0, 60),
    };
  })()`,
});

console.log(JSON.stringify(result.result?.value ?? result, null, 2));
ws.close();
