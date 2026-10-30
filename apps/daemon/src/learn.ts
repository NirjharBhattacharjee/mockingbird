import { readFileSync } from "node:fs";
import { type FocusedField, readFocusedField } from "@mockingbird/context";
import { soundsLike } from "@mockingbird/llm";
import type { Store } from "@mockingbird/store";

/** Characters kept either side of a dictation, to find it again later. */
const ANCHOR = 30;
/** How far the dictation may have moved, from edits above it, and still be found. */
const SLACK = 100;
/** Quiet after the last key press or click before the field is read back. */
const QUIET_MS = 5_000;
/** Replacements longer than this are rewriting, not fixing a misheard word. */
const MAX_WORDS = 3;
/** How alike the old and new words have to sound; correctNames' threshold. */
const MIN_SOUND = 0.7;
/** Short words sound like too many others; correctNames' rule too. */
const MIN_LETTERS = 4;
/** A longer dictation that has lost more than this share of its words was rewritten. */
const MIN_KEPT = 0.5;

/** A dictation as the field showed it right after typing. Held in memory only. */
export type Typed = {
  /** The app it went into. Every later read is refused in any other. */
  pid: number;
  /** Where it starts in the field. */
  start: number;
  before: string;
  inserted: string;
  after: string;
};

export type Correction = { from: string; to: string };

export type Mark = Pick<Typed, "pid" | "start" | "before">;

/** Where a dictation is about to start, and the text before it. */
export function markStart(field: FocusedField): Mark | undefined {
  const before = field.text(field.caret - ANCHOR, field.caret);
  return before === undefined ? undefined : { pid: field.pid, start: field.caret, before };
}

/** The dictation that went in since `markStart`, with the text after it. */
export function markEnd(field: FocusedField, mark: Mark): Typed | undefined {
  const inserted = field.text(mark.start, field.caret);
  const after = field.text(field.caret, field.caret + ANCHOR);
  if (!inserted?.trim() || after === undefined) return undefined;
  return { ...mark, inserted, after };
}

type Word = { key: string; text: string; start: number; end: number };

function words(text: string): Word[] {
  return [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)].map((m) => ({
    key: m[0].toLowerCase(),
    text: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));
}

