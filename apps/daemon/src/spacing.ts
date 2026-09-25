import { needsLeadingSpace } from "@mockingbird/context";

/** The end of the last dictation that was typed in full. */
export type LastTyped = {
  bundleId: string;
  /** Its final character. */
  lastChar: string;
};

/**
 * How close to a Fn press or release a key press has to be to count as part
 * of it. A quick Fn tap can reach the event tap as a key press of its own, and
 * which keycode it carries isn't something to rely on. Clicks are never
 * excused this way: Fn doesn't produce one, and a click just before holding Fn
 * is the usual way to put the cursor somewhere new.
 */
const FN_WINDOW_MS = 300;
/** Plenty for the gap between two dictations; older entries are dropped. */
const MAX_EVENTS = 64;

/**
 * Key presses and clicks since the last dictation was typed, from the Fn
 * event tap: just times, never which key. Answers whether the text cursor may
 * have moved since then.
 */
export class InputTracker {
  private keys: number[] = [];
  private clicked = false;
  private fnEvents: number[] = [];

  /** A key other than Fn was pressed, or the mouse clicked. */
  input(at: number, source: "key" | "click"): void {
    if (source === "click") {
      this.clicked = true;
      return;
    }
    this.keys.push(at);
    if (this.keys.length > MAX_EVENTS) this.keys.shift();
  }

  /** Fn went down or up. */
  fn(at: number): void {
    this.fnEvents.push(at);
    if (this.fnEvents.length > MAX_EVENTS) this.fnEvents.shift();
  }

  /** A dictation was just typed; start counting again. */
  reset(): void {
    this.keys = [];
    this.clicked = false;
    this.fnEvents = [];
  }

  /** Whether anything other than Fn and what comes with it happened since `reset`. */
  hasInput(): boolean {
    if (this.clicked) return true;
    return this.keys.some(
      (at) => !this.fnEvents.some((fnAt) => Math.abs(fnAt - at) <= FN_WINDOW_MS),
    );
  }
}

export type SpacingDecision = {
  space: boolean;
  /** For the log: why, without the character itself. */
  why: string;
};

/**
 * Whether dictated text needs a space in front. A character the app reports
 * before the cursor decides. Many apps don't report one (Chrome pages,
 * Electron apps), and some report an empty field that isn't the one on screen
 * (Google Docs takes typing through a hidden, always-empty box). Then it's the
 * end of our own last dictation into that app, as long as nothing was typed or
 * clicked since: the cursor can only still be right after it.
 *
 * `inputSince` is undefined when key presses and clicks aren't being watched
 * (no Fn listener), which means we can't know and don't guess.
 */
export function decideSpacing({
  read,
  last,
  bundleId,
  inputSince,
}: {
  read: string | undefined;
  last: LastTyped | undefined;
  bundleId: string;
  inputSince: boolean | undefined;
}): SpacingDecision {
  if (read) {
    return needsLeadingSpace(read)
      ? { space: true, why: "the app shows text right before the cursor" }
      : { space: false, why: "the app shows a line start, space, or bracket before the cursor" };
  }
  const app = read === "" ? "the app shows an empty field" : "the app doesn't show its text";
  const no = (reason: string): SpacingDecision => ({ space: false, why: `${app}, and ${reason}` });
  if (!last) return no("there's no earlier dictation to follow");
  if (last.bundleId !== bundleId) return no("the last dictation went to another app");
  if (inputSince === undefined) return no("key presses can't be watched without the Fn listener");
  if (inputSince) return no("a key was pressed or the mouse clicked since the last dictation");
  return needsLeadingSpace(last.lastChar)
    ? { space: true, why: `${app}, so it follows the last dictation` }
    : no("the last dictation ended in a space or bracket");
}
