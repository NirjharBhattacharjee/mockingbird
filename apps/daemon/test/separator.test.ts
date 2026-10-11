import { expect, test } from "bun:test";
import { leadIn, separator } from "../src/session.ts";

test("separator keeps what came between two typed pieces", () => {
  expect(separator(" word", true)).toBe(" ");
  expect(separator("word", true)).toBe("");
  expect(separator("\n- item", true)).toBe("\n");
  expect(separator("\n\nNext paragraph", true)).toBe("\n\n");
  expect(separator("\n\n\n\nNext", true)).toBe("\n\n");
  // Where a line break could run a command, it's a space.
  expect(separator("\n- item", false)).toBe(" ");
});

test("a list after earlier text starts on a new line", () => {
  const list = "To do:\n- onions\n- milk";
  expect(leadIn(true, ".", list, true)).toBe("\n");
  // After "My list. " the app needs no space, but the list still needs a line.
  expect(leadIn(false, " ", list, true)).toBe("\n");
  expect(leadIn(false, "\n", list, true)).toBe("");
  expect(leadIn(false, "", list, true)).toBe("");
  // The app doesn't show its text: following our last dictation is the only clue.
  expect(leadIn(true, undefined, list, true)).toBe("\n");
  expect(leadIn(false, undefined, list, true)).toBe("");
  expect(leadIn(true, ".", "Just a sentence.", true)).toBe(" ");
  // Where a line break could run a command, it's a space.
  expect(leadIn(true, ".", list, false)).toBe(" ");
});
