import { describe, expect, test } from "bun:test";
import { decideSpacing, InputTracker, type LastTyped } from "../src/spacing.ts";

const last: LastTyped = { bundleId: "com.google.Chrome", lastChar: "." };
const base = { last, bundleId: "com.google.Chrome", inputSince: false };

describe("decideSpacing", () => {
  test("a character the app shows decides", () => {
    expect(decideSpacing({ ...base, read: "a" }).space).toBe(true);
    expect(decideSpacing({ ...base, read: "\n" }).space).toBe(false);
    expect(decideSpacing({ ...base, read: "(" }).space).toBe(false);
  });

  test("follows the last dictation where the app doesn't show its text", () => {
    const decision = decideSpacing({ ...base, read: undefined });
    expect(decision.space).toBe(true);
    expect(decision.why).toContain("follows the last dictation");
  });

  test("an empty field right after our own dictation is a hidden input box", () => {
    expect(decideSpacing({ ...base, read: "" }).space).toBe(true);
  });

  test("no space once a key was pressed or the mouse clicked since", () => {
    const decision = decideSpacing({ ...base, read: undefined, inputSince: true });
    expect(decision.space).toBe(false);
    expect(decision.why).toContain("a key was pressed");
  });

  test("no space in a different app, or without an earlier dictation", () => {
    expect(decideSpacing({ ...base, bundleId: "com.apple.Notes", read: undefined })).toMatchObject({
      space: false,
      why: expect.stringContaining("another app"),
    });
    expect(decideSpacing({ ...base, last: undefined, read: undefined }).space).toBe(false);
  });

  test("no guessing when key presses aren't watched", () => {
    const decision = decideSpacing({ ...base, read: undefined, inputSince: undefined });
    expect(decision.space).toBe(false);
    expect(decision.why).toContain("Fn listener");
  });
});

describe("InputTracker", () => {
  test("nothing since the last dictation", () => {
    expect(new InputTracker().hasInput()).toBe(false);
  });

  test("a key press or click counts", () => {
    const inputs = new InputTracker();
    inputs.input(1_000);
    expect(inputs.hasInput()).toBe(true);
  });

  test("a key press that comes with a Fn tap doesn't count, whatever it is", () => {
    const inputs = new InputTracker();
    // A double-tap: two quick Fn presses, each echoed as a key press.
    for (const at of [1_000, 1_080, 1_200, 1_280]) inputs.fn(at);
    inputs.input(1_010);
    inputs.input(1_210);
    expect(inputs.hasInput()).toBe(false);
  });

  test("a key press well away from Fn still counts", () => {
    const inputs = new InputTracker();
    inputs.fn(1_000);
    inputs.input(1_000);
    inputs.input(3_000);
    expect(inputs.hasInput()).toBe(true);
  });

  test("starts over after each dictation", () => {
    const inputs = new InputTracker();
    inputs.input(1_000);
    inputs.reset();
    expect(inputs.hasInput()).toBe(false);
  });
});
