import { basename } from "node:path";
import { encodeWav, type PcmAudio } from "@mockingbird/audio";
import type { AsrEngine, AsrResult, AsrWord, TranscribeOptions } from "./engine.ts";

type VerboseJson = {
  language?: string;
  segments?: {
    text: string;
    /** t_dtw: centiseconds into the audio, or -1 without DTW. */
    words?: { word: string; start: number; end: number; probability: number; t_dtw?: number }[];
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
      ...(w.t_dtw !== undefined && w.t_dtw >= 0 && { atMs: w.t_dtw * 10 }),
    })),
  );
  // Punctuation tokens score low even when the speech was heard clearly.
  const spoken = words.filter((w) => /[\p{L}\p{N}]/u.test(w.word));
  const confidence = spoken.length
    ? spoken.reduce((sum, w) => sum + w.probability, 0) / spoken.length
    : 0;

  return { text, confidence, words, ...(body.language ? { language: body.language } : {}) };
}

export class WhisperServerEngine implements AsrEngine {
  constructor(
    private readonly baseUrl: string,
    readonly model: string,
    /** A Whisper language code, or "auto" to detect it on every dictation (~1.4s slower). */
    private readonly language = "en",
  ) {}

  async transcribe(audio: PcmAudio, { vocabulary }: TranscribeOptions = {}): Promise<AsrResult> {
    const form = new FormData();
    form.append("file", new Blob([encodeWav(audio)], { type: "audio/wav" }), "segment.wav");
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    // large-v3-turbo is multilingual: pinning the language stops it drifting
    // to another one on accented English. Pinned to the wrong one, it
    // translates: German pinned to English comes out as broken English.
    form.append("language", this.language);
    // Whisper spells a name it doesn't know phonetically ("Nerj Herbata
    // Chargy"); given the word up front it writes it properly.
    if (vocabulary) form.append("prompt", vocabulary);

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
  // sure it is of the language: ~1.2s per dictation with large-v3 on an M3,
  // for a field we never read. With language "auto" Whisper still detects
  // the language it transcribes in; only the report is skipped.
  return help.includes("--no-language-probabilities") ? ["-nlp"] : [];
}

/**
 * whisper.cpp's DTW preset for a model file (`ggml-large-v3-q5_0.bin` is
 * "large.v3"): the attention heads that line its tokens up with the audio.
 * A fine-tune or anything else unknown has none.
 */
export function dtwPreset(modelPath: string): string | undefined {
  const name = basename(modelPath, ".bin")
    .replace(/^ggml-/, "")
    .replace(/-q\d.*$/, "");
  const presets: Record<string, string> = {
    tiny: "tiny",
    "tiny.en": "tiny.en",
    base: "base",
    "base.en": "base.en",
    small: "small",
    "small.en": "small.en",
    medium: "medium",
    "medium.en": "medium.en",
    "large-v1": "large.v1",
    "large-v2": "large.v2",
    "large-v3": "large.v3",
    "large-v3-turbo": "large.v3.turbo",
  };
  return presets[name];
}

/**
 * The flags that turn on DTW timestamps with `preset`, if this whisper-server
 * has them. DTW doesn't run with flash attention, so that goes off: about
 * 20% slower (32.5 s against 38.9 s for 4 minutes of a talk on an M3).
 */
export function dtwFlags(help: string, preset: string | undefined): string[] {
  if (!preset || !help.includes("--dtw")) return [];
  return [...(help.includes("--no-flash-attn") ? ["-nfa"] : []), "--dtw", preset];
}

/** The binary's `--help`, or "" if it isn't all there within `timeoutMs`. */
async function helpOf(binary: string, timeoutMs: number): Promise<string> {
  let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  try {
    proc = Bun.spawn([binary, "--help"], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  } catch {
    return "";
  }
  const read = Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
    .then(([out, err]) => out + err)
    .catch(() => "");
  // A --help that never returns mustn't hold up startup: readyTimeoutMs only
  // starts counting once the server itself is launched. Racing the read, not
  // waiting for it after the kill, because anything the binary started can
  // keep its output open after it's gone. Whatever it printed before the
  // timeout is dropped too: a partial --help can't be trusted to pick flags.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<string>((resolve) => {
    timer = setTimeout(() => {
      // SIGKILL, so a binary that ignores SIGTERM isn't left running.
      proc.kill("SIGKILL");
      resolve("");
    }, timeoutMs);
  });
  try {
    return await Promise.race([read, timedOut]);
  } finally {
    clearTimeout(timer);
    // One that closed its output but kept running would otherwise be left
    // behind on every start.
    if (proc.exitCode === null) proc.kill("SIGKILL");
  }
}

export async function startWhisperServer({
  binary = "whisper-server",
  modelPath,
  port,
  language,
  readyTimeoutMs = 30_000,
  helpTimeoutMs = 5_000,
  dtw = false,
}: {
  binary?: string;
  modelPath: string;
  port: number;
  /** See WhisperServerEngine; English unless given. */
  language?: string;
  readyTimeoutMs?: number;
  /** How long to wait for `--help`, read to pick the flags. */
  helpTimeoutMs?: number;
  /** Words placed by DTW too (`atMs`), where the model has a preset. */
  dtw?: boolean;
}): Promise<WhisperServerProcess> {
  const help = await helpOf(binary, helpTimeoutMs);
  const flags = [...speedFlags(help), ...(dtw ? dtwFlags(help, dtwPreset(modelPath)) : [])];
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
    language,
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
