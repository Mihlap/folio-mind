import { describe, expect, it } from 'vitest';
import { createLLMProvider } from './factory.js';
describe('createLLMProvider', () => {
  it('creates gigachat provider without credentials', async () => {
    const p = createLLMProvider('gigachat');
    expect(p.id).toBe('gigachat');
    expect(await p.healthCheck()).toBe(false);
  });
  it('throws a user-friendly error without credentials', async () => {
    const p = createLLMProvider('yandex');
    await expect(p.complete({ prompt: 'test prompt' })).rejects.toThrow('ИИ-сервис');
  });
});
