import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "@mockingbird/store";
import {
  CorrectionWatcher,
  findCorrections,
  learnFrom,
  ordinaryWords,
  shouldLearn,
  type Typed,
} from "../src/learn.ts";

/** A dictation typed into a field that held `before` and `after` around it. */
const typed = (before: string, inserted: string, after = ""): Typed => ({
  pid: 1,
  start: before.length,
  before,
  inserted,
  after,
});
const field = (text: string) => ({ text, from: 0 });

describe("findCorrections", () => {
  test("finds a misheard name the user fixed", () => {
    const t = typed("Notes. ", "Ask near jar about the release.");
    expect(findCorrections(t, field("Notes. Ask Nirjhar about the release."))).toEqual([
      { from: "near jar", to: "Nirjhar" },
    ]);
  });

  test("finds one fixed as the last word, at the end of the field", () => {
    const t = typed("", "The theme is cat puck in");
    expect(findCorrections(t, field("The theme is Catppuccin"))).toEqual([
      { from: "cat puck in", to: "Catppuccin" },
    ]);
  });

  test("finds it after the text above it moved", () => {
    const t = { ...typed("Hi. ", "Ask near jar today."), start: 40 };
    const now = { text: `${"x".repeat(50)} Hi. Ask Nirjhar today.`, from: 0 };
    expect(findCorrections({ ...t, before: "Hi. " }, now)).toEqual([
      { from: "near jar", to: "Nirjhar" },
    ]);
  });

  test("drops the user changing their mind: the words don't sound alike", () => {
    const t = typed("", "See you on Tuesday.");
    expect(findCorrections(t, field("See you on Wednesday."))).toEqual([]);
  });

  test("drops a rewritten sentence", () => {
    const t = typed("", "Ask near jar about the release.");
    expect(findCorrections(t, field("Nirjhar, can we ship tomorrow?"))).toEqual([]);
  });

  test("drops edits outside the dictation and words added to it", () => {
    const t = typed("Dear tim, ", "thanks for the notes.", " Best");
    expect(findCorrections(t, field("Dear Tim, thanks for all the notes. Best"))).toEqual([]);
  });

  test("learns from a dictation that was only the name", () => {
    const t = typed("Thanks, ", "near jar", "");
    expect(findCorrections(t, field("Thanks, Nirjhar"))).toEqual([
      { from: "near jar", to: "Nirjhar" },
    ]);
  });

  test("drops a change it can't bound: what was read stops before the text after it", () => {
    const t = typed("Hi ", "near jar", " and the rest");
    expect(findCorrections(t, field("Hi Nirjhar an"))).toEqual([]);
  });

  test("drops a dictation that's gone", () => {
    expect(findCorrections(typed("", "Ask near jar."), field(""))).toEqual([]);
  });
});

describe("shouldLearn", () => {
  test("learns a capitalised fix at once, anything else the second time", () => {
    expect(shouldLearn({ from: "near jar", to: "Nirjhar" }, 1)).toBe(true);
    expect(shouldLearn({ from: "cooper netties", to: "kubernetes" }, 1)).toBe(false);
    expect(shouldLearn({ from: "cooper netties", to: "kubernetes" }, 2)).toBe(true);
    // Capitalised on both sides is the start of a sentence, not a name.
    expect(shouldLearn({ from: "Their", to: "There" }, 1)).toBe(false);
  });
});

describe("ordinaryWords", () => {
  const list = join(mkdtempSync(join(tmpdir(), "mockingbird-words-")), "words");
  writeFileSync(list, "a\ngreat\ngrate\nmark\n");

  test("knows ordinary words, in any case, and not names", () => {
    expect(ordinaryWords("grate", list)).toBe(true);
    expect(ordinaryWords("Mark", list)).toBe(true);
    expect(ordinaryWords("Nirjhar", list)).toBe(false);
    expect(ordinaryWords("great Nirjhar", list)).toBe(false);
  });

  test("treats every word as ordinary without a word list, so nothing is learned", () => {
    expect(ordinaryWords("Nirjhar", join(list, "missing"))).toBe(true);
  });
});

describe("learnFrom", () => {
  const store = () => openStore(join(mkdtempSync(join(tmpdir(), "mockingbird-learn-")), "data.db"));
  const never = () => false;

  test("learns a name, keeps counting, and says so only once", () => {
    const s = store();
    expect(learnFrom(s, [{ from: "near jar", to: "Nirjhar" }], never)).toEqual(["Nirjhar"]);
    expect(learnFrom(s, [{ from: "Near Jar", to: "Nirjhar" }], never)).toEqual([]);
    expect(s.dictionary()).toEqual([{ term: "Nirjhar", learned: true }]);
    expect(s.recordCorrection("near jar", "Nirjhar")).toBe(3);
  });

  test("waits for the second sighting of a lowercase fix", () => {
    const s = store();
    const fix = { from: "cooper netties", to: "kubernetes" };
    expect(learnFrom(s, [fix], never)).toEqual([]);
    expect(learnFrom(s, [fix], never)).toEqual(["kubernetes"]);
  });

  test("never learns an ordinary word, or marks the user's own word learned", () => {
    const s = store();
    expect(learnFrom(s, [{ from: "great", to: "Grate" }], () => true)).toEqual([]);
    s.addTerms([{ term: "Nirjhar" }]);
    expect(learnFrom(s, [{ from: "near jar", to: "Nirjhar" }], never)).toEqual([]);
    expect(s.dictionary()).toEqual([{ term: "Nirjhar" }]);
  });
});

describe("CorrectionWatcher", () => {
  test("checks once input has gone quiet, and only after input", async () => {
    const checked: Typed[] = [];
    const watcher = new CorrectionWatcher((t) => checked.push(t), 20);
    const t = typed("", "Ask near jar.");
    watcher.typed(t);
    await Bun.sleep(40);
    expect(checked).toEqual([]);
    watcher.input();
    await Bun.sleep(10);
    watcher.input();
    await Bun.sleep(10);
    expect(checked).toEqual([]);
    await Bun.sleep(30);
    expect(checked).toEqual([t]);
    watcher.input();
    await Bun.sleep(40);
    expect(checked).toEqual([t]);
  });

  test("checks the last dictation when the next one starts", () => {
    const checked: Typed[] = [];
    const watcher = new CorrectionWatcher((t) => checked.push(t), 1_000);
    const first = typed("", "one");
    watcher.typed(first);
    watcher.input();
    watcher.flush();
    expect(checked).toEqual([first]);
    watcher.stop();
  });
});
