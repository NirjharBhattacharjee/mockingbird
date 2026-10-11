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
  expect(leadIn(true, "To do:\n- onions\n- milk", true)).toBe("\n");
  expect(leadIn(true, "Just a sentence.", true)).toBe(" ");
  expect(leadIn(false, "To do:\n- onions", true)).toBe("");
  // Where a line break could run a command, it's a space.
  expect(leadIn(true, "To do:\n- onions", false)).toBe(" ");
});
