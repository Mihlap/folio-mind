import { Link } from 'react-router-dom';
import { useHealthQuery } from '@folio-mind/store';
import { Button } from '../components/Button';

export function LandingPage() {
  const { data: health } = useHealthQuery();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-2xl text-folio-950">Folio Mind</span>
        <div className="flex gap-3">
          <Link to="/login">
            <Button variant="ghost">Вход</Button>
          </Link>
          <Link to="/register">
            <Button>Начать</Button>
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-24 pt-16 text-center">
        <p className="mb-4 inline-block rounded-full bg-folio-100 px-4 py-1 text-sm font-medium text-folio-700">
          PDF + ИИ · договоры и буклеты
        </p>
        <h1 className="font-display text-5xl leading-tight text-slate-900 md:text-6xl">
          Документы, которые
          <br />
          <span className="text-folio-600">понимают контекст</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          Просмотр, версии, проверка рисков и совместная работа — без цикла «скачай, сожми,
          перекинь». Для юристов, архитекторов и команд, которые живут в PDF.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link to="/register">
            <Button size="lg">Создать рабочее пространство</Button>
          </Link>
          <Link to="/login">
            <Button size="lg" variant="secondary">
              Уже есть аккаунт
            </Button>
          </Link>
        </div>
        {health && (
          <p className="mt-8 text-xs text-slate-400">
            API: {health.status} · {new Date(health.timestamp).toLocaleTimeString('ru')}
          </p>
        )}
      </section>

      <section className="border-t border-slate-200 bg-white py-20">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 md:grid-cols-3">
          {[
            {
              title: 'ИИ-проверка договоров',
              text: 'Риски, противоречия и чат по документу с опорой на текст файла.',
            },
            {
              title: 'Буклеты для архитекторов',
              text: 'Макет изображений, сжатие и согласование с заказчиком по ссылке.',
            },
            {
              title: 'Быстро и предсказуемо',
              text: 'Тяжёлые операции в фоне, файлы в S3, API не блокируется.',
            },
          ].map((card) => (
            <article
              key={card.title}
              className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{card.text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
