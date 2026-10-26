import { expect, test } from "bun:test";
import { MicRuns } from "../src/session.ts";

const sound = Int16Array.of(0, 120, -80);
const zeros = new Int16Array(3);

test("silence after sound restarts the microphone, and the new ffmpeg starts unheard", () => {
  const mic = new MicRuns();
  mic.started();
  mic.samples(sound);
  mic.samples(zeros);
  expect(mic.silent(mic.run)).toBe("restart");
  mic.started();
  expect(mic.silent(mic.run)).toBe("permission");
  expect(mic.heardSound).toBe(true);
});

test("a microphone silent from the start is never restarted", () => {
  const mic = new MicRuns();
  mic.started();
  mic.samples(zeros);
  expect(mic.silent(mic.run)).toBe("permission");
  expect(mic.heardSound).toBe(false);
});

test("silence from an ffmpeg that's been replaced leaves the new one alone", () => {
  const mic = new MicRuns();
  mic.started();
  mic.samples(sound);
  const old = mic.run;
  mic.started();
  mic.samples(sound);
  expect(mic.silent(old)).toBe("replaced");
});
