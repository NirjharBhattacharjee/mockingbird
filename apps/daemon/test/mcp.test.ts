import { expect, test } from "bun:test";
import { chunks, handle, timedLines } from "../src/mcp.ts";

const echo = {
  name: "echo",
  description: "says it back",
  inputSchema: { type: "object" },
  run: async (a: Record<string, unknown>) => {
    if (a.fail) throw new Error("it failed");
    return String(a.text);
  },
};
const call = (id: number, method: string, params?: object) =>
  handle({ jsonrpc: "2.0", id, method, ...(params && { params }) }, [echo]);

test("answers initialize with the client's protocol version and a tools capability", async () => {
  expect(await call(1, "initialize", { protocolVersion: "2025-03-26" })).toEqual({
    jsonrpc: "2.0",
    id: 1,
    result: {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "mockingbird", version: "1" },
    },
  });
});

test("lists tools without their code, and calls them", async () => {
  expect(await call(2, "tools/list")).toEqual({
    jsonrpc: "2.0",
    id: 2,
    result: {
      tools: [{ name: "echo", description: "says it back", inputSchema: { type: "object" } }],
    },
  });
  expect(await call(3, "tools/call", { name: "echo", arguments: { text: "hi" } })).toEqual({
    jsonrpc: "2.0",
    id: 3,
    result: { content: [{ type: "text", text: "hi" }] },
  });
});

test("a tool's failure is a result marked isError; an unknown tool or method is an error", async () => {
  expect(await call(4, "tools/call", { name: "echo", arguments: { fail: true } })).toMatchObject({
    result: { content: [{ text: "it failed" }], isError: true },
  });
  expect(await call(5, "tools/call", { name: "nope" })).toMatchObject({ error: { code: -32602 } });
  expect(await call(6, "resources/list")).toMatchObject({ error: { code: -32601 } });
});

test("notifications get no reply", async () => {
  expect(
    await handle({ jsonrpc: "2.0", method: "notifications/initialized" }, [echo]),
  ).toBeUndefined();
});

test("chunks speech into pieces no longer than the limit, keeping their place in the file", () => {
  const seg = (start: number, end: number) => ({ startSample: start, endSample: end });
  expect(chunks([seg(0, 10), seg(12, 25), seg(26, 40), seg(100, 105)], 30)).toEqual([
    seg(0, 25),
    seg(26, 40),
    seg(100, 105),
  ]);
  // One segment longer than the limit stays whole: Whisper takes it in windows.
  expect(chunks([seg(0, 50)], 30)).toEqual([seg(0, 50)]);
});

test("long speech gets a new timestamped line at a sentence end after 20s, and always by 60s", () => {
  const w = (word: string, startMs: number) => ({
    word,
    startMs,
    endMs: startMs + 200,
    probability: 1,
  });
  const words = [
    w(" One.", 0),
    w(" Two", 5_000),
    w(" three.", 21_000),
    w(" Four", 22_000),
    w(" five", 50_000),
    w(" six", 83_000),
  ];
  expect(timedLines(words, 600_000)).toEqual([
    { atMs: 600_000, text: "One. Two three." },
    { atMs: 622_000, text: "Four five" },
    { atMs: 683_000, text: "six" },
  ]);
});
