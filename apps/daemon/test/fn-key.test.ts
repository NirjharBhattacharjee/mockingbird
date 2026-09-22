import { describe, expect, test } from "bun:test";
import {
  claimFnKey,
  claimMessage,
  type FnUsage,
  fnConflict,
  fnWriteArgv,
  parseFnUsage,
  readFnUsage,
} from "../src/fn-key.ts";

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

describe("fnWriteArgv", () => {
  test("binds the Fn key to nothing in the right domain", () => {
    expect(fnWriteArgv()).toEqual([
      "defaults",
      "write",
      "com.apple.HIToolbox",
      "AppleFnUsageType",
      "-int",
      "0",
    ]);
  });
});

describe("claimFnKey", () => {
  /** A spawn that answers reads from a queue and records every command. */
  const fake = (reads: string[]) => {
    const commands: string[][] = [];
    const spawn = (cmd: string[]) => {
      commands.push(cmd);
      if (cmd[1] === "write") return { stdout: null, exited: Promise.resolve(0) } as never;
      const next = reads.shift() ?? "";
      return {
        stdout: new Response(next).body,
        exited: Promise.resolve(next === "" ? 1 : 0),
      } as never;
    };
    return { spawn, commands };
  };

  test("does nothing when Fn is already ours", async () => {
    const { spawn, commands } = fake(["0"]);
    expect(await claimFnKey(spawn)).toEqual({ kind: "already" });
    // No write at all: claiming what we already hold would be a pointless change.
    expect(commands.some((c) => c[1] === "write")).toBe(false);
  });

  test("takes the key and names what it took it from", async () => {
    const { spawn } = fake(["2", "0"]);
    expect(await claimFnKey(spawn)).toEqual({ kind: "claimed", from: "Show Emoji & Symbols" });
  });

  test("a write that doesn't stick is a failure, not a success", async () => {
    // Reads 2 before and 2 after: defaults exited 0 but the value never changed.
    const { spawn } = fake(["2", "2"]);
    expect(await claimFnKey(spawn)).toEqual({
      kind: "failed",
      reason: "the setting didn't stick",
    });
  });
});

describe("claimMessage", () => {
  test("says a logout is needed, because macOS only reads it at login", () => {
    const message = claimMessage({ kind: "claimed", from: "Show Emoji & Symbols" });
    expect(message).toContain("log out");
    expect(message).toContain("Show Emoji & Symbols");
  });

  test("points at System Settings when it couldn't be written", () => {
    expect(claimMessage({ kind: "failed", reason: "nope" })).toContain("System Settings");
  });
});
