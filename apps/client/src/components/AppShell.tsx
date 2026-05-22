import { NavLink, Outlet } from 'react-router-dom';
import { logout, useMeQuery } from '@folio-mind/store';
import { useAppDispatch } from '../hooks';
import { Button } from './Button';

const nav = [
  { to: '/app', label: 'Документы', end: true },
  { to: '/app', label: 'ИИ-проверка', end: false, disabled: true },
];

export function AppShell() {
  const dispatch = useAppDispatch();
  const { data: me } = useMeQuery();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-6">
          <span className="font-display text-2xl text-folio-950">Folio Mind</span>
          <p className="mt-1 truncate text-xs text-slate-500">{me?.email}</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium transition ${
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
        </nav>
        <div className="border-t border-slate-100 p-4">
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => dispatch(logout())}
          >
            Выйти
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
