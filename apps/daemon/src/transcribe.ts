import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { startWhisperServer, type WhisperServerProcess } from "@mockingbird/asr";
import { loadAudio } from "@mockingbird/audio";
import { OllamaProvider } from "@mockingbird/llm";
import { detectSpeech, SileroVad } from "@mockingbird/vad";
import { type PipelineResult, runPipeline } from "./pipeline.ts";

const USAGE = `Usage: bun run transcribe <audio-file> [--terminal] [--json]

Runs an audio file through the local pipeline and prints the cleaned-up text.
Any format ffmpeg can read works (wav, m4a, mp3, ...).

Options:
  --terminal   format for a terminal (no trailing period)
  --json       print the full result: raw text, final text, timings
  -h, --help   show this help

Environment:
  MOCKINGBIRD_HOME       default ~/.mockingbird (models are read from its models/)
  MOCKINGBIRD_ASR_PORT   default 8771
  MOCKINGBIRD_LLM_URL    default http://127.0.0.1:11434
  MOCKINGBIRD_LLM_MODEL  default qwen3:4b-instruct-2507-q4_K_M`;

class UsageError extends Error {}

const log = (message: string) => console.error(message);

function parse() {
  try {
    return parseArgs({
      args: Bun.argv.slice(2),
      options: {
        terminal: { type: "boolean" },
        json: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

function requireFile(path: string, what: string, hint = ""): string {
  if (!existsSync(path)) throw new Error(`${what} not found at ${path}${hint}`);
  return path;
}

const SETUP_HINT = "\nSee the Setup section of README.md.";

function summary(result: PipelineResult): string {
  const parts = [
    `speech ${(result.durationMs / 1000).toFixed(1)}s`,
    `vad ${result.vadMs}ms`,
    `asr ${result.asrMs ?? "-"}ms`,
  ];
  if (result.llmOutcome === "cleaned") parts.push(`cleanup ${result.llmMs}ms`);
  else if (result.asrMs !== null) parts.push(`cleanup ${result.llmOutcome}`);
  return parts.join(" · ");
}

async function main(): Promise<number> {
  const { values, positionals } = parse();
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (positionals.length !== 1 || !positionals[0]) {
    throw new UsageError("expected exactly one audio file");
  }

  const input = requireFile(positionals[0], "Audio file");
  const home = process.env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird");
  const whisperModel = requireFile(
    join(home, "models", "ggml-base.en.bin"),
    "Whisper model",
    SETUP_HINT,
  );
  const vadModel = requireFile(
    join(home, "models", "silero_vad.onnx"),
    "Silero VAD model",
    SETUP_HINT,
  );
  const llm = new OllamaProvider(
    process.env.MOCKINGBIRD_LLM_URL ?? "http://127.0.0.1:11434",
    process.env.MOCKINGBIRD_LLM_MODEL ?? "qwen3:4b-instruct-2507-q4_K_M",
    60_000,
  );

  const audio = await loadAudio(input);
  const vad = await SileroVad.load(vadModel);
  let whisper: WhisperServerProcess | undefined;
  let closing: Promise<void> | undefined;
  const cleanup = () => {
    closing ??= (async () => {
      await whisper?.stop();
      await vad.close();
    })();
    return closing;
  };
  process.once("SIGINT", () => {
    void cleanup().finally(() => process.exit(130));
  });

  try {
    if (!(await llm.health())) {
      log(
        `warning: Ollama isn't running at ${process.env.MOCKINGBIRD_LLM_URL ?? "http://127.0.0.1:11434"} ` +
          `or ${llm.model} isn't pulled; the raw transcript will be printed.\n` +
          "Start it with `ollama serve` to get cleaned-up text.",
      );
    }

    log("starting whisper-server (the first run on a Mac can take ~15s)...");
    whisper = await startWhisperServer({
      modelPath: whisperModel,
      port: Number(process.env.MOCKINGBIRD_ASR_PORT ?? 8771),
      readyTimeoutMs: 60_000,
    });

    const result = await runPipeline(
      { audio, style: values.terminal ? "terminal" : "default" },
      { detectSpeech: (a) => detectSpeech(vad, a), asr: whisper.engine, llm },
    );

    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.finalText) {
      console.log(result.finalText);
    } else {
      log("no speech detected");
    }
    if (result.llmOutcome === "failed") log(`cleanup failed: ${result.llmError}`);
    if (!values.json) log(summary(result));
    return result.finalText ? 0 : 1;
  } finally {
    await cleanup();
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    if (error instanceof UsageError) {
      log(`error: ${error.message}\n\n${USAGE}`);
      process.exit(2);
    }
    log(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
