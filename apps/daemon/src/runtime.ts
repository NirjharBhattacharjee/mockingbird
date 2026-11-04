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
      // A path, with either separator (Windows writes C:\...), or a name in models/.
      /[\\/]/.test(configured) ? configured : join(models, configured),
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
  /** The Whisper model file loaded. */
  model: string;
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

/**
 * The languages Whisper knows: the code it takes, and the name its replies
 * use ("german" for de), as whisper.cpp's `g_lang` lists them.
 */
export const WHISPER_LANGUAGES = new Map(
  `en english zh chinese de german es spanish ru russian ko korean fr french ja japanese
  pt portuguese tr turkish pl polish ca catalan nl dutch ar arabic sv swedish it italian
  id indonesian hi hindi fi finnish vi vietnamese he hebrew uk ukrainian el greek ms malay
  cs czech ro romanian da danish hu hungarian ta tamil no norwegian th thai ur urdu
  hr croatian bg bulgarian lt lithuanian la latin mi maori ml malayalam cy welsh sk slovak
  te telugu fa persian lv latvian bn bengali sr serbian az azerbaijani sl slovenian
  kn kannada et estonian mk macedonian br breton eu basque is icelandic hy armenian
  ne nepali mn mongolian bs bosnian kk kazakh sq albanian sw swahili gl galician mr marathi
  pa punjabi si sinhala km khmer sn shona yo yoruba so somali af afrikaans oc occitan
  ka georgian be belarusian tg tajik sd sindhi gu gujarati am amharic yi yiddish lo lao
  uz uzbek fo faroese ht haitian_creole ps pashto tk turkmen nn nynorsk mt maltese
  sa sanskrit lb luxembourgish my myanmar bo tibetan tl tagalog mg malagasy as assamese
  tt tatar haw hawaiian ln lingala ha hausa ba bashkir jw javanese su sundanese yue cantonese`
    .split(/\s+/)
    .flatMap((word, i, all) =>
      i % 2 ? [] : [[word, (all[i + 1] ?? "").replace("_", " ")] as const],
    ),
);

/** The code for a name Whisper's reply gives ("german" → de), if it's one it knows. */
export function languageCode(name: string | undefined): string | undefined {
  const wanted = name?.trim().toLowerCase();
  for (const [code, known] of WHISPER_LANGUAGES)
    if (known === wanted || code === wanted) return code;
  return undefined;
}

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

/**
 * The model saved for `language` (`models use <file> --language bn`), or
 * else the one saved for every language (#143).
 */
export function savedModelFor(language: string, home = mockingbirdHome()): string | undefined {
  const own =
    language === "auto" ? undefined : savedSetting(`${ASR_MODEL_SETTING}.${language}`, home);
  // One that's since been deleted gives way to the choice for every language.
  const there = own && isWhisperFile(own) && existsSync(join(home, "models", own));
  return there ? own : savedSetting(ASR_MODEL_SETTING, home);
}

/**
 * whisper.cpp's own build of whisper-server, for systems with no Homebrew:
 * one release, checked against its sha256 (of the archives as downloaded on
 * 2026-11-05; the release publishes none). CPU builds: the CUDA ones are
 * 0.5 GB and need NVIDIA's runtime. macOS has no prebuilt server, and keeps
 * Homebrew's whisper-cpp, which uses Metal.
 */
export const WHISPER_BUILD = "b5454"; // whisper.cpp v1.9.5
const WHISPER_BUILDS: Record<string, { asset: string; folder: string; sha256: string }> = {
  "linux-x64": {
    asset: "whisper-bin-ubuntu-x64.tar.gz",
    folder: "whisper-bin-ubuntu-x64",
    sha256: "a72becf15d7917f990f6313867a52638b82b7f9ef237fb0c980dac56a135781c",
  },
  "linux-arm64": {
    asset: "whisper-bin-ubuntu-arm64.tar.gz",
    folder: "whisper-bin-ubuntu-arm64",
    sha256: "6b95ebfc60447df48e70ef00a73bdc3f41679ed2d01ef465827206a2ff325149",
  },
  "win32-x64": {
    asset: "whisper-bin-x64.zip",
    folder: "Release",
    sha256: "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb",
  },
};

/** The pinned whisper-server for this computer, or none where Homebrew's is used. */
export function pinnedWhisper(
  home = mockingbirdHome(),
  system = `${process.platform}-${process.arch}`,
) {
  const build = WHISPER_BUILDS[system];
  if (!build) return undefined;
  // One folder per platform, so Linux x64 and arm64 can share a home.
  const dir = join(home, "bin", `whisper-cpp-${WHISPER_BUILD}-${system}`);
  const archive = {
    name: "whisper-server",
    file: build.asset,
    url: `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_BUILD}/${build.asset}`,
    sha256: build.sha256,
  };
  const program = join(
    dir,
    build.folder,
    system.startsWith("win32") ? "whisper-server.exe" : "whisper-server",
  );
  return { archive, dir, program };
}

/**
 * The whisper-server to run: MOCKINGBIRD_WHISPER_SERVER, the pinned one once
 * it's pulled, or whichever is on the PATH.
 */
export function findWhisperServer(
  env = process.env,
  home = mockingbirdHome(env),
  which = (name: string) => Bun.which(name),
): string | undefined {
  if (env.MOCKINGBIRD_WHISPER_SERVER) return env.MOCKINGBIRD_WHISPER_SERVER;
  const program = pinnedWhisper(home)?.program;
  if (program && existsSync(program)) return program;
  return which("whisper-server") ?? undefined;
}

/**
 * The encoders and filters the engine uses that a system ffmpeg can be
 * built without (#154: mockingbird uses the system's ffmpeg). libx264 is
 * the usual one: Fedora's ffmpeg-free leaves it out.
 */
