import {
  accessSync,
  constants,
  existsSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { main as dictionaryMain, readDictionary } from "./dictionary.ts";
import { mcpTools, serve } from "./mcp.ts";
import {
  findChrome,
  listModels,
  type ModelFile,
  modelsCommand,
  pullChrome,
  pullModels,
  pullWhisper,
  resolveModel,
} from "./models.ts";
import { main as recordMain } from "./record.ts";
import { retireDictation } from "./retire.ts";
import { ffmpegMissing, findWhisperServer, mockingbirdHome, pinnedWhisper } from "./runtime.ts";
import { doctor, setup } from "./setup.ts";
import { main as transcribeMain, UsageError } from "./transcribe.ts";
import { uninstall } from "./uninstall.ts";

/** The commands, for `--help`. */
export const COMMANDS: { name: string; summary: string }[] = [
  { name: "transcribe", summary: "an audio or video file's speech, with timestamps" },
  { name: "record", summary: "record the microphone into a file, for a voiceover" },
  { name: "dictionary", summary: "list, add and remove words it should spell right" },
  { name: "models", summary: "list the transcription models, or `models use <file>` one" },
  {
    name: "models pull",
    summary:
      "download the speech models, and whisper-server on Linux and\nWindows; `models pull <name or URL>` any Whisper model;\n`models pull chrome` the Chrome motion renders HTML in\n(these and `setup` are the only commands that use the network)",
  },
  {
    name: "setup",
    summary: "install what's missing and add it to your coding agents\n(asks first; --yes doesn't)",
  },
  { name: "doctor", summary: "check every part, and say how to fix what's broken" },
  { name: "status", summary: "whether the models and tools it needs are installed" },
  { name: "mcp", summary: "serve the editing tools to an AI agent over MCP" },
  { name: "uninstall", summary: "remove mockingbird and what it installed (asks first)" },
];

const USAGE = `Usage: mockingbird <command> [options]

A video editing engine for AI agents. Your agent transcribes, cuts,
captions, animates and renders real footage with it, on this computer.

Commands:
${[...COMMANDS, { name: "-h, --help", summary: "show this help" }]
  .map(
    ({ name, summary }) => `  ${name.padEnd(13)}${summary.replaceAll("\n", `\n${" ".repeat(15)}`)}`,
  )
  .join("\n")}

Run a command with --help for its own options, e.g. \`mockingbird transcribe --help\`.`;

const log = (message: string) => console.error(message);

/** The plain `models pull`: the speech models, then whisper-server where it's pinned. */
const pullAll: typeof pullModels = async (deps) => {
  const code = await pullModels(deps);
  return code !== 0 ? code : pullWhisper(deps);
};

/**
 * `models pull`, with the downloads drawn on one line that redraws in place
 * on a terminal. When the installer sets MOCKINGBIRD_PROGRESS, the same line
 * also goes to that file, which the install shows in place of its clock.
 */
async function pullWithProgress(pull = pullAll, files?: ModelFile[]): Promise<number> {
  let file = process.env.MOCKINGBIRD_PROGRESS;
  let drawn = false;
  const clear = () => {
    if (drawn) process.stderr.write("\r\x1b[K");
    drawn = false;
  };
  try {
    const deps = {
      files,
      log: (message: string) => {
        clear();
        log(message);
      },
      progress: (line: string) => {
        if (file) {
          // Renamed into place, so the installer never reads half a line. The
          // file is only for show: if it can't be written, the downloads go on.
          try {
            writeFileSync(`${file}.tmp`, line);
            renameSync(`${file}.tmp`, file);
          } catch (error) {
            log(`not showing progress: ${error instanceof Error ? error.message : error}`);
            file = undefined;
          }
        }
        if (process.stderr.isTTY) {
          process.stderr.write(`\r\x1b[K${line}`);
          drawn = line !== "";
        }
      },
    };
    return await pull(deps);
  } finally {
    clear();
  }
}

/** `models pull <name or URL> [--sha256 <hex>] [--as <file>]`: one Whisper model, any one (#143). */
async function pullOne(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: { sha256: { type: "string" }, as: { type: "string" } },
    allowPositionals: true,
  });
  if (positionals.length !== 1 || !positionals[0]) {
    throw new UsageError("`models pull` takes one model: a name like large-v3-turbo, or a URL");
  }
  const model = await resolveModel(positionals[0], values);
  const size = model.bytes ? `${(model.bytes / 1e9).toFixed(1)} GB` : "size unknown";
  log(
    `${model.file}: ${size}, from ${new URL(model.url).host}, checked against SHA-256 ${model.sha256}`,
  );
  const code = await pullWithProgress(pullModels, [model]);
  if (code === 0)
    log(
      `Use it with \`mockingbird models use ${model.file}\` (add --language <code> for one language).`,
    );
  return code;
}

