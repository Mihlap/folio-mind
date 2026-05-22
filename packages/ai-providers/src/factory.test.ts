import { describe, expect, it } from 'vitest';
import { createLLMProvider } from './factory.js';

describe('createLLMProvider', () => {
  it('creates gigachat provider without credentials', async () => {
    const p = createLLMProvider('gigachat');
    expect(p.id).toBe('gigachat');
    expect(await p.healthCheck()).toBe(false);
  });

  it('completes with stub text', async () => {
    const p = createLLMProvider('yandex');
    const res = await p.complete({ prompt: 'test prompt' });
    expect(res.text).toContain('YandexGPT stub');
  });
});
