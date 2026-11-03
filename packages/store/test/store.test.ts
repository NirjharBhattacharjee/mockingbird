import { Database } from "bun:sqlite";
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

  test("lists alphabetically", () => {
    const store = openStore(dbPath());
    store.addTerms([{ term: "Beta" }, { term: "Alpha" }]);
    expect(store.dictionary().map((e) => e.term)).toEqual(["Alpha", "Beta"]);
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

  test("two connections write the same data.db", () => {
    const path = dbPath();
    const a = openStore(path);
    const b = openStore(path);
    a.addTerms([{ term: "One" }]);
    b.addTerms([{ term: "Two" }]);
    expect(a.dictionary()).toEqual([{ term: "One" }, { term: "Two" }]);
    a.close();
    b.close();
  });

  test("upgrades a dictation-era data.db, keeping its words, learned ones too", () => {
    const path = dbPath();
    const old = new Database(path);
    old.run(`CREATE TABLE dictionary (term TEXT PRIMARY KEY COLLATE NOCASE, heard TEXT, hint TEXT,
      uses INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    old.run("INSERT INTO dictionary (term, created_at, updated_at) VALUES ('Bun', 0, 0)");
    old.run("PRAGMA user_version = 1");
    old.close();
    // Through the dictation migrations, then learn a word the way dictation did.
    const mid = new Database(path);
    mid.run(`CREATE TABLE correction (id INTEGER PRIMARY KEY, from_text TEXT, to_text TEXT)`);
    mid.run("ALTER TABLE dictionary ADD COLUMN learned INTEGER NOT NULL DEFAULT 0");
    mid.run("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    mid.run("CREATE TABLE calibration (run INTEGER)");
    mid.run(
      "INSERT INTO dictionary (term, learned, created_at, updated_at) VALUES ('Ollama', 1, 0, 0)",
    );
    mid.run("INSERT INTO settings VALUES ('asr_model', 'ggml-base.en.bin')");
    mid.run("PRAGMA user_version = 4");
    mid.close();
    const store = openStore(path);
    expect(store.dictionary()).toEqual([{ term: "Bun" }, { term: "Ollama" }]);
    expect(store.setting("asr_model")).toBe("ggml-base.en.bin");
    store.close();
    const tables = new Database(path)
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((t) => t.name);
    expect(tables.sort()).toEqual(["dictionary", "settings"]);
  });

  test("opens again after a dictation-era mockingbird set it back to version 4", () => {
    const path = dbPath();
    openStore(path).close();
    const old = new Database(path);
    old.run("PRAGMA user_version = 4");
    old.close();
    const store = openStore(path);
    store.addTerms([{ term: "Bun" }]);
    expect(store.dictionary()).toEqual([{ term: "Bun" }]);
    store.close();
  });
});

describe("settings", () => {
  test("sets, replaces and deletes", () => {
    const store = openStore(dbPath());
    expect(store.setting("asr_model")).toBeUndefined();
    store.setSetting("asr_model", "a.bin");
    store.setSetting("asr_model", "b.bin");
    expect(store.setting("asr_model")).toBe("b.bin");
    store.setSetting("asr_model", undefined);
    expect(store.setting("asr_model")).toBeUndefined();
  });
});
