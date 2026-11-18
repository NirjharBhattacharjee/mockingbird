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

/**
 * Words a second, a clip's length against its text. `say` now and then writes
 * a clip that isn't the sentence (Tara once took 6.6 s of babble over a 3.9 s
 * line), and every model then scores it as errors, which read as the models
 * getting worse (#211). The 64 good clips speak at 2.3-4.1 words a second.
 */
export function wordsPerSecond(wav: string, text: string): number {
  const { samples, sampleRate } = decodeWav(readFileSync(wav));
  return text.split(/\s+/).length / (samples.length / sampleRate);
}

const SANE = { min: 2, max: 5 };

function speak(voice: Voice, text: string, wav: string) {
  const aiff = wav.replace(/\.wav$/, ".aiff");
  const tmp = wav.replace(/\.wav$/, ".part.wav");
  const say = Bun.spawnSync(["say", "-v", voice.name, "-o", aiff, text]);
  if (say.exitCode !== 0) throw new Error(`say -v ${voice.name} failed: ${say.stderr}`);
  const convert = Bun.spawnSync([..."afconvert -f WAVE -d LEI16@16000 -c 1".split(" "), aiff, tmp]);
  rmSync(aiff, { force: true });
  if (convert.exitCode !== 0) {
    rmSync(tmp, { force: true });
    throw new Error(`afconvert failed for ${wav}: ${convert.stderr}`);
  }
  // Renamed into place only once complete, so a half-written clip is never reused.
  renameSync(tmp, wav);
}

/**
 * Every voice saying every sentence, generating any clip that's missing and
 * again any that's too slow or fast to be the sentence, cached ones included.
 */
export function corpus(): Clip[] {
  mkdirSync(DIR, { recursive: true });
  const clips: Clip[] = [];
  for (const voice of VOICES) {
    SENTENCES.forEach((sentence, i) => {
      // Named after the text too, so editing a sentence makes a new clip
      // rather than scoring the old audio against the new words.
      const wav = join(DIR, `${voice.name}-${i + 1}-${Bun.hash(sentence.text).toString(36)}.wav`);
      for (let tries = 0; ; tries++) {
        if (!existsSync(wav)) speak(voice, sentence.text, wav);
        const rate = wordsPerSecond(wav, sentence.text);
        if (rate >= SANE.min && rate <= SANE.max) break;
        rmSync(wav);
        if (tries === 2) {
          throw new Error(
            `say -v ${voice.name} keeps saying sentence ${i + 1} at ${rate.toFixed(1)} words a second, ` +
              `not ${SANE.min}-${SANE.max}: listen to it with \`say -v ${voice.name} "${sentence.text}"\``,
          );
        }
        console.error(`${wav} is ${rate.toFixed(1)} words a second; making it again`);
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
