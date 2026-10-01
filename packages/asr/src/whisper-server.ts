import { basename } from "node:path";
import { encodeWav, type PcmAudio } from "@mockingbird/audio";
import type { AsrEngine, AsrResult, AsrWord, TranscribeOptions } from "./engine.ts";

type VerboseJson = {
  segments?: {
    text: string;
    words?: { word: string; start: number; end: number; probability: number }[];
  }[];
};

export class AsrRequestError extends Error {
  override name = "AsrRequestError";
}

/**
 * Sounds rather than words: Whisper writes "..." for a pause it still heard
 * something in, and bracketed tags like [BLANK_AUDIO] or [MUSIC] for the
 * rest. Only square-bracket tags are dropped — a dictated "(page 3)" is real
 * text, and round brackets are left alone.
 */
export function stripNonSpeech(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/(?:\.\s*){3,}|…/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseVerboseJson(body: VerboseJson): AsrResult {
  const segments = body.segments ?? [];
  // Segments can split a word mid-token ("dict" / "ation"); each segment carries
  // its own leading space when it starts a new word, so join without a separator.
  const text = stripNonSpeech(segments.map((s) => s.text).join(""));

  const words: AsrWord[] = segments.flatMap((s) =>
    (s.words ?? []).map((w) => ({
      word: w.word,
      startMs: Math.round(w.start * 1000),
      endMs: Math.round(w.end * 1000),
      probability: w.probability,
    })),
  );
  return { text, confidence: confidenceOf(words), words };
}

/** Mean probability of the spoken words. */
function confidenceOf(words: AsrWord[]): number {
  // Punctuation tokens score low even when the speech was heard clearly.
  const spoken = words.filter((w) => /[\p{L}\p{N}]/u.test(w.word));
  return spoken.length ? spoken.reduce((sum, w) => sum + w.probability, 0) / spoken.length : 0;
}

/**
 * One result from consecutive pieces of the same dictation. Word times stay
 * relative to their own piece; nothing downstream reads them across pieces.
 */
export function joinResults(results: AsrResult[]): AsrResult {
  const said = results.filter((r) => r.text);
  const [only] = said;
  if (said.length <= 1) return only ?? { text: "", confidence: 0, words: [] };
  const words = said.flatMap((r) => r.words);
  // Without words, each piece's own confidence, weighted by how much it said.
  const chars = said.reduce((sum, r) => sum + r.text.length, 0);
  const confidence = words.length
    ? confidenceOf(words)
    : said.reduce((sum, r) => sum + r.confidence * r.text.length, 0) / chars;
  return { text: said.map((r) => r.text).join(" "), confidence, words };
}

export class WhisperServerEngine implements AsrEngine {
  constructor(
    private readonly baseUrl: string,
    readonly model: string,
  ) {}

  async transcribe(
    audio: PcmAudio,
    { vocabulary, context }: TranscribeOptions = {},
  ): Promise<AsrResult> {
    const form = new FormData();
    form.append("file", new Blob([encodeWav(audio)], { type: "audio/wav" }), "segment.wav");
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    // large-v3-turbo is multilingual: pinning the language stops it drifting
    // to another one on accented English.
    form.append("language", "en");
    // Whisper spells a name it doesn't know phonetically ("Nerj Herbata
    // Chargy"); given the word up front it writes it properly.
    const prompt = [vocabulary, context].filter(Boolean).join(" ");
    if (prompt) form.append("prompt", prompt);

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

/**
 * Flags this whisper-server understands that make it faster, read from its
 * `--help`. Older versions lack them, and an unknown flag stops the server
 * from starting at all, so each is only passed when it's listed.
 */
export function speedFlags(help: string): string[] {
  // verbose_json otherwise runs the encoder a second time just to report how
  // sure it is of the language, which is pinned anyway: ~1.2s per dictation
  // with large-v3 on an M3, for a field we never read.
  return help.includes("--no-language-probabilities") ? ["-nlp"] : [];
}

async function helpOf(binary: string): Promise<string> {
  try {
    const proc = Bun.spawn([binary, "--help"], { stdout: "pipe", stderr: "pipe" });
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;
    return out + err;
  } catch {
    return "";
  }
}

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
  const flags = speedFlags(await helpOf(binary));
  const args = ["-m", modelPath, "--host", "127.0.0.1", "--port", String(port), ...flags];
  const proc = Bun.spawn([binary, ...args], {
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
