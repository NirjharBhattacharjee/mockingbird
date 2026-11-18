/**
 * Known-text clips for comparing Whisper models: each sentence spoken by
 * each voice with macOS `say`, generated into bench/corpus/ (gitignored) on
 * first use. Synthetic speech is easier than a real voice, so absolute error
 * rates here are optimistic; the comparison between models is what counts.
 * Real recordings with a hand-checked transcript belong in bench/voice/.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { wordDiff } from "../packages/asr/src/index.ts";
import { decodeWav } from "../packages/audio/src/index.ts";

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
  {
    text: "I need to buy onions, milk and bread on the way home.",
    names: [],
  },
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

const SANE = { min: 2, max: 5 };

/**
 * Why the clip at `wav` isn't the sentence, or undefined if it is. `say` now
 * and then writes a clip that isn't the sentence: 5 ms of nothing, or (Tara
 * once) 6.6 s of babble over a 3.9 s line. Every model then scores it as
 * errors, which reads as the models getting worse (#211). The 64 good clips
 * speak at 2.3-4.1 words a second.
 */
export function badClip(wav: string, text: string): string | undefined {
  let pcm: ReturnType<typeof decodeWav>;
  const bytes = readFileSync(wav); // a filesystem error is thrown, not mistaken for a bad clip
  try {
    pcm = decodeWav(bytes);
  } catch (error) {
    return `not a WAV it can read (${error instanceof Error ? error.message : error})`;
  }
  let peak = 0;
  for (const v of pcm.samples) peak = Math.max(peak, Math.abs(v));
  if (peak < 300) return "silent";
  const rate = text.split(/\s+/).length / (pcm.samples.length / pcm.sampleRate);
  if (rate < SANE.min || rate > SANE.max) {
    return `${rate.toFixed(1)} words a second, not ${SANE.min}-${SANE.max}`;
  }
  return undefined;
}

/** `voice` saying `text` into `out`, a 16 kHz mono WAV. */
function speak(voice: Voice, text: string, out: string) {
  const aiff = out.replace(/\.wav$/, ".aiff");
  const say = Bun.spawnSync(["say", "-v", voice.name, "-o", aiff, text]);
  if (say.exitCode !== 0) throw new Error(`say -v ${voice.name} failed: ${say.stderr}`);
  const convert = Bun.spawnSync([..."afconvert -f WAVE -d LEI16@16000 -c 1".split(" "), aiff, out]);
  rmSync(aiff, { force: true });
  if (convert.exitCode !== 0) {
    rmSync(out, { force: true });
    throw new Error(`afconvert failed for ${out}: ${convert.stderr}`);
  }
}

/**
 * Every voice saying every sentence. A clip that's missing or bad, cached
 * ones included, is made again at its own temporary name and checked before
 * it's renamed into place, so two runs sharing the corpus never delete or
 * read each other's half-made clips.
 */
export function corpus(): Clip[] {
  mkdirSync(DIR, { recursive: true });
  const clips: Clip[] = [];
  for (const voice of VOICES) {
    SENTENCES.forEach((sentence, i) => {
      // Named after the text too, so editing a sentence makes a new clip
      // rather than scoring the old audio against the new words.
      const wav = join(DIR, `${voice.name}-${i + 1}-${Bun.hash(sentence.text).toString(36)}.wav`);
      let why = existsSync(wav) ? badClip(wav, sentence.text) : "missing";
      for (let tries = 0; why; tries++) {
        if (tries === 3) {
          throw new Error(
            `say -v ${voice.name} keeps getting sentence ${i + 1} wrong (${why}): listen with \`say -v ${voice.name} "${sentence.text}"\``,
          );
        }
        if (why !== "missing") console.error(`${wav}: ${why}; making it again`);
        const part = `${wav.replace(/\.wav$/, "")}.${process.pid}-${tries}.part.wav`;
        speak(voice, sentence.text, part);
        why = badClip(part, sentence.text);
        if (why) rmSync(part, { force: true });
        else renameSync(part, wav);
      }
      clips.push({ wav, voice, sentence });
    });
  }
  return clips;
}

/** Word edits against the reference, and its length: see wordDiff. */
export function wordErrors(
  reference: string,
  hypothesis: string,
): { edits: number; words: number } {
  const { edits, words } = wordDiff(reference, hypothesis);
  return { edits, words };
}

/** The value at fraction `p` (0.5 is the median) of `ns`. */
export const pct = (ns: number[], p: number) =>
  [...ns].sort((a, b) => a - b)[Math.floor((ns.length - 1) * p)] ?? 0;
