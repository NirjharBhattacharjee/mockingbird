import { describe, expect, test } from "bun:test";
import { Recorder } from "../src/recorder.ts";

// sampleRate 1000 makes 1 sample = 1 ms, which keeps the arithmetic readable.
const options = { sampleRate: 1000, bufferMs: 100, preRollMs: 30, maxRecordingMs: 200 };
const seq = (from: number, n: number) => Int16Array.from({ length: n }, (_, i) => from + i);

describe("Recorder", () => {
  test("idle audio is not recorded", () => {
    const recorder = new Recorder(options);
    recorder.push(seq(0, 50));
    expect(recorder.recording).toBe(false);
    expect(recorder.stop()).toBeUndefined();
  });

  test("a recording includes the pre-roll and everything after start", () => {
    const recorder = new Recorder(options);
    recorder.push(seq(0, 50));
    recorder.start();
    recorder.push(seq(50, 20));
    recorder.push(seq(70, 5));
    expect(recorder.recordedMs).toBe(55);

    const result = recorder.stop();
    expect(result?.truncated).toBe(false);
    expect(result?.audio.sampleRate).toBe(1000);
    expect(Array.from(result?.audio.samples ?? [])).toEqual(Array.from(seq(20, 55)));
    expect(recorder.recording).toBe(false);
  });

  test("pre-roll is shorter when the microphone just started", () => {
    const recorder = new Recorder(options);
    recorder.push(seq(0, 10));
    recorder.start();
    recorder.push(seq(10, 5));
    expect(Array.from(recorder.stop()?.audio.samples ?? [])).toEqual(Array.from(seq(0, 15)));
  });

  test("recordings longer than the ring buffer are kept whole", () => {
    const recorder = new Recorder(options);
    recorder.start();
    for (let i = 0; i < 15; i++) recorder.push(seq(i * 10, 10));
    expect(recorder.stop()?.audio.samples.length).toBe(150);
  });

  test("recordings stop growing at the maximum length", () => {
    const recorder = new Recorder(options);
    recorder.start();
    for (let i = 0; i < 30; i++) recorder.push(seq(i * 10, 10));
    const result = recorder.stop();
    expect(result?.truncated).toBe(true);
    expect(result?.audio.samples.length).toBe(200);
    expect(result?.audio.samples.at(-1)).toBe(199);
  });

  test("cancel discards the recording; start while recording is ignored", () => {
    const recorder = new Recorder(options);
    recorder.push(seq(0, 40));
    recorder.start();
    recorder.push(seq(40, 10));
    recorder.start();
    expect(recorder.recordedMs).toBe(40);
    recorder.cancel();
    expect(recorder.recording).toBe(false);
    expect(recorder.stop()).toBeUndefined();
  });
});
