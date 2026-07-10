import { forwardRef } from 'react';
import { shellPanelToolbarClass } from '../layout/shell-chrome.js';
import { PanelResizeHandle } from '../layout/PanelResizeHandle.js';
import { PanelViewportToggle } from '../layout/PanelViewportToggle.js';
import { DocumentAiPanel } from './DocumentAiPanel.js';
import { DocumentPdfOperationsPanel } from './DocumentPdfOperationsPanel.js';
import type { EditTextInjection } from './useDocumentAnnotationsPanel.js';
import { DocumentReportPanel } from './DocumentReportPanel.js';
import type { DocumentVersionItem } from './DocumentVersionsPanel.js';
import type { ToolSectionId } from '../ui/ToolAccordionSection.js';
import type { LayoutEditorState } from '../../hooks/useLayoutEditor.js';
import type { DocumentReviewStatus, ShareLinkItem } from '@folio-mind/store';
import type { VersionCreatedNotice } from '../../hooks/useVersionCreatedNotice.js';
export type DocumentRightTab = 'chat' | 'tools' | 'report';
type Props = {
  documentId: string;
  versions: DocumentVersionItem[];
  activeVersion: DocumentVersionItem | undefined;
  versionReady: boolean;
  viewerPage: number;
  onSelectVersion: (versionId: string) => void;
  onGoToPage: (page: number, annotationId?: string) => void;
  focusedAnnotationId?: string | null;
  focusedGuestCommentId?: string | null;
  onOpenAcceptedEdit: (page: number, annotationId: string) => void;
  onOpenAllAcceptedEdits: () => void;
  editTextInjection?: EditTextInjection | null;
  toolsFocusSection?: ToolSectionId | null;
  onToolsFocusSectionHandled?: () => void;
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
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onExpand: () => void;
  panelWidth: number;
  isResizing: boolean;
  onResizeStart: (event: React.MouseEvent) => void;
  activeTab: DocumentRightTab;
  onTabChange: (tab: DocumentRightTab) => void;
  mode?: 'docked' | 'drawer';
};
const TABS: Array<{
  id: DocumentRightTab;
  label: string;
  short: string;
}> = [
  { id: 'report', label: 'Отчёт', short: '📄' },
  { id: 'tools', label: 'Инструменты', short: '✂' },
  { id: 'chat', label: 'Чат', short: '💬' },
];
export const DocumentRightPanel = forwardRef<HTMLElement, Props>(function DocumentRightPanel(
  {
  documentId,
  versions,
  activeVersion,
  versionReady,
  viewerPage,
  onSelectVersion,
  onGoToPage,
  focusedAnnotationId = null,
  focusedGuestCommentId = null,
  onOpenAcceptedEdit,
  onOpenAllAcceptedEdits,
  editTextInjection = null,
  toolsFocusSection = null,
  onToolsFocusSectionHandled,
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
    documentRole = 'owner',
    collapsed,
  onToggleCollapsed,
  onExpand,
  panelWidth,
  isResizing,
  onResizeStart,
  activeTab,
  onTabChange,
  mode = 'docked',
},
  ref,
) {
  const isDrawer = mode === 'drawer';
  const viewportToggle = !isDrawer ? (
    <PanelViewportToggle
      side="right"
      expanded={!collapsed}
      syncedToWorkspace
      onClick={collapsed ? onExpand : onToggleCollapsed}
      title={collapsed ? 'Развернуть панель' : 'Свернуть'}
      className="hidden md:flex"
    />
  ) : null;

  if (collapsed && !isDrawer) {
    return (
      <aside
        ref={ref}
        className="relative hidden h-full shrink-0 flex-col border-l border-slate-200 bg-white md:flex md:w-12"
      >
        {viewportToggle}
        <div className="flex flex-col items-center gap-1.5 p-1.5 pt-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              title={tab.label}
              onClick={() => {
                onTabChange(tab.id);
                onExpand();
              }}
              className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-lg transition ${
                activeTab === tab.id
                  ? 'bg-folio-50 text-folio-700 ring-1 ring-folio-200'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <span aria-hidden>{tab.short}</span>
              <span className="sr-only">{tab.label}</span>
            </button>
          ))}
        </div>
      </aside>
    );
  }
  return (
    <aside
      ref={ref}
      style={isDrawer ? undefined : { width: panelWidth }}
      className={
        isDrawer
          ? 'relative flex h-full min-h-0 flex-col overflow-hidden bg-white'
          : `relative hidden h-full min-h-0 shrink-0 flex-col overflow-visible border-l border-slate-200 bg-white md:flex ${isResizing ? '' : 'transition-[width] duration-200'}`
      }
    >
      {viewportToggle}
      {!isDrawer && <PanelResizeHandle edge="left" onMouseDown={onResizeStart} />}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={`${shellPanelToolbarClass} ${isDrawer ? 'hidden' : ''}`}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`flex h-full min-w-0 flex-1 cursor-pointer items-center justify-center border-b-2 px-1 text-xs font-medium transition sm:px-2 sm:text-sm ${
              activeTab === tab.id
                ? 'border-folio-600 text-folio-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="truncate">{tab.label}</span>
          </button>
        ))}
      </div>
      <div
        className={
          isDrawer
            ? 'relative min-h-0 flex-1 overflow-visible'
            : 'scrollbar-thin relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain'
        }
      >
        {activeTab === 'report' && (
        <div>
          {activeVersion ? (
            <DocumentReportPanel
              documentId={documentId}
              versionId={activeVersion.id}
              versionReady={versionReady}
            />
          ) : (
            <EmptyTab text="Выберите версию" />
          )}
        </div>
        )}
        {activeTab === 'tools' && (
        <div>
          <DocumentPdfOperationsPanel
            embedded
            documentId={documentId}
            versions={versions}
            activeVersion={activeVersion}
            viewerPage={viewerPage}
            onSelectVersion={onSelectVersion}
            onGoToPage={onGoToPage}
            focusedAnnotationId={focusedAnnotationId}
            focusedGuestCommentId={focusedGuestCommentId}
            onOpenAcceptedEdit={onOpenAcceptedEdit}
            onOpenAllAcceptedEdits={onOpenAllAcceptedEdits}
            editTextInjection={editTextInjection}
            versionReady={versionReady}
            focusSection={toolsFocusSection}
            onFocusSectionHandled={onToolsFocusSectionHandled}
            layout={layout}
            layoutAddNotice={layoutAddNotice}
            layoutPageCount={layoutPageCount}
            onAddLayoutImages={onAddLayoutImages}
            reviewStatus={reviewStatus}
            reviewStatusChangedAt={reviewStatusChangedAt}
            documentTitle={documentTitle}
            projectId={projectId}
            projectName={projectName}
            shareLinks={shareLinks}
            openGuestCommentsCount={openGuestCommentsCount}
            needsFixMarksCount={needsFixMarksCount}
            acceptedEditsCount={acceptedEditsCount}
            versionCreatedNotice={versionCreatedNotice}
            onDismissVersionCreatedNotice={onDismissVersionCreatedNotice}
            documentRole={documentRole}
          />
        </div>
        )}
        {activeTab === 'chat' && (
        <div>
          {activeVersion ? (
            <DocumentAiPanel
              embedded
              documentId={documentId}
              versionId={activeVersion.id}
              versionReady={versionReady}
            />
          ) : (
            <EmptyTab text="Выберите версию" />
          )}
        </div>
        )}
      </div>
      </div>
    </aside>
  );
});
function EmptyTab({ text }: { text: string }) {
  return <p className="p-4 text-sm text-slate-500">{text}</p>;
}
