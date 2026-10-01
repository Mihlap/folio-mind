import { useState } from 'react';
import { Link } from 'react-router-dom';
import { resetStorageNotice } from '../../components/layout/storageNotice.js';

const operator = {
  company: 'Общество с ограниченной ответственностью «Лаба»',
  inn: '9714075424',
  kpp: '771401001',
  ogrn: '1257700222460',
  address: '125124, город Москва, ул. 3-я Ямского Поля, д. 2 к. 13',
  email: 'info@laba-laba.ru',
  site: 'laba-laba.ru',
  phones: ['+7 (916) 195-82-26', '+7 (969) 063-93-23'],
  phoneHrefs: ['tel:+79161958226', 'tel:+79690639323'],
};

const contents = [
  '1. Общие положения',
  '2. Какие данные обрабатываются',
  '3. Цели и правовые основания обработки',
  '4. Файлы cookie и локальное хранилище',
  '5. Порядок обработки и сроки хранения',
  '6. Передача третьим лицам',
  '7. Меры защиты данных',
  '8. Ваши права и порядок их реализации',
  '9. Обжалование',
  '10. Изменения политики',
];

const dataKinds = [
  {
    kind: 'Данные аккаунта',
    detail: 'Имя, адрес электронной почты или номер телефона, хеш пароля',
    source: 'вы',
  },
  {
    kind: 'Данные документов',
    detail:
      'Загруженные файлы, версии, макеты, подписи к рендерам, реестр правок, комментарии по страницам, статусы согласования',
    source: 'вы',
  },
  {
    kind: 'Гостевая ссылка',
    detail: 'Срок жизни ссылки, пароль ссылки, отметка об открытии, ответ заказчика',
    source: 'вы, заказчик',
  },
  {
    kind: 'Журнал действий',
    detail: 'Кто и когда открывал документ, скачивал файл, менял версию или оставлял комментарий',
    source: 'автоматически',
  },
  {
    kind: 'Счётчики посещаемости',
    detail:
      'Дата и время регистрации или входа, внутренний идентификатор пользователя и организации. Без адреса почты и IP-адреса',
    source: 'автоматически',
  },
  {
    kind: 'Технические данные',
    detail: 'IP-адрес, время и код ответа на запрос, записи журналов сервера',
    source: 'автоматически',
  },
  {
    kind: 'Данные оплаты',
    detail: 'Реквизиты плательщика, идентификатор платежа, статус оплаты',
    source: 'платёжная система',
  },
];

const purposes = [
  {
    goal: 'Регистрация, вход и восстановление доступа',
    basis: 'исполнение договора (п. 5 ч. 1 ст. 6 152-ФЗ)',
  },
  {
    goal: 'Обработка, версионирование и выдача документов',
    basis: 'исполнение договора (п. 5 ч. 1 ст. 6 152-ФЗ)',
  },
  {
    goal: 'Согласование по гостевой ссылке',
    basis: 'исполнение договора (п. 5 ч. 1 ст. 6 152-ФЗ)',
  },
  {
    goal: 'Функции с ИИ по вашему запросу',
    basis: 'ваше согласие, выраженное нажатием кнопки',
  },
  {
    goal: 'Проведение платежей, выставление счетов и закрывающих документов',
    basis: 'исполнение договора (п. 5 ч. 1 ст. 6 152-ФЗ)',
  },
  {
    goal: 'Учёт посещаемости сервиса по регистрациям и входам',
    basis: 'законодательные обязанности (п. 2 ч. 1 ст. 6 152-ФЗ)',
  },
  {
    goal: 'Ответы на обращения и техническая поддержка',
    basis: 'согласие (п. 1 ч. 1 ст. 6 152-ФЗ)',
  },
  {
    goal: 'Соблюдение требований законодательства и защита от злоупотреблений',
    basis: 'законодательные обязанности (п. 2 ч. 1 ст. 6 152-ФЗ)',
  },
];

