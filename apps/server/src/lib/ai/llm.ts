import {
  createLLMProvider,
  getProviderCatalog,
  resolveDefaultProvider,
  type AIProviderName,
  type LLMProvider,
} from '@folio-mind/ai-providers';
import type { Env } from '../config/env.js';
export function getConfiguredProviderName(env: Env): AIProviderName {
  return resolveDefaultProvider(env.AI_PROVIDER);
}
export function createLLMFromEnv(env: Env, override?: AIProviderName): LLMProvider {
  const name = override ?? getConfiguredProviderName(env);
  return createLLMProvider(name, {
    gigachat: {
      credentials: env.GIGACHAT_CREDENTIALS ?? '',
      scope: env.GIGACHAT_SCOPE,
      model: env.GIGACHAT_MODEL,
      timeout: env.GIGACHAT_TIMEOUT,
    },
    yandex: {
      folderId: env.YANDEX_FOLDER_ID,
      iamToken: env.YANDEX_IAM_TOKEN,
      model: env.YANDEX_MODEL,
    },
  });
}
export function getAiProviderCatalog(env: Env) {
  return getProviderCatalog({
    active: getConfiguredProviderName(env),
    gigachatConfigured: Boolean(env.GIGACHAT_CREDENTIALS?.trim()),
    yandexConfigured: Boolean(env.YANDEX_FOLDER_ID?.trim() && env.YANDEX_IAM_TOKEN?.trim()),
  });
}
