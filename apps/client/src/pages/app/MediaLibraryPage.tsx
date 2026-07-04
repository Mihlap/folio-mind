import { Link } from 'react-router-dom';
import { FeatureHelpButton } from '../../components/ui/FeatureHelp.js';
import { MediaLibraryPanel } from '../../components/documents/MediaLibraryPanel.js';

export function MediaLibraryPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Медиатека</h1>
          <FeatureHelpButton title="Раздел «Медиатека»">
            <p>
              Общее хранилище изображений вашей организации: логотипы, рендеры, фото для буклетов и
              макетов.
            </p>
            <p>
              Загруженные файлы можно вставлять в макет PDF на странице документа — «Инструменты»
              → «Макет» → «В макет» у нужного превью.
            </p>
            <p>
              Лимиты: до 25 МБ на файл, до 10 ГБ на организацию. Файлы больше 2 МБ или с длинной
              стороной более 4096 px сжимаются в браузере. Максимальный размер исходника — 6000 px
              по длинной стороне.
            </p>
            <p>Файлы без привязки к документу видны во всех проектах аккаунта.</p>
          </FeatureHelpButton>
        </div>
        <Link
          to="/app"
          className="text-sm text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          ← К документам
        </Link>
      </div>

      <MediaLibraryPanel />
    </div>
  );
}
