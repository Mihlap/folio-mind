import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { setToken } from '@folio-mind/store';
import { useAppDispatch } from '../../hooks/index.js';
import { AuthLayout } from '../../components/layout/AuthLayout.js';
export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const error = searchParams.get('error');
  useEffect(() => {
    if (token) {
      dispatch(setToken(token));
      navigate('/app', { replace: true });
    }
  }, [token, dispatch, navigate]);
  if (error) {
    return (
      <AuthLayout title="Ошибка входа" subtitle="OAuth">
        <p className="text-sm text-red-600">{decodeURIComponent(error)}</p>
        <Link to="/login" className="mt-4 block text-center text-sm font-medium text-folio-600">
          Вернуться ко входу
        </Link>
      </AuthLayout>
    );
  }
  if (token) {
    return (
      <AuthLayout title="Вход…" subtitle="OAuth">
        <p className="text-sm text-slate-500">Перенаправляем в приложение…</p>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="OAuth" subtitle="Нет данных для входа">
      <Link to="/login" className="block text-center text-sm font-medium text-folio-600">
        На страницу входа
      </Link>
    </AuthLayout>
  );
}
