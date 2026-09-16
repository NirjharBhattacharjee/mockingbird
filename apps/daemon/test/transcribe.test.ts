import { describe, expect, test } from "bun:test";
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
    expect(stdout).toContain("Usage: bun run transcribe");
  });

  test("no file is a usage error", async () => {
    const { stderr, code } = await run([]);
    expect(code).toBe(2);
    expect(stderr).toContain("expected exactly one audio file");
  });

  test("unknown option is a usage error", async () => {
    const { code } = await run(["--nope", hello]);
    expect(code).toBe(2);
  });

  test("missing audio file is reported", async () => {
    const { stderr, code } = await run(["/nonexistent/recording.m4a"]);
    expect(code).toBe(1);
    expect(stderr).toContain("Audio file not found");
  });

  test("missing models point at the README", async () => {
    const { stderr, code } = await run([hello], { MOCKINGBIRD_HOME: "/nonexistent/home" });
    expect(code).toBe(1);
    expect(stderr).toContain("Whisper model not found");
    expect(stderr).toContain("README.md");
  });
});

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("transcribe CLI (integration)", () => {
  test("prints the raw transcript when the LLM is unreachable", async () => {
    const { stdout, stderr, code } = await run(["--json", hello], {
      MOCKINGBIRD_ASR_PORT: "18776",
      MOCKINGBIRD_LLM_URL: "http://127.0.0.1:9",
    });
    expect(code).toBe(0);
    expect(stderr).toContain("warning: Ollama isn't running");
    const result = JSON.parse(stdout);
    expect(result.llmOutcome).toBe("failed");
    expect(result.finalText).toBe(result.rawText);
    expect(result.finalText.toLowerCase()).toContain("hello world");
  }, 90_000);
});
