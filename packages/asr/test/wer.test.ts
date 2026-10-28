import { expect, test } from "bun:test";
import { wordDiff } from "../src/index.ts";

const marks = (ws: { word: string; ok: boolean }[]) =>
  ws.map(({ word, ok }) => (ok ? word : `[${word}]`)).join(" ");

test("counts edits against the reference, ignoring case and punctuation", () => {
  const d = wordDiff(
    "The meeting moved to 3:30 on Thursday.",
    "the meeting moved to 3:30 on thursday",
  );
  expect(d).toMatchObject({ edits: 0, words: 8 });
});

test("marks the words that differ on each side", () => {
  const d = wordDiff(
    "Send the report to Priya Raghunathan before Friday",
    "Send report to Priya Ragunathan before the Friday",
  );
  // One dropped, one misheard, one added.
  expect(d.edits).toBe(3);
  expect(d.words).toBe(8);
  expect(marks(d.reference)).toBe("Send [the] report to Priya [Raghunathan] before Friday");
  expect(marks(d.hypothesis)).toBe("Send report to Priya [Ragunathan] before [the] Friday");
});

test("nothing heard is every word missed", () => {
  const d = wordDiff("one two three", "");
  expect(d).toMatchObject({ edits: 3, words: 3, hypothesis: [] });
  expect(d.reference.every((w) => !w.ok)).toBe(true);
});
