import { useId } from 'react';
import { Link } from 'react-router-dom';
import { useHealthQuery } from '@folio-mind/store';
import { Button } from '../../components/ui/Button.js';

const features = [
  {
    title: 'Проекты и версии',
    text: 'Папка на объект, история v1…vN и статус согласования. Старая версия не перезаписывается, как у «final_final_3», только в порядке.',
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
    text: 'Реестр правок, сборка PDF для согласования и применение правок через DOCX одним действием, с отметкой о выполнении.',
  },
  {
    title: 'Согласование по ссылке',
    text: 'Заказчик открывает файл без регистрации, ставит «ОК» или «нужны правки» прямо на странице. Срок жизни ссылки и пароль задаёте вы.',
  },
  {
    title: 'ИИ-ассистент',
    text: 'Подписи к рендерам из имён файлов, черновик титульника, поиск по проекту и ответы по документу. Содержимое документа ИИ не меняет: все правки вносите вы.',
  },
];

const steps = [
  {
    title: 'Загрузили PDF',
    text: 'Файл уходит в фоновую очередь: миниатюры страниц, текстовый слой, проверка структуры. Документ появляется в списке сразу.',
  },
  {
    title: 'Собрали и поправили',
    text: 'Макет, сжатие, вырезка, объединение и перестановка страниц. Каждое действие создаёт версию, предыдущая остаётся доступной.',
  },
  {
    title: 'Отправили на согласование',
    text: 'Гостевая ссылка, пометки по страницам, ответ «Решено». Все значимые действия попадают в журнал аудита.',
  },
];

const audiences = [
  {
    title: 'Архитекторы',
    text: 'Буклеты, альбомы и презентации объектов. Макет поверх PDF, медиатека рендеров, шаблоны бюро и гостевые ссылки без пересылки файлов.',
  },
  {
    title: 'Юристы',
    text: 'Договоры, ТЗ и регламенты. Реестр правок «было / стало», применение через DOCX, поиск противоречий и сверка с базой регламентов.',
  },
  {
    title: 'Комплаенс',
    text: 'Контроль исполнения требований, автоматизация проверок и аудит изменений в документах.',
  },
  {
    title: 'Команды, живущие в PDF',
    text: 'Продажи, закупки, технадзор: договоры, спецификации, сметы, акты. Папка на контрагента вместо почты, общая библиотека файлов, роли и журнал: кто что скачал.',
  },
];

const faq = [
  {
    q: 'Нужна ли регистрация, чтобы посмотреть документ?',
    a: 'Нет. По гостемой ссылке PDF открывается без аккаунта, и комментарии с метками «ОК» тоже оставляются без регистрации. Срок жизни ссылки и пароль задаёт владелец документа.',
  },
  {
    q: 'Где лежат мои файлы?',
    a: 'В вашем S3-хранилище: локально это MinIO, в проде это MinIO или облачный бакет. РазУм хранит метаданные, версии и журнал действий.',
  },
  {
    q: 'Работает ли с отсканированными PDF?',
    a: 'Да. Если в файле нет текстового слоя, РазУм предложит распознать текст: поиск и ИИ заработают после распознавания, а просмотр, макет и остальные операции доступны сразу.',
  },
  {
    q: 'Правки в документе делает ИИ или я?',
    a: 'Правки в тексте и в вёрстке делаете вы: вручную либо через реестр «было / стало» с применением через DOCX. ИИ работает только с тем, что не меняет содержание: подписи к рендерам, черновик титульника, поиск по проекту и ответы по документу. Решение применить и отправить файл заказчику всегда остаётся за вами.',
  },
  {
    q: 'Можно поставить на телефон?',
    a: 'Да. Сайт устанавливается как PWA на домашний экран. Для Android собирается APK, и в медиатеке доступна камера, чтобы снять фото объекта прямо с телефона.',
  },
];

const chip = 'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium';

const laba = {
  site: 'laba-laba.ru',
  email: 'info@laba-laba.ru',
  phones: [
    { label: '+7 (916) 195-82-26', href: 'tel:+79161958226' },
    { label: '+7 (969) 063-93-23', href: 'tel:+79690639323' },
  ],
  address: '125124, город Москва, ул. 3-я Ямского Поля, д. 2 к. 13',
  company: 'Общество с ограниченной ответственностью «Лаба»',
  inn: '9714075424',
  kpp: '771401001',
  ogrn: '1257700222460',
} as const;

const pages = [
  { number: '1', kind: 'cover', delay: '0s' },
  { number: '3', kind: 'plan', delay: '-13s' },
  { number: '5', kind: 'edits', delay: '-10s' },
] as const;

