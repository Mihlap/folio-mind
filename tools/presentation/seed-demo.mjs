import { pathToFileURL } from 'node:url';
import {
  api,
  authHeaders,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_TITLE,
  makePdf,
  markVerified,
  uploadPdf,
  waitForPreviews,
  waitForVersionReady,
} from './lib.mjs';

export { DEMO_EMAIL, DEMO_PASSWORD };

async function loginOrRegister() {
  try {
    const login = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
    });
    if (login.token) return { token: login.token, created: false };
  } catch {
    /* пользователя ещё нет */
  }
  await api('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD, name: 'Демо Презентации' }),
  });
  await markVerified(DEMO_EMAIL);
  const login = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
  });
  return { token: login.token, created: true };
}

const SLIDES = [
  { position: 0, title: 'ЖК Северный', subtitle: 'Корпус 2', layoutVariant: 'image_full', sourcePage: 1 },
  {
    position: 1,
    title: 'Планировки',
    subtitle: 'от 42 до 88 м²',
    body: '- двушки и трёшки\n- панорамные окна\n- выносные балконы',
    layoutVariant: 'image_right',
    sourcePage: 2,
  },
  {
    position: 2,
    title: 'Инфраструктура',
    body: '- школа на 1100 мест\n- детский сад\n- парк у воды',
    layoutVariant: 'image_top',
    sourcePage: 3,
  },
  {
    position: 3,
    title: 'Условия покупки',
    body: '- ипотека от 4,9%\n- рассрочка от бюро\n- отделка в подарок',
    layoutVariant: 'title_only',
    sourcePage: 4,
  },
  { position: 4, title: 'Спасибо за внимание', layoutVariant: 'section' },
];

async function main() {
  const { token, created } = await loginOrRegister();
  console.log(created ? 'создан демо-пользователь' : 'демо-пользователь уже существует');

  const list = await api('/documents', { headers: authHeaders(token) });
  let existing = (list.items ?? []).find((d) => d.title === DEMO_TITLE);
  let documentId;
  let versionId;

  if (existing) {
    const detail = await api(`/documents/${existing.id}`, { headers: authHeaders(token) });
    const v = detail.versions?.[0];
    const pc = v?.pageCount ?? 0;
    const probe = await api(
      `/presentations/previews?documentId=${existing.id}&versionId=${v.id}`,
      { headers: authHeaders(token) },
    );
    if (probe.pages?.length >= pc && pc > 0) {
      documentId = existing.id;
      versionId = v.id;
      console.log('документ уже есть:', documentId, versionId);
    } else {
      console.log('у старого документа нет превью, создаю новый');
      existing = null;
    }
  }

  if (!existing) {
    const pdf = await makePdf(4);
    const up = await uploadPdf(token, pdf, `${DEMO_TITLE} ${Date.now().toString(36)}`);
    documentId = up.documentId;
    versionId = up.versionId;
    console.log('загружен PDF:', documentId, versionId);
    await waitForVersionReady(token, documentId, versionId);
  }

  const doc = await api(`/documents/${documentId}`, { headers: authHeaders(token) });
  const pageCount = doc.versions?.find((v) => v.id === versionId)?.pageCount ?? 4;
  await waitForPreviews(token, documentId, versionId, pageCount);
  console.log('превью готовы:', pageCount, 'страниц');

  const saved = await api('/presentations', {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({
      documentId,
      versionId,
      title: 'ЖК Северный, корпус 2',
      aiMode: 'none',
      slides: SLIDES,
    }),
  });
  console.log('презентация сохранена:', saved.slides.length, 'слайдов');

  console.log('\nДля входа в браузере:');
  console.log('  email:    ', DEMO_EMAIL);
  console.log('  password: ', DEMO_PASSWORD);
  console.log('  документ: ', documentId);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('FAIL', err.message);
    process.exit(1);
  });
}