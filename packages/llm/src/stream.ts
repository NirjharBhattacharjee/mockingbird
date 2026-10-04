/**
 * Typing a cleanup while the model is still writing it, so the first words
 * show up as soon as they exist rather than when the last one does. Text that
 * has been typed can't be taken back, so only what's safe goes early: the
 * transcript's own words, in its order. Everything else waits for the whole
 * cleanup and `acceptCleanup`, as before.
 */
import type { DictionaryEntry } from "./dictionary.ts";

const WORD = /[\p{L}\p{N}']+/gu;
/** Punctuation a cleanup adds or keeps; any other symbol stops early typing. */
const PUNCTUATION_ONLY = /^[.,!?;:'"…()-]+$/;
/**
 * Most transcript words a cleanup drops between two it keeps: fillers, a
 * correction ("for four, actually make that six"). A longer gap waits for
 * `acceptCleanup` like anything else. It's also the most a rejected cleanup
 * can have dropped between two words already typed, so it's kept small.
 */
const MAX_SKIPPED = 5;

/** Transcript words with where each ends, lowercased for matching. */
function rawWords(raw: string) {
  return [...raw.matchAll(WORD)].map((m) => ({
    word: m[0].toLowerCase(),
    end: (m.index ?? 0) + m[0].length,
  }));
}

/**
 * Walks `text` token by token, matching each word against the transcript in
 * order and allowing only punctuation besides. Returns how much of `text`
 * matched, and the transcript position after the last word it matched.
 */
function match(raw: string, text: string) {
  const said = rawWords(raw);
  let next = 0;
  let rawEnd = 0;
  for (const token of text.matchAll(/\S+/g)) {
    const words = token[0].toLowerCase().match(WORD) ?? [];
    // "hello&&" is a word the speaker said with a symbol they didn't.
    const symbols = token[0].replace(WORD, "");
    let ok = words.length > 0 || symbols !== "";
    if (symbols !== "" && !PUNCTUATION_ONLY.test(symbols)) ok = false;
    for (const word of ok ? words : []) {
      const found = said.findIndex(
        (w, i) => i >= next && i - next <= MAX_SKIPPED && w.word === word,
      );
      if (found < 0) {
        ok = false;
        break;
      }
      next = found + 1;
      rawEnd = said[found]?.end ?? rawEnd;
    }
    if (!ok) return { matched: token.index ?? 0, rawEnd };
  }
  return { matched: text.length, rawEnd };
}

/**
 * The start of a cleanup still being written that can be typed already: its
 * finished words, up to the first one that isn't the transcript's own (an
 * answer, a translation, a heading the model made up) and never past the
 * first line, since a list's lines need the whole cleanup to format.
 */
export function verifiedPrefix(raw: string, partial: string): string {
  const lineEnd = partial.indexOf("\n");
  // The last word may still be growing ("Thurs" before "day"), unless a line break ended it.
  const finished =
    lineEnd >= 0
      ? partial.slice(0, lineEnd)
      : partial.slice(0, Math.max(0, partial.search(/\s+\S*$/)));
  return finished.slice(0, match(raw, finished).matched).trimEnd();
}

/** The transcript after the last of its words in `typed`, a `verifiedPrefix`. */
export function rawRemainder(raw: string, typed: string): string {
  return raw.slice(match(raw, typed).rawEnd).trim();
}

/**
 * `formatText` for a cleanup still being written: spacing and the capital,
 * but no full stop yet. Always the start of what `formatText` makes of the
 * whole line.
 */
export function formatPartial(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/**
 * Words to keep back from the end while typing early, so the words after them
 * are known when deciding whether a dictionary match changes them:
 * `correctNames` looks up to two words past a term's own length,
 * `applyCorrections` across a whole heard phrase.
 */
export function holdBack(dictionary: DictionaryEntry[]): number {
  const longest = Math.max(
    0,
    ...dictionary.map((e) =>
      Math.max(...[e.term, e.heard ?? ""].map((s) => s.split(/\s+/).length)),
    ),
  );
  return longest ? longest + 3 : 0;
}

/** `text` without its last `count` words. */
export function dropLastWords(text: string, count: number): string {
  if (count === 0) return text;
  const words = text.split(" ");
  return words.slice(0, Math.max(0, words.length - count)).join(" ");
}
