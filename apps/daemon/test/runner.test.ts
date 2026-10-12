import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appPath, ensureRunner, executableIn, runnerPath } from "../src/agent/runner.ts";

const workspace = () => mkdtempSync(join(tmpdir(), "mockingbird-runner-"));

/** Stands in for the bun binary; ensureRunner only copies and signs it. */
function fakeBun(dir: string, contents = "#!/bin/sh\nexit 0\n"): string {
  const path = join(dir, "bun");
  writeFileSync(path, contents, { mode: 0o755 });
  return path;
}

/** Records codesign and lsregister instead of running them. */
const recorder = (code = 0) => {
  const calls: string[][] = [];
  return {
    calls,
    run: (cmd: string[]) => {
      calls.push(cmd);
      return code;
    },
  };
};

describe("ensureRunner", () => {
  test("builds mockingbird.app with bun inside, the Info.plist and the logo", () => {
    const dir = workspace();
    const app = join(dir, "bin", "mockingbird.app");
    const result = ensureRunner({ source: fakeBun(dir), app, run: recorder().run });
    expect(result).toMatchObject({ installed: true, app, path: executableIn(app) });
    expect(statSync(result.path).mode & 0o111).toBeGreaterThan(0);
    const info = readFileSync(join(app, "Contents", "Info.plist"), "utf8");
    expect(info).toContain("<string>com.mockingbird.agent</string>");
    expect(info).toContain("<key>CFBundleIconFile</key>");
    expect(info).toContain("<key>NSMicrophoneUsageDescription</key>");
    expect(existsSync(join(app, "Contents", "Resources", "AppIcon.icns"))).toBe(true);
  });

  test("signs the whole bundle where it's staged, then registers it where it ends up", () => {
    const dir = workspace();
    const app = join(dir, "bin", "mockingbird.app");
    const { calls, run } = recorder();
    ensureRunner({ source: fakeBun(dir), app, run });
    expect(calls[0]).toEqual(["codesign", "--sign", "-", "--force", `${app}.new`]);
    expect(calls[1]?.slice(-2)).toEqual(["-f", app]);
    expect(existsSync(`${app}.new`)).toBe(false);
  });

  test("removes the runner from before the bundle", () => {
    const dir = workspace();
    const app = join(dir, "bin", "mockingbird.app");
    // An install from before the bundle: a bare executable and its marker.
    const old = join(dir, "bin", "mockingbird");
    ensureRunner({ source: fakeBun(dir), app, run: recorder().run });
    writeFileSync(old, "old");
    writeFileSync(`${old}.source`, "old");
    ensureRunner({ source: fakeBun(dir, "#!/bin/sh\necho newer\n"), app, run: recorder().run });
    expect(existsSync(old)).toBe(false);
    expect(existsSync(`${old}.source`)).toBe(false);
  });

  test("does nothing the second time, so grants aren't invalidated on every start", () => {
    const dir = workspace();
    const source = fakeBun(dir);
    const app = join(dir, "bin", "mockingbird.app");
    const { calls, run } = recorder();
    expect(ensureRunner({ source, app, run }).installed).toBe(true);
    expect(ensureRunner({ source, app, run }).installed).toBe(false);
    expect(calls.filter((c) => c[0] === "codesign")).toHaveLength(1);
  });

  test("rebuilds when bun itself has changed", () => {
    const dir = workspace();
    const source = fakeBun(dir);
    const app = join(dir, "bin", "mockingbird.app");
    ensureRunner({ source, app, run: recorder().run });
    writeFileSync(source, "#!/bin/sh\necho newer\n", { mode: 0o755 });
    expect(ensureRunner({ source, app, run: recorder().run }).installed).toBe(true);
    expect(readFileSync(executableIn(app), "utf8")).toContain("newer");
  });

  test("reports a failed signing but still installs, since the copy runs anyway", () => {
    const dir = workspace();
    const app = join(dir, "bin", "mockingbird.app");
    const result = ensureRunner({ source: fakeBun(dir), app, run: recorder(1).run });
    expect(result.installed).toBe(true);
    expect(result.unsigned).toContain("1");
    expect(existsSync(result.path)).toBe(true);
    expect(existsSync(`${app}.new`)).toBe(false);
  });

  test("tries the signing again next time, rather than trusting a failed one", () => {
    const dir = workspace();
    const source = fakeBun(dir);
    const app = join(dir, "bin", "mockingbird.app");
    // A marker written after a failed signing would make every later start skip
    // the retry, leaving the agent unnamed until bun itself changed.
    expect(ensureRunner({ source, app, run: recorder(1).run }).unsigned).toBeDefined();
    expect(ensureRunner({ source, app, run: recorder(1).run }).unsigned).toBeDefined();
    expect(ensureRunner({ source, app, run: recorder().run }).unsigned).toBeUndefined();
    // And once it works, it settles down again.
    expect(ensureRunner({ source, app, run: recorder().run }).installed).toBe(false);
  });

  test("keeps the signed bundle when signing its replacement fails", () => {
    const dir = workspace();
    const source = fakeBun(dir);
    const app = join(dir, "bin", "mockingbird.app");
    ensureRunner({ source, app, run: recorder().run });
    writeFileSync(source, "#!/bin/sh\necho newer\n", { mode: 0o755 });
    const failed = ensureRunner({ source, app, run: recorder(1).run });
    expect(failed).toMatchObject({ installed: false, unsigned: expect.stringContaining("kept") });
    expect(readFileSync(executableIn(app), "utf8")).not.toContain("newer");
    expect(existsSync(`${app}.new`)).toBe(false);
    // The next start tries again.
    expect(ensureRunner({ source, app, run: recorder().run }).installed).toBe(true);
    expect(readFileSync(executableIn(app), "utf8")).toContain("newer");
  });

  test("registers with LaunchServices on every start, so a failed registration retries", () => {
    const dir = workspace();
    const source = fakeBun(dir);
    const app = join(dir, "bin", "mockingbird.app");
    ensureRunner({ source, app, run: recorder().run });
    const { calls, run } = recorder();
    expect(ensureRunner({ source, app, run }).installed).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.slice(-2)).toEqual(["-f", app]);
  });
});

describe("runnerPath", () => {
  test("is the executable in bin/mockingbird.app, beside the models and logs", () => {
    expect(appPath("/Users/me")).toEndWith("/bin/mockingbird.app");
    expect(runnerPath("/Users/me")).toEndWith("/bin/mockingbird.app/Contents/MacOS/mockingbird");
  });
});
