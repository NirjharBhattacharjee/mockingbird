import { describe, expect, test } from "bun:test";
import { echoFor } from "../src/listen.ts";
import type { PipelineResult } from "../src/pipeline.ts";
import type { Delivery } from "../src/session.ts";

const result = (finalText: string): PipelineResult => ({
  rawText: finalText,
  finalText,
  durationMs: 2000,
  vadMs: 10,
  asrMs: 200,
  llmMs: 400,
  llmOutcome: "cleaned",
  asrModel: "base.en",
  llmModel: "qwen3",
});

const typed: Delivery = { typed: true };
const notTyped = (reason: string): Delivery => ({ typed: false, reason });

describe("echoFor", () => {
  test("says nothing when the text reached the app", () => {
    // The whole point of the change: no double copy in the terminal.
    expect(echoFor(result("hello there"), typed, { typingWanted: true })).toEqual({});
  });

  test("prints the text, with the reason, when typing didn't happen", () => {
    const echo = echoFor(result("hello there"), notTyped("Accessibility is off"), {
      typingWanted: true,
    });
    expect(echo.text).toBe("hello there");
    expect(echo.note).toContain("Accessibility is off");
  });

  test("prints plainly under --no-type, since nothing went wrong", () => {
    expect(
      echoFor(result("hello there"), notTyped("typing isn't allowed"), {
        typingWanted: false,
      }),
    ).toEqual({ text: "hello there" });
  });

  test("reports silence instead of printing an empty line", () => {
    expect(echoFor(result(""), notTyped("no speech detected"), { typingWanted: true })).toEqual({
      note: "no speech detected",
    });
  });

  test("--json prints everything, including whether it was typed", () => {
    const echo = echoFor(result("hello"), typed, { json: true, typingWanted: true });
    expect(JSON.parse(echo.text ?? "")).toMatchObject({ finalText: "hello", typed: true });
  });

  test("--json still prints when typing failed", () => {
    const echo = echoFor(result("hello"), notTyped("app changed"), {
      json: true,
      typingWanted: true,
    });
    expect(JSON.parse(echo.text ?? "")).toMatchObject({ typed: false });
  });
});
