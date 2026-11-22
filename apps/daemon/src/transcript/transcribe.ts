import { type AsrWord, stripNonSpeech } from "@mockingbird/asr";
import { loadAudio, type PcmAudio } from "@mockingbird/audio";
import { applyCorrections, correctNames } from "@mockingbird/store";
import type { SpeechSegment } from "@mockingbird/vad";
import { clock, fineClock } from "../clock.ts";
import {
  type Engines,
  enginesFor,
  type ModelChoice,
  requireFile,
  WHISPER_LANGUAGES,
} from "../runtime.ts";
import { readDictionary } from "./dictionary.ts";

/**
 * Groups VAD's speech segments into chunks of at most `maxSamples`, so a long
 * recording goes to Whisper a piece at a time: each piece keeps its place in
 * the file for timestamps, and long silences never reach Whisper at all.
 * A single segment longer than that stays whole rather than being cut, which
 * would split a word: Whisper reads long input in 30-second windows itself,
 * and timedLines takes the timestamps from its word times.
 */
export function chunks(segments: SpeechSegment[], maxSamples: number): SpeechSegment[] {
  const out: SpeechSegment[] = [];
  for (const s of segments) {
    const last = out.at(-1);
    if (last && s.endSample - last.startSample <= maxSamples) last.endSample = s.endSample;
    else out.push({ ...s });
  }
  return out;
}

/**
 * Whisper's words as lines, each with the time it starts in the file: a new
 * line at the first sentence end after 20 seconds, and always by 60, so long
 * unbroken speech still gets a timestamp every minute or less.
 */
