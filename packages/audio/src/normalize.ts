import { peak } from "./pcm.ts";
import type { PcmAudio } from "./wav.ts";

export type NormalizeOptions = {
  /** Level the loudest speech is brought up to, 0..1 RMS. */
  targetRms?: number;
  /** Ceiling on the gain, so a near-silent recording isn't turned into noise. */
  maxGain?: number;
  /** Below this RMS the window is taken for room noise and left alone. */
  noiseFloorRms?: number;
  /** Window the level is measured over. */
  windowMs?: number;
};

/** Quiet speech sits around 0.02 RMS; 0.12 is a comfortable speaking level. */
const TARGET_RMS = 0.12;
const MAX_GAIN = 20;
const NOISE_FLOOR_RMS = 0.002;
const WINDOW_MS = 200;
/** Headroom kept below full scale, so gain can't clip the loudest sample. */
const PEAK_CEILING = 0.95;

/** RMS of the loudest `windowMs` window, so leading silence doesn't drag the level down. */
export function loudestWindowRms(audio: PcmAudio, windowMs = WINDOW_MS): number {
  const { samples } = audio;
  if (samples.length === 0) return 0;
  const size = Math.max(1, Math.round((audio.sampleRate * windowMs) / 1000));
  if (samples.length <= size) {
    let sum = 0;
    for (const s of samples) sum += s * s;
    return Math.sqrt(sum / samples.length) / 32768;
  }
  // One pass, moving the window a tenth of its length at a time: fine enough
  // to find the loudest speech, and cheap on a two-minute recording.
  const step = Math.max(1, Math.floor(size / 10));
  let loudest = 0;
  for (let start = 0; start + size <= samples.length; start += step) {
    let sum = 0;
    for (let i = start; i < start + size; i++) {
      const s = samples[i] ?? 0;
      sum += s * s;
    }
    loudest = Math.max(loudest, Math.sqrt(sum / size) / 32768);
  }
  return loudest;
}

/**
 * Brings quiet speech up to a normal level before it reaches the VAD and
 * Whisper, both of which do worse the quieter the voice is. Never quietens,
 * never clips, and leaves a recording that's only room noise alone — turning
 * that up would just make the VAD hear speech in it.
 */
export function normalizeLoudness(audio: PcmAudio, options: NormalizeOptions = {}): PcmAudio {
  const {
    targetRms = TARGET_RMS,
    maxGain = MAX_GAIN,
    noiseFloorRms = NOISE_FLOOR_RMS,
    windowMs = WINDOW_MS,
  } = options;

  const level = loudestWindowRms(audio, windowMs);
  if (level <= noiseFloorRms) return audio;
  const loudest = peak(audio.samples);
  if (loudest === 0) return audio;

  const gain = Math.min(targetRms / level, PEAK_CEILING / loudest, maxGain);
  if (gain <= 1) return audio;

  const samples = new Int16Array(audio.samples.length);
  for (let i = 0; i < samples.length; i++) {
    const scaled = Math.round((audio.samples[i] ?? 0) * gain);
    samples[i] = Math.max(-32768, Math.min(32767, scaled));
  }
  return { ...audio, samples };
}
