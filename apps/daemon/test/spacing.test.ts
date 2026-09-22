import { describe, expect, test } from "bun:test";
import { charBefore, type LastTyped } from "../src/spacing.ts";

const last: LastTyped = { bundleId: "com.google.Chrome", at: 10_000, lastChar: "." };
const base = { last, bundleId: "com.google.Chrome", now: 15_000 };

describe("charBefore", () => {
  test("what the app reports wins", () => {
    expect(charBefore({ ...base, read: "\n", idleSeconds: 60 })).toBe("\n");
    expect(charBefore({ ...base, read: "", idleSeconds: 60 })).toBe("");
  });

  test("falls back to the last dictation when nothing was typed or clicked since", () => {
    expect(charBefore({ ...base, read: undefined, idleSeconds: 5.1 })).toBe(".");
  });

  test("allows for our own key events landing just before the end", () => {
    expect(charBefore({ ...base, read: undefined, idleSeconds: 4.9 })).toBe(".");
  });

  test("unknown once a key was pressed or the mouse clicked since", () => {
    expect(charBefore({ ...base, read: undefined, idleSeconds: 2 })).toBeUndefined();
  });

  test("unknown in a different app", () => {
    expect(
      charBefore({ ...base, bundleId: "com.apple.Notes", read: undefined, idleSeconds: 60 }),
    ).toBeUndefined();
  });

  test("unknown without a previous dictation, or without idle time", () => {
    expect(
      charBefore({ ...base, last: undefined, read: undefined, idleSeconds: 60 }),
    ).toBeUndefined();
    expect(charBefore({ ...base, read: undefined, idleSeconds: undefined })).toBeUndefined();
  });
});
