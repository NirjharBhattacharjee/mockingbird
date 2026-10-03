import cleanupMarkdown from "../prompts/cleanup.md" with { type: "text" };
import type { DictionaryEntry } from "./dictionary.ts";
import type { CompletionRequest } from "./provider.ts";

export type AppStyle = "default" | "terminal";

/** The prompt's sections from prompts/cleanup.md, by heading. */
const SECTIONS = Object.fromEntries(
  cleanupMarkdown
    .split(/^## /m)
    .slice(1)
    .map((part) => {
      const [heading = "", ...body] = part.split("\n");
      return [heading.trim(), body.join("\n").trim()];
    }),
);

function section(name: string): string {
  const text = SECTIONS[name];
  if (!text) throw new Error(`prompts/cleanup.md has no "## ${name}" section`);
  return text;
}

export function buildCleanupPrompt({
  text,
  dictionary = [],
  style = "default",
}: {
  text: string;
  dictionary?: DictionaryEntry[];
  style?: AppStyle;
}): CompletionRequest {
  const parts = [section("Rules")];
  // Terminal text is never a list: a line break there runs the command.
  if (style === "terminal") parts.push(section("Terminal"));
  else if (looksLikeList(text)) parts.push(section("Lists"));
  if (dictionary.length) {
    const terms = dictionary.map((d) => (d.hint ? `${d.term} (${d.hint})` : d.term)).join(", ");
    parts.push(section("Dictionary").replace("{terms}", terms));
  }
  return { system: parts.join("\n\n"), user: `<transcript>${text}</transcript>` };
}

export type GateOptions = {
  maxWords?: number;
  minConfidence?: number;
  /** Confidence needed to skip cleanup on a longer utterance that reads cleanly. */
  minCleanConfidence?: number;
};

/** Filler words and hedges the cleanup model exists to remove. */
const FILLER = /\b(um+|uh+|erm|hmm+|you know|i mean|sort of|kind of)\b[,.]?/gi;
/** A word said twice in a row: "I I think", "the the file". */
const STUTTER = /\b([\p{L}']+)\s+\1\b/giu;

/** A line that is an item in a list: "- onions", "2. Wait thirty seconds". */
const LIST_ITEM = /^(?:[-*\u2022]|\d+[.)])\s/;

/**
 * Speech that is really a list: several things in a row, often introduced
 * ("I need to get...") and joined by "and then" or repeated "I will", or a
 * sequence ("first ... next ... finally", "step one", "number two"). The
 * cleanup model turns these into lines; it can only do that if it runs, so
 * the gate below never skips them. A false positive only costs the cleanup
 * time: the model still keeps prose as prose.
 */
export function looksLikeList(text: string): boolean {
  const starters = text.match(
    /\b(?:and then|then I|I (?:will|need|have|should|want)|also|first(?:ly)?|second(?:ly)?|third(?:ly)?|next|after that|finally|lastly|(?:step|number) (?:one|two|three|four|five|\d+))\b/gi,
  );
  if ((starters?.length ?? 0) >= 2) return true;
  return text.split(/[.!?]+/).some(enumerates);
}

/** Words in an item of a spoken list; past this, it's a clause, not a thing. */
const MAX_ITEM_WORDS = 4;

/**
 * Three or more things joined by commas and a final "and"/"or": "a charger,
 * a passport and a jacket", "eggs, toilet paper and rice". People rarely say
 * the comma before "and", so one comma is enough. The items between commas
 * have to be short, which keeps out clauses like "we landed in Tokyo, then
 * we took a train and...". The last item can run on.
 *
 * Words alone can't tell "bought milk" (an action) from "toilet paper" (a
 * thing), so this errs towards sending speech to the model: a missed list is
 * typed as a sentence, while a false alarm only costs one model call, and the
 * prompt keeps a sentence a sentence (evals/cleanup checks both).
 */
function enumerates(sentence: string): boolean {
  const last = sentence.match(/^(.*,[^,]*?)\s(?:and|or)\s+\S/i);
  if (!last?.[1]) return false;
  // An Oxford comma ("a passport, and a jacket") leaves an empty item.
  const [, ...middle] = last[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return middle.length > 0 && middle.every((item) => item.split(/\s+/).length <= MAX_ITEM_WORDS);
}

/**
 * Whether the transcript already reads like finished text: nothing for the
 * cleanup model to remove. `formatText` handles the capital and the end
 * punctuation, so those don't need the model either.
 */
export function looksClean(text: string): boolean {
  FILLER.lastIndex = 0;
  STUTTER.lastIndex = 0;
  return !FILLER.test(text) && !STUTTER.test(text);
}

/**
 * Whether to type the transcript as it is instead of cleaning it up. Cleanup
 * costs 400-1500ms, which is most of the wait after speaking, so it's skipped
 * for short utterances and for longer ones Whisper was confident about that
 * carry no filler or stutter.
 */
export function shouldSkipLlm(
  { text, confidence }: { text: string; confidence: number },
  // Provisional: tuned on synthetic speech only; retune on the bench/ corpus.
  { maxWords = 4, minConfidence = 0.7, minCleanConfidence = 0.8 }: GateOptions = {},
): boolean {
  if (looksLikeList(text)) return false;
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words <= maxWords && confidence >= minConfidence) return true;
  return confidence >= minCleanConfidence && looksClean(text);
}

/** Past this length, a cleanup that loses a fifth of the words is dropping content. */
const LONG_TEXT = 120;

/**
 * Rejects LLM output that looks like an answer, a summary, or a rewrite rather
 * than a cleanup, so the pipeline falls back to the raw transcript. A short
 * utterance can legitimately lose half its length ("um, yes" → "Yes."), but a
 * long one coming back much shorter means sentences were dropped — which is
 * how a long dictation loses words.
 */
export function acceptCleanup(raw: string, cleaned: string): boolean {
  if (!cleaned || /<\/?transcript>/i.test(cleaned)) return false;
  FILLER.lastIndex = 0;
  const rawLength = raw.replace(FILLER, "").trim().length;
  if (rawLength === 0) return false;
  const ratio = cleaned.length / rawLength;
  // A list is meant to lose length: "I will get onions" becomes "- onions".
  // It can also gain it, on bullets and line breaks. One with fewer than
  // three items is the model forcing a sentence into a list, usually by
  // dropping part of it ("ship it, but first run the tests" → "- Run the
  // tests first"), so it falls back to the transcript.
  const items = cleaned.split("\n").filter((line) => LIST_ITEM.test(line.trim())).length;
  if (items > 0) return items >= 3 && ratio >= 0.3 && ratio <= 1.8;
  const floor = rawLength > LONG_TEXT ? 0.8 : 0.5;
  return ratio >= floor && ratio <= 1.5;
}

/** Words a question usually opens with. */
const QUESTION_WORD =
  /^(who|whom|whose|what|when|where|why|how|which|is|are|am|was|were|do|does|did|can|could|would|will|should|shall|may|might|have|has|had|isn't|aren't|don't|doesn't|didn't|can't|won't|wouldn't|shouldn't)\b/i;
/** Openers that can come before the question word: "Hi, how are you". */
const INTERJECTION = /^(hi|hey|hello|okay|ok|so|and|but|well|oh|yeah|right)\b,? */i;
/** Already ends a sentence, possibly followed by a closing quote or bracket. */
const ENDED = /[.!?…:;]["'”’)\]]*$/;
/** Ends on a word, possibly followed by a closing quote or bracket. */
const ENDS_ON_WORD = /[\p{L}\p{N}]["'”’)\]]*$/u;

/**
 * Makes text read as a finished sentence: a capital first letter, and a
 * period (or a question mark, when it opens like a question) if it ends on a
 * word. Short dictations skip the cleanup model, and Whisper often leaves
 * these off; the model sometimes does too.
 */
function finishSentence(text: string): string {
  if (!text) return text;
  const capitalized = text.charAt(0).toUpperCase() + text.slice(1);
  // "- onions" is an item in a list, not an unfinished sentence.
  if (LIST_ITEM.test(text) || /:$/.test(text)) return capitalized;
  if (ENDED.test(capitalized) || !ENDS_ON_WORD.test(capitalized)) return capitalized;
  const question = QUESTION_WORD.test(capitalized.replace(INTERJECTION, ""));
  return capitalized + (question ? "?" : ".");
}

export function formatText(text: string, style: AppStyle = "default"): string {
  if (style === "terminal") {
    return text.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  }
  // A list keeps its lines; each one is tidied, and none of them gets a full
  // stop bolted on, which would read oddly on a shopping list.
  const lines = text
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .filter((line, index, all) => line !== "" || (index > 0 && index < all.length - 1));
  if (lines.length > 1) {
    const [first = "", ...rest] = lines;
    return [finishSentence(first), ...rest].join("\n");
  }
  return finishSentence(lines[0] ?? "");
}

/** Words that just join items together: dropped from the front of an item. */
const CONNECTOR = "and|then|also|so|next|first|second|third|finally|after that";
/** Words that say when, which belong to the item, at the end: "run a marathon tomorrow". */
const WHEN = "today|tomorrow|tonight|this morning|this evening|later|afterwards|this week";
/** The lead-in a dictated list repeats on every item. */
const LEAD_IN = new RegExp(
  `^(?:(?:${CONNECTOR})\\s+)*(?:(${WHEN})\\s+)?(?:(?:${CONNECTOR})\\s+)*` +
    "(?:i\\s+(?:need to|have to|want to|will|should|must|am going to|am)|also)\\s+",
  "i",
);
/** Enough lines have to share the lead-in for this to be a list rather than prose. */
const LEAD_IN_SHARE = 0.6;

/**
 * Turns lines that all start the same way into bullets, dropping the repeated
 * lead-in. The cleanup model sometimes gets as far as one line per item but
 * leaves "I need to" on each of them; this finishes the job without a second
 * round trip. Text that isn't shaped like that is returned untouched.
 */
export function bulletize(text: string, heading = "To do:"): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 3 || lines.some((line) => LIST_ITEM.test(line))) return text;

  const shared = lines.filter((line) => LEAD_IN.test(line)).length;
  if (shared < 3 || shared < lines.length * LEAD_IN_SHARE) return text;

  const items = lines.map((line) => {
    const when = LEAD_IN.exec(line)?.[1];
    const item = line.replace(LEAD_IN, "").replace(/\.$/, "").trim();
    // "Tomorrow I need to run a marathon" is an item with a time on it.
    return when && item ? `${item} ${when.toLowerCase()}` : item;
  });
  if (items.some((item) => item === "")) return text;
  return [heading, ...items.map((item) => `- ${item}`)].join("\n");
}
