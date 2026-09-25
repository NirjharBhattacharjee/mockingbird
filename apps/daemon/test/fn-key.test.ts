import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claimFnKey,
  claimMessage,
  type FnUsage,
  fnAdvice,
  fnConflict,
  fnWriteArgv,
  parseFnUsage,
  readFnUsage,
  restoreFnKey,
  restoreMessage,
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

/** A spawn that answers reads from a queue and records every command. */
const fake = (reads: string[]) => {
  const commands: string[][] = [];
  const spawn = (cmd: string[]) => {
    commands.push(cmd);
    if (cmd[1] !== "read") return { stdout: null, exited: Promise.resolve(0) } as never;
    const next = reads.shift() ?? "";
    return {
      stdout: new Response(next).body,
      exited: Promise.resolve(next === "" ? 1 : 0),
    } as never;
  };
  return { spawn, commands };
};

let backup: string;
beforeEach(() => {
  backup = join(mkdtempSync(join(tmpdir(), "mockingbird-fn-")), "fn-key.json");
});

describe("claimFnKey", () => {
  test("does nothing when Fn is already ours", async () => {
    const { spawn, commands } = fake(["0"]);
    expect(await claimFnKey(backup, spawn)).toEqual({ kind: "already" });
    // No write at all: claiming what we already hold would be a pointless change.
    expect(commands.some((c) => c[1] === "write")).toBe(false);
    expect(existsSync(backup)).toBe(false);
  });

  test("takes the key and names what it took it from", async () => {
    const { spawn } = fake(["2", "0"]);
    expect(await claimFnKey(backup, spawn)).toEqual({
      kind: "claimed",
      from: "Show Emoji & Symbols",
    });
  });

  test("saves what it replaced before writing", async () => {
    const { spawn } = fake(["2", "0"]);
    await claimFnKey(backup, spawn);
    expect(JSON.parse(readFileSync(backup, "utf8"))).toEqual({
      kind: "taken",
      value: 2,
      action: "Show Emoji & Symbols",
    });
  });

  test("a second claim keeps the original backup", async () => {
    await claimFnKey(backup, fake(["2", "0"]).spawn);
    // The user put Fn on Start Dictation by hand, then claimed again.
    await claimFnKey(backup, fake(["3", "0"]).spawn);
    expect(JSON.parse(readFileSync(backup, "utf8")).value).toBe(2);
  });

  test("a write that doesn't stick is a failure, not a success", async () => {
    // Reads 2 before and 2 after: defaults exited 0 but the value never changed.
    const { spawn } = fake(["2", "2"]);
    expect(await claimFnKey(backup, spawn)).toEqual({
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

describe("restoreFnKey", () => {
  test("with no backup there's nothing to undo, and nothing is written", async () => {
    const { spawn, commands } = fake([]);
    expect(await restoreFnKey(backup, spawn)).toEqual({ kind: "nothing" });
    expect(commands).toEqual([]);
  });

  test("puts back the action it replaced, and forgets the backup", async () => {
    await claimFnKey(backup, fake(["2", "0"]).spawn);
    const { spawn, commands } = fake(["2"]);
    expect(await restoreFnKey(backup, spawn)).toEqual({
      kind: "restored",
      to: "Show Emoji & Symbols",
    });
    expect(commands[0]).toEqual([
      "defaults",
      "write",
      "com.apple.HIToolbox",
      "AppleFnUsageType",
      "-int",
      "2",
    ]);
    expect(existsSync(backup)).toBe(false);
  });

  test("an unset key is deleted again, not written as 0", async () => {
    await claimFnKey(backup, fake(["", "0"]).spawn);
    const { spawn, commands } = fake([""]);
    expect(await restoreFnKey(backup, spawn)).toEqual({
      kind: "restored",
      to: "the macOS default",
    });
    expect(commands[0]?.[1]).toBe("delete");
  });

  test("keeps the backup when the restore didn't stick", async () => {
    await claimFnKey(backup, fake(["2", "0"]).spawn);
    expect((await restoreFnKey(backup, fake(["0"]).spawn)).kind).toBe("failed");
    expect(existsSync(backup)).toBe(true);
  });
});

describe("fnAdvice", () => {
  test("hints at `mockingbird fn` for an unset key, since the default is often the picker", () => {
    expect(fnAdvice({ kind: "unset" })).toContain("mockingbird fn");
  });

  test("says nothing when the key is ours", () => {
    expect(fnAdvice({ kind: "free" })).toBeUndefined();
  });
});

describe("restoreMessage", () => {
  test("names what Fn went back to and that a logout is needed", () => {
    const message = restoreMessage({ kind: "restored", to: "Show Emoji & Symbols" });
    expect(message).toContain("Show Emoji & Symbols");
    expect(message).toContain("log out");
  });
});
