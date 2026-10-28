import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../src/index.ts";

const dbPath = () => join(mkdtempSync(join(tmpdir(), "mockingbird-store-")), "data.db");

describe("dictionary", () => {
  test("adds, updates without losing a note, and treats case as the same term", () => {
    const store = openStore(dbPath());
    store.addTerms([{ term: "Catppuccin", hint: "a colour theme" }]);
    store.addTerms([{ term: "catppuccin", heard: "cat puck" }]);
    expect(store.dictionary()).toEqual([
      { term: "catppuccin", heard: "cat puck", hint: "a colour theme" },
    ]);
    store.close();
  });

  test("table gives every column, most used first, empty ones null", () => {
    const store = openStore(dbPath());
    const before = Date.now();
    store.addTerms([{ term: "Catppuccin", heard: "cat puck", hint: "a colour theme" }]);
    store.addTerms([{ term: "Ollama" }], { learned: true });
    store.countUses(["ollama", "ollama"]);
    const [first, second] = store.table();
    expect(first).toMatchObject({
      term: "Ollama",
      heard: null,
      hint: null,
      uses: 2,
      learned: true,
    });
    expect(second).toMatchObject({
      term: "Catppuccin",
      heard: "cat puck",
      hint: "a colour theme",
      uses: 0,
      learned: false,
    });
    expect(second?.createdAt).toBeGreaterThanOrEqual(before);
    store.close();
  });

  test("lists the most used first", () => {
    const store = openStore(dbPath());
    store.addTerms([{ term: "Alpha" }, { term: "Beta" }]);
    store.countUses(["beta"]);
    expect(store.dictionary().map((e) => e.term)).toEqual(["Beta", "Alpha"]);
    store.close();
  });

  test("removes, ignoring case, and says whether it was there", () => {
    const store = openStore(dbPath());
    store.addTerms([{ term: "Nirjhar" }]);
    expect(store.removeTerm("NIRJHAR")).toBe(true);
    expect(store.removeTerm("Nirjhar")).toBe(false);
    expect(store.dictionary()).toEqual([]);
    store.close();
  });

  test("reopening keeps the data and doesn't rerun the migration", () => {
    const path = dbPath();
    const store = openStore(path);
    store.addTerms([{ term: "Kept" }]);
    store.close();
    const again = openStore(path);
    expect(again.dictionary()).toEqual([{ term: "Kept" }]);
    again.close();
  });

  test("a read-only store reads what the writer wrote and can't write", () => {
    const path = dbPath();
    const writer = openStore(path);
    writer.addTerms([{ term: "Shared" }]);
    const reader = openStore(path, { readonly: true });
    expect(reader.dictionary()).toEqual([{ term: "Shared" }]);
    expect(() => reader.addTerms([{ term: "Nope" }])).toThrow();
    reader.close();
    writer.close();
  });

  test("counts corrections, and forgets everything learned but the user's own words", () => {
    const store = openStore(dbPath());
    expect(store.recordCorrection("near jar", "Nirjhar")).toBe(1);
    expect(store.recordCorrection("near jar", "Nirjhar")).toBe(2);
    store.addTerms([{ term: "Nirjhar" }], { learned: true });
    store.addTerms([{ term: "Ollama" }]);
    store.addTerms([{ term: "Ollama" }], { learned: true });
    expect(store.dictionary()).toEqual([{ term: "Nirjhar", learned: true }, { term: "Ollama" }]);
    expect(store.forgetLearned()).toBe(1);
    expect(store.dictionary()).toEqual([{ term: "Ollama" }]);
    expect(store.recordCorrection("near jar", "Nirjhar")).toBe(1);
  });

  test("removing a word drops its corrections, so it isn't learned straight back", () => {
    const store = openStore(dbPath());
    store.recordCorrection("near jar", "Nirjhar");
    store.addTerms([{ term: "Nirjhar" }], { learned: true });
    store.addTerms([{ term: "Nirjhar" }]);
    expect(store.dictionary()).toEqual([{ term: "Nirjhar" }]);
    store.removeTerm("nirjhar");
    expect(store.recordCorrection("near jar", "Nirjhar")).toBe(1);
  });

  test("upgrades a data.db made before learning", () => {
    const path = dbPath();
    const { Database } = require("bun:sqlite");
    const old = new Database(path);
    old.run(`CREATE TABLE dictionary (term TEXT PRIMARY KEY COLLATE NOCASE, heard TEXT, hint TEXT,
      uses INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    old.run("INSERT INTO dictionary (term, created_at, updated_at) VALUES ('Bun', 0, 0)");
    old.run("PRAGMA user_version = 1");
    old.close();
    const store = openStore(path);
    expect(store.dictionary()).toEqual([{ term: "Bun" }]);
    expect(store.recordCorrection("bun", "Bun")).toBe(1);
  });
});

describe("settings", () => {
  test("sets, replaces and deletes, and a reader sees the writer's value", () => {
    const path = dbPath();
    const store = openStore(path);
    expect(store.setting("llm_model")).toBeUndefined();
    store.setSetting("llm_model", "qwen2.5:1.5b");
    store.setSetting("llm_model", "gemma3:1b");
    const reader = openStore(path, { readonly: true });
    expect(reader.setting("llm_model")).toBe("gemma3:1b");
    store.setSetting("llm_model", undefined);
    expect(reader.setting("llm_model")).toBeUndefined();
  });
});

describe("calibration", () => {
  const take = (sentence: number, edits: number, run = 1) => ({
    run,
    sentence,
    text: "one two three four",
    heard: "one two three four",
    edits,
    words: 4,
    model: "large-v3-turbo",
  });

  test("totals each run, newest first, and a sentence read again replaces the first take", () => {
    const store = openStore(dbPath());
    store.saveTake(take(0, 2));
    store.saveTake(take(0, 0)); // read again
    store.saveTake(take(1, 1));
    store.saveTake(take(0, 4, 2));
    expect(store.calibrationRuns()).toEqual([
      { run: 2, model: "large-v3-turbo", edits: 4, words: 4, takes: 1 },
      { run: 1, model: "large-v3-turbo", edits: 1, words: 8, takes: 2 },
    ]);
    expect(store.takes(1).map((t) => [t.sentence, t.edits])).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(store.forgetCalibration()).toBe(3);
    expect(store.calibrationRuns()).toEqual([]);
    store.close();
  });
});
