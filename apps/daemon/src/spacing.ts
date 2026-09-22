import { needsLeadingSpace } from "@mockingbird/context";

/** The end of the last dictation that was typed in full. */
export type LastTyped = {
  bundleId: string;
  /** `Date.now()` once its last key event was posted. */
  at: number;
  /** Its final character. */
  lastChar: string;
};

/**
 * The character before the cursor, for deciding on a leading space. A
 * character the app reports wins. Many apps don't report one (Chrome pages,
 * Electron apps), and some report an empty field that isn't the one on screen
 * (Google Docs takes typing through a hidden, always-empty box). In both cases
 * it's the end of our own last dictation into that app, as long as nothing was
 * typed or clicked since: then the cursor can only still be right after it.
 *
 * `lastInputAt` is when the user last pressed a key (other than Fn) or clicked,
 * from mockingbird's own keyboard watcher; undefined when it isn't running,
 * which means we can't know and don't guess.
 */
export function charBefore({
  read,
  last,
  bundleId,
  lastInputAt,
}: {
  read: string | undefined;
  last: LastTyped | undefined;
  bundleId: string;
  lastInputAt: number | undefined;
}): string | undefined {
  if (read) return read;
  if (!last || last.bundleId !== bundleId || lastInputAt === undefined) return read;
  return lastInputAt > last.at ? read : last.lastChar;
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
