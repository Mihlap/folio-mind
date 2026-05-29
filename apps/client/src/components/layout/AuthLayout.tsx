import { Link } from 'react-router-dom';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-folio-50 via-white to-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-200/50">
        <div className="text-center">
          <Link
            to="/"
            className="font-display text-3xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-folio-700 via-folio-950 to-slate-900"
          >
            РазУм
          </Link>
          <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 inline-block rounded-xl bg-folio-50 px-3 py-1 text-sm font-medium text-folio-950">
            {subtitle}
          </p>
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
