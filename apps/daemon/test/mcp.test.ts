import { describe, expect, test } from "bun:test";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { captionStyle } from "@mockingbird/captions";
import { handle, PROMPTS } from "../src/mcp/server.ts";
import { mcpTools } from "../src/mcp/tools.ts";
import {
  align,
  boardFrom,
  buildLook,
  CLIPS_PER_PASS,
  captionFontWarning,
  chunks,
  fineClock,
  KIT_URL,
  LOOK_BOARD,
  levelGains,
  lookCaptions,
  mixGraph,
  moving,
  parseScenes,
  pieces,
  renderGraph,
  STYLES_URL,
  seekClips,
  segments,
  soundOf,
  sourceWords,
  spans,
  THREE_ADDONS_URL,
  THREE_URL,
  tempo,
  timedLines,
  timedWords,
  timeline,
  transcriptionAt,
  uncovered,
  union,
  withKit,
  wordCaptions,
} from "../src/mcp.ts";
import { findChrome } from "../src/models.ts";
import { mockingbirdHome } from "../src/runtime.ts";

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
      instructions: expect.stringContaining("guide"),
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

test("each clip is its own input, opened at its start and read for its length", () => {
  expect(
    seekClips("/v.mp4", [
      { from: 1, to: 2.5 },
      { from: 10, to: 12 },
    ]),
  ).toEqual([
    "-hwaccel",
    "auto",
    "-ss",
    "1",
    "-t",
    "1.5",
    "-i",
    "/v.mp4",
    "-hwaccel",
    "auto",
    "-ss",
    "10",
    "-t",
    "2",
    "-i",
    "/v.mp4",
  ]);
});

/** A crop to the whole of a 16:9 picture: what framing a clip to 16:9 does without a zoom. */
const FULL =
  "crop=w='floor(min(iw,ih*16/9)/1/2)*2':h='floor(min(ih,iw*9/16)/1/2)*2':x='clip(0.5*iw-ow/2,0,iw-ow)':y='clip(0.5*ih-oh/2,0,ih-oh)'";

test("the render graph keeps each clip in order and joins them", () => {
  expect(
    renderGraph(
      [
        { from: 1, to: 2.5 },
        { from: 10, to: 12 },
      ],
      { audio: true, fps: 30 },
    ),
  ).toBe(
    // Each clip framed to the picture's shape (all of a 16:9 source), its size and rate.
    `[0:v]setpts=PTS-STARTPTS,scale='trunc(iw*sar/2)*2':ih,setsar=1,${FULL},scale=1920:1080,setsar=1,fps=30[v0];` +
      "[0:a]asetpts=PTS-STARTPTS[a0];" +
      `[1:v]setpts=PTS-STARTPTS,scale='trunc(iw*sar/2)*2':ih,setsar=1,${FULL},scale=1920:1080,setsar=1,fps=30[v1];` +
      "[1:a]asetpts=PTS-STARTPTS[a1];" +
      "[v0][a0][v1][a1]concat=n=2:v=1:a=1[joined][speech];[joined]null[v];" +
      "[speech]atrim=duration=3.5[a]",
  );
});

test("the render graph crops to 9:16, draws captions, and works without sound", () => {
  const graph = renderGraph([{ from: 0, to: 5 }], {
    audio: false,
    fps: 30,
    size: "1080x1920",
    burn: true,
  });
  expect(graph).not.toContain("[0:a]");
  expect(graph).toBe(
    "[0:v]setpts=PTS-STARTPTS,scale='trunc(iw*sar/2)*2':ih,setsar=1," +
      "crop=w='floor(min(iw,ih*9/16)/1/2)*2':h='floor(min(ih,iw*16/9)/1/2)*2'" +
      ":x='clip(0.5*iw-ow/2,0,iw-ow)':y='clip(0.5*ih-oh/2,0,ih-oh)',scale=1080:1920,setsar=1,fps=30[v0];" +
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
    { audio: false, fps: 30, size: "1280x720" },
  );
  // Both get square pixels and the picture's shape; the zoomed clip a smaller window of it.
  expect(graph).toStartWith(
    `[0:v]setpts=PTS-STARTPTS,scale='trunc(iw*sar/2)*2':ih,setsar=1,${FULL},scale=1280:720,setsar=1,fps=30[v0];`,
  );
  expect(graph).toContain(
    "crop=w='floor(min(iw,ih*16/9)/1.2/2)*2':h='floor(min(ih,iw*9/16)/1.2/2)*2':x='clip(0.3*iw-ow/2,0,iw-ow)':y='clip(0.4*ih-oh/2,0,ih-oh)',scale=1280:720,setsar=1,fps=30[v1]",
  );
});

test("a project's clips from different sources are framed to one size and rate, a silent one given silence", () => {
  const graph = renderGraph(
    [
      { from: 0, to: 2, path: "/wide.mp4" },
      { from: 1, to: 4, path: "/phone.mov", focus: { x: 0.3, y: 0.5 }, zoom: 1.5, silent: true },
    ],
    { audio: true, size: "1080x1920", fps: 30 },
  );
  expect(graph).toStartWith(
    "[0:v]setpts=PTS-STARTPTS,scale='trunc(iw*sar/2)*2':ih,setsar=1," +
      "crop=w='floor(min(iw,ih*9/16)/1/2)*2':h='floor(min(ih,iw*16/9)/1/2)*2'" +
      ":x='clip(0.5*iw-ow/2,0,iw-ow)':y='clip(0.5*ih-oh/2,0,ih-oh)',scale=1080:1920,setsar=1,fps=30[v0];" +
      "[0:a]asetpts=PTS-STARTPTS[a0];",
  );
  expect(graph).toContain(
    "crop=w='floor(min(iw,ih*9/16)/1.5/2)*2':h='floor(min(ih,iw*16/9)/1.5/2)*2'" +
      ":x='clip(0.3*iw-ow/2,0,iw-ow)':y='clip(0.5*ih-oh/2,0,ih-oh)',scale=1080:1920,setsar=1,fps=30[v1];" +
      "aevalsrc=0:c=stereo:s=48000:d=3[a1];",
  );
  expect(seekClips("/x.mp4", [{ from: 1, to: 2, path: "/phone.mov" }])).toEqual([
    ...["-hwaccel", "auto", "-ss", "1", "-t", "1", "-i", "/phone.mov"],
  ]);
});

test("an HDR clip is brought to SDR before anything else, HDR b-roll too (#252)", () => {
  const graph = renderGraph(
    [
      { from: 0, to: 2, path: "/iphone.mov", sdr: "lut3d=file=/hlg.cube" },
      { from: 0, to: 2, path: "/screen.mp4" },
    ],
    {
      audio: false,
      size: "1920x1080",
      fps: 30,
      inserts: [
        { start: 0.5, end: 1.5, sdr: "lut3d=file=/hlg.cube" },
        { start: 2.5, end: 3 },
      ],
    },
  );
  expect(graph).toStartWith("[0:v]lut3d=file=/hlg.cube,setpts=PTS-STARTPTS,");
  expect(graph).toContain("[1:v]setpts=PTS-STARTPTS,");
  // HDR b-roll is converted before it's trimmed and scaled; a plain insert isn't.
  expect(graph).toContain("[2:v]lut3d=file=/hlg.cube,trim=duration=1,");
  expect(graph).toContain("[3:v]trim=duration=0.5,");
});

test("renderGraph adds no colour label of its own (#252)", () => {
  const graph = renderGraph([{ from: 0, to: 2 }], { audio: false, size: "1920x1080", fps: 30 });
  expect(graph).not.toContain("setparams");
});

test("scdet's log reads as cuts, timed from the seek", () => {
  const log = [
    "[Parsed_scdet_1 @ 0x9590] lavfi.scd.score: 29.301, lavfi.scd.time: 2",
    "frame=  180 fps=0.0 q=-0.0 size=N/A",
    "[Parsed_scdet_1 @ 0x9590] lavfi.scd.score: 20.581, lavfi.scd.time: 4.0333",
  ].join("\n");
  expect(parseScenes(log, 60)).toEqual([
    { at: 62, score: 29.301 },
    { at: 64.033, score: 20.581 },
  ]);
  expect(parseScenes("nothing here")).toEqual([]);
  expect(parseScenes("lavfi.scd.score: 0.000, lavfi.scd.time: 1")).toEqual([]);
});

