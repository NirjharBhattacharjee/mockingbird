import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { drawCaptions, parseSrt, pieces } from "../src/index.ts";

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

/** MOCKINGBIRD_CHROME, or the one `mockingbird models pull chrome` put in ~/.mockingbird/bin. */
function findChrome(): string | undefined {
  if (process.env.MOCKINGBIRD_CHROME) return process.env.MOCKINGBIRD_CHROME;
  const bin = join(process.env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird"), "bin");
  for (const version of existsSync(bin) ? readdirSync(bin) : []) {
    if (!version.startsWith("chrome-headless-shell-")) continue;
    for (const build of readdirSync(join(bin, version))) {
      const program = join(bin, version, build, "chrome-headless-shell");
      if (existsSync(program)) return program;
    }
  }
}

test("splits a caption into paragraphs of words, *marked* ones lit", () => {
  expect(pieces("say *this*\nnow")).toEqual([
    [
      { text: "say", lit: false },
      { text: "this", lit: true },
    ],
    [{ text: "now", lit: false }],
  ]);
});

test("draws nothing without a Chrome", async () => {
  expect(await drawCaptions(["hi"], tmpdir(), 1080)).toBeUndefined();
});

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("drawCaptions (integration)", () => {
  const chrome = findChrome();
  const draw = (texts: string[], dir: string, side: number, height?: number) =>
    drawCaptions(texts, dir, side, height, { chrome });

  test("draws one PNG per caption, as wide as the video, taller when it wraps", async () => {
    const dir = mkdtempSync(join(tmpdir(), "captions-test-"));
    try {
      const files = await draw(
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

  test("a wide video gets subtitle-sized text: 5% of its height, not 7.5% of its width", async () => {
    const dir = mkdtempSync(join(tmpdir(), "captions-test-"));
    try {
      const [tall] = ((await draw(["Stop watching"], dir, 1080)) ?? []).map(pngSize);
      const [wide] = ((await draw(["Stop watching"], dir, 1920, 1080)) ?? []).map(pngSize);
      expect(wide?.width).toBe(1920);
      // 54 px text against 81 px, with the same share of outline.
      expect((wide?.height ?? 0) / (tall?.height ?? 1)).toBeCloseTo(54 / 81, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("breaks text with no spaces between characters instead of cutting it off", async () => {
    const dir = mkdtempSync(join(tmpdir(), "captions-test-"));
    try {
      const japanese = "チュートリアルを見るのをやめて今日から自分で何かを作り始めましょう";
      const [one, many] = ((await draw(["見る", japanese], dir, 1080)) ?? []).map(pngSize);
      expect(many?.height ?? 0).toBeGreaterThan(1.5 * (one?.height ?? 0));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("draws a word written *like this* in another colour, in the same place", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mockingbird-captions-"));
    try {
      const [plain, lit] = (await draw(["say this", "say *this*"], dir, 1080)) ?? [];
      const bytes = (file?: string) => readFileSync(file ?? "");
      expect(bytes(lit).equals(bytes(plain))).toBe(false);
      // The same size: the asterisks aren't drawn, and the line doesn't move.
      expect(bytes(lit).readUInt32BE(16)).toBe(bytes(plain).readUInt32BE(16));
      expect(bytes(lit).readUInt32BE(20)).toBe(bytes(plain).readUInt32BE(20));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a caption is text, never markup", async () => {
    const dir = mkdtempSync(join(tmpdir(), "captions-test-"));
    try {
      const [markup, text] =
        (await draw(['<img src="x" onerror="1">', "&lt;img src=&quot;x&quot;&gt;"], dir, 1080)) ??
        [];
      // Drawn as the characters typed: both are wide lines of text, not an empty picture.
      expect(pngSize(markup ?? "").height).toBeGreaterThan(80);
      expect(pngSize(text ?? "").height).toBeGreaterThan(80);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("gives up instead of throwing when it can't draw", async () => {
    expect(await draw(["hi"], "/nonexistent/folder", 1080)).toBeUndefined();
  });
});
