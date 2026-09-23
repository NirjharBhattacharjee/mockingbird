import { parseArgs } from "node:util";
import { loadAudio } from "@mockingbird/audio";
import { describeTimings, runPipeline } from "./pipeline.ts";
import { requireFile, startEngines } from "./runtime.ts";

const USAGE = `Usage: bun run transcribe <audio-file> [--terminal] [--json]

Runs an audio file through the local pipeline and prints the cleaned-up text.
Any format ffmpeg can read works (wav, m4a, mp3, ...).

Options:
  --terminal   format for a terminal (no trailing period)
  --json       print the full result: raw text, final text, timings
  -h, --help   show this help

Environment:
  MOCKINGBIRD_HOME       default ~/.mockingbird (models are read from its models/)
  MOCKINGBIRD_ASR_MODEL  Whisper model file (default ggml-large-v3-turbo-q5_0.bin)
  MOCKINGBIRD_ASR_PORT   default 8771
  MOCKINGBIRD_LLM_URL    default http://127.0.0.1:11434
  MOCKINGBIRD_LLM_MODEL  default qwen3:4b-instruct-2507-q4_K_M`;

class UsageError extends Error {}

const log = (message: string) => console.error(message);

function parse(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
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

export async function main(argv: string[] = Bun.argv.slice(2)): Promise<number> {
  const { values, positionals } = parse(argv);
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (positionals.length !== 1 || !positionals[0]) {
    throw new UsageError("expected exactly one audio file");
  }

  const audio = await loadAudio(requireFile(positionals[0], "Audio file"));
  const engines = await startEngines(log);
  process.once("SIGINT", () => {
    void engines.close().finally(() => process.exit(130));
  });

  try {
    const result = await runPipeline(
      { audio, style: values.terminal ? "terminal" : "default" },
      engines.deps,
    );

    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.finalText) {
      console.log(result.finalText);
    } else {
      log("no speech detected");
    }
    if (result.llmOutcome === "failed") log(`cleanup failed: ${result.llmError}`);
    if (!values.json) log(describeTimings(result));
    return result.finalText ? 0 : 1;
  } finally {
    await engines.close();
  }
}

if (import.meta.main) {
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
}
