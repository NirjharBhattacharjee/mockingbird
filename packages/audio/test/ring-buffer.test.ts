import { describe, expect, test } from "bun:test";
import { concatSamples, Pcm16Decoder, peak, RingBuffer, rms } from "../src/index.ts";

const seq = (from: number, n: number) => Int16Array.from({ length: n }, (_, i) => from + i);

describe("RingBuffer", () => {
  test("reads back what was written before it fills", () => {
    const ring = new RingBuffer(8);
    ring.write(seq(0, 5));
    expect(Array.from(ring.read(0))).toEqual([0, 1, 2, 3, 4]);
    expect(ring.start).toBe(0);
    expect(ring.end).toBe(5);
  });

  test("keeps only the newest samples once it wraps", () => {
    const ring = new RingBuffer(8);
    ring.write(seq(0, 6));
    ring.write(seq(6, 6));
    expect(ring.start).toBe(4);
    expect(Array.from(ring.read(0))).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
    expect(Array.from(ring.read(9, 11))).toEqual([9, 10]);
  });

  test("a write larger than capacity keeps its tail", () => {
    const ring = new RingBuffer(4);
    ring.write(seq(0, 3));
    ring.write(seq(3, 10));
    expect(ring.end).toBe(13);
    expect(Array.from(ring.read(0))).toEqual([9, 10, 11, 12]);
  });

  test("matches a naive buffer across many uneven writes", () => {
    const ring = new RingBuffer(37);
    const all: number[] = [];
    let next = 0;
    for (let i = 0; i < 200; i++) {
      const n = (i * 7) % 23;
      ring.write(seq(next, n));
      for (let k = 0; k < n; k++) all.push(next + k);
      next += n;
      const from = Math.max(0, all.length - 30);
      expect(Array.from(ring.read(from))).toEqual(all.slice(Math.max(from, all.length - 37)));
    }
  });

  test("reading an empty or evicted range returns nothing", () => {
    const ring = new RingBuffer(4);
    expect(ring.read(0).length).toBe(0);
    ring.write(seq(0, 10));
    expect(ring.read(0, 5).length).toBe(0);
  });

  test("rejects a non-positive capacity", () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError);
  });
});

describe("Pcm16Decoder", () => {
  test("decodes little-endian samples split across chunks", () => {
    const bytes = new Uint8Array(new Int16Array([1, -2, 300, -32768, 32767]).buffer);
    const decoder = new Pcm16Decoder();
    const out = [
      bytes.subarray(0, 1),
      bytes.subarray(1, 4),
      bytes.subarray(4, 4),
      bytes.subarray(4),
    ].flatMap((chunk) => Array.from(decoder.push(chunk)));
    expect(out).toEqual([1, -2, 300, -32768, 32767]);
  });
});

describe("levels", () => {
  test("rms and peak", () => {
    expect(rms(new Int16Array(0))).toBe(0);
    expect(rms(Int16Array.from([16384, -16384]))).toBeCloseTo(0.5);
    expect(peak(Int16Array.from([100, -32768, 5]))).toBe(1);
  });

  test("concatSamples joins chunks in order", () => {
    expect(Array.from(concatSamples([seq(0, 2), seq(2, 0), seq(2, 3)]))).toEqual([0, 1, 2, 3, 4]);
  });
});
