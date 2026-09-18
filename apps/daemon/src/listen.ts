import { parseArgs } from "node:util";
import {
  type CaptureProcess,
  listAudioDevices,
  micInputArgs,
  peak,
  startCapture,
} from "@mockingbird/audio";
import { type FrontmostApp, frontmostApp, isTerminal } from "@mockingbird/context";
import {
  checkInputMonitoring,
  type HotkeyListener,
  startHotkeyListener,
} from "@mockingbird/hotkey";
import { checkTypingAccess, typeText } from "@mockingbird/inject";
import { HotkeyFsm } from "./hotkey-fsm.ts";
import { ListenController } from "./listen-controller.ts";
import { describeTimings, runPipeline } from "./pipeline.ts";
import type { Recording } from "./recorder.ts";
import { Recorder } from "./recorder.ts";
import { startEngines } from "./runtime.ts";
import { Supervisor } from "./supervisor.ts";

const USAGE = `Usage: bun run listen [--device <number|name>] [--terminal] [--json]
       bun run listen --list-devices

Listens to your microphone and types what you say into whatever app is in
front, and prints it here too.

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

Environment: the same variables as \`bun run transcribe --help\`, plus
  MOCKINGBIRD_MIC_INPUT  ffmpeg input arguments to use instead of the
                         microphone, for testing (e.g. "-re -i clip.wav")`;

class UsageError extends Error {}

const log = (message: string) => console.error(message);
const clearLine = () => process.stderr.write("\r\x1b[2K");

function parse() {
  try {
    return parseArgs({
      args: Bun.argv.slice(2),
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

async function main(): Promise<number> {
  const { values } = parse();
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (values["list-devices"]) return printDevices();
  if (!process.stdin.isTTY) {
    throw new UsageError("listen needs an interactive terminal to read key presses");
  }

  const typingWanted = !values["no-type"];
  const typingAllowed = typingWanted && checkTypingAccess();
  if (typingWanted && !typingAllowed) {
    log(
      "typing into apps is off: enable Accessibility for this terminal in System Settings →\n" +
        "Privacy & Security → Accessibility, then quit and reopen it. Text is printed here meanwhile.",
    );
  }
  /** The app that was in front when the recording started. */
  let target: FrontmostApp | undefined;

  const inputArgs = process.env.MOCKINGBIRD_MIC_INPUT
    ? process.env.MOCKINGBIRD_MIC_INPUT.split(/\s+/).filter(Boolean)
    : micInputArgs(values.device);

  const engines = await startEngines(log);

  const transcribe = async ({ audio, truncated }: Recording) => {
    if (peak(audio.samples) === 0) {
      clearLine();
      log(
        "the recording was completely silent. If macOS didn't ask for microphone access, turn it on\n" +
          "for your terminal in System Settings → Privacy & Security → Microphone, then restart listen.",
      );
      return;
    }
    // Terminals get command-friendly text: no trailing period.
    const style = values.terminal || isTerminal(target) ? "terminal" : "default";
    const result = await runPipeline({ audio, style }, engines.deps);
    clearLine();
    if (values.json) console.log(JSON.stringify(result, null, 2));
    else if (result.finalText) console.log(result.finalText);
    else log("no speech detected");
    if (truncated) log("the recording hit the 2-minute limit, so the end was cut off");
    if (result.llmOutcome === "failed") log(`cleanup failed: ${result.llmError}`);

    if (typingAllowed && result.finalText) {
      try {
        await typeText(result.finalText);
      } catch (error) {
        log(`couldn't type it: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!values.json) log(describeTimings(result));
  };

  const hotkeyWanted = !values["no-hotkey"];
  const hotkeyAllowed = hotkeyWanted && checkInputMonitoring() === "granted";
  const controller = new ListenController(
    new Recorder(),
    transcribe,
    (error) => {
      clearLine();
      log(`error: ${error instanceof Error ? error.message : String(error)}`);
    },
    hotkeyAllowed
      ? { start: "hold Fn to talk (or Enter) · q: quit", stop: "release Fn · Esc: cancel" }
      : { start: "Enter: start speaking · q: quit", stop: "Enter: stop · Esc: cancel" },
    () => {
      target = undefined;
      void frontmostApp().then((app) => {
        target = app;
      });
    },
  );

  const fsm = new HotkeyFsm();
  let hotkey: HotkeyListener | undefined;
  if (hotkeyAllowed) {
    hotkey = startHotkeyListener({
      onEvent: (event) => {
        const action = fsm.handle(event);
        if (action === "start") controller.startRecording();
        else if (action === "stop") controller.stopRecording();
        else if (action === "cancel") controller.cancelRecording();
      },
      onError: (error) => {
        clearLine();
        log(`Fn key unavailable: ${error.message}`);
      },
    });
    try {
      await hotkey.ready;
    } catch (error) {
      clearLine();
      log(`Fn key unavailable: ${error instanceof Error ? error.message : String(error)}`);
      await hotkey.stop();
      hotkey = undefined;
    }
  } else if (hotkeyWanted) {
    log(
      "Fn key off: enable Input Monitoring for this terminal in System Settings →\n" +
        "Privacy & Security → Input Monitoring, then quit and reopen it. Enter still works.",
    );
  }

  let finish: (code: number) => void = () => {};
  const finished = new Promise<number>((resolve) => {
    finish = resolve;
  });

  let capture: CaptureProcess | undefined;
  let lastDetail: string | undefined;
  const supervisor = new Supervisor(
    () => {
      capture = startCapture({ inputArgs, onSamples: (s) => controller.onSamples(s) });
      return capture;
    },
    {
      onEvent: (event) => {
        if (event.type === "exited") {
          clearLine();
          const detail = capture?.stderrTail() ?? "";
          // ffmpeg prefixes lines with object addresses that change every run.
          const key = detail.replace(/0x[0-9a-f]+/gi, "");
          const message = `microphone stopped (ffmpeg exited with ${event.code})`;
          log(detail && key !== lastDetail ? `${message}:\n${detail}` : message);
          lastDetail = key;
        } else if (event.type === "restarting") {
          log(`restarting the microphone in ${event.delayMs}ms...`);
        } else if (event.type === "gave-up") {
          log(
            "giving up on the microphone. Check the device with `bun run listen --list-devices`\n" +
              "and that your terminal has microphone access in System Settings.",
          );
          finish(1);
        }
      },
    },
  );

  const onKey = (data: Buffer) => {
    const keys = data.toString();
    // Arrow keys and other escape sequences arrive as one chunk; only a lone ESC cancels.
    if (keys.length > 1 && keys.startsWith("\x1b")) return;
    for (const key of keys) {
      if (controller.key(key) === "quit") finish(0);
    }
  };

  const ticker = setInterval(() => {
    fsm.tick(Date.now());
    process.stderr.write(`\r\x1b[2K${controller.status()}`);
  }, 100);
  process.stdin.setRawMode(true);
  process.stdin.on("data", onKey);
  process.stdin.resume();
  process.once("SIGTERM", () => finish(143));
  supervisor.start();

  const code = await finished;

  clearInterval(ticker);
  process.stdin.off("data", onKey);
  process.stdin.setRawMode(false);
  process.stdin.pause();
  clearLine();
  if (controller.busy) log("finishing the current transcription...");
  await controller.settled();
  await hotkey?.stop();
  await supervisor.stop();
  await engines.close();
  return code;
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
