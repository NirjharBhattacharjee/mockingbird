import { type CaptureProcess, micInputArgs, peak, startCapture } from "@mockingbird/audio";
import { charBeforeCaret, type FrontmostApp, frontmostApp, isTerminal } from "@mockingbird/context";
import { type Cue, cues } from "@mockingbird/cue";
import { type HotkeyListener, startHotkeyListener } from "@mockingbird/hotkey";
import { prepareForTyping, type TypeResult, typeText } from "@mockingbird/inject";
import type { AppStyle } from "@mockingbird/llm";
import { HotkeyFsm } from "./hotkey-fsm.ts";
import { ListenController } from "./listen-controller.ts";
import { describeTimings, type PipelineResult, runPipeline } from "./pipeline.ts";
import { Recorder, type Recording } from "./recorder.ts";
import { startEngines } from "./runtime.ts";
import { decideSpacing, InputTracker, type LastTyped } from "./spacing.ts";
import { Supervisor } from "./supervisor.ts";

/** Whether the text reached the app, and why not when it didn't. */
export type Delivery =
  | {
      typed: true;
      /** Whether a space went in first, and why; never mentions the text. */
      spacing: string;
    }
  | { typed: false; reason: string };

/** How often focus is re-checked while the text is being typed. */
const FOCUS_POLL_MS = 50;

type FocusWatch = {
  /** False once focus has left the app the text was dictated into. */
  stillThere: () => boolean;
  /** Where focus went. Only meaningful once `stillThere` is false. */
  movedTo: () => FrontmostApp | undefined;
  /** Stops the polling at its next check. */
  stop: () => void;
};

/**
 * Watches focus while text is being typed. A long dictation is hundreds of key
 * events with pauses between them, which is long enough for the user to switch
 * apps — and without this the rest of the text would follow them there. Polls
 * alongside the typing rather than between chunks, so it costs no typing speed.
 * A frontmost app we can't read counts as a change: stopping early loses the
 * tail of a dictation, typing on regardless could put it anywhere.
 */
function watchFocus(target: FrontmostApp): FocusWatch {
  let moved: FrontmostApp | undefined;
  let left = false;
  let watching = true;
  void (async () => {
    while (watching) {
      await Bun.sleep(FOCUS_POLL_MS);
      if (!watching) return;
      const now = await frontmostApp().catch(() => undefined);
      if (!watching) return;
      if (now?.bundleId !== target.bundleId) {
        moved = now;
        left = true;
        return;
      }
    }
  })();
  return {
    stillThere: () => !left,
    movedTo: () => moved,
    stop: () => {
      watching = false;
    },
  };
}

export type SessionOptions = {
  /** ffmpeg input arguments, from `inputArgsFor`. */
  inputArgs: string[];
  /** Forces terminal-style formatting; otherwise the target app decides. */
  terminalStyle?: boolean;
  typingAllowed: boolean;
  hotkeyAllowed: boolean;
  /** Play a sound when recording starts, ends, and when something failed. */
  cues?: boolean;
  /** Status and error messages. Never receives transcribed text. */
  log: (message: string) => void;
  /** Runs before each `log`, so a terminal can clear its status line first. */
  beforeMessage?: () => void;
  /** The text and where it ended up. The only place transcribed text is handed out. */
  onResult?: (result: PipelineResult, delivery: Delivery) => void;
};

export type Session = {
  readonly controller: ListenController;
  /**
   * Whether any sound at all has reached us. A microphone we aren't allowed to
   * use still yields samples, just digitally silent ones, so this is the only
   * way to tell a denied permission from a quiet room before transcribing.
   */
  readonly heardSound: boolean;
  /** Resolves with an exit code when the session stops, by itself or via `end`. */
  readonly ended: Promise<number>;
  /** Hints for the status line, reflecting whether Fn is available. */
  readonly hotkeyActive: boolean;
  end(code: number): void;
  /** Stops everything this session started. Safe to call once `ended` resolves. */
  close(): Promise<void>;
};

/** ffmpeg input arguments for a device, or the test override. */
export function inputArgsFor(device: string | undefined, env = process.env): string[] {
  const override = env.MOCKINGBIRD_MIC_INPUT;
  if (override) return override.split(/\s+/).filter(Boolean);
  return micInputArgs(device);
}

