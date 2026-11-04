import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  align,
  CLIPS_PER_PASS,
  chunks,
  fineClock,
  handle,
  mcpTools,
  mixGraph,
  moving,
  PROMPTS,
  renderGraph,
  seekClips,
  spans,
  tempo,
  timedLines,
  timedWords,
  timeline,
  uncovered,
  union,
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
  ).toEqual(["-ss", "1", "-t", "1.5", "-i", "/v.mp4", "-ss", "10", "-t", "2", "-i", "/v.mp4"]);
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
    "[0:v]setpts=PTS-STARTPTS,scale='trunc(iw*sar/2)*2':ih,setsar=1[v0];" +
      "[0:a]asetpts=PTS-STARTPTS[a0];" +
      "[1:v]setpts=PTS-STARTPTS,scale='trunc(iw*sar/2)*2':ih,setsar=1[v1];" +
      "[1:a]asetpts=PTS-STARTPTS[a1];" +
      "[v0][a0][v1][a1]concat=n=2:v=1:a=1[joined][speech];[joined]null[v];" +
      "[speech]atrim=duration=3.5[a]",
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
    "[0:v]setpts=PTS-STARTPTS,scale='trunc(iw*sar/2)*2':ih,setsar=1," +
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
  // Both get square pixels, for concat; only the zoomed clip is cropped.
  expect(graph).toStartWith("[0:v]setpts=PTS-STARTPTS,scale='trunc(iw*sar/2)*2':ih,setsar=1[v0];");
  expect(graph).toContain(
    "crop=w='floor(iw/1.2/2)*2':h='floor(ih/1.2/2)*2':x='clip(0.3*iw-ow/2,0,iw-ow)':y='clip(0.4*ih-oh/2,0,ih-oh)',scale=1280:720,setsar=1[v1]",
  );
});

test("a project's clips from different sources are framed to one size and rate, a silent one given silence", () => {
  const graph = renderGraph(
    [
      { from: 0, to: 2, path: "/wide.mp4" },
      { from: 1, to: 4, path: "/phone.mov", focus: { x: 0.3, y: 0.5 }, zoom: 1.5, silent: true },
    ],
    { audio: true, vertical: false, size: "1080x1920", fps: 30 },
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
    ...["-ss", "1", "-t", "1", "-i", "/phone.mov"],
  ]);
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
    { audio: true, vertical: false, size: "1280x720", fps: 30 },
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
    ...["-ss", "10", "-t", "3.5", "-i", "/a.mp4"],
    ...["-ss", "19.5", "-t", "4.5", "-i", "/b.mp4"],
  ]);
  const graph = renderGraph(clips, { audio: true, vertical: false, size: "640x360", fps: 30 });
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
    vertical: false,
    whole: true,
  });
  expect(graph).toEndWith("[speech]anull[a]");
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
  // No sound at all: nothing to mix.
  expect(mixGraph([], { speech: false, length: 4, first: 1 })).toEqual([]);
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
    const saved = { home: process.env.MOCKINGBIRD_HOME, model: process.env.MOCKINGBIRD_ASR_MODEL };
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
      // Heard already: with a model by the same name that can't load, a call that
      // started whisper-server would fail, so this passes only from the cache.
      mkdirSync(join(dir, "fake"));
      writeFileSync(join(dir, "fake", "ggml-base.en.bin"), "");
      process.env.MOCKINGBIRD_ASR_MODEL = join(dir, "fake", "ggml-base.en.bin");
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
});
