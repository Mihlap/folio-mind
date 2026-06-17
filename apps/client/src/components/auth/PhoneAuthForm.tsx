import { FormEvent, useState, useEffect, useRef } from 'react';
import {
  useSendPhoneCodeMutation,
  usePhoneRegisterMutation,
  usePhoneLoginMutation,
  setCredentials,
} from '@folio-mind/store';
import { useAppDispatch } from '../../hooks/index.js';
import { Button } from '../ui/Button.js';

type Mode = 'register' | 'login';

export function PhoneAuthForm({ mode }: { mode: Mode }) {
  const dispatch = useAppDispatch();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [timer, setTimer] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [sendCode, { isLoading: sendingCode }] = useSendPhoneCodeMutation();
  const [phoneRegister, { isLoading: registering }] = usePhoneRegisterMutation();
  const [phoneLogin, { isLoading: loggingIn }] = usePhoneLoginMutation();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startTimer() {
    setTimer(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }

  function normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return `+7${digits}`;
    if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
    if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
    return `+${digits}`;
  }

  async function handleSendCode() {
    setError(null);
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Введите корректный номер телефона');
      return;
    }
    try {
      await sendCode({ phone: normalizePhone(phone) }).unwrap();
      setCodeSent(true);
      startTimer();
    } catch {
      setError('Не удалось отправить код. Попробуйте позже.');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'register' && !name.trim()) {
      setError('Укажите имя');
      return;
    }

    try {
      const normalizedPhone = normalizePhone(phone);
      if (mode === 'register') {
        const res = await phoneRegister({
          phone: normalizedPhone,
          code,
          name: name.trim() || undefined,
        }).unwrap();
        dispatch(setCredentials(res));
      } else {
        const res = await phoneLogin({
          phone: normalizedPhone,
          code,
        }).unwrap();
        dispatch(setCredentials(res));
      }
      window.location.href = '/app';
    } catch (err) {
      if (err && typeof err === 'object' && 'data' in err) {
        const data = (err as { data?: { message?: string } }).data;
        setError(data?.message ?? 'Ошибка входа');
      } else {
        setError('Не удалось войти');
      }
    }
  }

  const isLoading = sendingCode || registering || loggingIn;

  if (!codeSent) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">+7</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="999 123-45-67"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-folio-500 focus:ring-2 focus:ring-folio-500"
            autoComplete="tel"
          />
        </div>
        {mode === 'register' && (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Имя</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-folio-500 focus:ring-2 focus:ring-folio-500"
            />
          </label>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={handleSendCode} className="w-full" disabled={sendingCode}>
          {sendingCode ? 'Отправка…' : 'Получить код'}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-500">Код отправлен на {normalizePhone(phone)}</p>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Код из SMS</span>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          maxLength={6}
          required
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-2xl tracking-widest outline-none focus:border-folio-500 focus:ring-2 focus:ring-folio-500"
          autoComplete="one-time-code"
          inputMode="numeric"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={isLoading || code.length !== 6}>
        {isLoading ? 'Вход…' : mode === 'register' ? 'Зарегистрироваться' : 'Войти'}
      </Button>
      {timer > 0 ? (
        <p className="text-center text-xs text-slate-400">Запросить повторно через {timer}с</p>
      ) : (
        <button
          type="button"
          onClick={handleSendCode}
          className="w-full text-center text-sm font-medium text-folio-600 hover:underline"
          disabled={sendingCode}
        >
          Отправить код повторно
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          setCodeSent(false);
          setCode('');
          setError(null);
        }}
        className="w-full text-center text-sm text-slate-500 hover:underline"
      >
        Сменить номер
      </button>
    </form>
  );
}
