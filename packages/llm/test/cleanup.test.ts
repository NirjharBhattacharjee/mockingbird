import { describe, expect, test } from "bun:test";
import {
  acceptCleanup,
  buildCleanupPrompt,
  formatText,
  looksClean,
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
