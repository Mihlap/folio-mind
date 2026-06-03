import { NavLink, Outlet, useMatch } from 'react-router-dom';
import { logout, useMeQuery } from '@folio-mind/store';
import { DocumentVersionsSidebar } from '../documents/DocumentVersionsSidebar.js';
import { useDocumentWorkspaceOptional } from '../../context/document-workspace-context.js';
import { useHorizontalPanelResize } from '../../hooks/useHorizontalPanelResize.js';
import { useAppDispatch } from '../../hooks/index.js';
import { Button } from '../ui/Button.js';
import { PanelResizeHandle } from './PanelResizeHandle.js';

const nav: Array<{
  to: string;
  label: string;
  end: boolean;
  icon: string;
  disabled?: boolean;
}> = [
  { to: '/app', label: 'Документы', end: true, icon: '📄' },
  { to: '/app', label: 'ИИ-проверка', end: false, disabled: true, icon: '🤖' },
];

const LEFT_PANEL = {
  defaultWidth: 224,
  minExpandedWidth: 168,
  collapseBelow: 152,
  maxWidth: 320,
} as const;

export function AppShell() {
  const dispatch = useAppDispatch();
  const { data: me } = useMeQuery();
  const workspaceCtx = useDocumentWorkspaceOptional();
  const isDocumentPage = Boolean(useMatch('/app/documents/:id'));
  const hasVersions = Boolean(workspaceCtx?.workspace && isDocumentPage);

  const sidebar = useHorizontalPanelResize({
    side: 'left',
    ...LEFT_PANEL,
  });

  const activeVersionLabel = workspaceCtx?.workspace?.versions.find(
    (v) => v.id === workspaceCtx.workspace?.selectedVersionId,
  )?.version;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 md:h-screen md:flex-row md:overflow-hidden">
      <aside
        style={{ width: sidebar.collapsed ? undefined : sidebar.panelWidth }}
        className={`relative hidden shrink-0 flex-col border-r border-slate-200 bg-white md:flex ${
          sidebar.collapsed ? 'md:w-12' : ''
        } ${sidebar.isResizing ? 'transition-none' : 'transition-[width] duration-200'}`}
      >
        {sidebar.collapsed ? (
          <>
            <div className="flex w-full shrink-0 justify-center border-b border-slate-100 px-1.5 py-2">
              <span className="font-display text-lg leading-none text-folio-950" title="РазУм">
                Р
              </span>
            </div>

            <nav className="flex flex-col items-center gap-1 p-1.5">
              <div className="flex flex-col items-center gap-0.5">
                <NavLink
                  to="/app"
                  end
                  title="Документы"
                  className={({ isActive }) =>
                    `flex h-10 w-10 items-center justify-center rounded-lg text-lg transition ${
                      isActive
                        ? 'bg-folio-50 ring-1 ring-folio-200'
                        : 'text-slate-500 hover:bg-slate-50'
                    }`
                  }
                >
                  <span aria-hidden>📄</span>
                  <span className="sr-only">Документы</span>
                </NavLink>
                <button
                  type="button"
                  title="Развернуть меню"
                  onClick={sidebar.expand}
                  className="cursor-pointer rounded-lg px-1 py-0.5 text-[10px] leading-none text-slate-400 hover:bg-slate-50"
                >
                  ▶
                </button>
              </div>
              {nav.slice(1).map((item) => (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end={item.end}
                  title={item.label}
                  className={({ isActive }) =>
                    `flex h-10 w-10 items-center justify-center rounded-lg text-lg transition ${
                      item.disabled
                        ? 'cursor-not-allowed opacity-30'
                        : isActive
                          ? 'bg-folio-50 ring-1 ring-folio-200'
                          : 'text-slate-500 hover:bg-slate-50'
                    }`
                  }
                  onClick={(e) => item.disabled && e.preventDefault()}
                >
                  <span aria-hidden>{item.icon}</span>
                  <span className="sr-only">{item.label}</span>
                </NavLink>
              ))}
            </nav>

            {hasVersions && (
              <button
                type="button"
                title={
                  activeVersionLabel
                    ? `Версии · v${activeVersionLabel}`
                    : 'Версии документа'
                }
                onClick={sidebar.expand}
                className="mx-auto mt-2 flex h-10 w-10 cursor-pointer flex-col items-center justify-center rounded-lg text-[11px] font-medium text-folio-700 hover:bg-folio-50"
              >
                <span aria-hidden className="text-base leading-none">
                  📑
                </span>
                {activeVersionLabel != null && (
                  <span className="mt-0.5 leading-none">v{activeVersionLabel}</span>
                )}
              </button>
            )}

            <div className="mt-auto border-t border-slate-100 p-1.5">
              <button
                type="button"
                title="Выйти"
                onClick={() => dispatch(logout())}
                className="flex h-10 w-full cursor-pointer items-center justify-center rounded-lg text-xs text-slate-500 hover:bg-slate-50"
              >
                ⎋
                <span className="sr-only">Выйти</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="border-b border-slate-100 px-3 py-3 md:px-3.5 md:py-4">
              <span className="font-display text-lg text-folio-950 md:text-xl">РазУм</span>
              <p className="mt-0.5 truncate text-[10px] text-slate-500 md:text-[11px]">
                {me?.email}
              </p>
            </div>

            <nav
              className={`overflow-x-auto p-1.5 md:p-2 ${hasVersions ? 'shrink-0' : 'flex-1 md:overflow-y-auto'}`}
            >
              <div className="flex min-w-max flex-col gap-1 md:min-w-0">
                <div className="flex items-center gap-1">
                  <NavLink
                    to="/app"
                    end
                    className={({ isActive }) =>
                      `min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition ${
                        isActive
                          ? 'bg-folio-50 text-folio-700'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`
                    }
                  >
                    Документы
                  </NavLink>
                  <button
                    type="button"
                    title="Свернуть меню"
                    onClick={sidebar.toggleCollapsed}
                    className="shrink-0 cursor-pointer rounded-lg px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-50"
                  >
                    ◀
                  </button>
                </div>
                {nav.slice(1).map((item) => (
                  <NavLink
                    key={item.label}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `block rounded-lg px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition ${
                        item.disabled
                          ? 'cursor-not-allowed text-slate-300'
                          : isActive
                            ? 'bg-folio-50 text-folio-700'
                            : 'text-slate-600 hover:bg-slate-50'
                      }`
                    }
                    onClick={(e) => item.disabled && e.preventDefault()}
                  >
                    {item.label}
                    {item.disabled && (
                      <span className="ml-2 text-[10px] uppercase text-slate-400">скоро</span>
                    )}
                  </NavLink>
                ))}
              </div>
            </nav>

            {hasVersions && (
              <div className="hidden min-h-0 flex-1 flex-col overflow-hidden border-t border-slate-100 md:flex">
                <DocumentVersionsSidebar />
              </div>
            )}

            <div className="mt-auto border-t border-slate-100 p-2 md:p-3">
              <Button variant="ghost" className="w-full" onClick={() => dispatch(logout())}>
                Выйти
              </Button>
            </div>

            <PanelResizeHandle edge="right" onMouseDown={sidebar.beginResize} />
          </>
        )}
      </aside>

      {/* Мобильная шапка навигации */}
      <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white md:hidden">
        <div className="border-b border-slate-100 px-3 py-3">
          <span className="font-display text-lg text-folio-950">РазУм</span>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">{me?.email}</p>
        </div>
        <nav className="overflow-x-auto p-1.5">
          <div className="flex min-w-max gap-1">
            {nav.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `block rounded-lg px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition ${
                    item.disabled
                      ? 'cursor-not-allowed text-slate-300'
                      : isActive
                        ? 'bg-folio-50 text-folio-700'
                        : 'text-slate-600 hover:bg-slate-50'
                  }`
                }
                onClick={(e) => item.disabled && e.preventDefault()}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </aside>

      <MainContent isDocumentPage={isDocumentPage} />
    </div>
  );
}

function MainContent({ isDocumentPage }: { isDocumentPage: boolean }) {
  return (
    <main
      className={`flex min-h-0 flex-1 flex-col ${
        isDocumentPage ? 'overflow-hidden' : 'overflow-auto'
      }`}
    >
      <Outlet />
    </main>
  );
}
