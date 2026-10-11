import { describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "@mockingbird/store";
import {
  formatEntry,
  importDictionaryFile,
  main,
  openDaemonStore,
  readDictionary,
  recordUses,
  serveDictionary,
} from "../src/dictionary.ts";

const newHome = () => mkdtempSync(join(tmpdir(), "mb-"));
const quiet = () => {};

describe("importDictionaryFile", () => {
  test("moves dictionary.txt into the store once, and renames the file", () => {
    const home = newHome();
    writeFileSync(join(home, "dictionary.txt"), "# a comment\nCatppuccin (a colour theme)\n");
    const logged: string[] = [];
    const store = openDaemonStore(home, (m) => logged.push(m));
    if (!store) throw new Error("no store");
    expect(store.dictionary()).toEqual([{ term: "Catppuccin", hint: "a colour theme" }]);
    expect(existsSync(join(home, "dictionary.txt"))).toBe(false);
    expect(existsSync(join(home, "dictionary.txt.imported"))).toBe(true);
    expect(logged[0]).toContain("moved 1 dictionary words");

    // Nothing left to import on the next start.
    importDictionaryFile(store, home, (m) => logged.push(m));
    expect(logged).toHaveLength(1);
    store.close();
  });
});

test("openDaemonStore keeps data.db when dictionary.txt can't be imported", () => {
  const home = newHome();
  const seeded = openStore(join(home, "data.db"));
  seeded.addTerms([{ term: "Kept" }]);
  seeded.close();
  // A directory where the file should be: reading it fails.
  mkdirSync(join(home, "dictionary.txt"));
  const logged: string[] = [];
  const store = openDaemonStore(home, (m) => logged.push(m));
  expect(store?.dictionary()).toEqual([{ term: "Kept" }]);
  expect(logged[0]).toContain("couldn't import dictionary.txt");
  store?.close();
});

describe("recordUses", () => {
  test("counts a term only when the text says it as a whole word", () => {
    const home = newHome();
    const store = openStore(join(home, "data.db"));
    store.addTerms([{ term: "Ash" }, { term: "Kubernetes" }]);
    recordUses(store, store.dictionary(), "Deploy to kubernetes, then wash up.");
    expect(store.dictionary()[0]?.term).toBe("Kubernetes");
    store.close();
  });
});

describe("mockingbird dictionary", () => {
  test("adds and removes through the running daemon, and lists from data.db", async () => {
    const home = newHome();
    const store = openStore(join(home, "data.db"));
    let current = store.dictionary();
    const server = await serveDictionary(store, (d) => (current = d), quiet, home);
    const out: string[] = [];
    const log = spyOn(console, "log").mockImplementation((m) => out.push(String(m)));
    try {
      expect(await main(["add", "cat", "puck", "=>", "Catppuccin"], home)).toBe(0);
      expect(current).toEqual([{ term: "Catppuccin", heard: "cat puck" }]);
      expect(await main(["list"], home)).toBe(0);
      expect(out.at(-1)).toBe("cat puck => Catppuccin");
      expect(await main(["remove", "catppuccin"], home)).toBe(0);
      expect(current).toEqual([]);
      expect(readDictionary(home)).toEqual([]);
    } finally {
      log.mockRestore();
      server?.stop();
      store.close();
    }
  });

  test("says the daemon isn't running instead of writing data.db itself", async () => {
    const home = newHome();
    const err = spyOn(console, "error").mockImplementation(quiet);
    try {
      expect(await main(["add", "Nirjhar"], home)).toBe(1);
      expect(String(err.mock.calls[0]?.[0])).toContain("isn't running");
      expect(existsSync(join(home, "data.db"))).toBe(false);
    } finally {
      err.mockRestore();
    }
  });

  test("a socket it can't create is logged, not thrown, and the umask is put back", async () => {
    const home = join(newHome(), "missing");
    const store = openStore(":memory:");
    const before = process.umask();
    const logged: string[] = [];
    expect(await serveDictionary(store, quiet, (m) => logged.push(m), home)).toBeUndefined();
    expect(logged[0]).toContain("couldn't listen for dictionary edits");
    expect(process.umask()).toBe(before);
    store.close();
  });

  test("a second mockingbird leaves the edits to the first", async () => {
    const home = newHome();
    const store = openStore(join(home, "data.db"));
    const first = await serveDictionary(store, quiet, quiet, home);
    const logged: string[] = [];
    expect(await serveDictionary(store, quiet, (m) => logged.push(m), home)).toBeUndefined();
    expect(logged[0]).toContain("another mockingbird");
    first?.stop();
    store.close();
  });
});

test("formatEntry writes an entry the way `add` reads it", () => {
  expect(formatEntry({ term: "Catppuccin", heard: "cat puck", hint: "a theme" })).toBe(
    "cat puck => Catppuccin (a theme)",
  );
});
