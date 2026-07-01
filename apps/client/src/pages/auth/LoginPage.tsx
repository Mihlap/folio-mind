import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setCredentials, useLoginMutation } from '@folio-mind/store';
import { useAppDispatch } from '../../hooks/index.js';
import { Button } from '../../components/ui/Button.js';
import { PasswordInput } from '../../components/auth/PasswordInput.js';
import { TurnstileWidget } from '../../components/auth/TurnstileWidget.js';
import { OAuthButtons } from '../../components/auth/OAuthButtons.js';
import { PhoneAuthForm } from '../../components/auth/PhoneAuthForm.js';
import { AuthLayout } from '../../components/layout/AuthLayout.js';
import { getAuthErrorMessage } from '../../lib/auth/authErrors.js';
import { isTurnstileEnabled } from '../../lib/auth/authConfig.js';
type AuthTab = 'email' | 'phone';
export function LoginPage() {
  const [tab, setTab] = useState<AuthTab>('email');
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
    (
      error as {
        status?: number;
      }
    ).status === 403;
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
    } catch {}
  }
  return (
    <AuthLayout title="Вход" subtitle="Продолжите работу с документами">
      <div className="relative mb-4 flex rounded-lg border border-slate-200 bg-slate-50 p-1">
        <div
          className="absolute inset-y-1 rounded-md bg-white shadow-sm transition-all duration-300 ease-out"
          style={{
            left: tab === 'email' ? '4px' : 'calc(50% + 4px)',
            width: 'calc(50% - 8px)',
          }}
        />
        <button
          type="button"
          onClick={() => setTab('email')}
          className={`relative z-10 flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ${
            tab === 'email' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Почта
        </button>
        <button
          type="button"
          onClick={() => setTab('phone')}
          className={`relative z-10 flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ${
            tab === 'phone' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Телефон
        </button>
      </div>

      <div className="relative">
        <div
          className={`transition-all duration-300 ease-out ${
            tab === 'email'
              ? 'opacity-100 translate-y-0 delay-75'
              : 'opacity-0 translate-y-2 absolute inset-x-0 top-0 pointer-events-none'
          }`}
        >
          <form onSubmit={onSubmit} className="space-y-3">
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
            <div className="flex flex-col gap-2 text-center text-sm sm:flex-row sm:justify-center sm:gap-0">
              <Link to="/magic-link" className="font-medium text-folio-600 hover:underline">
                Войти по ссылке на почту
              </Link>
              <span className="hidden text-slate-400 sm:inline sm:px-2">·</span>
              <Link to="/forgot-password" className="font-medium text-folio-600 hover:underline">
                Забыли пароль?
              </Link>
            </div>
          </form>
        </div>
        <div
          className={`transition-all duration-300 ease-out ${
            tab === 'phone'
              ? 'opacity-100 translate-y-0 delay-75'
              : 'opacity-0 translate-y-2 absolute inset-x-0 top-0 pointer-events-none'
          }`}
        >
          <PhoneAuthForm mode="login" />
        </div>
      </div>

      <div className="mt-4">
        <OAuthButtons />
      </div>
      <p className="mt-4 text-center text-sm text-slate-500">
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
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-slate-900 outline-none ring-folio-500 focus:border-folio-500 focus:ring-2"
      />
    </label>
  );
}