const storage = [
  {
    name: 'folio_token',
    place: 'localStorage',
    life: 'до выхода из аккаунта',
    purpose: 'токен входа, чтобы не вводить пароль на каждой странице',
  },
  {
    name: 'folio-layout-*',
    place: 'sessionStorage',
    life: 'до закрытия вкладки',
    purpose: 'черновик макета и правок, чтобы не потерять несохранённое',
  },
  {
    name: 'folio_storage_notice',
    place: 'localStorage',
    life: 'постоянно',
    purpose: 'отметка, что уведомление о файлах cookie вы прочитали',
  },
  {
    name: 'токен OAuth-сессии',
    place: 'cookie, httpOnly',
    life: '10 минут',
    purpose: 'защита от подделки запроса при входе через внешний сервис',
  },
  {
    name: 'кэш приложения',
    place: 'Cache Storage, service worker',
    life: 'до очистки данных браузера',
    purpose: 'работа офлайн и установка приложения на домашний экран',
  },
];

const retention = [
  { data: 'Данные аккаунта', term: 'до удаления аккаунта' },
  { data: 'Файлы и версии документов', term: 'до удаления вами' },
  { data: 'Комментарии и статусы согласования', term: 'вместе с документом' },
  { data: 'Журнал действий', term: 'в пределах срока, установленного политикой безопасности' },
  { data: 'Счётчики посещаемости', term: 'не более 12 месяцев с момента события' },
  { data: 'Технические журналы сервера', term: 'не более 12 месяцев' },
  { data: 'Данные оплаты', term: 'сроки, установленные законодательством о бухгалтерском учёте' },
  { data: 'Токен входа и черновики в браузере', term: 'до выхода и закрытия вкладки' },
];

const security = [
  'Пароли не хранятся в открытом виде, сохраняется только их хеш.',
  'Доступ к аккаунту защищён токеном, который можно отозвать выходом из аккаунта.',
  'Гостевая ссылка может быть защищена паролем и сроком действия.',
  'Файлы хранятся в вашем S3-хранилище, доступ к которому есть только у администраторов развёртывания.',
  'Права сотрудников ограничены ролями: один участник не видит то, что не открывал.',
  'Соединение с сервером защищено HTTPS.',
  'Данные в покое шифруются средствами вашего хранилища.',
];

const rights = [
  'получить информацию об обработке ваших данных и о целях обработки',
  'получить копию данных, которые вы предоставили, в machine-readable виде, то есть выгрузкой',
  'требовать уточнения, блокирования или уничтожения данных, если они неполны, устарели или неточны',
  'отозвать согласие на обработку в любой момент',
  'обжаловать действия оператора в Роскомнадзоре или в суде',
];

