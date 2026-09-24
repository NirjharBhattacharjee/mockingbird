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
