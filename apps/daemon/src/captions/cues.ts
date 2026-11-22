import type { AsrWord } from "@mockingbird/asr";
import { type compile, lengthOf } from "@mockingbird/timeline";
import type { ModelChoice } from "../runtime.ts";
import { clipWords } from "../transcript/clips.ts";
import { sourceWords } from "../transcript/words.ts";

/** The part of a clip that captions follow: its stretch, speed, transition and where its sound comes from. */
export type CueClip = {
  from: number;
  to: number;
  speed?: number;
  transition?: { type: string; duration: number };
  sound?: { from: number; to: number };
};

/**
 * Each clip's start in the finished video: a clip lasts its source stretch
 * over its speed, and one with a transition starts that much before the
 * clip ahead of it ends. ponytail: the same sum as render's `timeline`, kept
 * here because captions can't import render; one copy when render moves (#300).
 */
function starts(clips: CueClip[]): number[] {
  const out: number[] = [];
  let length = 0;
  for (const c of clips) {
    const start = Math.max(0, length - (c.transition?.duration ?? 0));
    out.push(start);
    length = start + lengthOf(c);
  }
  return out;
}

/** An SRT time: `00:01:02,345`. */
const srtClock = (seconds: number) => {
  const ms = Math.round(seconds * 1000);
  const hh = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const mm = String(Math.floor(ms / 60_000) % 60).padStart(2, "0");
  const ss = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss},${String(ms % 1000).padStart(3, "0")}`;
};

/** Chinese and Japanese script and its punctuation (。、「」！？), written without spaces. */
const CJK = /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/** Words as a line: a space between them, except between two Chinese or Japanese ones. */
const joined = (words: string[]) =>
  words.reduce(
    (line, w, i) =>
      line +
      (i && CJK.test(w.replace(/\*/g, "")) && CJK.test(words[i - 1] ?? "") ? "" : i ? " " : "") +
      w,
    "",
  );

/**
 * Word-by-word captions as SRT, timed to the video `clips` make: `words`
 * holds each clip's words, timed in the source. A cue shows up to `perCue`
 * words with the one being said written *like this*, which render draws
 * yellow (`lit: false` shows the words without it). A new cue starts at a
 * clip, after a sentence, after a pause of half a second, once its words
 * span 1.2 s (how often Remotion's TikTok template turns the page), or
 * before it would show more than 20 characters a second (Netflix's limit).
 * Chinese and Japanese have no spaces: their words are joined without one,
 * and a cue holds about four characters for each of `perCue` (#276).
 */
export function wordCaptions(
  clips: CueClip[],
  words: AsrWord[][],
  { perCue = 3, lit = true, upper = false } = {},
): string {
  type Said = { text: string; start: number; end: number; ends: boolean };
  // Each page with where its clip ends in the finished video: no caption outlasts its shot.
  const pages: { words: Said[]; cut: number }[] = [];
  const offsets = starts(clips);
  clips.forEach((clip, i) => {
    // Captions follow the sound, which a J or L cut moves off the picture.
    const { from, to } = clip.sound ?? clip;
    const offset = (offsets[i] ?? 0) + (from - clip.from) / (clip.speed ?? 1);
    // A word's time in the finished video: a clip's speed shortens or stretches it.
    const at = (t: number) => (t - from) / (clip.speed ?? 1) + offset;
    const cut = offset + (to - from) / (clip.speed ?? 1);
    let page: Said[] = [];
    pages.push({ words: page, cut });
    for (const w of words[i] ?? []) {
      const [start, end] = [w.startMs / 1000, w.endMs / 1000];
      // A word belongs to the clip its middle is in: Whisper's word times can be a little early or late.
      // Half-open, so a word right on a cut between two clips shows once.
      const middle = (start + end) / 2;
      if (middle < from || middle >= to) continue;
      const text = w.word.replace(/[,.;:]+$/, "");
      const said = {
        text: upper ? text.toLocaleUpperCase() : text,
        start: at(Math.max(start, from)),
        end: at(Math.min(end, to)),
        ends: /[.?!。！？]["')\]」』]?$/.test(w.word),
      };
      const last = page.at(-1);
      const chars = page.reduce((n, w) => n + w.text.length, 0);
      const cjk = page.length > 0 && page.every((w) => CJK.test(w.text)) && CJK.test(said.text);
      const full =
        (cjk ? chars + said.text.length > perCue * 4 : page.length >= perCue) ||
        (page[0] && (chars + said.text.length) / Math.max(0.3, said.end - page[0].start) > 20) ||
        (last && (last.ends || said.start - last.end >= 0.5)) ||
        (page[0] && said.start - page[0].start >= 1.2);
      if (full) {
        page = [];
        pages.push({ words: page, cut });
      }
      if (said.text) page.push(said);
    }
  });
  const cues = pages
    .filter(({ words }) => words.length)
    .flatMap(({ words: page, cut }, p, all) => {
      const next = all[p + 1]?.words[0]?.start ?? Number.POSITIVE_INFINITY;
      const last = page.at(-1) as Said;
      // Stays up into a short pause rather than flickering off. Across a
      // transition the next page can start before this one ends: end with it.
      const until = Math.min(
        cut,
        next <= last.end ? last.end : next - last.end <= 0.5 ? next : last.end + 0.2,
      );
      if (!lit)
        return [{ start: page[0]?.start ?? 0, end: until, text: joined(page.map((w) => w.text)) }];
      return page.map((w, j) => ({
        start: j ? w.start : (page[0]?.start ?? w.start),
        end: page[j + 1]?.start ?? until,
        text: joined(page.map((o, k) => (k === j ? `*${o.text}*` : o.text))),
      }));
    });
  return cues
    .map((c, i) => `${i + 1}\n${srtClock(c.start)} --> ${srtClock(c.end)}\n${c.text}`)
    .join("\n\n");
}

/** Word-by-word captions for `clips` of one video, from its cached words. */
export async function clipCaptions(
  path: string,
  log: (m: string) => void,
  clips: CueClip[],
  options: Parameters<typeof wordCaptions>[2],
  choice: ModelChoice = {},
): Promise<string> {
  const words = await clipWords(path, clips, log, choice);
  return wordCaptions(clips, words, options) || "No speech in those clips.";
}

/**
 * Word-by-word captions for a compiled project's cut, as SRT timed to the
 * finished video: speed, transitions and J and L cuts included. Each
 * source's words come from the word cache.
 */
export async function cutCaptions(
  cut: ReturnType<typeof compile>,
  log: (m: string) => void,
  { perCue = 3, lit = true, upper = false }: { perCue?: number; lit?: boolean; upper?: boolean },
  choice: ModelChoice = {},
): Promise<string> {
  const heard = await sourceWords(
    new Map(
      [...new Set(cut.clips.map((c) => c.path))].map((path) => [
        path,
        // The sound's stretch, which a J or L cut moves off the picture's.
        cut.clips.filter((c) => c.path === path).map((c) => c.sound ?? c),
      ]),
    ),
    log,
    choice,
  );
  // Every word of the clip's source: wordCaptions keeps the ones inside each clip.
  const asr = (path: string): AsrWord[] =>
    (heard.get(path)?.words ?? []).map((w) => ({
      word: w.word,
      startMs: w.start * 1000,
      endMs: w.end * 1000,
      probability: 1,
    }));
  return wordCaptions(
    cut.clips,
    cut.clips.map((c) => asr(c.path)),
    { perCue, lit, upper },
  );
}
