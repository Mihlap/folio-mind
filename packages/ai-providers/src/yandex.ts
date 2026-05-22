import type { CompletionRequest, CompletionResponse, LLMProvider } from './types.js';

export class YandexGPTProvider implements LLMProvider {
  readonly id = 'yandex';

  async complete(params: CompletionRequest): Promise<CompletionResponse> {
    return {
      text: `[YandexGPT stub] ${params.prompt.slice(0, 120)}…`,
      model: 'yandexgpt-stub',
      usage: { promptTokens: 0, completionTokens: 0 },
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