test("words are placed by their DTW points and the silences, not Whisper's drifting times", () => {
  // The talk at 1:35 (#160), heard in a 30-second window: Whisper's times run
  // about 0.5 s early; DTW's points and silencedetect's pauses are measured.
  const heard = [
    ["same", 95.01, 95.27, 95.6],
    ["create", 95.4, 95.88, 96.2],
    ["uh", 96.02, 96.25, 97.16],
    ["create", 96.54, 97.32, 97.84],
    ["framework", 97.35, 98.68, 98.52],
  ].map(([word, start, end, at]) => ({
    word: word as string,
    start: start as number,
    end: end as number,
    at: [at, at] as [number, number],
  }));
  const gaps = [
    { from: 95.75, to: 95.92 },
    { from: 96.375, to: 97.054 },
    { from: 97.487, to: 97.74 },
    { from: 98.112, to: 98.196 },
    { from: 98.199, to: 98.318 },
    { from: 98.769, to: 99.547 },
  ];
  expect(align(heard, gaps).map((w) => [w.word, w.start, w.end])).toEqual([
    ["same", 95.01, 95.75],
    ["create", 95.92, 96.375],
    ["uh", 97.054, 97.487],
    ["create", 97.74, 98.112],
    ["framework", 98.318, 98.769],
  ]);
  // Without points, Whisper's times stand.
  expect(align([{ word: "x", start: 1, end: 2 }], gaps)).toEqual([{ word: "x", start: 1, end: 2 }]);
});

test("a word's DTW points come from its first and last token, offset to the file", () => {
  expect(
    timedWords(
      [
        { word: " gem", startMs: 0, endMs: 300, probability: 1, atMs: 360 },
        { word: "ini", startMs: 300, endMs: 600, probability: 1, atMs: 480 },
        { word: ",", startMs: 600, endMs: 610, probability: 1, atMs: 700 },
      ],
      1000,
    ),
  ).toEqual([
    {
      word: "gemini,",
      startMs: 1000,
      endMs: 1610,
      probability: 1,
      atMs: 1360,
      atEndMs: 1480,
    },
  ]);
});

test("the word cache hears only the stretches no call has heard yet", () => {
  expect(
    union(
      [
        { from: 10, to: 12 },
        { from: 0, to: 2 },
        { from: 1, to: 3 },
        { from: 14, to: 15 },
      ],
      2,
    ),
  ).toEqual([
    { from: 0, to: 3 },
    { from: 10, to: 15 },
  ]);
  expect(
    uncovered(
      [{ from: 0, to: 10 }],
      [
        { from: 2, to: 4 },
        { from: 6, to: 12 },
      ],
    ),
  ).toEqual([
    { from: 0, to: 2 },
    { from: 4, to: 6 },
  ]);
  expect(uncovered([{ from: 3, to: 5 }], [{ from: 0, to: 10 }])).toEqual([]);
});

test("speed and transitions set where each clip starts and how long the cut is", () => {
  expect(
    timeline([
      { from: 0, to: 4 },
      { from: 10, to: 18, speed: 2, transition: { type: "fade", duration: 0.5 } },
      { from: 0, to: 1, speed: 0.5 },
    ]),
  ).toEqual({ starts: [0, 3.5, 7.5], length: 9.5 });
  // atempo takes 0.5-2 a step.
  expect(tempo(2)).toBe("atempo=2");
  expect(tempo(4)).toBe("atempo=2,atempo=2");
  expect(tempo(0.25)).toBe("atempo=0.5,atempo=0.5");
  expect(tempo(1.5)).toBe("atempo=1.5");
});

test("a transition joins clips with xfade and acrossfade on one timebase, the rest with concat", () => {
  const graph = renderGraph(
    [
      { from: 0, to: 2, path: "/a.mp4" },
      { from: 0, to: 2, path: "/b.mp4", transition: { type: "fadeblack", duration: 0.5 } },
      { from: 4, to: 6, path: "/a.mp4", speed: 2 },
    ],
    { audio: true, size: "1280x720", fps: 30 },
  );
  expect(graph).toContain(",fps=30,settb=1/30[v0];");
  expect(graph).toContain("[v0][v1]xfade=transition=fadeblack:duration=0.5:offset=1.500000[jv1]");
  expect(graph).toContain("[a0][a1]acrossfade=d=0.5[ja1]");
  // The third clip at 2x: half the frames, the sound sped up to match.
  expect(graph).toContain("[2:v]setpts=PTS-STARTPTS,setpts=PTS/2,");
  expect(graph).toContain("[2:a]asetpts=PTS-STARTPTS,atempo=2[a2]");
  // Picture and sound join apart: a J or L cut can make a clip's sound longer than its picture.
  expect(graph).toContain(
    "[jv1][v2]concat=n=2:v=1:a=0,settb=1/30[joined];[ja1][a2]concat=n=2:v=0:a=1[speech]",
  );
  // 2 + 2 - 0.5 + 1 = 4.5 s of sound.
  expect(graph).toEndWith("[speech]atrim=duration=4.5[a]");
});

test("a J cut opens the clip early enough for its sound, and joins picture and sound apart", () => {
  const clips = [
    { from: 10, to: 13.5, path: "/a.mp4", sound: { from: 10, to: 13 } },
    { from: 20, to: 24, path: "/b.mp4", sound: { from: 19.5, to: 24 } },
  ];
  // The second clip's input opens at 19.5, for the half second of sound before its picture.
  expect(seekClips("/x", clips)).toEqual([
    ...["-hwaccel", "auto", "-ss", "10", "-t", "3.5", "-i", "/a.mp4"],
    ...["-hwaccel", "auto", "-ss", "19.5", "-t", "4.5", "-i", "/b.mp4"],
  ]);
  const graph = renderGraph(clips, { audio: true, size: "640x360", fps: 30 });
  expect(graph).toContain("[1:v]trim=start=0.5:duration=4,setpts=PTS-STARTPTS,");
  expect(graph).toContain("[1:a]atrim=start=0:duration=4.5,asetpts=PTS-STARTPTS[a1]");
  expect(graph).toContain("[0:a]atrim=start=0:duration=3,asetpts=PTS-STARTPTS[a0]");
  expect(graph).toContain("[v0][v1]concat=n=2:v=1:a=0[joined];[a0][a1]concat=n=2:v=0:a=1[speech]");
});

test("moves frame each frame with perspective, eased between them", () => {
  const filter = moving(
    { from: 0, to: 4, zoom: 1, moves: [{ at: 2, zoom: 1.5, focus: { x: 0.3, y: 0.5 } }] },
    "1080x1920",
    30,
  );
  expect(filter).toStartWith("perspective=x0='clip(if(lt((in/30),2),(0.5+-0.2*");
  expect(filter).toContain("(min(W,H*9/16)/if(lt((in/30),2),(1+0.5*(clip(((in/30)-0)/2,0,1)*");
  expect(filter).toEndWith(":interpolation=linear:eval=frame,scale=1080:1920,setsar=1");
});

test("a split stacks two areas of the picture into 1080x1920", () => {
  const graph = renderGraph([{ from: 0, to: 4, zoom: 2 }], {
    audio: false,
    fps: 30,
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
      fps: 30,
      size: "1080x1920",
      overlays: [{ start: 0, end: 1, y: 0.5 }],
      inserts: [{ start: 1, end: 2 }],
      sounds: [
        { at: 0, volume: 0.15, loop: true, duck: true },
        { at: 3, volume: 1, loop: false, duck: false },
      ],
    },
  );
  const steps = graph.split(";");
  // Inputs 0 and 1 are the clips, 2 the text, 3 the insert, 4 and 5 the sounds.
  const insert = steps.findIndex((s) => s.startsWith("[c0][i0]overlay"));
  const text = steps.findIndex((s) => s.includes("[2:v]overlay"));
  expect(insert).toBeGreaterThan(0);
  expect(text).toBeGreaterThan(insert);
  expect(graph).toContain("[3:v]trim=duration=1,setpts=PTS-STARTPTS+1/TB,");
  expect(graph).toContain("y=main_h*0.5-overlay_h/2:enable='gte(t,0)*lt(t,1)'[v]");
  // The music lasts the 6 seconds of video, and the speech is its key.
  expect(steps).toContain("[speech]asplit=2[voice][key0]");
  expect(steps).toContain("[4:a]atrim=duration=6,adelay=0:all=1,volume=0.15[s0]");
  expect(steps).toContain(
    "[s0][key0]sidechaincompress=threshold=0.04:ratio=8:attack=100:release=500[m0]",
  );
  expect(steps).toContain("[5:a]adelay=3000:all=1,volume=1[m1]");
  expect(steps.at(-1)).toBe(
    "[voice][m0][m1]amix=inputs=3:duration=longest:normalize=0,atrim=duration=6[a]",
  );
});

test("a batch's sound is left whole, for the last pass to cut and bring to -14 LUFS", () => {
  const graph = renderGraph([{ from: 0, to: 4 }], {
    audio: true,
    fps: 30,
    whole: true,
  });
  expect(graph).toEndWith("[speech]anull[a]");
});

test("libass's captions go over the inserts, where captionsY puts them", () => {
  const graph = renderGraph([{ from: 0, to: 4 }], {
    audio: false,
    fps: 30,
    size: "1080x1920",
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
    fps: 30,
    sounds: [
      { at: 0, volume: 0.5, loop: true, duck: true },
      { at: 1, volume: 1, loop: false, duck: false },
    ],
  });
  expect(graph).not.toContain("sidechaincompress");
  expect(graph).toContain("[1:a]atrim=duration=4,adelay=0:all=1,volume=0.5[m0]");
  expect(graph).toContain("amix=inputs=2:duration=longest");
  // A sound longer than the video is cut where the picture ends.
  expect(graph).toEndWith(",atrim=duration=4[a]");
});