export const FFMPEG_NEEDS = {
  encoders: ["libx264", "aac"],
  filters: [
    "sidechaincompress",
    "ebur128",
    "alimiter",
    "aevalsrc",
    "amix",
    "adelay",
    "overlay",
    "scale",
  ],
};

/** What this ffmpeg lacks of FFMPEG_NEEDS, from its `-encoders` and `-filters` lists. */
export function ffmpegMissing(
  list = (what: "-encoders" | "-filters") => {
    // Bounded, so an ffmpeg that hangs can't hang status; a failed probe lists nothing.
    const probe = Bun.spawnSync(["ffmpeg", "-hide_banner", what], {
      stderr: "ignore",
      timeout: 10_000,
    });
    return probe.exitCode === 0 ? probe.stdout.toString() : "";
  },
): string[] {
  // Each line is flags, a name, then a description: match the name as a word.
  const has = (text: string, name: string) => new RegExp(`^\\s*\\S+\\s+${name}\\s`, "m").test(text);
  const encoders = list("-encoders");
  const filters = list("-filters");
  return [
    ...FFMPEG_NEEDS.encoders.filter((n) => !has(encoders, n)),
    ...FFMPEG_NEEDS.filters.filter((n) => !has(filters, n)),
  ];
}

/** The models saved for one language each, as [code, file] (`models use <file> --language`). */
export function languageModels(home = mockingbirdHome()): [string, string][] {
  if (!existsSync(join(home, "data.db"))) return [];
  try {
    const store = openStore(join(home, "data.db"));
    try {
      return [...WHISPER_LANGUAGES.keys()].flatMap((code): [string, string][] => {
        const file = store.setting(`${ASR_MODEL_SETTING}.${code}`);
        return file ? [[code, file]] : [];
      });
    } finally {
      store.close();
    }
  } catch {
    return [];
  }
}

/** What one call asked for: a model file in models/, and a language code or "auto". */
export type ModelChoice = { model?: string; language?: string };

/**
 * The engines for one transcription (#143). A `model` or `language` given
 * for the call wins over MOCKINGBIRD_ASR_MODEL and MOCKINGBIRD_LANGUAGE, and
 * a language picks its model from the map `models use --language` keeps.
 * Left to detect the language with a map in place, it detects it from the
 * first stretch of speech (up to 30 s) with the default model, then, if the
 * map has another model for that language, starts that one instead. Returns
 * the language used (a code, or "auto") and the model's file name.
 */
export async function enginesFor(
  audio: PcmAudio,
  choice: ModelChoice,
  log: (message: string) => void,
  env: Record<string, string | undefined> = process.env,
): Promise<{ engines: Engines; language: string; model: string; detected: boolean }> {
  if (choice.model !== undefined && !isWhisperFile(choice.model)) {
    throw new Error(
      `model takes a file name in models/, like ggml-large-v3-turbo.bin; got ${choice.model}`,
    );
  }
  if (
    choice.language !== undefined &&
    choice.language !== "auto" &&
    !WHISPER_LANGUAGES.has(choice.language)
  ) {
    throw new Error(
      `language takes a code Whisper knows, like en, bn or de, or auto; got ${choice.language}`,
    );
  }
  const callEnv = {
    ...env,
    ...(choice.model ? { MOCKINGBIRD_ASR_MODEL: choice.model } : {}),
    ...(choice.language ? { MOCKINGBIRD_LANGUAGE: choice.language } : {}),
  };
  const start = async (e: typeof callEnv) => {
    const engines = await startEngines(log, freePort(), e);
    return { engines, language: spokenLanguage(e), model: basename(engines.model) };
  };
  const first = await start(callEnv);
  const mapped = languageModels(mockingbirdHome(env));
  if (
    choice.model ||
    first.language !== "auto" ||
    callEnv.MOCKINGBIRD_ASR_MODEL ||
    !mapped.length
  ) {
    return { ...first, detected: false };
  }
  // Detect from the first speech: VAD finds it, Whisper names its language.
  const speech = (await first.engines.detectSpeech(audio))[0];
  if (!speech) return { ...first, detected: false };
  const from = speech.startSample;
  const sample = {
    sampleRate: audio.sampleRate,
    samples: audio.samples.subarray(from, from + 30 * audio.sampleRate),
  };
  const code = languageCode((await first.engines.asr.transcribe(sample)).language);
  const wanted = code && mapped.find(([c]) => c === code)?.[1];
  if (!code || !wanted || wanted === first.model)
    return { ...first, language: code ?? "auto", detected: !!code };
  await first.engines.close();
  log(`heard ${WHISPER_LANGUAGES.get(code)}: transcribing with ${wanted}`);
  return { ...(await start({ ...callEnv, MOCKINGBIRD_LANGUAGE: code })), detected: true };
}

/** Checks the models, loads VAD and starts a whisper-server on `asrPort`. */
export async function startEngines(
  log: (message: string) => void,
  asrPort = freePort(),
  env = process.env,
): Promise<Engines> {
  const models = join(mockingbirdHome(env), "models");
  // MOCKINGBIRD_ASR_MODEL takes a path, or a file name inside models/.
  const language = spokenLanguage(env, log);
  const saved = savedModelFor(language, mockingbirdHome(env));
  const whisperModel = findAsrModel(models, env.MOCKINGBIRD_ASR_MODEL, log, saved);
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
      binary: findWhisperServer(env) ?? "whisper-server",
      modelPath: whisperModel,
      port: asrPort,
      language,
      readyTimeoutMs: 60_000,
    });
    return {
      model: whisperModel,
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
