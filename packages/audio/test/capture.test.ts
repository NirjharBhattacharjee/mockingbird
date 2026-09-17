import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  concatSamples,
  micInputArgs,
  parseAudioDevices,
  readWavFile,
  startCapture,
} from "../src/index.ts";

const hello = join(import.meta.dir, "../../../bench/fixtures/hello.wav");

const LIST_OUTPUT = `[AVFoundation indev @ 0x932c08140] AVFoundation video devices:
[AVFoundation indev @ 0x932c08140] [0] FaceTime HD Camera
[AVFoundation indev @ 0x932c08140] [1] Capture screen 0
[AVFoundation indev @ 0x932c08140] AVFoundation audio devices:
[AVFoundation indev @ 0x932c08140] [0] iPhone Microphone
[AVFoundation indev @ 0x932c08140] [1] Nirjhar’s AirPods Pro
[AVFoundation indev @ 0x932c08140] [2] MacBook Pro Microphone
[in#0 @ 0x932c08000] Error opening input: Input/output error
Error opening input file .`;

describe("parseAudioDevices", () => {
  test("returns only audio devices", () => {
    expect(parseAudioDevices(LIST_OUTPUT)).toEqual([
      { index: 0, name: "iPhone Microphone" },
      { index: 1, name: "Nirjhar’s AirPods Pro" },
      { index: 2, name: "MacBook Pro Microphone" },
    ]);
  });

  test("returns nothing when no audio section is present", () => {
    expect(parseAudioDevices("ffmpeg: command failed")).toEqual([]);
  });
});

describe("micInputArgs", () => {
  test("defaults to the system input device, no video", () => {
    expect(micInputArgs()).toEqual(["-f", "avfoundation", "-i", ":default"]);
    expect(micInputArgs("2")).toEqual(["-f", "avfoundation", "-i", ":2"]);
  });
});

describe("startCapture", () => {
  test("reports a missing ffmpeg through exited/stderrTail", async () => {
    const capture = startCapture({ onSamples: () => {}, ffmpeg: "/nonexistent/ffmpeg" });
    expect(await capture.exited).toBe(-1);
    expect(capture.stderrTail()).toContain("could not run");
  });
});

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("startCapture (integration)", () => {
  test("streams a file through ffmpeg as 16 kHz samples", async () => {
    const chunks: Int16Array[] = [];
    const capture = startCapture({
      onSamples: (s) => chunks.push(s),
      inputArgs: ["-i", hello],
    });
    expect(await capture.exited).toBe(0);
    const expected = (await readWavFile(hello)).samples;
    expect(chunks.length).toBeGreaterThan(0);
    expect(Array.from(concatSamples(chunks))).toEqual(Array.from(expected));
  });

  test("stop() ends a live stream", async () => {
    let received = 0;
    const capture = startCapture({
      onSamples: (s) => {
        received += s.length;
      },
      // -re paces the file in real time, like a microphone.
      inputArgs: ["-re", "-i", hello],
    });
    await Bun.sleep(500);
    await capture.stop();
    expect(received).toBeGreaterThan(0);
    expect(received).toBeLessThan(16000 * 3);
  });

  test("an unreadable input exits non-zero with ffmpeg's error", async () => {
    const capture = startCapture({ onSamples: () => {}, inputArgs: ["-i", "/nonexistent.wav"] });
    expect(await capture.exited).not.toBe(0);
    expect(capture.stderrTail()).toMatch(/No such file/i);
  });
});
