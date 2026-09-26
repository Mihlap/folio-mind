import { Link } from 'react-router-dom';
import { useHealthQuery } from '@folio-mind/store';
import { Button } from '../../components/ui/Button.js';

const features = [
  {
    title: 'Проекты и версии',
    text: 'Папка на объект, история v1…vN и статус согласования. Старая версия не перезаписывается — как у «final_final_3», только в порядке.',
  },
  {
    title: 'Просмотр и поиск',
    text: 'PDF открывается прямо в браузере: масштаб, миниатюры страниц, поиск по тексту, режим презентации, когда показываете файл на проекторе.',
  },
  {
    title: 'Макет буклета',
    text: 'Фото, фигуры и подложки поверх страниц PDF, обрезка, сетка, шаблоны бюро и общая медиатека организации.',
  },
  {
    title: 'Правки «было / стало»',
    text: 'Реестр правок, сборка PDF для согласования и применение правок через DOCX одним действием — с отметкой о выполнении.',
  },
  {
    title: 'Согласование по ссылке',
    text: 'Заказчик открывает файл без регистрации, ставит «ОК» или «нужны правки» прямо на странице. Срок жизни ссылки и пароль задаёте вы.',
  },
  {
    title: 'ИИ-ассистент',
    text: 'Чат по документу и по инструкции, пересказ, проверка рисков и противоречий, сверка с загруженными регламентами.',
  },
];

const steps = [
  {
    title: 'Загрузили PDF',
    text: 'Файл уходит в фоновую очередь: миниатюры страниц, текстовый слой, проверка структуры. Документ появляется в списке сразу.',
  },
  {
    title: 'Собрали и поправили',
    text: 'Макет, сжатие, вырезка, объединение и перестановка страниц. Каждое действие создаёт версию — предыдущая остаётся доступной.',
  },
  {
    title: 'Отправили на согласование',
    text: 'Гостевая ссылка, пометки по страницам, ответ «Решено». Все значимые действия попадают в журнал аудита.',
  },
];

const audiences = [
  {
    title: 'Архитектурные бюро',
    text: 'Буклеты, альбомы и презентации объектов. Макет поверх PDF, медиатека рендеров, шаблоны бюро и гостевые ссылки без пересылки файлов.',
  },
  {
    title: 'Юристы и комплаенс',
    text: 'Договоры, ТЗ и регламенты. Реестр правок «было / стало», применение через DOCX, поиск противоречий и сверка с базой регламентов.',
  },
];

const faq = [
  {
    q: 'Нужна ли регистрация, чтобы посмотреть документ?',
    a: 'Нет. По гостемой ссылке PDF открывается без аккаунта, и комментарии с метками «ОК» тоже оставляются без регистрации. Срок жизни ссылки и пароль задаёт владелец документа.',
  },
  {
    q: 'Где лежат мои файлы?',
    a: 'В вашем S3-хранилище: локально это MinIO, в проде — MinIO или облачный бакет. РазУм хранит метаданные, версии и журнал действий.',
  },
  {
    q: 'Работает ли с отсканированными PDF?',
    a: 'Да. Если в файле нет текстового слоя, РазУм предложит распознать текст: поиск и ИИ заработают после распознавания, а просмотр, макет и остальные операции доступны сразу.',
  },
  {
    q: 'Кто применяет правки, предложенные ИИ?',
    a: 'ИИ только предлагает. Сборка PDF, применение правок и отправка файла клиенту запускаются вами и фиксируются в журнале аудита.',
  },
  {
    q: 'Можно поставить на телефон?',
    a: 'Да. Сайт устанавливается как PWA на домашний экран. Для Android собирается APK, и в медиатеке доступна камера — снять фото объекта прямо с телефона.',
  },
];

const chip = 'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium';

