import { KEYCODE_ESCAPE, type TapEvent } from "@mockingbird/hotkey";

export type HotkeyState =
  | "IDLE"
  /** Fn is down but it isn't yet clear whether this is a hold or a tap. */
  | "ARMED"
  /** Waiting to see if a second tap arrives, which means lock mode. */
  | "TAP_WAIT"
  | "CAPTURE_PTT"
  | "CAPTURE_LOCK";

export type HotkeyAction = "start" | "stop" | "cancel";

export type HotkeyFsmOptions = {
  /** Fn held at least this long is a hold, not a tap. */
  holdMs?: number;
  /** A second tap within this window starts hands-free mode. */
  doubleTapMs?: number;
};

/**
 * Turns Fn key events into recording actions (ARCHITECTURE.md §5).
 * Recording starts as soon as Fn goes down, and is cancelled if the press
 * turns out to be a tap, so no speech is lost at the start of a hold.
 */
export class HotkeyFsm {
  private current: HotkeyState = "IDLE";
  private since = 0;
  private readonly holdMs: number;
  private readonly doubleTapMs: number;

  constructor({ holdMs = 180, doubleTapMs = 300 }: HotkeyFsmOptions = {}) {
    this.holdMs = holdMs;
    this.doubleTapMs = doubleTapMs;
  }

  get state(): HotkeyState {
    return this.current;
  }

  get recording(): boolean {
    return (
      this.current === "ARMED" || this.current === "CAPTURE_PTT" || this.current === "CAPTURE_LOCK"
    );
  }

  /** When tick() next needs to be called, or undefined if no timer is pending. */
  get deadline(): number | undefined {
    if (this.current === "ARMED") return this.since + this.holdMs;
    if (this.current === "TAP_WAIT") return this.since + this.doubleTapMs;
    return undefined;
  }

  handle(event: TapEvent): HotkeyAction | undefined {
    if (event.type === "key-down" && event.keycode === KEYCODE_ESCAPE) {
      if (!this.recording) return undefined;
      this.enter("IDLE", event.at);
      return "cancel";
    }

    if (event.type === "fn-down") {
      switch (this.current) {
        case "IDLE":
          this.enter("ARMED", event.at);
          return "start";
        case "TAP_WAIT":
          this.enter("CAPTURE_LOCK", event.at);
          return "start";
        case "CAPTURE_LOCK":
          this.enter("IDLE", event.at);
          return "stop";
        default:
          return undefined;
      }
    }

    if (event.type === "fn-up") {
      switch (this.current) {
        case "ARMED":
          // Held long enough but tick() hasn't run yet: still a hold.
          if (event.at - this.since >= this.holdMs) {
            this.enter("IDLE", event.at);
            return "stop";
          }
          // Too short to be a hold: drop it and wait for a possible second tap.
          this.enter("TAP_WAIT", event.at);
          return "cancel";
        case "CAPTURE_PTT":
          this.enter("IDLE", event.at);
          return "stop";
        default:
          return undefined;
      }
    }

    return undefined;
  }

  /** Applies time-based transitions; call at or after `deadline`. */
  tick(now: number): HotkeyAction | undefined {
    if (this.current === "ARMED" && now - this.since >= this.holdMs) {
      this.enter("CAPTURE_PTT", now);
    } else if (this.current === "TAP_WAIT" && now - this.since >= this.doubleTapMs) {
      this.enter("IDLE", now);
    }
    return undefined;
  }

  private enter(state: HotkeyState, at: number): void {
    this.current = state;
    this.since = at;
  }
}
