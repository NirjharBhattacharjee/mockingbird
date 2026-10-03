/**
 * Known-text clips for comparing Whisper models: each sentence spoken by
 * each voice with macOS `say`, generated into bench/corpus/ (gitignored) on
 * first use. Synthetic speech is easier than a real voice, so absolute error
 * rates here are optimistic; the comparison between models is what counts.
 * Real recordings with a hand-checked transcript belong in bench/voice/.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type Sentence = { text: string; names: string[] };

export const SENTENCES: Sentence[] = [
  {
    text: "Can you send the final report to Priya Raghunathan before Friday?",
    names: ["Priya Raghunathan"],
  },
  {
    text: "Nirjhar Bhattacharjee will review the pull request tomorrow morning.",
    names: ["Nirjhar Bhattacharjee"],
  },
  { text: "The meeting moved to 3:30 on Thursday and it should take 45 minutes.", names: [] },
  { text: "I need to buy onions, milk and bread on the way home.", names: [] },
  { text: "Run the tests again because the build failed on the second step.", names: [] },
  {
    text: "Siobhan and Xiaoming are presenting the quarterly results in Sydney.",
    names: ["Siobhan", "Xiaoming"],
  },
  { text: "The deploy finished without errors, so we can ship the update tonight.", names: [] },
  { text: "Please remind me to call the dentist and renew my passport next week.", names: [] },
];

export type Voice = { name: string; accent: string };

export const VOICES: Voice[] = [
  { name: "Aman", accent: "en_IN" },
  { name: "Rishi", accent: "en_IN" },
  { name: "Tara", accent: "en_IN" },
  { name: "Daniel", accent: "en_GB" },
  { name: "Karen", accent: "en_AU" },
  { name: "Moira", accent: "en_IE" },
  { name: "Samantha", accent: "en_US" },
  { name: "Tessa", accent: "en_ZA" },
];

export type Clip = { wav: string; voice: Voice; sentence: Sentence };

const DIR = join(import.meta.dir, "corpus");

/** Every voice saying every sentence, generating any clip that's missing. */
export function corpus(): Clip[] {
  mkdirSync(DIR, { recursive: true });
  const clips: Clip[] = [];
  for (const voice of VOICES) {
    SENTENCES.forEach((sentence, i) => {
      const wav = join(DIR, `${voice.name}-${i + 1}.wav`);
      if (!existsSync(wav)) {
        const aiff = wav.replace(/\.wav$/, ".aiff");
        const say = Bun.spawnSync(["say", "-v", voice.name, "-o", aiff, sentence.text]);
        if (say.exitCode !== 0) throw new Error(`say -v ${voice.name} failed: ${say.stderr}`);
        Bun.spawnSync(["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, wav]);
        Bun.spawnSync(["rm", "-f", aiff]);
      }
      clips.push({ wav, voice, sentence });
    });
  }
  return clips;
}

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

/** Word error rate: word-level edit distance over the reference length. */
export function wer(reference: string, hypothesis: string): number {
  const r = words(reference);
  const h = words(hypothesis);
  let row = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const next = [i];
    for (let j = 1; j <= h.length; j++) {
      next[j] = Math.min(
        (row[j] ?? 0) + 1,
        (next[j - 1] ?? 0) + 1,
        (row[j - 1] ?? 0) + (r[i - 1] === h[j - 1] ? 0 : 1),
      );
    }
    row = next;
  }
  return (row[h.length] ?? 0) / Math.max(1, r.length);
}

/** The value at fraction `p` (0.5 is the median) of `ns`. */
export const pct = (ns: number[], p: number) =>
  [...ns].sort((a, b) => a - b)[Math.floor((ns.length - 1) * p)] ?? 0;
