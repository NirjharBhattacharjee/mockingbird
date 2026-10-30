import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_ASR_MODEL,
  dictationLanguage,
  englishOnly,
  findAsrModel,
  readCleanupRules,
} from "../src/runtime.ts";

const modelsWith = (...names: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-models-"));
  for (const name of names) writeFileSync(join(dir, name), "");
  return dir;
};

describe("findAsrModel", () => {
  test("the default, when it's downloaded", () => {
    const models = modelsWith(DEFAULT_ASR_MODEL, "ggml-base.en.bin");
    const logged: string[] = [];
    expect(findAsrModel(models, undefined, (m) => logged.push(m))).toBe(
      join(models, DEFAULT_ASR_MODEL),
    );
    expect(logged).toEqual([]);
  });

  test("an install from before the default changed keeps its model, with a warning", () => {
    const models = modelsWith("ggml-base.en.bin");
    const logged: string[] = [];
    expect(findAsrModel(models, undefined, (m) => logged.push(m))).toBe(
      join(models, "ggml-base.en.bin"),
    );
    expect(logged[0]).toContain("mockingbird models pull");
  });

  test("no model at all still fails with the setup hint", () => {
    expect(() => findAsrModel(modelsWith(), undefined, () => {})).toThrow(
      "mockingbird models pull",
    );
  });

  test("the saved choice comes before the default; a deleted one falls back, with a warning", () => {
    const models = modelsWith(DEFAULT_ASR_MODEL, "ggml-base.en.bin");
    const logged: string[] = [];
    expect(findAsrModel(models, undefined, (m) => logged.push(m), "ggml-base.en.bin")).toBe(
      join(models, "ggml-base.en.bin"),
    );
    // The environment still wins over it.
    expect(findAsrModel(models, DEFAULT_ASR_MODEL, () => {}, "ggml-base.en.bin")).toBe(
      join(models, DEFAULT_ASR_MODEL),
    );
    expect(findAsrModel(models, undefined, (m) => logged.push(m), "ggml-gone.bin")).toBe(
      join(models, DEFAULT_ASR_MODEL),
    );
    expect(logged).toEqual([expect.stringContaining("ggml-gone.bin, isn't in")]);
    // A saved value that isn't a Whisper file is ignored too.
    writeFileSync(join(models, "silero_vad.onnx"), "");
    expect(findAsrModel(models, undefined, () => {}, "silero_vad.onnx")).toBe(
      join(models, DEFAULT_ASR_MODEL),
    );
  });

  test("a model asked for by name has to exist", () => {
    const models = modelsWith("ggml-base.en.bin");
    expect(() => findAsrModel(models, "ggml-small.en-q5_1.bin", () => {})).toThrow("not found");
    expect(findAsrModel(models, "ggml-base.en.bin", () => {})).toBe(
      join(models, "ggml-base.en.bin"),
    );
  });
});

describe("readCleanupRules", () => {
  test("reads the user's file, warns about a heading it won't use, and is quiet when there's none", () => {
    const home = mkdtempSync(join(tmpdir(), "mb-rules-"));
    const logs: string[] = [];
    expect(readCleanupRules(home, (m) => logs.push(m))).toBeUndefined();
    expect(logs).toEqual([]);

    writeFileSync(join(home, "cleanup.md"), "## Rules\nBe brief.\n## List\nTypo.\n");
    expect(readCleanupRules(home, (m) => logs.push(m))).toContain("Be brief.");
    expect(logs[0]).toContain('"## List"');
    expect(logs[1]).toContain("cleanup rules: yours from");
  });
});

describe("dictationLanguage", () => {
  test("English unless MOCKINGBIRD_LANGUAGE names a language, or auto", () => {
    expect(dictationLanguage({})).toBe("en");
    expect(dictationLanguage({ MOCKINGBIRD_LANGUAGE: " DE " })).toBe("de");
    expect(dictationLanguage({ MOCKINGBIRD_LANGUAGE: "auto" })).toBe("auto");
  });

  test("a word that isn't a code falls back to English, with a warning", () => {
    const logged: string[] = [];
    for (const wrong of ["german", "xx", "Deutsch!"])
      expect(dictationLanguage({ MOCKINGBIRD_LANGUAGE: wrong }, (m) => logged.push(m))).toBe("en");
    expect(logged).toHaveLength(3);
    expect(logged[0]).toContain("MOCKINGBIRD_LANGUAGE=german");
  });
});

test("englishOnly knows the .en Whisper builds", () => {
  expect(englishOnly("/m/ggml-base.en.bin")).toBe(true);
  expect(englishOnly("ggml-small.en-q5_1.bin")).toBe(true);
  expect(englishOnly("ggml-large-v3-turbo-q5_0.bin")).toBe(false);
});
