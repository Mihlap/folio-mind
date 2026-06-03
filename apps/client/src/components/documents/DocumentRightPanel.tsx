import type { ReactNode } from 'react';
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
  activeTab: DocumentRightTab;
  onTabChange: (tab: DocumentRightTab) => void;
  /** В drawer на мобиле — всегда развёрнутая панель. */
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
  activeTab,
  onTabChange,
  mode = 'docked',
}: Props) {
  const isDrawer = mode === 'drawer';

  if (collapsed && !isDrawer) {
    return (
      <aside className="hidden shrink-0 flex-col items-center gap-2 border-l border-slate-200 bg-white py-3 lg:flex lg:w-12">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            title={tab.label}
            onClick={() => {
              onTabChange(tab.id);
              onToggleCollapsed();
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
        <button
          type="button"
          title="Развернуть панель"
          onClick={onToggleCollapsed}
          className="mt-auto cursor-pointer rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-50"
        >
          ◀
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={
        isDrawer
          ? 'flex h-full min-h-0 flex-col bg-white'
          : 'hidden min-h-0 w-full shrink-0 flex-col border-l border-slate-200 bg-white lg:flex lg:w-[360px] xl:w-[380px]'
      }
    >
      <div className="flex shrink-0 items-center border-b border-slate-100">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 cursor-pointer border-b-2 px-2 py-2.5 text-xs font-medium transition sm:text-sm ${
              activeTab === tab.id
                ? 'border-folio-600 text-folio-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
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
