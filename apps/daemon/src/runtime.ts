import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { startWhisperServer } from "@mockingbird/asr";
import {
  type DictionaryEntry,
  isLocalUrl,
  OllamaProvider,
  ollamaRunning,
  startOllamaServer,
  unknownSections,
} from "@mockingbird/llm";
import { detectSpeech, SileroVad } from "@mockingbird/vad";
import type { PipelineDeps } from "./pipeline.ts";

export function requireFile(path: string, what: string, hint = ""): string {
  if (!existsSync(path)) throw new Error(`${what} not found at ${path}${hint}`);
  return path;
}

/**
 * Whisper `large-v3`. Measured against the distilled `large-v3-turbo`: turbo
 * writes South Asian and East Asian names phonetically ("Nurj Harbada
 * Charjee"), large-v3 spells them ("Nirjhar Bhattacharjee") with no help.
 * It costs ~0.5s more on a short dictation (docs/MODELS.md).
 */
export const DEFAULT_ASR_MODEL = "ggml-large-v3-q5_0.bin";

/**
 * The cleanup model Ollama runs, unless `mockingbird models use` picked another
 * or MOCKINGBIRD_LLM_MODEL names one (see cleanupModel).
 */
export const DEFAULT_LLM_MODEL = "qwen3:4b-instruct-2507-q4_K_M";

const SETUP_HINT = "\nRun `mockingbird models pull` to download it.";

/**
 * Earlier defaults, best first. An install from before the default changed has
 * one of these and not the new one; it keeps dictating on it until
 * `mockingbird models pull` is run, rather than not starting at all.
 */
const FALLBACK_ASR_MODELS = [
  "ggml-large-v3-turbo-q8_0.bin",
  "ggml-large-v3-turbo-q5_0.bin",
  "ggml-medium.en-q5_0.bin",
  "ggml-small.en-q5_1.bin",
  "ggml-base.en.bin",
];

/**
 * The Whisper model to load. One named in MOCKINGBIRD_ASR_MODEL has to exist;
 * without it, the default, or else the best earlier default that's installed.
 */
export function findAsrModel(
  models: string,
  configured: string | undefined,
  log: (message: string) => void,
): string {
  if (configured) {
    return requireFile(
      configured.includes("/") ? configured : join(models, configured),
      "Whisper model",
      SETUP_HINT,
    );
  }
  const preferred = join(models, DEFAULT_ASR_MODEL);
  if (existsSync(preferred)) return preferred;
  const fallback = FALLBACK_ASR_MODELS.map((name) => join(models, name)).find(existsSync);
  if (!fallback) return requireFile(preferred, "Whisper model", SETUP_HINT);
  log(
    `warning: ${DEFAULT_ASR_MODEL} isn't downloaded, so ${fallback} is used instead.\n` +
      "Run `mockingbird models pull` to download it.",
  );
  return fallback;
}

export type Engines = {
  deps: PipelineDeps;
  close(): Promise<void>;
};

/** `~/.mockingbird`, or MOCKINGBIRD_HOME: models, data.db, logs and the socket. */
export const mockingbirdHome = (env = process.env) =>
  env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird");

/**
 * Which cleanup model to run: MOCKINGBIRD_LLM_MODEL if set, then the one
 * `mockingbird models use` saved, then the default.
 */
export const cleanupModel = (saved?: string, env = process.env) =>
  env.MOCKINGBIRD_LLM_MODEL ?? saved ?? DEFAULT_LLM_MODEL;

/**
 * The user's own cleanup rules, `cleanup.md` in the mockingbird folder, if
 * there is one. Read once at startup, so a change needs a restart.
 */
export function readCleanupRules(home: string, log: (message: string) => void): string | undefined {
  const path = join(home, "cleanup.md");
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      log(`warning: couldn't read ${path}, so the shipped cleanup rules apply: ${error}`);
    }
    return undefined;
  }
  const unknown = unknownSections(text);
  if (unknown.length) {
    log(
      `warning: ${path} has sections mockingbird doesn't use: ${unknown.map((h) => `"## ${h}"`).join(", ")}.` +
        " Its headings have to match the ones in packages/llm/prompts/cleanup.md.",
    );
  }
  log(`cleanup rules: yours from ${path}, the shipped ones for any section it leaves out`);
  return text;
}

/** Checks the models, loads VAD, starts whisper-server, and checks Ollama. */
export async function startEngines(
  log: (message: string) => void,
  dictionary: DictionaryEntry[] = [],
  savedModel?: string,
): Promise<Engines> {
  const env = process.env;
  const models = join(mockingbirdHome(env), "models");
  // MOCKINGBIRD_ASR_MODEL takes a path, or a file name inside models/, so a
  // smaller model can be used on a slower Mac without touching the code.
  const whisperModel = findAsrModel(models, env.MOCKINGBIRD_ASR_MODEL, log);
  const vadModel = requireFile(join(models, "silero_vad.onnx"), "Silero VAD model", SETUP_HINT);
  const llmUrl = env.MOCKINGBIRD_LLM_URL ?? "http://127.0.0.1:11434";
  const llm = new OllamaProvider(llmUrl, cleanupModel(savedModel, env), 60_000);

  const vad = await SileroVad.load(vadModel);
  let closing: Promise<void> | undefined;
  let stopWhisper = async () => {};
  let stopOllama = async () => {};
  const close = () => {
    closing ??= (async () => {
      await stopWhisper();
      await stopOllama();
      await vad.close();
    })();
    return closing;
  };

  try {
    // Start Ollama if it isn't running, and stop it again on close; one that
    // was already running (the desktop app, a Homebrew service) is left alone.
    const ollamaInstalled = Bun.which("ollama") !== null;
    if (!(await ollamaRunning(llmUrl)) && isLocalUrl(llmUrl) && ollamaInstalled) {
      log("starting Ollama...");
      try {
        stopOllama = (await startOllamaServer({ baseUrl: llmUrl })).stop;
      } catch (error) {
        log(`couldn't start Ollama: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!(await ollamaRunning(llmUrl))) {
      log(
        `warning: Ollama isn't running at ${llmUrl}, so you'll get the raw transcript.\n` +
          (ollamaInstalled
            ? "Start it with `ollama serve` to get cleaned-up text."
            : "Install it with `brew install ollama` to get cleaned-up text."),
      );
    } else if (!(await llm.health())) {
      log(
        `warning: ${llm.model} isn't downloaded, so you'll get the raw transcript.\n` +
          `Get it with \`ollama pull ${llm.model}\`.`,
      );
    }
    // The model is not loaded here: an agent running all day would hold it in
    // memory for a day in which nothing is dictated. It's warmed when a
    // recording starts instead, which hides the cold load behind the speech.
    log("starting whisper-server (the first run on a Mac can take ~15s)...");
    const whisper = await startWhisperServer({
      modelPath: whisperModel,
      port: Number(env.MOCKINGBIRD_ASR_PORT ?? 8771),
      readyTimeoutMs: 60_000,
    });
    stopWhisper = whisper.stop;
    return {
      deps: {
        detectSpeech: (audio) => detectSpeech(vad, audio),
        asr: whisper.engine,
        llm,
        dictionary,
        // Opt-in: it fixes a name Whisper never gets, at the risk of bending
        // ones it already spells correctly (packages/llm/src/dictionary.ts).
        vocabularyHint: env.MOCKINGBIRD_ASR_VOCABULARY === "1",
        cleanupRules: readCleanupRules(mockingbirdHome(env), log),
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
