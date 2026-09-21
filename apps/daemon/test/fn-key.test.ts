import { describe, expect, test } from "bun:test";
import { type FnUsage, fnConflict, parseFnUsage, readFnUsage } from "../src/fn-key.ts";

describe("parseFnUsage", () => {
  test("0 means the key is ours", () => {
    expect(parseFnUsage("0\n", true)).toEqual({ kind: "free" });
  });

  test("names the action macOS has bound", () => {
    expect(parseFnUsage("2\n", true)).toEqual({
      kind: "taken",
      value: 2,
      action: "Show Emoji & Symbols",
    });
  });

  test("keeps an unknown value rather than dropping it", () => {
    expect(parseFnUsage("7", true)).toEqual({ kind: "taken", value: 7, action: "setting 7" });
  });

  test("a missing key is unset, not free", () => {
    expect(parseFnUsage("does not exist", false)).toEqual({ kind: "unset" });
  });

  test("unreadable output is unset, not NaN", () => {
    expect(parseFnUsage("", true)).toEqual({ kind: "unset" });
  });
});

describe("fnConflict", () => {
  test("says nothing when the key is ours", () => {
    expect(fnConflict({ kind: "free" })).toBeUndefined();
  });

  test("says nothing when unset, rather than guessing the default", () => {
    expect(fnConflict({ kind: "unset" })).toBeUndefined();
  });

  test("names the action and the setting that turns it off", () => {
    const usage: FnUsage = { kind: "taken", value: 2, action: "Show Emoji & Symbols" };
    const message = fnConflict(usage) ?? "";
    expect(message).toContain("Show Emoji & Symbols");
    expect(message).toContain("Do Nothing");
    // Holding still works, and saying so keeps the warning from reading as "broken".
    expect(message).toContain("Holding Fn still works");
  });
});

describe("readFnUsage", () => {
  test("reads the value defaults prints", async () => {
    const usage = await readFnUsage(
      () =>
        ({
          stdout: new Response("3\n").body,
          exited: Promise.resolve(0),
        }) as never,
    );
    expect(usage).toEqual({ kind: "taken", value: 3, action: "Start Dictation" });
  });

  test("a defaults that won't run leaves the key unset", async () => {
    const usage = await readFnUsage(() => {
      throw new Error("ENOENT");
    });
    expect(usage).toEqual({ kind: "unset" });
  });
});
