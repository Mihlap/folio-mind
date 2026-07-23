import { Capacitor } from '@capacitor/core';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativePlatform(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
}

export function isCapacitorPluginAvailable(name: string): boolean {
  return Capacitor.isPluginAvailable(name);
}
