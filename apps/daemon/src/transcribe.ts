import { parseArgs } from "node:util";
import { transcribe } from "./mcp.ts";

const USAGE = `Usage: mockingbird transcribe <file> [--words] [--from <s>] [--to <s>]
                                        [--model <file>] [--language <code>]

Prints an audio or video file's speech as timestamped lines, names spelled
the dictionary's way. Any format ffmpeg can read works.

Options:
  --words      each word with its start and end, to cut on
  --from, --to only this stretch, in seconds
  --model      a Whisper model file in models/ (\`mockingbird models\` lists them)
  --language   what's spoken: a code like bn or de, or auto to detect it and
               use the model \`models use --language\` picked for it
  -h, --help   show this help

Environment:
  MOCKINGBIRD_HOME       default ~/.mockingbird (models are read from its models/)
  MOCKINGBIRD_ASR_MODEL  Whisper model file (default: the one \`models use\` picked)
  MOCKINGBIRD_LANGUAGE   what is spoken: a code like de, or auto (default en)`;

export class UsageError extends Error {
  override name = "UsageError";
}

const log = (message: string) => console.error(message);

const seconds = (value: string | undefined) => {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new UsageError(`not a time in seconds: ${value}`);
  return n;
};

export async function main(argv: string[] = Bun.argv.slice(2)): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (positionals.length !== 1 || !positionals[0]) {
    throw new UsageError("expected exactly one file");
  }
  const range = { from: seconds(values.from), to: seconds(values.to) };
  const choice = {
    ...(values.model ? { model: values.model } : {}),
    ...(values.language ? { language: values.language.toLowerCase() } : {}),
  };
  console.log(await transcribe(positionals[0], log, range, values.words ?? false, choice));
  return 0;
}

const parse = (args: string[]) =>
  parseArgs({
    args,
    options: {
      words: { type: "boolean" },
      from: { type: "string" },
      to: { type: "string" },
      model: { type: "string" },
      language: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

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
