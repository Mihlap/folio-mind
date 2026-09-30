import {
  API,
  api,
  authHeaders,
  checkApiHealth,
  makePdf,
  registerVerified,
  uploadPdf,
  waitForPreviews,
  waitForVersionReady,
} from './lib.mjs';

const steps = [];

function ok(name, detail = '') {
  steps.push(name);
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  await checkApiHealth();
  console.log('API доступен:', API);

  const { email, token } = await registerVerified('pres-smoke');
  ok('регистрация и вход', email);

  const pdf = await makePdf(5);
  const { documentId, versionId } = await uploadPdf(token, pdf, 'Презентация смоук');
  ok('загрузка PDF', `${documentId} / ${versionId}`);

  const version = await waitForVersionReady(token, documentId, versionId);
  if (version.status !== 'ready') throw new Error(`версия в статусе ${version.status}`);
  ok('версия готова', `${version.pageCount ?? '?'} страниц`);

  const previews = await waitForPreviews(token, documentId, versionId, version.pageCount);
  if (previews.pages.length < (version.pageCount ?? 1)) {
    throw new Error(
      `превью неполные: ${previews.pages.length} из ${version.pageCount} (status=${previews.status})`,
    );
  }
  ok('превью страниц', `status=${previews.status}, страниц=${previews.pages.length}`);

  const firstUrl = previews.pages[0].url;
  const imgRes = await fetch(firstUrl, { signal: AbortSignal.timeout(20_000) });
  if (!imgRes.ok) throw new Error(`превью не отдаётся: HTTP ${imgRes.status}`);
  const ctype = imgRes.headers.get('content-type') ?? '';
  if (!ctype.startsWith('image/')) throw new Error(`превью вернуло не картинку: ${ctype}`);
  const bytes = (await imgRes.arrayBuffer()).byteLength;
  if (bytes < 100) throw new Error(`превью слишком маленькое: ${bytes} байт`);
  ok('превью отдаётся по ссылке', `${ctype}, ${bytes} байт`);

  const empty = await api(
    `/presentations?documentId=${documentId}&versionId=${versionId}`,
    { headers: authHeaders(token) },
  );
  if (empty.item !== null) throw new Error('ожидалась пустая презентация');
  ok('до сохранения презентация пуста');

  const saved = await api('/presentations', {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({
      documentId,
      versionId,
      title: 'Объект Северный',
      aiMode: 'none',
      slides: [
        { position: 0, title: 'Обложка', sourcePage: 1, layoutVariant: 'image_full' },
        { position: 1, title: 'Планировки', sourcePage: 2, layoutVariant: 'image_right' },
        { position: 2, title: 'Перспектива', sourcePage: 3, layoutVariant: 'image_top' },
        { position: 3, title: 'Итоги', body: '- площадь\n- срок', layoutVariant: 'title_only' },
        { position: 4, title: 'Спасибо', layoutVariant: 'section' },
      ],
    }),
  });
  if (saved.slides.length !== 5) throw new Error(`слайдов ${saved.slides.length}, ожидалось 5`);
  const positions = saved.slides.map((s) => s.position);
  if (positions.join(',') !== '0,1,2,3,4') throw new Error(`порядок сломан: ${positions}`);
  if (saved.slides.map((s) => s.title).join(',') !== 'Обложка,Планировки,Перспектива,Итоги,Спасибо') {
    throw new Error('названия слайдов перепутаны');
  }
  ok('сохранение слайдов', `${saved.slides.length} шт., порядок сохранён`);

  const reread = await api(
    `/presentations?documentId=${documentId}&versionId=${versionId}`,
    { headers: authHeaders(token) },
  );
  if (reread.item?.title !== 'Объект Северный') throw new Error('чтение не совпало');
  ok('чтение презентации', reread.item.title);

  const replaced = await api('/presentations', {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({
      documentId,
      versionId,
      title: 'Объект Северный',
      aiMode: 'none',
      slides: [{ position: 0, title: 'Только титул', sourcePage: 1 }],
    }),
  });
  if (replaced.slides.length !== 1) throw new Error(`повторное сохранение не заменило: ${replaced.slides.length}`);
  ok('повторное сохранение заменяет слайды');

  const badPage = await fetch(`${API}/presentations`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({
      documentId,
      versionId,
      title: 'Ошибка',
      aiMode: 'none',
      slides: [{ position: 0, title: 'Лишняя', sourcePage: 99 }],
    }),
  });
  if (badPage.status !== 400) throw new Error(`страница вне документа принята: HTTP ${badPage.status}`);
  ok('страница вне документа отклонена', 'HTTP 400');

  const noAuth = await fetch(`${API}/presentations?documentId=${documentId}`);
  if (noAuth.status !== 401) throw new Error(`без токена ожидался 401, получен ${noAuth.status}`);
  ok('без токена доступ закрыт', 'HTTP 401');

  const stranger = await registerVerified('pres-stranger');
  const cross = await api(
    `/presentations?documentId=${documentId}&versionId=${versionId}`,
    { headers: authHeaders(stranger.token) },
  ).then(
    () => 'allowed',
    (err) => (err.message.includes('403') || err.message.includes('404') ? 'denied' : err.message),
  );
  if (cross !== 'denied') throw new Error(`чужойtenant получил доступ: ${cross}`);
  ok('изоляция между организациями', 'доступ закрыт');

  const del = await api(`/presentations?versionId=${versionId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!del.ok) throw new Error('удаление не подтверждено');
  const afterDel = await api(
    `/presentations?documentId=${documentId}&versionId=${versionId}`,
    { headers: authHeaders(token) },
  );
  if (afterDel.item !== null) throw new Error('презентация осталась после удаления');
  ok('удаление презентации');

  const restored = await api('/presentations', {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({
      documentId,
      versionId,
      title: 'Объект Северный',
      aiMode: 'none',
      slides: [
        { position: 0, title: 'Обложка', sourcePage: 1, layoutVariant: 'image_full' },
        { position: 1, title: 'Планировки', sourcePage: 2, layoutVariant: 'image_right' },
        { position: 2, title: 'Перспектива', sourcePage: 3, layoutVariant: 'image_top' },
        { position: 3, title: 'Итоги', body: '- площадь\n- срок', layoutVariant: 'title_only' },
        { position: 4, title: 'Спасибо', layoutVariant: 'section' },
      ],
    }),
  });
  if (restored.slides.length !== 5) throw new Error('не удалось восстановить презентацию перед экспортом');
  ok('презентация восстановлена для экспорта');

  const exportRes = await api('/presentations/export', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ documentId, versionId }),
  });
  if (exportRes.status !== 'processing' || !exportRes.documentId || !exportRes.versionId) {
    throw new Error(`экспорт не запущен: ${JSON.stringify(exportRes)}`);
  }
  ok('экспорт презентации запущен', exportRes.documentId);

  const exportedVersion = await waitForVersionReady(token, exportRes.documentId, exportRes.versionId, 240_000);
  if (exportedVersion.status !== 'ready') {
    throw new Error(`экспортированная версия в статусе ${exportedVersion.status}`);
  }
  ok('экспортированная версия готова', `${exportedVersion.pageCount ?? '?'} страниц`);

  const exportedPreview = await waitForPreviews(
    token,
    exportRes.documentId,
    exportRes.versionId,
    exportedVersion.pageCount,
  );
  if ((exportedPreview.pages ?? []).length < (exportedVersion.pageCount ?? 0)) {
    throw new Error(`экспорт превью неполный: ${JSON.stringify(exportedPreview)}`);
  }
  ok('превью экспортированного PDF', `страниц=${exportedPreview.pageCount}`);

  console.log(`\nOK presentation smoke — пройдено шагов: ${steps.length}`);
  console.log(`Документ: ${documentId}, версия: ${versionId}`);
}

main().catch((err) => {
  console.error('\nFAIL', err.message);
  process.exit(1);
});
