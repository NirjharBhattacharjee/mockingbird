import { type CompletionRequest, type LlmProvider, LlmRequestError } from "./provider.ts";

export class OllamaProvider implements LlmProvider {
  constructor(
    private readonly baseUrl: string,
    readonly model: string,
    private readonly timeoutMs = 10_000,
  ) {}

  async complete({ system, user }: CompletionRequest): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        stream: false,
        // Unloading between dictations would cost a ~15s cold load on the next one.
        keep_alive: "30m",
        options: { temperature: 0 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new LlmRequestError(`ollama ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { message?: { content?: string } };
    return body.message?.content?.trim() ?? "";
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return false;
      const { models } = (await res.json()) as { models?: { name: string }[] };
      return (models ?? []).some((m) => m.name === this.model);
    } catch {
      return false;
    }
  }
}
