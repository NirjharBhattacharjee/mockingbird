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
  test("stops at a symbol a cleanup doesn't add, even stuck to a word", () => {
    expect(verifiedPrefix("git status then git push", "git status && git push ")).toBe(
      "git status",
    );
    expect(verifiedPrefix("hello world, how are you", "hello&& world, how ")).toBe("");
    expect(verifiedPrefix("hello world, how are you", "Hello world, how ")).toBe(
      "Hello world, how",
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
  test("starts after the last word typed, wherever the typed text began", () => {
    expect(rawRemainder("um so basically the build is green now", "The build is")).toBe(
      "green now",
    );
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

/** A server that sends its reply in the given pieces, as a network might. */
function serve(chunks: string[]) {
  return Bun.serve({
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
}

async function collect(chunks: string[]) {
  const server = serve(chunks);
  try {
    const llm = new OllamaProvider(`http://127.0.0.1:${server.port}`, "m");
    const pieces: string[] = [];
    for await (const piece of llm.stream({ system: "", user: "" })) pieces.push(piece);
    return pieces.join("");
  } finally {
    server.stop(true);
  }
}

describe("OllamaProvider.stream", () => {
  test("reads replies split mid-line, and a last one with no newline", async () => {
    const body = '{"message":{"content":"Hello"}}\n{"message":{"content":" there"}}\n{"done":true}';
    expect(await collect([body.slice(0, 20), body.slice(20, 45), body.slice(45)])).toBe(
      "Hello there",
    );
  });
  test("fails a reply cut off before the model finished", async () => {
    await expect(collect(['{"message":{"content":"Hel"}}\n'])).rejects.toThrow("ended before");
  });
  test("passes on an error Ollama reports mid-reply", async () => {
    await expect(
      collect(['{"message":{"content":"Hi"}}\n{"error":"model crashed"}\n']),
    ).rejects.toThrow("model crashed");
  });
});
