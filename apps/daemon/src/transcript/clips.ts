import type { AsrWord } from "@mockingbird/asr";
import { loadAudio, type PcmAudio } from "@mockingbird/audio";
import { probe } from "../inspect/probe.ts";
import { enginesFor, type ModelChoice, requireFile } from "../runtime.ts";
import { hear, speller, timedWords } from "./transcribe.ts";

/** A clip as far as hearing goes: a stretch of its `path`, or of the call's own source. */
export type Stretch = { from: number; to: number; path?: string };

/**
 * The stretches of the source to transcribe for `clips`: each clip with
 * `pad` seconds either side, since Whisper places words better with some
 * speech around them, and stretches that overlap made one. An edit cut at
 * its pauses would otherwise hear most of its audio twice (#127). In source
 * order, whatever order the clips are in.
 */
export function spans(clips: Stretch[], pad = 2): { from: number; to: number }[] {
  const padded = clips
    .map(({ from, to }) => ({ from: Math.max(0, from - pad), to: to + pad }))
    .sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  for (const s of padded) {
    const last = merged.at(-1);
    if (last && s.from <= last.to) last.to = Math.max(last.to, s.to);
    else merged.push({ ...s });
  }
  return merged;
}

/**
 * Each clip's words, timed in its source (`path`, or its own), names fixed
 * from the dictionary. Each source is heard once, over the stretches its
 * clips need; a source with no sound has no words.
 */
export async function clipWords(
  path: string,
  clips: Stretch[],
  log: (m: string) => void,
  choice: ModelChoice = {},
) {
  const words: AsrWord[][] = clips.map(() => []);
  // The language is detected from the opening clips (what's captioned
  // first), up to a minute of them, so an opening on a silent clip still
  // reaches speech. Only those seconds are decoded, never a whole recording.
  const pieces: Int16Array[] = [];
  let left = 60; // seconds
  for (const c of clips) {
    if (left <= 0) break;
    const source = c.path ?? path;
    if (!(await probe(requireFile(source, "File"))).audio) continue;
    const seconds = Math.min(c.to - c.from, left);
    pieces.push((await loadAudio(source, { from: c.from, to: c.from + seconds })).samples);
    left -= seconds;
  }
  // loadAudio gives 16 kHz mono, so the pieces join as they are.
  const sample: PcmAudio = {
    sampleRate: 16_000,
    samples: new Int16Array(pieces.reduce((n, p) => n + p.length, 0)),
  };
  let at = 0;
  for (const p of pieces) {
    sample.samples.set(p, at);
    at += p.length;
  }
  // A whisper-server per call, since two requests can run at once.
  const { engines, language } = await enginesFor(sample, choice, log);
  const spell = speller(log, language);
  try {
    for (const source of new Set(clips.map((c) => c.path ?? path))) {
      const mine = clips.flatMap((c, i) => ((c.path ?? path) === source ? [{ c, i }] : []));
      if (!(await probe(requireFile(source, "File"))).audio) continue;
      const file = await loadAudio(source);
      const rate = file.sampleRate;
      const stretches = spans(mine.map(({ c }) => c));
      const heard: AsrWord[][] = [];
      for (const { from, to } of stretches) {
        const first = Math.round(from * rate);
        const last = Math.min(file.samples.length, Math.round(to * rate));
        const audio = { sampleRate: rate, samples: file.samples.subarray(first, last) };
        const said: AsrWord[] = [];
        for await (const c of hear(audio, (first / rate) * 1000, engines)) {
          for (const w of timedWords(c.heard, c.offsetMs)) said.push({ ...w, word: spell(w.word) });
        }
        heard.push(said);
      }
      // Each clip gets the words of the stretch it's in; wordCaptions keeps the ones inside it.
      for (const { c, i } of mine) {
        words[i] = heard[stretches.findIndex((s) => s.from <= c.from && c.to <= s.to)] ?? [];
      }
    }
    return words;
  } finally {
    await engines.close();
  }
}
