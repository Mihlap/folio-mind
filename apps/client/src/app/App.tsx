import { Navigate, Route, Routes } from 'react-router-dom';
import { useAppSelector } from '../hooks/index.js';
import { AppShell } from '../components/layout/AppShell.js';
import { DocumentWorkspaceProvider } from '../context/document-workspace-context.js';
import { DashboardPage } from '../pages/app/DashboardPage.js';
import { DocumentPage } from '../pages/app/DocumentPage.js';
import { RegulationsPage } from '../pages/app/RegulationsPage.js';
import { LandingPage } from '../pages/public/LandingPage.js';
import { LoginPage } from '../pages/auth/LoginPage.js';
import { RegisterPage } from '../pages/auth/RegisterPage.js';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage.js';
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage.js';
import { VerifyEmailPage } from '../pages/auth/VerifyEmailPage.js';
import { CheckEmailPage } from '../pages/auth/CheckEmailPage.js';
import { MagicLinkPage } from '../pages/auth/MagicLinkPage.js';
import { MagicLinkVerifyPage } from '../pages/auth/MagicLinkVerifyPage.js';
import { OAuthCallbackPage } from '../pages/auth/OAuthCallbackPage.js';
import { PhoneAuthPage } from '../pages/auth/PhoneAuthPage.js';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAppSelector((s) => s.auth.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/check-email" element={<CheckEmailPage />} />
      <Route path="/magic-link" element={<MagicLinkPage />} />
      <Route path="/magic-link/verify" element={<MagicLinkVerifyPage />} />
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="/phone-auth" element={<PhoneAuthPage />} />
      <Route
        path="/app/*"
        element={
          <PrivateRoute>
            <DocumentWorkspaceProvider>
              <AppShell />
            </DocumentWorkspaceProvider>
          </PrivateRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="regulations" element={<RegulationsPage />} />
        <Route path="documents/:id" element={<DocumentPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
