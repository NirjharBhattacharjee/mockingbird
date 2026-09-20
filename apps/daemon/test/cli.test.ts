import { describe, expect, test } from "bun:test";
import { existsSync, realpathSync } from "node:fs";
import { bunPath, main } from "../src/cli.ts";

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
