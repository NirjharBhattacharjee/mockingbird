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
        options: {
          temperature: 0,
          // A cleanup is about as long as its input; without a cap the model
          // can ramble on well past it, and that time is the user waiting.
          num_predict: Math.max(64, Math.ceil(user.length / 2)),
        },
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

  /** Loads the model into memory without generating, so the first cleanup isn't a cold start. */
  async load(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      body: JSON.stringify({ model: this.model, keep_alive: "30m" }),
    });
    if (!res.ok) throw new LlmRequestError(`ollama ${res.status}: ${await res.text()}`);
  }
}

/**
 * Whether an Ollama server answers at `baseUrl` within `timeoutMs` (its models
 * may still need pulling). A server that accepts the connection but never
 * replies counts as not running.
 */
export async function ollamaRunning(baseUrl: string, timeoutMs = 2_000): Promise<boolean> {
  try {
    return (await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(timeoutMs) })).ok;
  } catch {
    return false;
  }
}

/** Only a server on this Mac can be started from here. */
export function isLocalUrl(baseUrl: string): boolean {
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

export type OllamaServerProcess = {
  stop(): Promise<void>;
};

/**
 * Runs `ollama serve` on the host and port of `baseUrl` until stop() is called.
 * If another Ollama comes up on that port meanwhile (say, the desktop app), that
 * one is used and stop() leaves it alone.
 */
export async function startOllamaServer({
  binary = "ollama",
  baseUrl,
  readyTimeoutMs = 30_000,
}: {
  binary?: string;
  baseUrl: string;
  readyTimeoutMs?: number;
}): Promise<OllamaServerProcess> {
  const proc = Bun.spawn([binary, "serve"], {
    env: { ...process.env, OLLAMA_HOST: new URL(baseUrl).host },
    stdout: "ignore",
    stderr: "pipe",
  });
  // Keep draining stderr: Ollama logs every request there, and a full pipe blocks it.
  let stderrTail = "";
  const drained = (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of proc.stderr) {
      stderrTail = (stderrTail + decoder.decode(chunk, { stream: true })).slice(-2000);
    }
  })();
  const stop = async () => {
    proc.kill();
    await proc.exited;
  };

  const deadline = Date.now() + readyTimeoutMs;
  // Each probe is cut off at the deadline, so a hung server can't hold startup past it.
  const probe = () => ollamaRunning(baseUrl, Math.max(1, Math.min(2_000, deadline - Date.now())));
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      await drained;
      if (await ollamaRunning(baseUrl)) return { stop: async () => {} };
      throw new LlmRequestError(`ollama serve exited with ${proc.exitCode}: ${stderrTail.trim()}`);
    }
    if (await probe()) return { stop };
    await Bun.sleep(200);
  }
  await stop();
  throw new LlmRequestError(`ollama serve not ready after ${readyTimeoutMs}ms`);
}
