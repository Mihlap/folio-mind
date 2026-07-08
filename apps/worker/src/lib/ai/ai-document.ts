import { GigaChatProvider, type AIProviderName } from '@folio-mind/ai-providers';
import { createLLMFromWorkerEnv } from './llm.js';
export async function summarizePdfWithoutTextLayer(
  llm: ReturnType<typeof createLLMFromWorkerEnv>,
  provider: AIProviderName,
  pdfBuffer: Buffer,
  documentId: string,
  system: string,
  userPrompt: string,
) {
  if (provider === 'gigachat' && llm instanceof GigaChatProvider) {
    return llm.completeWithPdf({
      system,
      prompt: userPrompt,
      pdf: pdfBuffer,
      filename: `${documentId}.pdf`,
      maxTokens: 1500,
    });
  }
  throw new Error(
    'В PDF нет текстового слоя (скан). Для таких файлов используйте GigaChat — он читает PDF напрямую.',
  );
}
