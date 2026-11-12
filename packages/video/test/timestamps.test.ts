import { describe, expect, test } from "bun:test";
import { decimalRational, sampleFramesAt, type VideoSource } from "../src/index.ts";

const source: VideoSource = {
  path: "/fixture.mp4",
  duration: 3,
  origin: 1.4,
  originExact: { n: 7n, d: 5n },
  timeBase: { n: 1n, d: 1000n },
  ticks: [1400n, 1500n, 1600n, 1600n, 3000n],
  width: 160,
  height: 90,
  geometry: {
    encoded: { width: 160, height: 90 },
    sampleAspectRatio: "1:1",
    rotationTags: [],
    displayMatrices: [],
  },
  audio: false,
  videoTiming: {},
  streamStarts: [],
  formatTiming: {},
};

describe("presentation timestamp selection", () => {
  test("selects the last displayed frame at exact fractional boundaries", () => {
    const samples = sampleFramesAt(source, [0, 0.1999999, 0.2, 0.2000001, 2.9]);
    expect(samples.map((sample) => sample.ptsTicks)).toEqual([
      "1400",
      "1500",
      "1600",
      "1600",
      "3000",
    ]);
    expect(samples.map((sample) => sample.index)).toEqual([0, 1, 3, 3, 4]);
    expect(samples.map((sample) => sample.selected)).toEqual([0, 0.1, 0.2, 0.2, 1.6]);
  });

  test("rejects the exclusive end and times before the first displayed frame", () => {
    expect(() => sampleFramesAt(source, [3])).toThrow("outside");
    expect(() => sampleFramesAt({ ...source, ticks: [1500n] }, [0])).toThrow("No video frame");
  });

  test("preserves decimal and exponent inputs as exact fractions", () => {
    expect(decimalRational(0.1)).toEqual({ n: 1n, d: 10n });
    expect(decimalRational(1e-7)).toEqual({ n: 1n, d: 10000000n });
  });
});
