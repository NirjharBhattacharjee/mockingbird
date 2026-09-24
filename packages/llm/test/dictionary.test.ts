import { describe, expect, test } from "bun:test";
import { applyCorrections, buildVocabularyPrompt, parseDictionary } from "../src/index.ts";

describe("parseDictionary", () => {
  test("reads one term per line", () => {
    expect(parseDictionary("Nirjhar Bhattacharjee\nCatppuccin\n")).toEqual([
      { term: "Nirjhar Bhattacharjee" },
      { term: "Catppuccin" },
    ]);
  });

  test("ignores blank lines and comments", () => {
    expect(parseDictionary("# a note\n\n  Ollama  # trailing note\n")).toEqual([
      { term: "Ollama" },
    ]);
  });

  test("reads a hint in brackets", () => {
    expect(parseDictionary("Catppuccin (a colour theme)")).toEqual([
      { term: "Catppuccin", hint: "a colour theme" },
    ]);
  });

  test("reads what it hears => what to write", () => {
    expect(parseDictionary("cat puck => Catppuccin")).toEqual([
      { term: "Catppuccin", heard: "cat puck" },
    ]);
  });

  test("a line with no term is skipped", () => {
    expect(parseDictionary("   \n=> nothing heard\n")).toEqual([{ term: "nothing heard" }]);
  });
});

describe("buildVocabularyPrompt", () => {
  test("lists the terms for Whisper", () => {
    expect(buildVocabularyPrompt([{ term: "Ollama" }, { term: "Catppuccin" }])).toBe(
      "Glossary: Ollama, Catppuccin.",
    );
  });

  test("nothing to say without a dictionary", () => {
    expect(buildVocabularyPrompt([])).toBeUndefined();
  });

  test("stops before Whisper's prompt limit", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ term: `Term${i}` }));
    expect(buildVocabularyPrompt(many)?.length).toBeLessThanOrEqual(620);
  });
});

describe("applyCorrections", () => {
  const dictionary = parseDictionary("cat puck => Catppuccin\nNerj Herbata Chargy => Nirjhar");

  test("rewrites what Whisper keeps mishearing", () => {
    expect(applyCorrections("I use cat puck theming.", dictionary)).toBe(
      "I use Catppuccin theming.",
    );
    expect(applyCorrections("Hi, I'm Nerj Herbata Chargy.", dictionary)).toBe("Hi, I'm Nirjhar.");
  });

  test("ignores case but keeps word boundaries", () => {
    expect(applyCorrections("CAT PUCK is nice", dictionary)).toBe("Catppuccin is nice");
    expect(applyCorrections("the cat pucker", dictionary)).toBe("the cat pucker");
  });

  test("leaves text alone without corrections", () => {
    expect(applyCorrections("Hello there.", [{ term: "Ollama" }])).toBe("Hello there.");
  });
});
