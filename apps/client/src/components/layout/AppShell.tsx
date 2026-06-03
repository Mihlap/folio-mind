import { NavLink, Outlet, useMatch } from 'react-router-dom';
import { logout, useMeQuery } from '@folio-mind/store';
import { DocumentVersionsSidebar } from '../documents/DocumentVersionsSidebar.js';
import { useDocumentWorkspaceOptional } from '../../context/document-workspace-context.js';
import { useAppDispatch } from '../../hooks/index.js';
import { Button } from '../ui/Button.js';

const nav = [
  { to: '/app', label: 'Документы', end: true },
  { to: '/app', label: 'ИИ-проверка', end: false, disabled: true },
];

export function AppShell() {
  const dispatch = useAppDispatch();
  const { data: me } = useMeQuery();
  const workspaceCtx = useDocumentWorkspaceOptional();
  const isDocumentPage = Boolean(useMatch('/app/documents/:id'));
  const hasVersions = Boolean(workspaceCtx?.workspace && isDocumentPage);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 md:h-screen md:flex-row md:overflow-hidden">
      <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white md:h-full md:w-60 md:border-r md:border-b-0 lg:w-64">
        <div className="border-b border-slate-100 px-4 py-4 md:px-5 md:py-5">
          <span className="font-display text-xl text-folio-950 md:text-2xl">РазУм</span>
          <p className="mt-1 truncate text-[11px] text-slate-500 md:text-xs">{me?.email}</p>
        </div>
        <nav
          className={`overflow-x-auto p-2 md:p-3 ${hasVersions ? 'shrink-0' : 'flex-1 md:overflow-y-auto'}`}
        >
          <div className="flex min-w-max gap-1 md:block md:min-w-0">
            {nav.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
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

        <div className="mt-auto border-t border-slate-100 p-3 md:p-4">
          <Button variant="ghost" className="w-full" onClick={() => dispatch(logout())}>
            Выйти
          </Button>
        </div>
      </aside>

      <main
        className={`flex min-h-0 flex-1 flex-col ${
          isDocumentPage ? 'overflow-hidden' : 'overflow-auto'
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}
