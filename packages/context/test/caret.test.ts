import { describe, expect, test } from "bun:test";
import { charBeforeCaret, needsLeadingSpace, secondsSinceInput } from "../src/index.ts";

describe("needsLeadingSpace", () => {
  test("adds a space after the end of a sentence", () => {
    expect(needsLeadingSpace(".")).toBe(true);
    expect(needsLeadingSpace("?")).toBe(true);
    expect(needsLeadingSpace("!")).toBe(true);
  });

  test("adds a space after a word, a comma, or a closing quote", () => {
    expect(needsLeadingSpace("a")).toBe(true);
    expect(needsLeadingSpace(",")).toBe(true);
    expect(needsLeadingSpace("”")).toBe(true);
    expect(needsLeadingSpace(")")).toBe(true);
  });

  test("no space at the start of a field, or when it can't be read", () => {
    expect(needsLeadingSpace("")).toBe(false);
    expect(needsLeadingSpace(undefined)).toBe(false);
  });

  test("no space after whitespace, including a new line", () => {
    expect(needsLeadingSpace(" ")).toBe(false);
    expect(needsLeadingSpace("\n")).toBe(false);
    expect(needsLeadingSpace("\t")).toBe(false);
    expect(needsLeadingSpace(" ")).toBe(false);
  });

  test("no space after an opening bracket or quote", () => {
    for (const opener of ["(", "[", "{", "“", "‘"]) expect(needsLeadingSpace(opener)).toBe(false);
  });
});

describe("charBeforeCaret", () => {
  // What it returns depends on the app in front and on Accessibility, neither
  // of which a test controls; it just mustn't throw without them.
  test("returns a single character, an empty string, or undefined", () => {
    const before = charBeforeCaret();
    if (before !== undefined) expect(before.length).toBeLessThanOrEqual(1);
  });
});

describe("secondsSinceInput", () => {
  test("is a non-negative number of seconds, or undefined", () => {
    const seconds = secondsSinceInput();
    if (seconds !== undefined) expect(seconds).toBeGreaterThanOrEqual(0);
  });
});
