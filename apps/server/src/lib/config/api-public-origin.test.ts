import { describe, expect, it } from 'vitest';
import { getApiEmulatorOrigin, getApiPublicOrigin } from './api-public-origin.js';

const baseEnv = {
  NODE_ENV: 'development' as const,
  PORT: 3001,
  API_HOST: '0.0.0.0',
};

describe('getApiPublicOrigin', () => {
  it('uses localhost in development by default', () => {
    expect(getApiPublicOrigin(baseEnv as never)).toBe('http://localhost:3001');
  });

  it('prefers API_PUBLIC_URL in any environment', () => {
    expect(
      getApiPublicOrigin({
        ...baseEnv,
        API_PUBLIC_URL: 'http://10.0.2.2:3001/',
      } as never),
    ).toBe('http://10.0.2.2:3001');
  });
});

describe('getApiEmulatorOrigin', () => {
  it('defaults to 10.0.2.2 in development', () => {
    expect(getApiEmulatorOrigin(baseEnv as never)).toBe('http://10.0.2.2:3001');
  });

  it('uses API_EMULATOR_URL when set', () => {
    expect(
      getApiEmulatorOrigin({
        ...baseEnv,
        API_EMULATOR_URL: 'http://192.168.0.20:3001/',
      } as never),
    ).toBe('http://192.168.0.20:3001');
  });

  it('returns null when same as public origin', () => {
    expect(
      getApiEmulatorOrigin({
        ...baseEnv,
        API_PUBLIC_URL: 'http://10.0.2.2:3001',
      } as never),
    ).toBeNull();
  });

  it('returns null in production without API_EMULATOR_URL', () => {
    expect(
      getApiEmulatorOrigin({
        ...baseEnv,
        NODE_ENV: 'production',
      } as never),
    ).toBeNull();
  });
});
