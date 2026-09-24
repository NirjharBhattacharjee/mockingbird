export type DictionaryEntry = {
  /** How the word should be written. */
  term: string;
  /** What it sounds like, for a term Whisper keeps mishearing the same way. */
  heard?: string;
  /** A note for the cleanup model, e.g. "a person". */
  hint?: string;
};

/**
 * Whisper takes at most 224 tokens of vocabulary; well under that keeps room
 * for the audio's own context.
 */
const MAX_PROMPT_CHARS = 600;

/**
 * Reads the dictionary file: one entry per line, blank lines and `#` comments
 * ignored.
 *
 *   Nirjhar Bhattacharjee        the spelling to use
 *   Catppuccin (a colour theme)  with a note for the cleanup model
 *   cat puck => Catppuccin       what it hears => what to write
 */
export function parseDictionary(text: string): DictionaryEntry[] {
  const entries: DictionaryEntry[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.split("#")[0]?.trim();
    if (!line) continue;

    const [heardPart, termPart] = line.includes("=>") ? line.split("=>") : [undefined, line];
    const withHint = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(termPart?.trim() ?? "");
    const term = (withHint?.[1] ?? termPart ?? "").trim();
    if (!term) continue;

    const entry: DictionaryEntry = { term };
    const heard = heardPart?.trim();
    if (heard) entry.heard = heard;
    const hint = withHint?.[2]?.trim();
    if (hint) entry.hint = hint;
    entries.push(entry);
  }
  return entries;
}

/**
 * The vocabulary hint for Whisper, which is off by default — see
 * MOCKINGBIRD_ASR_VOCABULARY. Measured both ways on the same sentence: the
 * hint turns a name Whisper doesn't know ("Zaya Mingjiao") into the right one
 * ("Xiaoming Zhao"), but distorts names it did know, "Bhattacharjee" becoming
 * "Bhattacharje" and "Aishwarya" becoming "Aiishwarya". It biases the whole
 * decode, not only the word it was given.
 */
export function buildVocabularyPrompt(entries: DictionaryEntry[]): string | undefined {
  const terms: string[] = [];
  let length = 0;
  for (const { term } of entries) {
    if (length + term.length + 2 > MAX_PROMPT_CHARS) break;
    terms.push(term);
    length += term.length + 2;
  }
  return terms.length ? `Glossary: ${terms.join(", ")}.` : undefined;
}

/** Escapes a term so it can go in a regex. */
const escapeForRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Applies the `heard => term` entries: the fix for a name mangled the same way
 * every time, which neither the vocabulary hint nor the cleanup model is
 * guaranteed to catch. Matching ignores case, and only at word boundaries, so
 * "cat puck" doesn't rewrite "cat pucker".
 */
export function applyCorrections(text: string, entries: DictionaryEntry[]): string {
  let out = text;
  for (const { heard, term } of entries) {
    if (!heard) continue;
    out = out.replace(new RegExp(`\\b${escapeForRegex(heard)}\\b`, "gi"), term);
  }
  return out;
}

/**
 * A rough sound for a word: the consonant skeleton, with the spellings that
 * differ between transcriptions of the same name folded together. Whisper
 * writes an unfamiliar name as it hears it ("Nurj Harbada Charjee"), so
 * matching the letters never finds it; matching the sounds does.
 */
export function soundOf(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z]/g, "")
      // Aspirated consonants: "bh" and "b" are the same sound to a listener.
      .replace(/([bcdgkpt])h/g, "$1")
      .replace(/ph/g, "f")
      .replace(/(?:sh|ch|j|z|x)/g, "s")
      .replace(/(?:ck|q|k|c)/g, "k")
      .replace(/(?:v|w)/g, "v")
      .replace(/y/g, "i")
      // Vowels carry little of a name's identity once it has been misheard.
      .replace(/[aeiou]/g, "")
      .replace(/(.)\1+/g, "$1")
  );
}

/** Levenshtein distance, for comparing two sounds. */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = row;
  }
  return previous[b.length] ?? 0;
}

/** 0..1, how alike two words sound. */
export function soundsLike(a: string, b: string): number {
  const [x, y] = [soundOf(a), soundOf(b)];
  if (!x || !y) return 0;
  return 1 - distance(x, y) / Math.max(x.length, y.length);
}

/** Below this, a match is more likely to be a different word than a misheard one. */
const MATCH_THRESHOLD = 0.7;
/** Short words sound like too many other things to risk replacing. */
const MIN_SOUND_LENGTH = 3;
const MIN_TERM_LETTERS = 4;
/** A name can be misheard as several words: "Catppuccin" as "cat pucks in". */
const MAX_EXTRA_WORDS = 2;
/**
 * Charged per word beyond the term's own length, so a span that swallows the
 * word before the name ("with Nurj Harbada Charjee") loses to the name alone.
 */
const EXTRA_WORD_PENALTY = 0.06;

/**
 * Replaces stretches of the transcript that sound like a dictionary term with
 * the term itself. A name is usually misheard as a different number of words
 * than it has ("Nirjhar Bhattacharjee" as three), so each term is compared
 * against spans of one word fewer up to one word more than its own length.
 */
export function correctNames(
  text: string,
  entries: DictionaryEntry[],
  { threshold = MATCH_THRESHOLD }: { threshold?: number } = {},
): string {
  const terms = entries.filter(
    (e) =>
      soundOf(e.term).length >= MIN_SOUND_LENGTH &&
      e.term.replace(/[^\p{L}]/gu, "").length >= MIN_TERM_LETTERS,
  );
  if (terms.length === 0) return text;

  const words = text.split(/(\s+)/);
  const isWord = (i: number) => i % 2 === 0 && words[i] !== "";
  for (let i = 0; i < words.length; i += 2) {
    if (!isWord(i)) continue;
    let best: { term: string; score: number; end: number } | undefined;
    for (const { term } of terms) {
      const termWords = term.split(/\s+/).length;
      const spans = [termWords - 1];
      for (let extra = 0; extra <= MAX_EXTRA_WORDS; extra++) spans.push(termWords + extra);
      for (const span of spans) {
        if (span < 1) continue;
        const end = i + 2 * (span - 1);
        if (end >= words.length || !isWord(end)) continue;
        const candidate = words.slice(i, end + 1).join("");
        // Keep whatever punctuation ended the span, e.g. the comma in "Chargy,".
        const trailing = /[^\p{L}\p{N}]+$/u.exec(candidate)?.[0] ?? "";
        const whole = soundsLike(candidate, term);
        if (span > 1) {
          // Every word in the span has to earn its place: if dropping the one
          // at either end matches the term better, that word isn't part of the
          // name ("and Siddharth Mukherjee").
          const withoutFirst = soundsLike(words.slice(i + 2, end + 1).join(""), term);
          const withoutLast = soundsLike(words.slice(i, end - 1).join(""), term);
          if (whole < withoutFirst || whole < withoutLast) continue;
        }
        const extra = Math.max(0, span - termWords);
        const score = whole - extra * EXTRA_WORD_PENALTY;
        if (score >= threshold && (!best || score > best.score)) {
          best = { term: term + trailing, score, end };
        }
      }
    }
    if (best) {
      words.splice(i, best.end - i + 1, best.term);
    }
  }
  return words.join("");
}
