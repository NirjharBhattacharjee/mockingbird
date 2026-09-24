import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { startWhisperServer } from "@mockingbird/asr";
import {
  type DictionaryEntry,
  isLocalUrl,
  OllamaProvider,
  ollamaRunning,
  parseDictionary,
  startOllamaServer,
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

const SETUP_HINT = "\nRun scripts/install.sh to download it (see Install in README.md).";

export type Engines = {
  deps: PipelineDeps;
  close(): Promise<void>;
};

const DICTIONARY_TEMPLATE = `# Words mockingbird should get right: names, places, jargon.
# One per line. Lines starting with # are ignored.
#
#   Nirjhar Bhattacharjee          spell it this way
#   Catppuccin (a colour theme)    with a note for the cleanup model
#   cat puck => Catppuccin         what it hears => what to write
#
# The first two are given to the cleanup model as spellings to keep. The third
# is a plain replacement, applied to the finished text — the reliable fix for
# a word that comes out wrong the same way every time.
#
# Setting MOCKINGBIRD_ASR_VOCABULARY=1 also reads these words to Whisper
# before it listens. That can fix a name it never gets right, but it bends
# names it already spelled correctly, so it is off by default.
#
# Takes effect on "mockingbird restart".
`;

/**
 * The user's own vocabulary. Whisper spells an unfamiliar name phonetically
 * however good the model is, so the words that matter to this person have to
 * be nameable somewhere.
 */
export function loadDictionary(home: string): DictionaryEntry[] {
  const path = join(home, "dictionary.txt");
  try {
    if (!existsSync(path)) {
      writeFileSync(path, DICTIONARY_TEMPLATE, { flag: "wx" });
      return [];
    }
    return parseDictionary(readFileSync(path, "utf8"));
  } catch {
    // A dictionary that can't be read costs spelling, not dictation.
    return [];
  }
}

/** Checks the models, loads VAD, starts whisper-server, and checks Ollama. */
export async function startEngines(log: (message: string) => void): Promise<Engines> {
  const env = process.env;
  const home = env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird");
  const models = join(home, "models");
  // MOCKINGBIRD_ASR_MODEL takes a path, or a file name inside models/, so a
  // smaller model can be used on a slower Mac without touching the code.
  const asrModel = env.MOCKINGBIRD_ASR_MODEL ?? DEFAULT_ASR_MODEL;
  const whisperModel = requireFile(
    asrModel.includes("/") ? asrModel : join(models, asrModel),
    "Whisper model",
    SETUP_HINT,
  );
  const vadModel = requireFile(join(models, "silero_vad.onnx"), "Silero VAD model", SETUP_HINT);
  const llmUrl = env.MOCKINGBIRD_LLM_URL ?? "http://127.0.0.1:11434";
  const llm = new OllamaProvider(
    llmUrl,
    env.MOCKINGBIRD_LLM_MODEL ?? "qwen3:4b-instruct-2507-q4_K_M",
    60_000,
  );

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
        dictionary: loadDictionary(home),
        // Opt-in: it fixes a name Whisper never gets, at the risk of bending
        // ones it already spells correctly (packages/llm/src/dictionary.ts).
        vocabularyHint: env.MOCKINGBIRD_ASR_VOCABULARY === "1",
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
