export type CompletionRequest = { system: string; user: string };

export interface LlmProvider {
  readonly model: string;
  complete(req: CompletionRequest): Promise<string>;
  health(): Promise<boolean>;
  /** Warms the model, when the provider has something to warm. */
  load?(): Promise<void>;
}

export class LlmRequestError extends Error {
  override name = "LlmRequestError";
}
