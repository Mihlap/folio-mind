import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  setToken,
  useEmailVerificationStatusMutation,
  useResendVerificationMutation,
} from '@folio-mind/store';
import { useAppDispatch } from '../../hooks/index.js';
import { Button } from '../../components/ui/Button.js';
import { AuthLayout } from '../../components/layout/AuthLayout.js';
import { getAuthErrorMessage } from '../../lib/auth/authErrors.js';
import { getStoredAuthToken, subscribeToAuthFromOtherTabs } from '../../lib/auth/authCrossTab.js';
import {
  clearPendingVerifyEmail,
  getPendingVerifyEmail,
  setPendingVerifyEmail,
} from '../../lib/auth/pending-verify-email.js';
type LocationState = {
  email?: string;
};
export function CheckEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const state = (location.state as LocationState | null) ?? {};
  const [email, setEmail] = useState(state.email ?? getPendingVerifyEmail() ?? '');
  const [verifiedInOtherTab, setVerifiedInOtherTab] = useState(false);
  const [resend, { isLoading, isSuccess, error }] = useResendVerificationMutation();
  const [checkVerificationStatus] = useEmailVerificationStatusMutation();

  useEffect(() => {
    if (email.trim()) setPendingVerifyEmail(email);
  }, [email]);

  useEffect(() => {
    function enterApp() {
      const token = getStoredAuthToken();
      if (!token) {
        setVerifiedInOtherTab(true);
        return;
      }
      clearPendingVerifyEmail();
      dispatch(setToken(token));
      navigate('/app', { replace: true });
    }
    const existing = getStoredAuthToken();
    if (existing) {
      clearPendingVerifyEmail();
      dispatch(setToken(existing));
      navigate('/app', { replace: true });
      return;
    }
    return subscribeToAuthFromOtherTabs(enterApp);
  }, [dispatch, navigate]);
  useEffect(() => {
    const currentEmail = email.trim();
    if (!currentEmail) return;
    if (verifiedInOtherTab) return;
    const interval = window.setInterval(() => {
      void checkVerificationStatus({ email: currentEmail })
        .unwrap()
        .then((res) => {
          if (res.verified) {
            setVerifiedInOtherTab(true);
          }
        })
        .catch(() => {});
    }, 3000);
    return () => window.clearInterval(interval);
  }, [email, verifiedInOtherTab, checkVerificationStatus]);
  async function onResend(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setPendingVerifyEmail(email);
    await resend({ email: email.trim() });
  }
  if (verifiedInOtherTab) {
    return (
      <AuthLayout title="Email подтверждён" subtitle="Регистрация завершена">
        <p className="text-sm text-slate-600">
          Адрес <strong>{email || 'ваш email'}</strong> подтверждён. Войдите в аккаунт с тем же
          паролем — повторная регистрация не нужна.
        </p>
        <Button
          type="button"
          className="mt-6 w-full"
          onClick={() => {
            clearPendingVerifyEmail();
            navigate('/login');
          }}
        >
          Войти
        </Button>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Проверьте почту" subtitle="Подтвердите регистрацию">
      <p className="text-sm text-slate-600">
        Мы отправили ссылку на <strong>{email || 'ваш email'}</strong>. Откройте письмо и нажмите
        «Подтвердить email». Не закрывайте РазУм — эта страница обновится сама, когда почта будет
        подтверждена. Затем нажмите «Войти».
      </p>
      <form onSubmit={onResend} className="mt-6 space-y-3">
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
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Отправляем…' : 'Отправить письмо повторно'}
        </Button>
      </form>
      {isSuccess && (
        <p className="mt-3 text-sm text-green-700">
          Если аккаунт не подтверждён, письмо отправлено.
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-600">
          {getAuthErrorMessage(error, 'Не удалось отправить письмо')}
        </p>
      )}
      <p className="mt-6 text-center text-sm text-slate-500">
        <Link to="/login" className="font-medium text-folio-600 hover:underline">
          Вернуться ко входу
        </Link>
        {' · '}
        <button
          type="button"
          className="font-medium text-folio-600 hover:underline"
          onClick={() => {
            clearPendingVerifyEmail();
            navigate('/register');
          }}
        >
          Другой email
        </button>
      </p>
    </AuthLayout>
  );
}
