import { expect, test } from "bun:test";
import { separator } from "../src/session.ts";

test("separator keeps what came between two typed pieces", () => {
  expect(separator(" word", true)).toBe(" ");
  expect(separator("word", true)).toBe("");
  expect(separator("\n- item", true)).toBe("\n");
  expect(separator("\n\nNext paragraph", true)).toBe("\n\n");
  expect(separator("\n\n\n\nNext", true)).toBe("\n\n");
  // Where a line break could run a command, it's a space.
  expect(separator("\n- item", false)).toBe(" ");
});
