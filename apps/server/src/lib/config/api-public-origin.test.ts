import { describe, expect, it } from 'vitest';
import { getApiPublicOrigin } from './api-public-origin.js';

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
