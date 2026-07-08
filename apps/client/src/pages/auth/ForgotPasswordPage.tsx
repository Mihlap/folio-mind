import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForgotPasswordMutation } from '@folio-mind/store';
import { Button } from '../../components/ui/Button.js';
import { AuthLayout } from '../../components/layout/AuthLayout.js';
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [forgotPassword, { isLoading, error }] = useForgotPasswordMutation();
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSent(false);
    try {
      await forgotPassword({ email }).unwrap();
      setSent(true);
    } catch {
      // The mutation error state renders the message below.
    }
  }
  return (
    <AuthLayout title="Восстановление пароля" subtitle="Отправим ссылку для сброса">
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 outline-none ring-folio-500 focus:border-folio-500 focus:ring-2"
          />
        </label>

        {sent && (
          <p className="text-sm text-emerald-700">
            Если такой email зарегистрирован, мы отправили ссылку для сброса пароля.
          </p>
        )}

        {error && (
          <p className="text-sm text-red-600">
            {'status' in error &&
            error.status === 503 &&
            error.data &&
            typeof error.data === 'object' &&
            'error' in error.data
              ? String(
                  (
                    error.data as {
                      error: string;
                    }
                  ).error,
                )
              : 'Не удалось отправить. Попробуйте еще раз позже.'}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Отправляем…' : 'Отправить ссылку'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link to="/login" className="font-medium text-folio-600 hover:underline">
          Вернуться ко входу
        </Link>
      </p>
    </AuthLayout>
  );
}
