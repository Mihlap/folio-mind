import { useEffect, useRef, useState } from 'react';
import {
  useApplyAcceptedSuggestionsMutation,
  useApplyEditsFinalMutation,
  useCreateAnnotationMutation,
  useDeleteAnnotationMutation,
  useExportHighlightDocxMutation,
  useGetDocumentQuery,
  useGetJobQuery,
  useLazyGetDownloadUrlQuery,
  useLazyGetHighlightDocxUrlQuery,
  useLazyGetSourceDocxUrlQuery,
  useListAnnotationsQuery,
} from '@folio-mind/store';
import { hasUserSourceDocx } from '../../lib/documents/sourceDocx.js';
import type { ConfidenceLevel } from './DocumentVersionConfidenceBadge.js';

export type EditTextInjection = {
  key: number;
  text: string;
  coords?: {
    x?: number;
    y?: number;
  };
};

export type DocumentAnnotationsRootProps = {
  documentId: string;
  versionId: string;
  viewerPage: number;
  versionReady: boolean;
  onGoToPage: (page: number, annotationId?: string) => void;
  onOpenAcceptedEdit: (page: number, annotationId: string) => void;
  onOpenAllAcceptedEdits: () => void;
  onSelectVersion: (versionId: string) => void;
  focusedAnnotationId?: string | null;
  editTextInjection?: EditTextInjection | null;
};

