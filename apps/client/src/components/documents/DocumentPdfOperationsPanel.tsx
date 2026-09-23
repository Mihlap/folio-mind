import { useEffect, useMemo, useRef, useState } from 'react';
import {
  OPTIMIZE_PRESET_INFO,
  OPTIMIZE_PRESETS,
  toUserErrorMessage,
  useGetJobQuery,
  useGetVersionPreviewsQuery,
  useMergeVersionsMutation,
  useOptimizePdfMutation,
  useSplitPagesMutation,
  type OptimizePreset,
  HINT_OPTIMIZE_NEW_VERSION,
  HINT_OPTIMIZE_REQUIREMENTS,
  MSG_OPERATION_STARTING,
  MSG_OPTIMIZE_RUNNING,
  MSG_OPTIMIZE_DONE_SUFFIX,
  MSG_PROCESSING_WAIT,
  formatOptimizeWaitHint,
  msgNewVersionStarted,
  msgReplaceCurrentStarted,
  readJobProgressLabel,
} from '@folio-mind/store';
import type { OperationSaveMode } from './OperationSaveModeSelect.js';
import { estimateOptimizeSize, formatFileSize, formatOptimizeSizeRange } from '@folio-mind/store';
import type { DocumentVersionItem } from './DocumentVersionsPanel.js';
import { FeatureHelpActionButton, FeatureHelpButton } from '../ui/FeatureHelp.js';
import { reportActionBtnPrimary, reportActionsColumnClass } from '../ui/FeatureHelp.styles.js';
import { ToolAccordionSection } from '../ui/ToolAccordionSection.js';
import { TOOL_SECTION_IDS, type ToolSectionId } from '../ui/ToolAccordionSection.ids.js';
import { DocumentPageOrderPanel } from './DocumentPageOrderPanel.js';
import { DocumentVersionDiffPanel } from './DocumentVersionDiffPanel.js';
import {
  DocumentAnnotationsControllerProvider,
  DocumentAnnotationsPanel,
} from './DocumentAnnotationsPanel.js';
import { DocumentEditsApplyActions } from './DocumentEditsApplyActions.js';

import { DocumentLayoutPanel } from './DocumentLayoutPanel.js';
import { DocumentInternalMarkupPanel } from './DocumentInternalMarkupPanel.js';
import { DocumentSharePanel } from './DocumentSharePanel.js';
import { DocumentAccessPanel } from './DocumentAccessPanel.js';
import { DocumentBookletPanel } from './DocumentBookletPanel.js';
import { DocumentGuestCommentsPanel } from './DocumentGuestCommentsPanel.js';
import type { EditTextInjection } from './useDocumentAnnotationsPanel.js';
import type { LayoutEditorState } from '../../hooks/useLayoutEditor.js';
import type { DocumentReviewStatus, ShareLinkItem } from '@folio-mind/store';
import { roleHasCapability } from '@folio-mind/store';
import { useDocumentAnnotationsPanel } from './useDocumentAnnotationsPanel.js';
import { DocumentVersionExportPanel } from './DocumentVersionExportPanel.js';
import { DocumentVersionContextBanner } from './DocumentVersionContextBanner.js';
import { DocumentToolScenarioBar } from './DocumentToolScenarioBar.js';
import { DocumentVersionCreatedNotice } from './DocumentVersionCreatedNotice.js';
import type { VersionCreatedNotice } from '../../hooks/useVersionCreatedNotice.js';
import {
  buildScenarioSteps,
  buildVersionWorkflowContext,
  inferDefaultToolScenario,
  isToolGroupVisible,
  readStoredToolScenario,
  writeStoredToolScenario,
  type ToolScenario,
} from '../../lib/documents/version-workflow.js';
import {
  canUseDocumentToolSection,
  normalizeDocumentRole,
  ROLE_RESTRICTION_HINT,
} from '../../lib/documents/document-ui-permissions.js';
import type { PdfActionHintKind } from './PdfActionHintBanner.js';
function parsePageNumbers(input: string, maxPage: number): number[] | string {
  const parts = input
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return 'Укажите номера страниц';
  const pages: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1) return `Некорректный номер: ${part}`;
    if (n > maxPage) return `Страница ${n} больше числа страниц (${maxPage})`;
    if (!pages.includes(n)) pages.push(n);
  }
  return pages.sort((a, b) => a - b);
}
function getMutationError(err: unknown): string {
  return toUserErrorMessage(err, 'Не удалось выполнить операцию');
}
type ToolGroupId = 'pdf' | 'layout' | 'approval' | 'edits';
const TOOL_GROUP_IDS: ToolGroupId[] = ['pdf', 'layout', 'approval', 'edits'];
const GROUP_SECTIONS: Record<ToolGroupId, ToolSectionId[]> = {
  pdf: ['optimize', 'split', 'pages', 'merge', 'diff', 'export'],
  layout: ['layout', 'booklet'],
  approval: ['team-access', 'share', 'annotations'],
  edits: ['edits'],
};

function getSectionGroup(sectionId: ToolSectionId): ToolGroupId {
  if (sectionId === 'layout' || sectionId === 'booklet') return 'layout';
  if (sectionId === 'team-access' || sectionId === 'share' || sectionId === 'annotations')
    return 'approval';
  if (sectionId === 'edits') return 'edits';
  return 'pdf';
}

