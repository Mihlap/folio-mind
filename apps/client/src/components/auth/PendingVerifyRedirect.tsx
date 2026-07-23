import { Navigate } from 'react-router-dom';
import { getPendingVerifyEmail } from '../../lib/auth/pending-verify-email.js';

/** Если ждём подтверждения email — не показываем лендинг/регистрацию. */
export function PendingVerifyRedirect({ children }: { children: React.ReactNode }) {
  if (getPendingVerifyEmail()) {
    return <Navigate to="/check-email" replace />;
  }
  return <>{children}</>;
}