export function timedLines(words: AsrWord[], offsetMs: number): { atMs: number; text: string }[] {
  const lines: { atMs: number; words: string[] }[] = [];
  for (const w of words) {
    const at = offsetMs + w.startMs;
    const line = lines.at(-1);
    const age = line ? at - line.atMs : Number.POSITIVE_INFINITY;
    const sentenceEnded = /[.?!]["')\]]?$/.test(line?.words.at(-1) ?? "");
    if (!line || age >= 60_000 || (age >= 20_000 && sentenceEnded)) {
      lines.push({ atMs: at, words: [w.word] });
    } else {
      line.words.push(w.word);
    }
  }
  return lines.map((l) => ({ atMs: l.atMs, text: stripNonSpeech(l.words.join("")) }));
}

/**
 * Whisper's tokens as whole words, each with its start and end in the file.
 * A token that doesn't start with a space carries on the word before it
 * ("dict" + "ation", or a full stop). A word's DTW point is its first
 * token's, and `atEndMs` its last's.
 */
export function timedWords(words: AsrWord[], offsetMs: number): AsrWord[] {
  const out: AsrWord[] = [];
  for (const w of words) {
    const last = out.at(-1);
    const at = w.atMs === undefined ? undefined : offsetMs + w.atMs;
    if (last && !/^\s/.test(w.word)) {
      last.word += w.word;
      last.endMs = offsetMs + w.endMs;
      // A full stop has a point of its own, after the word: the word's last is its own last letter's.
      if (at !== undefined && /[\p{L}\p{N}]/u.test(w.word)) last.atEndMs = at;
    } else {
      out.push({
        ...w,
        startMs: offsetMs + w.startMs,
        endMs: offsetMs + w.endMs,
        ...(at !== undefined && { atMs: at, atEndMs: at }),
      });
    }
  }
  return out
    .map((w) => ({ ...w, word: stripNonSpeech(w.word) }))
    .filter((w) => /[\p{L}\p{N}]/u.test(w.word));
}

/**
 * Spells words the user's way: their `heard => term` corrections, then names
 * matched by sound, which only works for English (as dictation's cleanup
 * did). If data.db can't be read, words come out as heard.
 */
export function speller(log: (m: string) => void, language: string): (text: string) => string {
  let dictionary: ReturnType<typeof readDictionary> = [];
  try {
    dictionary = readDictionary();
  } catch (error) {
    log(`warning: couldn't read the dictionary from data.db: ${error}`);
  }
  const english = language === "en";
  return (text) => {
    const fixed = applyCorrections(text, dictionary);
    return english ? correctNames(fixed, dictionary) : fixed;
  };
}

/**
 * Whisper's words for `audio`, a piece at a time: VAD's speech, in chunks
 * of up to 30 seconds, each with where it starts in the file, in ms.
 */
export async function* hear(
  audio: PcmAudio,
  startMs: number,
  { detectSpeech, asr }: Pick<Engines, "detectSpeech" | "asr">,
) {
  const rate = audio.sampleRate;
  for (const c of chunks(await detectSpeech(audio), 30 * rate)) {
    const piece = { sampleRate: rate, samples: audio.samples.subarray(c.startSample, c.endSample) };
    const heard = (await asr.transcribe(piece)).words;
    yield { heard, offsetMs: startMs + (c.startSample / rate) * 1000 };
  }
}

/**
 * An audio or video file as timestamped lines of Whisper's text, names fixed
 * from the dictionary. No cleanup model: the client's model does better with a
 * whole meeting than a 4B one does with each 30 seconds of it. `from`/`to`
 * (seconds) take one stretch of the file; `words` gives each word's start and
 * end instead of lines, to cut a clip on.
 */
export async function transcribe(
  path: string,
  log: (m: string) => void,
  { from, to }: { from?: number; to?: number } = {},
  words = false,
  choice: ModelChoice = {},
): Promise<string> {
  const file: PcmAudio = await loadAudio(requireFile(path, "File"));
  const rate = file.sampleRate;
  const first = Math.max(0, Math.round((from ?? 0) * rate));
  const last = Math.min(file.samples.length, Math.round((to ?? Infinity) * rate));
  if (last <= first) {
    const length = Math.round(file.samples.length / rate);
    throw new Error(
      `Nothing to transcribe from ${from ?? 0}s to ${to === undefined ? "the end" : `${to}s`}: ${path} is ${length}s.`,
    );
  }
  const audio = { sampleRate: rate, samples: file.samples.subarray(first, last) };
  const startMs = (first / rate) * 1000;
  // A whisper-server per call, since two requests can run at once.
  const picked = await enginesFor(audio, choice, log);
  const { engines } = picked;
  const spell = speller(log, picked.language);
  try {
    const lines: string[] = [];
    let count = 0;
    for await (const { heard, offsetMs } of hear(audio, startMs, engines)) {
      const timed = timedWords(heard, offsetMs);
      count += timed.length;
      if (words) {
        // ponytail: names are fixed one word at a time, so a name misheard as
        // two words stays as heard; the line transcript fixes those.
        for (const w of timed) {
          const word = spell(w.word);
          lines.push(`[${fineClock(w.startMs)}-${fineClock(w.endMs)}] ${word}`);
        }
        continue;
      }
      for (const line of timedLines(heard, offsetMs)) {
        const text = spell(line.text);
        if (text) lines.push(`[${clock(line.atMs)}] ${text}`);
      }
    }
    const span =
      from === undefined && to === undefined
        ? `${Math.round(audio.samples.length / rate / 60)} min`
        : `${clock(startMs)}-${clock((last / rate) * 1000)}`;
    // Which language and model, when the call picked them or the language was detected.
    const how =
      choice.model || choice.language || picked.detected
        ? `, ${WHISPER_LANGUAGES.get(picked.language) ?? picked.language}${picked.detected ? " (detected)" : ""} with ${picked.model}`
        : "";
    // Speaking pace over the whole stretch, pauses included, as style-match compares it.
    const minutes = audio.samples.length / rate / 60;
    const pace = `, ${count} words, ${Math.round(count / minutes)} a minute`;
    return lines.length
      ? `${path} (${span}${how}${pace})\n\n${lines.join("\n")}`
      : `${path} (${span}${how}): no speech found.`;
  } finally {
    await engines.close();
  }
}

/** A tool's `model` and `language`, each only if given. */
export const choiceOf = (a: Record<string, unknown>): ModelChoice => ({
  ...(a.model === undefined ? {} : { model: String(a.model) }),
  ...(a.language === undefined ? {} : { language: String(a.language).toLowerCase() }),
});