/** Matched word pairs, in order: the longest common subsequence of keys. */
function align(a: Word[], b: Word[]): [number, number][] {
  const lengths = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = lengths[i] as number[];
      row[j] =
        a[i]?.key === b[j]?.key
          ? (lengths[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(lengths[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const pairs: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i]?.key === b[j]?.key) pairs.push([i++, j++]);
    else if ((lengths[i + 1]?.[j] ?? 0) >= (lengths[i]?.[j + 1] ?? 0)) i++;
    else j++;
  }
  return pairs;
}

const letters = (text: string) => text.replace(/[^\p{L}]/gu, "").length;

/**
 * The misheard words the user fixed in a dictation: each stretch of one to
 * three words that was replaced by one to three others that sound like it.
 * Anything else is the user changing their mind or rewriting, and is dropped:
 * "Tuesday" to "Wednesday" doesn't sound alike, a rewritten sentence loses
 * most of its words, and a stretch with no unchanged word on either side
 * can't be told apart from text that was added.
 */
export function findCorrections(typed: Typed, now: { text: string; from: number }): Correction[] {
  const was = words(typed.before + typed.inserted + typed.after);
  const is = words(now.text);
  const insertedFrom = typed.before.length;
  const insertedTo = insertedFrom + typed.inserted.length;
  const inserted = (w: Word) => w.end > insertedFrom && w.start < insertedTo;

  const pairs = align(was, is);
  const insertedCount = was.filter(inserted).length;
  const kept = pairs.filter(([i]) => inserted(was[i] as Word)).length;
  if (insertedCount === 0) return [];
  // A dictation of a word or three can be all name; a longer one can't.
  if (insertedCount > MAX_WORDS && kept / insertedCount < MIN_KEPT) return [];

  // The text either side of what was read is a real edge only where the field
  // itself starts or ends; anywhere else, a word may have been cut in half.
  const fieldStart = typed.start - typed.before.length === 0 && now.from === 0;
  const fieldEnd = typed.after === "";
  const bounds: [number, number][] = [
    ...(fieldStart ? [[-1, -1] as [number, number]] : []),
    ...pairs,
    ...(fieldEnd ? [[was.length, is.length] as [number, number]] : []),
  ];

  const found: Correction[] = [];
  for (let k = 1; k < bounds.length; k++) {
    const [i0, j0] = bounds[k - 1] as [number, number];
    const [i1, j1] = bounds[k] as [number, number];
    const old = was.slice(i0 + 1, i1);
    const fixed = is.slice(j0 + 1, j1);
    if (!old.length || !fixed.length || old.length > MAX_WORDS || fixed.length > MAX_WORDS)
      continue;
    if (!old.every(inserted)) continue;
    const from = old.map((w) => w.text).join(" ");
    const to = now.text.slice((fixed[0] as Word).start, (fixed.at(-1) as Word).end);
    if (letters(to) < MIN_LETTERS || soundsLike(from, to) < MIN_SOUND) continue;
    found.push({ from, to });
  }
  return found;
}

/** The system word list: a word in it is an ordinary word, not a name to learn. */
const WORD_LIST = "/usr/share/dict/words";

/**
 * Whether every word of `text` is an ordinary English word, or one with an s
 * on the end ("guys"), punctuation aside. Learning one would be harmful:
 * "great" corrected to "grate" once would rewrite every later "great". Read
 * only when asked, which is rare, so it isn't held in memory all day.
 */
export function ordinaryWords(text: string, list = WORD_LIST): boolean {
  let known: string;
  try {
    known = `\n${readFileSync(list, "utf8")}\n`;
  } catch {
    return true;
  }
  const has = (word: string) => known.includes(`\n${word}\n`);
  return (text.toLowerCase().match(/[\p{L}']+/gu) ?? []).every(
    (word) => has(word) || (word.endsWith("s") && has(word.slice(0, -1))),
  );
}

/**
 * Whether a correction should be learned now: seen twice, or once if the user
 * capitalised it, which makes it probably a name.
 */
export function shouldLearn({ from, to }: Correction, count: number): boolean {
  const capital = /^\p{Lu}/u;
  return count >= 2 || (capital.test(to) && !capital.test(from));
}

/**
 * Waits until the user is done with the last dictation: some input, then
 * `quietMs` without any, or the next dictation. Only then is the field read,
 * once. Nothing is read when there was no input, since nothing changed.
 */
export class CorrectionWatcher {
  private pending: Typed | undefined;
  private changed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly check: (typed: Typed) => void,
    private readonly quietMs = QUIET_MS,
  ) {}

  /** A dictation went in; the one before it is checked first. */
  typed(typed: Typed): void {
    this.flush();
    this.pending = typed;
  }

  /** A key press or click. */
  input(): void {
    if (!this.pending) return;
    this.changed = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.quietMs);
  }

  /** Checks the pending dictation now, if it may have been edited. */
  flush(): void {
    clearTimeout(this.timer);
    const typed = this.pending;
    const changed = this.changed;
    this.pending = undefined;
    this.changed = false;
    if (typed && changed) this.check(typed);
  }

  stop(): void {
    clearTimeout(this.timer);
    this.pending = undefined;
  }
}

/**
 * Reads the dictation back, from the stretch of the field it can be in now,
 * and returns the corrections in it.
 */
export function correctionsIn(typed: Typed): Correction[] {
  return (
    readFocusedField((field) => {
      const from = Math.max(0, typed.start - typed.before.length - SLACK);
      const text = field.text(
        from,
        typed.start + typed.inserted.length + typed.after.length + SLACK,
      );
      return text === undefined ? [] : findCorrections(typed, { text, from });
    }, typed) ?? []
  );
}

/**
 * Counts each correction and adds the ones worth learning to the dictionary.
 * Returns the words newly learned. The pairs are stored, never logged.
 */
export function learnFrom(
  store: Pick<Store, "recordCorrection" | "addTerms" | "dictionary">,
  corrections: Correction[],
  isOrdinary = ordinaryWords,
): string[] {
  const learned: string[] = [];
  for (const correction of corrections) {
    const count = store.recordCorrection(correction.from.toLowerCase(), correction.to);
    if (!shouldLearn(correction, count) || isOrdinary(correction.to)) continue;
    const key = correction.to.toLowerCase();
    if (store.dictionary().some((e) => e.term.toLowerCase() === key)) continue;
    store.addTerms([{ term: correction.to }], { learned: true });
    learned.push(correction.to);
  }
  return learned;
}
