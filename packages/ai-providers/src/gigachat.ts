import https from 'node:https';
import GigaChat from 'gigachat';
import type { CompletionRequest, CompletionResponse, LLMProvider } from './types.js';
export type GigaChatConfig = {
  credentials: string;
  scope?: string;
  model?: string;
  timeout?: number;
  embeddingModel?: string;
  embeddingDimension?: number;
};
export class GigaChatProvider implements LLMProvider {
  readonly id = 'gigachat';
  private readonly config: GigaChatConfig | null;
  constructor(config?: GigaChatConfig) {
    this.config = config ?? readGigaChatConfigFromEnv();
  }
  async embed(text: string): Promise<number[]> {
    const cfg = this.config;
    if (!cfg?.credentials) {
      throw new Error('GigaChat credentials not configured for embeddings');
    }
    const client = this.createClient();
    const model = cfg.embeddingModel ?? 'Embeddings';
    const result = await client.embeddings([text], model);
    const emb = result.data?.[0]?.embedding;
    if (!emb || emb.length === 0) throw new Error('GigaChat: empty embedding response');
    return emb;
  }
  async completeWithPdf(params: {
    prompt: string;
    system?: string;
    pdf: Buffer;
    filename?: string;
    maxTokens?: number;
  }): Promise<CompletionResponse> {
    if (!this.config?.credentials) {
      throw new Error('ИИ-сервис не настроен: укажите ключ GigaChat на сервере');
    }
    const client = this.createClient();
    const filename = params.filename ?? 'document.pdf';
    const file = new File([params.pdf], filename, { type: 'application/pdf' });
    let fileId: string | undefined;
    try {
      const uploaded = await client.uploadFile(file, 'general');
      fileId = uploaded.id;
      const completion = await client.chat({
        messages: [
          ...(params.system ? [{ role: 'system' as const, content: params.system }] : []),
          {
            role: 'user' as const,
            content: params.prompt,
            attachments: [uploaded.id],
          },
        ],
        temperature: 0.6,
        ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
        function_call: 'auto',
      });
      const text = completion.choices?.[0]?.message?.content?.trim() ?? '';
      if (!text) throw new Error('GigaChat: пустой ответ модели');
      return {
        text,
        model: this.config.model ?? 'GigaChat',
      };
    } finally {
      if (fileId) {
        try {
          await client.deleteFile(fileId);
        } catch {
          // Remote file cleanup is best-effort; keep the completion result/error unchanged.
        }
      }
    }
  }
  async complete(params: CompletionRequest): Promise<CompletionResponse> {
    if (!this.config?.credentials) {
      throw new Error('ИИ-сервис не настроен: укажите ключ GigaChat на сервере');
    }
    const client = this.createClient();
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
  private createClient(): GigaChat {
    if (!this.config?.credentials) {
      throw new Error('GigaChat credentials are not configured');
    }
    return new GigaChat({
      credentials: this.config.credentials,
      scope: this.config.scope ?? 'GIGACHAT_API_PERS',
      model: this.config.model ?? 'GigaChat',
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: this.config.timeout ?? 180,
    });
  }
}
function readGigaChatConfigFromEnv(): GigaChatConfig | null {
  const credentials = process.env.GIGACHAT_CREDENTIALS?.trim();
  if (!credentials) return null;
  return {
    credentials,
    scope: process.env.GIGACHAT_SCOPE?.trim(),
    model: process.env.GIGACHAT_MODEL?.trim(),
    timeout: process.env.GIGACHAT_TIMEOUT ? Number(process.env.GIGACHAT_TIMEOUT) : undefined,
  };
}
