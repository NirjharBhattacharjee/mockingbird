import { parseArgs } from "node:util";
import { listAudioDevices } from "@mockingbird/audio";
import { frontmostApp } from "@mockingbird/context";
import { checkInputMonitoring, requestInputMonitoring } from "@mockingbird/hotkey";
import { checkTypingAccess, requestTypingAccess } from "@mockingbird/inject";
import { askForPermissions, type Permission, permissionHelp } from "./permissions.ts";
import type { PipelineResult } from "./pipeline.ts";
import { type Delivery, inputArgsFor, startSession } from "./session.ts";

const USAGE = `Usage: mockingbird listen [--device <number|name>] [--terminal] [--json]
       mockingbird listen --list-devices

Listens to your microphone and types what you say into whatever app is in
front. The text is printed here only when it couldn't be typed.

Keys:
  Fn (hold)        record while held, anywhere on the Mac
  Fn (double-tap)  record hands-free until you press Fn again
  Enter or Space   start / stop recording (this terminal only)
  Esc              cancel the current recording
  q or Ctrl+C      quit

Fn needs Input Monitoring permission and typing needs Accessibility; without
them, Enter still works and the text is only printed here.

Options:
  --no-hotkey      don't watch the Fn key
  --no-type        print the text only, don't type it into apps
  --device <d>     microphone number from --list-devices, or its exact name
                   (default: the input selected in System Settings → Sound)
  --list-devices   list microphones and exit
  --terminal       format for a terminal (no trailing period)
  --json           print each result as JSON
  -h, --help       show this help

Environment: the same variables as \`mockingbird transcribe --help\`, plus
  MOCKINGBIRD_MIC_INPUT  ffmpeg input arguments to use instead of the
                         microphone, for testing (e.g. "-re -i clip.wav")`;

class UsageError extends Error {}

const log = (message: string) => console.error(message);
const clearLine = () => process.stderr.write("\r\x1b[2K");

export type Echo = {
  /** A line for stderr, explaining why the text is here rather than in an app. */
  note?: string;
  /** What to print on stdout, if anything. */
  text?: string;
};

/**
 * What the terminal should show. Typing into the app is the point, so text is
 * printed only when it didn't get there — otherwise every dictation would
 * appear twice.
 */
export function echoFor(
  result: PipelineResult,
  delivery: Delivery,
  options: { json?: boolean; typingWanted: boolean },
): Echo {
  if (options.json) return { text: JSON.stringify({ ...result, typed: delivery.typed }, null, 2) };
  if (delivery.typed) return {};
  if (!result.finalText) return { note: "no speech detected" };
  // With --no-type, printing is what was asked for; nothing failed.
  if (!options.typingWanted) return { text: result.finalText };
  return { note: `not typed: ${delivery.reason}. Here it is:`, text: result.finalText };
}

function parse(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      options: {
        device: { type: "string" },
        "list-devices": { type: "boolean" },
        "no-hotkey": { type: "boolean" },
        "no-type": { type: "boolean" },
        terminal: { type: "boolean" },
        json: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

async function printDevices(): Promise<number> {
  const devices = await listAudioDevices();
  if (devices.length === 0) {
    log("no microphones found (is ffmpeg installed? try `brew install ffmpeg`)");
    return 1;
  }
  console.log("Microphones (use the number with --device):");
  for (const d of devices) console.log(`  ${d.index}  ${d.name}`);
  return 0;
}

export async function main(argv: string[] = Bun.argv.slice(2)): Promise<number> {
  const { values } = parse(argv);
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (values["list-devices"]) return printDevices();
  if (!process.stdin.isTTY) {
    throw new UsageError(
      "listen needs an interactive terminal to read key presses.\n" +
        "To run it in the background instead, use `mockingbird start`.",
    );
  }

  const typingWanted = !values["no-type"];
  const typingAllowed = typingWanted && checkTypingAccess();
  const hotkeyWanted = !values["no-hotkey"];
  const hotkeyAllowed = hotkeyWanted && checkInputMonitoring() === "granted";
  const missing: Permission[] = [];
  if (hotkeyWanted && !hotkeyAllowed) missing.push("input-monitoring");
  if (typingWanted && !typingAllowed) missing.push("accessibility");
  const [first, ...rest] = missing;
  if (first) {
    // The terminal is in front until System Settings opens, and it's the app
    // macOS grants these to, so look it up before asking.
    const app = (await frontmostApp().catch(() => undefined))?.name;
    // Asked before the engines start, so System Settings is up while they load.
    askForPermissions([first, ...rest], {
      "input-monitoring": requestInputMonitoring,
      accessibility: requestTypingAccess,
    });
    log(permissionHelp([first, ...rest], app));
  }

  const session = await startSession({
    inputArgs: inputArgsFor(values.device),
    terminalStyle: values.terminal,
    typingAllowed,
    hotkeyAllowed,
    log,
    beforeMessage: clearLine,
    onResult: (result, delivery) => {
      const echo = echoFor(result, delivery, { json: values.json, typingWanted });
      if (echo.note) log(echo.note);
      if (echo.text !== undefined) console.log(echo.text);
    },
  });

  const onKey = (data: Buffer) => {
    const keys = data.toString();
    // Arrow keys and other escape sequences arrive as one chunk; only a lone ESC cancels.
    if (keys.length > 1 && keys.startsWith("\x1b")) return;
    for (const key of keys) {
      if (session.controller.key(key) === "quit") session.end(0);
    }
  };

  const ticker = setInterval(() => {
    process.stderr.write(`\r\x1b[2K${session.controller.status()}`);
  }, 100);
  process.stdin.setRawMode(true);
  process.stdin.on("data", onKey);
  process.stdin.resume();
  process.once("SIGTERM", () => session.end(143));

  const code = await session.ended;

  clearInterval(ticker);
  process.stdin.off("data", onKey);
  process.stdin.setRawMode(false);
  process.stdin.pause();
  clearLine();
  await session.close();
  return code;
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