const sections = [
  {
    title: '1. Общие положения',
    body: [
      `Политика описывает, какие персональные данные и данные документов обрабатывает сервис РазУм, зачем, кто оператор, где всё хранится и что может сделать пользователь.`,
      `Оператор персональных данных: ${operator.company}, ОГРН ${operator.ogrn}, ИНН ${operator.inn}, КПП ${operator.kpp}, адрес: ${operator.address}.`,
      <>
        Контактный адрес для обращений: <span className="whitespace-nowrap">{operator.email}</span>.
      </>,
      `Политика составлена в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных».`,
      `Сервис предназначен для работы юридических лиц и физических лиц старше 18 лет, действующих в интересах организаций. Регистрируясь, вы подтверждаете, что указанные вами имя и адрес относятся к вам или к представляемой вами организации.`,
    ],
  },
  {
    title: '2. Какие данные обрабатываются',
    body: [
      'Состав данных зависит от того, какие функции вы используете. Полный перечень приведён в таблице.',
    ],
    table: 'dataKinds',
  },
  {
    title: '3. Цели и правовые основания обработки',
    body: [
      'Данные не обрабатываются для целей, не указанных в этой таблице. Новые цели добавляются только с вашего согласия.',
    ],
    table: 'purposes',
  },
  {
    title: '4. Файлы cookie и локальное хранилище',
    body: [
      'Мы не используем рекламные, сторонние аналитические и трекинговые файлы cookie, внешние счётчики и пиксели. Поэтому отдельного согласия на маркетинговые cookies не требуется, ведь есть только то, что нужно для работы сервиса.',
      'Собственный учёт посещаемости ведётся на нашем сервере, а не в вашем браузере: при регистрации и входе записывается только дата, время и внутренний идентификатор. Адрес почты и IP-адрес в эти счётчики не попадают.',
      'Ниже перечислено всё, что приложение сохраняет в вашем браузере. Вы можете удалить эти данные в любой момент через настройки браузера; после этого потребуется повторный вход, а несохранённый черновик макета будет потерян.',
    ],
    table: 'storage',
  },
  {
    title: '5. Порядок обработки и сроки хранения',
    body: [
      'Данные обрабатываются с использованием средств автоматизации и без их использования, на территории Российской Федерации.',
      'После достижения целей обработки, по истечении сроков хранения либо при отзыве согласия данные удаляются или обезличиваются, если иное не предусмотрено законом.',
    ],
    table: 'retention',
  },
  {
    title: '6. Передача третьим лицам',
    body: [
      'Файлы документов хранятся в S3-хранилище, которое вы настраиваете при развёртывании сервиса. Мы не получаем к нему доступ.',
      'Текст документов передаётся настроенным вами провайдеру ИИ (например, GigaChat или YandexGPT) только когда вы явно запускаете функцию с ИИ. Без вашего действия текст никуда не передаётся. Если такой провайдер находится за пределами Российской Федерации, передача является трансграничной и совершается только с вашего согласия, о котором сервис предупреждает заранее.',
      'Для отправки писем, распознавания изображений и конвертации привлекаются подрядчики: почтовый провайдер, сервис распознавания текста и конвертации документов. Каждый получает только то, что нужно для конкретной операции, и обязан соблюдать конфиденциальность.',
      'Мы не продаём данные и не передаём их в рекламные сети.',
      'Доступ к аккаунту на сервере имеют администраторы вашего развёртывания в объёме, необходимом для сопровождения.',
    ],
  },
  {
    title: '7. Меры защиты данных',
    body: ['При обработке принимаются следующие меры:'],
    list: 'security',
  },
  {
    title: '8. Ваши права и порядок их реализации',
    body: ['Пользователь вправе:'],
    list: 'rights',
    extra: [
      <>
        Обращения направляйте на <span className="whitespace-nowrap">{operator.email}</span> или по
        адресу: {operator.address}. В письме укажите адрес аккаунта, суть обращения и приложите
        подтверждающие документы, если это возможно.
      </>,
      'Ответ предоставляется в течение 30 дней с момента получения обращения. По просьбе пользователя срок может быть продлён.',
      'Отзыв согласия на обработку оформляется в свободной форме и не лишает вас права использовать функции, для которых согласие не требуется. Отзыв не отменяет обработку, которая уже была законно совершена до его получения.',
      <>
        Удаление аккаунта и всех связанных с ним документов выполняется по обращению на{' '}
        <span className="whitespace-nowrap">{operator.email}</span> в течение 30 дней, если иное не
        предусмотрено законом.
      </>,
    ],
  },
  {
    title: '9. Обжалование',
    body: [
      'Если вы считаете, что ваши права нарушены, вы вправе обратиться в Роскомнадзор или подать иск в суд по месту нахождения ответчика.',
      'До обращения в орган или суд рекомендуется направить претензию оператору, поскольку большинство вопросов решается на этом этапе.',
    ],
  },
  {
    title: '10. Изменения политики',
    body: [
      'Политика действует с момента размещения на этой странице. Новая редакция публикуется по тому же адресу с указанием даты изменения.',
      'Если перечень обрабатываемых данных или цели обработки меняются существенно, сервис уведомляет об этом в интерфейсе, а уведомление о файлах cookie появляется заново, чтобы вы могли ознакомиться с изменениями.',
    ],
  },
];

const columns = {
  dataKinds: [
    { key: 'kind', title: 'Категория' },
    { key: 'detail', title: 'Что именно' },
    { key: 'source', title: 'Источник' },
  ],
  purposes: [
    { key: 'goal', title: 'Цель' },
    { key: 'basis', title: 'Правовое основание' },
  ],
  storage: [
    { key: 'name', title: 'Имя' },
    { key: 'place', title: 'Где хранится' },
    { key: 'life', title: 'Срок' },
    { key: 'purpose', title: 'Зачем' },
  ],
  retention: [
    { key: 'data', title: 'Категория данных' },
    { key: 'term', title: 'Срок хранения' },
  ],
} as const;

type TableName = keyof typeof columns;
type TableRow = { [K in TableName]: Record<string, string> }[TableName];

const tableRows: Record<TableName, TableRow[]> = {
  dataKinds,
  purposes,
  storage,
  retention,
};

