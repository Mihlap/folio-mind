import {
  createLLMProvider,
  resolveDefaultProvider,
  type AIProviderName,
  type LLMProvider,
} from '@folio-mind/ai-providers';
import type { WorkerEnv } from '../config/env.js';

export function createLLMFromWorkerEnv(env: WorkerEnv, override?: AIProviderName): LLMProvider {
  const name = override ?? resolveDefaultProvider(env.AI_PROVIDER);
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
