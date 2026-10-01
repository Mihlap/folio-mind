import { Link, useParams } from 'react-router-dom';
import { StandalonePresentationEditor } from '../../components/presentations/StandalonePresentationEditor.js';
import { FeatureHelpButton } from '../../components/ui/FeatureHelp.js';

export function PresentationEditorPage() {
  const { id } = useParams<{ id: string }>();
  const presentationId = id && id !== 'new' ? id : undefined;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
            {presentationId ? 'Презентация' : 'Новая презентация'}
          </h1>
          <FeatureHelpButton title="Редактор презентации">
            <p>
              Собирайте слайды с чистого листа: пустые слайды и файлы из медиатеки. Заголовки,
              тезисы и заметки редактируются под выбранным слайдом.
            </p>
            <p>
              «Экспорт в PDF» создаёт отдельный документ-черновик — готовый PDF появится в списке
              документов.
            </p>
          </FeatureHelpButton>
        </div>
        <Link
          to="/app/presentations"
          className="text-sm text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          ← К презентациям
        </Link>
      </div>

      <StandalonePresentationEditor presentationId={presentationId} />
    </div>
  );
}
