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
