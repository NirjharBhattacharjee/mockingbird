import { needsLeadingSpace } from "@mockingbird/context";

/** The end of the last dictation that was typed in full. */
export type LastTyped = {
  bundleId: string;
  /**
   * When the last key press or click on the system happened, read right after
   * typing finished: our own final key event. Any later input moves it.
   */
  inputAt: number;
  /** Its final character. */
  lastChar: string;
};

/**
 * Slack for comparing input times: the idle clock and `Date.now()` are read
 * separately, so the same event can come out a few milliseconds apart. Far
 * shorter than anyone can click or press a key after typing finishes.
 */
const SAME_INPUT_SLACK_MS = 50;

/** When the last key press or click happened, from seconds since then. */
export function lastInputAt(now: number, idleSeconds: number): number {
  return now - idleSeconds * 1000;
}

/**
 * The character before the cursor, for deciding on a leading space. A
 * character the app reports wins. Many apps don't report one (Chrome pages,
 * Electron apps), and some report an empty field that isn't the one on screen
 * (Google Docs takes typing through a hidden, always-empty box). In both cases
 * it's the end of our own last dictation into that app, as long as nothing was
 * typed or clicked since: then the cursor can only still be right after it.
 */
export function charBefore({
  read,
  last,
  bundleId,
  now,
  idleSeconds,
}: {
  read: string | undefined;
  last: LastTyped | undefined;
  bundleId: string;
  now: number;
  idleSeconds: number | undefined;
}): string | undefined {
  if (read) return read;
  if (!last || last.bundleId !== bundleId || idleSeconds === undefined) return read;
  const sameInput = lastInputAt(now, idleSeconds) - last.inputAt <= SAME_INPUT_SLACK_MS;
  return sameInput ? last.lastChar : read;
}

/**
 * Says for the log whether a space went in and where the decision came from,
 * without the character itself: `read` is what the app reported, `before`
 * what was decided on.
 */
export function describeSpacing(read: string | undefined, before: string | undefined): string {
  const space = needsLeadingSpace(before);
  if (space) {
    return before === read
      ? "space added (the app showed the text before the cursor)"
      : "space added (right after the last dictation)";
  }
  if (before === undefined) return "no space (the app doesn't show the text before the cursor)";
  return "no space (start of a line or field, after a space, or after a bracket)";
}
