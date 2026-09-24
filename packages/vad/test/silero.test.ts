import { describe, expect, test } from "bun:test";
import { spliceSpeech } from "../src/index.ts";

describe("spliceSpeech", () => {
  const audio = { samples: Int16Array.from({ length: 16000 }, (_, i) => i), sampleRate: 16000 };

  test("leaves out the silence between two stretches of speech", () => {
    const spliced = spliceSpeech(
      audio,
      [
        { startSample: 0, endSample: 1000 },
        { startSample: 9000, endSample: 10000 },
      ],
      { gapMs: 100 },
    );
    // Both stretches, plus 100ms (1600 samples) of gap, instead of 10000.
    expect(spliced.samples.length).toBe(1000 + 1600 + 1000);
    expect(spliced.samples[0]).toBe(0);
    expect(spliced.samples[999]).toBe(999);
    expect(spliced.samples[1000]).toBe(0);
    expect(spliced.samples[2600]).toBe(9000);
  });

  test("merges segments that overlap after padding", () => {
    const spliced = spliceSpeech(audio, [
      { startSample: 0, endSample: 5000 },
      { startSample: 4000, endSample: 8000 },
    ]);
    expect(spliced.samples.length).toBe(8000);
  });

  test("one stretch of speech is just trimmed", () => {
    const spliced = spliceSpeech(audio, [{ startSample: 100, endSample: 900 }]);
    expect(spliced.samples.length).toBe(800);
    expect(spliced.samples[0]).toBe(100);
  });

  test("no speech means no audio", () => {
    expect(spliceSpeech(audio, []).samples.length).toBe(0);
  });
});
