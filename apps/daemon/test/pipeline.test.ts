import { describe, expect, test } from "bun:test";
import type { AsrEngine, AsrResult } from "@mockingbird/asr";
import type { LlmProvider } from "@mockingbird/llm";
import { type PipelineDeps, runPipeline } from "../src/pipeline.ts";

const audio = { sampleRate: 16000, samples: new Int16Array(16000) };
const speech = async () => [{ startSample: 0, endSample: 16000 }];

function fakeAsr(result: Partial<AsrResult>): AsrEngine & { calls: number } {
  return {
    model: "fake-asr",
    calls: 0,
    async transcribe() {
      this.calls++;
      return { text: "", confidence: 1, words: [], ...result };
    },
    health: async () => true,
  };
}

function fakeLlm(reply: string | Error): LlmProvider & { calls: number } {
  return {
    model: "fake-llm",
    calls: 0,
    async complete() {
      this.calls++;
      if (reply instanceof Error) throw reply;
      return reply;
    },
    health: async () => true,
  };
}

function deps(overrides: Partial<PipelineDeps>): PipelineDeps {
  return { detectSpeech: speech, asr: fakeAsr({}), llm: fakeLlm(""), ...overrides };
}

describe("runPipeline", () => {
  test("silence short-circuits before ASR", async () => {
    const asr = fakeAsr({ text: "Thank you." });
    const result = await runPipeline({ audio }, deps({ detectSpeech: async () => [], asr }));
    expect(asr.calls).toBe(0);
    expect(result).toMatchObject({
      rawText: "",
      finalText: "",
      asrMs: null,
      llmOutcome: "skipped",
    });
  });

  test("short confident utterance skips the LLM", async () => {
    const llm = fakeLlm("should not be used");
    const result = await runPipeline(
      { audio },
      deps({ asr: fakeAsr({ text: "Yes please.", confidence: 0.97 }), llm }),
    );
    expect(llm.calls).toBe(0);
    expect(result).toMatchObject({
      finalText: "Yes please.",
      llmOutcome: "skipped",
      llmMs: null,
      llmModel: null,
    });
  });

  test("longer utterance is cleaned by the LLM", async () => {
    const result = await runPipeline(
      { audio },
      deps({
        asr: fakeAsr({ text: "um so this is a longer dictated sentence", confidence: 0.9 }),
        llm: fakeLlm("So this is a longer dictated sentence."),
      }),
    );
    expect(result).toMatchObject({
      rawText: "um so this is a longer dictated sentence",
      finalText: "So this is a longer dictated sentence.",
      llmOutcome: "cleaned",
      llmModel: "fake-llm",
      asrModel: "fake-asr",
      durationMs: 1000,
    });
  });

  test("LLM failure falls back to the raw transcript", async () => {
    const result = await runPipeline(
      { audio },
      deps({
        asr: fakeAsr({ text: "this should still come through fine", confidence: 0.9 }),
        llm: fakeLlm(new Error("connection refused")),
      }),
    );
    expect(result.finalText).toBe("This should still come through fine.");
    expect(result.llmOutcome).toBe("failed");
    expect(result.llmError).toContain("connection refused");
  });

  test("an answer instead of a cleanup is rejected", async () => {
    const result = await runPipeline(
      { audio },
      deps({
        asr: fakeAsr({ text: "what is the capital of france", confidence: 0.9 }),
        llm: fakeLlm("Paris."),
      }),
    );
    expect(result.finalText).toBe("What is the capital of france?");
    expect(result.llmOutcome).toBe("rejected");
  });

  test("terminal style is applied to the final text", async () => {
    const result = await runPipeline(
      { audio, style: "terminal" },
      deps({ asr: fakeAsr({ text: "git status.", confidence: 0.99 }) }),
    );
    expect(result.finalText).toBe("git status");
  });
});
