import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRequestMagicLinkMutation } from '@folio-mind/store';
import { Button } from '../../components/ui/Button.js';
import { TurnstileWidget } from '../../components/auth/TurnstileWidget.js';
import { AuthLayout } from '../../components/layout/AuthLayout.js';
import { getAuthErrorMessage } from '../../lib/auth/authErrors.js';
import { isTurnstileEnabled } from '../../lib/auth/authConfig.js';

export function MagicLinkPage() {
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [requestMagicLink, { isLoading, error }] = useRequestMagicLinkMutation();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isTurnstileEnabled && !captchaToken) return;
    setSent(false);
    try {
      await requestMagicLink({
        email,
        captchaToken: captchaToken ?? undefined,
      }).unwrap();
      setSent(true);
    } catch {
      // shown below
    }
  }

  return (
    <AuthLayout title="Вход по ссылке" subtitle="Без пароля — письмо на почту">
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-folio-500 focus:ring-2 focus:ring-folio-500"
          />
        </label>
        <TurnstileWidget onToken={setCaptchaToken} className="flex justify-center" />
        {sent && (
          <p className="text-sm text-emerald-700">
            Если email корректен, мы отправили ссылку для входа. Проверьте почту (и папку «Спам»).
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600">
            {getAuthErrorMessage(error, 'Не удалось отправить ссылку')}
          </p>
        )}
        <Button
          type="submit"
          className="w-full"
          disabled={isLoading || (isTurnstileEnabled && !captchaToken)}
        >
          {isLoading ? 'Отправляем…' : 'Получить ссылку для входа'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        <Link to="/login" className="font-medium text-folio-600 hover:underline">
          Войти с паролем
        </Link>
      </p>
    </AuthLayout>
  );
}
