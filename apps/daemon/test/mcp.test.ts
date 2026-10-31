import { describe, expect, test } from "bun:test";
import {
  chunks,
  fineClock,
  handle,
  PROMPTS,
  renderGraph,
  timedLines,
  timedWords,
  wordCaptions,
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
    "[0:v]trim=start=1:end=2.5,setpts=PTS-STARTPTS,scale=1920:1080,setsar=1[v0];" +
      "[0:a]atrim=start=1:end=2.5,asetpts=PTS-STARTPTS[a0];" +
      "[0:v]trim=start=10:end=12,setpts=PTS-STARTPTS,scale=1920:1080,setsar=1[v1];" +
      "[0:a]atrim=start=10:end=12,asetpts=PTS-STARTPTS[a1];" +
      "[v0][a0][v1][a1]concat=n=2:v=1:a=1[joined][speech];[joined]null[v];" +
      "[speech]atrim=duration=3.5,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]",
  );
});

test("the render graph crops to 9:16, draws captions, and works without sound", () => {
  const graph = renderGraph([{ from: 0, to: 5 }], {
    audio: false,
    vertical: true,
    burn: true,
  });
  expect(graph).not.toContain("[0:a]");
  expect(graph).toBe(
    "[0:v]trim=start=0:end=5,setpts=PTS-STARTPTS," +
      "crop=w='floor(min(iw,ih*9/16)/1/2)*2':h='floor(min(ih,iw*16/9)/1/2)*2'" +
      ":x='clip(0.5*iw-ow/2,0,iw-ow)':y='clip(0.5*ih-oh/2,0,ih-oh)',scale=1080:1920,setsar=1[v0];" +
      "[v0]concat=n=1:v=1:a=0[joined];[joined]null[laid];" +
      "[laid]subtitles=filename=captions.srt:force_style='Alignment=2,MarginV=76'[v]",
  );
});

test("each clip is framed around its focus, punched in by its zoom", () => {
  const graph = renderGraph(
    [
      { from: 0, to: 2 },
      { from: 2, to: 4, focus: { x: 0.3, y: 0.4 }, zoom: 1.2 },
    ],
    { audio: false, vertical: false, size: "1280x720" },
  );
  // Only the zoomed clip is cropped; both come out the source's size with square pixels, for concat.
  expect(graph).toStartWith(
    "[0:v]trim=start=0:end=2,setpts=PTS-STARTPTS,scale=1280:720,setsar=1[v0];",
  );
  expect(graph).toContain(
    "crop=w='floor(iw/1.2/2)*2':h='floor(ih/1.2/2)*2':x='clip(0.3*iw-ow/2,0,iw-ow)':y='clip(0.4*ih-oh/2,0,ih-oh)',scale=1280:720,setsar=1[v1]",
  );
});

test("a split stacks two areas of the picture into 1080x1920", () => {
  const graph = renderGraph([{ from: 0, to: 4, zoom: 2 }], {
    audio: false,
    vertical: false,
    split: { top: { x: 0, y: 0, w: 0.8, h: 1 }, bottom: { x: 0.8, y: 0.7, w: 0.2, h: 0.3 } },
  });
  // The areas come from the whole picture, so a clip's zoom doesn't apply.
  expect(graph).not.toContain("/2/2");
  expect(graph).toContain("[joined]split[upper][lower];");
  expect(graph).toContain(
    "[lower]crop=w='floor(0.2*iw/2)*2':h='floor(0.3*ih/2)*2':x='0.8*iw':y='0.7*ih',scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[bottom];",
  );
  expect(graph).toEndWith("[top][bottom]vstack,setsar=1[stacked];[stacked]null[v]");
});

test("inserts go under the text, and music ducks under the speech", () => {
  const graph = renderGraph(
    [
      { from: 0, to: 4 },
      { from: 6, to: 8 },
    ],
    {
      audio: true,
      vertical: true,
      overlays: [{ start: 0, end: 1, y: 0.5 }],
      inserts: [{ start: 1, end: 2 }],
      sounds: [
        { at: 0, volume: 0.15, loop: true, duck: true },
        { at: 3, volume: 1, loop: false, duck: false },
      ],
    },
  );
  const steps = graph.split(";");
  // Input 1 is the text, 2 the insert, 3 and 4 the sounds.
  const insert = steps.findIndex((s) => s.startsWith("[c0][i0]overlay"));
  const text = steps.findIndex((s) => s.includes("[1:v]overlay"));
  expect(insert).toBeGreaterThan(0);
  expect(text).toBeGreaterThan(insert);
  expect(graph).toContain("[2:v]trim=duration=1,setpts=PTS-STARTPTS+1/TB,");
  expect(graph).toContain("y=main_h*0.5-overlay_h/2:enable='gte(t,0)*lt(t,1)'[v]");
  // The music lasts the 6 seconds of video, and the speech is its key.
  expect(steps).toContain("[speech]asplit=2[voice][key0]");
  expect(steps).toContain("[3:a]atrim=duration=6,adelay=0:all=1,volume=0.15[s0]");
  expect(steps).toContain(
    "[s0][key0]sidechaincompress=threshold=0.04:ratio=8:attack=100:release=500[m0]",
  );
  expect(steps).toContain("[4:a]adelay=3000:all=1,volume=1[m1]");
  expect(steps.at(-1)).toBe(
    "[voice][m0][m1]amix=inputs=3:duration=longest:normalize=0,atrim=duration=6,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]",
  );
});

