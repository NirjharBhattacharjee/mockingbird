export type CueKind = "start" | "stop" | "error";

/**
 * macOS ships these, so nothing has to be bundled. Tink rises and Pop falls,
 * which makes "recording" and "done" tellable apart without looking.
 */
const SOUNDS: Record<CueKind, string> = {
  start: "/System/Library/Sounds/Tink.aiff",
  stop: "/System/Library/Sounds/Pop.aiff",
  error: "/System/Library/Sounds/Basso.aiff",
};

/** Quiet enough to sit under speech without being startling. */
const VOLUME = "0.3";

export type PlayCueOptions = {
  /** Injected in tests; the default spawns afplay and doesn't wait for it. */
  spawn?: (cmd: string[]) => void;
  volume?: string;
};

/**
 * Plays a short system sound. Fire-and-forget by design: a cue that failed is
 * never worth interrupting dictation for, and waiting on afplay would add
 * latency to the very moment we're trying to acknowledge.
 */
export function playCue(kind: CueKind, options: PlayCueOptions = {}): void {
  const { volume = VOLUME } = options;
  const spawn =
    options.spawn ??
    ((cmd: string[]) => {
      Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
    });
  try {
    spawn(["afplay", "-v", volume, SOUNDS[kind]]);
  } catch {
    // No afplay, no audio device, sandboxed: dictation carries on regardless.
  }
}

/** A `playCue` that does nothing, for when cues are switched off. */
export const silentCue = (): void => {};

export type Cue = (kind: CueKind) => void;

export function cues(enabled: boolean, options: PlayCueOptions = {}): Cue {
  return enabled ? (kind) => playCue(kind, options) : silentCue;
}
