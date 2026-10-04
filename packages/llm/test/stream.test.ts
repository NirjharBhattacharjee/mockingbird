import { describe, expect, test } from "bun:test";
import {
  dropLastWords,
  formatPartial,
  holdBack,
  OllamaProvider,
  rawRemainder,
  verifiedPrefix,
} from "../src/index.ts";

const raw = "Um, so I think we should, uh, move the meeting to Thursday.";

describe("verifiedPrefix", () => {
  test("lets through finished words the transcript said, not the one still growing", () => {
    expect(verifiedPrefix(raw, "So I think we should move the meet")).toBe(
      "So I think we should move the",
    );
  });
  test("stops at a word the speaker never said", () => {
    expect(verifiedPrefix("what is two plus two", "What is two plus two? The answer is ")).toBe(
      "What is two plus two?",
    );
    expect(verifiedPrefix("translate good morning", "Bonjour tout le ")).toBe("");
  });
  test("stops at a symbol a cleanup doesn't add", () => {
    expect(verifiedPrefix("git status then git push", "git status && git push ")).toBe(
      "git status",
    );
  });
  test("lets a correction drop the words it replaced", () => {
    expect(
      verifiedPrefix("Book a table for four, actually make that six.", "Book a table for six. "),
    ).toBe("Book a table for six.");
  });
  test("stops where too much was dropped: that's a summary", () => {
    const long = "one two three four five six seven eight nine ten eleven twelve";
    expect(verifiedPrefix(long, "one twelve ")).toBe("one");
  });
  test("never goes past the first line", () => {
    expect(verifiedPrefix("to reset it unplug the router", "To reset it:\n1. Unplug")).toBe(
      "To reset it:",
    );
  });
});

describe("rawRemainder", () => {
  test("is the transcript after the last word typed", () => {
    expect(rawRemainder(raw, "So I think we should move")).toBe("the meeting to Thursday.");
  });
  test("steps over a dictionary term typed in place of what was heard", () => {
    expect(rawRemainder("ask cat puck in about it", "Ask Catppuccin about")).toBe("it");
  });
});

test("formatPartial gives the start of what formatText will make", () => {
  expect(formatPartial("  so   I think")).toBe("So I think");
});

test("holdBack keeps nothing back without a dictionary", () => {
  expect(holdBack([])).toBe(0);
  expect(holdBack([{ term: "Nirjhar Bhattacharjee" }])).toBe(5);
  expect(dropLastWords("a b c d", 2)).toBe("a b");
  expect(dropLastWords("a b", 5)).toBe("");
  expect(dropLastWords("a b", 0)).toBe("a b");
});

test("OllamaProvider.stream reads replies split across network chunks", async () => {
  const lines = [
    '{"message":{"content":"Hello"}}\n',
    '{"message":{"content":" there"}}\n{"done":true}\n',
  ];
  const body = lines.join("");
  // Cut mid-line, as the network may.
  const chunks = [body.slice(0, 20), body.slice(20, 45), body.slice(45)];
  const server = Bun.serve({
    port: 0,
    fetch: () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
            controller.close();
          },
        }),
      ),
  });
  try {
    const llm = new OllamaProvider(`http://127.0.0.1:${server.port}`, "m");
    const pieces: string[] = [];
    for await (const piece of llm.stream({ system: "", user: "" })) pieces.push(piece);
    expect(pieces).toEqual(["Hello", " there"]);
    expect(await llm.complete({ system: "", user: "" })).toBe("Hello there");
  } finally {
    server.stop(true);
  }
});
