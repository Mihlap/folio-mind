import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaManifest } from './src/pwa-manifest';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({  
      disable: process.env.CAPACITOR === '1',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: pwaManifest,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/auth/, /^\/docs/],
      },     
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/');
          if (normalizedId.includes('/packages/store/')) return 'folio-store';
          if (normalizedId.includes('/packages/ui/')) return 'folio-ui';
          if (normalizedId.includes('/packages/pdf-contracts/')) return 'folio-pdf-contracts';
          if (!normalizedId.includes('node_modules')) return undefined;
          if (
            normalizedId.includes('react') ||
            normalizedId.includes('@remix-run') ||
            normalizedId.includes('react-router')
          ) {
            return 'react-vendor';
          }
          if (
            normalizedId.includes('@reduxjs') ||
            normalizedId.includes('react-redux') ||
            normalizedId.includes('redux')
          ) {
            return 'state-vendor';
          }
          if (normalizedId.includes('pdfjs-dist')) return 'pdf-vendor';
          return 'vendor';
        },
      },
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist', 'pdfjs-dist/legacy/build/pdf.mjs'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
