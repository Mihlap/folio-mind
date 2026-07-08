const AUTH_CHANNEL = 'folio-auth';
const AUTH_TOKEN_KEY = 'folio_token';
export type AuthCrossTabMessage = {
  type: 'email-verified';
};
export function notifyEmailVerified(): void {
  try {
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    channel.postMessage({ type: 'email-verified' } satisfies AuthCrossTabMessage);
    channel.close();
  } catch {
    // BroadcastChannel is optional; storage events still cover auth updates across tabs.
  }
}
export function subscribeToAuthFromOtherTabs(onVerified: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === AUTH_TOKEN_KEY && event.newValue) {
      onVerified();
    }
  };
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(AUTH_CHANNEL);
    channel.onmessage = (event: MessageEvent<AuthCrossTabMessage>) => {
      if (event.data?.type === 'email-verified') {
        onVerified();
      }
    };
  } catch {
    // Some browsers can block BroadcastChannel; storage fallback remains active.
  }
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener('storage', handleStorage);
    channel?.close();
  };
}
export function getStoredAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}
