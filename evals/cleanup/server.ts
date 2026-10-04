/**
 * Serves mockingbird's real cleanup step to promptfoo over localhost, so the
 * eval scores exactly what the app would type. promptfoo runs on Node and
 * can't import this TypeScript directly; its built-in HTTP provider can call
 * it, and its latency checks then measure the cleanup itself.
 */

import { cleanUp } from "../../apps/daemon/src/pipeline.ts";
import { DEFAULT_LLM_MODEL } from "../../apps/daemon/src/runtime.ts";
import { type DictionaryEntry, OllamaProvider } from "../../packages/llm/src/index.ts";

export type CleanupRequest = {
  transcript: string;
  style?: "default" | "terminal";
  /** What Whisper reported; the gate skips cleanup for confident, clean text. */
  confidence?: number;
  dictionary?: DictionaryEntry[];
};

const llmUrl = process.env.MOCKINGBIRD_LLM_URL ?? "http://127.0.0.1:11434";
// The model the app would run: MOCKINGBIRD_LLM_MODEL, as in runtime.ts.
export const llm = new OllamaProvider(
  llmUrl,
  process.env.MOCKINGBIRD_LLM_MODEL ?? DEFAULT_LLM_MODEL,
  120_000,
);

export function startCleanupServer(port: number) {
  return Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(req) {
      if (req.method !== "POST") return new Response("POST a CleanupRequest", { status: 405 });
      const body = (await req.json()) as CleanupRequest;
      // Streamed like the app types it, timing when the first words would appear.
      const started = performance.now();
      let typed = "";
      let firstTextMs: number | undefined;
      const result = await cleanUp(
        { text: body.transcript, confidence: Number(body.confidence ?? 0.9) },
        { llm, dictionary: body.dictionary },
        body.style === "terminal" ? "terminal" : "default",
        async (piece) => {
          firstTextMs ??= Math.round(performance.now() - started);
          typed += piece;
        },
      );
      if (typed !== result.finalText) {
        return new Response(
          `typed ${JSON.stringify(typed)}, not ${JSON.stringify(result.finalText)}`,
          {
            status: 500,
          },
        );
      }
      return Response.json({ output: result.finalText, firstTextMs, ...result });
    },
  });
}
