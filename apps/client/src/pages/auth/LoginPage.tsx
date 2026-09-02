import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  setCredentials,
  useAcceptTenantInviteMutation,
  useLoginMutation,
} from '@folio-mind/store';
import { useAppDispatch } from '../../hooks/index.js';
import { Button } from '../../components/ui/Button.js';
import { PasswordInput } from '../../components/auth/PasswordInput.js';
import { TurnstileWidget } from '../../components/auth/TurnstileWidget.js';
// import { OAuthButtons } from '../../components/auth/OAuthButtons.js';
// import { PhoneAuthForm } from '../../components/auth/PhoneAuthForm.js';
import { AuthLayout } from '../../components/layout/AuthLayout.js';
import { getAuthErrorMessage } from '../../lib/auth/authErrors.js';
import { isTurnstileEnabled } from '../../lib/auth/authConfig.js';
import {
  clearPendingVerifyEmail,
  getPendingVerifyEmail,
} from '../../lib/auth/pending-verify-email.js';

// type AuthTab = 'email' | 'phone';

type TenantInvitePreview = {
  valid: true;
  email: string | null;
  tenantName: string;
  documentTitle: string | null;
  documentRole: string | null;
};

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite')?.trim() || null;
  // const [tab, setTab] = useState<AuthTab>('email');
  const [login, { isLoading, error }] = useLoginMutation();
  const [acceptTenantInvite] = useAcceptTenantInviteMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [email, setEmail] = useState(() => getPendingVerifyEmail() ?? '');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [invitePreview, setInvitePreview] = useState<TenantInvitePreview | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteAcceptError, setInviteAcceptError] = useState<string | null>(null);

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
    setInviteAcceptError(null);
    if (isTurnstileEnabled && !captchaToken) return;
    try {
      const res = await login({
        email,
        password,
        captchaToken: captchaToken ?? undefined,
      }).unwrap();
      clearPendingVerifyEmail();
      dispatch(setCredentials(res));

      if (inviteToken) {
        try {
          const accepted = await acceptTenantInvite({ inviteToken }).unwrap();
          dispatch(
            setCredentials({
              token: accepted.token,
              user: accepted.user,
            }),
          );
          if (accepted.documentId) {
            navigate(`/app/documents/${accepted.documentId}`);
            return;
          }
        } catch (acceptErr) {
          setInviteAcceptError(
            getAuthErrorMessage(acceptErr, 'Не удалось принять приглашение'),
          );
        }
      }

      navigate('/app');
    } catch {
      // The mutation error state renders the message below.
    }
  }

  const subtitle = invitePreview
    ? `Присоединение к «${invitePreview.tenantName}»`
    : 'Продолжите работу с документами';

  return (
    <AuthLayout title="Вход" subtitle={subtitle}>
      {invitePreview && (
        <p className="mb-3 rounded-lg border border-folio-200 bg-folio-50 px-3 py-2 text-sm text-folio-900">
          {invitePreview.documentTitle
            ? `После входа вы получите доступ к документу «${invitePreview.documentTitle}».`
            : 'После входа вы присоединитесь к рабочему пространству команды.'}
        </p>
      )}
      {inviteError && <p className="mb-3 text-sm text-rose-600">{inviteError}</p>}
      {inviteAcceptError && <p className="mb-3 text-sm text-rose-600">{inviteAcceptError}</p>}

      {/* Временно скрыты: табы Почта/Телефон, PhoneAuthForm, OAuthButtons
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
      */}

      {/* Временно скрыто: переключение между email/phone */}
      <form onSubmit={onSubmit} className="space-y-3">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          readOnly={Boolean(invitePreview?.email)}
          required
        />
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
          {isLoading ? 'Вход…' : invitePreview ? 'Войти и присоединиться' : 'Войти'}
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

      {/* Временно скрыто: кнопки Яндекс и Госуслуги
      <div className="mt-4">
        <OAuthButtons />
      </div>
      */}
      <p className="mt-4 text-center text-sm text-slate-500">
        Нет аккаунта?{' '}
        <Link
          to={inviteToken ? `/register?invite=${encodeURIComponent(inviteToken)}` : '/register'}
          className="font-medium text-folio-600 hover:underline"
        >
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
  readOnly,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        readOnly={readOnly}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-slate-900 outline-none ring-folio-500 focus:border-folio-500 focus:ring-2 read-only:bg-slate-50"
      />
    </label>
  );
}