test("clips whose padded stretches overlap are transcribed as one stretch", () => {
  expect(
    spans([
      { from: 30, to: 31 },
      { from: 1, to: 3 },
      { from: 4, to: 6 },
      // Used twice in the edit, heard once.
      { from: 4, to: 6 },
      { from: 12, to: 13 },
    ]),
  ).toEqual([
    { from: 0, to: 8 },
    { from: 10, to: 15 },
    { from: 28, to: 33 },
  ]);
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

  test("Chinese and Japanese join without spaces, about four characters a word of perCue (#276)", () => {
    const words = [..."今日は新しいカメラを試しました"].map((c, i) => w(c, i * 0.1, i * 0.1 + 0.1));
    const lines = wordCaptions([{ from: 0, to: 2 }], [words], { lit: false })
      .split("\n\n")
      .map((b) => b.split("\n")[2]);
    expect(lines).toEqual(["今日は新しいカメラを試し", "ました"]);
    // The spoken character is marked inside the line, which render draws without spaces.
    const lit = wordCaptions([{ from: 0, to: 2 }], [words.slice(0, 3)])
      .split("\n\n")[1]
      ?.split("\n")[2];
    expect(lit).toBe("今*日*は");
  });

  test("CJK punctuation joins without a space and ends a cue (#276)", () => {
    const words = ["試しました", "。", "次"].map((c, i) => w(c, i * 0.3, i * 0.3 + 0.3));
    const lines = wordCaptions([{ from: 0, to: 2 }], [words], { lit: false })
      .split("\n\n")
      .map((b) => b.split("\n")[2]);
    expect(lines).toEqual(["試しました。", "次"]);
  });

  test("a cue never shows more than 20 characters a second (#276)", () => {
    // Three long words said in 0.6 s: 30 characters would be 50 a second.
    const srt = wordCaptions(
      [{ from: 0, to: 2 }],
      [
        [
          w("extraordinarily", 0, 0.2),
          w("uncharacteristic", 0.2, 0.4),
          w("misunderstanding", 0.4, 0.6),
        ],
      ],
      { lit: false },
    );
    expect(cues(srt).length).toBe(3);
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
    fps: 30,
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

test("a motion script's sounds mix over the video's own, from input 1, cut to its length", () => {
  expect([
    "[0:a]anull[speech]",
    ...mixGraph([{ at: 1, volume: 1, loop: false, duck: true }], {
      speech: true,
      length: 4,
      first: 1,
    }),
  ]).toEqual([
    "[0:a]anull[speech]",
    "[speech]asplit=2[voice][key0]",
    "[1:a]adelay=1000:all=1,volume=1[s0]",
    "[s0][key0]sidechaincompress=threshold=0.04:ratio=8:attack=100:release=500[m0]",
    "[voice][m0]amix=inputs=2:duration=longest:normalize=0,atrim=duration=4[a]",
  ]);
  // A quiet recording is raised before the duck keys on it (#212).
  expect(
    mixGraph([{ at: 0, volume: 0.15, loop: true, duck: true }], {
      speech: true,
      length: 4,
      first: 1,
      gain: 17.2,
    }).slice(0, 2),
  ).toEqual(["[speech]volume=17.20dB[lifted]", "[lifted]asplit=2[voice][key0]"]);
  // Nothing mixed under it: the speech is left for `level`.
  expect(mixGraph([], { speech: true, length: 4, first: 1, gain: 17.2 })).toEqual([
    "[speech]atrim=duration=4[a]",
  ]);
  // No sound at all: nothing to mix.
  expect(mixGraph([], { speech: false, length: 4, first: 1 })).toEqual([]);
});

describe("pieces", () => {
  const keys = () => [0, 60, 120, 180];
  const all = () => true;
  const parts = (clips: { from: number; to: number }[], can = all) =>
    pieces(clips, 30, keys, can).map(({ a, b, copy }) => [a, b, copy]);

  test("copies the whole groups inside a clip and encodes the frames either side", () => {
    expect(parts([{ from: 1, to: 5 }])).toEqual([
      [30, 60, false],
      [60, 120, true],
      [120, 150, false],
    ]);
  });

  test("a clip on keyframes is copied whole", () => {
    expect(parts([{ from: 2, to: 6 }])).toEqual([[60, 180, true]]);
  });

  test("a clip with no whole group inside, or that can't be copied, is encoded", () => {
    expect(parts([{ from: 2.1, to: 3.9 }])).toEqual([[63, 117, false]]);
    expect(parts([{ from: 1, to: 5 }], () => false)).toEqual([[30, 150, false]]);
  });

  test("clips are cut to whole frames", () => {
    expect(parts([{ from: 1.99, to: 4.01 }])).toEqual([[60, 120, true]]);
  });
});

describe("segments", () => {
  // Twelve 4 s clips: a segment may end once it's 10 s long, so every third clip.
  const clips = Array.from({ length: 12 }, (_, i) => ({ from: i * 4, to: i * 4 + 4 }));

  test("ends a segment at the first clip edge 10 s in", () => {
    expect(segments(clips, [])).toEqual([
      [0, 3],
      [3, 6],
      [6, 9],
      [9, 12],
    ]);
  });

  test("never where a transition joins two clips or an insert plays across", () => {
    const faded = clips.map((c, i) =>
      i === 3 ? { ...c, transition: { type: "fade", duration: 0.5 } } : c,
    );
    expect(segments(faded, [])[0]).toEqual([0, 4]);
    expect(segments(clips, [{ from: 11, to: 13 }])[0]).toEqual([0, 4]);
    // A J cut on clip 3 (its sound starts 0.5 s early) keeps that edge in one segment.
    const jcut = clips.map((c, i) =>
      i === 3 ? { ...c, sound: { from: c.from - 0.5, to: c.to } } : c,
    );
    expect(segments(jcut, [])[0]).toEqual([0, 4]);
    // An insert that ends on the edge doesn't cross it.
    expect(segments(clips, [{ from: 10, to: 12 }])[0]).toEqual([0, 3]);
  });

  test("a segment holds at most CLIPS_PER_PASS clips", () => {
    const short = Array.from({ length: CLIPS_PER_PASS + 5 }, (_, i) => ({
      from: i * 0.05,
      to: i * 0.05 + 0.05,
    }));
    expect(segments(short, [])[0]).toEqual([0, CLIPS_PER_PASS]);
  });
});

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("render (integration)", () => {
  const run = (args: Record<string, unknown>) => {
    const tool = mcpTools(
      async () => ({}),
      () => {},
    ).find((t) => t.name === "render");
    if (!tool) throw new Error("no render tool");
    return tool.run(args);
  };
  const seconds = (file: string) =>
    Number(
      Bun.spawnSync([
        ...["ffprobe", "-v", "error", "-show_entries", "format=duration"],
        ...["-of", "csv=p=0", file],
      ]).stdout.toString(),
    );

  // Needs MODNet: `mockingbird models pull modnet`.
  const modnet = join(mockingbirdHome(), "models", "modnet.onnx");
  test.skipIf(!existsSync(modnet))(
    "a subject mask is made once and reused by the next render (#260)",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "mb-subject-"));
      const home = process.env.MOCKINGBIRD_HOME;
      try {
        // A home of its own, so nothing lands in the real cache; the model comes over by a link.
        process.env.MOCKINGBIRD_HOME = join(dir, "home");
        mkdirSync(join(dir, "home", "models"), { recursive: true });
        symlinkSync(modnet, join(dir, "home", "models", "modnet.onnx"));
        const src = join(dir, "talk.mp4");
        Bun.spawnSync([
          ...["ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi"],
          ...["-i", "testsrc2=size=320x180:rate=10:duration=2", src],
        ]);
        const blur = { name: "blur", radius: 8, mask: { shape: "subject", invert: true } };
        const masks = () => readdirSync(join(dir, "home", "cache", "masks"));
        // Only a clip's effects take one, and that's said before any mask is made.
        await expect(
          run({
            path: src,
            clips: [{ from: 0, to: 1 }],
            adjust: [{ from: 0, to: 1, effects: [blur] }],
          }),
        ).rejects.toThrow("goes on a clip's effects");
        expect(existsSync(join(dir, "home", "cache", "masks"))).toBe(false);
        await run({ path: src, clips: [{ from: 0.5, to: 1.7, effects: [blur] }] });
        expect(seconds(join(dir, "talk-short-1.mp4"))).toBeCloseTo(1.2, 1);
        expect(masks()).toHaveLength(1);
        const made = statSync(join(dir, "home", "cache", "masks", masks()[0] as string)).mtimeMs;
        await run({ path: src, clips: [{ from: 0.5, to: 1.7, effects: [blur] }] });
        expect(masks()).toHaveLength(1);
        expect(statSync(join(dir, "home", "cache", "masks", masks()[0] as string)).mtimeMs).toBe(
          made,
        );
      } finally {
        if (home === undefined) delete process.env.MOCKINGBIRD_HOME;
        else process.env.MOCKINGBIRD_HOME = home;
        rmSync(dir, { recursive: true, force: true });
      }
    },
    120_000,
  );

  // Needs the pinned Chrome (or MOCKINGBIRD_CHROME), which generates the bed.
  test.skipIf(!findChrome())(
    "a project's generated bed is made once and kept, and its sound renders alone (#170)",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "mb-bed-"));
      const home = process.env.MOCKINGBIRD_HOME;
      const chrome = process.env.MOCKINGBIRD_CHROME;
      try {
        // The Chrome found in the real home, which the empty one below doesn't have.
        process.env.MOCKINGBIRD_CHROME = findChrome();
        process.env.MOCKINGBIRD_HOME = join(dir, "home");
        const talk = join(dir, "talk.mp4");
        Bun.spawnSync([
          ...[
            "ffmpeg",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=320x240:rate=30:d=4",
          ],
          ...["-f", "lavfi", "-i", "sine=frequency=220:duration=4", "-pix_fmt", "yuv420p", talk],
        ]);
        const project = join(dir, "edit.json");
        const generator = join(import.meta.dir, "../../../plugin/skills/music/generators/lofi.js");
        const edit = mcpTools(
          async () => ({}),
          () => {},
        ).find((t) => t.name === "edit");
        await edit?.run({
          project,
          ops: [
            { op: "add", type: "clip", path: talk, from: 0, to: 4 },
            { op: "add", type: "audio", generator: { generator, tempo: 90 }, volume: 0.2 },
          ],
        });
        const sound = String(await run({ project, sound: true }));
        expect(sound).toContain("edit-sound-1.m4a");
        const streams = Bun.spawnSync([
          ...["ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0"],
          join(dir, "edit-sound-1.m4a"),
        ]).stdout.toString();
        expect(streams.trim()).toBe("audio");
        const beds = join(dir, "home", "cache", "music");
        expect(readdirSync(beds)).toHaveLength(1);
        await run({ project });
        expect(readdirSync(beds)).toHaveLength(1);
        expect(seconds(join(dir, "edit-render-1.mp4"))).toBeCloseTo(4, 1);
      } finally {
        if (home === undefined) delete process.env.MOCKINGBIRD_HOME;
        else process.env.MOCKINGBIRD_HOME = home;
        if (chrome === undefined) delete process.env.MOCKINGBIRD_CHROME;
        else process.env.MOCKINGBIRD_CHROME = chrome;
        rmSync(dir, { recursive: true, force: true });
      }
    },
    120_000,
  );

  test.skipIf(!findChrome())(
    "an overlay page is laid over its clip with its transparency (#163)",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "mb-overlay-"));
      const home = process.env.MOCKINGBIRD_HOME;
      const chrome = process.env.MOCKINGBIRD_CHROME;
      try {
        // The Chrome found in the real home, which the empty one below doesn't have.
        process.env.MOCKINGBIRD_CHROME = findChrome();
        process.env.MOCKINGBIRD_HOME = join(dir, "home");
        const talk = join(dir, "talk.mp4");
        // Solid blue under a page that paints only its top half red.
        Bun.spawnSync([
          ...[
            "ffmpeg",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=320x240:r=30:d=3",
          ],
          ...["-pix_fmt", "yuv420p", talk],
        ]);
        const page = join(dir, "card.html");
        writeFileSync(
          page,
          // Imports the kit the way the templates do: render fills in "KIT", as motion does.
          '<body style="margin:0"><div id="card" style="position:fixed;left:0;top:0;width:100%;height:50%"></div><script type="module">import { THEMES } from "KIT"; if (THEMES) document.getElementById("card").style.background = "red";</script></body>',
        );
        const project = join(dir, "edit.json");
        await mcpTools(
          async () => ({}),
          () => {},
        )
          .find((t) => t.name === "edit")
          ?.run({
            project,
            ops: [
              { op: "add", type: "clip", path: talk, from: 0, to: 3 },
              { op: "add", type: "overlay", page, clip: "c1", from: 1, to: 2 },
              // A project with graphics renders once the look is settled (#264).
              { op: "set", look: { skipped: true } },
            ],
          });
        await run({ project });
        const pixel = (t: number, y: number) => [
          ...Bun.spawnSync([
            ...[
              "ffmpeg",
              "-loglevel",
              "error",
              "-ss",
              String(t),
              "-i",
              join(dir, "edit-render-1.mp4"),
            ],
            ...[
              "-frames:v",
              "1",
              "-vf",
              `format=rgb24,crop=1:1:160:${y}`,
              "-f",
              "rawvideo",
              "-pix_fmt",
              "rgb24",
              "-",
            ],
          ]).stdout,
        ];
        const red = (rgb: number[]) => (rgb[0] ?? 0) > 200 && (rgb[2] ?? 255) < 60;
        const blue = (rgb: number[]) => (rgb[2] ?? 0) > 200 && (rgb[0] ?? 255) < 60;
        expect(red(pixel(1.5, 40))).toBe(true);
        expect(blue(pixel(1.5, 200))).toBe(true);
        expect(blue(pixel(0.5, 40))).toBe(true);
        expect(blue(pixel(2.5, 40))).toBe(true);
      } finally {
        if (home === undefined) delete process.env.MOCKINGBIRD_HOME;
        else process.env.MOCKINGBIRD_HOME = home;
        if (chrome === undefined) delete process.env.MOCKINGBIRD_CHROME;
        else process.env.MOCKINGBIRD_CHROME = chrome;
        rmSync(dir, { recursive: true, force: true });
      }
    },
    120_000,
  );

  test("a quiet recording comes out at -14 LUFS, its peaks under -1.5 dBTP", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-render-"));
    try {
      const source = join(dir, "quiet.mp4");
      // Quiet with loud peaks, like #127's recording of someone talking
      // (-25.8 LUFS, peaks at -0.1 dBTP): a tone pulsing on and off at about
      // -24 LUFS, and a 5 ms click every 2 s that peaks near 0 dBFS. One pass
      // of loudnorm falls short on this.
      Bun.spawnSync([
        ...[
          "ffmpeg",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=320x240:rate=30:duration=20",
        ],
        ...[
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=220:duration=20,volume='gt(sin(2*PI*t*1.5),0)':eval=frame",
        ],
        ...[
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=880:duration=20,volume='7*lt(mod(t,2),0.005)':eval=frame",
        ],
        ...["-filter_complex", "[1][2]amix=inputs=2:normalize=0[a]", "-map", "0:v", "-map", "[a]"],
        ...["-pix_fmt", "yuv420p", source],
      ]);
      const out = join(dir, "out.mp4");
      await run({ path: source, clips: [{ from: 0, to: 20 }], out });
      const meter = Bun.spawnSync([
        ...["ffmpeg", "-nostdin", "-nostats", "-i", out, "-map", "0:a"],
        ...["-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"],
      ]).stderr.toString();
      const integrated = Number(meter.match(/^\s*I:\s+(-?[\d.]+) LUFS/m)?.[1]);
      const peak = Number(meter.match(/^\s*Peak:\s+(-?[\d.]+) dBFS/m)?.[1]);
      expect(Math.abs(integrated - -14)).toBeLessThanOrEqual(0.5);
      expect(peak).toBeLessThanOrEqual(-1.5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  test("stretches already in the output's codec are copied frame for frame, and the edges encoded", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-render-"));
    try {
      const source = join(dir, "source.mp4");
      // A keyframe every second, with B-frames, as a camera or OBS records.
      Bun.spawnSync([
        ...[
          "ffmpeg",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=320x240:rate=30:duration=14",
        ],
        ...["-f", "lavfi", "-i", "sine=frequency=440:duration=14"],
        ...["-c:v", "libx264", "-g", "30", "-bf", "2", "-pix_fmt", "yuv420p", source],
      ]);
      const out = join(dir, "out.mp4");
      await run({
        path: source,
        clips: [
          { from: 1.2, to: 4.7 },
          { from: 6.1, to: 9, zoom: 1.5 },
          { from: 10.05, to: 13.3 },
        ],
        out,
      });
      const hashes = (args: string[]) =>
        Bun.spawnSync(["ffmpeg", "-v", "error", ...args, "-an", "-f", "framemd5", "-"])
          .stdout.toString()
          .split("\n")
          .filter((l) => l && !l.startsWith("#"))
          .map((l) => l.split(",").at(-1)?.trim());
      const made = hashes(["-i", out]);
      // 105 + 87 + 97 frames, each clip cut to whole frames (10.05 s is frame 302).
      expect(made.length).toBe(289);
      // The first clip's keyframes at 2 s and 4 s: frames 24 to 84 of the output are the source's, untouched.
      expect(made.slice(24, 84)).toEqual(hashes(["-ss", "2", "-i", source, "-frames:v", "60"]));
      // The output decodes with no errors, where the encoded and copied pieces meet too.
      const decode = Bun.spawnSync(["ffmpeg", "-v", "error", "-i", out, "-f", "null", "-"]);
      expect(decode.stderr.toString()).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  test("more clips than one pass opens are rendered in batches and joined", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-render-"));
    try {
      const source = join(dir, "source.mp4");
      Bun.spawnSync([
        ...[
          "ffmpeg",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=320x240:rate=30:duration=4",
        ],
        ...["-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-pix_fmt", "yuv420p", source],
      ]);
      // Tenths of a second, round and round the 4-second source.
      const clips = Array.from({ length: CLIPS_PER_PASS + 1 }, (_, i) => ({
        from: (i % 30) * 0.1,
        to: (i % 30) * 0.1 + 0.1,
      }));
      const out = join(dir, "out.mp4");
      expect(await run({ path: source, clips, out })).toStartWith(out);
      expect(seconds(out)).toBeCloseTo(10.1, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  test("a project joins a wide clip and a silent tall one into its size, with what's on them", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-project-"));
    try {
      const make = (file: string, input: string[]) =>
        Bun.spawnSync(["ffmpeg", "-loglevel", "error", ...input, "-pix_fmt", "yuv420p", file]);
      make(join(dir, "wide.mp4"), [
        ...["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30:duration=4"],
        ...["-f", "lavfi", "-i", "sine=frequency=440:duration=4"],
      ]);
      make(join(dir, "tall.mp4"), ["-f", "lavfi", "-i", "testsrc=size=240x320:rate=25:duration=4"]);
      const tool = (name: string) =>
        mcpTools(
          async () => ({}),
          () => {},
        ).find((t) => t.name === name) as { run: (a: Record<string, unknown>) => Promise<string> };
      const project = join(dir, "edit.json");
      const outline = await tool("edit").run({
        project,
        ops: [
          { op: "set", size: "360x640", fps: 30 },
          { op: "add", type: "clip", path: "wide.mp4", from: 0.5, to: 2.5 },
          { op: "add", type: "clip", path: "tall.mp4", from: 1, to: 3 },
          { op: "add", type: "text", text: "on the *tall* one", clip: "c2", from: 0, to: 1 },
          { op: "set", look: { skipped: true } },
        ],
      });
      expect(outline).toContain("c2  0:02.00-0:04.00  tall.mp4 1-3");
      const made = await tool("render").run({ project });
      const out = join(dir, "edit-render-1.mp4");
      expect(made).toStartWith(out);
      const streams = Bun.spawnSync([
        ...[
          "ffprobe",
          "-v",
          "error",
          "-show_entries",
          "stream=codec_type,width,height,r_frame_rate",
        ],
        ...["-of", "csv=p=0", out],
      ]).stdout.toString();
      expect(streams).toContain("video,360,640,30/1");
      expect(streams).toContain("audio");
      expect(seconds(out)).toBeCloseTo(4, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  test("text-based editing: a project's transcript, then cut_words, with the words heard once", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-words-"));
    const saved = {
      home: process.env.MOCKINGBIRD_HOME,
      model: process.env.MOCKINGBIRD_ASR_MODEL,
      server: process.env.MOCKINGBIRD_WHISPER_SERVER,
    };
    try {
      // The real models in a home of its own, so the user's data.db and cache are never touched.
      const home = join(dir, "home");
      mkdirSync(home);
      symlinkSync(
        join(saved.home ?? join(homedir(), ".mockingbird"), "models"),
        join(home, "models"),
      );
      process.env.MOCKINGBIRD_HOME = home;
      process.env.MOCKINGBIRD_ASR_MODEL = "ggml-base.en.bin";
      const hello = join(import.meta.dir, "../../../bench/fixtures/hello.wav");
      Bun.spawnSync([
        ...["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30"],
        ...["-i", hello, "-shortest", "-pix_fmt", "yuv420p", join(dir, "hello.mp4")],
      ]);
      const tools = mcpTools(
        async () => ({}),
        () => {},
      );
      const tool = (name: string) =>
        tools.find((t) => t.name === name) as {
          run: (a: Record<string, unknown>) => Promise<string>;
        };
      const project = join(dir, "edit.json");
      await tool("edit").run({
        project,
        ops: [{ op: "add", type: "clip", path: "hello.mp4", from: 0, to: 5 }],
      });
      const said = await tool("transcribe").run({ project });
      expect(said.toLowerCase()).toContain("hello world");
      expect(readdirSync(join(home, "cache", "words"))).toHaveLength(1);
      // Heard already: with no whisper-server that can start, a call that heard
      // the source again would fail, so this passes only from the cache.
      process.env.MOCKINGBIRD_WHISPER_SERVER = join(dir, "no-whisper-server");
      const outline = await tool("edit").run({
        project,
        ops: [{ op: "cut_words", text: "hello world" }],
      });
      expect(outline).toMatch(/cut "hello world,?" \(2 words/);
      expect((await tool("transcribe").run({ project })).toLowerCase()).not.toContain(
        "hello world",
      );
    } finally {
      process.env.MOCKINGBIRD_HOME = saved.home;
      process.env.MOCKINGBIRD_ASR_MODEL = saved.model;
      if (saved.home === undefined) delete process.env.MOCKINGBIRD_HOME;
      if (saved.model === undefined) delete process.env.MOCKINGBIRD_ASR_MODEL;
      if (saved.server === undefined) delete process.env.MOCKINGBIRD_WHISPER_SERVER;
      else process.env.MOCKINGBIRD_WHISPER_SERVER = saved.server;
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);

  test("two calls filling one word cache keep both, and transcribe keeps a project's model (#235)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-words-"));
    const saved = { home: process.env.MOCKINGBIRD_HOME, model: process.env.MOCKINGBIRD_ASR_MODEL };
    try {
      const home = join(dir, "home");
      mkdirSync(home);
      symlinkSync(
        join(saved.home ?? join(homedir(), ".mockingbird"), "models"),
        join(home, "models"),
      );
      process.env.MOCKINGBIRD_HOME = home;
      process.env.MOCKINGBIRD_ASR_MODEL = "ggml-base.en.bin";
      const hello = join(dir, "hello.wav");
      copyFileSync(join(import.meta.dir, "../../../bench/fixtures/hello.wav"), hello);
      // Two stretches of one source at once: the second waits, then hears only its own.
      const ask = (from: number, to: number) =>
        sourceWords(new Map([[hello, [{ from, to }]]]), () => {});
      await Promise.all([ask(0, 1.5), ask(3, 4.5)]);
      const [cached] = readdirSync(join(home, "cache", "words"));
      const heard = JSON.parse(readFileSync(join(home, "cache", "words", String(cached)), "utf8"));
      expect(heard.covered).toEqual([
        { from: 0, to: 1.5 },
        { from: 3, to: 4.5 },
      ]);

      const tool = (name: string) =>
        mcpTools(
          async () => ({}),
          () => {},
        ).find((t) => t.name === name) as { run: (a: Record<string, unknown>) => Promise<string> };
      const project = join(dir, "edit.json");
      await tool("edit").run({
        project,
        ops: [{ op: "add", type: "clip", path: "hello.wav", from: 0, to: 4.5 }],
      });
      await expect(tool("transcribe").run({ project, model: "../data.db" })).rejects.toThrow(
        "model takes a file name",
      );
      expect(JSON.parse(readFileSync(project, "utf8"))).not.toHaveProperty("transcription");
      const said = await tool("transcribe").run({
        project,
        model: "ggml-base.en.bin",
        language: "en",
      });
      expect(said.toLowerCase()).toContain("hello world");
      expect(JSON.parse(readFileSync(project, "utf8")).transcription).toEqual({
        model: "ggml-base.en.bin",
        language: "en",
      });
    } finally {
      process.env.MOCKINGBIRD_HOME = saved.home;
      process.env.MOCKINGBIRD_ASR_MODEL = saved.model;
      if (saved.home === undefined) delete process.env.MOCKINGBIRD_HOME;
      if (saved.model === undefined) delete process.env.MOCKINGBIRD_ASR_MODEL;
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);

  test("a project with speed, a transition and a push renders to the length they add up to", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-moves-"));
    try {
      const make = (file: string, input: string[]) =>
        Bun.spawnSync(["ffmpeg", "-loglevel", "error", ...input, "-pix_fmt", "yuv420p", file]);
      make(join(dir, "a.mp4"), [
        ...["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=6"],
        ...["-f", "lavfi", "-i", "sine=frequency=440:duration=6"],
      ]);
      make(join(dir, "b.mp4"), [
        ...["-f", "lavfi", "-i", "smptebars=size=640x360:rate=25:duration=6"],
        ...["-f", "lavfi", "-i", "sine=frequency=660:duration=6"],
      ]);
      const tool = (name: string) =>
        mcpTools(
          async () => ({}),
          () => {},
        ).find((t) => t.name === name) as { run: (a: Record<string, unknown>) => Promise<string> };
      const project = join(dir, "edit.json");
      await tool("edit").run({
        project,
        ops: [
          { op: "set", size: "640x360", fps: 30 },
          { op: "add", type: "clip", path: "a.mp4", from: 0, to: 3, moves: [{ at: 3, zoom: 1.5 }] },
          {
            op: "add",
            type: "clip",
            path: "b.mp4",
            from: 0,
            to: 4,
            speed: 2,
            transition: { type: "dissolve", duration: 0.5 },
          },
        ],
      });
      await tool("render").run({ project });
      const out = join(dir, "edit-render-1.mp4");
      const streams = Bun.spawnSync([
        ...["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,duration"],
        ...["-of", "csv=p=0", out],
      ]).stdout.toString();
      // 3 s + 4 s at 2x - 0.5 s of transition = 4.5 s, picture and sound alike.
      expect(seconds(out)).toBeCloseTo(4.5, 1);
      expect(streams).toContain("video,640,360");
      for (const line of streams.trim().split("\n")) {
        expect(Number(line.split(",").at(-1))).toBeCloseTo(4.5, 1);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  test("a J cut's sound plays before its picture, and an L cut's after", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-jcut-"));
    try {
      const make = (file: string, picture: string, hz: number) =>
        Bun.spawnSync([
          ...[
            "ffmpeg",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            `${picture}=size=320x240:rate=30:duration=6`,
          ],
          ...["-f", "lavfi", "-i", `sine=frequency=${hz}:duration=6`, "-pix_fmt", "yuv420p", file],
        ]);
      make(join(dir, "low.mp4"), "testsrc2", 440);
      make(join(dir, "high.mp4"), "smptebars", 1760);
      const tool = (name: string) =>
        mcpTools(
          async () => ({}),
          () => {},
        ).find((t) => t.name === name) as { run: (a: Record<string, unknown>) => Promise<string> };
      const project = join(dir, "edit.json");
      // low 0-2, high 2-4 with a J cut of 0.5 s, low again 4-6 with an L cut of 0.5 s.
      await tool("edit").run({
        project,
        ops: [
          { op: "set", fps: 30 },
          { op: "add", type: "clip", path: "low.mp4", from: 1, to: 3 },
          { op: "add", type: "clip", path: "high.mp4", from: 1, to: 3, lead: 0.5 },
          { op: "add", type: "clip", path: "low.mp4", from: 3, to: 5, lead: -0.5 },
        ],
      });
      await tool("render").run({ project });
      const out = join(dir, "edit-render-1.mp4");
      // How loud the high tone is over a stretch: under -40 dB, it isn't playing.
      const high = (at: number) => {
        const said = Bun.spawnSync([
          ...["ffmpeg", "-nostats", "-ss", String(at), "-t", "0.2", "-i", out],
          ...[
            "-af",
            "highpass=f=1200,highpass=f=1200,astats=measure_overall=RMS_level",
            "-f",
            "null",
            "-",
          ],
        ]).stderr.toString();
        return Number(
          said
            .match(/RMS level dB: (-?[\d.inf]+)/g)
            ?.at(-1)
            ?.split(": ")[1],
        );
      };
      expect(seconds(out)).toBeCloseTo(6, 1);
      expect(high(1.0)).toBeLessThan(-40);
      // The high clip's picture starts at 2 s; its sound at 1.5 s.
      expect(high(1.65)).toBeGreaterThan(-30);
      expect(high(3.0)).toBeGreaterThan(-30);
      // Its sound carries on 0.5 s over the next clip's picture, then stops.
      expect(high(4.2)).toBeGreaterThan(-30);
      expect(high(4.8)).toBeLessThan(-40);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  test("a draft is half the size, read from a proxy kept for the next draft", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-draft-"));
    const saved = process.env.MOCKINGBIRD_HOME;
    try {
      process.env.MOCKINGBIRD_HOME = join(dir, "home");
      // Bigger than 1080 on its short side, so it's drafted from a proxy.
      Bun.spawnSync([
        ...[
          "ffmpeg",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=1440x2560:rate=30:duration=3",
        ],
        ...[
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:duration=3",
          "-pix_fmt",
          "yuv420p",
          join(dir, "big.mp4"),
        ],
      ]);
      const tool = (name: string) =>
        mcpTools(
          async () => ({}),
          () => {},
        ).find((t) => t.name === name) as { run: (a: Record<string, unknown>) => Promise<string> };
      const project = join(dir, "edit.json");
      await tool("edit").run({
        project,
        ops: [{ op: "add", type: "clip", path: "big.mp4", from: 0.5, to: 2.5 }],
      });
      expect(await tool("render").run({ project, draft: true })).toStartWith(
        join(dir, "edit-draft-1.mp4"),
      );
      const size = (file: string) =>
        Bun.spawnSync([
          ...["ffprobe", "-v", "error", "-select_streams", "v:0"],
          ...["-show_entries", "stream=width,height", "-of", "csv=p=0", file],
        ])
          .stdout.toString()
          .trim();
      // Half the source's size, not the 720-line proxy's.
      expect(size(join(dir, "edit-draft-1.mp4"))).toBe("720,1280");
      expect(seconds(join(dir, "edit-draft-1.mp4"))).toBeCloseTo(2, 1);
      const proxies = join(dir, "home", "cache", "proxies");
      expect(readdirSync(proxies)).toHaveLength(1);
      await tool("render").run({ project, draft: true });
      expect(readdirSync(proxies)).toHaveLength(1);
      // The sound alone, asked for as a draft too: there's no picture to make smaller.
      expect(await tool("render").run({ project, draft: true, sound: true })).toContain(".m4a");
    } finally {
      if (saved === undefined) delete process.env.MOCKINGBIRD_HOME;
      else process.env.MOCKINGBIRD_HOME = saved;
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  test("captions for a project are timed to its cut, at its clips' speed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-pcap-"));
    const saved = { home: process.env.MOCKINGBIRD_HOME, model: process.env.MOCKINGBIRD_ASR_MODEL };
    try {
      const home = join(dir, "home");
      mkdirSync(home);
      symlinkSync(
        join(saved.home ?? join(homedir(), ".mockingbird"), "models"),
        join(home, "models"),
      );
      process.env.MOCKINGBIRD_HOME = home;
      process.env.MOCKINGBIRD_ASR_MODEL = "ggml-base.en.bin";
      const hello = join(import.meta.dir, "../../../bench/fixtures/hello.wav");
      Bun.spawnSync([
        ...["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30"],
        ...["-i", hello, "-shortest", "-pix_fmt", "yuv420p", join(dir, "hello.mp4")],
      ]);
      const tool = (name: string) =>
        mcpTools(
          async () => ({}),
          () => {},
        ).find((t) => t.name === name) as { run: (a: Record<string, unknown>) => Promise<string> };
      const project = join(dir, "edit.json");
      const end = (srt: string) =>
        Math.max(
          ...[...srt.matchAll(/(\d\d):(\d\d):(\d\d),(\d\d\d) -->/g)].map(
            ([, h, m, sec, ms]) =>
              Number(h) * 3600 + Number(m) * 60 + Number(sec) + Number(ms) / 1000,
          ),
        );
      await tool("edit").run({
        project,
        ops: [{ op: "add", type: "clip", path: "hello.mp4", from: 0, to: 5 }],
      });
      const normal = await tool("captions").run({ project, lit: false });
      expect(normal.toLowerCase()).toContain("hello");
      await tool("edit").run({ project, ops: [{ op: "set", id: "c1", speed: 2 }] });
      const fast = await tool("captions").run({ project, lit: false });
      // The last cue starts at half the time: its words are said twice as fast.
      // (Its end isn't halved: a cue holds 0.2 s of finished video after its last word.)
      expect(end(fast)).toBeCloseTo(end(normal) / 2, 1);
    } finally {
      process.env.MOCKINGBIRD_HOME = saved.home;
      process.env.MOCKINGBIRD_ASR_MODEL = saved.model;
      if (saved.home === undefined) delete process.env.MOCKINGBIRD_HOME;
      if (saved.model === undefined) delete process.env.MOCKINGBIRD_ASR_MODEL;
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);

  test("scenes finds each cut to within a frame, timed in the file even after a seek", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-scenes-"));
    try {
      const file = join(dir, "cuts.mp4");
      // Three shots of 2 s at 30 fps: cuts at 2 s and 4 s.
      Bun.spawnSync([
        ...[
          "ffmpeg",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=320x240:rate=30:d=2",
        ],
        ...["-f", "lavfi", "-i", "smptebars=size=320x240:rate=30:d=2"],
        ...["-f", "lavfi", "-i", "color=c=red:size=320x240:rate=30:d=2"],
        ...["-filter_complex", "[0][1][2]concat=n=3:v=1:a=0", "-pix_fmt", "yuv420p", file],
      ]);
      const tool = mcpTools(
        async () => ({}),
        () => {},
      ).find((t) => t.name === "scenes");
      const all = (await tool?.run({ path: file })) ?? "";
      expect(all).toContain(": 2 cuts from 00:00.00 to 00:06.00, 20.0 a minute, 2.0 s a shot");
      expect(all).toMatch(/\[00:02\.0\d\] \d/);
      expect(all).toMatch(/\[00:04\.0\d\] \d/);
      const later = (await tool?.run({ path: file, from: 3 })) ?? "";
      expect(later).toContain(": 1 cut from 00:03.00 to 00:06.00");
      expect(later).toMatch(/\[00:04\.0\d\]/);
      // A cut on the first frame looked at counts (#226).
      const onCut = (await tool?.run({ path: file, from: 2, to: 3 })) ?? "";
      expect(onCut).toContain(": 1 cut from 00:02.00 to 00:03.00");
      // A file whose length ffprobe can't tell is scanned over the range asked for.
      // Matroska written to a pipe has no duration.
      const raw = join(dir, "cuts.mkv");
      const piped = Bun.spawnSync([
        "ffmpeg",
        "-loglevel",
        "error",
        "-i",
        file,
        "-c",
        "copy",
        "-f",
        "matroska",
        "-",
      ]);
      writeFileSync(raw, piped.stdout);
      const unknown = (await tool?.run({ path: raw, from: 1, to: 5 })) ?? "";
      expect(unknown).toContain(": 2 cuts from 00:01.00 to 00:05.00");
      const toEnd = (await tool?.run({ path: raw })) ?? "";
      expect(toEnd).toContain(": 2 cuts from 00:00.00 to the end (its length is unknown)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

test("motion takes only an HTML page, and says where canvas scripts went", async () => {
  const motion = mcpTools(
    async () => ({}),
    () => {},
  ).find((t) => t.name === "motion");
  if (!motion) throw new Error("no motion tool");
  await expect(motion.run({ script: import.meta.path, duration: 1 })).rejects.toThrow(
    "motion renders an HTML page",
  );
});

test.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)(
  'a three.js page imports "THREE" and draws a lit 3D scene (#270)',
  async () => {
    const motion = mcpTools(
      async () => ({}),
      () => {},
    ).find((t) => t.name === "motion");
    if (!motion) throw new Error("no motion tool");
    const dir = mkdtempSync(join(tmpdir(), "mb-three-"));
    try {
      const template = join(
        import.meta.dir,
        "../../../plugin/skills/motion-graphics/templates/three.html",
      );
      const out = join(dir, "three.mp4");
      expect(await motion.run({ script: template, size: "320x180", duration: 1, out })).toContain(
        "(00:01, 320x180, 30 fps)",
      );
      // The floor and the plane are lit: the last frame isn't just the background colour.
      const frame = Bun.spawnSync(
        [
          "ffmpeg",
          "-nostdin",
          "-loglevel",
          "error",
          "-sseof",
          "-0.1",
          "-i",
          out,
          "-frames:v",
          "1",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "gray",
          "-",
        ],
        { stdout: "pipe" },
      ).stdout;
      const levels = new Set(frame);
      expect(levels.size).toBeGreaterThan(8);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  120_000,
);

describe("music", () => {
  const music = mcpTools(
    async () => ({}),
    () => {},
  ).find((t) => t.name === "music");
  if (!music) throw new Error("no music tool");
  const generator = join(import.meta.dir, "../../../plugin/skills/music/generators/lofi.js");

  test("checks the energy curve and the file names before starting Chrome", async () => {
    const base = { script: generator, duration: 10, out: "/tmp/never.wav" };
    await expect(music.run({ ...base, energy: 1.5 })).rejects.toThrow("energy must be from 0 to 1");
    await expect(music.run({ ...base, energy: [] })).rejects.toThrow("at least one");
    await expect(
      music.run({
        ...base,
        energy: [
          [5, 0.5],
          [2, 0.1],
        ],
      }),
    ).rejects.toThrow("time order");
    await expect(music.run({ ...base, energy: [[1, 2, 3]] })).rejects.toThrow("[seconds, level]");
    await expect(music.run({ ...base, out: "/tmp/never.mp3" })).rejects.toThrow(".wav");
    await expect(music.run({ ...base, script: "/tmp/gen.ts" })).rejects.toThrow();
  });

  test.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)(
    "lo-fi comes out at -14 LUFS, the same track twice, a different one for another seed",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "mb-music-"));
      try {
        const make = async (name: string, seed = 1) => {
          const out = join(dir, name);
          const said = await music.run({
            script: generator,
            duration: 20,
            out,
            seed,
            energy: [
              [0, 0.2],
              [8, 0.9],
            ],
          });
          expect(said).toMatch(/\(00:20, 48 kHz stereo, -1[34]\.\d LUFS\)/);
          return new Int16Array((await Bun.file(out).arrayBuffer()).slice(44));
        };
        const [a, b, c] = [await make("a.wav"), await make("b.wav"), await make("c.wav", 2)];
        const most = (x: Int16Array, y: Int16Array) =>
          x.reduce((m, v, i) => Math.max(m, Math.abs(v - (y[i] ?? 0))), 0);
        // Chrome's mixer rounds the last float bits differently run to run: a few steps of 32768.
        expect(most(a, b)).toBeLessThanOrEqual(8);
        expect(most(a, c)).toBeGreaterThan(1000);
        const meter = Bun.spawnSync([
          ...["ffmpeg", "-nostats", "-i", join(dir, "a.wav")],
          ...["-af", "ebur128=peak=true", "-f", "null", "-"],
        ]).stderr.toString();
        const loud = Number(
          meter
            .match(/I:\s+(-?[\d.]+) LUFS/g)
            ?.at(-1)
            ?.split(/\s+/)[1],
        );
        expect(Math.abs(loud + 14)).toBeLessThan(0.5);
        await expect(
          music.run({ script: generator, duration: 5, out: join(dir, "a.wav") }),
        ).rejects.toThrow("already exists");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    120_000,
  );
});

test("motion fills in a page's `from \"KIT\"` with the kit's file URL, beside the page (#213)", () => {
  expect(existsSync(fileURLToPath(KIT_URL))).toBe(true);
  const dir = mkdtempSync(join(tmpdir(), "mb-kit-"));
  try {
    const page = join(dir, "short.html");
    // The comment comes first, as in the templates: it stays as written.
    writeFileSync(
      page,
      '<script type="module">\n// replace "KIT"? no\nimport { kit } from "KIT";\n</script>',
    );
    const copy = withKit(page);
    expect(dirname(copy)).toBe(dir);
    expect(readFileSync(copy, "utf8")).toBe(
      `<script type="module">\n// replace "KIT"? no\nimport { kit } from ${JSON.stringify(KIT_URL)};\n</script>`,
    );
    const plain = join(dir, "plain.html");
    writeFileSync(plain, '<script type="module">import { kit } from "./kit.js";</script>');
    expect(withKit(plain)).toBe(plain);
    // The explainer styles come in the same way.
    expect(existsSync(fileURLToPath(STYLES_URL))).toBe(true);
    const styled = join(dir, "styled.html");
    writeFileSync(styled, '<script type="module">import { style } from "STYLES";</script>');
    expect(readFileSync(withKit(styled), "utf8")).toBe(
      `<script type="module">import { style } from ${JSON.stringify(STYLES_URL)};</script>`,
    );
    // And three.js, shipped with the plugin (#270).
    expect(existsSync(fileURLToPath(THREE_URL))).toBe(true);
    const three = join(dir, "three.html");
    writeFileSync(three, '<script type="module">import * as THREE from "THREE";</script>');
    expect(readFileSync(withKit(three), "utf8")).toBe(
      `<script type="module">import * as THREE from ${JSON.stringify(THREE_URL)};</script>`,
    );
    // Its add-ons beside it, importing the same copy of three.js (#275).
    const addons = readFileSync(fileURLToPath(THREE_ADDONS_URL), "utf8");
    expect(addons).toContain('from"./three.module.min.js"');
    expect(addons).not.toContain('from"three"');
    const lit = join(dir, "lit.html");
    writeFileSync(
      lit,
      '<script type="module">import * as THREE from "THREE"; import { OutputPass } from "THREE_ADDONS";</script>',
    );
    expect(readFileSync(withKit(lit), "utf8")).toBe(
      `<script type="module">import * as THREE from ${JSON.stringify(THREE_URL)}; import { OutputPass } from ${JSON.stringify(THREE_ADDONS_URL)};</script>`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an insert or adjustment layer refuses an effect that would do nothing there (#257)", async () => {
  const render = mcpTools(
    async () => ({}),
    () => {},
  ).find((t) => t.name === "render") as { run: (a: Record<string, unknown>) => Promise<string> };
  const clips = [{ from: 0, to: 2 }];
  // The source only has to be there: the effects are refused before it's read.
  const dir = mkdtempSync(join(tmpdir(), "mb-fx-"));
  const path = join(dir, "a.mp4");
  writeFileSync(path, "");
  await expect(
    render.run({
      path,
      clips,
      inserts: [{ path: "/b.mp4", from: 0, to: 1, effects: [{ name: "gain", db: 6 }] }],
    }),
  ).rejects.toThrow("inserts[0].effects[0]: gain works on a clip");
  await expect(
    render.run({
      path,
      clips,
      adjust: [{ from: 0, to: 1, effects: [{ name: "interpolate" }] }],
    }),
  ).rejects.toThrow("adjust[0].effects[0]: interpolate works on a clip");
  rmSync(dir, { recursive: true, force: true });
});

test("the speech is measured as the render hears it, gain and J cut included (#257)", () => {
  const clip = {
    path: "/a.mp4",
    from: 2,
    to: 4,
    speed: 2,
    effects: [{ name: "gain", db: 15 }],
    sound: { from: 1.5, to: 4 },
  };
  // A project's level puts a gain on each clip: measuring without it would lift the speech twice.
  expect(soundOf(clip, 0, { width: 1, height: 1, fps: 30, length: 1 })).toBe(
    "[0:a]atrim=start=0:duration=2.5,asetpts=PTS-STARTPTS,atempo=2,volume=15dB",
  );
});

test("a draft with graphics waits for the look too, and an approved look has to be there (#264)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mb-gate-"));
  try {
    const tool = (name: string) =>
      mcpTools(
        async () => ({}),
        () => {},
      ).find((t) => t.name === name) as { run: (a: Record<string, unknown>) => Promise<string> };
    const project = join(dir, "edit.json");
    await tool("edit").run({
      project,
      ops: [
        { op: "add", type: "clip", path: "talk.mp4", from: 0, to: 3 },
        { op: "add", type: "text", text: "Hi", clip: "c1", from: 0, to: 1 },
      ],
    });
    await expect(tool("render").run({ project, draft: true })).rejects.toThrow(
      "hasn't approved a look",
    );
    await tool("edit").run({
      project,
      ops: [{ op: "set", look: { file: "gone.ts", approved: true } }],
    });
    await expect(tool("render").run({ project })).rejects.toThrow("isn't there");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cut_words hears with the transcription the batch set before it (#235)", () => {
  const p = { version: 1, clips: [], texts: [], inserts: [], audio: [] } as unknown as Parameters<
    typeof transcriptionAt
  >[0];
  const set = { op: "set", transcription: { model: "ggml-base.en.bin", language: "en" } };
  const cut = { op: "cut_words", text: "um" };
  expect(transcriptionAt(p, [set, cut])).toEqual({ model: "ggml-base.en.bin", language: "en" });
  // Set after the cut: the cut is made on the words heard before it.
  expect(transcriptionAt(p, [cut, set])).toBeUndefined();
});

test("level brings each source to the target once, within 30 dB (#265)", async () => {
  const loud: Record<string, number> = {
    "/a.mp4": -39.7,
    "/b.mp4": -14.2,
    "/c.mp4": -55,
    "/mute.mp4": -Infinity,
    "/card.mp4": -70,
  };
  const seen: string[] = [];
  const paths = ["/a.mp4", "/b.mp4", "/a.mp4", "/c.mp4", "/mute.mp4", "/card.mp4"];
  const gains = await levelGains(paths, -16, async (p) => {
    seen.push(p);
    return loud[p] ?? -Infinity;
  });
  // Each source measured once.
  expect(seen).toEqual(["/a.mp4", "/b.mp4", "/c.mp4", "/mute.mp4", "/card.mp4"]);
  expect(gains.get("/a.mp4")).toEqual({ measured: -39.7, db: 23.7 });
  expect(gains.get("/b.mp4")?.db).toBe(-1.8);
  expect(gains.get("/c.mp4")?.db).toBe(30);
  // Silence, or a card with no sound, is left alone.
  expect(gains.has("/mute.mp4")).toBe(false);
  expect(gains.has("/card.mp4")).toBe(false);
});

describe("look (#262)", () => {
  test("a look builds into one module that imports STYLES and THREE by their files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-look-"));
    try {
      const file = join(dir, "warm.ts");
      writeFileSync(
        file,
        'import { frame } from "STYLES";\nimport * as THREE from "THREE";\nexport const v = new THREE.Vector3();\nexport default { id: "warm", name: "Warm", category: "Test", make: (ctx: any, t: number, m: any) => frame(m) };\n',
      );
      const built = await buildLook(file);
      expect(built).toBe(join(dir, "warm.look.js"));
      const code = readFileSync(built, "utf8");
      expect(code).not.toContain('from "STYLES"');
      // One copy of the styles: the page's, not one bundled into each look.
      expect(code).toContain(STYLES_URL);
      expect(code).not.toContain("function frame");
      expect(code).toContain(THREE_URL);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a look outside the plugin finds the kit's sounds in the plugin (#263)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-look-"));
    try {
      const file = join(dir, "loud.ts");
      writeFileSync(
        file,
        'import { sfx } from "KIT";\nimport { frame } from "STYLES";\nexport const whoosh = sfx("whoosh");\nexport default { id: "loud", name: "Loud", category: "Test", make: (ctx: any, t: number, m: any) => frame(m) };\n',
      );
      const code = readFileSync(await buildLook(file), "utf8");
      // The kit isn't bundled: the page imports the plugin's kit.js, whose sounds sit beside it.
      expect(code).toContain(KIT_URL);
      expect(code).not.toContain("assets/sfx/");
      expect(existsSync(join(dirname(fileURLToPath(KIT_URL)), "assets", "sfx", "whoosh.wav"))).toBe(
        true,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a mistake in a look comes back with where it is", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-look-"));
    try {
      const file = join(dir, "broken.ts");
      writeFileSync(file, "export default {\n  make(ctx) { return ctx.\n};\n");
      await expect(buildLook(file)).rejects.toThrow(/doesn't build[\s\S]*broken\.ts/);
      await expect(buildLook(join(dir, "look.css"))).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("board words are checked before anything renders", () => {
    expect(
      boardFrom({ title: "Sleep", points: ["a", "b"], stat: { value: 40, unit: "%" } }),
    ).toEqual({
      title: "Sleep",
      points: ["a", "b"],
      stat: { value: 40, unit: "%", label: undefined },
    });
    expect(boardFrom(undefined).title).toBe("Your video");
    // null is no stat; a label padded past the limit fits once trimmed.
    expect(boardFrom({ stat: null }).stat).toBeUndefined();
    expect(boardFrom({ points: [`  ${"x".repeat(24)}  `] }).points).toEqual(["x".repeat(24)]);
    expect(() => boardFrom({ stat: 5 })).toThrow("board.stat must be");
    // A drop is a stat too.
    expect(boardFrom({ stat: { value: -40, unit: "%" } }).stat?.value).toBe(-40);
    expect(() => boardFrom({ points: ["a", "b", "c", "d"] })).toThrow("up to three");
    expect(() => boardFrom({ title: "x".repeat(61) })).toThrow("keep it to 60");
  });

  test("the board page has the places look fills in", () => {
    const html = readFileSync(LOOK_BOARD, "utf8");
    expect(html).toContain('from "LOOK"');
    expect(html).toContain('const BOARD = "BOARD";');
    expect(html).toContain('from "KIT"');
  });
});

test("a look can be built to a path of its own (#262 review)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mb-look-"));
  try {
    const file = join(dir, "warm.ts");
    writeFileSync(
      file,
      'export default { id: "w", name: "W", category: "T", make: () => ({}) };\n',
    );
    const mine = join(dir, ".warm.ts.123.look.js");
    expect(await buildLook(file, mine)).toBe(mine);
    expect(existsSync(mine)).toBe(true);
    expect(existsSync(join(dir, "warm.look.js"))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("captions in a font that isn't downloaded are drawn anyway, with a warning (#276)", () => {
  const saved = { home: process.env.MOCKINGBIRD_HOME, chrome: process.env.MOCKINGBIRD_CHROME };
  process.env.MOCKINGBIRD_HOME = mkdtempSync(join(tmpdir(), "no-fonts-"));
  process.env.MOCKINGBIRD_CHROME = process.execPath;
  try {
    const style = captionStyle("creator");
    expect(captionFontWarning("1\n00:00:00,000 --> 00:00:01,000\nhi", style)).toMatch(
      /Montserrat, isn't downloaded.*models pull chrome/,
    );
    expect(captionFontWarning(undefined, style)).toBe("");
  } finally {
    for (const [k, v] of [
      ["MOCKINGBIRD_HOME", saved.home],
      ["MOCKINGBIRD_CHROME", saved.chrome],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("a caption style with a look takes that style's font and accent (#276)", () => {
  // art-deco's title is Montserrat, a caption font; its accent is gold.
  expect(lookCaptions({ look: "art-deco", preset: "creator" })).toMatchObject({
    preset: "creator",
    font: "Montserrat",
    active: expect.stringMatching(/^#[0-9a-f]{6}$/),
  });
  // A field given still wins.
  expect(lookCaptions({ look: "art-deco", font: "Anton" })).toMatchObject({ font: "Anton" });
  expect(() => lookCaptions({ look: "no-such-style" })).toThrow('no style "no-such-style"');
  // comic's accent is near black, which would vanish on the outline: the preset's stays.
  expect(lookCaptions({ look: "comic", preset: "creator" })).not.toHaveProperty("active");
  expect(lookCaptions("creator")).toBe("creator");
  // pill keeps its dark word and takes the accent behind it; subtitle lights nothing.
  const pill = lookCaptions({ look: "art-deco", preset: "pill" });
  expect(pill).toMatchObject({ pill: expect.stringMatching(/^#[0-9a-f]{6}$/) });
  expect(pill).not.toHaveProperty("active");
  expect(lookCaptions({ look: "art-deco", preset: "subtitle" })).not.toHaveProperty("active");
});
