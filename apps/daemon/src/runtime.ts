import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { type AsrEngine, startWhisperServer } from "@mockingbird/asr";
import type { PcmAudio } from "@mockingbird/audio";
import { openStore } from "@mockingbird/store";
import { detectSpeech, SileroVad, type SpeechSegment } from "@mockingbird/vad";

export function requireFile(path: string, what: string, hint = ""): string {
  if (!existsSync(path)) throw new Error(`${what} not found at ${path}${hint}`);
  return path;
}

/**
 * Whisper `large-v3`. Measured against the distilled `large-v3-turbo`: turbo
 * writes South Asian and East Asian names phonetically ("Nurj Harbada
 * Charjee"), large-v3 spells them ("Nirjhar Bhattacharjee") with no help.
 * It's slower, which matters less for a file than it did for dictation
 * (docs/MODELS.md).
 */
export const DEFAULT_ASR_MODEL = "ggml-large-v3-q5_0.bin";

const SETUP_HINT = "\nRun `mockingbird models pull` to download it.";

/**
 * Earlier defaults, best first. An install from before the default changed has
 * one of these and not the new one; it keeps transcribing with it until
 * `mockingbird models pull` is run, rather than not starting at all.
 */
const FALLBACK_ASR_MODELS = [
  "ggml-large-v3-turbo-q8_0.bin",
  "ggml-large-v3-turbo-q5_0.bin",
  "ggml-medium.en-q5_0.bin",
  "ggml-small.en-q5_1.bin",
  "ggml-base.en.bin",
];

/** A Whisper model built for English alone: `ggml-base.en.bin`, `ggml-small.en-q5_1.bin`. */
export const englishOnly = (file: string) => /\.en[.-]/.test(basename(file));

/** A Whisper model file in models/: `ggml-*.bin`, a name and not a path. */
export const isWhisperFile = (name: string) =>
  /^ggml-[^/]+\.bin$/.test(name) && !name.includes("..");

/**
 * The Whisper model to load. One named in MOCKINGBIRD_ASR_MODEL has to exist;
 * without it, the one `mockingbird models use <file>` saved, then the default,
 * or else the best earlier default that's installed. A saved file that's since
 * been deleted falls through with a warning: transcribing shouldn't stop over it.
 */
export function findAsrModel(
  models: string,
  configured: string | undefined,
  log: (message: string) => void,
  saved?: string,
): string {
  if (configured) {
    return requireFile(
      configured.includes("/") ? configured : join(models, configured),
      "Whisper model",
      SETUP_HINT,
    );
  }
  if (saved) {
    if (isWhisperFile(saved) && existsSync(join(models, saved))) return join(models, saved);
    log(`warning: the transcription model you picked, ${saved}, isn't in ${models} anymore.`);
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

/** The setting `mockingbird models use` writes. */
export const ASR_MODEL_SETTING = "asr_model";

/** A setting from data.db, or undefined if there's none or data.db can't be read. */
export function savedSetting(key: string, home = mockingbirdHome()): string | undefined {
  if (!existsSync(join(home, "data.db"))) return undefined;
  try {
    const store = openStore(join(home, "data.db"));
    try {
      return store.setting(key);
    } finally {
      store.close();
    }
  } catch {
    return undefined;
  }
}

export type Engines = {
  detectSpeech(audio: PcmAudio): Promise<SpeechSegment[]>;
  asr: AsrEngine;
  close(): Promise<void>;
};

/** `~/.mockingbird`, or MOCKINGBIRD_HOME: models and data.db. */
export const mockingbirdHome = (env = process.env) =>
  env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird");

/**
 * A free port, for a whisper-server of its own: two MCP calls can transcribe
 * at once, and one that found another's server on a fixed port would get its
 * health check answered by it and queue behind it.
 */
export function freePort(): number {
  // ponytail: another process could take it before whisper-server does; rare on one Mac.
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port as number;
  probe.stop(true);
  return port;
}

/** The languages Whisper knows, by the codes it takes (whisper.cpp's `g_lang`). */
const WHISPER_LANGUAGES = new Set(
  `en zh de es ru ko fr ja pt tr pl ca nl ar sv it id hi fi vi he uk el ms cs ro da hu ta no
  th ur hr bg lt la mi ml cy sk te fa lv bn sr az sl kn et mk br eu is hy ne mn bs kk sq sw
  gl mr pa si km sn yo so af oc ka be tg sd gu am yi lo uz fo ht ps tk nn mt sa lb my bo tl
  mg as tt haw ln ha ba jw su yue`.split(/\s+/),
);

/**
 * The language spoken: MOCKINGBIRD_LANGUAGE, a Whisper code like "de", or
 * "auto" to detect it on every chunk. English if unset. A region is
 * dropped ("pt-BR" is "pt"). Whisper takes a code it doesn't know without
 * complaint and garbles the speech, so one it doesn't know falls back to
 * English with a warning.
 */
export function spokenLanguage(env = process.env, log: (message: string) => void = () => {}) {
  const set = env.MOCKINGBIRD_LANGUAGE?.trim().toLowerCase() || "en";
  const language = set.split(/[-_]/)[0] as string;
  if (language === "auto" || WHISPER_LANGUAGES.has(language)) return language;
  log(
    `warning: MOCKINGBIRD_LANGUAGE=${set} isn't a language Whisper knows, so English is used. ` +
      'Set it to a code like "de" or "hi", or "auto".',
  );
  return "en";
}

/** The Whisper model file and language a transcription would use now. */
export function asrChoice(
  log: (message: string) => void = () => {},
  env = process.env,
): { whisperModel: string; language: string } {
  const models = join(mockingbirdHome(env), "models");
  // MOCKINGBIRD_ASR_MODEL takes a path, or a file name inside models/.
  const saved = savedSetting(ASR_MODEL_SETTING, mockingbirdHome(env));
  const whisperModel = findAsrModel(models, env.MOCKINGBIRD_ASR_MODEL, log, saved);
  return { whisperModel, language: spokenLanguage(env, log) };
}

/**
 * Checks the models, loads VAD and starts a whisper-server on `asrPort`;
 * with `dtw`, one that places each word with DTW too (slower, for word times
 * that cuts are made on).
 */
export async function startEngines(
  log: (message: string) => void,
  asrPort = freePort(),
  env = process.env,
  { dtw = false } = {},
): Promise<Engines> {
  const models = join(mockingbirdHome(env), "models");
  const { whisperModel, language } = asrChoice(log, env);
  const vadModel = requireFile(join(models, "silero_vad.onnx"), "Silero VAD model", SETUP_HINT);
  if (language !== "en" && englishOnly(whisperModel)) {
    log(
      `warning: ${basename(whisperModel)} only knows English, and MOCKINGBIRD_LANGUAGE is ${language}. ` +
        "Pick another with `mockingbird models use`.",
    );
  }
  const vad = await SileroVad.load(vadModel);
  try {
    const whisper = await startWhisperServer({
      modelPath: whisperModel,
      port: asrPort,
      language,
      readyTimeoutMs: 60_000,
      dtw,
    });
    return {
      detectSpeech: (audio) => detectSpeech(vad, audio),
      asr: whisper.engine,
      close: async () => {
        await whisper.stop();
        await vad.close();
      },
    };
  } catch (error) {
    await vad.close();
    throw error;
  }
}
