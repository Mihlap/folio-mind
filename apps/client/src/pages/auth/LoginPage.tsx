import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setCredentials, useLoginMutation } from '@folio-mind/store';
import { useAppDispatch } from '../../hooks/index.js';
import { Button } from '../../components/ui/Button.js';
import { PasswordInput } from '../../components/auth/PasswordInput.js';
import { TurnstileWidget } from '../../components/auth/TurnstileWidget.js';
import { OAuthButtons } from '../../components/auth/OAuthButtons.js';
import { AuthLayout } from '../../components/layout/AuthLayout.js';
import { getAuthErrorMessage } from '../../lib/auth/authErrors.js';
import { isTurnstileEnabled } from '../../lib/auth/authConfig.js';

export function LoginPage() {
  const [login, { isLoading, error }] = useLoginMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const showResendLink =
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status?: number }).status === 403;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isTurnstileEnabled && !captchaToken) return;
    try {
      const res = await login({
        email,
        password,
        captchaToken: captchaToken ?? undefined,
      }).unwrap();
      dispatch(setCredentials(res));
      navigate('/app');
    } catch {
      // error shown below
    }
  }

  return (
    <AuthLayout title="Вход" subtitle="Продолжите работу с документами">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} required />
        <PasswordInput
          label="Пароль"
          value={password}
          onChange={setPassword}
          required
          autoComplete="current-password"
        />
        <TurnstileWidget onToken={setCaptchaToken} className="flex justify-center" />
        {error && (
          <p className="text-sm text-red-600">
            {getAuthErrorMessage(error, 'Неверный email или пароль')}
          </p>
        )}
        {showResendLink && (
          <p className="text-sm">
            <Link to="/check-email" className="font-medium text-folio-600 hover:underline">
              Отправить письмо подтверждения повторно
            </Link>
          </p>
        )}
        <Button
          type="submit"
          className="w-full"
          disabled={isLoading || (isTurnstileEnabled && !captchaToken)}
        >
          {isLoading ? 'Вход…' : 'Войти'}
        </Button>
        <div className="text-center text-sm">
          <Link to="/magic-link" className="font-medium text-folio-600 hover:underline">
            Войти по ссылке на почту
          </Link>
          {' · '}
          <Link to="/forgot-password" className="font-medium text-folio-600 hover:underline">
            Забыли пароль?
          </Link>
        </div>
      </form>
      <div className="mt-6">
        <OAuthButtons />
      </div>
      <p className="mt-6 text-center text-sm text-slate-500">
        Нет аккаунта?{' '}
        <Link to="/register" className="font-medium text-folio-600 hover:underline">
          Регистрация
        </Link>
      </p>
    </AuthLayout>
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
