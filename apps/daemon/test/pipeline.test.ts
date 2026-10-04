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
        asr: fakeAsr({ text: "this should still come through fine", confidence: 0.6 }),
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
        asr: fakeAsr({ text: "what is the capital of france", confidence: 0.6 }),
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

/** An LLM that writes its reply a few characters at a time, then optionally fails. */
function streamingLlm(reply: string, failAfter?: number): LlmProvider & { streamed: number } {
  return {
    model: "fake-llm",
    streamed: 0,
    async complete() {
      return reply;
    },
    async *stream() {
      for (let i = 0; i < reply.length; i += 3) {
        if (failAfter !== undefined && i >= failAfter) throw new Error("connection reset");
        this.streamed = i + 3;
        yield reply.slice(i, i + 3);
      }
    },
    health: async () => true,
  };
}

describe("runPipeline with onText", () => {
  async function run(text: string, llm: LlmProvider, style: "default" | "terminal" = "default") {
    const pieces: { piece: string; streamed: number }[] = [];
    const result = await runPipeline(
      { audio, style },
      deps({ asr: fakeAsr({ text, confidence: 0.6 }), llm }),
      async (piece) => {
        pieces.push({ piece, streamed: (llm as { streamed?: number }).streamed ?? 0 });
      },
    );
    return { result, pieces };
  }

  test("types words while the model is still writing, and the pieces make the final text", async () => {
    const llm = streamingLlm("So I think we should move the meeting to Thursday.");
    const { result, pieces } = await run(
      "um so I think we should uh move the meeting to Thursday",
      llm,
    );
    expect(pieces.map((p) => p.piece).join("")).toBe(result.finalText);
    expect(result.finalText).toBe("So I think we should move the meeting to Thursday.");
    expect(result.llmOutcome).toBe("cleaned");
    // The first words went out long before the model finished.
    expect(pieces[0]?.streamed).toBeLessThan(20);
    expect(pieces.length).toBeGreaterThan(3);
  });

  test("an answer is never typed early, and is still rejected", async () => {
    const { result, pieces } = await run("what is the capital of france", streamingLlm("Paris."));
    expect(pieces.map((p) => p.piece)).toEqual(["What is the capital of france?"]);
    expect(result.llmOutcome).toBe("rejected");
  });

  test("a cleanup rejected after it began carries on with the transcript", async () => {
    // Drops the second half: too short to accept, but its start was the user's words.
    const raw = "so I wanted to say that the release is ready and we can ship it on Monday";
    const { result, pieces } = await run(raw, streamingLlm("So I wanted to say that the release"));
    expect(result.llmOutcome).toBe("rejected");
    expect(pieces.map((p) => p.piece).join("")).toBe(result.finalText);
    expect(result.finalText).toBe(
      "So I wanted to say that the release is ready and we can ship it on Monday.",
    );
  });

  test("a model that dies mid-cleanup leaves the rest of the transcript", async () => {
    const raw = "um so the build is green and the deploy can go out after lunch today";
    const { result, pieces } = await run(
      raw,
      streamingLlm("So the build is green and the deploy can go out after lunch today.", 30),
    );
    expect(result.llmOutcome).toBe("failed");
    expect(pieces.map((p) => p.piece).join("")).toBe(result.finalText);
    expect(result.finalText).toBe(
      "So the build is green and the deploy can go out after lunch today.",
    );
  });

  test("a terminal gets the whole, checked text in one piece", async () => {
    const { pieces } = await run(
      "git status and then git push",
      streamingLlm("git status and then git push"),
      "terminal",
    );
    expect(pieces.map((p) => p.piece)).toEqual(["git status and then git push"]);
  });

  test("a skipped cleanup is handed over too", async () => {
    const pieces: string[] = [];
    await runPipeline(
      { audio },
      deps({ asr: fakeAsr({ text: "Yes please.", confidence: 0.97 }) }),
      async (piece) => {
        pieces.push(piece);
      },
    );
    expect(pieces).toEqual(["Yes please."]);
  });
});