function ToolGroupHeader({
  title,
  description,
  isOpen,
  onToggle,
  disabled = false,
  disabledReason,
}: {
  title: string;
  description: string;
  isOpen: boolean;
  onToggle: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <div className="pt-1 first:pt-0">
      <div className="rounded-lg border border-slate-200 bg-slate-50/70">
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          aria-expanded={isOpen}
          className="flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-100/80 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
        >
          <span className="mt-0.5 shrink-0 text-[10px] text-slate-400" aria-hidden>
            {isOpen ? '▼' : '▶'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {title}
            </p>
            <p className="hidden text-[11px] leading-snug text-slate-500 sm:block">{description}</p>
            {disabled && disabledReason && (
              <p className="mt-1 text-[10px] leading-snug text-amber-700">{disabledReason}</p>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
type Props = {
  documentId: string;
  versions: DocumentVersionItem[];
  activeVersion: DocumentVersionItem | undefined;
  viewerPage: number;
  onSelectVersion: (versionId: string) => void;
  onGoToPage: (page: number, annotationId?: string) => void;
  focusedAnnotationId?: string | null;
  focusedGuestCommentId?: string | null;
  onOpenAcceptedEdit: (page: number, annotationId: string) => void;
  onOpenAllAcceptedEdits: () => void;
  editTextInjection?: EditTextInjection | null;
  versionReady: boolean;
  embedded?: boolean;
  focusSection?: ToolSectionId | null;
  onFocusSectionHandled?: () => void;
  layout?: LayoutEditorState;
  layoutAddNotice?: string | null;
  layoutPageCount?: number;
  onAddLayoutImages?: (
    files: File[],
    options?: { distributeAcrossPages?: boolean; startPage?: number },
  ) => Promise<void>;
  reviewStatus?: DocumentReviewStatus;
  reviewStatusChangedAt?: string | null;
  documentTitle?: string;
  projectId?: string | null;
  projectName?: string | null;
  shareLinks?: ShareLinkItem[];
  openGuestCommentsCount?: number;
  needsFixMarksCount?: number;
  acceptedEditsCount?: number;
  versionCreatedNotice?: VersionCreatedNotice | null;
  onDismissVersionCreatedNotice?: () => void;
  documentRole?: string | null;
  currentUserId?: string | null;
  onRequestPdfInteraction?: (kind: PdfActionHintKind) => void;
};
export function DocumentPdfOperationsPanel({
  documentId,
  versions,
  activeVersion,
  viewerPage,
  onSelectVersion,
  onGoToPage,
  focusedAnnotationId = null,
  focusedGuestCommentId = null,
  onOpenAcceptedEdit,
  onOpenAllAcceptedEdits,
  editTextInjection = null,
  versionReady,
  embedded = false,
  focusSection = null,
  onFocusSectionHandled,
  layout,
  layoutAddNotice = null,
  layoutPageCount = 0,
  onAddLayoutImages,
  reviewStatus = 'draft',
  reviewStatusChangedAt = null,
  documentTitle = '',
  projectId = null,
  projectName = null,
  shareLinks = [],
  openGuestCommentsCount = 0,
  needsFixMarksCount = 0,
  acceptedEditsCount = 0,
  versionCreatedNotice = null,
  onDismissVersionCreatedNotice,
  documentRole = 'viewer',
  currentUserId = null,
  onRequestPdfInteraction,
}: Props) {
  const accessRole = normalizeDocumentRole(documentRole);
  const canEdit = roleHasCapability(accessRole, 'edit');
  const canComment = roleHasCapability(accessRole, 'comment');
  const restrictionHint = ROLE_RESTRICTION_HINT[accessRole];
  const [expanded, setExpanded] = useState(embedded);
  const [openSections, setOpenSections] = useState<Set<ToolSectionId>>(() => new Set());
  const [openGroups, setOpenGroups] = useState<Set<ToolGroupId>>(() => new Set());
  const [toolScenario, setToolScenario] = useState<ToolScenario>('all');
  const toolScenarioInitializedRef = useRef(false);
  const sectionRefs = useRef<Partial<Record<ToolSectionId, HTMLDivElement | null>>>({});
  const sectionRefCallbacks = useMemo(() => {
    const callbacks = {} as Record<ToolSectionId, (el: HTMLDivElement | null) => void>;
    for (const id of TOOL_SECTION_IDS) {
      callbacks[id] = (el: HTMLDivElement | null) => {
        sectionRefs.current[id] = el;
      };
    }
    return callbacks;
  }, []);
  const [pagesInput, setPagesInput] = useState('');
  const [mergeOrder, setMergeOrder] = useState<string[]>([]);
  const [optimizePreset, setOptimizePreset] = useState<OptimizePreset>('archive');
  const [operationJobId, setOperationJobId] = useState<string | null>(null);
  const [pollOperation, setPollOperation] = useState(false);
  const [targetVersionId, setTargetVersionId] = useState<string | null>(null);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [statusHintVersionId, setStatusHintVersionId] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [splitPages, { isLoading: splitLoading }] = useSplitPagesMutation();
  const [mergeVersions, { isLoading: mergeLoading }] = useMergeVersionsMutation();
  const [optimizePdf, { isLoading: optimizeLoading }] = useOptimizePdfMutation();
  const { data: operationJob } = useGetJobQuery(operationJobId!, {
    skip: !operationJobId,
    pollingInterval: pollOperation ? 2000 : 0,
  });
  const { data: activeVersionMeta } = useGetVersionPreviewsQuery(
    {
      documentId,
      versionId: activeVersion?.id ?? '',
      from: 1,
      to: 1,
    },
    {
      skip: !activeVersion?.id || activeVersion.status === 'pending_upload',
    },
  );
  const targetVersion = useMemo(
    () => (targetVersionId ? versions.find((v) => v.id === targetVersionId) : undefined),
    [targetVersionId, versions],
  );
  const readyVersions = useMemo(() => versions.filter((v) => v.status === 'ready'), [versions]);
  const activeReady = activeVersion?.status === 'ready';
  const isLatestVersion = Boolean(activeVersion && versions[0]?.id === activeVersion.id);
  const effectivePageCount =
    (activeVersion?.pageCount && activeVersion.pageCount > 0
      ? activeVersion.pageCount
      : activeVersionMeta?.pageCount && activeVersionMeta.pageCount > 0
        ? activeVersionMeta.pageCount
        : 0) ?? 0;
  const optimizeRunning = Boolean(
    operationJobId &&
    pollOperation &&
    operationJob &&
    (operationJob.status === 'queued' || operationJob.status === 'processing'),
  );
  const operationPending = splitLoading || mergeLoading || optimizeLoading || optimizeRunning;
  const splitBlockedReason = (() => {
    if (!activeVersion) return 'Выберите версию в списке слева';
    if (activeVersion.status === 'processing') return MSG_PROCESSING_WAIT;
    if (activeVersion.status === 'failed') return 'Версия с ошибкой — удалите или создайте заново';
    if (activeVersion.status === 'pending_upload') return 'Файл не загружен';
    if (!activeReady) return `Статус версии: ${activeVersion.status}`;
    if (operationPending) return 'Дождитесь завершения текущей операции…';
    if (effectivePageCount <= 0) return 'Число страниц неизвестно — обновите страницу';
    return null;
  })();
  useEffect(() => {
    if (!operationJobId || !operationJob) return;
    if (operationJob.status === 'completed') {
      setPollOperation(false);
      if (targetVersion) {
        const payload = operationJob.payload;
        const optimizeMessage =
          typeof payload === 'object' && payload && 'message' in payload
            ? String((payload as { message?: string }).message ?? '')
            : '';
        const savedPct =
          typeof payload === 'object' && payload && 'savedPercent' in payload
            ? Number((payload as { savedPercent?: number }).savedPercent)
            : NaN;
        const outputBytes =
          typeof payload === 'object' && payload && 'outputBytes' in payload
            ? Number((payload as { outputBytes?: number }).outputBytes)
            : NaN;
        const sourceBytes =
          typeof payload === 'object' && payload && 'sourceBytes' in payload
            ? Number((payload as { sourceBytes?: number }).sourceBytes)
            : NaN;
        const sizeNote =
          Number.isFinite(sourceBytes) && Number.isFinite(outputBytes) && outputBytes > 0
            ? ` · ${formatFileSize(sourceBytes)} → ${formatFileSize(outputBytes)}`
            : Number.isFinite(outputBytes) && outputBytes > 0
              ? ` · ${formatFileSize(outputBytes)}`
              : '';
        const savedNote = Number.isFinite(savedPct) && savedPct > 0 ? ` (−${savedPct}%)` : '';
        const detail = optimizeMessage || `Версия ${targetVersion.version} собрана`;
        setStatusHint(`${detail}${sizeNote}${savedNote} — ${MSG_OPTIMIZE_DONE_SUFFIX}`);
        setStatusHintVersionId(targetVersion.id);
      }
    }
    if (operationJob.status === 'failed') {
      setPollOperation(false);
      setOperationJobId(null);
      setTargetVersionId(null);
      const payload = operationJob.payload;
      setOperationError(
        toUserErrorMessage(
          payload && 'error' in payload ? payload.error : undefined,
          'Операция завершилась с ошибкой',
        ),
      );
      setStatusHint(null);
      setStatusHintVersionId(null);
    }
  }, [operationJob, operationJobId, targetVersion]);
  useEffect(() => {
    if (!targetVersion) return;
    if (targetVersion.status === 'ready') {
      setStatusHint(`Версия ${targetVersion.version} готова`);
      setStatusHintVersionId(targetVersion.id);
      onSelectVersion(targetVersion.id);
      setOperationJobId(null);
      setTargetVersionId(null);
      setPollOperation(false);
      const timer = setTimeout(() => setStatusHint(null), 5000);
      return () => clearTimeout(timer);
    }
    if (targetVersion.status === 'failed') {
      setOperationError(
        `Не удалось подготовить версию ${targetVersion.version}. Попробуйте ещё раз или обратитесь к администратору.`,
      );
      setStatusHint(null);
      setStatusHintVersionId(null);
      setOperationJobId(null);
      setTargetVersionId(null);
      setPollOperation(false);
    }
  }, [onSelectVersion, targetVersion]);
  useEffect(() => {
    if (!statusHintVersionId) return;
    const exists = versions.some((v) => v.id === statusHintVersionId);
    if (!exists) {
      setStatusHint(null);
      setStatusHintVersionId(null);
    }
  }, [statusHintVersionId, versions]);
  useEffect(() => {
    setPagesInput('');
    setOperationError(null);
    setStatusHint(null);
    setStatusHintVersionId(null);
  }, [activeVersion?.id]);
  function toggleMergeVersion(versionId: string, checked: boolean) {
    setMergeOrder((prev) => {
      if (!checked) return prev.filter((id) => id !== versionId);
      if (prev.includes(versionId)) return prev;
      return [...prev, versionId];
    });
  }
  function moveMergeVersion(versionId: string, direction: -1 | 1) {
    setMergeOrder((prev) => {
      const index = prev.indexOf(versionId);
      if (index < 0) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item!);
      return next;
    });
  }
  function beginOperation(result: {
    operationJobId: string;
    versionId: string;
    version: number;
    saveMode?: OperationSaveMode;
  }) {
    setOperationJobId(result.operationJobId);
    setTargetVersionId(result.versionId);
    setPollOperation(true);
    setOperationError(null);
    setStatusHint(
      result.saveMode === 'replace_current'
        ? msgReplaceCurrentStarted(result.version)
        : msgNewVersionStarted(result.version),
    );
  }
  async function handleSplit() {
    if (!activeVersion || !activeReady) return;
    setOperationError(null);
    setStatusHint(null);
    const parsed = parsePageNumbers(pagesInput, effectivePageCount);
    if (typeof parsed === 'string') {
      setOperationError(parsed);
      return;
    }
    try {
      const result = await splitPages({
        documentId,
        versionId: activeVersion.id,
        pages: parsed,
      }).unwrap();
      beginOperation(result);
    } catch (err) {
      setOperationError(getMutationError(err));
    }
  }
  async function handleMerge() {
    if (mergeOrder.length < 2) {
      setOperationError('Выберите минимум две готовые версии');
      return;
    }
    setOperationError(null);
    setStatusHint(null);
    try {
      const result = await mergeVersions({
        documentId,
        versionIds: mergeOrder,
      }).unwrap();
      beginOperation(result);
      setMergeOrder([]);
    } catch (err) {
      setOperationError(getMutationError(err));
    }
  }
  async function handleOptimize() {
    if (!activeVersion || !activeReady) return;
    setOperationError(null);
    setStatusHint(null);
    try {
      const result = await optimizePdf({
        documentId,
        versionId: activeVersion.id,
        preset: optimizePreset,
      }).unwrap();
      beginOperation(result);
    } catch (err) {
      setOperationError(getMutationError(err));
    }
  }
  const optimizeProgressLabel = useMemo(() => {
    if (!optimizeRunning || !operationJob) return null;
    return readJobProgressLabel(operationJob.payload) ?? MSG_OPTIMIZE_RUNNING;
  }, [optimizeRunning, operationJob]);
  const progressLabel = (() => {
    if (operationError) return null;
    if (splitLoading || mergeLoading || optimizeLoading) return MSG_OPERATION_STARTING;
    if (optimizeRunning) return optimizeProgressLabel ?? MSG_OPTIMIZE_RUNNING;
    return statusHint;
  })();
  const versionSubtitle =
    activeVersion && effectivePageCount > 0
      ? `Из v${activeVersion.version} · ${effectivePageCount} стр.`
      : activeVersion
        ? `Из v${activeVersion.version}`
        : 'Выберите версию слева';
  const mergeSubtitle =
    readyVersions.length < 2
      ? 'Нужно минимум две готовые версии'
      : `${readyVersions.length} готовых версий`;
  const versionsStamp = useMemo(
    () => versions.map((v) => `${v.id}:${v.version}:${v.pageCount ?? 0}:${v.status}`).join('|'),
    [versions],
  );
  const sourceBytes = activeVersion?.size ? Number(activeVersion.size) : 0;
  const optimizeWaitHint = useMemo(
    () => (sourceBytes > 0 ? formatOptimizeWaitHint(sourceBytes) : null),
    [sourceBytes],
  );
  const optimizeEstimate = useMemo(() => {
    if (!activeReady || sourceBytes <= 0) return null;
    return estimateOptimizeSize(sourceBytes, effectivePageCount, optimizePreset);
  }, [activeReady, effectivePageCount, optimizePreset, sourceBytes]);
  const hasLayoutTools = Boolean(layout);
  const layoutObjectCount = layout?.objects.length ?? 0;
  const visibleToolSectionIds = useMemo(
    () => TOOL_SECTION_IDS.filter((id) => id !== 'layout' || hasLayoutTools),
    [hasLayoutTools],
  );
  const isSectionAllowed = (sectionId: ToolSectionId) =>
    canUseDocumentToolSection(accessRole, sectionId);
  const isGroupAllowed = (groupId: ToolGroupId) =>
    GROUP_SECTIONS[groupId].some(
      (sectionId) => visibleToolSectionIds.includes(sectionId) && isSectionAllowed(sectionId),
    );
  const visibleToolGroupIds = useMemo(
    () => TOOL_GROUP_IDS.filter((groupId) => isToolGroupVisible(groupId, toolScenario)),
    [toolScenario],
  );
  const workflowContext = useMemo(
    () =>
      buildVersionWorkflowContext({
        activeVersion,
        versionReady,
        reviewStatus,
        shareLinks,
        openGuestCommentsCount,
        needsFixMarksCount,
        acceptedEditsCount,
      }),
    [
      acceptedEditsCount,
      activeVersion,
      needsFixMarksCount,
      openGuestCommentsCount,
      reviewStatus,
      shareLinks,
      versionReady,
    ],
  );
  const scenarioSteps = useMemo(
    () =>
      buildScenarioSteps(toolScenario, {
        layoutObjectCount,
        hasShareLinkOnCurrentVersion: workflowContext?.hasShareLinkOnCurrentVersion ?? false,
        openGuestCommentsCount,
        acceptedEditsCount,
        versionReady,
      }).filter((step) => isSectionAllowed(step.sectionId)),
    [
      acceptedEditsCount,
      layoutObjectCount,
      openGuestCommentsCount,
      toolScenario,
      versionReady,
      workflowContext?.hasShareLinkOnCurrentVersion,
      accessRole,
    ],
  );
  const visibleSectionsForScenario = useMemo(
    () =>
      visibleToolSectionIds.filter(
        (id) => visibleToolGroupIds.includes(getSectionGroup(id)) && isSectionAllowed(id),
      ),
    [accessRole, visibleToolGroupIds, visibleToolSectionIds],
  );
  const allSectionsOpen =
    visibleSectionsForScenario.length > 0 &&
    visibleSectionsForScenario.every((id) => openSections.has(id));
  const noSectionsOpen = visibleSectionsForScenario.every((id) => !openSections.has(id));
  function isSectionOpen(id: ToolSectionId) {
    return openSections.has(id);
  }
  function toggleSection(id: ToolSectionId) {
    if (!isSectionAllowed(id)) return;
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function focusToolSection(sectionId: ToolSectionId) {
    if (!isSectionAllowed(sectionId)) return;
    const group = getSectionGroup(sectionId);
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.add(group);
      return next;
    });
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.add(sectionId);
      return next;
    });
    window.requestAnimationFrame(() => {
      sectionRefs.current[sectionId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
  function handleScenarioChange(next: ToolScenario) {
    setToolScenario(next);
    writeStoredToolScenario(documentId, next);
  }
  function expandAllSections() {
    const sectionIds = visibleToolSectionIds.filter(
      (id) => visibleToolGroupIds.includes(getSectionGroup(id)) && isSectionAllowed(id),
    );
    setOpenSections(new Set(sectionIds));
    setOpenGroups(new Set(visibleToolGroupIds.filter((groupId) => isGroupAllowed(groupId))));
  }
  function collapseAllSections() {
    setOpenSections(new Set());
    setOpenGroups(new Set());
  }
  function visibleSectionsInGroup(groupId: ToolGroupId): ToolSectionId[] {
    return GROUP_SECTIONS[groupId].filter((id) => visibleToolSectionIds.includes(id));
  }
  function toggleGroup(groupId: ToolGroupId) {
    if (!isGroupAllowed(groupId)) return;
    const sectionsInGroup = visibleSectionsInGroup(groupId);
    const soleSection = sectionsInGroup.length === 1 ? sectionsInGroup[0] : null;
    const opening = !openGroups.has(groupId);
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (opening) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
    if (soleSection) {
      setOpenSections((prev) => {
        const next = new Set(prev);
        if (opening) next.add(soleSection);
        else next.delete(soleSection);
        return next;
      });
    }
  }
  useEffect(() => {
    if (toolScenarioInitializedRef.current || !activeVersion) return;
    const inferred = inferDefaultToolScenario({
      activeVersion,
      acceptedEditsCount,
      layoutObjectCount,
      projectId,
    });
    setToolScenario(readStoredToolScenario(documentId, inferred));
    toolScenarioInitializedRef.current = true;
  }, [acceptedEditsCount, activeVersion, documentId, layoutObjectCount, projectId]);
  useEffect(() => {
    if (!editTextInjection) return;
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.add('edits');
      return next;
    });
    setOpenSections((prev) => {
      if (prev.has('edits')) return prev;
      const next = new Set(prev);
      next.add('edits');
      return next;
    });
  }, [editTextInjection]);
  useEffect(() => {
    if (!focusSection) return;
    const section = focusSection;
    const group = getSectionGroup(section);
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.add(group);
      return next;
    });
    setExpanded(true);
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.add(section);
      return next;
    });
    const frameId = window.requestAnimationFrame(() => {
      sectionRefs.current[section]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      onFocusSectionHandled?.();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [focusSection, onFocusSectionHandled]);
  const prevLayoutEnabledRef = useRef(Boolean(layout?.enabled));
  useEffect(() => {
    const wasEnabled = prevLayoutEnabledRef.current;
    const isEnabled = Boolean(layout?.enabled);
    prevLayoutEnabledRef.current = isEnabled;
    if (isEnabled && !wasEnabled) {
      onRequestPdfInteraction?.('layout');
    }
  }, [layout?.enabled, onRequestPdfInteraction]);
  const annotationsSharedProps = {
    documentId,
    versionId: activeVersion?.id ?? '',
    viewerPage,
    versionReady,
    focusedAnnotationId,
    onOpenAcceptedEdit,
    onOpenAllAcceptedEdits,
    editTextInjection,
    onGoToPage,
    onSelectVersion,
    documentRole: accessRole,
    currentUserId,
  };
  const annotationsController = useDocumentAnnotationsPanel(annotationsSharedProps);
  const body = (
    <div
      className={
        embedded ? 'space-y-2 p-3' : 'border-t border-slate-100 px-4 pb-4 pt-3 sm:px-5 sm:pb-5'
      }
    >
      {workflowContext && (
        <DocumentVersionContextBanner
          context={workflowContext}
          onOpenShare={() => focusToolSection('share')}
          onSwitchToLinkedVersion={(versionId) => onSelectVersion(versionId)}
          onOpenGuestComments={() => focusToolSection('share')}
        />
      )}

      <DocumentToolScenarioBar
        scenario={toolScenario}
        onScenarioChange={handleScenarioChange}
        steps={scenarioSteps}
        onStepClick={focusToolSection}
      />

      {versionCreatedNotice && onDismissVersionCreatedNotice && (
        <DocumentVersionCreatedNotice
          notice={versionCreatedNotice}
          onDismiss={onDismissVersionCreatedNotice}
          onCreateShareLink={() => focusToolSection('share')}
          onCompareVersions={
            versionCreatedNotice.previousVersionId ? () => focusToolSection('diff') : undefined
          }
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <p className="text-[11px] text-slate-500">Откройте нужный раздел или все сразу</p>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            disabled={allSectionsOpen}
            onClick={expandAllSections}
            className="cursor-pointer rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Развернуть все
          </button>
          <button
            type="button"
            disabled={noSectionsOpen}
            onClick={collapseAllSections}
            className="cursor-pointer rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Свернуть все
          </button>
        </div>
      </div>

      {progressLabel && <p className="text-sm text-folio-700">{progressLabel}</p>}
      {operationError && <p className="text-sm text-red-600">{operationError}</p>}

      <div className="space-y-1.5">
        {visibleToolGroupIds.includes('pdf') && (
          <>
            <ToolGroupHeader
              title="PDF и страницы"
              description="Быстрые операции с текущей версией и сравнение готовых версий."
              isOpen={openGroups.has('pdf')}
              onToggle={() => toggleGroup('pdf')}
              disabled={!isGroupAllowed('pdf')}
              disabledReason={restrictionHint}
            />
            <div className={openGroups.has('pdf') ? 'space-y-2' : 'hidden'}>
              <ToolAccordionSection
                title="Сжать PDF"
                subtitle="Меньший файл для почты и чатов"
                isOpen={isSectionOpen('optimize')}
                onToggle={() => toggleSection('optimize')}
                disabled={!isSectionAllowed('optimize')}
                disabledReason={restrictionHint}
                sectionId="optimize"
                sectionRef={sectionRefCallbacks.optimize}
                helpTitle="Пресеты сжатия"
                helpContent={
                  <>
                    <p>
                      Создаётся новая версия с меньшим размером. Текст в договорах обычно не
                      ужимается — заметный эффект у файлов с фотографиями и иллюстрациями.
                    </p>
                    <p>До 200 страниц. Исходная версия не изменяется.</p>
                  </>
                }
              >
                <div className="space-y-2">
                  {OPTIMIZE_PRESETS.map((presetId) => {
                    const info = OPTIMIZE_PRESET_INFO[presetId];
                    return (
                      <label
                        key={presetId}
                        className={`flex cursor-pointer gap-2 rounded-lg border px-3 py-2 text-sm ${
                          optimizePreset === presetId
                            ? 'border-folio-300 bg-folio-50/60'
                            : 'border-slate-100 hover:border-slate-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name="optimize-preset"
                          value={presetId}
                          checked={optimizePreset === presetId}
                          disabled={!activeReady || operationPending}
                          onChange={() => setOptimizePreset(presetId)}
                          className="mt-1"
                        />
                        <span>
                          <span className="font-medium text-slate-900">{info.label}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {info.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {sourceBytes > 0 && (
                  <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                    <p>
                      Текущий файл:{' '}
                      <span className="font-medium text-slate-800">
                        {formatFileSize(sourceBytes)}
                      </span>
                      {effectivePageCount > 0 ? ` · ${effectivePageCount} стр.` : ''}
                    </p>
                    {optimizeEstimate && (
                      <p className="mt-1">
                        Ожидаемый размер:{' '}
                        <span className="font-medium text-slate-800">
                          {formatOptimizeSizeRange(optimizeEstimate)}
                        </span>
                        {optimizeEstimate.likelyTextOnly && optimizePreset !== 'none' && (
                          <span className="mt-0.5 block text-slate-500">
                            Похоже на текстовый PDF — заметного сжатия может не быть.
                          </span>
                        )}
                        {optimizeWaitHint && (
                          <span className="mt-1 block text-slate-500">{optimizeWaitHint}</span>
                        )}
                      </p>
                    )}
                  </div>
                )}
                <div className={`mt-3 ${reportActionsColumnClass}`}>
                  <FeatureHelpActionButton
                    helpTitle="Сжать в новую версию"
                    disabled={!activeReady || operationPending || effectivePageCount <= 0}
                    onClick={() => void handleOptimize()}
                    buttonClassName={reportActionBtnPrimary}
                    helpContent={
                      <>
                        <p>{HINT_OPTIMIZE_NEW_VERSION}</p>
                        <p>{HINT_OPTIMIZE_REQUIREMENTS}</p>
                      </>
                    }
                  >
                    {optimizeLoading ? 'Запуск…' : 'Сжать в новую версию'}
                  </FeatureHelpActionButton>
                </div>
              </ToolAccordionSection>

              <ToolAccordionSection
                title="Извлечь страницы"
                subtitle={versionSubtitle}
                isOpen={isSectionOpen('split')}
                onToggle={() => toggleSection('split')}
                disabled={!isSectionAllowed('split')}
                disabledReason={restrictionHint}
                sectionId="split"
                sectionRef={sectionRefCallbacks.split}
                helpTitle="Извлечь страницы"
                helpContent={
                  <>
                    <p>
                      Укажите номера страниц открытой версии — через запятую или кнопкой «+ стр.»
                      добавьте текущую страницу из просмотрщика.
                    </p>
                    <p>
                      Будет создана новая версия PDF только с выбранными страницами. Исходная версия
                      не изменяется.
                    </p>
                  </>
                }
              >
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={pagesInput}
                    onChange={(e) => setPagesInput(e.target.value)}
                    placeholder="1, 2 или выберите страницу"
                    disabled={!activeReady || operationPending}
                    className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-50"
                  />
                  <div className="inline-flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={!activeReady || operationPending || effectivePageCount <= 0}
                      onClick={() => {
                        const next = new Set(
                          pagesInput
                            .split(/[,;\s]+/)
                            .map((p) => Number(p.trim()))
                            .filter((n) => Number.isInteger(n) && n >= 1),
                        );
                        next.add(viewerPage);
                        setPagesInput([...next].sort((a, b) => a - b).join(', '));
                      }}
                      className="inline-flex h-8 cursor-pointer items-center rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      + стр. {viewerPage}
                    </button>
                    <FeatureHelpButton title={`Страница ${viewerPage}`}>
                      <p>
                        Добавляет в поле номеров страницу, которую вы сейчас смотрите в PDF. Удобно
                        выбирать страницы по одной, не вводя номер вручную.
                      </p>
                    </FeatureHelpButton>
                  </div>
                </div>
                <div className={`mt-3 ${reportActionsColumnClass}`}>
                  <FeatureHelpActionButton
                    helpTitle="Извлечь в новую версию"
                    disabled={!activeReady || operationPending || effectivePageCount <= 0}
                    onClick={() => void handleSplit()}
                    buttonClassName={reportActionBtnPrimary}
                    helpContent={
                      <>
                        <p>
                          Запускает сборку новой версии с выбранными страницами. После готовности
                          она появится в списке версий слева и откроется в просмотрщике.
                        </p>
                        <p>Нужна готовая версия с известным числом страниц.</p>
                      </>
                    }
                  >
                    {splitLoading ? 'Запуск…' : 'Извлечь в новую версию'}
                  </FeatureHelpActionButton>
                </div>
                {splitBlockedReason && (
                  <p className="mt-2 text-xs text-amber-700">{splitBlockedReason}</p>
                )}
              </ToolAccordionSection>

              <ToolAccordionSection
                title="Страницы: порядок и листы"
                subtitle={versionSubtitle}
                isOpen={isSectionOpen('pages')}
                onToggle={() => toggleSection('pages')}
                disabled={!isSectionAllowed('pages')}
                disabledReason={restrictionHint}
                sectionId="pages"
                sectionRef={sectionRefCallbacks.pages}
                helpTitle="Порядок и дубликаты страниц"
                helpContent={
                  <>
                    <p>Переставьте листы стрелками ↑↓ или продублируйте кнопкой «+1».</p>
                    <p>Будет создана новая версия PDF. Исходная версия останется без изменений.</p>
                  </>
                }
              >
                <DocumentPageOrderPanel
                  documentId={documentId}
                  versionId={activeVersion?.id}
                  versionNumber={activeVersion?.version}
                  isLatestVersion={isLatestVersion}
                  versionsStamp={versionsStamp}
                  pageCount={effectivePageCount}
                  versionReady={activeReady}
                  operationPending={operationPending}
                  onOperationStarted={beginOperation}
                  onError={setOperationError}
                />
              </ToolAccordionSection>

              <ToolAccordionSection
                title="Объединить версии"
                subtitle={mergeSubtitle}
                isOpen={isSectionOpen('merge')}
                onToggle={() => toggleSection('merge')}
                disabled={!isSectionAllowed('merge')}
                disabledReason={restrictionHint}
                sectionId="merge"
                sectionRef={sectionRefCallbacks.merge}
                helpTitle="Объединить версии"
                helpContent={
                  <>
                    <p>
                      Отметьте две и более готовые версии. Стрелками ↑↓ задайте порядок: сначала все
                      страницы первой версии, затем второй и т.д.
                    </p>
                    <p>
                      По кнопке «Объединить в новую версию» система соберёт один PDF — новая версия
                      появится в списке слева.
                    </p>
                  </>
                }
              >
                <p className="mb-2 text-[11px] text-slate-500">
                  Порядок в списке — порядок страниц в итоговом PDF
                </p>
                <ul className="space-y-2">
                  {readyVersions.length < 2 ? (
                    <li className="text-xs text-slate-500">Нужно минимум две готовые версии</li>
                  ) : (
                    readyVersions.map((v) => {
                      const selected = mergeOrder.includes(v.id);
                      const orderIndex = mergeOrder.indexOf(v.id);
                      return (
                        <li
                          key={v.id}
                          className={`flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${selected ? 'border-folio-200 bg-folio-50/50' : 'border-slate-100'}`}
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={operationPending}
                              onChange={(e) => toggleMergeVersion(v.id, e.target.checked)}
                            />
                            <span>
                              Версия {v.version}
                              {v.pageCount ? ` · ${v.pageCount} стр.` : ''}
                            </span>
                          </label>
                          {selected && (
                            <span className="flex items-center gap-1">
                              <span className="text-xs text-folio-700">#{orderIndex + 1}</span>
                              <button
                                type="button"
                                disabled={orderIndex === 0 || operationPending}
                                onClick={() => moveMergeVersion(v.id, -1)}
                                className="cursor-pointer rounded px-1 text-xs text-slate-600 hover:bg-white disabled:opacity-40"
                                title="Выше"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={orderIndex === mergeOrder.length - 1 || operationPending}
                                onClick={() => moveMergeVersion(v.id, 1)}
                                className="cursor-pointer rounded px-1 text-xs text-slate-600 hover:bg-white disabled:opacity-40"
                                title="Ниже"
                              >
                                ↓
                              </button>
                            </span>
                          )}
                        </li>
                      );
                    })
                  )}
                </ul>
                <div className={`mt-3 ${reportActionsColumnClass}`}>
                  <FeatureHelpActionButton
                    helpTitle="Объединить в новую версию"
                    disabled={mergeOrder.length < 2 || operationPending}
                    onClick={() => void handleMerge()}
                    buttonClassName={reportActionBtnPrimary}
                    helpContent={
                      <>
                        <p>
                          Создаёт новую версию документа из выбранных готовых PDF в указанном
                          порядке.
                        </p>
                        <p>Минимум две версии со статусом «готов».</p>
                      </>
                    }
                  >
                    {mergeLoading ? 'Запуск…' : 'Объединить в новую версию'}
                  </FeatureHelpActionButton>
                </div>
              </ToolAccordionSection>

              <ToolAccordionSection
                title="Сравнение версий"
                subtitle="Текст и правки между версиями"
                isOpen={isSectionOpen('diff')}
                onToggle={() => toggleSection('diff')}
                disabled={!isSectionAllowed('diff')}
                disabledReason={restrictionHint}
                sectionId="diff"
                sectionRef={sectionRefCallbacks.diff}
                helpTitle="Сравнение версий"
                helpContent={
                  <>
                    <p>
                      Сравнивает текст страниц и принятые правки между выбранной базовой версией и
                      текущей.
                    </p>
                  </>
                }
              >
                <DocumentVersionDiffPanel
                  documentId={documentId}
                  versions={versions}
                  activeVersion={activeVersion}
                  onGoToPage={onGoToPage}
                  hideSectionHeader
                />
              </ToolAccordionSection>

              <ToolAccordionSection
                title="Экспорт и конвертация"
                subtitle="PDF, DOCX, картинки, ZIP"
                isOpen={isSectionOpen('export')}
                onToggle={() => toggleSection('export')}
                disabled={!isSectionAllowed('export')}
                disabledReason={restrictionHint}
                sectionId="export"
                sectionRef={sectionRefCallbacks.export}
                helpTitle="Форматы экспорта"
                helpContent={
                  <>
                    <p>Скачайте выбранную версию в PDF, Word или как набор картинок.</p>
                    <p>
                      «DOCX из PDF» конвертирует текущий PDF в Word — удобно для правок, если
                      исходный Word не загружали.
                    </p>
                  </>
                }
              >
                {activeVersion ? (
                  <DocumentVersionExportPanel
                    documentId={documentId}
                    version={activeVersion}
                    versionReady={versionReady}
                  />
                ) : (
                  <p className="text-xs text-slate-500">Выберите версию слева.</p>
                )}
              </ToolAccordionSection>
            </div>
          </>
        )}

        {visibleToolGroupIds.includes('layout') && (
          <>
            <ToolGroupHeader
              title="Макет и печать"
              description="Размещение материалов на листах и подготовка пакета для передачи заказчику."
              isOpen={openGroups.has('layout')}
              onToggle={() => toggleGroup('layout')}
              disabled={!isGroupAllowed('layout')}
              disabledReason={restrictionHint}
            />
            <div className={openGroups.has('layout') ? 'space-y-2' : 'hidden'}>
              {layout && (
                <ToolAccordionSection
                  title="Макет страниц"
                  subtitle="Добавить изображения, сетка и линейки"
                  isOpen={isSectionOpen('layout')}
                  onToggle={() => toggleSection('layout')}
                  disabled={!isSectionAllowed('layout')}
                  disabledReason={restrictionHint}
                  sectionId="layout"
                  sectionRef={sectionRefCallbacks.layout}
                  helpTitle="Режим макета"
                  helpContent={
                    <>
                      <p>Для буклетов и альбомов: разместите рендер или фото на странице PDF.</p>
                      <p>
                        Линейки в миллиметрах, сетка и привязка помогают выровнять картинку на
                        листе.
                      </p>
                    </>
                  }
                >
                  <DocumentLayoutPanel
                    layout={layout}
                    viewerPage={viewerPage}
                    versionReady={versionReady && canEdit}
                    canEdit={canEdit}
                    documentId={documentId}
                    versionId={activeVersion?.id ?? ''}
                    pageCount={layoutPageCount}
                    versionNumber={activeVersion?.version}
                    isLatestVersion={isLatestVersion}
                    onSelectVersion={onSelectVersion}
                    onGoToPage={onGoToPage}
                    addNotice={layoutAddNotice}
                    onAddImages={onAddLayoutImages}
                  />
                  <DocumentInternalMarkupPanel
                    documentId={documentId}
                    versionId={activeVersion?.id ?? ''}
                    viewerPage={viewerPage}
                    versionReady={versionReady}
                    canEdit={canComment}
                  />
                </ToolAccordionSection>
              )}

              <ToolAccordionSection
                title="Буклет"
                subtitle="Подготовка, проверка печати, ZIP для заказчика"
                isOpen={isSectionOpen('booklet')}
                onToggle={() => toggleSection('booklet')}
                disabled={!isSectionAllowed('booklet')}
                disabledReason={restrictionHint}
                sectionId="booklet"
                sectionRef={sectionRefCallbacks.booklet}
                helpTitle="Буклет для заказчика"
                helpContent={
                  <>
                    <p>Три шага: подписи и материалы → проверка DPI и шрифтов → ZIP с PDF и JPG.</p>
                    <p>Готовый пакет можно отдать по ссылке в разделе «Ссылка для заказчика».</p>
                  </>
                }
              >
                <DocumentBookletPanel
                  documentId={documentId}
                  documentTitle={documentTitle}
                  projectId={projectId}
                  projectName={projectName}
                  versionReady={versionReady}
                  layout={layout}
                  versionId={activeVersion?.id ?? ''}
                  pageCount={effectivePageCount}
                  viewerPage={viewerPage}
                />
              </ToolAccordionSection>
            </div>
          </>
        )}

        {visibleToolGroupIds.includes('approval') && (
          <>
            <ToolGroupHeader
              title="Согласование"
              description="Команда — для коллег с аккаунтом. Гостевая ссылка — для заказчика без регистрации."
              isOpen={openGroups.has('approval')}
              onToggle={() => toggleGroup('approval')}
              disabled={!isGroupAllowed('approval')}
              disabledReason={restrictionHint}
            />
            <div className={openGroups.has('approval') ? '' : 'hidden'}>
              <ToolAccordionSection
                title="Доступ команды"
                subtitle="Коллеги с аккаунтом РазУм"
                isOpen={isSectionOpen('team-access')}
                onToggle={() => toggleSection('team-access')}
                disabled={!isSectionAllowed('team-access')}
                disabledReason={restrictionHint}
                sectionId="team-access"
                sectionRef={sectionRefCallbacks['team-access']}
                helpTitle="Команда на документе"
                helpContent={
                  <>
                    <p>
                      Пригласите коллег в рабочее пространство. Роль можно менять в списке
                      участников. Ссылку для присоединения можно скопировать снова из блока «Ожидают
                      присоединения».
                    </p>
                    <p>Для заказчика без аккаунта используйте гостевую ссылку в следующем блоке.</p>
                  </>
                }
              >
                <div className="rounded-xl border-2 border-folio-200 bg-folio-50/30 p-3">
                  <DocumentAccessPanel documentId={documentId} />
                </div>
              </ToolAccordionSection>
              <ToolAccordionSection
                title="Ссылка для заказчика"
                subtitle="Просмотр без регистрации"
                isOpen={isSectionOpen('share')}
                onToggle={() => toggleSection('share')}
                disabled={!isSectionAllowed('share')}
                disabledReason={restrictionHint}
                sectionId="share"
                sectionRef={sectionRefCallbacks.share}
                helpTitle="Гостевой просмотр"
                helpContent={
                  <>
                    <p>
                      Создайте ссылку с ограниченным сроком действия. Заказчик видит превью страниц
                      в браузере. Опционально — скачивание ZIP с PDF и JPG (если пакет уже собран).
                    </p>
                    <p>Ссылку можно отозвать в любой момент. Регистрация заказчику не нужна.</p>
                  </>
                }
              >
                <DocumentSharePanel
                  documentId={documentId}
                  activeVersion={activeVersion}
                  versionReady={versionReady}
                  reviewStatus={reviewStatus}
                  reviewStatusChangedAt={reviewStatusChangedAt}
                  viewerPage={viewerPage}
                  needsFixMarksCount={needsFixMarksCount}
                />
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="mb-2 text-xs font-medium text-slate-700">Замечания заказчика</p>
                  <DocumentGuestCommentsPanel
                    documentId={documentId}
                    versionId={activeVersion?.id ?? ''}
                    versionReady={versionReady}
                    focusedCommentId={focusedGuestCommentId}
                    onGoToComment={(page, commentId) => {
                      setOpenGroups((prev) => {
                        const next = new Set(prev);
                        next.add('approval');
                        return next;
                      });
                      if (!isSectionOpen('share')) toggleSection('share');
                      onGoToPage(page, commentId);
                    }}
                  />
                </div>
              </ToolAccordionSection>
            </div>
          </>
        )}

        <DocumentAnnotationsControllerProvider value={annotationsController}>
          {visibleToolGroupIds.includes('approval') && (
            <div className={openGroups.has('approval') ? '' : 'hidden'}>
              <ToolAccordionSection
                title="Комментарии на PDF"
                subtitle="Комментарии к страницам PDF"
                isOpen={isSectionOpen('annotations')}
                onToggle={() => toggleSection('annotations')}
                disabled={!isSectionAllowed('annotations')}
                disabledReason={restrictionHint}
                sectionId="annotations"
                sectionRef={sectionRefCallbacks.annotations}
                helpTitle="Комментарии на PDF"
                helpContent={
                  <p>
                    <strong>Заметка</strong> — комментарий к странице без изменения текста договора.
                  </p>
                }
              >
                <DocumentAnnotationsPanel
                  variant="notes"
                  hideSectionHeader
                  onRequestPdfInteraction={onRequestPdfInteraction}
                />
              </ToolAccordionSection>
            </div>
          )}

          {visibleToolGroupIds.includes('edits') && (
            <>
              <ToolGroupHeader
                title="Правки"
                description="Ручные замены «было/стало» и сборка новой версии с правками."
                isOpen={openGroups.has('edits')}
                onToggle={() => toggleGroup('edits')}
                disabled={!isGroupAllowed('edits')}
                disabledReason={restrictionHint}
              />
              <div className={openGroups.has('edits') ? '' : 'hidden'}>
                <ToolAccordionSection
                  title="Правки в PDF"
                  subtitle="Ручные правки, сборка новой версии"
                  isOpen={isSectionOpen('edits')}
                  onToggle={() => toggleSection('edits')}
                  disabled={!isSectionAllowed('edits')}
                  disabledReason={restrictionHint}
                  sectionId="edits"
                  sectionRef={sectionRefCallbacks.edits}
                  helpTitle="Правки в PDF"
                  helpContent={
                    <>
                      <p>Внесите ручную правку «было / стало» прямо на странице PDF.</p>
                      <p>
                        Затем соберите PDF с реестром правок, примените изменения в текст или
                        выгрузите DOCX.
                      </p>
                    </>
                  }
                >
                  <DocumentAnnotationsPanel
                    variant="edits"
                    hideSectionHeader
                    onRequestPdfInteraction={onRequestPdfInteraction}
                  />
                  {/* ИИ-предложения правок временно отключены — остаются только ручные правки */}
                  {/* <DocumentAiSuggestionsPanel
                documentId={documentId}
                versionId={activeVersion?.id ?? ''}
                versionReady={versionReady}
                viewerPage={viewerPage}
                pageCount={effectivePageCount}
                onGoToPage={onGoToPage}
              /> */}
                  <DocumentEditsApplyActions />
                </ToolAccordionSection>
              </div>
            </>
          )}
        </DocumentAnnotationsControllerProvider>
      </div>
    </div>
  );
  if (embedded) {
    return <div className="text-sm">{body}</div>;
  }
  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left sm:px-5"
      >
        <span className="text-sm font-semibold text-slate-900">Операции с PDF</span>
        <span className="text-xs text-slate-500">{expanded ? 'Свернуть' : 'Развернуть'}</span>
      </button>
      {expanded && body}
    </section>
  );
}
