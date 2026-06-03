import type { ReactNode } from 'react';
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
        <div className="flex w-full shrink-0 items-center justify-end border-b border-slate-100 px-1.5 py-2">
          <button
            type="button"
            title="Развернуть панель"
            onClick={onExpand}
            className="cursor-pointer rounded-lg px-0.5 py-0.5 text-xs leading-none text-slate-400 hover:bg-slate-50"
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
          ? 'relative flex h-full min-h-0 flex-col bg-white'
          : `relative hidden h-full min-h-0 shrink-0 flex-col border-l border-slate-200 bg-white lg:flex ${
              isResizing ? '' : 'transition-[width] duration-200'
            }`
      }
    >
      {!isDrawer && <PanelResizeHandle edge="left" onMouseDown={onResizeStart} />}

      <div className="flex shrink-0 items-center border-b border-slate-100">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`min-w-0 flex-1 cursor-pointer border-b-2 px-1 py-2.5 text-xs font-medium transition sm:px-2 sm:text-sm ${
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
            className="hidden shrink-0 cursor-pointer px-2 py-2 text-xs text-slate-400 hover:text-slate-600 lg:block"
          >
            ▶
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TabPanel active={activeTab === 'report'}>
          {activeVersion ? (
            <DocumentReportPanel
              documentId={documentId}
              versionId={activeVersion.id}
              versionReady={versionReady}
            />
          ) : (
            <EmptyTab text="Выберите версию" />
          )}
        </TabPanel>
        <TabPanel active={activeTab === 'tools'}>
          <DocumentPdfOperationsPanel
            embedded
            documentId={documentId}
            versions={versions}
            activeVersion={activeVersion}
            viewerPage={viewerPage}
            onSelectVersion={onSelectVersion}
          />
        </TabPanel>
        <TabPanel active={activeTab === 'chat'}>
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
        </TabPanel>
      </div>
    </aside>
  );
}

function TabPanel({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div className={active ? 'block' : 'hidden'} aria-hidden={!active}>
      {children}
    </div>
  );
}

function EmptyTab({ text }: { text: string }) {
  return <p className="p-4 text-sm text-slate-500">{text}</p>;
}
