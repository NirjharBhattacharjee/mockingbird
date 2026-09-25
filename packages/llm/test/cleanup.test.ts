import { describe, expect, test } from "bun:test";
import {
  acceptCleanup,
  buildCleanupPrompt,
  bulletize,
  formatText,
  looksClean,
  looksLikeList,
  shouldSkipLlm,
} from "../src/index.ts";

describe("shouldSkipLlm", () => {
  test("skips short, confident utterances", () => {
    expect(shouldSkipLlm({ text: "Yes please.", confidence: 0.95 })).toBe(true);
  });
  test("does not skip short but uncertain utterances", () => {
    expect(shouldSkipLlm({ text: "Yes please.", confidence: 0.5 })).toBe(false);
  });
  test("skips a long utterance that already reads cleanly", () => {
    expect(
      shouldSkipLlm({ text: "Let's move the meeting to Thursday morning.", confidence: 0.92 }),
    ).toBe(true);
  });

  test("does not skip one with filler or a stutter, however confident", () => {
    expect(shouldSkipLlm({ text: "um so I think we should ship it", confidence: 0.99 })).toBe(
      false,
    );
    expect(shouldSkipLlm({ text: "I I think we should ship it", confidence: 0.99 })).toBe(false);
    expect(shouldSkipLlm({ text: "you know we could just ship it today", confidence: 0.99 })).toBe(
      false,
    );
  });

  test("does not skip a clean-looking utterance Whisper wasn't sure about", () => {
    expect(
      shouldSkipLlm({ text: "Let's move the meeting to Thursday morning.", confidence: 0.6 }),
    ).toBe(false);
  });

  test("does not skip long utterances", () => {
    expect(
      shouldSkipLlm(
        { text: "this sentence has more than four words", confidence: 0.99 },
        { minCleanConfidence: 1.1 },
      ),
    ).toBe(false);
  });
});

describe("acceptCleanup", () => {
  const raw = "Umm, so hello world, this is a test of the Mockingbird dictation pipeline.";
  test("accepts a filler-removal cleanup", () => {
    expect(
      acceptCleanup(raw, "So hello world, this is a test of the Mockingbird dictation pipeline."),
    ).toBe(true);
  });
  test("rejects an answer instead of a cleanup", () => {
    expect(acceptCleanup("what is the capital of france", "Paris.")).toBe(false);
  });
  test("rejects a runaway expansion", () => {
    expect(acceptCleanup("hello", "Hello! How can I help you with your dictation today?")).toBe(
      false,
    );
  });
  test("rejects empty output and leaked tags", () => {
    expect(acceptCleanup(raw, "")).toBe(false);
    expect(acceptCleanup("hi there", "<transcript>Hi there</transcript>")).toBe(false);
  });
});

describe("buildCleanupPrompt", () => {
  test("wraps the transcript and includes dictionary terms and terminal rules", () => {
    const prompt = buildCleanupPrompt({
      text: "run bun test",
      dictionary: [{ term: "Nirjhar", hint: "a name" }, { term: "Bun" }],
      style: "terminal",
    });
    expect(prompt.user).toBe("<transcript>run bun test</transcript>");
    expect(prompt.system).toContain("Nirjhar (a name), Bun");
    expect(prompt.system).toContain("terminal");
  });
});

describe("acceptCleanup on long text", () => {
  const long = `${"I went to the shop and bought some bread and milk and then walked home. ".repeat(3)}`;

  test("keeps a cleanup that stays about the same length", () => {
    expect(acceptCleanup(long, long.replace("and then", "then"))).toBe(true);
  });

  test("rejects one that dropped sentences", () => {
    expect(acceptCleanup(long, "I went to the shop and walked home.")).toBe(false);
  });

  test("a short utterance may still lose half its length", () => {
    expect(acceptCleanup("um, yes", "Yes.")).toBe(true);
  });
});

