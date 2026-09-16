import { beforeAll, describe, expect, test } from "bun:test";
import { acceptCleanup, buildCleanupPrompt, OllamaProvider } from "../src/index.ts";

const provider = new OllamaProvider(
  process.env.MOCKINGBIRD_LLM_URL ?? "http://127.0.0.1:11434",
  process.env.MOCKINGBIRD_LLM_MODEL ?? "qwen3:4b-instruct-2507-q4_K_M",
  60_000,
);

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("OllamaProvider (integration)", () => {
  // Warm the model so individual tests measure cleanup, not the cold load.
  beforeAll(async () => {
    expect(await provider.health()).toBe(true);
    await provider.complete(buildCleanupPrompt({ text: "warm up" }));
  }, 90_000);

  test("removes filler words", async () => {
    const raw = "Umm, so hello world, this is a test of the Mockingbird dictation pipeline.";
    const cleaned = await provider.complete(buildCleanupPrompt({ text: raw }));
    expect(cleaned.toLowerCase()).not.toContain("umm");
    expect(cleaned).toContain("Mockingbird dictation pipeline");
    expect(acceptCleanup(raw, cleaned)).toBe(true);
  }, 30_000);

  test("cleans a dictated question instead of answering it", async () => {
    const raw = "uh what is the capital of france";
    const cleaned = await provider.complete(buildCleanupPrompt({ text: raw }));
    expect(cleaned.toLowerCase()).toContain("capital of france");
    expect(cleaned.toLowerCase()).not.toContain("paris");
  }, 30_000);
});