test("libass's captions go over the inserts, where captionsY puts them", () => {
  const graph = renderGraph([{ from: 0, to: 4 }], {
    audio: false,
    vertical: true,
    burn: true,
    captionsY: 0.5,
    inserts: [{ start: 1, end: 2 }],
  });
  expect(graph).toContain("[c0][i0]overlay=eof_action=pass:enable='gte(t,1)*lt(t,2)'[laid]");
  expect(graph).toEndWith(
    "[laid]subtitles=filename=captions.srt:force_style='Alignment=2,MarginV=134'[v]",
  );
});

test("music under a silent video sets the length itself", () => {
  const graph = renderGraph([{ from: 0, to: 4 }], {
    audio: false,
    vertical: false,
    sounds: [
      { at: 0, volume: 0.5, loop: true, duck: true },
      { at: 1, volume: 1, loop: false, duck: false },
    ],
  });
  expect(graph).not.toContain("sidechaincompress");
  expect(graph).toContain("[1:a]atrim=duration=4,adelay=0:all=1,volume=0.5[m0]");
  expect(graph).toContain("amix=inputs=2:duration=longest");
  // A sound longer than the video is cut where the picture ends.
  expect(graph).toEndWith(",atrim=duration=4,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]");
});

describe("wordCaptions", () => {
  const w = (word: string, start: number, end: number) => ({
    word,
    startMs: start * 1000,
    endMs: end * 1000,
    probability: 1,
  });
  const cues = (srt: string) =>
    srt.split("\n\n").map((block) => {
      const [, time = "", text = ""] = block.split("\n");
      return `${time.replace(/00:00:/g, "")} ${text}`;
    });

  test("lights each word in turn, a few words a cue, timed to the finished video", () => {
    const srt = wordCaptions(
      [
        { from: 10, to: 12 },
        { from: 20, to: 21 },
      ],
      [
        [w("so", 10.1, 10.3), w("this", 10.3, 10.6), w("is", 10.6, 10.8), w("it.", 10.8, 11.2)],
        [w("Watch", 20.1, 20.5)],
      ],
    );
    expect(cues(srt)).toEqual([
      "00,100 --> 00,300 *so* this is",
      "00,300 --> 00,600 so *this* is",
      "00,600 --> 00,800 so this *is*",
      // A new cue after three words; the full stop goes, and the last word stays up 0.2 s more.
      "00,800 --> 01,400 *it*",
      // The second clip starts 2 seconds into the video.
      "02,100 --> 02,700 *Watch*",
    ]);
  });

  test("starts a new cue after a pause, and keeps a word whose middle is in the clip", () => {
    const srt = wordCaptions(
      [{ from: 0, to: 5 }],
      [[w("one", 0, 0.3), w("two", 1, 1.3), w("three", 4.8, 5.1), w("cut", 5.0, 5.6)]],
      { lit: false, upper: true },
    );
    expect(cues(srt)).toEqual([
      "00,000 --> 00,500 ONE",
      "01,000 --> 01,500 TWO",
      // Said across the end of the clip: kept, and cut off with it.
      "04,800 --> 05,000 THREE",
    ]);
  });

  test("doesn't carry a caption past its clip into the next shot", () => {
    const srt = wordCaptions(
      [
        { from: 0, to: 1 },
        { from: 5, to: 6 },
      ],
      [[w("bye", 0.5, 0.95)], [w("hi", 5.1, 5.4)]],
      { lit: false },
    );
    // "bye" ends 0.15 s before "hi" starts, but its clip ends at 1 s.
    expect(cues(srt)).toEqual(["00,500 --> 01,000 bye", "01,100 --> 01,600 hi"]);
  });
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
      `[c0][1:v]overlay=${at}:enable='gte(t,0)*lt(t,1.5)'[c1];` +
      `[c1][2:v]overlay=${at}:enable='gte(t,1.5)*lt(t,3)'[v]`,
  );
});
