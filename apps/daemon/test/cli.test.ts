import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { engineStatus, main } from "../src/cli.ts";

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
  test("lists its commands with no arguments, and no dictation ones", async () => {
    const { code, out } = await run([]);
    expect(code).toBe(0);
    for (const command of ["transcribe", "dictionary", "models pull", "status", "mcp"]) {
      expect(out).toContain(command);
    }
    for (const gone of ["start", "listen", "calibrate", "Fn"]) expect(out).not.toContain(gone);
  });

  test("--help and help both work", async () => {
    expect((await run(["--help"])).out).toContain("Usage: mockingbird");
    expect((await run(["help"])).out).toContain("Usage: mockingbird");
  });

  test("rejects an unknown command by name, dictation's too", async () => {
    await expect(run(["bogus"])).rejects.toThrow('unknown command "bogus"');
    await expect(run(["start"])).rejects.toThrow('unknown command "start"');
  });

  test("does not treat the subcommand name as one of its arguments", async () => {
    // `transcribe` reaching its own parser as a positional would be an error.
    const { code, out } = await run(["transcribe", "--help"]);
    expect(code).toBe(0);
    expect(out).toContain("Usage: mockingbird transcribe");
  });

  test("models rejects what it doesn't know", async () => {
    expect(await main(["models", "list"])).toBe(2);
    expect(await main(["models", "use"])).toBe(2);
  });
});

test("engineStatus says what's installed", () => {
  const home = mkdtempSync(join(tmpdir(), "mb-status-"));
  expect(engineStatus(home, () => null, {})).toEqual({
    transcriptionModel: null,
    vadModel: false,
    ffmpeg: false,
    ffmpegMissing: [],
    whisperServer: false,
    chrome: false,
    dictionaryWords: 0,
  });
  expect(engineStatus(home, () => null, { MOCKINGBIRD_CHROME: process.execPath }).chrome).toBe(
    true,
  );
  expect(engineStatus(home, () => null, { MOCKINGBIRD_CHROME: "/no/chrome" }).chrome).toBe(false);
  mkdirSync(join(home, "models"));
  writeFileSync(join(home, "models", "ggml-base.en.bin"), "");
  writeFileSync(join(home, "models", "silero_vad.onnx"), "");
  expect(
    engineStatus(
      home,
      (n) => `/usr/bin/${n}`,
      {},
      () => ["libx264"],
    ),
  ).toMatchObject({
    transcriptionModel: "ggml-base.en.bin",
    vadModel: true,
    ffmpeg: true,
    ffmpegMissing: ["libx264"],
    whisperServer: true,
  });
  // An override that names nothing isn't a whisper-server.
  expect(
    engineStatus(
      home,
      () => null,
      { MOCKINGBIRD_WHISPER_SERVER: "/no/whisper-server" },
      () => [],
    ).whisperServer,
  ).toBe(false);
});
