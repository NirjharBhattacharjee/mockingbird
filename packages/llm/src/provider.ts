export type CompletionRequest = { system: string; user: string };

export interface LlmProvider {
  readonly model: string;
  complete(req: CompletionRequest): Promise<string>;
  health(): Promise<boolean>;
}

export class LlmRequestError extends Error {
  override name = "LlmRequestError";
}
