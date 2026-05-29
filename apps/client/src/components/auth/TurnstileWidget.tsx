import { useEffect, useRef } from 'react';
import { isTurnstileEnabled, turnstileSiteKey } from '../../lib/auth/authConfig.js';

type TurnstileWidgetProps = {
  onToken: (token: string | null) => void;
  className?: string;
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

let scriptLoading: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-turnstile]');
    if (existing) {
      window.onTurnstileLoad = () => resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Turnstile script failed'));
    document.head.appendChild(script);
  });
  return scriptLoading;
}

export function TurnstileWidget({ onToken, className }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isTurnstileEnabled || !containerRef.current) return;

    let cancelled = false;

    void loadTurnstileScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token) => onToken(token),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      });
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      onToken(null);
    };
  }, [onToken]);

  if (!isTurnstileEnabled) return null;

  return <div ref={containerRef} className={className} />;
}