describe("lists", () => {
  test("list-like speech never skips the cleanup model", () => {
    expect(
      shouldSkipLlm({
        text: "I am going for grocery. I will get onions. I will buy toilet paper.",
        confidence: 0.99,
      }),
    ).toBe(false);
    expect(
      looksLikeList("I need to fix the bug. I have to call the bank. I also want to run."),
    ).toBe(true);
    expect(looksLikeList("We need milk, bread, rice and onions.")).toBe(true);
  });

  test("a sequence of steps never skips the cleanup model", () => {
    for (const text of [
      "To make tea, first boil the water, then add the tea bag, and finally add milk.",
      "Number one, fix the login bug. Number two, update the docs.",
      "Step one, unplug it. Step two, wait. Step three, plug it back in.",
      "Firstly we test it, secondly we ship it, lastly we announce it.",
    ]) {
      expect(looksLikeList(text)).toBe(true);
    }
  });

  test("a numbered list is accepted and kept line by line", () => {
    const raw =
      "To make tea, first boil the water, then put the tea bag in the cup, then pour the water, and finally add milk.";
    const list =
      "To make tea:\n1. Boil the water\n2. Put the tea bag in the cup\n3. Pour the water\n4. Add milk";
    expect(acceptCleanup(raw, list)).toBe(true);
    expect(formatText(list)).toBe(list);
  });

  test("a list of fewer than three items falls back to the transcript", () => {
    // What qwen3 did to a sentence with one "first" in it: half of it went.
    expect(
      acceptCleanup(
        "I think we should ship it, but first let's run the tests.",
        "Should we ship it?\n\nTests:\n- Run them first",
      ),
    ).toBe(false);
    expect(
      acceptCleanup("I need to call mom and I need to buy milk.", "Tasks:\n- call mom\n- buy milk"),
    ).toBe(false);
  });

  test("ordinary speech is not a list", () => {
    expect(looksLikeList("I went to the shop today and it was raining, so I came back.")).toBe(
      false,
    );
  });

  test("a cleanup that turns speech into a list may be much shorter", () => {
    const raw = "I am going for grocery. I will get onions. I will buy toilet paper and rice.";
    expect(acceptCleanup(raw, "Groceries:\n- onions\n- toilet paper\n- rice")).toBe(true);
  });

  test("but a list that lost its items is still rejected", () => {
    const raw = "I am going for grocery. I will get onions. I will buy toilet paper and rice.";
    expect(acceptCleanup(raw, "Groceries:\n- onions")).toBe(false);
  });

  test("list lines keep their line breaks and get no full stops", () => {
    expect(formatText("groceries:\n- onions\n- toilet paper")).toBe(
      "Groceries:\n- onions\n- toilet paper",
    );
  });

  test("a terminal never gets line breaks", () => {
    expect(formatText("groceries:\n- onions", "terminal")).toBe("groceries: - onions");
  });
});

describe("bulletize", () => {
  // What qwen3 actually returned for this dictation: one line per item, but
  // "I need to" left on every one of them.
  const cleaned =
    "I need to go to the washroom.\nI need to build this thing.\nI need to eat my breakfast.\nTomorrow I need to run a marathon.\nThen I need to do something.";

  test("turns repeated lead-ins into bullets", () => {
    expect(bulletize(cleaned)).toBe(
      "To do:\n- go to the washroom\n- build this thing\n- eat my breakfast\n- run a marathon tomorrow\n- do something",
    );
  });

  test("leaves a list the model already numbered", () => {
    const list = "Steps:\n1. I need to test it\n2. I need to ship it\n3. I need to announce it";
    expect(bulletize(list)).toBe(list);
  });

  test("leaves a list the model already bulleted", () => {
    const list = "Groceries:\n- onions\n- rice\n- bread";
    expect(bulletize(list)).toBe(list);
  });

  test("leaves prose alone, however many lines", () => {
    for (const text of [
      "One sentence only.",
      "I went to the shop.\nIt was raining.\nI made tea.",
      "I need to go.\nThe weather is nice.\nIt rained all day.",
    ]) {
      expect(bulletize(text)).toBe(text);
    }
  });

  test("needs at least three items", () => {
    const two = "I need to go.\nI need to run.";
    expect(bulletize(two)).toBe(two);
  });
});

describe("formatText", () => {
  test("normalizes whitespace", () => {
    expect(formatText("  Hello   world. ")).toBe("Hello world.");
  });
  test("terminal style drops a trailing period", () => {
    expect(formatText("git status.", "terminal")).toBe("git status");
  });
  test("ends an unfinished sentence with a period", () => {
    expect(formatText("Okay, thanks. Good night")).toBe("Okay, thanks. Good night.");
  });
  test("ends a question with a question mark", () => {
    expect(formatText("how are you doing")).toBe("How are you doing?");
    expect(formatText("Hi how are you doing")).toBe("Hi how are you doing?");
    expect(formatText("so what do you think")).toBe("So what do you think?");
  });
  test("doesn't mistake a statement for a question", () => {
    expect(formatText("I know how it works")).toBe("I know how it works.");
    expect(formatText("Hi there")).toBe("Hi there.");
  });
  test("capitalizes the first letter", () => {
    expect(formatText("and try again.")).toBe("And try again.");
  });
  test("leaves finished sentences alone", () => {
    expect(formatText("Really?")).toBe("Really?");
    expect(formatText('He said "yes."')).toBe('He said "yes."');
    expect(formatText('he said "yes"')).toBe('He said "yes".');
    expect(formatText("see the docs (page 3)")).toBe("See the docs (page 3).");
    expect(formatText("Great!")).toBe("Great!");
  });
  test("terminal style isn't capitalized or punctuated", () => {
    expect(formatText("ls -la", "terminal")).toBe("ls -la");
  });
});

describe("looksClean", () => {
  test("finished text has nothing for the model to remove", () => {
    expect(looksClean("Let's move the meeting to Thursday morning.")).toBe(true);
    expect(looksClean("The file is in packages/llm.")).toBe(true);
  });

  test("filler and stutters need the model", () => {
    expect(looksClean("um yes")).toBe(false);
    expect(looksClean("so uh I think so")).toBe(false);
    expect(looksClean("I mean it's fine")).toBe(false);
    expect(looksClean("the the file")).toBe(false);
  });

  test("a word that merely contains a filler isn't filler", () => {
    expect(looksClean("The album is out.")).toBe(true);
    expect(looksClean("Humming along.")).toBe(true);
  });
});
