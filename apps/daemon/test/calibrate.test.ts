import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "@mockingbird/store";
import { Calibration, percentRight, SCRIPT, type TakeResult } from "../src/calibrate.ts";

const setup = (heard: string, speech = true) => {
  const home = mkdtempSync(join(tmpdir(), "calibrate-test-"));
  const store = openStore(join(home, "data.db"));
  const calibration = new Calibration(home, store, () => ({
    detectSpeech: async () => (speech ? [{ startSample: 0, endSample: 1600 }] : []),
    asr: {
      model: "fake-asr",
      transcribe: async () => ({ text: ` ${heard}`, confidence: 1, words: [] }),
      health: async () => true,
    },
  }));
  const routes = calibration.routes();
  const call = (route: string, body = "") =>
    (routes[`POST /calibrate/${route}`] as (b: string) => Promise<Response>)(body);
  return { home, store, calibration, call };
};

test("the script is the - lines of calibration.md, about 3 minutes of reading", () => {
  expect(SCRIPT.length).toBeGreaterThanOrEqual(20);
  expect(SCRIPT.length).toBeLessThanOrEqual(30);
  expect(SCRIPT.every((s) => s && !s.startsWith("-"))).toBe(true);
});

test("a take is heard, scored against its sentence, saved as a private WAV and a row", async () => {
  const sentence = SCRIPT[0] as string; // "Thank you for helping me set this up today."
  const { home, store, calibration, call } = setup("Thank you for helping me set this up to day.");
  expect((await call("start")).status).toBe(200);
  expect((await call("start")).status).toBe(409);
  calibration.push(new Int16Array(1600).fill(500));
  const reply = await call("stop", JSON.stringify({ run: 7, sentence: 0 }));
  const result = await reply.json();
  expect(result).toMatchObject({
    heard: "Thank you for helping me set this up to day.",
    model: "fake-asr",
  });
  // "today" heard as "to day": one substitution and one insertion.
  expect(result).toMatchObject({ edits: 2, words: sentence.split(" ").length });
  const dir = join(home, "calibration");
  expect(statSync(dir).mode & 0o777).toBe(0o700);
  expect(statSync(join(dir, "7-0.wav")).mode & 0o777).toBe(0o600);
  expect(store.calibrationRuns()).toMatchObject([{ run: 7, edits: 2, takes: 1 }]);
  // Nothing recording now.
  expect((await call("stop", JSON.stringify({ run: 7, sentence: 0 }))).status).toBe(409);
});

test("silence is heard as nothing, not sent to Whisper", async () => {
  const { calibration, call } = setup("Thank you.", false);
  await call("start");
  calibration.push(new Int16Array(1600));
  const result = (await (
    await call("stop", JSON.stringify({ run: 1, sentence: 0 }))
  ).json()) as TakeResult;
  expect(result.heard).toBe("");
  expect(result.edits).toBe(result.words);
});

test("stop needs a run and a sentence in the script", async () => {
  const { call } = setup("x");
  await call("start");
  expect((await call("stop", "not json")).status).toBe(400);
  expect((await call("stop", JSON.stringify({ run: 1, sentence: 999 }))).status).toBe(409);
});

test("forget deletes the takes and their audio", async () => {
  const { home, store, calibration, call } = setup("Thank you for helping me set this up today.");
  await call("start");
  calibration.push(new Int16Array(1600).fill(500));
  await call("stop", JSON.stringify({ run: 1, sentence: 0 }));
  expect(await (await call("forget")).text()).toBe("deleted 1 calibration take, with the audio");
  expect(existsSync(join(home, "calibration"))).toBe(false);
  expect(store.calibrationRuns()).toEqual([]);
});

test("percent right rounds down, so a single miss never shows as 100%", () => {
  expect(percentRight(1, 300)).toBe(99);
  expect(percentRight(0, 300)).toBe(100);
  expect(percentRight(5, 3)).toBe(0);
  expect(percentRight(0, 0)).toBe(0);
});
