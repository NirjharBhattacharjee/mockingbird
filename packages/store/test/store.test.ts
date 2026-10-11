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
});
