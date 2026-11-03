// bun test skills/motion-graphics: the kit's timing helpers, which every template leans on.
import { expect, test } from "bun:test";
import { cutPoints, expo, hash, presence, words } from "./kit.ts";

const cues = [
  { start: 0.2, end: 0.5, text: "*So* if you" },
  { start: 0.5, end: 0.9, text: "So *if* you" },
  { start: 0.9, end: 1.4, text: "So if *you*" },
  { start: 2.6, end: 3.0, text: "*escape* the tutorial" },
  { start: 3.0, end: 3.4, text: "escape *the* tutorial" },
  { start: 4.9, end: 5.6, text: "*hell*" },
];

test("words come out of the marked cues with their own times", () => {
  expect(words(cues).map((w) => w.text)).toEqual(["So", "if", "you", "escape", "the", "hell"]);
  expect(words(cues)[3]).toEqual({ text: "escape", start: 2.6, end: 3.0 });
});

test("cut points land on word starts, at least `every` seconds apart", () => {
  expect(cutPoints(cues, 2)).toEqual([2.6, 4.9]);
  expect(cutPoints(cues, 3)).toEqual([3]);
});

test("presence fades in, holds, fades out, and is 0 outside", () => {
  expect(presence(0.9, 1, 3)).toBe(0);
  expect(presence(2, 1, 3)).toBe(1);
  expect(presence(3.1, 1, 3)).toBe(0);
  expect(presence(1.1, 1, 3)).toBeGreaterThan(0);
  expect(presence(1.1, 1, 3)).toBeLessThan(1);
});

test("the curve and the random are fixed functions", () => {
  expect(expo(0)).toBe(0);
  expect(expo(1)).toBe(1);
  expect(expo(0.3)).toBeGreaterThan(0.8);
  expect(hash(7)).toBe(hash(7));
  expect(hash(7)).not.toBe(hash(8));
});
