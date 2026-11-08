import type { PcmAudio } from "./wav.ts";

/** Measurements an agent can't make by listening. All levels in dBFS. */

const FULL_SCALE = 32768;
const dB = (power: number) => (power > 0 ? 10 * Math.log10(power) : -Infinity);

/** Mean power of samples `from` to `to` (exclusive), full scale = 1. */
function power(samples: Int16Array, from = 0, to = samples.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += ((samples[i] as number) / FULL_SCALE) ** 2;
  return to > from ? sum / (to - from) : 0;
}

/** The level of each `ms`-long window, in dBFS. */
export function windowLevels({ sampleRate, samples }: PcmAudio, ms = 400): number[] {
  const size = Math.max(1, Math.round((sampleRate * ms) / 1000));
  const levels: number[] = [];
  for (let at = 0; at + size <= samples.length; at += size) {
    levels.push(dB(power(samples, at, at + size)));
  }
  return levels;
}

/**
 * The quietest tenth of the sound, in dBFS: the 10th percentile of 400 ms
 * window levels. Hiss, hum and room tone show up here; under about −60 is
 * clean, and -Infinity is digital silence.
 */
export function noiseFloor(audio: PcmAudio): number {
  const levels = windowLevels(audio).sort((a, b) => a - b);
  return levels.length ? (levels[Math.floor(levels.length / 10)] as number) : -Infinity;
}

/** The level of the parts of `audio` inside `spans` ([from, to) in samples), in dBFS. */
export function levelOf({ samples }: PcmAudio, spans: [number, number][]): number {
  let sum = 0;
  let count = 0;
  for (const [from, to] of spans) {
    sum += power(samples, from, to) * (to - from);
    count += to - from;
  }
  return count ? dB(sum / count) : -Infinity;
}

/** In-place radix-2 FFT of `re` and `im`, whose length is a power of two. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] as number, re[i] as number];
      [im[i], im[j]] = [im[j] as number, im[i] as number];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const [wr, wi] = [Math.cos(angle * k), Math.sin(angle * k)];
        const a = i + k;
        const b = a + len / 2;
        const xr = (re[b] as number) * wr - (im[b] as number) * wi;
        const xi = (re[b] as number) * wi + (im[b] as number) * wr;
        re[b] = (re[a] as number) - xr;
        im[b] = (im[a] as number) - xi;
        re[a] = (re[a] as number) + xr;
        im[a] = (im[a] as number) + xi;
      }
    }
  }
}

const FRAME = 1024;

/** The magnitude spectrum of each Hann-windowed frame of FRAME samples, `hop` apart. */
function* spectra({ samples }: PcmAudio, hop: number, spans?: [number, number][]) {
  const window = Float64Array.from(
    { length: FRAME },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME),
  );
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  const mags = new Float64Array(FRAME / 2);
  for (const [from, to] of spans ?? [[0, samples.length]]) {
    for (let at = from; at + FRAME <= to; at += hop) {
      for (let i = 0; i < FRAME; i++) {
        re[i] = ((samples[at + i] as number) / FULL_SCALE) * (window[i] as number);
        im[i] = 0;
      }
      fft(re, im);
      for (let k = 0; k < FRAME / 2; k++) {
        mags[k] = Math.hypot(re[k] as number, im[k] as number);
      }
      yield mags;
    }
  }
}

/**
 * The share of the sound's energy between `low` and `high` Hz, 0 to 1, in
 * `spans` (samples) or all of it. 1 to 4 kHz is where speech is understood:
 * music that fills it covers words up even when it's quiet.
 */
export function bandShare(
  audio: PcmAudio,
  {
    low = 1000,
    high = 4000,
    spans,
  }: { low?: number; high?: number; spans?: [number, number][] } = {},
): number {
  const hz = audio.sampleRate / FRAME;
  let inBand = 0;
  let total = 0;
  for (const mags of spectra(audio, FRAME / 2, spans)) {
    for (let k = 1; k < mags.length; k++) {
      const e = (mags[k] as number) ** 2;
      total += e;
      if (k * hz >= low && k * hz < high) inBand += e;
    }
  }
  return total ? inBand / total : 0;
}

