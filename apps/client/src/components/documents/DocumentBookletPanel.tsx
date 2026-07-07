import type { LayoutEditorState } from '../../hooks/useLayoutEditor.js';
import { BookletStepHeading } from './BookletStepHeading.js';
import { DocumentBookletAiPanel } from './DocumentBookletAiPanel.js';
import { DocumentBookletExportPanel } from './DocumentBookletExportPanel.js';

type Props = {
  documentId: string;
  documentTitle: string;
  projectId?: string | null;
  projectName?: string | null;
  versionReady: boolean;
  layout?: LayoutEditorState;
  versionId: string;
  pageCount: number;
  viewerPage: number;
};

export function DocumentBookletPanel({
  documentId,
  documentTitle,
  projectId,
  projectName,
  versionReady,
  layout,
  versionId,
  pageCount,
  viewerPage,
}: Props) {
  return (
    <div className="space-y-5 text-sm text-slate-700">
      <p className="text-xs leading-relaxed text-slate-500">
        Один сценарий для заказчика: подготовьте подписи и материалы, проверьте качество для печати,
        соберите ZIP с PDF и JPG.
      </p>

      <section className="space-y-3">
        <BookletStepHeading step={1} title="Подготовка" />
        <DocumentBookletAiPanel
          documentId={documentId}
          documentTitle={documentTitle}
          projectId={projectId}
          projectName={projectName}
          versionReady={versionReady}
          layout={layout}
          compact
        />
      </section>

      <DocumentBookletExportPanel
        documentId={documentId}
        versionId={versionId}
        versionReady={versionReady}
        pageCount={pageCount}
        viewerPage={viewerPage}
        compact
      />
    </div>
  );
}
