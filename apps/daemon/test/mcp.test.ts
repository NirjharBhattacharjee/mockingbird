import { expect, test } from "bun:test";
import {
  chunks,
  fineClock,
  handle,
  PROMPTS,
  renderGraph,
  timedLines,
  timedWords,
} from "../src/mcp.ts";

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

test("offers its newest protocol version when the client's isn't one it speaks", async () => {
  expect(await call(9, "initialize", { protocolVersion: "1999-01-01" })).toMatchObject({
    result: { protocolVersion: "2025-06-18" },
  });
});

test("answers initialize with the client's protocol version, and tools and prompts", async () => {
  expect(await call(1, "initialize", { protocolVersion: "2025-03-26" })).toEqual({
    jsonrpc: "2.0",
    id: 1,
    result: {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {}, prompts: {} },
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

test("lists prompts without their text, and fills one in with its arguments", async () => {
  const ask = (id: number, method: string, params?: object) =>
    handle({ jsonrpc: "2.0", id, method, ...(params && { params }) }, [], PROMPTS);
  expect(await ask(1, "prompts/list")).toMatchObject({
    result: { prompts: [{ name: "make_short", arguments: [{ name: "path", required: true }] }] },
  });
  const got = await ask(2, "prompts/get", {
    name: "make_short",
    arguments: { path: "/a/talk.mp4" },
  });
  expect(got).toMatchObject({
    result: { messages: [{ role: "user", content: { type: "text" } }] },
  });
  expect(JSON.stringify(got)).toContain("/a/talk.mp4");
  expect(await ask(3, "prompts/get", { name: "make_short" })).toMatchObject({
    error: { code: -32602, message: "make_short needs path" },
  });
  expect(await ask(4, "prompts/get", { name: "nope" })).toMatchObject({ error: { code: -32602 } });
});

test("joins Whisper's tokens into words with their times in the file, dropping non-speech", () => {
  const t = (word: string, startMs: number, endMs: number) => ({
    word,
    startMs,
    endMs,
    probability: 1,
  });
  const tokens = [
    t(" [BLANK_AUDIO]", 0, 400),
    t(" Hello", 500, 800),
    t(" dict", 900, 1100),
    t("ation", 1100, 1300),
    t(".", 1300, 1320),
  ];
  expect(timedWords(tokens, 60_000)).toEqual([
    t("Hello", 60_500, 60_800),
    t("dictation.", 60_900, 61_320),
  ]);
});

test("a fine clock shows hundredths of a second", () => {
  expect(fineClock(83_487)).toBe("01:23.48");
  expect(fineClock(3_725_050)).toBe("1:02:05.05");
});

test("the render graph keeps each clip in order and joins them", () => {
  expect(
    renderGraph(
      [
        { from: 1, to: 2.5 },
        { from: 10, to: 12 },
      ],
      { audio: true, vertical: false },
    ),
  ).toBe(
    "[0:v]trim=start=1:end=2.5,setpts=PTS-STARTPTS[v0];[0:a]atrim=start=1:end=2.5,asetpts=PTS-STARTPTS[a0];" +
      "[0:v]trim=start=10:end=12,setpts=PTS-STARTPTS[v1];[0:a]atrim=start=10:end=12,asetpts=PTS-STARTPTS[a1];" +
      "[v0][a0][v1][a1]concat=n=2:v=1:a=1[joined][a];[joined]null[v]",
  );
});

test("the render graph crops to 9:16, draws captions, and works without sound", () => {
  const graph = renderGraph([{ from: 0, to: 5 }], {
    audio: false,
    vertical: true,
    burn: true,
  });
  expect(graph).not.toContain("[0:a]");
  expect(graph).toEndWith(
    "[v0]concat=n=1:v=1:a=0[joined];[joined]crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=1080:1920,setsar=1,subtitles=filename=captions.srt[v]",
  );
});

test("the render graph lays each caption image over the picture for its cue", () => {
  const graph = renderGraph([{ from: 0, to: 5 }], {
    audio: false,
    vertical: false,
    overlays: [
      { start: 0, end: 1.5 },
      { start: 1.5, end: 3 },
    ],
  });
  const at = "x=(main_w-overlay_w)/2:y=main_h*0.7-overlay_h/2";
  expect(graph).toEndWith(
    "[joined]null[c0];" +
      `[c0][1:v]overlay=${at}:enable='between(t,0,1.5)'[c1];` +
      `[c1][2:v]overlay=${at}:enable='between(t,1.5,3)'[v]`,
  );
});
