import { describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "@mockingbird/store";
import { formatEntry, main, readDictionary, withStore } from "../src/dictionary.ts";

const newHome = () => mkdtempSync(join(tmpdir(), "mb-"));
const quiet = () => {};

describe("dictionary.txt", () => {
  test("moves into the store once, and the file is renamed", () => {
    const home = newHome();
    writeFileSync(join(home, "dictionary.txt"), "# a comment\nCatppuccin (a colour theme)\n");
    const logged: string[] = [];
    const words = withStore(
      (s) => s.dictionary(),
      home,
      (m) => logged.push(m),
    );
    expect(words).toEqual([{ term: "Catppuccin", hint: "a colour theme" }]);
    expect(existsSync(join(home, "dictionary.txt"))).toBe(false);
    expect(existsSync(join(home, "dictionary.txt.imported"))).toBe(true);
    withStore(quiet, home, (m) => logged.push(m));
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("moved 1 dictionary words");
  });

  test("one that can't be imported leaves data.db working", () => {
    const home = newHome();
    const seeded = openStore(join(home, "data.db"));
    seeded.addTerms([{ term: "Kept" }]);
    seeded.close();
    mkdirSync(join(home, "dictionary.txt"));
    const logged: string[] = [];
    expect(
      withStore(
        (s) => s.dictionary(),
        home,
        (m) => logged.push(m),
      ),
    ).toEqual([{ term: "Kept" }]);
    expect(logged[0]).toContain("couldn't import dictionary.txt");
  });
});

describe("mockingbird dictionary", () => {
  test("adds, lists and removes, writing data.db itself", async () => {
    const home = newHome();
    const out = spyOn(console, "log").mockImplementation(quiet);
    const err = spyOn(console, "error").mockImplementation(quiet);
    try {
      expect(await main(["add", "cat puck => Catppuccin (a colour theme)"], home)).toBe(0);
      expect(readDictionary(home)).toEqual([
        { term: "Catppuccin", heard: "cat puck", hint: "a colour theme" },
      ]);
      expect(await main([], home)).toBe(0);
      expect(out).toHaveBeenCalledWith("cat puck => Catppuccin (a colour theme)");
      expect(await main(["remove", "catppuccin"], home)).toBe(0);
      expect(await main(["remove", "catppuccin"], home)).toBe(1);
      expect(await main(["forget"], home)).toBe(2);
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
  });

  test("lists nothing, and creates nothing, without a data.db", () => {
    const home = newHome();
    expect(readDictionary(home)).toEqual([]);
    expect(existsSync(join(home, "data.db"))).toBe(false);
  });
});

test("formatEntry writes what add reads", () => {
  expect(formatEntry({ term: "Catppuccin", heard: "cat puck", hint: "a colour theme" })).toBe(
    "cat puck => Catppuccin (a colour theme)",
  );
});
