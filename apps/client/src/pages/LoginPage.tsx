import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setCredentials, useLoginMutation } from '@folio-mind/store';
import { useAppDispatch } from '../hooks';
import { Button } from '../components/Button';

export function LoginPage() {
  const [login, { isLoading, error }] = useLoginMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await login({ email, password }).unwrap();
      dispatch(setCredentials(res));
      navigate('/app');
    } catch {
      /* shown below */
    }
  }

  return (
    <AuthLayout title="Вход" subtitle="Продолжите работу с документами">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} required />
        <Field
          label="Пароль"
          type="password"
          value={password}
          onChange={setPassword}
          required
        />
        {error && <p className="text-sm text-red-600">Неверный email или пароль</p>}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Вход…' : 'Войти'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Нет аккаунта?{' '}
        <Link to="/register" className="font-medium text-folio-600 hover:underline">
          Регистрация
        </Link>
      </p>
    </AuthLayout>
  );
}

function AuthLayout({
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
        <Link to="/" className="font-display text-2xl text-folio-950">
          Folio Mind
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  required,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 outline-none ring-folio-500 focus:border-folio-500 focus:ring-2"
      />
    </label>
  );
}

export { AuthLayout };
