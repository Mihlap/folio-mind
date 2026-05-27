import { GigaChatProvider, type GigaChatConfig } from './gigachat.js';
import type { LLMProvider } from './types.js';
import { YandexGPTProvider, type YandexGPTConfig } from './yandex.js';

export type AIProviderName = 'gigachat' | 'yandex';

export const AI_PROVIDER_IDS: AIProviderName[] = ['gigachat', 'yandex'];

export type LLMProviderOptions = {
  gigachat?: GigaChatConfig;
  yandex?: YandexGPTConfig;
};

export function resolveDefaultProvider(value?: string): AIProviderName {
  if (value === 'yandex') return 'yandex';
  return 'gigachat';
}

export type ProviderCatalogEntry = {
  id: AIProviderName;
  label: string;
  configured: boolean;
  active: boolean;
};

export function getProviderCatalog(params: {
  active: AIProviderName;
  gigachatConfigured: boolean;
  yandexConfigured: boolean;
}): ProviderCatalogEntry[] {
  return [
    {
      id: 'gigachat',
      label: 'GigaChat (Сбер)',
      configured: params.gigachatConfigured,
      active: params.active === 'gigachat',
    },
    {
      id: 'yandex',
      label: 'YandexGPT',
      configured: params.yandexConfigured,
      active: params.active === 'yandex',
    },
  ];
}

export function createLLMProvider(
  name: AIProviderName,
  options?: LLMProviderOptions,
): LLMProvider {
  switch (name) {
    case 'gigachat':
      return new GigaChatProvider(options?.gigachat);
    case 'yandex':
      return new YandexGPTProvider(options?.yandex);
    default: {
      const _exhaustive: never = name;
      throw new Error(`Unknown AI provider: ${_exhaustive}`);
    }
  }
}