/**
 * Everything between the microphone and the frontmost app: engines, capture,
 * the Fn key, and the pipeline. Deliberately free of terminal UI, so the
 * interactive command and the background agent share one wiring.
 */
export async function startSession(options: SessionOptions): Promise<Session> {
  const { inputArgs, typingAllowed, hotkeyAllowed, onResult } = options;
  const cue: Cue = cues(options.cues ?? false);
  const notify = (message: string) => {
    options.beforeMessage?.();
    options.log(message);
  };

  /** The app that was in front when the recording started. */
  let targetLookup: Promise<FrontmostApp | undefined> = Promise.resolve(undefined);

  const engines = await startEngines(options.log);

  /** Where the last dictation ended, for apps that can't say what's before the cursor. */
  let lastTyped: LastTyped | undefined;
  /** Key presses and clicks since then, from the Fn key's event tap. */
  const inputs = new InputTracker();
  /** Whether those are being watched: it needs the Fn key's event tap. */
  let watchingInput = false;

  const deliver = async (text: string, target: FrontmostApp | undefined): Promise<Delivery> => {
    if (!typingAllowed) return { typed: false, reason: "typing isn't allowed" };
    try {
      // Transcription takes a while; if the user switched apps meanwhile, the
      // text would land somewhere they didn't dictate it for.
      const now = await frontmostApp();
      if (!target || !now || now.bundleId !== target.bundleId) {
        return {
          typed: false,
          reason:
            `the app in front changed since you started speaking` +
            ` (${target?.name ?? "unknown"} → ${now?.name ?? "unknown"})`,
        };
      }
      // A second sentence shouldn't run into the first. Checked now rather
      // than when recording started, so anything typed meanwhile counts.
      // Terminals are left alone: their text is the scrollback, not a field.
      const terminal = isTerminal(now);
      const read = terminal ? undefined : charBeforeCaret();
      const decision = terminal
        ? { space: false, why: "terminals are left alone" }
        : decideSpacing({
            read,
            last: lastTyped,
            bundleId: now.bundleId,
            inputSince: watchingInput ? inputs.hasInput() : undefined,
          });
      const prefix = decision.space ? " " : "";
      const spacing = `${decision.space ? "space added" : "no space"}: ${decision.why}`;
      lastTyped = undefined;
      const watch = watchFocus(now);
      let result: TypeResult;
      try {
        result = await typeText(text, {
          prefix,
          // A dictated list is typed as lines, with Shift+Return. Not in a
          // terminal, where any Return runs the command.
          lineBreaks: !terminal,
          stillWanted: watch.stillThere,
        });
      } finally {
        watch.stop();
      }
      if (result.typed >= result.total) {
        const lastChar = prepareForTyping(text).slice(-1);
        if (lastChar) lastTyped = { bundleId: now.bundleId, lastChar };
        inputs.reset();
        return { typed: true, spacing };
      }
      return {
        typed: false,
        reason:
          `the app in front changed while the text was being typed` +
          ` (${now.name} → ${watch.movedTo()?.name ?? "unknown"}), so only` +
          ` ${result.typed} of its ${result.total} characters went in`,
      };
    } catch (error) {
      return { typed: false, reason: error instanceof Error ? error.message : String(error) };
    }
  };

  const transcribe = async ({ audio, truncated }: Recording) => {
    const target = await targetLookup;
    if (peak(audio.samples) === 0) {
      notify(
        "the recording was completely silent. If macOS didn't ask for microphone access, turn it on\n" +
          "in System Settings → Privacy & Security → Microphone, then start again.",
      );
      return;
    }
    // Terminals get command-friendly text: no trailing period.
    const style: AppStyle = options.terminalStyle || isTerminal(target) ? "terminal" : "default";
    const result = await runPipeline({ audio, style }, engines.deps);
    options.beforeMessage?.();

    const delivery: Delivery = result.finalText
      ? await deliver(result.finalText, target)
      : { typed: false, reason: "no speech detected" };

    if (!delivery.typed && result.finalText) cue("error");
    onResult?.(result, delivery);
    if (delivery.typed) notify(delivery.spacing);
    if (truncated) notify("the recording hit the 2-minute limit, so the end was cut off");
    if (result.llmOutcome === "failed") notify(`cleanup failed: ${result.llmError}`);
    notify(describeTimings(result));
  };

  const controller = new ListenController(
    new Recorder(),
    transcribe,
    (error) => {
      cue("error");
      notify(`error: ${error instanceof Error ? error.message : String(error)}`);
    },
    hotkeyAllowed
      ? { start: "hold Fn to talk (or Enter) · q: quit", stop: "release Fn · Esc: cancel" }
      : { start: "Enter: start speaking · q: quit", stop: "Enter: stop · Esc: cancel" },
    () => {
      targetLookup = frontmostApp().catch(() => undefined);
      // Warms the model while the user is still speaking, so the cleanup that
      // follows doesn't pay a cold load. Failure just means a slower cleanup.
      void engines.deps.llm.load?.().catch(() => {});
    },
  );

  let end: (code: number) => void = () => {};
  const ended = new Promise<number>((resolve) => {
    end = resolve;
  });

  // The FSM needs a nudge when a hold becomes a hold and when a tap window
  // closes. Scheduling on its deadline avoids a timer ticking all day.
  const fsm = new HotkeyFsm();
  let capturing = false;
  /**
   * Beeps only once the FSM has committed to a recording. Fn-down arms
   * optimistically and a short tap cancels it again, so cueing that transition
   * would beep at presses that never recorded anything.
   */
  const syncCue = () => {
    const now = fsm.state === "CAPTURE_PTT" || fsm.state === "CAPTURE_LOCK";
    if (now === capturing) return;
    capturing = now;
    cue(now ? "start" : "stop");
  };
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleTick = () => {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    deadlineTimer = undefined;
    const { deadline } = fsm;
    if (deadline === undefined) return;
    deadlineTimer = setTimeout(
      () => {
        deadlineTimer = undefined;
        fsm.tick(Date.now());
        syncCue();
        scheduleTick();
      },
      Math.max(0, deadline - Date.now()),
    );
  };

  let hotkey: HotkeyListener | undefined;
  if (hotkeyAllowed) {
    hotkey = startHotkeyListener({
      onEvent: (event) => {
        if (event.type === "input") {
          inputs.input(event.at);
          return;
        }
        if (event.type === "fn-down" || event.type === "fn-up") inputs.fn(event.at);
        const action = fsm.handle(event);
        if (action === "start") controller.startRecording();
        else if (action === "stop") controller.stopRecording();
        else if (action === "cancel") controller.cancelRecording();
        syncCue();
        scheduleTick();
      },
      onError: (error) => notify(`Fn key unavailable: ${error.message}`),
    });
    try {
      await hotkey.ready;
      watchingInput = true;
    } catch (error) {
      notify(`Fn key unavailable: ${error instanceof Error ? error.message : String(error)}`);
      await hotkey.stop();
      hotkey = undefined;
    }
  }

  let capture: CaptureProcess | undefined;
  let lastDetail: string | undefined;
  let heardSound = false;
  const supervisor = new Supervisor(
    () => {
      capture = startCapture({
        inputArgs,
        onSamples: (s) => {
          if (!heardSound && peak(s) > 0) heardSound = true;
          controller.onSamples(s);
        },
      });
      return capture;
    },
    {
      onEvent: (event) => {
        if (event.type === "exited") {
          const detail = capture?.stderrTail() ?? "";
          // ffmpeg prefixes lines with object addresses that change every run.
          const key = detail.replace(/0x[0-9a-f]+/gi, "");
          const message = `microphone stopped (ffmpeg exited with ${event.code})`;
          notify(detail && key !== lastDetail ? `${message}:\n${detail}` : message);
          lastDetail = key;
        } else if (event.type === "restarting") {
          notify(`restarting the microphone in ${event.delayMs}ms...`);
        } else if (event.type === "gave-up") {
          notify(
            "giving up on the microphone. Check the device with `mockingbird listen --list-devices`\n" +
              "and that microphone access is allowed in System Settings.",
          );
          end(1);
        }
      },
    },
  );
  supervisor.start();

  let closing: Promise<void> | undefined;
  return {
    controller,
    get heardSound() {
      return heardSound;
    },
    ended,
    hotkeyActive: hotkey !== undefined,
    end,
    close() {
      closing ??= (async () => {
        if (deadlineTimer) clearTimeout(deadlineTimer);
        if (controller.busy) notify("finishing the current transcription...");
        await controller.settled();
        await hotkey?.stop();
        await supervisor.stop();
        await engines.close();
      })();
      return closing;
    },
  };
}
