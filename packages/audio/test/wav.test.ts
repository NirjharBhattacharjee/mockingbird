import { describe, expect, test } from "bun:test";
import { decodeWav, encodeWav, readWavFile, WavFormatError } from "../src/index.ts";

describe("wav", () => {
  test("encode then decode round-trips samples", () => {
    const samples = Int16Array.from([0, 1, -1, 32767, -32768, 1234]);
    const decoded = decodeWav(encodeWav({ sampleRate: 16000, samples }));
    expect(decoded.sampleRate).toBe(16000);
    expect(Array.from(decoded.samples)).toEqual(Array.from(samples));
  });

  test("skips non-fmt/data chunks such as afconvert's FLLR padding", () => {
    const plain = encodeWav({ sampleRate: 16000, samples: Int16Array.from([7, 8, 9]) });
    const filler = new Uint8Array(8 + 3 + 1);
    filler.set([0x46, 0x4c, 0x4c, 0x52, 3, 0, 0, 0]);
    const bytes = new Uint8Array(plain.length + filler.length);
    bytes.set(plain.subarray(0, 36), 0);
    bytes.set(filler, 36);
    bytes.set(plain.subarray(36), 36 + filler.length);
    expect(Array.from(decodeWav(bytes).samples)).toEqual([7, 8, 9]);
  });

  test("rejects stereo input", () => {
    const bytes = encodeWav({ sampleRate: 16000, samples: Int16Array.from([1, 2]) });
    new DataView(bytes.buffer).setUint16(22, 2, true);
    expect(() => decodeWav(bytes)).toThrow(WavFormatError);
  });

  test("reads the committed fixture", async () => {
    const audio = await readWavFile(`${import.meta.dir}/../../../bench/fixtures/hello.wav`);
    expect(audio.sampleRate).toBe(16000);
    expect(audio.samples.length).toBeGreaterThan(16000 * 3);
  });
});
