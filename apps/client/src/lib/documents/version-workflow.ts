import type { DocumentReviewStatus } from '@folio-mind/store';
import type { ShareLinkItem } from '@folio-mind/store';
import type { DocumentVersionItem } from '../../components/documents/DocumentVersionsPanel.js';

export type ToolScenario = 'booklet' | 'contract' | 'all';
export type ToolGroupId = 'pdf' | 'layout' | 'approval' | 'edits';
export type ToolSectionId =
  | 'optimize'
  | 'split'
  | 'pages'
  | 'merge'
  | 'export'
  | 'annotations'
  | 'edits'
  | 'diff'
  | 'layout'
  | 'booklet'
  | 'team-access'
  | 'share';

export const TOOL_SCENARIO_STORAGE_KEY = 'folio-tool-scenario';

const REVIEW_STATUS_TITLE: Record<DocumentReviewStatus, string> = {
  draft: 'Черновик',
  in_review: 'На согласовании',
  approved: 'Утверждено',
};

export type ShareLinkMismatch = {
  activeLinkVersionId: string;
  activeLinkVersionNumber: number;
};

export type VersionWorkflowContext = {
  versionNumber: number;
  versionStatusLabel: string;
  versionReady: boolean;
  pageCount: number | null;
  sizeMb: string | null;
  documentReviewStatusLabel: string;
  hasShareLinkOnCurrentVersion: boolean;
  shareLinkMismatch: ShareLinkMismatch | null;
  openGuestCommentsCount: number;
  needsFixMarksCount: number;
  acceptedEditsCount: number;
};

export type ScenarioStep = {
  id: string;
  label: string;
  done: boolean;
  active: boolean;
  sectionId: ToolSectionId;
};

export type SharePreCheckItem = {
  id: string;
  label: string;
  done: boolean;
  optional?: boolean;
};