/** Whether `path` is a file this user can run. */
function runnable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** What `status` and the MCP `status` tool report. */
export function engineStatus(
  home = mockingbirdHome(),
  which = (name: string) => Bun.which(name),
  env = process.env,
  missing = ffmpegMissing,
) {
  const server = findWhisperServer(env, home, which);
  let words = 0;
  try {
    words = readDictionary(home).length;
  } catch {
    // An unreadable data.db shows as an empty dictionary here; transcribe says why.
  }
  return {
    transcriptionModel: listModels({ home }).find((m) => m.inUse)?.file ?? null,
    vadModel: existsSync(join(home, "models", "silero_vad.onnx")),
    ffmpeg: which("ffmpeg") !== null,
    /** What the system's ffmpeg was built without, of what the engine uses. */
    ffmpegMissing: which("ffmpeg") !== null ? missing() : [],
    whisperServer: server !== undefined && (runnable(server) || which(server) !== null),
    chrome: findChrome(env, home) !== undefined,
    dictionaryWords: words,
  };
}

function status(): number {
  const s = engineStatus();
  const yes = (ok: boolean, missing: string) => (ok ? "installed" : `missing: ${missing}`);
  console.log(
    `transcription model: ${s.transcriptionModel ?? "missing: `mockingbird models pull`"}`,
  );
  console.log(`speech detection:    ${yes(s.vadModel, "`mockingbird models pull`")}`);
  const getFfmpeg =
    process.platform === "win32"
      ? "`winget install Gyan.FFmpeg`"
      : process.platform === "linux"
        ? "your package manager's ffmpeg, e.g. `sudo apt install ffmpeg`"
        : "`brew install ffmpeg`";
  const ffmpegLine = s.ffmpegMissing.length
    ? `installed, but built without ${s.ffmpegMissing.join(", ")}: install a full build (${getFfmpeg})`
    : yes(s.ffmpeg, getFfmpeg);
  console.log(`ffmpeg:              ${ffmpegLine}`);
  const getWhisper = pinnedWhisper() ? "`mockingbird models pull`" : "`brew install whisper-cpp`";
  console.log(`whisper-server:      ${yes(s.whisperServer, getWhisper)}`);
  console.log(`chrome:              ${yes(s.chrome, "`mockingbird models pull chrome`")}`);
  console.log(`dictionary:          ${s.dictionaryWords} words`);
  return s.transcriptionModel &&
    s.vadModel &&
    s.ffmpeg &&
    !s.ffmpegMissing.length &&
    s.whisperServer
    ? 0
    : 1;
}

/** `uninstall` with the real git and du behind it. */
function uninstallHere(args: string[]): Promise<number> {
  if (args.some((a) => a !== "--yes")) {
    throw new UsageError("`mockingbird uninstall` takes only --yes");
  }
  const out = (argv: string[]) => {
    const r = Bun.spawnSync(argv, { stderr: "ignore" });
    return r.exitCode === 0 ? r.stdout.toString().trim() : undefined;
  };
  return uninstall(args, {
    mockingbirdHome: mockingbirdHome(),
    root:
      process.env.MOCKINGBIRD_ROOT ??
      realpathSync(join(dirname(Bun.fileURLToPath(import.meta.url)), "..", "..", "..")),
    ask: (question, fallback) => {
      const answer = prompt(question)?.trim();
      return answer ? /^y/i.test(answer) : fallback;
    },
    log,
    retire: () => retireDictation(),
    git: (args) => out(["git", ...args]),
    sizeOf: (path) => out(["du", "-sh", path])?.split("\t")[0] ?? "",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: zsh expands it, not JS.
    zdotdir: out(["zsh", "-c", 'printf %s "${ZDOTDIR:-$HOME}"']),
  });
}

export async function main(argv: string[] = Bun.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case undefined:
    case "-h":
    case "--help":
    case "help":
      console.log(USAGE);
      return 0;
    case "status":
      return status();
    case "doctor":
      return doctor(rest);
    case "setup":
      return setup(rest, {
        ask: (question, fallback) => {
          const answer = prompt(question);
          // No input at all (closed, or not a terminal) is a no, never the default.
          if (answer === null) return false;
          return answer.trim() ? /^y/i.test(answer.trim()) : fallback;
        },
        pull: pullWithProgress,
        pullChrome: () => pullWithProgress(pullChrome),
      });
    case "models":
      if (rest.length === 1 && rest[0] === "pull") return pullWithProgress();
      if (rest.length === 2 && rest[0] === "pull" && rest[1] === "chrome") {
        return pullWithProgress(pullChrome);
      }
      if (rest.length === 2 && rest[0] === "pull" && rest[1] === "whisper-server") {
        return pullWithProgress((deps) => pullWhisper({ ...deps, force: true }));
      }
      if (rest[0] === "pull") return pullOne(rest.slice(1));
      return modelsCommand(rest);
    case "dictionary":
      return dictionaryMain(rest);
    case "transcribe":
      return transcribeMain(rest);
    case "record":
      return recordMain(rest);
    case "uninstall":
      return uninstallHere(rest);
    case "mcp":
      return serve(mcpTools(async () => engineStatus(), log));
    default:
      throw new UsageError(`unknown command "${command}"`);
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
