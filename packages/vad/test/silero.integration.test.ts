import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { readWavFile } from "@mockingbird/audio";
import { detectSpeech, SileroVad, trimToSpeech } from "../src/index.ts";

const modelsDir = join(process.env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird"), "models");
const fixtures = join(import.meta.dir, "../../../bench/fixtures");

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("SileroVad (integration)", () => {
  let vad: SileroVad;
  beforeAll(async () => {
    vad = await SileroVad.load(join(modelsDir, "silero_vad.onnx"));
  });
  afterAll(() => vad.close());

  test("finds speech in the spoken fixture", async () => {
    const audio = await readWavFile(join(fixtures, "hello.wav"));
    const segments = await detectSpeech(vad, audio);
    expect(segments.length).toBeGreaterThan(0);
    const trimmed = trimToSpeech(audio, segments);
    expect(trimmed.samples.length).toBeGreaterThan(16000);
    expect(trimmed.samples.length).toBeLessThanOrEqual(audio.samples.length);
  });

  test("finds nothing in silence", async () => {
    const silence = { sampleRate: 16000, samples: new Int16Array(16000 * 2) };
    expect(await detectSpeech(vad, silence)).toEqual([]);
  });

  test("rejects non-16 kHz audio", async () => {
    const audio = { sampleRate: 44100, samples: new Int16Array(44100) };
    await expect(detectSpeech(vad, audio)).rejects.toThrow(RangeError);
  });
});
