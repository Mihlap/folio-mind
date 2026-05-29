import { describe, expect, it } from 'vitest';
import { QUEUE_NAMES } from './queues.js';

describe('queues', () => {
  it('defines queue names per plan', () => {
    expect(QUEUE_NAMES.preview).toBe('preview');
    expect(QUEUE_NAMES.ai).toBe('ai');
    expect(QUEUE_NAMES.optimize).toBe('optimize');
  });
});
