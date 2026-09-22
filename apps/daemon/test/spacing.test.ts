import { describe, expect, test } from "bun:test";
import { charBefore, describeSpacing, type LastTyped } from "../src/spacing.ts";

const last: LastTyped = { bundleId: "com.google.Chrome", at: 10_000, lastChar: "." };
const base = { last, bundleId: "com.google.Chrome", now: 15_000 };

describe("charBefore", () => {
  test("a character the app reports wins", () => {
    expect(charBefore({ ...base, read: "\n", idleSeconds: 60 })).toBe("\n");
  });

  test("an empty field right after our own dictation is a hidden input box", () => {
    expect(charBefore({ ...base, read: "", idleSeconds: 60 })).toBe(".");
  });

  test("an empty field is believed once a key was pressed or clicked since", () => {
    expect(charBefore({ ...base, read: "", idleSeconds: 2 })).toBe("");
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

describe("describeSpacing", () => {
  test("says where a space came from", () => {
    expect(describeSpacing(".", ".")).toContain("the app showed");
    expect(describeSpacing(undefined, ".")).toContain("last dictation");
    expect(describeSpacing("", ".")).toContain("last dictation");
  });

  test("says why there's no space", () => {
    expect(describeSpacing(undefined, undefined)).toContain("doesn't show");
    expect(describeSpacing("\n", "\n")).toContain("start of a line");
  });
});
