import { GigaChatProvider, type GigaChatConfig } from './gigachat.js';
import type { LLMProvider } from './types.js';
import { YandexGPTProvider } from './yandex.js';

export type AIProviderName = 'gigachat' | 'yandex';

export type LLMProviderOptions = {
  gigachat?: GigaChatConfig;
};

export function createLLMProvider(
  name: AIProviderName,
  options?: LLMProviderOptions,
): LLMProvider {
  switch (name) {
    case 'gigachat':
      return new GigaChatProvider(options?.gigachat);
    case 'yandex':
      return new YandexGPTProvider();
    default: {
      const _exhaustive: never = name;
      throw new Error(`Unknown AI provider: ${_exhaustive}`);
    }
  }
}
