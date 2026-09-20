import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureRunner, runnerPath } from "../src/agent/runner.ts";

const workspace = () => mkdtempSync(join(tmpdir(), "mockingbird-runner-"));

/** Stands in for the bun binary; ensureRunner only copies and signs it. */
function fakeBun(dir: string, contents = "#!/bin/sh\nexit 0\n"): string {
  const path = join(dir, "bun");
  writeFileSync(path, contents, { mode: 0o755 });
  return path;
}

describe("ensureRunner", () => {
  test("installs a copy named mockingbird", () => {
    const dir = workspace();
    const destination = join(dir, "bin", "mockingbird");
    const result = ensureRunner({ source: fakeBun(dir), destination, sign: () => 0 });
    expect(result.installed).toBe(true);
    expect(result.path).toBe(destination);
    expect(existsSync(destination)).toBe(true);
  });

  test("signs it under our own identifier, which is what renames it", () => {
    const dir = workspace();
    const destination = join(dir, "bin", "mockingbird");
    let argv: string[] = [];
    ensureRunner({
      source: fakeBun(dir),
      destination,
      sign: (cmd) => {
        argv = cmd;
        return 0;
      },
    });
    expect(argv).toEqual([
      "codesign",
      "--sign",
      "-",
      "--identifier",
      "mockingbird",
      "--force",
      destination,
    ]);
  });

  test("is executable", () => {
    const dir = workspace();
    const destination = join(dir, "bin", "mockingbird");
    ensureRunner({ source: fakeBun(dir), destination, sign: () => 0 });
    expect(statSync(destination).mode & 0o111).toBeGreaterThan(0);
  });

  test("does nothing the second time, so grants aren't invalidated on every start", () => {
    const dir = workspace();
    const source = fakeBun(dir);
    const destination = join(dir, "bin", "mockingbird");
    let signings = 0;
    const sign = () => {
      signings += 1;
      return 0;
    };
    expect(ensureRunner({ source, destination, sign }).installed).toBe(true);
    expect(ensureRunner({ source, destination, sign }).installed).toBe(false);
    expect(signings).toBe(1);
  });

  test("replaces the copy when bun itself has changed", () => {
    const dir = workspace();
    const source = fakeBun(dir);
    const destination = join(dir, "bin", "mockingbird");
    ensureRunner({ source, destination, sign: () => 0 });
    writeFileSync(source, "#!/bin/sh\necho newer\n", { mode: 0o755 });
    expect(ensureRunner({ source, destination, sign: () => 0 }).installed).toBe(true);
    expect(readFileSync(destination, "utf8")).toContain("newer");
  });

  test("reports a failed signing but still installs, since the copy runs anyway", () => {
    const dir = workspace();
    const destination = join(dir, "bin", "mockingbird");
    const result = ensureRunner({ source: fakeBun(dir), destination, sign: () => 1 });
    expect(result.installed).toBe(true);
    expect(result.unsigned).toContain("1");
    expect(existsSync(destination)).toBe(true);
  });
});

describe("runnerPath", () => {
  test("lives in bin/ beside the models and logs", () => {
    expect(runnerPath("/Users/me")).toEndWith("/bin/mockingbird");
  });
});
