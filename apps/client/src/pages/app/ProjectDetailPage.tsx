import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  isDocumentReviewStatus,
  useDeleteDocumentMutation,
  useGetProjectQuery,
  useListDocumentsQuery,
  useUpdateDocumentProjectMutation,
  getVersionListStatusLabel,
} from '@folio-mind/store';
import { DocumentReviewStatusBadge } from '../../components/documents/DocumentReviewStatusControl.js';
import { DeleteDocumentButton } from '../../components/documents/DeleteDocumentButton.js';
import { DocumentUploadZone } from '../../components/documents/DocumentUploadZone.js';
import { ProjectRenameControl } from '../../components/projects/ProjectRenameControl.js';
import { ProjectDropTarget } from '../../components/projects/ProjectDropTarget.js';
import { ProjectAccessPanel } from '../../components/projects/ProjectAccessPanel.js';
import { DocumentDragHandle } from '../../components/documents/DocumentDragHandle.js';
import { hasUserSourceDocx } from '../../lib/documents/sourceDocx.js';
import { useAppSelector } from '../../hooks/index.js';

function getDisplayStatus(status: string): string {
  return getVersionListStatusLabel(status);
}

export function ProjectDetailPage() {
  const { projectId = '' } = useParams();
  const {
    data,
    refetch,
    isLoading,
    error: loadError,
  } = useGetProjectQuery(projectId, {
    skip: !projectId,
  });
  const { data: allDocuments } = useListDocumentsQuery({ limit: 50 });
  const [deleteDocument] = useDeleteDocumentMutation();
  const [updateDocumentProject, { isLoading: detaching }] = useUpdateDocumentProjectMutation();
  const [localError, setLocalError] = useState<string | null>(null);
  const uploadState = useAppSelector((s) => s.backgroundUpload);
  const active = uploadState.active && uploadState.kind === 'dashboard';
  const uploadWasActiveRef = useRef(false);

  useEffect(() => {
    if (active) {
      uploadWasActiveRef.current = true;
      return;
    }
    if (uploadWasActiveRef.current) {
      uploadWasActiveRef.current = false;
      void refetch();
    }
  }, [active, refetch]);

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-500">Загрузка…</div>;
  }

  if (loadError || !data) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">Проект не найден</p>
        <Link
          to="/app/projects"
          className="mt-2 inline-block text-sm text-folio-600 hover:underline"
        >
          ← К проектам
        </Link>
      </div>
    );
  }

  const { project, documents } = data;
  const attachableDocuments =
    allDocuments?.items.filter((doc) => doc.projectId !== project.id) ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          to="/app/projects"
          className="text-sm text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          ← Проекты
        </Link>
        <ProjectRenameControl
          projectId={project.id}
          name={project.name}
          variant="header"
          onRenamed={() => void refetch()}
        />
      </div>

      <ProjectDropTarget
        projectId={project.id}
        projectName={project.name}
        onAssigned={() => void refetch()}
        className="mb-8 rounded-2xl border border-dashed border-folio-300 bg-folio-50/40 px-5 py-4 text-center sm:px-6"
        activeClassName="ring-2 ring-folio-400 bg-folio-50"
      >
        <p className="text-sm font-medium text-folio-900">Перетащите сюда существующий документ</p>
        <p className="mt-1 text-xs text-slate-500">
          Перетащите документ из списка ниже или с главной страницы (⠿ у строки документа).
        </p>
      </ProjectDropTarget>

      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">Доступ команды проекта</h2>
        <div className="mt-3">
          <ProjectAccessPanel projectId={project.id} />
        </div>
      </div>

      {attachableDocuments.length > 0 && (
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">Привязать существующий документ</h2>
          <p className="mt-1 text-xs text-slate-500">
            Возьмите документ за ⠿ и отпустите в зону выше — повторная загрузка не нужна.
          </p>
          <ul className="mt-3 space-y-2">
            {attachableDocuments.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-2 py-1.5"
              >
                <DocumentDragHandle documentId={doc.id} title={doc.title} />
                <Link
                  to={`/app/documents/${doc.id}`}
                  className="min-w-0 flex-1 truncate text-sm text-slate-800 hover:text-folio-700"
                >
                  {doc.title}
                </Link>
                {doc.projectName && (
                  <span className="shrink-0 text-[11px] text-slate-500">{doc.projectName}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <DocumentUploadZone
        className="mb-8"
        projectId={projectId}
        title="Загрузить документ в этот проект"
        subtitle="PDF или DOCX — как на главной странице. После выбора PDF можно добавить исходный Word."
      />

      {localError && <p className="mb-4 text-sm text-red-600">{localError}</p>}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Документы ({documents.length})
      </h2>
      <ul className="space-y-3">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 sm:pr-2 sm:pl-0 sm:py-0"
          >
            <Link
              to={`/app/documents/${doc.id}`}
              className="min-w-0 flex-1 px-2 py-2 sm:px-4 sm:py-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium text-slate-900">{doc.title}</span>
                {hasUserSourceDocx(doc.latestVersion?.sourceDocxKey) && (
                  <span className="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200/80">
                    + DOCX
                  </span>
                )}
                {isDocumentReviewStatus(doc.reviewStatus) && doc.reviewStatus !== 'draft' && (
                  <DocumentReviewStatusBadge status={doc.reviewStatus} />
                )}
              </div>
              {doc.latestVersion && (
                <span className="mt-0.5 block text-xs text-slate-400">
                  {getDisplayStatus(doc.latestVersion.status)}
                </span>
              )}
            </Link>
            <button
              type="button"
              title="Отвязать от проекта"
              disabled={detaching}
              className="shrink-0 cursor-pointer rounded-lg px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              onClick={async () => {
                if (
                  !window.confirm(
                    `Отвязать «${doc.title}» от проекта «${project.name}»?\n\nДокумент останется на главной странице.`,
                  )
                ) {
                  return;
                }
                setLocalError(null);
                try {
                  await updateDocumentProject({ documentId: doc.id, projectId: null }).unwrap();
                  await refetch();
                } catch (e) {
                  const msg = e instanceof Error ? e.message : 'Не удалось отвязать документ';
                  setLocalError(msg);
                }
              }}
            >
              Отвязать
            </button>
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
                  setLocalError(msg);
                }
              }}
            />
          </li>
        ))}
        {documents.length === 0 && !active && (
          <li className="text-sm text-slate-400">В проекте пока нет документов</li>
        )}
      </ul>
    </div>
  );
}
