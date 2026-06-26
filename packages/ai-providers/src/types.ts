export type CompletionRequest = {
  prompt: string;
  system?: string;
  maxTokens?: number;
};
export type CompletionResponse = {
  text: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
};
export interface LLMProvider {
  readonly id: string;
  complete(params: CompletionRequest): Promise<CompletionResponse>;
  embed?(text: string): Promise<number[]>;
  healthCheck(): Promise<boolean>;
}
