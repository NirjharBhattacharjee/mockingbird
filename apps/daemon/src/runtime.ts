import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { startWhisperServer } from "@mockingbird/asr";
import { OllamaProvider } from "@mockingbird/llm";
import { detectSpeech, SileroVad } from "@mockingbird/vad";
import type { PipelineDeps } from "./pipeline.ts";

export function requireFile(path: string, what: string, hint = ""): string {
  if (!existsSync(path)) throw new Error(`${what} not found at ${path}${hint}`);
  return path;
}

const SETUP_HINT = "\nRun scripts/install.sh to download it (see Quick start in README.md).";

export type Engines = {
  deps: PipelineDeps;
  close(): Promise<void>;
};

/** Checks the models, loads VAD, starts whisper-server, and checks Ollama. */
export async function startEngines(log: (message: string) => void): Promise<Engines> {
  const env = process.env;
  const models = join(env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird"), "models");
  const whisperModel = requireFile(join(models, "ggml-base.en.bin"), "Whisper model", SETUP_HINT);
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
  const close = () => {
    closing ??= (async () => {
      await stopWhisper();
      await vad.close();
    })();
    return closing;
  };

  try {
    if (!(await llm.health())) {
      log(
        `warning: Ollama isn't running at ${llmUrl} or ${llm.model} isn't pulled; ` +
          "you'll get the raw transcript.\nStart it with `ollama serve` to get cleaned-up text.",
      );
    }
    log("starting whisper-server (the first run on a Mac can take ~15s)...");
    const whisper = await startWhisperServer({
      modelPath: whisperModel,
      port: Number(env.MOCKINGBIRD_ASR_PORT ?? 8771),
      readyTimeoutMs: 60_000,
    });
    stopWhisper = whisper.stop;
    return {
      deps: { detectSpeech: (audio) => detectSpeech(vad, audio), asr: whisper.engine, llm },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
