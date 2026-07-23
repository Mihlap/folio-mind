import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useRegisterMutation } from '@folio-mind/store';
import { Button } from '../../components/ui/Button.js';
import { PasswordInput } from '../../components/auth/PasswordInput.js';
import { TurnstileWidget } from '../../components/auth/TurnstileWidget.js';
import { OAuthButtons } from '../../components/auth/OAuthButtons.js';
import { PhoneAuthForm } from '../../components/auth/PhoneAuthForm.js';
import { AuthLayout } from '../../components/layout/AuthLayout.js';
import { getAuthErrorMessage, validatePasswordClient } from '../../lib/auth/authErrors.js';
import { isTurnstileEnabled } from '../../lib/auth/authConfig.js';
import { setPendingVerifyEmail } from '../../lib/auth/pending-verify-email.js';

type AuthTab = 'email' | 'phone';

type TenantInvitePreview = {
  valid: true;
  email: string | null;
  tenantName: string;
  documentTitle: string | null;
  documentRole: string | null;
};

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite')?.trim() || null;
  const [tab, setTab] = useState<AuthTab>('email');
  const [register, { isLoading, error }] = useRegisterMutation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [invitePreview, setInvitePreview] = useState<TenantInvitePreview | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/auth/tenant-invite?token=${encodeURIComponent(inviteToken)}`,
        );
        if (!res.ok) {
          if (!cancelled) setInviteError('Ссылка приглашения недействительна или истекла');
          return;
        }
        const data = (await res.json()) as TenantInvitePreview;
        if (cancelled) return;
        setInvitePreview(data);
        if (data.email) setEmail(data.email);
      } catch {
        if (!cancelled) setInviteError('Не удалось проверить ссылку приглашения');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setClientError(null);
    const pwdErr = validatePasswordClient(password, confirmPassword);
    if (pwdErr) {
      setClientError(pwdErr);
      return;
    }
    if (!email.includes('@')) {
      setClientError('Некорректный email');
      return;
    }
    if (isTurnstileEnabled && !captchaToken) {
      setClientError('Подтвердите, что вы не робот');
      return;
    }
    try {
      const res = await register({
        email,
        password,
        name: name || undefined,
        captchaToken: captchaToken ?? undefined,
        inviteToken: inviteToken ?? undefined,
      }).unwrap();
      setPendingVerifyEmail(res.email);
      navigate('/check-email', { state: { email: res.email } });
    } catch {
      // The mutation error state renders the message below.
    }
  }

  const displayError =
    clientError ?? (error ? getAuthErrorMessage(error, 'Не удалось зарегистрироваться') : null);
  const emailAlreadyRegistered =
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status?: number }).status === 409;

  const subtitle = invitePreview
    ? `Присоединение к «${invitePreview.tenantName}»`
    : 'Создайте рабочее пространство';

  return (
    <AuthLayout title="Регистрация" subtitle={subtitle}>
      {invitePreview && (
        <p className="mb-3 rounded-lg border border-folio-200 bg-folio-50 px-3 py-2 text-sm text-folio-900">
          {invitePreview.documentTitle
            ? `После подтверждения почты вы получите доступ к документу «${invitePreview.documentTitle}».`
            : 'После подтверждения почты вы присоединитесь к рабочему пространству команды.'}
        </p>
      )}
      {inviteError && <p className="mb-3 text-sm text-rose-600">{inviteError}</p>}

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
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Имя (необязательно)</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 outline-none focus:border-folio-500 focus:ring-2 focus:ring-folio-500"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={Boolean(invitePreview?.email)}
                required
                autoComplete="email"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 outline-none focus:border-folio-500 focus:ring-2 focus:ring-folio-500 read-only:bg-slate-50"
              />
            </label>
            <PasswordInput
              label="Пароль"
              value={password}
              onChange={setPassword}
              required
              minLength={8}
              autoComplete="new-password"
              hint={
                <p className="mt-1 text-xs text-slate-400">
                  Мин. 8 символов, заглавная и строчная буква, цифра
                </p>
              }
            />
            <PasswordInput
              label="Повторите пароль"
              value={confirmPassword}
              onChange={setConfirmPassword}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <TurnstileWidget onToken={setCaptchaToken} className="flex justify-center" />
            {displayError && <p className="text-sm text-red-600">{displayError}</p>}
            {emailAlreadyRegistered && inviteToken && (
              <p className="text-sm text-slate-600">
                Уже есть аккаунт?{' '}
                <Link
                  to={`/login?invite=${encodeURIComponent(inviteToken)}`}
                  className="font-medium text-folio-600 hover:underline"
                >
                  Войти и присоединиться
                </Link>
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || (isTurnstileEnabled && !captchaToken)}
            >
              {isLoading ? 'Создание…' : invitePreview ? 'Присоединиться' : 'Создать аккаунт'}
            </Button>
          </form>
        </div>
        <div
          className={`transition-all duration-300 ease-out ${
            tab === 'phone'
              ? 'opacity-100 translate-y-0 delay-75'
              : 'opacity-0 translate-y-2 absolute inset-x-0 top-0 pointer-events-none'
          }`}
        >
          <PhoneAuthForm mode="register" />
        </div>
      </div>

      <div className="mt-4">
        <OAuthButtons />
      </div>
      <p className="mt-4 text-center text-sm text-slate-500">
        <Link to="/login" className="font-medium text-folio-600 hover:underline">
          Уже есть аккаунт
        </Link>
      </p>
    </AuthLayout>
  );
}