function DataTable({ name }: { name: TableName }) {
  const rows = tableRows[name];
  return (
    <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-200/80">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="bg-slate-50 text-slate-700">
            {columns[name].map((column) => (
              <th key={column.key} className="px-4 py-3 font-semibold">
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="align-top">
              {columns[name].map((column, cellIndex) => (
                <td
                  key={column.key}
                  className={
                    cellIndex === 0 && name === 'storage'
                      ? 'px-4 py-3 font-mono text-xs text-slate-800'
                      : 'px-4 py-3 text-slate-600'
                  }
                >
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PrivacyPage() {
  const [reset, setReset] = useState(false);

  return (
    <div className="min-h-screen bg-white font-classic">
      <header className="border-b border-slate-200/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/" className="text-sm font-medium text-folio-600 hover:underline">
            ← На главную
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6">
        <h1 className="font-classic text-[2.125rem] font-bold leading-tight text-slate-900">
          Политика конфиденциальности
        </h1>
        <p className="mt-4 text-[15px] leading-[1.7] text-slate-700">
          Документ описывает, какие данные обрабатывает сервис РазУм, зачем, где они хранятся и что
          может сделать пользователь. Отдельный раздел о файлах cookie находится ниже, где
          перечислено всё, что приложение сохраняет в вашем браузере.
        </p>

        <nav
          aria-label="Содержание"
          className="mt-10 rounded-3xl border border-slate-200/80 bg-slate-50/60 p-6"
        >
          <p className="text-sm font-semibold text-slate-900">Содержание</p>
          <ol className="mt-3 grid gap-1.5 text-sm text-slate-600 sm:grid-cols-2">
            {contents.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 space-y-12">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-classic text-[1.375rem] font-bold leading-snug text-slate-900">
                {section.title}
              </h2>
              <div className="mt-3 space-y-3">
                {section.body.map((paragraph, index) => (
                  <p key={index} className="text-[15px] leading-[1.7] text-slate-700">
                    {paragraph}
                  </p>
                ))}
              </div>
              {section.table && <DataTable name={section.table as TableName} />}
              {section.list && (
                <ul className="mt-3 space-y-2 text-[15px] leading-[1.7] text-slate-700">
                  {({ security, rights } as Record<string, readonly string[]>)[section.list].map(
                    (item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-folio-400" />
                        <span>{item}</span>
                      </li>
                    ),
                  )}
                </ul>
              )}
              {section.extra && (
                <div className="mt-4 space-y-3">
                  {section.extra.map((paragraph, index) => (
                    <p key={index} className="text-[15px] leading-[1.7] text-slate-700">
                      {paragraph}
                    </p>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>

        <div className="mt-14 rounded-3xl border border-slate-200/80 bg-slate-50/60 p-6">
          <p className="text-sm font-semibold text-slate-900">Уведомление о файлах cookie</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Мы не используем рекламные и сторонние аналитические трекеры, поэтому уведомление носит
            информационный характер: отказ от него не ограничивает работу сервиса. Кнопка ниже
            сбрасывает отметку о прочтении, чтобы увидеть плашку ещё раз.
          </p>
          <button
            type="button"
            onClick={() => {
              resetStorageNotice();
              setReset(true);
            }}
            className="mt-4 min-h-11 cursor-pointer rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          >
            Показать уведомление снова
          </button>
          {reset && (
            <p className="mt-3 text-sm text-emerald-700" role="status">
              Готово, уведомление появится при следующем открытии сайта.
            </p>
          )}
        </div>

        <div className="mt-10 border-t border-slate-200/80 pt-6 text-sm text-slate-500">
          <p>
            {operator.company}, <span className="whitespace-nowrap">ИНН {operator.inn}</span>,{' '}
            <span className="whitespace-nowrap">КПП {operator.kpp}</span>,{' '}
            <span className="whitespace-nowrap">ОГРН {operator.ogrn}</span>
          </p>
          <p className="mt-1">{operator.address}</p>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <a
              href={`mailto:${operator.email}`}
              className="whitespace-nowrap text-slate-700 hover:underline"
            >
              {operator.email}
            </a>
            {operator.phones.map((phone, index) => (
              <a
                key={operator.phoneHrefs[index]}
                href={operator.phoneHrefs[index]}
                className="text-slate-700 hover:underline"
              >
                {phone}
              </a>
            ))}
            <a
              href="https://laba-laba.ru/"
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-slate-700 hover:underline"
            >
              © laba
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
