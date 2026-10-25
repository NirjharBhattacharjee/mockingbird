import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drawCaptions, parseSrt } from "../src/index.ts";

describe("parseSrt", () => {
  test("reads each cue's times and text", () => {
    const srt =
      "1\n00:00:00,000 --> 00:00:01,250\nStop watching\n\n2\n00:00:01,250 --> 00:01:02,5\ntutorials\nnow\n";
    expect(parseSrt(srt)).toEqual([
      { start: 0, end: 1.25, text: "Stop watching" },
      { start: 1.25, end: 62.5, text: "tutorials\nnow" },
    ]);
  });

  test("takes CRLF, short times, missing numbers and tags", () => {
    expect(parseSrt("00:01.5 --> 00:02.000\r\n<i>hi</i> there\r\n")).toEqual([
      { start: 1.5, end: 2, text: "hi there" },
    ]);
  });

  test("leaves out cues it can't use", () => {
    const srt =
      "1\nno time here\n\n2\n00:00:02,000 --> 00:00:01,000\nbackwards\n\n3\n00:00:03,000 --> 00:00:04,000\n";
    expect(parseSrt(srt)).toEqual([]);
  });
});

/** Width and height from a PNG's header. */
const pngSize = (file: string) => {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

describe.if(process.platform === "darwin")("drawCaptions", () => {
  test("draws one PNG per caption, as wide as the video, taller when it wraps", () => {
    const dir = mkdtempSync(join(tmpdir(), "captions-test-"));
    try {
      const files = drawCaptions(
        ["Stop watching", "a caption long enough that it has to wrap 👍🏽"],
        dir,
        1080,
      );
      expect(files).toHaveLength(2);
      const [short, long] = (files ?? []).map(pngSize);
      expect(short?.width).toBe(1080);
      expect(long?.width).toBe(1080);
      // Two lines, which share the outline's padding.
      expect(long?.height ?? 0).toBeGreaterThan(1.5 * (short?.height ?? 0));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("gives up instead of throwing when it can't draw", () => {
    expect(drawCaptions(["hi"], "/nonexistent/folder", 1080)).toBeUndefined();
  });
});