export function useDocumentAnnotationsPanel({
  documentId,
  versionId,
  viewerPage,
  versionReady,
  onGoToPage,
  onOpenAcceptedEdit,
  onOpenAllAcceptedEdits,
  onSelectVersion,
  focusedAnnotationId = null,
  editTextInjection = null,
}: DocumentAnnotationsRootProps) {
  const { data, refetch } = useListAnnotationsQuery(
    { documentId, versionId },
    { skip: !versionId },
  );
  const [createAnnotation, { isLoading: creating }] = useCreateAnnotationMutation();
  const [deleteAnnotation] = useDeleteAnnotationMutation();
  const [applyAccepted, { isLoading: applying }] = useApplyAcceptedSuggestionsMutation();
  const [applyEditsFinal, { isLoading: applyingFinal }] = useApplyEditsFinalMutation();
  const [exportHighlightDocx, { isLoading: exportingHighlight }] = useExportHighlightDocxMutation();
  const { data: docData, refetch: refetchDocument } = useGetDocumentQuery(documentId, {
    skip: !documentId,
  });
  const [fetchDownloadUrl] = useLazyGetDownloadUrlQuery();
  const [fetchDocxUrl] = useLazyGetSourceDocxUrlQuery();
  const [fetchHighlightDocxUrl] = useLazyGetHighlightDocxUrlQuery();
  const [content, setContent] = useState('');
  const [editBefore, setEditBefore] = useState('');
  const [editAfter, setEditAfter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [applyJobId, setApplyJobId] = useState<string | null>(null);
  const [exportHighlightJobId, setExportHighlightJobId] = useState<string | null>(null);
  const [pollApply, setPollApply] = useState(false);
  const [pollExportHighlight, setPollExportHighlight] = useState(false);
  const [applyHint, setApplyHint] = useState<string | null>(null);
  const [applyEditResults, setApplyEditResults] = useState<
    Array<{ page: number; originalText: string; suggestion: string; status: string }>
  >([]);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const pendingCoordsRef = useRef<{
    x?: number;
    y?: number;
  } | null>(null);
  const { data: applyJob } = useGetJobQuery(applyJobId!, {
    skip: !applyJobId,
    pollingInterval: pollApply ? 2000 : 0,
  });
  const { data: exportHighlightJob } = useGetJobQuery(exportHighlightJobId!, {
    skip: !exportHighlightJobId,
    pollingInterval: pollExportHighlight ? 2000 : 0,
  });

  useEffect(() => {
    setContent('');
    setEditBefore('');
    setEditAfter('');
    setError(null);
    setApplyJobId(null);
    setExportHighlightJobId(null);
    setPollApply(false);
    setPollExportHighlight(false);
    setApplyHint(null);
    setApplyEditResults([]);
  }, [versionId]);

  useEffect(() => {
    if (!applyJob) return;
    if (applyJob.status === 'completed') {
      setPollApply(false);
      const p = applyJob.payload as Record<string, unknown> | null;
      const editResults = Array.isArray(p?.editResults)
        ? (p!.editResults as Array<{
            page: number;
            originalText: string;
            suggestion: string;
            status: string;
          }>)
        : [];
      setApplyEditResults(editResults);
      const applied = typeof p?.applied === 'number' ? p.applied : null;
      const failed = typeof p?.failed === 'number' ? p.failed : null;
      const method = typeof p?.method === 'string' ? p.method : null;
      if (p?.status === 'success') {
        const methodNote =
          method === 'docx-converted'
            ? ' (PDF пересобран из Word)'
            : method === 'docx'
              ? ' (PDF пересобран из исходного DOCX)'
              : method === 'pdf-overlay'
                ? ' (наложение на PDF)'
                : '';
        setApplyHint(
          applied != null
            ? `Применено ${applied} правок${methodNote}. Новая версия готова.`
            : p?.method === 'docx-fallback-overlay'
              ? String(
                  p.message ??
                    'Текст из PDF не совпал с Word — правки наложены на PDF. Для идеального качества сверьте «было» с DOCX.',
                )
              : 'Новая версия с правками готова!',
        );
      } else if (p?.status === 'docx_only') {
        setApplyHint(String(p.message ?? 'Правки применены — DOCX готов, PDF не создан.'));
      } else if (p?.status === 'partial' || p?.method === 'docx-fallback-overlay') {
        setApplyHint(
          String(
            p.message ??
              (applied === 0
                ? 'Правки не применились — проверьте поле «было» или загрузите DOCX.'
                : `Применено ${applied ?? '?'} из ${(applied ?? 0) + (failed ?? 0)} правок.`),
          ),
        );
      } else {
        setApplyHint('Новая версия с правками готова — откройте её в списке версий слева.');
      }
      void refetchDocument();
    }
    if (applyJob.status === 'failed') {
      setPollApply(false);
      setApplyHint(
        typeof applyJob.payload === 'object' && applyJob.payload && 'error' in applyJob.payload
          ? String((applyJob.payload as { error?: string }).error)
          : 'Не удалось собрать PDF с правками',
      );
    }
  }, [applyJob, refetchDocument]);

  useEffect(() => {
    if (!exportHighlightJob) return;
    if (exportHighlightJob.status === 'completed') {
      setPollExportHighlight(false);
      void (async () => {
        try {
          const { url } = await fetchHighlightDocxUrl({ documentId, versionId }).unwrap();
          window.open(url, '_blank', 'noopener,noreferrer');
          setApplyHint('DOCX с подсветкой правок готов к скачиванию.');
        } catch {
          setError('DOCX сформирован, но ссылка для скачивания недоступна');
        }
      })();
    }
    if (exportHighlightJob.status === 'failed') {
      setPollExportHighlight(false);
      setError(
        typeof exportHighlightJob.payload === 'object' &&
          exportHighlightJob.payload &&
          'error' in exportHighlightJob.payload
          ? String((exportHighlightJob.payload as { error?: string }).error)
          : 'Не удалось экспортировать DOCX с подсветкой',
      );
    }
  }, [exportHighlightJob, documentId, versionId, fetchHighlightDocxUrl]);

  useEffect(() => {
    if (!focusedAnnotationId) return;
    const el = itemRefs.current.get(focusedAnnotationId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [focusedAnnotationId]);

  useEffect(() => {
    if (!editTextInjection) return;
    setEditBefore(editTextInjection.text);
    if (editTextInjection.coords) {
      pendingCoordsRef.current = editTextInjection.coords;
    }
    setError(null);
  }, [editTextInjection?.key, editTextInjection?.text, editTextInjection?.coords]);

  const items = data?.items ?? [];
  const userComments = items.filter((a) => a.kind === 'comment' || a.kind === 'highlight');
  const acceptedEdits = items.filter((a) => a.kind === 'accepted_edit');

  function consumeCoords(): { x?: number; y?: number } {
    const coords = pendingCoordsRef.current;
    pendingCoordsRef.current = null;
    return coords ?? {};
  }

  async function handleAddComment() {
    const text = content.trim();
    if (!text) return;
    setError(null);
    try {
      const coords = consumeCoords();
      await createAnnotation({
        documentId,
        versionId,
        page: viewerPage,
        content: text,
        kind: 'comment',
        ...coords,
      }).unwrap();
      setContent('');
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить заметку');
    }
  }

  async function handleAddManualEdit() {
    const before = editBefore.trim();
    const after = editAfter.trim();
    if (!before || !after) return;
    setError(null);
    try {
      const coords = consumeCoords();
      await createAnnotation({
        documentId,
        versionId,
        page: viewerPage,
        content: after,
        quote: before,
        kind: 'accepted_edit',
        ...coords,
      }).unwrap();
      setEditBefore('');
      setEditAfter('');
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить правку');
    }
  }

  const sourceVersion = docData?.versions.find((v) => v.id === versionId);
  const hasSourceDocx = hasUserSourceDocx(sourceVersion?.sourceDocxKey);
  const applyPayload = applyJob?.payload as Record<string, unknown> | null;
  const applyConfidenceLevel: ConfidenceLevel | null =
    applyPayload?.confidenceLevel === 'green' ||
    applyPayload?.confidenceLevel === 'yellow' ||
    applyPayload?.confidenceLevel === 'red'
      ? applyPayload.confidenceLevel
      : null;
  const applyConfidenceScore =
    typeof applyPayload?.confidenceScore === 'number' ? applyPayload.confidenceScore : null;
  const applyConfidenceSummary =
    typeof applyPayload?.confidenceSummary === 'string' ? applyPayload.confidenceSummary : null;

  async function handleExportHighlightDocx() {
    setError(null);
    setApplyHint(null);
    try {
      const result = await exportHighlightDocx({ documentId, versionId }).unwrap();
      setExportHighlightJobId(result.operationJobId);
      setPollExportHighlight(true);
      setApplyHint('Готовим DOCX с подсветкой правок…');
    } catch (err) {
      const msg =
        typeof err === 'object' && err && 'data' in err
          ? typeof (err as { data: unknown }).data === 'string'
            ? (err as { data: string }).data
            : 'Не удалось запустить экспорт DOCX'
          : 'Не удалось запустить экспорт DOCX';
      setError(msg);
    }
  }

  async function handleApplyFinal() {
    setError(null);
    setApplyHint(null);
    try {
      const result = await applyEditsFinal({ documentId, versionId }).unwrap();
      setApplyJobId(result.operationJobId);
      setPollApply(true);
      onSelectVersion(result.versionId);
      setApplyHint(`Версия ${result.version} создаётся — PDF появится через несколько секунд.`);
    } catch (err) {
      const msg =
        typeof err === 'object' && err && 'data' in err
          ? typeof (err as { data: unknown }).data === 'string'
            ? (err as { data: string }).data
            : 'Не удалось применить правки'
          : 'Не удалось применить правки';
      setError(msg);
    }
  }

  function getApplyTargetVersionId(): string | undefined {
    const p = applyJob?.payload as Record<string, unknown> | null;
    return (p?.targetVersionId as string) ?? undefined;
  }

  async function handleDownloadPdf() {
    const targetId = getApplyTargetVersionId();
    if (!targetId) return;
    try {
      const { url } = await fetchDownloadUrl({ documentId, versionId: targetId }).unwrap();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Не удалось скачать PDF');
    }
  }

  async function handleDownloadDocx() {
    const targetId = getApplyTargetVersionId();
    if (!targetId) return;
    try {
      const { url } = await fetchDocxUrl({ documentId, versionId: targetId }).unwrap();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Не удалось скачать DOCX');
    }
  }

  async function handleApplyPdf() {
    setError(null);
    setApplyHint(null);
    try {
      const result = await applyAccepted({ documentId, versionId }).unwrap();
      setApplyJobId(result.operationJobId);
      setPollApply(true);
      onSelectVersion(result.versionId);
      setApplyHint(`Создана версия ${result.version}. Собираем PDF…`);
    } catch (err) {
      const msg =
        typeof err === 'object' && err && 'data' in err
          ? typeof (err as { data: unknown }).data === 'string'
            ? (err as { data: string }).data
            : 'Не удалось собрать PDF с правками'
          : 'Не удалось собрать PDF с правками';
      setError(msg);
    }
  }

  return {
    documentId,
    versionId,
    viewerPage,
    versionReady,
    focusedAnnotationId,
    onGoToPage,
    onOpenAcceptedEdit,
    onOpenAllAcceptedEdits,
    creating,
    applying,
    applyingFinal,
    exportingHighlight,
    pollApply,
    pollExportHighlight,
    content,
    setContent,
    editBefore,
    setEditBefore,
    editAfter,
    setEditAfter,
    error,
    applyHint,
    applyJob,
    applyEditResults,
    applyConfidenceLevel,
    applyConfidenceScore,
    applyConfidenceSummary,
    hasSourceDocx,
    userComments,
    acceptedEdits,
    itemRefs,
    deleteAnnotation,
    refetch,
    handleAddComment,
    handleAddManualEdit,
    handleExportHighlightDocx,
    handleApplyFinal,
    handleDownloadPdf,
    handleDownloadDocx,
    handleApplyPdf,
  };
}

export type DocumentAnnotationsController = ReturnType<typeof useDocumentAnnotationsPanel>;
