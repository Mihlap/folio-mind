import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setCredentials, useRegisterMutation } from '@folio-mind/store';
import { useAppDispatch } from '../hooks';
import { Button } from '../components/Button';
import { AuthLayout } from './LoginPage';

export function RegisterPage() {
  const [register, { isLoading, error }] = useRegisterMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await register({ email, password, name: name || undefined }).unwrap();
      dispatch(setCredentials(res));
      navigate('/app');
    } catch {
      /* shown below */
    }
  }

  return (
    <AuthLayout title="Регистрация" subtitle="Создайте рабочее пространство">
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Имя</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-folio-500 focus:ring-2 focus:ring-folio-500"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-folio-500 focus:ring-2 focus:ring-folio-500"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Пароль (мин. 8)</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-folio-500 focus:ring-2 focus:ring-folio-500"
          />
        </label>
        {error && (
          <p className="text-sm text-red-600">
            {'status' in error && error.status === 409
              ? 'Этот email уже зарегистрирован'
              : 'data' in error &&
                  error.data &&
                  typeof error.data === 'object' &&
                  'error' in error.data &&
                  typeof (error.data as { error: string }).error === 'string'
                ? (error.data as { error: string }).error
                : 'Не удалось зарегистрироваться. Проверьте, что API запущен (pnpm dev).'}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Создание…' : 'Создать аккаунт'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        <Link to="/login" className="font-medium text-folio-600 hover:underline">
          Уже есть аккаунт
        </Link>
      </p>
    </AuthLayout>
  );
}
