import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAppSelector } from '../hooks/index.js';
import { AppShell } from '../components/layout/AppShell.js';
import { CookieNotice } from '../components/layout/CookieNotice.js';
import { DocumentWorkspaceProvider } from '../context/document-workspace-context.js';
import { BackgroundUploadProvider } from '../context/background-upload-provider.js';
import { LandingPage } from '../pages/public/LandingPage.js';
import { PendingVerifyRedirect } from '../components/auth/PendingVerifyRedirect.js';

const DashboardPage = lazy(() =>
  import('../pages/app/DashboardPage.js').then((module) => ({ default: module.DashboardPage })),
);
const DocumentPage = lazy(() =>
  import('../pages/app/DocumentPage.js').then((module) => ({ default: module.DocumentPage })),
);
const ProjectsPage = lazy(() =>
  import('../pages/app/ProjectsPage.js').then((module) => ({ default: module.ProjectsPage })),
);
const ProjectDetailPage = lazy(() =>
  import('../pages/app/ProjectDetailPage.js').then((module) => ({
    default: module.ProjectDetailPage,
  })),
);
const MediaLibraryPage = lazy(() =>
  import('../pages/app/MediaLibraryPage.js').then((module) => ({
    default: module.MediaLibraryPage,
  })),
);
const RegulationsPage = lazy(() =>
  import('../pages/app/RegulationsPage.js').then((module) => ({ default: module.RegulationsPage })),
);
const LoginPage = lazy(() =>
  import('../pages/auth/LoginPage.js').then((module) => ({ default: module.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('../pages/auth/RegisterPage.js').then((module) => ({ default: module.RegisterPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('../pages/auth/ForgotPasswordPage.js').then((module) => ({
    default: module.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import('../pages/auth/ResetPasswordPage.js').then((module) => ({
    default: module.ResetPasswordPage,
  })),
);
const VerifyEmailPage = lazy(() =>
  import('../pages/auth/VerifyEmailPage.js').then((module) => ({
    default: module.VerifyEmailPage,
  })),
);
const CheckEmailPage = lazy(() =>
  import('../pages/auth/CheckEmailPage.js').then((module) => ({ default: module.CheckEmailPage })),
);
const MagicLinkPage = lazy(() =>
  import('../pages/auth/MagicLinkPage.js').then((module) => ({ default: module.MagicLinkPage })),
);
const MagicLinkVerifyPage = lazy(() =>
  import('../pages/auth/MagicLinkVerifyPage.js').then((module) => ({
    default: module.MagicLinkVerifyPage,
  })),
);
const OAuthCallbackPage = lazy(() =>
  import('../pages/auth/OAuthCallbackPage.js').then((module) => ({
    default: module.OAuthCallbackPage,
  })),
);
const PhoneAuthPage = lazy(() =>
  import('../pages/auth/PhoneAuthPage.js').then((module) => ({ default: module.PhoneAuthPage })),
);
const GuestSharePage = lazy(() =>
  import('../pages/public/GuestSharePage.js').then((module) => ({
    default: module.GuestSharePage,
  })),
);
const PrivacyPage = lazy(() =>
  import('../pages/public/PrivacyPage.js').then((module) => ({ default: module.PrivacyPage })),
);

function PageFallback() {
  return <div className="p-6 text-sm text-slate-500">Загрузка…</div>;
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAppSelector((s) => s.auth.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
export function App() {
  return (
    <>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route
            path="/"
            element={
              <PendingVerifyRedirect>
                <LandingPage />
              </PendingVerifyRedirect>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/register"
            element={
              <PendingVerifyRedirect>
                <RegisterPage />
              </PendingVerifyRedirect>
            }
          />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/check-email" element={<CheckEmailPage />} />
          <Route path="/magic-link" element={<MagicLinkPage />} />
          <Route path="/magic-link/verify" element={<MagicLinkVerifyPage />} />
          <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
          <Route path="/phone-auth" element={<PhoneAuthPage />} />
          <Route path="/share/:token" element={<GuestSharePage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route
            path="/app/*"
            element={
              <PrivateRoute>
                <DocumentWorkspaceProvider>
                  <BackgroundUploadProvider>
                    <AppShell />
                  </BackgroundUploadProvider>
                </DocumentWorkspaceProvider>
              </PrivateRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:projectId" element={<ProjectDetailPage />} />
            <Route path="media" element={<MediaLibraryPage />} />
            <Route path="regulations" element={<RegulationsPage />} />
            <Route path="documents/:id" element={<DocumentPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <CookieNotice />
    </>
  );
}
