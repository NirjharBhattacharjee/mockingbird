import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codecFor, main, parseDevices } from "../src/record.ts";

/** A tone in place of the mic, and silence in place of a mic macOS kept from the terminal. */
const tone = () => ["-f", "lavfi", "-i", "sine=frequency=220:duration=30"];
const hush = () => ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono"];
const never = () => new Promise<void>(() => {});

test("records for --for seconds, mono 48 kHz WAV, and says where", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mb-record-"));
  const out = join(dir, "voiceover.wav");
  const lines: string[] = [];
  expect(
    await main([out, "--for", "1"], { input: tone, enter: never, log: (l) => lines.push(l) }),
  ).toBe(0);
  const probe = Bun.spawnSync([
    ...["ffprobe", "-v", "error", "-show_entries", "stream=channels,sample_rate:format=duration"],
    ...["-of", "json", out],
  ]);
  const info = JSON.parse(probe.stdout.toString());
  expect(info.streams[0]).toMatchObject({ channels: 1, sample_rate: "48000" });
  expect(Number(info.format.duration)).toBeCloseTo(1, 1);
  expect(lines.at(-1)).toBe(`Saved ${out} (1.0 s).`);
});

test("Enter stops it, and the file is finished properly", async () => {
  const out = join(mkdtempSync(join(tmpdir(), "mb-record-")), "take.m4a");
  const enter = () => new Promise<void>((done) => setTimeout(done, 700));
  expect(await main([out], { input: tone, enter, log: () => {} })).toBe(0);
  const probe = Bun.spawnSync([
    "ffprobe",
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    out,
  ]);
  expect(Number(probe.stdout.toString())).toBeGreaterThan(0.2);
});

test("a silent recording says how to let the terminal use the microphone", async () => {
  const out = join(mkdtempSync(join(tmpdir(), "mb-record-")), "quiet.wav");
  const lines: string[] = [];
  expect(
    await main([out, "--for", "0.5"], { input: hush, enter: never, log: (l) => lines.push(l) }),
  ).toBe(1);
  expect(lines.at(-1)).toContain("Privacy & Security → Microphone");
});

test("never overwrites a file, and wants a length that's a number", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mb-record-"));
  const there = join(dir, "there.wav");
  writeFileSync(there, "mine");
  await expect(main([there], { input: tone, enter: never })).rejects.toThrow("already exists");
  await expect(main([join(dir, "a.wav"), "--for", "soon"], { input: tone })).rejects.toThrow(
    "not a length in seconds",
  );
  expect(existsSync(join(dir, "a.wav"))).toBe(false);
});

test("reads the inputs from ffmpeg's device list, and picks a codec from the name", () => {
  const listing = `[AVFoundation indev @ 0x1] AVFoundation video devices:
[AVFoundation indev @ 0x1] [0] FaceTime HD Camera
[AVFoundation indev @ 0x1] AVFoundation audio devices:
[AVFoundation indev @ 0x1] [0] iPhone Microphone
[AVFoundation indev @ 0x1] [1] MacBook Pro Microphone`;
  expect(parseDevices(listing)).toEqual([
    { index: 0, name: "iPhone Microphone" },
    { index: 1, name: "MacBook Pro Microphone" },
  ]);
  expect(codecFor("a.WAV")).toEqual(["-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le"]);
  expect(codecFor("a.m4a")).toContain("aac");
});
