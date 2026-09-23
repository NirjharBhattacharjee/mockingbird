import { describe, expect, test } from "bun:test";
import { loudestWindowRms, normalizeLoudness, type PcmAudio, peak, rms } from "../src/index.ts";

const SAMPLE_RATE = 16000;

/** A sine wave at `amplitude` (0..1), `ms` long, optionally after silence. */
function tone(amplitude: number, ms: number, silenceMs = 0): PcmAudio {
  const silence = Math.round((SAMPLE_RATE * silenceMs) / 1000);
  const length = silence + Math.round((SAMPLE_RATE * ms) / 1000);
  const samples = new Int16Array(length);
  for (let i = silence; i < length; i++) {
    samples[i] = Math.round(Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) * amplitude * 32767);
  }
  return { samples, sampleRate: SAMPLE_RATE };
}

describe("loudestWindowRms", () => {
  test("ignores leading silence", () => {
    const quiet = tone(0.02, 500, 2000);
    expect(loudestWindowRms(quiet)).toBeGreaterThan(rms(quiet.samples) * 1.5);
  });

  test("is zero for an empty or silent recording", () => {
    expect(loudestWindowRms({ samples: new Int16Array(0), sampleRate: SAMPLE_RATE })).toBe(0);
    expect(loudestWindowRms({ samples: new Int16Array(16000), sampleRate: SAMPLE_RATE })).toBe(0);
  });
});

describe("normalizeLoudness", () => {
  test("brings a quiet voice up to a normal level", () => {
    const quiet = tone(0.02, 1000, 500);
    const loud = normalizeLoudness(quiet);
    expect(loudestWindowRms(loud)).toBeGreaterThan(0.1);
    expect(loudestWindowRms(loud)).toBeLessThan(0.15);
  });

  test("never clips", () => {
    for (const amplitude of [0.005, 0.02, 0.2, 0.9]) {
      expect(peak(normalizeLoudness(tone(amplitude, 500)).samples)).toBeLessThanOrEqual(1);
    }
  });

  test("leaves a recording that's already loud enough alone", () => {
    const loud = tone(0.5, 500);
    expect(normalizeLoudness(loud).samples).toBe(loud.samples);
  });

  test("leaves room noise alone, so the VAD doesn't hear speech in it", () => {
    const hiss = tone(0.001, 1000);
    expect(normalizeLoudness(hiss).samples).toBe(hiss.samples);
    const silence: PcmAudio = { samples: new Int16Array(16000), sampleRate: SAMPLE_RATE };
    expect(normalizeLoudness(silence).samples).toBe(silence.samples);
  });

  test("gain is capped, so a near-silent recording isn't all noise", () => {
    const veryQuiet = tone(0.003, 500);
    const gained = loudestWindowRms(normalizeLoudness(veryQuiet)) / loudestWindowRms(veryQuiet);
    expect(gained).toBeLessThanOrEqual(20.01);
  });

  test("keeps the sample rate and length", () => {
    const quiet = tone(0.02, 300);
    const out = normalizeLoudness(quiet);
    expect(out.sampleRate).toBe(SAMPLE_RATE);
    expect(out.samples.length).toBe(quiet.samples.length);
  });
});
