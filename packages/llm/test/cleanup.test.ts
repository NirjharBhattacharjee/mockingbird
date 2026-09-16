import { describe, expect, test } from "bun:test";
import { acceptCleanup, buildCleanupPrompt, formatText, shouldSkipLlm } from "../src/index.ts";

describe("shouldSkipLlm", () => {
  test("skips short, confident utterances", () => {
    expect(shouldSkipLlm({ text: "Yes please.", confidence: 0.95 })).toBe(true);
  });
  test("does not skip short but uncertain utterances", () => {
    expect(shouldSkipLlm({ text: "Yes please.", confidence: 0.5 })).toBe(false);
  });
  test("does not skip long utterances", () => {
    expect(
      shouldSkipLlm({ text: "this sentence has more than four words", confidence: 0.99 }),
    ).toBe(false);
  });
});

describe("acceptCleanup", () => {
  const raw = "Umm, so hello world, this is a test of the Mockingbird dictation pipeline.";
  test("accepts a filler-removal cleanup", () => {
    expect(
      acceptCleanup(raw, "So hello world, this is a test of the Mockingbird dictation pipeline."),
    ).toBe(true);
  });
  test("rejects an answer instead of a cleanup", () => {
    expect(acceptCleanup("what is the capital of france", "Paris.")).toBe(false);
  });
  test("rejects a runaway expansion", () => {
    expect(acceptCleanup("hello", "Hello! How can I help you with your dictation today?")).toBe(
      false,
    );
  });
  test("rejects empty output and leaked tags", () => {
    expect(acceptCleanup(raw, "")).toBe(false);
    expect(acceptCleanup("hi there", "<transcript>Hi there</transcript>")).toBe(false);
  });
});

describe("buildCleanupPrompt", () => {
  test("wraps the transcript and includes dictionary terms and terminal rules", () => {
    const prompt = buildCleanupPrompt({
      text: "run bun test",
      dictionary: [{ term: "Nirjhar", hint: "a name" }, { term: "Bun" }],
      style: "terminal",
    });
    expect(prompt.user).toBe("<transcript>run bun test</transcript>");
    expect(prompt.system).toContain("Nirjhar (a name), Bun");
    expect(prompt.system).toContain("terminal");
  });
});

describe("formatText", () => {
  test("normalizes whitespace", () => {
    expect(formatText("  hello   world. ")).toBe("hello world.");
  });
  test("terminal style drops a trailing period", () => {
    expect(formatText("git status.", "terminal")).toBe("git status");
  });
});
