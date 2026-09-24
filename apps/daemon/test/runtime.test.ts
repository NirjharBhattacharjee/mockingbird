import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_ASR_MODEL, findAsrModel } from "../src/runtime.ts";

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
    expect(logged[0]).toContain("install.sh");
  });

  test("no model at all still fails with the setup hint", () => {
    expect(() => findAsrModel(modelsWith(), undefined, () => {})).toThrow("install.sh");
  });

  test("a model asked for by name has to exist", () => {
    const models = modelsWith("ggml-base.en.bin");
    expect(() => findAsrModel(models, "ggml-small.en-q5_1.bin", () => {})).toThrow("not found");
    expect(findAsrModel(models, "ggml-base.en.bin", () => {})).toBe(
      join(models, "ggml-base.en.bin"),
    );
  });
});
