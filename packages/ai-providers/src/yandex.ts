import type { CompletionRequest, CompletionResponse, LLMProvider } from './types.js';

export type YandexGPTConfig = {
  folderId?: string;
  iamToken?: string;
  model?: string;
};

type YandexMessage = {
  role: 'system' | 'user' | 'assistant';
  text: string;
};

type YandexCompletionResponse = {
  result?: {
    alternatives?: Array<{ message?: { role?: string; text?: string } }>;
    usage?: { inputTextTokens?: string; completionTokens?: string; totalTokens?: string };
    modelVersion?: string;
  };
};

export class YandexGPTProvider implements LLMProvider {
  readonly id = 'yandex';
  private readonly config: YandexGPTConfig | null;

  constructor(config?: YandexGPTConfig) {
    this.config = config ?? null;
  }

  async complete(params: CompletionRequest): Promise<CompletionResponse> {
    if (!this.config?.folderId || !this.config?.iamToken) {
      return {
        text: `[YandexGPT stub] ${params.prompt.slice(0, 120)}…`,
        model: 'yandexgpt-stub',
        usage: { promptTokens: 0, completionTokens: 0 },
      };
    }

    const messages: YandexMessage[] = [];
    if (params.system) messages.push({ role: 'system', text: params.system });
    messages.push({ role: 'user', text: params.prompt });

    const modelUri = `gpt://${this.config.folderId}/${this.config.model ?? 'yandexgpt/latest'}`;
    const response = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.iamToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        modelUri,
        completionOptions: {
          stream: false,
          temperature: 0.6,
          maxTokens: String(params.maxTokens ?? 2000),
        },
        messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`YandexGPT API error ${response.status}: ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as YandexCompletionResponse;
    const text = data.result?.alternatives?.[0]?.message?.text?.trim() ?? '';
    if (!text) throw new Error('YandexGPT: пустой ответ модели');

    const usage = data.result?.usage;
    return {
      text,
      model: data.result?.modelVersion ?? this.config.model ?? 'yandexgpt',
      usage: {
        promptTokens: Number(usage?.inputTextTokens ?? 0),
        completionTokens: Number(usage?.completionTokens ?? 0),
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    return Boolean(this.config?.folderId && this.config?.iamToken);
  }
}
