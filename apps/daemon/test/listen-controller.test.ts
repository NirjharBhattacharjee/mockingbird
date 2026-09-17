import { describe, expect, test } from "bun:test";
import { ListenController, meter } from "../src/listen-controller.ts";
import { Recorder, type Recording } from "../src/recorder.ts";

const tone = (n: number, value = 3000) => new Int16Array(n).fill(value);

function setup(handle?: (r: Recording) => Promise<void>) {
  const handled: Recording[] = [];
  const errors: unknown[] = [];
  const recorder = new Recorder({ sampleRate: 1000, preRollMs: 0 });
  const controller = new ListenController(
    recorder,
    handle ??
      (async (r) => {
        handled.push(r);
      }),
    (error) => errors.push(error),
  );
  return { controller, handled, recorder, errors };
}

describe("ListenController", () => {
  test("waits for the microphone, then shows ready", () => {
    const { controller } = setup();
    expect(controller.status()).toContain("waiting for the microphone");
    controller.onSamples(tone(10));
    expect(controller.status()).toContain("ready");
  });

  test("Enter starts, Enter stops and hands over the recording", async () => {
    const { controller, handled } = setup();
    controller.onSamples(tone(10));
    controller.key("\r");
    controller.onSamples(tone(1500));
    expect(controller.status()).toContain("● recording 1.5s");
    controller.key("\r");
    await controller.settled();
    expect(handled.length).toBe(1);
    expect(handled[0]?.audio.samples.length).toBe(1500);
    expect(controller.status()).toContain("ready");
  });

  test("Space works like Enter", async () => {
    const { controller, handled } = setup();
    controller.key(" ");
    controller.onSamples(tone(5));
    controller.key(" ");
    await controller.settled();
    expect(handled.length).toBe(1);
  });

  test("Esc cancels without transcribing", async () => {
    const { controller, handled, recorder } = setup();
    controller.key("\r");
    controller.onSamples(tone(100));
    controller.key("\x1b");
    expect(recorder.recording).toBe(false);
    await controller.settled();
    expect(handled.length).toBe(0);
  });

  test("keys are ignored while a recording is being transcribed", async () => {
    let release: () => void = () => {};
    const calls: Recording[] = [];
    const { controller, recorder } = setup((r) => {
      calls.push(r);
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    controller.key("\r");
    controller.onSamples(tone(10));
    controller.key("\r");
    expect(controller.busy).toBe(true);
    expect(controller.status()).toContain("transcribing");

    controller.key("\r");
    expect(recorder.recording).toBe(false);

    release();
    await controller.settled();
    expect(controller.busy).toBe(false);
    expect(calls.length).toBe(1);
  });

  test("a failed transcription is reported and doesn't leave the controller stuck", async () => {
    const { controller, errors } = setup(async () => {
      throw new Error("boom");
    });
    controller.key("\r");
    controller.key("\r");
    await controller.settled();
    expect(String(errors[0])).toContain("boom");
    expect(controller.busy).toBe(false);
    expect(controller.status()).not.toContain("transcribing");
  });

  test("q, Q and Ctrl+C quit; other keys do nothing", () => {
    const { controller } = setup();
    expect(controller.key("q")).toBe("quit");
    expect(controller.key("Q")).toBe("quit");
    expect(controller.key("\x03")).toBe("quit");
    expect(controller.key("x")).toBeUndefined();
  });
});

describe("meter", () => {
  test("is empty for silence and full for loud input", () => {
    expect(meter(0)).toBe("▯".repeat(10));
    expect(meter(1)).toBe("▮".repeat(10));
    expect(meter(0.1)).toBe("▮".repeat(6) + "▯".repeat(4));
  });
});
