export const turnstileSiteKey =
  (
    import.meta as {
      env?: {
        VITE_TURNSTILE_SITE_KEY?: string;
      };
    }
  ).env?.VITE_TURNSTILE_SITE_KEY ?? '';
export const isTurnstileEnabled = Boolean(turnstileSiteKey.trim());