const versions = [
  { label: 'v1', delay: '0s' },
  { label: 'v2', delay: '-13s' },
  { label: 'v3', delay: '-10s' },
] as const;

const activity = [
  { text: 'Правка внесена на стр. 3: площадь исправлена', delay: '0s' },
  { text: 'Версия v3 собрана из 24 страниц и сохранена', delay: '-10.67s' },
  { text: 'Гостевая ссылка отправлена заказчику со сроком 7 дней', delay: '-5.33s' },
] as const;

function Logo() {
  const gradientId = `logo-gradient-${useId()}`;
  return (
    <svg
      aria-hidden
      viewBox="0 0 64 64"
      className="h-9 w-9 shrink-0"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="12"
          y1="4"
          x2="56"
          y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="55%" stopColor="#4338ca" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${gradientId})`} />
      <path
        fill="#ffffff"
        fillOpacity="0.08"
        d="M14 6h36a10 10 0 0 1 10 10v8c-12 10-28 12-46 6V16A10 10 0 0 1 14 6z"
      />
      <path
        fill="#ffffff"
        d="M19 15h17.5c8.2 0 14.5 5.4 14.5 13.2 0 7.7-6.3 13.1-14.5 13.1H27v11.2h-8V15zm8 6.4v13.5h9.2c3.9 0 6.7-2.5 6.7-6.7 0-4.2-2.8-6.8-6.7-6.8H27z"
      />
    </svg>
  );
}

function PreviewPage({
  kind,
  delay,
  number,
}: {
  kind: 'cover' | 'plan' | 'edits';
  delay: string;
  number: string;
}) {
  return (
    <div className="relative">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-slate-200 bg-white p-2.5">
        {kind === 'cover' && (
          <div className="flex h-full flex-col">
            <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-folio-600">
              ЖК Северный
            </span>
            <span className="mt-1 h-[3px] w-8 rounded-full bg-folio-500" />
            <span className="mt-1.5 text-[13px] font-bold leading-none text-slate-900">
              Корпус 2
            </span>
            <span className="mt-1 text-[8px] leading-tight text-slate-500">
              Ховрино, Москва · 24 этажа
            </span>
            <div className="relative mt-2 min-h-0 flex-1 overflow-hidden rounded-md">
              <span className="absolute inset-0 bg-gradient-to-b from-folio-100 via-slate-50 to-slate-200" />
              <span className="absolute right-3 top-2 h-3 w-3 rounded-full bg-white/85" />
              <span className="absolute bottom-[17%] left-[4%] top-[42%] w-[13%] rounded-t-[2px] bg-slate-300/80" />
              <span className="absolute bottom-[17%] left-[19%] top-[24%] w-[29%] rounded-t-[3px] bg-slate-400" />
              <div className="absolute bottom-[23%] left-[23%] top-[30%] grid w-[21%] grid-cols-3 gap-[3px]">
                {['a', 'b', 'c', 'd', 'e', 'f'].map((cell) => (
                  <span key={cell} className="h-[7px] rounded-[1px] bg-white/85" />
                ))}
              </div>
              <span className="absolute bottom-[17%] right-[6%] top-[10%] w-[39%] rounded-t-[3px] bg-slate-500" />
              <div className="absolute bottom-[23%] right-[11%] top-[16%] grid w-[29%] grid-cols-3 gap-[3px]">
                {['g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o'].map((cell) => (
                  <span key={cell} className="h-[8px] rounded-[1px] bg-white/90" />
                ))}
              </div>
              <span className="absolute inset-x-0 bottom-0 h-[14%] bg-slate-500/60" />
              <span className="absolute bottom-[9%] left-[7%] h-[9%] w-[3%] rounded-t-full bg-emerald-500/70" />
              <span className="absolute bottom-[9%] left-[12%] h-[7%] w-[2.5%] rounded-t-full bg-emerald-500/55" />
              <span className="absolute bottom-1 left-1.5 rounded-[3px] bg-white/90 px-1 py-px text-[7px] font-medium leading-tight text-slate-700">
                Рендер фасада
              </span>
            </div>
            <span className="mt-2 text-[7px] leading-none text-slate-400">
              Ховдинг «Северный» · сдача IV кв. 2027
            </span>
          </div>
        )}
        {kind === 'plan' && (
          <div className="flex h-full flex-col">
            <span className="text-[9px] font-semibold leading-none text-slate-900">Планировки</span>
            <span className="mt-1.5 text-[8px] leading-[1.35] text-slate-500">
              Квартиры 1–3 в секции А. Сдача в IV квартале 2027 года.
            </span>
            <div className="mt-1.5 flex gap-1">
              {['54 м²', '67 м²', '89 м²'].map((area) => (
                <span
                  key={area}
                  className="rounded-[3px] border border-slate-200 bg-white px-1 py-px text-[7px] font-medium leading-tight text-slate-600"
                >
                  {area}
                </span>
              ))}
            </div>
            <div className="mt-2 grid min-h-0 flex-1 grid-cols-2 gap-1.5">
              {['Гостиная', 'Спальня', 'Кухня', 'С/у'].map((room) => (
                <span
                  key={room}
                  className="flex items-center justify-center rounded-[4px] border border-folio-200 bg-folio-50/70 text-[7px] font-medium leading-none text-folio-700"
                >
                  {room}
                </span>
              ))}
            </div>
            <div className="relative mt-2 flex items-center gap-1.5">
              <span className="h-2 flex-1 rounded-[2px] bg-slate-200" />
              <span className="h-2 w-8 rounded-[2px] bg-slate-200" />
              <span className="absolute -top-4 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-400" />
            </div>
          </div>
        )}
        {kind === 'edits' && (
          <div className="flex h-full flex-col overflow-hidden">
            <span className="text-[9px] font-semibold leading-none text-slate-900">Правки</span>
            <span className="mt-1 text-[8px] leading-none text-slate-500">
              стр. 5 · было / стало
            </span>
            <div className="mt-2 space-y-1.5">
              <div className="rounded-[4px] border border-red-200 bg-red-50 px-1.5 py-1">
                <span className="text-[7px] font-semibold uppercase tracking-wide text-red-500">
                  было
                </span>
                <span className="mt-0.5 block text-[8px] leading-tight text-red-700 line-through decoration-red-400">
                  45 м²
                </span>
              </div>
              <div className="rounded-[4px] border border-emerald-200 bg-emerald-50 px-1.5 py-1">
                <span className="text-[7px] font-semibold uppercase tracking-wide text-emerald-600">
                  стало
                </span>
                <span className="mt-0.5 block text-[8px] leading-tight text-emerald-800">
                  54–89 м²
                </span>
              </div>
            </div>
            <div className="relative mt-auto pt-2">
              <span className="block rounded-[4px] border border-slate-200 bg-white px-1.5 py-1 text-[7px] font-medium leading-tight text-slate-600">
                Применено через DOCX
              </span>
              <span className="absolute -top-2 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-400" />
            </div>
          </div>
        )}
      </div>
      <span
        style={{ animationDelay: delay }}
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 ring-2 ring-folio-500 animate-[landing-focus_16s_ease-in-out_infinite] motion-reduce:[animation:none]"
      />
      <span
        style={{ animationDelay: delay }}
        className="pointer-events-none absolute inset-x-0 top-0 h-8 opacity-0 bg-gradient-to-b from-folio-400/50 to-transparent animate-[landing-scan_16s_ease-in-out_infinite] motion-reduce:[animation:none]"
      />
      <span className="absolute bottom-1.5 left-1.5 rounded-[3px] bg-white/90 px-1.5 py-px text-[7px] font-semibold leading-tight text-slate-500">
        {number}
      </span>
    </div>
  );
}

function ProductPreview() {
  return (
    <div aria-hidden className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-br from-folio-100/70 via-white to-folio-50 blur-2xl" />
      <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_28px_70px_-38px_rgba(30,27,75,0.45)]">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
          <span className="truncate text-sm font-medium text-slate-700">
            ЖК Северный, корпус 2 (буклет)
          </span>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            {versions.map((version) => (
              <span
                key={version.label}
                style={{ animationDelay: version.delay }}
                className={`${chip} border border-slate-200 bg-white text-slate-500 animate-[landing-version_16s_ease-in-out_infinite] motion-reduce:[animation:none] ${
                  version.label === 'v3'
                    ? 'motion-reduce:border-transparent motion-reduce:bg-folio-600 motion-reduce:text-white'
                    : ''
                }`}
              >
                {version.label}
              </span>
            ))}
            <span
              className={`${chip} ml-auto border border-emerald-200 bg-emerald-50 text-emerald-700 motion-reduce:[animation:none]`}
            >
              Утверждено
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {pages.map((page) => (
              <PreviewPage key={page.number} {...page} />
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-2xl border px-3 py-2 animate-[landing-resolve_16s_ease-in-out_infinite] motion-reduce:[animation:none] motion-reduce:border-amber-200 motion-reduce:bg-amber-50">
              <span className="h-2 w-2 shrink-0 rounded-full animate-[landing-dot_16s_ease-in-out_infinite] motion-reduce:[animation:none] motion-reduce:bg-amber-400" />
              <span className="truncate text-xs text-slate-600">
                стр. 3: сверить площадь 89 м² с планом БСН
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
              <span className="truncate text-xs text-slate-600">
                стр. 5: применить правки через DOCX
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-folio-400 motion-reduce:[animation:none]" />
            <div className="relative h-4 min-w-0 flex-1 overflow-hidden">
              {activity.map((line, index) => (
                <span
                  key={line.text}
                  style={{ animationDelay: line.delay }}
                  className={`absolute inset-0 flex items-center truncate text-xs text-slate-600 opacity-0 animate-[landing-activity_16s_ease-in-out_infinite] motion-reduce:[animation:none] ${
                    index === 0 ? 'motion-reduce:opacity-100' : 'motion-reduce:opacity-0'
                  }`}
                >
                  {line.text}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
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
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pb-3.5 sm:pt-[max(0.875rem,env(safe-area-inset-top))]">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <Logo />
            <span className="font-display text-xl text-folio-950">РазУм</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              to="/login"
              className="rounded-2xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Вход
            </Link>
            <Link to="/register" className="shrink-0">
              <Button
                radius="lg"
                className="min-h-10 px-3.5 text-sm sm:min-h-12 sm:px-5 sm:text-base"
              >
                <span className="sm:hidden">Начать</span>
                <span className="hidden sm:inline">Создать пространство</span>
              </Button>
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
                Архитекторы, юристы, комплаенс, команды
              </p>
              <h1 className="font-display text-4xl leading-[1.08] text-slate-900 sm:text-5xl lg:text-6xl">
                Весь цикл работы с PDF <span className="text-folio-600">в одном месте</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                РазУм хранит документы по проектам, помнит каждую версию, открывает PDF прямо в
                браузере и связывает правки с согласованием. ИИ помогает по месту: подписи к
                рендерам, черновик титульника и поиск по проекту. Текст документа вы правите сами.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link to="/register" className="shrink-0">
                  <Button radius="lg">Создать рабочее пространство</Button>
                </Link>
                <Link
                  to="/login"
                  className="inline-flex min-h-12 items-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Войти
                </Link>
              </div>
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
                <li
                  key={step.title}
                  className="relative rounded-3xl border border-slate-200/80 p-6"
                >
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
            <div className="mt-10 grid gap-5 sm:grid-cols-2">
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
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-sm">
              <div className="flex items-center gap-2.5">
                <Logo />
                <span className="font-display text-lg text-folio-950">РазУм</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                Документы, версии и согласование для тех, кто делает их каждый день.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <Link
                  to="/login"
                  className="font-medium text-slate-700 transition hover:text-folio-700"
                >
                  Вход
                </Link>
                <Link
                  to="/register"
                  className="font-medium text-slate-700 transition hover:text-folio-700"
                >
                  Регистрация
                </Link>
                <Link
                  to="/privacy"
                  className="font-medium text-slate-700 transition hover:text-folio-700"
                >
                  Политика конфиденциальности
                </Link>
              </div>
            </div>

            <dl className="grid gap-x-10 gap-y-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-900">Найти</dt>
                <dd className="mt-1.5">
                  <a
                    href="https://laba-laba.ru/"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-slate-600 transition hover:text-folio-700"
                  >
                    {laba.site}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900">Почта</dt>
                <dd className="mt-1.5">
                  <a
                    href={`mailto:${laba.email}`}
                    className="whitespace-nowrap text-slate-600 transition hover:text-folio-700"
                  >
                    {laba.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900">Телефоны</dt>
                <dd className="mt-1.5 flex flex-col">
                  {laba.phones.map((phone) => (
                    <a
                      key={phone.href}
                      href={phone.href}
                      className="whitespace-nowrap text-slate-600 transition hover:text-folio-700"
                    >
                      {phone.label}
                    </a>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900">Адрес</dt>
                <dd className="mt-1.5 text-slate-600">{laba.address}</dd>
              </div>
            </dl>
          </div>

          <div className="mt-10 flex flex-col gap-3 border-t border-slate-200/80 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 leading-relaxed sm:flex-1">
              {laba.company}. <span className="whitespace-nowrap">ИНН {laba.inn}</span>,{' '}
              <span className="whitespace-nowrap">КПП {laba.kpp}</span>,{' '}
              <span className="whitespace-nowrap">ОГРН {laba.ogrn}</span>.
            </p>
            <a
              href="https://laba-laba.ru/"
              target="_blank"
              rel="noreferrer noopener"
              className="group inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 transition-all duration-200 hover:border-slate-300 hover:bg-slate-100/70 hover:text-slate-900 hover:shadow-[0_2px_8px_-4px_rgba(30,27,75,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-folio-500 focus-visible:ring-offset-2"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300 transition-colors duration-200 group-hover:bg-folio-400" />
              © LABA
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
