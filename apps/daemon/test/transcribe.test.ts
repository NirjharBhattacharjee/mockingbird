import { describe, expect, test } from "bun:test";
import { mkdtempSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const cli = join(import.meta.dir, "../src/transcribe.ts");
const hello = join(import.meta.dir, "../../../bench/fixtures/hello.wav");

async function run(args: string[], env: Record<string, string> = {}) {
  const proc = Bun.spawn(["bun", cli, ...args], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

describe("transcribe CLI", () => {
  test("--help prints usage and exits 0", async () => {
    const { stdout, code } = await run(["--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("Usage: mockingbird transcribe");
  });

  test("no file is a usage error", async () => {
    const { stderr, code } = await run([]);
    expect(code).toBe(2);
    expect(stderr).toContain("expected exactly one file");
  });

  test("unknown option is a usage error", async () => {
    const { code } = await run(["--nope", hello]);
    expect(code).toBe(2);
  });

  test("missing audio file is reported", async () => {
    const { stderr, code } = await run(["/nonexistent/recording.m4a"]);
    expect(code).toBe(1);
    expect(stderr).toContain("File not found");
  });

  test("missing models point at `mockingbird models pull`", async () => {
    const { stderr, code } = await run([hello], { MOCKINGBIRD_HOME: "/nonexistent/home" });
    expect(code).toBe(1);
    expect(stderr).toContain("Whisper model not found");
    expect(stderr).toContain("mockingbird models pull");
  });
});

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("transcribe CLI (integration)", () => {
  test("prints timestamped lines and words", async () => {
    // The real models, but a home of its own, so the user's data.db is never
    // opened, and so never migrated under a running older mockingbird.
    const home = mkdtempSync(join(tmpdir(), "mb-transcribe-"));
    symlinkSync(
      join(process.env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird"), "models"),
      join(home, "models"),
    );
    const env = { MOCKINGBIRD_HOME: home, MOCKINGBIRD_ASR_MODEL: "ggml-base.en.bin" };
    const lines = await run([hello], env);
    expect(lines.code).toBe(0);
    expect(lines.stdout.toLowerCase()).toContain("hello world");
    expect(lines.stdout).toMatch(/\[00:0\d\]/);
    const words = await run(["--words", hello], env);
    expect(words.stdout).toMatch(/\[00:0\d\.\d\d-00:0\d\.\d\d\] \S+/);
  }, 90_000);
});
