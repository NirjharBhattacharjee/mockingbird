import { describe, expect, test } from "bun:test";
import { trimToSpeech } from "../src/index.ts";

describe("trimToSpeech", () => {
  const audio = { samples: Int16Array.from({ length: 16000 }, (_, i) => i), sampleRate: 16000 };

  test("keeps the silence between two stretches of speech", () => {
    const trimmed = trimToSpeech(
      audio,
      [
        { startSample: 4000, endSample: 5000 },
        { startSample: 9000, endSample: 10000 },
      ],
      { padMs: 0 },
    );
    expect(trimmed.samples.length).toBe(6000);
    expect(trimmed.samples[0]).toBe(4000);
  });

  test("pads either side, so Whisper hears the speech in context", () => {
    const trimmed = trimToSpeech(audio, [{ startSample: 8000, endSample: 9000 }], { padMs: 100 });
    // 100ms is 1600 samples at 16kHz.
    expect(trimmed.samples.length).toBe(1000 + 2 * 1600);
    expect(trimmed.samples[0]).toBe(8000 - 1600);
  });

  test("padding stops at the ends of the recording", () => {
    const trimmed = trimToSpeech(audio, [{ startSample: 100, endSample: 15900 }], { padMs: 700 });
    expect(trimmed.samples.length).toBe(16000);
  });

  test("no speech means no audio", () => {
    expect(trimToSpeech(audio, []).samples.length).toBe(0);
  });
});
