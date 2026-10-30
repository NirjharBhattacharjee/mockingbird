import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "@mockingbird/store";
import {
  Calibration,
  percentRight,
  SCRIPT,
  type TakeResult,
  type TermResult,
} from "../src/calibrate.ts";

const setup = (heard: string, speech = true, changed = () => {}, language?: string) => {
  const home = mkdtempSync(join(tmpdir(), "calibrate-test-"));
  const store = openStore(join(home, "data.db"));
  const calibration = new Calibration(
    home,
    store,
    () => ({
      detectSpeech: async () => (speech ? [{ startSample: 0, endSample: 1600 }] : []),
      asr: {
        model: "fake-asr",
        transcribe: async () => ({ text: ` ${heard}`, confidence: 1, words: [] }),
        health: async () => true,
      },
      language,
    }),
    changed,
  );
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
  // Whole numbers stay whole: 100 * (1 - 4 / 5) is 19.999…
  expect(percentRight(4, 5)).toBe(20);
});

test("a take heard while forget runs isn't saved after it", async () => {
  const { home, store, calibration, call } = setup("Thank you for helping me set this up today.");
  await call("start");
  calibration.push(new Int16Array(1600).fill(500));
  const stopping = call("stop", JSON.stringify({ run: 1, sentence: 0 }));
  await call("forget");
  expect((await stopping).status).toBe(200);
  expect(existsSync(join(home, "calibration"))).toBe(false);
  expect(store.calibrationRuns()).toEqual([]);
});

test("if Whisper fails, a sentence read before keeps its audio and its row", async () => {
  const { home, store, calibration, call } = setup("Thank you for helping me set this up today.");
  await call("start");
  calibration.push(new Int16Array(1600).fill(500));
  await call("stop", JSON.stringify({ run: 1, sentence: 0 }));
  const wav = join(home, "calibration", "1-0.wav");
  const before = statSync(wav).mtimeMs;
  const failing = new Calibration(home, store, () => ({
    detectSpeech: async () => [{ startSample: 0, endSample: 1600 }],
    asr: {
      model: "fake-asr",
      transcribe: async () => {
        throw new Error("whisper-server is down");
      },
      health: async () => false,
    },
  }));
  failing.start();
  failing.push(new Int16Array(3200).fill(900));
  expect(failing.stop(1, 0)).rejects.toThrow("whisper-server is down");
  await Bun.sleep(10);
  expect(statSync(wav).mtimeMs).toBe(before);
  expect(existsSync(`${wav}.part`)).toBe(false);
  expect(store.calibrationRuns()).toMatchObject([{ run: 1, edits: 0 }]);
});

const readTerm = async (heard: string, term: string, language?: string) => {
  let changed = 0;
  const { store, calibration, call } = setup(heard, true, () => changed++, language);
  await call("start");
  calibration.push(new Int16Array(1600).fill(500));
  const result = (await (await call("term", term)).json()) as TermResult;
  return { result, dictionary: store.dictionary(), changed };
};

test("a term dictation already writes right is added as the term alone", async () => {
  // Close enough in sound for correctNames, so no mishearing is needed.
  const { result, dictionary, changed } = await readTerm(
    "Nirjar Bhattacharji.",
    "Nirjhar Bhattacharjee",
  );
  expect(result).toMatchObject({ right: true, saved: "Nirjhar Bhattacharjee" });
  expect(dictionary).toEqual([{ term: "Nirjhar Bhattacharjee" }]);
  expect(changed).toBe(1);
});

test("a term dictation would still get wrong keeps what Whisper heard", async () => {
  const { result, dictionary } = await readTerm("Shivon.", "Siobhan");
  expect(result).toMatchObject({ heard: "Shivon.", right: false, saved: "Shivon => Siobhan" });
  expect(dictionary).toEqual([{ term: "Siobhan", heard: "Shivon" }]);
});

test("a mishearing that's ordinary English isn't kept, or it would rewrite those words", async () => {
  const { result, dictionary } = await readTerm("Childhood.", "Tadhg");
  expect(result).toMatchObject({ right: false, saved: "Tadhg" });
  expect(dictionary).toEqual([{ term: "Tadhg" }]);
  expect((await readTerm("See you guys.", "Saoirse")).result.saved).toBe("Saoirse");
});

test("outside English, names aren't matched by sound and no mishearing is kept", async () => {
  // Dictation in German wouldn't fix it by sound, so it isn't right; and
  // with only an English word list, a German phrase can't be told from a name.
  const { result, dictionary } = await readTerm(
    "Nirjar Bhattacharji.",
    "Nirjhar Bhattacharjee",
    "de",
  );
  expect(result).toMatchObject({ right: false, saved: "Nirjhar Bhattacharjee" });
  expect(dictionary).toEqual([{ term: "Nirjhar Bhattacharjee" }]);
});

test("a take far longer than the term isn't kept as its mishearing", async () => {
  const { result, dictionary } = await readTerm(
    "Thank you for watching, see you next time.",
    "Siobhan",
  );
  expect(result).toMatchObject({ right: false, saved: "Siobhan" });
  expect(dictionary).toEqual([{ term: "Siobhan" }]);
});

test("a term needs a take and the word", async () => {
  const { call } = setup("Siobhan");
  expect((await call("term", "Siobhan")).status).toBe(409);
  expect((await call("term", "  ")).status).toBe(400);
});
