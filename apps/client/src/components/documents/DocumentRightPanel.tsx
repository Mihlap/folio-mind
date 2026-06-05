import {
  shellCollapseBtnClass,
  shellPanelToolbarClass,
} from '../layout/shell-chrome.js';
import { PanelResizeHandle } from '../layout/PanelResizeHandle.js';
import { DocumentAiPanel } from './DocumentAiPanel.js';
import { DocumentPdfOperationsPanel } from './DocumentPdfOperationsPanel.js';
import { DocumentReportPanel } from './DocumentReportPanel.js';
import type { DocumentVersionItem } from './DocumentVersionsPanel.js';

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
  onOpenAcceptedEdit: (page: number, annotationId: string) => void;
  onOpenAllAcceptedEdits: () => void;
  injectedEditBefore?: string | null;
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

const TABS: Array<{ id: DocumentRightTab; label: string; short: string }> = [
  { id: 'report', label: 'Отчёт', short: '📄' },
  { id: 'tools', label: 'Инструменты', short: '✂' },
  { id: 'chat', label: 'Чат', short: '💬' },
];

export function DocumentRightPanel({
  documentId,
  versions,
  activeVersion,
  versionReady,
  viewerPage,
  onSelectVersion,
  onGoToPage,
  focusedAnnotationId = null,
  onOpenAcceptedEdit,
  onOpenAllAcceptedEdits,
  injectedEditBefore = null,
  collapsed,
  onToggleCollapsed,
  onExpand,
  panelWidth,
  isResizing,
  onResizeStart,
  activeTab,
  onTabChange,
  mode = 'docked',
}: Props) {
  const isDrawer = mode === 'drawer';

  if (collapsed && !isDrawer) {
    return (
      <aside className="relative hidden h-full shrink-0 flex-col border-l border-slate-200 bg-white lg:flex lg:w-12">
        <div className={`${shellPanelToolbarClass} justify-end px-1.5`}>
          <button
            type="button"
            title="Развернуть панель"
            onClick={onExpand}
            className={shellCollapseBtnClass}
          >
            ◀
          </button>
        </div>
        <div className="flex flex-col items-center gap-1.5 p-1.5">
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
      style={isDrawer ? undefined : { width: panelWidth }}
      className={
        isDrawer
          ? 'relative flex h-full min-h-0 flex-col overflow-hidden bg-white'
          : `relative hidden h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white lg:flex ${
              isResizing ? '' : 'transition-[width] duration-200'
            }`
      }
    >
      {!isDrawer && <PanelResizeHandle edge="left" onMouseDown={onResizeStart} />}

      <div className={`${shellPanelToolbarClass}`}>
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
        {!isDrawer && (
          <button
            type="button"
            title="Свернуть"
            onClick={onToggleCollapsed}
            className={`hidden lg:block ${shellCollapseBtnClass}`}
          >
            ▶
          </button>
        )}
      </div>
      <div className="scrollbar-thin relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className={activeTab === 'report' ? 'block' : 'hidden'}>
          {activeVersion ? (
            <DocumentReportPanel
              documentId={documentId}
              versionId={activeVersion.id}
              versionReady={versionReady}
              onGoToPage={onGoToPage}
              onSelectVersion={onSelectVersion}
            />
          ) : (
            <EmptyTab text="Выберите версию" />
          )}
        </div>
        <div className={activeTab === 'tools' ? 'block' : 'hidden'}>
          <DocumentPdfOperationsPanel
            embedded
            documentId={documentId}
            versions={versions}
            activeVersion={activeVersion}
            viewerPage={viewerPage}
            onSelectVersion={onSelectVersion}
            onGoToPage={onGoToPage}
            focusedAnnotationId={focusedAnnotationId}
            onOpenAcceptedEdit={onOpenAcceptedEdit}
            onOpenAllAcceptedEdits={onOpenAllAcceptedEdits}
            injectedEditBefore={injectedEditBefore}
            versionReady={versionReady}
          />
        </div>
        <div className={activeTab === 'chat' ? 'block' : 'hidden'}>
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
      </div>
    </aside>
  );
}

function EmptyTab({ text }: { text: string }) {
  return <p className="p-4 text-sm text-slate-500">{text}</p>;
}
