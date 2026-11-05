import { describe, expect, test } from "bun:test";
import {
  bandShare,
  beat,
  levelOf,
  noiseFloor,
  type PcmAudio,
  sections,
  windowLevels,
} from "../src/index.ts";

const RATE = 16000;

/** `seconds` of sound, sample by sample from `f(t)` in -1..1. */
function sound(seconds: number, f: (t: number, i: number) => number): PcmAudio {
  const samples = new Int16Array(Math.round(seconds * RATE));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.max(-32768, Math.min(32767, Math.round(f(i / RATE, i) * 32767)));
  }
  return { sampleRate: RATE, samples };
}

const sine = (hz: number, amp: number) => (t: number) => amp * Math.sin(2 * Math.PI * hz * t);

/** Noise that's the same every run. */
function noise(amp: number) {
  let seed = 7;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return amp * ((((x ^ (x >>> 14)) >>> 0) / 4294967296) * 2 - 1);
  };
}

/** A 20 ms click every 60/bpm seconds from `first`, over quiet noise. */
function clicks(bpm: number, first: number, seconds: number): PcmAudio {
  const hiss = noise(0.01);
  return sound(seconds, (t) => {
    const since = (t - first) % (60 / bpm);
    const click = t >= first && since < 0.02 ? 0.8 * Math.sin(2 * Math.PI * 1500 * t) : 0;
    return click + hiss();
  });
}

describe("levels", () => {
  test("a sine's level is its RMS in dBFS", () => {
    // Amplitude 0.5: RMS 0.354, -9.0 dBFS.
    const levels = windowLevels(sound(2, sine(440, 0.5)));
    for (const l of levels) expect(l).toBeCloseTo(-9.03, 1);
  });

  test("the noise floor is the quiet part, not the loud one", () => {
    const hiss = noise(0.001);
    const audio = sound(10, (t) => (t < 8 ? sine(300, 0.5)(t) : 0) + hiss());
    // Uniform noise of amplitude a has RMS a/sqrt(3): -64.8 dBFS for 0.001.
    expect(noiseFloor(audio)).toBeCloseTo(-64.8, 0);
    expect(noiseFloor(sound(1, () => 0))).toBe(-Infinity);
  });

  test("the level of some spans of the sound", () => {
    const audio = sound(2, (t) => (t < 1 ? sine(440, 0.5)(t) : sine(440, 0.05)(t)));
    expect(levelOf(audio, [[0, RATE]])).toBeCloseTo(-9.03, 1);
    expect(levelOf(audio, [[RATE, 2 * RATE]])).toBeCloseTo(-29.03, 1);
    expect(levelOf(audio, [])).toBe(-Infinity);
  });
});

test("bandShare finds the energy in 1 to 4 kHz", () => {
  expect(bandShare(sound(1, sine(2000, 0.5)))).toBeGreaterThan(0.99);
  expect(bandShare(sound(1, sine(200, 0.5)))).toBeLessThan(0.01);
  const both = sound(1, (t) => sine(2000, 0.5)(t) + sine(200, 0.5)(t));
  expect(bandShare(both)).toBeCloseTo(0.5, 1);
  // Only where asked: the first half is the 200 Hz sine.
  const halves = sound(2, (t) => (t < 1 ? sine(200, 0.5)(t) : sine(2000, 0.5)(t)));
  expect(bandShare(halves, { spans: [[0, RATE]] })).toBeLessThan(0.01);
});

describe("beat", () => {
  for (const bpm of [72, 100, 128, 150]) {
    test(`finds ${bpm} BPM and the first beat`, () => {
      const found = beat(clicks(bpm, 0.3, 20));
      expect(Math.abs(found.bpm - bpm)).toBeLessThan(2);
      // On the grid: the first beat found is 0.3 s plus a whole number of beats.
      const period = 60 / bpm;
      const off = (((found.first - 0.3) % period) + period) % period;
      expect(Math.min(off, period - off)).toBeLessThan(0.03);
      expect(found.strength).toBeGreaterThan(0.3);
    });
  }

  test("noise has no steady beat", () => {
    expect(beat(sound(20, noise(0.3))).strength).toBeLessThan(0.3);
    expect(beat(sound(5, () => 0)).strength).toBe(0);
  });
});

test("sections: where the energy changes for a while", () => {
  const quietLoud = sound(30, (t) => sine(300, t < 10 || t >= 20 ? 0.05 : 0.5)(t));
  const found = sections(quietLoud);
  expect(found).toHaveLength(2);
  expect(Math.abs((found[0] as number) - 10)).toBeLessThanOrEqual(0.5);
  expect(Math.abs((found[1] as number) - 20)).toBeLessThanOrEqual(0.5);
  expect(sections(sound(30, sine(300, 0.3)))).toEqual([]);
});
