import { describe, expect, test } from "bun:test";
import { existsSync, realpathSync } from "node:fs";
import type { Launchctl } from "../src/agent/launchctl.ts";
import { agentVerdict, bunPath, main, stop } from "../src/cli.ts";

/** Runs the router with stdout captured, so help text doesn't pollute the run. */
async function run(argv: string[]): Promise<{ code: number; out: string }> {
  const original = console.log;
  let out = "";
  console.log = (...args: unknown[]) => {
    out += `${args.join(" ")}\n`;
  };
  try {
    return { code: await main(argv), out };
  } finally {
    console.log = original;
  }
}

describe("mockingbird", () => {
  test("lists its commands with no arguments", async () => {
    const { code, out } = await run([]);
    expect(code).toBe(0);
    for (const command of ["start", "stop", "restart", "status", "listen", "transcribe", "type"]) {
      expect(out).toContain(command);
    }
  });

  test("--help and help both work", async () => {
    expect((await run(["--help"])).out).toContain("Usage: mockingbird");
    expect((await run(["help"])).out).toContain("Usage: mockingbird");
  });

  test("rejects an unknown command by name", async () => {
    await expect(run(["bogus"])).rejects.toThrow('unknown command "bogus"');
  });

  test("passes the rest of the arguments to the subcommand", async () => {
    // listen --help returns without touching the microphone or any permission.
    const { code, out } = await run(["listen", "--help"]);
    expect(code).toBe(0);
    expect(out).toContain("mockingbird listen");
    expect(out).toContain("--list-devices");
  });

  test("does not treat the subcommand name as one of its arguments", async () => {
    // `transcribe` reaching its own parser as a positional would be an error.
    const { code, out } = await run(["transcribe", "--help"]);
    expect(code).toBe(0);
    expect(out).toContain("Usage:");
  });
});

describe("stop", () => {
  /** A launchctl where every command succeeds and `print` answers as told. */
  const launchctl =
    (loaded: boolean): Launchctl =>
    async (args) => {
      if (args[0] !== "print") return { code: 0, stdout: "", stderr: "" };
      return loaded
        ? { code: 0, stdout: "state = running\n", stderr: "" }
        : { code: 113, stdout: "", stderr: "Could not find service" };
    };

  /** `stop` reports through stderr, which the runner would otherwise print. */
  const quiet = async <T>(body: () => Promise<T>): Promise<T> => {
    const original = console.error;
    console.error = () => {};
    try {
      return await body();
    } finally {
      console.error = original;
    }
  };

  test("succeeds once launchd has let the service go", async () => {
    expect(await quiet(() => stop(launchctl(false), 300))).toBe(0);
  });

  test("fails rather than claiming a stop launchd hasn't finished", async () => {
    // Saying "stopped" here would leave the user thinking the microphone and
    // the Fn tap are off while the agent is still running.
    expect(await quiet(() => stop(launchctl(true), 300))).toBe(1);
  });
});

describe("bunPath", () => {
  test("prefers the stable symlink over the versioned binary it points at", () => {
    // brew upgrade deletes the Cellar path; /opt/homebrew/bin/bun survives it.
    const exec = "/opt/homebrew/Cellar/bun/1.4.2/bin/bun";
    expect(bunPath(exec, () => "/opt/homebrew/bin/bun")).toBe(
      realpathSync("/opt/homebrew/bin/bun") === realpathSync(exec) ? "/opt/homebrew/bin/bun" : exec,
    );
  });

  test("keeps the running binary when no bun is on PATH", () => {
    expect(bunPath("/somewhere/bun", () => null)).toBe("/somewhere/bun");
  });

  test("keeps the running binary when the one on PATH is a different install", () => {
    expect(bunPath(process.execPath, () => "/definitely/not/bun")).toBe(process.execPath);
  });

  test("names a real, existing file", () => {
    expect(existsSync(bunPath())).toBe(true);
  });
});

describe("agentVerdict", () => {
  const write = async (body: string) => {
    const path = `/tmp/mockingbird-verdict-${Math.random().toString(36).slice(2)}.log`;
    await Bun.write(path, body);
    return path;
  };

  test("names every pane the agent is missing", async () => {
    const path = await write("checks: Fn MISSING, typing MISSING, microphone SILENT\n");
    expect(await agentVerdict(path, 0)).toEqual([
      "Input Monitoring",
      "Accessibility",
      "Microphone",
    ]);
  });

  test("names only the one that's missing", async () => {
    const path = await write("checks: Fn ok, typing MISSING, microphone ok\n");
    expect(await agentVerdict(path, 0)).toEqual(["Accessibility"]);
  });

  test("catches a silent microphone, which no permission API reports", async () => {
    const path = await write("checks: Fn ok, typing ok, microphone SILENT\n");
    expect(await agentVerdict(path, 0)).toEqual(["Microphone"]);
  });

  test("empty means the agent is fully working", async () => {
    const path = await write("checks: Fn ok, typing ok, microphone ok\n");
    expect(await agentVerdict(path, 0)).toEqual([]);
  });

  test("waits for the checks line, not the earlier permissions one", async () => {
    // "permissions:" is logged before the microphone has been probed.
    const path = await write("permissions: Fn ok, typing ok\n");
    expect(await agentVerdict(path, 0, 300)).toBeUndefined();
  });

  test("ignores a line from a previous run", async () => {
    // Reading a stale 'ok' would tell the user everything is fine when it isn't.
    const old = "checks: Fn ok, typing ok, microphone ok\n";
    const path = await write(old);
    expect(await agentVerdict(path, old.length, 300)).toBeUndefined();
  });

  test("gives up rather than hanging when the agent never reports", async () => {
    const path = await write("starting whisper-server...\n");
    expect(await agentVerdict(path, 0, 300)).toBeUndefined();
  });

  test("survives a log that doesn't exist yet", async () => {
    expect(await agentVerdict("/tmp/mockingbird-nope.log", 0, 300)).toBeUndefined();
  });
});
