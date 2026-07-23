import { Capacitor } from '@capacitor/core';
import { isNativeApp } from './platform.js';

export async function initNativeShell(): Promise<void> {
  if (!isNativeApp()) return;

  document.documentElement.classList.add('native-app');

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore
  }

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: false });    
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#4338ca' });
    }
  } catch {
    // ignore
  }

  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('appUrlOpen', (event) => {
      console.info('[capacitor] appUrlOpen', event.url);
    });
  } catch {
    // ignore
  }
}
