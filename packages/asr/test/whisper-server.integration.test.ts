import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { readWavFile } from "@mockingbird/audio";
import { startWhisperServer, type WhisperServerProcess } from "../src/index.ts";

const modelsDir = join(process.env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird"), "models");
const fixtures = join(import.meta.dir, "../../../bench/fixtures");

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("whisper-server (integration)", () => {
  let server: WhisperServerProcess | undefined;
  // Cold start is ~15s on Apple Silicon while Metal compiles its shaders.
  beforeAll(async () => {
    server = await startWhisperServer({
      modelPath: join(modelsDir, "ggml-base.en.bin"),
      port: 18771,
      readyTimeoutMs: 60_000,
    });
  }, 70_000);
  afterAll(() => server?.stop());

  test("transcribes the spoken fixture", async () => {
    if (!server) throw new Error("server did not start");
    const result = await server.engine.transcribe(await readWavFile(join(fixtures, "hello.wav")));
    const normalized = result.text.toLowerCase();
    expect(normalized).toContain("hello world");
    expect(normalized).toContain("dictation pipeline");
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(server.engine.model).toBe("base.en");
  });

  // whisper.cpp compiles its Metal libraries before opening the model, so even a
  // failing start can take seconds; what matters is it reports the exit rather
  // than waiting out the ready timeout.
  test("startWhisperServer reports an exit on a missing model", async () => {
    await expect(
      startWhisperServer({
        modelPath: "/nonexistent/model.bin",
        port: 18772,
        readyTimeoutMs: 60_000,
      }),
    ).rejects.toThrow(/exited/);
  }, 70_000);
});
