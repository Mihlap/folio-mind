import type { VitePWAOptions } from 'vite-plugin-pwa';

export const pwaManifest = {
  name: 'РазУм',
  short_name: 'РазУм',
  description: 'PDF, ИИ и совместная работа с документами',
  lang: 'ru',
  display: 'standalone',
  orientation: 'any',
  background_color: '#f8fafc',
  theme_color: '#4338ca',
  start_url: '/',
  scope: '/',
  categories: ['business', 'productivity'],
  icons: [
    {
      src: 'icons/pwa-192x192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      src: 'icons/pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
    },
    {
      src: 'icons/pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
} as const satisfies NonNullable<VitePWAOptions['manifest']>;
