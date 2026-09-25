import { describe, expect, test } from "bun:test";
import {
  applyCorrections,
  buildVocabularyPrompt,
  correctNames,
  parseDictionary,
} from "../src/index.ts";

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

  test("writes a term literally, even with $ in it", () => {
    const money = parseDictionary("dollar amp => $&\ntwo dollars => $$1");
    expect(applyCorrections("say dollar amp and two dollars", money)).toBe("say $& and $$1");
  });

  test("ignores case but keeps word boundaries", () => {
    expect(applyCorrections("CAT PUCK is nice", dictionary)).toBe("Catppuccin is nice");
    expect(applyCorrections("the cat pucker", dictionary)).toBe("the cat pucker");
  });

  test("leaves text alone without corrections", () => {
    expect(applyCorrections("Hello there.", [{ term: "Ollama" }])).toBe("Hello there.");
  });
});

describe("correctNames", () => {
  const dictionary = parseDictionary(
    "Nirjhar Bhattacharjee\nXiaoming Zhao\nAishwarya Venkatesan\nCatppuccin\nMockingbird\nSiddharth Mukherjee",
  );

  test("fixes a name Whisper spelled by ear", () => {
    // Every one of these came out of whisper-server in this repo's benchmarks.
    expect(correctNames("I spoke with Nurj Harbada Charjee today.", dictionary)).toBe(
      "I spoke with Nirjhar Bhattacharjee today.",
    );
    expect(correctNames("my name is Nerj Herbata Chargy", dictionary)).toBe(
      "my name is Nirjhar Bhattacharjee",
    );
    expect(correctNames("Aishwarya Venkatasan is here", dictionary)).toBe(
      "Aishwarya Venkatesan is here",
    );
    expect(correctNames("and Zaya Mingjiao replied", dictionary)).toBe("and Xiaoming Zhao replied");
  });

  test("joins up a name heard as several words", () => {
    expect(correctNames("Mocking bird is the app", dictionary)).toBe("Mockingbird is the app");
    // The name is restored; a leftover filler word can survive next to it.
    expect(correctNames("with cat pucks in theming", dictionary)).toBe(
      "with Catppuccin in theming",
    );
  });

  test("keeps the punctuation that followed the name", () => {
    expect(correctNames("Hello Nurj Harbada Charjee, how are you?", dictionary)).toBe(
      "Hello Nirjhar Bhattacharjee, how are you?",
    );
  });

  test("doesn't swallow the words around a name", () => {
    expect(correctNames("and Siddharth Mukherjee today", dictionary)).toBe(
      "and Siddharth Mukherjee today",
    );
  });

  test("leaves ordinary words that merely rhyme alone", () => {
    for (const sentence of [
      "The llama and the cat sat on a mat.",
      "We can categorise the puck later.",
      "I met Richard yesterday and we ate pasta.",
      "Send it to Sid and Ash tomorrow.",
    ]) {
      expect(correctNames(sentence, dictionary)).toBe(sentence);
    }
  });

  test("does nothing without a dictionary", () => {
    expect(correctNames("Nurj Harbada Charjee", [])).toBe("Nurj Harbada Charjee");
  });
});