/** Onset strength every `hop` samples: how much the spectrum grew since the frame before. */
function onsets(audio: PcmAudio, hop: number): Float64Array {
  const flux: number[] = [];
  let last: Float64Array | undefined;
  for (const mags of spectra(audio, hop)) {
    let rise = 0;
    if (last) {
      for (let k = 1; k < mags.length; k++) {
        const d = Math.log1p(100 * (mags[k] as number)) - Math.log1p(100 * (last[k] as number));
        if (d > 0) rise += d;
      }
    }
    flux.push(rise);
    last = Float64Array.from(mags);
  }
  // Take away the local mean, so a loud stretch isn't read as a run of onsets.
  const out = new Float64Array(flux.length);
  const half = 8;
  for (let i = 0; i < flux.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(flux.length - 1, i + half); j++) {
      sum += flux[j] as number;
      n++;
    }
    out[i] = Math.max(0, (flux[i] as number) - sum / n);
  }
  return out;
}

/**
 * The beat: tempo in BPM (60 to 200), the time of the first beat in
 * seconds, and how sure, 0 to 1. Tempo is the lag at which onset strength
 * best matches itself, leaning toward 120 BPM as people hear tempo; the
 * first beat is where a click every beat lines up with the most onsets.
 * Under about 0.3 there's no steady beat (speech, ambience).
 * ponytail: one tempo for the whole track, beats on a fixed grid; a track
 * whose tempo drifts needs beat tracking.
 */
export function beat(audio: PcmAudio): { bpm: number; first: number; strength: number } {
  const hop = Math.round(audio.sampleRate / 100);
  const env = onsets(audio, hop);
  const rate = audio.sampleRate / hop;
  // Correlated about its mean, so steady onsets with no pattern (noise) score near 0.
  const mean = env.reduce((a, b) => a + b, 0) / (env.length || 1);
  const at = (lag: number) => {
    let sum = 0;
    for (let i = lag; i < env.length; i++) {
      sum += ((env[i] as number) - mean) * ((env[i - lag] as number) - mean);
    }
    return sum / (env.length - lag);
  };
  const zero = at(0);
  if (!(zero > 0)) return { bpm: 0, first: 0, strength: 0 };
  let best = { lag: 0, score: -Infinity, raw: 0 };
  for (let lag = Math.floor((rate * 60) / 200); lag <= Math.ceil((rate * 60) / 60); lag++) {
    // A beat at this lag also matches at twice it; counting both settles octave doubts.
    const raw = at(lag) + 0.5 * at(2 * lag);
    const bpm = (60 * rate) / lag;
    const score = raw * Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    if (score > best.score) best = { lag, score, raw };
  }
  // Between whole hops: a parabola through the peak and its neighbours.
  const [l, c, r] = [at(best.lag - 1), at(best.lag), at(best.lag + 1)];
  const bend = l - 2 * c + r;
  const period = best.lag + (bend < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / bend)) : 0);
  let phase = { at: 0, sum: -1 };
  for (let p = 0; p < period; p++) {
    let sum = 0;
    for (let i = p; i < env.length; i += period) sum += env[Math.round(i)] ?? 0;
    if (sum > phase.sum) phase = { at: p, sum };
  }
  // The FFT frame's middle is where its onset is heard.
  const first = (phase.at * hop + FRAME / 2) / audio.sampleRate;
  return {
    bpm: (60 * rate) / period,
    first,
    strength: Math.max(0, Math.min(1, at(best.lag) / zero)),
  };
}

/**
 * Where the sound's energy changes for a while, in seconds: the music
 * dropping out, a chorus coming in, a scene change in the sound. A boundary
 * is where the 4 s before and the 4 s after differ by `dB` or more, at its
 * sharpest, and at least 4 s from the one before.
 */
export function sections(audio: PcmAudio, dB = 4): number[] {
  const levels = windowLevels(audio, 500).map((l) => (Number.isFinite(l) ? l : -100));
  const side = 8; // 4 s of 500 ms windows
  const mean = (from: number, to: number) => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += levels[i] as number;
    return sum / (to - from);
  };
  const jump = levels.map((_, i) =>
    i < side || i + side > levels.length ? 0 : Math.abs(mean(i, i + side) - mean(i - side, i)),
  );
  const found: number[] = [];
  for (let i = 1; i < jump.length - 1; i++) {
    const j = jump[i] as number;
    if (j < dB || j < (jump[i - 1] as number) || j < (jump[i + 1] as number)) continue;
    const t = i * 0.5;
    if (found.length && t - (found.at(-1) as number) < 4) continue;
    found.push(t);
  }
  return found;
}
