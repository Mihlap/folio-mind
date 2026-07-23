import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAP_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'ru.razum.app',
  appName: 'РазУм',
  webDir: '../client/dist',
  server: {
    androidScheme: 'https',
    ...(serverUrl
      ? {
          url: serverUrl,
          cleartext: serverUrl.startsWith('http://'),
        }
      : {}),
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    StatusBar: {
      style: 'DEFAULT',
      backgroundColor: '#4338ca',
    },
  },
};

export default config;
