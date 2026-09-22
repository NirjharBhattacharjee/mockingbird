import { describe, expect, test } from "bun:test";
import { charBefore, describeSpacing, type LastTyped } from "../src/spacing.ts";

const last: LastTyped = { bundleId: "com.google.Chrome", at: 10_000, lastChar: "." };
const base = { last, bundleId: "com.google.Chrome" };
/** The user's last key press or click came before the dictation was typed. */
const before = 9_000;
const after = 10_001;

describe("charBefore", () => {
  test("a character the app reports wins", () => {
    expect(charBefore({ ...base, read: "\n", lastInputAt: before })).toBe("\n");
  });

  test("falls back to the last dictation when nothing was typed or clicked since", () => {
    expect(charBefore({ ...base, read: undefined, lastInputAt: before })).toBe(".");
  });

  test("an empty field right after our own dictation is a hidden input box", () => {
    expect(charBefore({ ...base, read: "", lastInputAt: before })).toBe(".");
  });

  test("unknown once a key was pressed or the mouse clicked since", () => {
    expect(charBefore({ ...base, read: undefined, lastInputAt: after })).toBeUndefined();
    expect(charBefore({ ...base, read: "", lastInputAt: after })).toBe("");
  });

  test("unknown in a different app", () => {
    expect(
      charBefore({ ...base, bundleId: "com.apple.Notes", read: undefined, lastInputAt: before }),
    ).toBeUndefined();
  });

  test("unknown without a previous dictation, or without the keyboard watcher", () => {
    expect(
      charBefore({ ...base, last: undefined, read: undefined, lastInputAt: before }),
    ).toBeUndefined();
    expect(charBefore({ ...base, read: undefined, lastInputAt: undefined })).toBeUndefined();
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
