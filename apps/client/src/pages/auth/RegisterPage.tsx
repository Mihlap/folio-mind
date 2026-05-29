import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRegisterMutation } from '@folio-mind/store';
import { Button } from '../../components/ui/Button.js';
import { PasswordInput } from '../../components/auth/PasswordInput.js';
import { TurnstileWidget } from '../../components/auth/TurnstileWidget.js';
import { OAuthButtons } from '../../components/auth/OAuthButtons.js';
import { AuthLayout } from '../../components/layout/AuthLayout.js';
import { getAuthErrorMessage, validatePasswordClient } from '../../lib/auth/authErrors.js';
import { isTurnstileEnabled } from '../../lib/auth/authConfig.js';

export function RegisterPage() {
  const [register, { isLoading, error }] = useRegisterMutation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

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
      }).unwrap();
      navigate('/check-email', { state: { email: res.email } });
    } catch {
      // error from RTK
    }
  }

  const displayError =
    clientError ?? (error ? getAuthErrorMessage(error, 'Не удалось зарегистрироваться') : null);

  return (
    <AuthLayout title="Регистрация" subtitle="Создайте рабочее пространство">
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Имя (необязательно)</span>
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
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-folio-500 focus:ring-2 focus:ring-folio-500"
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
        <Button
          type="submit"
          className="w-full"
          disabled={isLoading || (isTurnstileEnabled && !captchaToken)}
        >
          {isLoading ? 'Создание…' : 'Создать аккаунт'}
        </Button>
      </form>
      <div className="mt-6">
        <OAuthButtons />
      </div>
      <p className="mt-6 text-center text-sm text-slate-500">
        <Link to="/login" className="font-medium text-folio-600 hover:underline">
          Уже есть аккаунт
        </Link>
      </p>
    </AuthLayout>
  );
}
