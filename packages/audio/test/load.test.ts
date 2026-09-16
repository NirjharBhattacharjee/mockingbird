import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AudioDecodeError, loadAudio } from "../src/index.ts";

const hello = join(import.meta.dir, "../../../bench/fixtures/hello.wav");

describe("loadAudio", () => {
  test("reads a 16 kHz mono WAV without running ffmpeg", async () => {
    const audio = await loadAudio(hello, { ffmpeg: "/nonexistent/ffmpeg" });
    expect(audio.sampleRate).toBe(16000);
    expect(audio.samples.length).toBeGreaterThan(16000 * 3);
  });

  test("reports a missing file as a filesystem error", async () => {
    await expect(loadAudio("/nonexistent/recording.wav")).rejects.toThrow(/ENOENT|No such file/);
  });

  test("reports a missing ffmpeg as AudioDecodeError", async () => {
    await expect(
      loadAudio(join(import.meta.dir, "load.test.ts"), { ffmpeg: "/nonexistent/ffmpeg" }),
    ).rejects.toThrow(AudioDecodeError);
  });
});

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("loadAudio with ffmpeg (integration)", () => {
  test("converts a 44.1 kHz stereo AAC file to 16 kHz mono", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mockingbird-"));
    try {
      const m4a = join(dir, "hello.m4a");
      const convert = Bun.spawnSync([
        "afconvert",
        ...["-f", "m4af", "-d", "aac@44100", "-c", "2", hello, m4a],
      ]);
      expect(convert.exitCode).toBe(0);

      const audio = await loadAudio(m4a);
      expect(audio.sampleRate).toBe(16000);
      const seconds = audio.samples.length / 16000;
      expect(seconds).toBeGreaterThan(4.3);
      expect(seconds).toBeLessThan(4.8);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("reports an unreadable file as AudioDecodeError", async () => {
    await expect(loadAudio(join(import.meta.dir, "load.test.ts"))).rejects.toThrow(
      AudioDecodeError,
    );
  });
});
