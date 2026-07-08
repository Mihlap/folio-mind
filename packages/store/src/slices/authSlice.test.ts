import { describe, expect, it } from 'vitest';
import { authSlice, logout, setCredentials } from './authSlice.js';
describe('authSlice', () => {
  it('sets credentials', () => {
    const state = authSlice.reducer(
      undefined,
      setCredentials({
        token: 't',
        user: { id: '1', email: 'a@b.c', name: 'A', tenantId: 't1' },
      }),
    );
    expect(state.token).toBe('t');
    expect(state.user?.email).toBe('a@b.c');
  });
  it('logs out', () => {
    const state = authSlice.reducer(
      {
        token: 't',
        user: { id: '1', email: 'a@b.c', name: null, tenantId: 't1' },
      },
      logout(),
    );
    expect(state.token).toBeNull();
  });
});
