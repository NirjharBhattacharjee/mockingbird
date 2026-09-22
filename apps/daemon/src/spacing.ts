/** The end of the last dictation that was typed in full. */
export type LastTyped = {
  bundleId: string;
  /** `Date.now()` when its last key event was posted. */
  at: number;
  /** Its final character. */
  lastChar: string;
};

/**
 * Slack for our own key events: they count as key presses too, landing just
 * before `at`.
 */
const OWN_TYPING_SLACK_S = 0.25;

/**
 * The character before the cursor, for deciding on a leading space. What the
 * app itself reports wins. Many apps don't report it (Chrome pages, Google
 * Docs, Electron apps), so otherwise it's the end of our own last dictation
 * into that app, as long as nothing was typed or clicked since: then the
 * cursor can only still be right after it. Anything else is unknown.
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
  if (read !== undefined) return read;
  if (!last || last.bundleId !== bundleId || idleSeconds === undefined) return undefined;
  const sinceTyped = (now - last.at) / 1000;
  return idleSeconds >= sinceTyped - OWN_TYPING_SLACK_S ? last.lastChar : undefined;
}
