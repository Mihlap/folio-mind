import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { setCredentials, useVerifyMagicLinkMutation } from '@folio-mind/store';
import { useAppDispatch } from '../../hooks/index.js';
import { AuthLayout } from '../../components/layout/AuthLayout.js';
import { getAuthErrorMessage } from '../../lib/auth/authErrors.js';

export function MagicLinkVerifyPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [verifyMagicLink, { isLoading, error }] = useVerifyMagicLinkMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    void verifyMagicLink({ token })
      .unwrap()
      .then((res) => {
        dispatch(setCredentials({ token: res.token, user: res.user }));
        setDone(true);
        navigate('/app', { replace: true });
      })
      .catch(() => {});
  }, [token, verifyMagicLink, dispatch, navigate]);

  if (!token) {
    return (
      <AuthLayout title="Вход по ссылке" subtitle="Ссылка недействительна">
        <p className="text-sm text-red-600">В ссылке нет токена.</p>
        <Link to="/magic-link" className="mt-4 block text-center text-sm font-medium text-folio-600">
          Запросить новую ссылку
        </Link>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Готово" subtitle="Вход выполнен">
        <p className="text-sm text-slate-600">Перенаправляем…</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Вход по ссылке" subtitle="Проверяем ссылку…">
      {isLoading && <p className="text-sm text-slate-500">Входим…</p>}
      {error && (
        <p className="text-sm text-red-600">
          {getAuthErrorMessage(error, 'Ссылка недействительна или устарела')}
        </p>
      )}
      {error && (
        <Link
          to="/magic-link"
          className="mt-4 block text-center text-sm font-medium text-folio-600 hover:underline"
        >
          Запросить новую ссылку
        </Link>
      )}
    </AuthLayout>
  );
}
