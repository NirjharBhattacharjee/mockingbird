import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vadThreshold } from "../src/runtime.ts";
import { loudnessNotes, pickThreshold, recommend, tuneCommand } from "../src/tune.ts";

const model = (name: string, edits: number, medianMs: number, inUse = false) => ({
  name,
  inUse,
  edits,
  words: 300,
  medianMs,
});

test("recommends the fastest model within a point of the best", () => {
  const scores = [
    model("large-v3", 3, 1100, true), // 99.0%, best
    model("large-v3-turbo", 5, 500), // 98.3%, within a point
    model("base.en", 30, 120), // 90.0%, fastest but far off
  ];
  expect(recommend(scores)?.name).toBe("large-v3-turbo");
  // The one in use wins a tie on speed.
  expect(recommend([model("a", 3, 500), model("b", 3, 500, true)])?.name).toBe("b");
  expect(recommend([])).toBeUndefined();
});

test("a lower threshold is saved only when it hears clearly more words", () => {
  const edits = (pairs: [number, number][]) => new Map(pairs);
  // 14 more words heard at 0.3, and 0.2 no better.
  expect(
    pickThreshold(
      edits([
        [0.5, 20],
        [0.4, 12],
        [0.3, 6],
        [0.2, 6],
      ]),
      300,
    ),
  ).toBe(0.3);
  // One word is noise.
  expect(
    pickThreshold(
      edits([
        [0.5, 4],
        [0.4, 3],
        [0.3, 3],
        [0.2, 4],
      ]),
      300,
    ),
  ).toBeUndefined();
  // Two words, but under 1% of 1000.
  expect(
    pickThreshold(
      edits([
        [0.5, 12],
        [0.4, 10],
      ]),
      1000,
    ),
  ).toBeUndefined();
  // Worse is never picked.
  expect(
    pickThreshold(
      edits([
        [0.5, 2],
        [0.4, 9],
      ]),
      300,
    ),
  ).toBeUndefined();
});

test("loudness notes catch clipping, speech too quiet to bring up, and a loud room", () => {
  // A second of speech at `level`, then a second of the room at `room`.
  const take = (level: number, room = 0) => ({
    sampleRate: 16000,
    samples: Int16Array.from(
      { length: 32000 },
      (_, i) => (i % 2 ? 1 : -1) * Math.round((i < 16000 ? level : room) * 32767),
    ),
  });
  expect(loudnessNotes([take(0.1), take(0.12)])).toEqual([
    "Fine: your speech peaks around -18 dB.",
  ]);
  expect(loudnessNotes([take(1), take(0.1)])[0]).toStartWith("1 of 2 sentences hit full scale");
  expect(loudnessNotes([take(0.002), take(0.003)])[0]).toStartWith(
    "Your speech is very quiet (-50 dB)",
  );
  // The room at half the voice's level: 6 dB apart.
  expect(loudnessNotes([take(0.1, 0.05), take(0.1, 0.05)])).toEqual([
    "The room is nearly as loud as your voice (6 dB apart). Move somewhere quieter, or closer to the microphone.",
  ]);
});

test("a saved threshold is used only if it's one detectSpeech can take", () => {
  expect(vadThreshold("0.3")).toBe(0.3);
  expect(vadThreshold(undefined)).toBeUndefined();
  expect(vadThreshold("")).toBeUndefined();
  expect(vadThreshold("1.5")).toBeUndefined();
  expect(vadThreshold("loud")).toBeUndefined();
});

test("with no calibration, tune says to run one and changes nothing", async () => {
  const lines: string[] = [];
  const code = await tuneCommand({
    home: mkdtempSync(join(tmpdir(), "tune-test-")),
    out: (l) => lines.push(l),
  });
  expect(code).toBe(1);
  expect(lines).toEqual(["No calibration to tune with yet. Run `mockingbird calibrate` first."]);
});