function ProductPreview() {
  return (
    <div aria-hidden className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-br from-folio-100/70 via-white to-folio-50 blur-2xl" />
      <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_28px_70px_-38px_rgba(30,27,75,0.45)]">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="ml-2 truncate text-sm font-medium text-slate-700">
            ЖК Северный, корпус 2 — буклет
          </span>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            {['v1', 'v2', 'v3'].map((version, index) => (
              <span
                key={version}
                className={`${chip} ${
                  index === 2
                    ? 'bg-folio-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-500'
                }`}
              >
                {version}
              </span>
            ))}
            <span className={`${chip} bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70`}>
              Утверждено
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((page) => (
              <div
                key={page}
                className="aspect-[3/4] rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 p-2"
              >
                <div className="h-1.5 w-2/3 rounded-full bg-slate-300" />
                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200" />
                <div className="mt-1.5 h-1.5 w-5/6 rounded-full bg-slate-200" />
                <div className="mt-3 h-8 rounded-lg bg-folio-100" />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {[
              'Раздел 3 — сетка перекрыта колонтитулом',
              'Раздел 5 — уточнить формулировку',
            ].map((row) => (
              <div
                key={row}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                <span className="truncate text-xs text-slate-600">{row}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <span className="text-xs text-slate-500">Замечаний: 2 · версия v3</span>
            <span className="rounded-2xl bg-folio-600 px-3.5 py-2 text-xs font-medium text-white">
              Отправить заказчику
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { data: health } = useHealthQuery(undefined, { skip: import.meta.env.MODE === 'test' });

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-folio-600 font-display text-lg text-white">
              Р
            </span>
            <span className="font-display text-xl text-folio-950">РазУм</span>
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link to="/login" className="hidden rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 sm:block">
              Вход
            </Link>
            <Link to="/register">
              <Button radius="lg" className="px-5">Создать пространство</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-folio-100),transparent)]"
          />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
            <div>
              <p className={`${chip} mb-5 bg-folio-100 text-folio-700`}>
                Бюро, юристы и договорные чаты
              </p>
              <h1 className="font-display text-4xl leading-[1.08] text-slate-900 sm:text-5xl lg:text-6xl">
                Весь цикл работы с&nbsp;PDF — <span className="text-folio-600">в одном месте</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                РазУм хранит документы по проектам, помнит каждую версию, открывает PDF прямо в
                браузере и связывает правки с согласованием. ИИ читает файл и предлагает изменения —
                применять их вы решаете сами.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <Link to="/register" className="w-full sm:w-auto">
                  <Button size="lg" radius="lg" className="w-full sm:w-auto">
                    Создать рабочее пространство
                  </Button>
                </Link>
                <Link to="/login" className="w-full sm:w-auto">
                  <Button size="lg" radius="lg" variant="secondary" className="w-full sm:w-auto">
                    У меня есть аккаунт
                  </Button>
                </Link>
              </div>
              <p className="mt-5 text-sm text-slate-500">
                Без карты и подписки. Файлы остаются в вашем S3-хранилище.
              </p>
              {import.meta.env.DEV && health && (
                <p className="mt-3 text-xs text-slate-400">
                  API: {health.status} · {new Date(health.timestamp).toLocaleTimeString('ru')}
                </p>
              )}
            </div>
            <ProductPreview />
          </div>
        </section>

        <section className="border-y border-slate-200/70 bg-slate-50/60 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="font-display text-3xl text-slate-900 sm:text-4xl">Что внутри</h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
              Шесть блоков, которые закрывают работу с документом от загрузки до подтверждения
              правок.
            </p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <article
                  key={feature.title}
                  className="rounded-3xl border border-slate-200/80 bg-white p-6 transition hover:border-folio-200 hover:shadow-[0_18px_40px_-28px_rgba(30,27,75,0.4)]"
                >
                  <h3 className="text-lg font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="font-display text-3xl text-slate-900 sm:text-4xl">Как это работает</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} className="relative rounded-3xl border border-slate-200/80 p-6">
                  <span className="font-display text-4xl text-folio-300">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-3 text-lg font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-y border-slate-200/70 bg-slate-50/60 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="font-display text-3xl text-slate-900 sm:text-4xl">Кому подходит</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {audiences.map((audience) => (
                <article
                  key={audience.title}
                  className="rounded-3xl border border-slate-200/80 bg-white p-7"
                >
                  <h3 className="font-display text-2xl text-folio-900">{audience.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{audience.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="font-display text-3xl text-slate-900 sm:text-4xl">Частые вопросы</h2>
            <div className="mt-8 divide-y divide-slate-200 rounded-3xl border border-slate-200/80 bg-white px-5 sm:px-7">
              {faq.map((item) => (
                <details key={item.q} className="group py-5">
                  <summary className="flex list-none items-start justify-between gap-4 text-left text-base font-medium text-slate-900">
                    {item.q}
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 transition group-open:rotate-45 group-open:bg-folio-100 group-open:text-folio-700">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 pr-10 text-sm leading-relaxed text-slate-600">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/70 bg-slate-50/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-folio-600 font-display text-sm text-white">
              Р
            </span>
            <span className="font-display text-lg text-folio-950">РазУм</span>
          </div>
          <p className="text-sm text-slate-500">
            Документы, версии и согласование — для тех, кто делает их каждый день.
          </p>
          <div className="flex items-center gap-5 text-sm">
            <Link to="/login" className="font-medium text-slate-700 transition hover:text-folio-700">
              Вход
            </Link>
            <Link to="/register" className="font-medium text-slate-700 transition hover:text-folio-700">
              Регистрация
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
