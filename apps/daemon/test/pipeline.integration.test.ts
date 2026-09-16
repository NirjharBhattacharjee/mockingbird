import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { startWhisperServer, type WhisperServerProcess } from "@mockingbird/asr";
import { readWavFile } from "@mockingbird/audio";
import { OllamaProvider } from "@mockingbird/llm";
import { detectSpeech, SileroVad } from "@mockingbird/vad";
import { type PipelineDeps, runPipeline } from "../src/pipeline.ts";

const modelsDir = join(process.env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird"), "models");
const fixtures = join(import.meta.dir, "../../../bench/fixtures");

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("headless pipeline (integration)", () => {
  let whisper: WhisperServerProcess | undefined;
  let vad: SileroVad | undefined;
  let deps: PipelineDeps;

  beforeAll(async () => {
    vad = await SileroVad.load(join(modelsDir, "silero_vad.onnx"));
    whisper = await startWhisperServer({
      modelPath: join(modelsDir, "ggml-base.en.bin"),
      port: 18775,
      readyTimeoutMs: 60_000,
    });
    const llm = new OllamaProvider(
      process.env.MOCKINGBIRD_LLM_URL ?? "http://127.0.0.1:11434",
      process.env.MOCKINGBIRD_LLM_MODEL ?? "qwen3:4b-instruct-2507-q4_K_M",
      60_000,
    );
    const loaded = vad;
    deps = { detectSpeech: (audio) => detectSpeech(loaded, audio), asr: whisper.engine, llm };
    // Warm both servers so the assertions below reflect steady-state latency.
    await llm.complete({ system: "Reply with ok.", user: "ok" });
  }, 120_000);

  afterAll(async () => {
    await whisper?.stop();
    await vad?.close();
  });

  test("fixture WAV → VAD → ASR → LLM → text", async () => {
    const result = await runPipeline(
      { audio: await readWavFile(join(fixtures, "hello.wav")) },
      deps,
    );
    console.log(JSON.stringify(result, null, 2));

    expect(result.llmOutcome).toBe("cleaned");
    expect(result.rawText.toLowerCase()).toMatch(/^um+,? /);
    expect(result.finalText.toLowerCase()).not.toMatch(/\bum+\b/);
    expect(result.finalText).toMatch(/hello world/i);
    expect(result.finalText).toMatch(/dictation pipeline/i);
  }, 30_000);

  test("short confirmation skips the LLM", async () => {
    const result = await runPipeline(
      { audio: await readWavFile(join(fixtures, "short.wav")) },
      deps,
    );
    console.log(JSON.stringify(result, null, 2));

    expect(result.finalText.toLowerCase()).toContain("yes");
    expect(result.llmOutcome).toBe("skipped");
    expect(result.llmMs).toBeNull();
  }, 30_000);
});