export function formatVersionSizeMb(size: string | undefined): string | null {
  if (!size) return null;
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function getVersionStatusUserLabel(status: string | undefined): string {
  switch (status) {
    case 'ready':
      return 'готова';
    case 'processing':
      return 'обрабатывается';
    case 'pending_upload':
      return 'не загружена';
    case 'failed':
      return 'ошибка';
    default:
      return status ?? '';
  }
}

export function findActiveShareLinkOnOtherVersion(
  shareLinks: ShareLinkItem[],
  activeVersionId: string | undefined,
): ShareLinkMismatch | null {
  if (!activeVersionId) return null;
  const foreign = shareLinks.find((link) => link.active && link.versionId !== activeVersionId);
  if (!foreign) return null;
  return {
    activeLinkVersionId: foreign.versionId,
    activeLinkVersionNumber: foreign.version,
  };
}

export function buildVersionWorkflowContext(input: {
  activeVersion: DocumentVersionItem | undefined;
  versionReady: boolean;
  reviewStatus: DocumentReviewStatus;
  shareLinks: ShareLinkItem[];
  openGuestCommentsCount: number;
  needsFixMarksCount: number;
  acceptedEditsCount: number;
}): VersionWorkflowContext | null {
  const { activeVersion } = input;
  if (!activeVersion) return null;

  const hasShareLinkOnCurrentVersion = input.shareLinks.some(
    (link) => link.active && link.versionId === activeVersion.id,
  );

  return {
    versionNumber: activeVersion.version,
    versionStatusLabel: getVersionStatusUserLabel(activeVersion.status),
    versionReady: input.versionReady,
    pageCount: activeVersion.pageCount ?? null,
    sizeMb: formatVersionSizeMb(activeVersion.size),
    documentReviewStatusLabel: REVIEW_STATUS_TITLE[input.reviewStatus],
    hasShareLinkOnCurrentVersion,
    shareLinkMismatch: findActiveShareLinkOnOtherVersion(input.shareLinks, activeVersion.id),
    openGuestCommentsCount: input.openGuestCommentsCount,
    needsFixMarksCount: input.needsFixMarksCount,
    acceptedEditsCount: input.acceptedEditsCount,
  };
}

export function inferDefaultToolScenario(input: {
  activeVersion: DocumentVersionItem | undefined;
  acceptedEditsCount: number;
  layoutObjectCount: number;
  projectId: string | null | undefined;
}): ToolScenario {
  if (input.acceptedEditsCount > 0 || input.activeVersion?.sourceDocxKey) {
    return 'contract';
  }
  if (input.layoutObjectCount > 0 || input.projectId) {
    return 'booklet';
  }
  return 'all';
}

export function readStoredToolScenario(
  documentId: string,
  fallback: ToolScenario,
): ToolScenario {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(`${TOOL_SCENARIO_STORAGE_KEY}:${documentId}`);
    if (raw === 'booklet' || raw === 'contract' || raw === 'all') return raw;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writeStoredToolScenario(documentId: string, scenario: ToolScenario): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${TOOL_SCENARIO_STORAGE_KEY}:${documentId}`, scenario);
  } catch {
    /* ignore */
  }
}

export function isToolGroupVisible(groupId: ToolGroupId, scenario: ToolScenario): boolean {
  if (scenario === 'all') return true;
  if (scenario === 'booklet') {
    return groupId === 'layout' || groupId === 'approval' || groupId === 'pdf';
  }
  return groupId === 'pdf' || groupId === 'approval' || groupId === 'edits';
}

export function buildScenarioSteps(
  scenario: ToolScenario,
  input: {
    layoutObjectCount: number;
    hasShareLinkOnCurrentVersion: boolean;
    openGuestCommentsCount: number;
    acceptedEditsCount: number;
    versionReady: boolean;
  },
): ScenarioStep[] {
  if (scenario === 'contract') {
    return [
      {
        id: 'edits',
        label: 'Внести правки',
        done: input.acceptedEditsCount > 0,
        active: input.acceptedEditsCount === 0,
        sectionId: 'edits',
      },
      {
        id: 'compare',
        label: 'Сравнить с прошлой версией',
        done: false,
        active: input.acceptedEditsCount > 0,
        sectionId: 'diff',
      },
      {
        id: 'share',
        label: 'Ссылка для заказчика',
        done: input.hasShareLinkOnCurrentVersion,
        active: input.acceptedEditsCount > 0 && !input.hasShareLinkOnCurrentVersion,
        sectionId: 'share',
      },
    ];
  }

  if (scenario === 'booklet') {
    return [
      {
        id: 'layout',
        label: 'Подготовить макет',
        done: input.layoutObjectCount > 0,
        active: input.layoutObjectCount === 0,
        sectionId: 'layout',
      },
      {
        id: 'booklet',
        label: 'Собрать пакет (ZIP)',
        done: false,
        active: input.layoutObjectCount > 0,
        sectionId: 'booklet',
      },
      {
        id: 'share',
        label: 'Отправить заказчику',
        done: input.hasShareLinkOnCurrentVersion,
        active: !input.hasShareLinkOnCurrentVersion,
        sectionId: 'share',
      },
      {
        id: 'feedback',
        label:
          input.openGuestCommentsCount > 0
            ? `Замечания (${input.openGuestCommentsCount})`
            : 'Замечания закрыты',
        done: input.openGuestCommentsCount === 0 && input.hasShareLinkOnCurrentVersion,
        active: input.openGuestCommentsCount > 0,
        sectionId: 'share',
      },
    ];
  }

  return [];
}

export function buildSharePreChecklist(input: {
  versionReady: boolean;
  needsFixMarksCount: number;
  reviewStatus: DocumentReviewStatus;
  allowBookletZip: boolean;
}): SharePreCheckItem[] {
  const items: SharePreCheckItem[] = [
    {
      id: 'ready',
      label: 'Версия готова к просмотру',
      done: input.versionReady,
    },
    {
      id: 'marks',
      label:
        input.needsFixMarksCount > 0
          ? `Снять метки «нужны правки» (${input.needsFixMarksCount} стр.)`
          : 'Нет меток «нужны правки» на страницах',
      done: input.needsFixMarksCount === 0,
    },
    {
      id: 'status',
      label: 'Статус документа — «На согласовании»',
      done: input.reviewStatus === 'in_review' || input.reviewStatus === 'approved',
      optional: true,
    },
  ];

  if (input.allowBookletZip) {
    items.push({
      id: 'zip',
      label: 'ZIP собран в разделе «Буклет»',
      done: false,
      optional: true,
    });
  }

  return items;
}
