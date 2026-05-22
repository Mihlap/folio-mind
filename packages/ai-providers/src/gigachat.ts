import https from 'node:https';
import GigaChat from 'gigachat';
import type { CompletionRequest, CompletionResponse, LLMProvider } from './types.js';

export type GigaChatConfig = {
  credentials: string;
  scope?: string;
  model?: string;
  timeout?: number;
};

export class GigaChatProvider implements LLMProvider {
  readonly id = 'gigachat';
  private readonly config: GigaChatConfig | null;

  constructor(config?: GigaChatConfig) {
    this.config = config ?? readGigaChatConfigFromEnv();
  }

  async complete(params: CompletionRequest): Promise<CompletionResponse> {
    if (!this.config?.credentials) {
      return {
        text: `[GigaChat stub] ${params.prompt.slice(0, 120)}…`,
        model: 'gigachat-stub',
        usage: { promptTokens: 0, completionTokens: 0 },
      };
    }

    const client = new GigaChat({
      credentials: this.config.credentials,
      scope: this.config.scope ?? 'GIGACHAT_API_PERS',
      model: this.config.model ?? 'GigaChat',
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: this.config.timeout ?? 180,
    });

    const completion = await client.chat({
      messages: [
        ...(params.system ? [{ role: 'system' as const, content: params.system }] : []),
        { role: 'user' as const, content: params.prompt },
      ],
      temperature: 0.6,
      ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
    });

    const text = completion.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) throw new Error('GigaChat: пустой ответ модели');

    return {
      text,
      model: this.config.model ?? 'GigaChat',
    };
  }

  async healthCheck(): Promise<boolean> {
    return Boolean(this.config?.credentials);
  }
}

function readGigaChatConfigFromEnv(): GigaChatConfig | null {
  const credentials = process.env.GIGACHAT_CREDENTIALS?.trim();
  if (!credentials) return null;
  return {
    credentials,
    scope: process.env.GIGACHAT_SCOPE?.trim(),
    model: process.env.GIGACHAT_MODEL?.trim(),
    timeout: process.env.GIGACHAT_TIMEOUT
      ? Number(process.env.GIGACHAT_TIMEOUT)
      : undefined,
  };
}
