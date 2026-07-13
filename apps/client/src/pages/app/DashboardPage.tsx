import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useDeleteDocumentMutation,
  useListDocumentsQuery,
  useListProjectsQuery,
  isDocumentReviewStatus,
  getVersionListStatusLabel,
} from '@folio-mind/store';
import { DocumentReviewStatusBadge } from '../../components/documents/DocumentReviewStatusControl.js';
import { DeleteDocumentButton } from '../../components/documents/DeleteDocumentButton.js';
import { DocumentDragHandle } from '../../components/documents/DocumentDragHandle.js';
import { DocumentUploadZone } from '../../components/documents/DocumentUploadZone.js';
import { ProjectDropTarget } from '../../components/projects/ProjectDropTarget.js';
import { hasUserSourceDocx } from '../../lib/documents/sourceDocx.js';
import { useAppSelector } from '../../hooks/index.js';

function getDisplayStatus(status: string): string {
  return getVersionListStatusLabel(status);
}

export function DashboardPage() {
  const [filterProjectId, setFilterProjectId] = useState<string>('');
  const [draggingDocumentId, setDraggingDocumentId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const uploadState = useAppSelector((s) => s.backgroundUpload);
  const uploadActive = uploadState.active && uploadState.kind === 'dashboard';
  const { data: list, refetch } = useListDocumentsQuery({
    limit: 20,
    ...(filterProjectId ? { projectId: filterProjectId } : {}),
  });
  const { data: projects } = useListProjectsQuery();
  const [deleteDocument] = useDeleteDocumentMutation();

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Документы</h1>
        <div className="flex flex-wrap items-center gap-2">
          <label
            className="flex items-center gap-2 text-sm text-slate-600"
            title="Фильтр списка и проект для новых загрузок"
          >
            <span className="sr-only sm:not-sr-only">Проект</span>
            <select
              value={filterProjectId}
              onChange={(e) => setFilterProjectId(e.target.value)}
              className={`select-control max-w-[12rem] truncate px-2 py-1.5 text-sm ${filterProjectId ? 'select-control--active' : ''}`}
              title={
                filterProjectId
                  ? projects?.items.find((p) => p.id === filterProjectId)?.name
                  : 'Все документы'
              }
            >
              <option value="">Все документы</option>
              {projects?.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <Link
            to="/app/projects"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Проекты
          </Link>
        </div>
      </div>

      <DocumentUploadZone
        className="mt-6 sm:mt-8"
        projectId={filterProjectId || undefined}
      />

      {draggingDocumentId && (projects?.items.length ?? 0) > 0 && (
        <div className="mt-6 rounded-xl border border-folio-200 bg-folio-50/60 px-4 py-3">
          <p className="mb-2 text-sm font-medium text-folio-900">Отпустите документ на проект</p>
          <div className="flex flex-wrap gap-2">
            <ProjectDropTarget
              projectId={null}
              projectName="Без проекта"
              onAssigned={() => {
                setDraggingDocumentId(null);
                void refetch();
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
            >
              Без проекта
            </ProjectDropTarget>
            {projects?.items.map((project) => (
              <ProjectDropTarget
                key={project.id}
                projectId={project.id}
                projectName={project.name}
                onAssigned={() => {
                  setDraggingDocumentId(null);
                  void refetch();
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
              >
                {project.name}
              </ProjectDropTarget>
            ))}
          </div>
        </div>
      )}

      <ul className="mt-8 space-y-3 sm:mt-10">
        <p className="text-xs text-slate-500">
          У документа слева есть ⠿ — перетащите его на проект, не загружая файл повторно.
        </p>
        {list?.items.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 hover:border-folio-300 sm:pr-2 sm:pl-0 sm:py-0"
          >
            <DocumentDragHandle
              documentId={doc.id}
              title={doc.title}
              onDragStateChange={(dragging) => setDraggingDocumentId(dragging ? doc.id : null)}
            />
            <Link
              to={`/app/documents/${doc.id}`}
              className="min-w-0 flex-1 px-2 py-2 sm:px-4 sm:py-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium text-slate-900">{doc.title}</span>
                {hasUserSourceDocx(doc.latestVersion?.sourceDocxKey) && (
                  <span
                    className="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200/80"
                    title="К документу прикреплён исходный DOCX"
                  >
                    + DOCX
                  </span>
                )}
                {isDocumentReviewStatus(doc.reviewStatus) && doc.reviewStatus !== 'draft' && (
                  <DocumentReviewStatusBadge status={doc.reviewStatus} />
                )}
                {doc.projectName && (
                  <Link
                    to={doc.projectId ? `/app/projects/${doc.projectId}` : '/app/projects'}
                    className="shrink-0 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-800 hover:bg-violet-100/80"
                    title={`Проект: ${doc.projectName}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {`Проект: ${doc.projectName}`}
                  </Link>
                )}
              </div>
              {doc.latestVersion && (
                <span className="mt-0.5 block text-xs text-slate-400 sm:mt-1">
                  {getDisplayStatus(doc.latestVersion.status)}
                </span>
              )}
            </Link>
            <DeleteDocumentButton
              title={`Удалить документ «${doc.title}»`}
              variant="list"
              onClick={async () => {
                if (
                  !window.confirm(
                    `Удалить документ «${doc.title}»?\n\nPDF и все версии будут удалены без восстановления.`,
                  )
                ) {
                  return;
                }
                try {
                  await deleteDocument(doc.id).unwrap();
                  await refetch();
                } catch (e) {
                  const msg = e instanceof Error ? e.message : 'Ошибка при удалении';
                  setListError(msg);
                }
              }}
            />
          </li>
        ))}
        {list?.items.length === 0 && !uploadActive && (
          <li className="text-sm text-slate-400">Пока нет документов</li>
        )}
        {listError && <li className="text-sm text-red-600">{listError}</li>}
      </ul>
    </div>
  );
}
