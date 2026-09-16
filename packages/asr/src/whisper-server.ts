import { basename } from "node:path";
import { encodeWav, type PcmAudio } from "@mockingbird/audio";
import type { AsrEngine, AsrResult, AsrWord } from "./engine.ts";

type VerboseJson = {
  segments?: {
    text: string;
    words?: { word: string; start: number; end: number; probability: number }[];
  }[];
};

export class AsrRequestError extends Error {
  override name = "AsrRequestError";
}

export function parseVerboseJson(body: VerboseJson): AsrResult {
  const segments = body.segments ?? [];
  // Segments can split a word mid-token ("dict" / "ation"); each segment carries
  // its own leading space when it starts a new word, so join without a separator.
  const text = segments
    .map((s) => s.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  const words: AsrWord[] = segments.flatMap((s) =>
    (s.words ?? []).map((w) => ({
      word: w.word,
      startMs: Math.round(w.start * 1000),
      endMs: Math.round(w.end * 1000),
      probability: w.probability,
    })),
  );
  // Punctuation tokens score low even when the speech was heard clearly.
  const spoken = words.filter((w) => /[\p{L}\p{N}]/u.test(w.word));
  const confidence = spoken.length
    ? spoken.reduce((sum, w) => sum + w.probability, 0) / spoken.length
    : 0;

  return { text, confidence, words };
}

export class WhisperServerEngine implements AsrEngine {
  constructor(
    private readonly baseUrl: string,
    readonly model: string,
  ) {}

  async transcribe(audio: PcmAudio): Promise<AsrResult> {
    const form = new FormData();
    form.append("file", new Blob([encodeWav(audio)], { type: "audio/wav" }), "segment.wav");
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");

    const res = await fetch(`${this.baseUrl}/inference`, { method: "POST", body: form });
    if (!res.ok) throw new AsrRequestError(`whisper-server ${res.status}: ${await res.text()}`);
    return parseVerboseJson((await res.json()) as VerboseJson);
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }
}

export type WhisperServerProcess = {
  engine: WhisperServerEngine;
  stop(): Promise<void>;
};

export async function startWhisperServer({
  binary = "whisper-server",
  modelPath,
  port,
  readyTimeoutMs = 30_000,
}: {
  binary?: string;
  modelPath: string;
  port: number;
  readyTimeoutMs?: number;
}): Promise<WhisperServerProcess> {
  const proc = Bun.spawn([binary, "-m", modelPath, "--host", "127.0.0.1", "--port", String(port)], {
    stdout: "ignore",
    stderr: "pipe",
  });
  // Keep draining stderr: an unread pipe fills up and blocks the server.
  let stderrTail = "";
  const drained = (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of proc.stderr) {
      stderrTail = (stderrTail + decoder.decode(chunk, { stream: true })).slice(-2000);
    }
  })();
  const engine = new WhisperServerEngine(
    `http://127.0.0.1:${port}`,
    basename(modelPath, ".bin").replace(/^ggml-/, ""),
  );
  const stop = async () => {
    proc.kill();
    await proc.exited;
  };

  const deadline = Date.now() + readyTimeoutMs;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      await drained;
      throw new AsrRequestError(`whisper-server exited with ${proc.exitCode}: ${stderrTail}`);
    }
    if (await engine.health()) return { engine, stop };
    await Bun.sleep(200);
  }
  await stop();
  throw new AsrRequestError(`whisper-server not ready after ${readyTimeoutMs}ms`);
}
