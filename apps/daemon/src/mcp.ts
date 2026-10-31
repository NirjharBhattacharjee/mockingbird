import {
  closeSync,
  copyFileSync,
  mkdtempSync,
  openSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { type AsrWord, stripNonSpeech } from "@mockingbird/asr";
import { loadAudio, type PcmAudio } from "@mockingbird/audio";
import { type Cue, drawCaptions, parseSrt } from "@mockingbird/captions";
import { correctNames } from "@mockingbird/llm";
import type { SpeechSegment } from "@mockingbird/vad";
import { formatEntry, readDictionary, tellDaemon } from "./dictionary.ts";
import type { PipelineDeps } from "./pipeline.ts";
import { freePort, requireFile, startEngines } from "./runtime.ts";

/**
 * `mockingbird mcp` (#88): mockingbird's local functions as Model Context
 * Protocol tools, for an AI client the user registers it with. It speaks
 * JSON-RPC over stdin/stdout only, no port, and calls no model in the
 * cloud. What a tool returns goes wherever the client sends it.
 */

type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  run: (args: Record<string, unknown>) => Promise<string>;
};

/**
 * A ready-made request the user can pick in their client, which tells the
 * client's model how to use the tools for one job.
 */
type Prompt = {
  name: string;
  description: string;
  arguments: { name: string; description: string; required: boolean }[];
  text: (args: Record<string, unknown>) => string;
};

type Message = {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: { protocolVersion?: string; name?: string; arguments?: Record<string, unknown> };
};

/** The MCP versions this server speaks, newest first. It uses nothing newer than tools and prompts. */
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

/** One JSON-RPC message in, its reply out; undefined for a notification. */
export async function handle(
  message: Message,
  tools: Tool[],
  prompts: Prompt[] = [],
): Promise<object | undefined> {
  const { id, method, params } = message;
  if (id === undefined) return undefined;
  const reply = (result: object) => ({ jsonrpc: "2.0", id, result });
  switch (method) {
    case "initialize":
      return reply({
        // The client's version if it's one this speaks, else the newest; the
        // client then decides whether it can go on (MCP lifecycle).
        protocolVersion: VERSIONS.find((v) => v === params?.protocolVersion) ?? VERSIONS[0],
        capabilities: { tools: {}, prompts: {} },
        serverInfo: { name: "mockingbird", version: "1" },
      });
    case "ping":
      return reply({});
    case "prompts/list":
      return reply({ prompts: prompts.map(({ text, ...prompt }) => prompt) });
    case "prompts/get": {
      const prompt = prompts.find((p) => p.name === params?.name);
      const missing = prompt?.arguments.find((a) => a.required && !params?.arguments?.[a.name]);
      if (!prompt || missing) {
        const message = prompt
          ? `${prompt.name} needs ${missing?.name}`
          : `no prompt ${params?.name}`;
        return { jsonrpc: "2.0", id, error: { code: -32602, message } };
      }
      return reply({
        description: prompt.description,
        messages: [
          { role: "user", content: { type: "text", text: prompt.text(params?.arguments ?? {}) } },
        ],
      });
    }
    case "tools/list":
      return reply({ tools: tools.map(({ run, ...tool }) => tool) });
    case "tools/call": {
      const tool = tools.find((t) => t.name === params?.name);
      if (!tool) {
        return { jsonrpc: "2.0", id, error: { code: -32602, message: `no tool ${params?.name}` } };
      }
      try {
        const text = await tool.run(params?.arguments ?? {});
        return reply({ content: [{ type: "text", text }] });
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        return reply({ content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `no method ${method}` } };
  }
}

/**
 * Groups VAD's speech segments into chunks of at most `maxSamples`, so a long
 * recording goes to Whisper a piece at a time: each piece keeps its place in
 * the file for timestamps, and long silences never reach Whisper at all.
 * A single segment longer than that stays whole rather than being cut, which
 * would split a word: Whisper reads long input in 30-second windows itself,
 * and timedLines takes the timestamps from its word times.
 */
export function chunks(segments: SpeechSegment[], maxSamples: number): SpeechSegment[] {
  const out: SpeechSegment[] = [];
  for (const s of segments) {
    const last = out.at(-1);
    if (last && s.endSample - last.startSample <= maxSamples) last.endSample = s.endSample;
    else out.push({ ...s });
  }
  return out;
}

/**
 * Whisper's words as lines, each with the time it starts in the file: a new
 * line at the first sentence end after 20 seconds, and always by 60, so long
 * unbroken speech still gets a timestamp every minute or less.
 */
export function timedLines(words: AsrWord[], offsetMs: number): { atMs: number; text: string }[] {
  const lines: { atMs: number; words: string[] }[] = [];
  for (const w of words) {
    const at = offsetMs + w.startMs;
    const line = lines.at(-1);
    const age = line ? at - line.atMs : Number.POSITIVE_INFINITY;
    const sentenceEnded = /[.?!]["')\]]?$/.test(line?.words.at(-1) ?? "");
    if (!line || age >= 60_000 || (age >= 20_000 && sentenceEnded)) {
      lines.push({ atMs: at, words: [w.word] });
    } else {
      line.words.push(w.word);
    }
  }
  return lines.map((l) => ({ atMs: l.atMs, text: stripNonSpeech(l.words.join("")) }));
}

/**
 * Whisper's tokens as whole words, each with its start and end in the file.
 * A token that doesn't start with a space carries on the word before it
 * ("dict" + "ation", or a full stop).
 */
export function timedWords(words: AsrWord[], offsetMs: number): AsrWord[] {
  const out: AsrWord[] = [];
  for (const w of words) {
    const last = out.at(-1);
    if (last && !/^\s/.test(w.word)) {
      last.word += w.word;
      last.endMs = offsetMs + w.endMs;
    } else {
      out.push({ ...w, startMs: offsetMs + w.startMs, endMs: offsetMs + w.endMs });
    }
  }
  return out
    .map((w) => ({ ...w, word: stripNonSpeech(w.word) }))
    .filter((w) => /[\p{L}\p{N}]/u.test(w.word));
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor(s / 60) % 60).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
};

/** A clock to the hundredth of a second, for cutting on a word: `01:23.48`. */
export const fineClock = (ms: number) =>
  `${clock(ms)}.${String(Math.floor((ms % 1000) / 10)).padStart(2, "0")}`;

/** The user's dictionary, or none if data.db can't be read: names then come out as heard. */
function names(log: (m: string) => void): ReturnType<typeof readDictionary> {
  try {
    return readDictionary();
  } catch (error) {
    log(`warning: couldn't read the dictionary from data.db: ${error}`);
    return [];
  }
}

/**
 * Engines with a whisper-server of their own, so the agent's stays free for
 * dictation. A port per call, since two requests can run at once.
 */
function ownEngines(log: (m: string) => void, dictionary: ReturnType<typeof readDictionary>) {
  return startEngines(log, dictionary, undefined, undefined, undefined, freePort());
}

/**
 * Whisper's words for `audio`, a piece at a time: VAD's speech, in chunks
 * of up to 30 seconds, each with where it starts in the file, in ms.
 */
async function* hear(
  audio: PcmAudio,
  startMs: number,
  { detectSpeech, asr }: Pick<PipelineDeps, "detectSpeech" | "asr">,
) {
  const rate = audio.sampleRate;
  for (const c of chunks(await detectSpeech(audio), 30 * rate)) {
    const piece = { sampleRate: rate, samples: audio.samples.subarray(c.startSample, c.endSample) };
    const heard = (await asr.transcribe(piece)).words;
    yield { heard, offsetMs: startMs + (c.startSample / rate) * 1000 };
  }
}

/**
 * An audio or video file as timestamped lines of Whisper's text, names fixed
 * from the dictionary. No cleanup model: the client's model does better with a
 * whole meeting than a 4B one does with each 30 seconds of it. `from`/`to`
 * (seconds) take one stretch of the file; `words` gives each word's start and
 * end instead of lines, to cut a clip on.
 */
async function transcribe(
  path: string,
  log: (m: string) => void,
  { from, to }: { from?: number; to?: number } = {},
  words = false,
): Promise<string> {
  const file: PcmAudio = await loadAudio(requireFile(path, "File"));
  const rate = file.sampleRate;
  const first = Math.max(0, Math.round((from ?? 0) * rate));
  const last = Math.min(file.samples.length, Math.round((to ?? Infinity) * rate));
  if (last <= first) {
    const length = Math.round(file.samples.length / rate);
    throw new Error(
      `Nothing to transcribe from ${from ?? 0}s to ${to === undefined ? "the end" : `${to}s`}: ${path} is ${length}s.`,
    );
  }
  const audio = { sampleRate: rate, samples: file.samples.subarray(first, last) };
  const startMs = (first / rate) * 1000;
  const dictionary = names(log);
  const engines = await ownEngines(log, dictionary);
  try {
    const lines: string[] = [];
    for await (const { heard, offsetMs } of hear(audio, startMs, engines.deps)) {
      if (words) {
        // ponytail: names are fixed one word at a time, so a name misheard as
        // two words stays as heard; the line transcript fixes those.
        for (const w of timedWords(heard, offsetMs)) {
          const word = correctNames(w.word, dictionary);
          lines.push(`[${fineClock(w.startMs)}-${fineClock(w.endMs)}] ${word}`);
        }
        continue;
      }
      for (const line of timedLines(heard, offsetMs)) {
        const text = correctNames(line.text, dictionary);
        if (text) lines.push(`[${clock(line.atMs)}] ${text}`);
      }
    }
    const span =
      from === undefined && to === undefined
        ? `${Math.round(audio.samples.length / rate / 60)} min`
        : `${clock(startMs)}-${clock((last / rate) * 1000)}`;
    return lines.length
      ? `${path} (${span})\n\n${lines.join("\n")}`
      : `${path} (${span}): no speech found.`;
  } finally {
    await engines.close();
  }
}

/**
 * Stills from a video, one every `every` seconds, as JPEGs in a new temp
 * folder; from `from` to `to` seconds if given.
 */
async function frames(
  path: string,
  every: number,
  { from = 0, to }: { from?: number; to?: number } = {},
): Promise<string> {
  requireFile(path, "File");
  const source = await probe(path);
  if (!source.video) return `${path} has no video, only audio. \`transcribe\` reads it.`;
  const end = Math.min(to ?? source.seconds, source.seconds);
  const times: number[] = [];
  for (let t = from; t < end; t += every) times.push(t);
  if (!times.length) throw new Error(`No stills from ${from}s: ${path} is ${source.seconds}s.`);
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-frames-"));
  const stills: string[] = [];
  try {
    for (const t of times) {
      // Each still seeks straight to its time, so a long 4K video isn't decoded end to end.
      const file = join(dir, `${String(stills.length + 1).padStart(4, "0")}.jpg`);
      const proc = Bun.spawn(
        [
          ...["ffmpeg", "-nostdin", "-loglevel", "error", "-ss", String(t), "-i", path],
          ...["-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", file],
        ],
        { stderr: "pipe" },
      );
      if ((await proc.exited) !== 0) {
        const why = (await new Response(proc.stderr).text()).trim();
        throw new Error(`ffmpeg couldn't read frames from ${path}: ${why}`);
      }
      // A time in the last moments, after the final frame, gives no still.
      if (readdirSync(dir).length > stills.length) stills.push(`[${clock(t * 1000)}] ${file}`);
    }
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  return stills.join("\n");
}

/** The captions file's name in render's temp folder. */
const CAPTIONS = "captions.srt";

/**
 * A stretch of the source to keep, in seconds. `focus` is the point to keep
 * in frame (0–1 of the width and height, default the middle) and `zoom`
 * how far to punch in on it (1 to 4, default 1).
 */
export type Clip = { from: number; to: number; focus?: { x: number; y: number }; zoom?: number };

/** An area of the source: its left, top, width and height, each 0–1 of the picture. */
export type Area = { x: number; y: number; w: number; h: number };

/** A sound laid under the speech, from `at` seconds into the finished video. */
export type Sound = { at: number; volume: number; loop: boolean; duck: boolean };

/** Where caption images sit unless told: a little below the middle, where Shorts and Reels leave room for text. */
export const CAPTIONS_Y = 0.7;

/** The loudness Shorts, Reels and TikTok play at, roughly: EBU R128, in LUFS. */
const LOUDNESS = "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000";

/** `area` of the picture, scaled and cropped to fill `w`x`h`. Even sizes, which yuv420p needs. */
const fill = ({ x, y, w, h }: Area, size: string) =>
  `crop=w='floor(${w}*iw/2)*2':h='floor(${h}*ih/2)*2':x='${x}*iw':y='${y}*ih',` +
  `scale=${size.replace("x", ":")}:force_original_aspect_ratio=increase,crop=${size.replace("x", ":")}`;

/**
 * The filters that frame one clip: a 9:16 window around its focus if
 * `vertical`, punched in by its zoom, and scaled back to `size`.
 */
function frame({ focus = { x: 0.5, y: 0.5 }, zoom = 1 }: Clip, vertical: boolean, size: string) {
  // Every clip comes out the same size and pixel shape, zoomed or not, or concat refuses them.
  if (!vertical && zoom === 1) return `,scale=${size.replace("x", ":")},setsar=1`;
  // The widest 9:16 window, or the whole picture, made smaller by the zoom.
  const [w, h] = vertical ? ["min(iw,ih*9/16)", "min(ih,iw*16/9)"] : ["iw", "ih"];
  const crop =
    `crop=w='floor(${w}/${zoom}/2)*2':h='floor(${h}/${zoom}/2)*2'` +
    `:x='clip(${focus.x}*iw-ow/2,0,iw-ow)':y='clip(${focus.y}*ih-oh/2,0,ih-oh)'`;
  return `,${crop},scale=${size.replace("x", ":")},setsar=1`;
}

/**
 * The ffmpeg filter graph that keeps `clips` in order and joins them, each
 * framed by its focus and zoom, cropped to 9:16 if `vertical`, or with
 * `split`'s two areas stacked into 1080x1920. Then, over the picture: `inserts`
 * (images or videos, the inputs after the overlays), and `overlays` (text
 * drawn as images, inputs 1, 2, …), each for its stretch of the finished video
 * in seconds, its middle at `y` of the height. `burn` draws the captions in
 * CAPTIONS over all of it, at `captionsY`. `sounds` (the inputs after the
 * inserts) are mixed under the speech, the sound cut to the picture's length
 * and brought to LOUDNESS. `size` is the source picture's, `WxH`. Ends in
 * [v], and [a] if there's sound.
 */
export function renderGraph(
  clips: Clip[],
  {
    audio,
    vertical,
    size = "1920x1080",
    split,
    burn = false,
    captionsY = CAPTIONS_Y,
    overlays = [],
    inserts = [],
    sounds = [],
  }: {
    audio: boolean;
    vertical: boolean;
    size?: string;
    split?: { top: Area; bottom: Area };
    burn?: boolean;
    captionsY?: number;
    overlays?: (Omit<Cue, "text"> & { y?: number })[];
    inserts?: Omit<Cue, "text">[];
    sounds?: Sound[];
  },
): string {
  const out = vertical || split ? "1080x1920" : size;
  // A split takes its areas from the whole picture, so its clips aren't framed one by one.
  const parts = clips.map((clip, i) => {
    const { from, to } = clip;
    const look = split ? "" : frame(clip, vertical, out);
    const v = `[0:v]trim=start=${from}:end=${to},setpts=PTS-STARTPTS${look}[v${i}]`;
    return audio ? `${v};[0:a]atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS[a${i}]` : v;
  });
  const inputs = clips.map((_, i) => (audio ? `[v${i}][a${i}]` : `[v${i}]`)).join("");
  const joined = `${inputs}concat=n=${clips.length}:v=1:a=${audio ? 1 : 0}[joined]${audio ? "[speech]" : ""}`;
  const stacked = split && [
    "[joined]split[upper][lower]",
    `[upper]${fill(split.top, "1080x960")}[top]`,
    `[lower]${fill(split.bottom, "1080x960")}[bottom]`,
    "[top][bottom]vstack,setsar=1[stacked]",
  ];
  const base = stacked ? "[stacked]" : "[joined]";
  // Inserts go under the text, so captions stay readable over b-roll.
  const layers = [
    ...inserts.map((cue, i) => ({ ...cue, y: 0, input: overlays.length + 1 + i, insert: true })),
    ...overlays.map((cue, i) => ({ ...cue, input: i + 1, insert: false })),
  ];
  const label = (i: number) => (i < layers.length ? `[c${i}]` : burn ? "[laid]" : "[v]");
  const laid = layers.flatMap(({ start, end, y = CAPTIONS_Y, input, insert }, i) => {
    const when = `enable='gte(t,${start})*lt(t,${end})'`;
    if (!insert) {
      return `${label(i)}[${input}:v]overlay=x=(main_w-overlay_w)/2:y=main_h*${y}-overlay_h/2:${when}${label(i + 1)}`;
    }
    // Its own first frame lands at `start`; once it runs out, the picture underneath shows again.
    const shaped = `[${input}:v]trim=duration=${end - start},setpts=PTS-STARTPTS+${start}/TB,${fill({ x: 0, y: 0, w: 1, h: 1 }, out)},setsar=1[i${i}]`;
    return [shaped, `${label(i)}[i${i}]overlay=eof_action=pass:${when}${label(i + 1)}`];
  });
  // libass's captions go on last, over the inserts like the images. An .srt is
  // laid out 288 lines high: its bottom margin puts the line's middle near captionsY.
  // ffmpeg runs in the folder that holds it, so no path needs escaping in the graph.
  const margin = Math.max(0, Math.round((1 - captionsY) * 288 - 10));
  const burnt = burn
    ? [`[laid]subtitles=filename=${CAPTIONS}:force_style='Alignment=2,MarginV=${margin}'[v]`]
    : [];

  const length = clips.reduce((sum, { from, to }) => sum + to - from, 0);
  const first = overlays.length + inserts.length + 1;
  const ducked = sounds.filter((s) => s.duck).length;
  const keyLabels = sounds.flatMap((s, i) => (s.duck ? [`[key${i}]`] : [])).join("");
  const speech = ducked ? "[voice]" : "[speech]";
  const keys = audio && ducked ? [`[speech]asplit=${ducked + 1}${speech}${keyLabels}`] : [];
  const mixed = sounds.flatMap(({ at, volume, loop, duck }, i) => {
    // A looped sound plays to the end of the video; any other plays once.
    const trim = loop ? `atrim=duration=${Math.max(0, length - at)},` : "";
    const placed = `[${first + i}:a]${trim}adelay=${Math.round(at * 1000)}:all=1,volume=${volume}`;
    // auto-editor's defaults: down 85% while the speech is above 4%, in 100 ms, back in 500 ms.
    return audio && duck
      ? [
          `${placed}[s${i}]`,
          `[s${i}][key${i}]sidechaincompress=threshold=0.04:ratio=8:attack=100:release=500[m${i}]`,
        ]
      : [`${placed}[m${i}]`];
  });
  const tracks = [audio && speech, ...sounds.map((_, i) => `[m${i}]`)].filter(Boolean);
  // No sound runs past the picture, even a long one under a silent video.
  const level = `atrim=duration=${length},${LOUDNESS}[a]`;
  const sound = tracks.length
    ? [
        tracks.length === 1
          ? `${tracks[0]}${level}`
          : `${tracks.join("")}amix=inputs=${tracks.length}:duration=longest:normalize=0,${level}`,
      ]
    : [];
  return [
    ...parts,
    joined,
    ...(stacked || []),
    `${base}null${label(0)}`,
    ...laid,
    ...burnt,
    ...keys,
    ...mixed,
    ...sound,
  ].join(";");
}

/**
 * The streams in a media file, how long it is, and its picture's size as
 * played (`WxH`, turned for a phone video recorded on its side) and short side.
 */
async function probe(
  path: string,
): Promise<{ video: boolean; audio: boolean; seconds: number; side: number; size: string }> {
  const proc = Bun.spawn(
    [
      "ffprobe",
      ...["-v", "error", "-show_entries"],
      "stream=codec_type,width,height:stream_side_data=rotation:format=duration",
      ...["-of", "json", path],
    ],
    { stderr: "pipe" },
  );
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) {
    throw new Error(
      `ffprobe couldn't read ${path}: ${(await new Response(proc.stderr).text()).trim()}`,
    );
  }
  const { streams = [], format } = JSON.parse(out);
  type Stream = {
    codec_type: string;
    width?: number;
    height?: number;
    side_data_list?: { rotation?: number }[];
  };
  const has = (type: string) => streams.some((s: Stream) => s.codec_type === type);
  const picture: Stream | undefined = streams.find((s: Stream) => s.codec_type === "video");
  const { width = 0, height = 0 } = picture ?? {};
  // ffmpeg turns the picture upright as it decodes, so filters see it turned.
  const turned = Math.abs(picture?.side_data_list?.find((d) => d.rotation)?.rotation ?? 0) === 90;
  return {
    video: has("video"),
    audio: has("audio"),
    seconds: Number(format?.duration ?? 0),
    side: Math.min(width, height),
    size: turned ? `${height}x${width}` : `${width}x${height}`,
  };
}

/** Whether this ffmpeg can draw subtitles onto the picture. Homebrew's is built without libass. */
let burnable: Promise<boolean> | undefined;
const canBurn = () => {
  burnable ??= (async () => {
    const proc = Bun.spawn(["ffmpeg", "-hide_banner", "-filters"], { stderr: "ignore" });
    return /\ssubtitles\s/.test(await new Response(proc.stdout).text());
  })();
  return burnable;
};

/**
 * Creates `file` empty, or returns false if it exists. Calls run side by
 * side, so the name is taken when it's chosen, not when ffmpeg writes it.
 */
function claim(file: string): boolean {
  try {
    closeSync(openSync(file, "wx"));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

/** The .srt that goes beside a video when ffmpeg can't draw the captions on. */
const srtFor = (video: string) => join(dirname(video), `${basename(video, extname(video))}.srt`);

/** Claims `video`, and its .srt too if `sidecar`; claims neither if either is taken. */
function claimAll(video: string, sidecar: boolean): boolean {
  if (!claim(video)) return false;
  let both = false;
  try {
    both = !sidecar || claim(srtFor(video));
  } finally {
    if (!both) rmSync(video, { force: true });
  }
  return both;
}

/** `out`, or `<name>-short-N.mp4` next to the source with the first N that's free; claimed. */
function outputFor(path: string, out: string | undefined, sidecar: boolean): string {
  if (out) {
    if (!claimAll(out, sidecar)) {
      throw new Error(
        `${out}${sidecar ? " or its .srt" : ""} already exists; give another \`out\`.`,
      );
    }
    return out;
  }
  const base = join(dirname(path), basename(path, extname(path)));
  for (let n = 1; ; n++) {
    if (claimAll(`${base}-short-${n}.mp4`, sidecar)) return `${base}-short-${n}.mp4`;
  }
}

/** An SRT time: `00:01:02,345`. */
const srtClock = (seconds: number) => {
  const ms = Math.round(seconds * 1000);
  const hh = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const mm = String(Math.floor(ms / 60_000) % 60).padStart(2, "0");
  const ss = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss},${String(ms % 1000).padStart(3, "0")}`;
};

/**
 * Word-by-word captions as SRT, timed to the video `clips` make: `words`
 * holds each clip's words, timed in the source. A cue shows up to `perCue`
 * words with the one being said written *like this*, which render draws
 * yellow (`lit: false` shows the words without it). A new cue starts at a
 * clip, after a sentence, after a pause of half a second, or once its words
 * span 1.2 s, which is how often Remotion's TikTok template turns the page.
 */
export function wordCaptions(
  clips: Clip[],
  words: AsrWord[][],
  { perCue = 3, lit = true, upper = false } = {},
): string {
  type Said = { text: string; start: number; end: number; ends: boolean };
  // Each page with where its clip ends in the finished video: no caption outlasts its shot.
  const pages: { words: Said[]; cut: number }[] = [];
  let offset = 0;
  clips.forEach(({ from, to }, i) => {
    const cut = offset + to - from;
    let page: Said[] = [];
    pages.push({ words: page, cut });
    for (const w of words[i] ?? []) {
      const [start, end] = [w.startMs / 1000, w.endMs / 1000];
      // A word belongs to the clip its middle is in: Whisper's word times can be a little early or late.
      if ((start + end) / 2 < from || (start + end) / 2 > to) continue;
      const text = w.word.replace(/[,.;:]+$/, "");
      const said = {
        text: upper ? text.toLocaleUpperCase() : text,
        start: Math.max(start, from) - from + offset,
        end: Math.min(end, to) - from + offset,
        ends: /[.?!]["')\]]?$/.test(w.word),
      };
      const last = page.at(-1);
      const full =
        page.length >= perCue ||
        (last && (last.ends || said.start - last.end >= 0.5)) ||
        (page[0] && said.start - page[0].start >= 1.2);
      if (full) {
        page = [];
        pages.push({ words: page, cut });
      }
      if (said.text) page.push(said);
    }
    offset += to - from;
  });
  const cues = pages
    .filter(({ words }) => words.length)
    .flatMap(({ words: page, cut }, p, all) => {
      const next = all[p + 1]?.words[0]?.start ?? Number.POSITIVE_INFINITY;
      const last = page.at(-1) as Said;
      // Stays up into a short pause rather than flickering off.
      const until = Math.min(cut, next - last.end <= 0.5 ? next : last.end + 0.2);
      if (!lit)
        return [
          { start: page[0]?.start ?? 0, end: until, text: page.map((w) => w.text).join(" ") },
        ];
      return page.map((w, j) => ({
        start: j ? w.start : (page[0]?.start ?? w.start),
        end: page[j + 1]?.start ?? until,
        text: page.map((o, k) => (k === j ? `*${o.text}*` : o.text)).join(" "),
      }));
    });
  return cues
    .map((c, i) => `${i + 1}\n${srtClock(c.start)} --> ${srtClock(c.end)}\n${c.text}`)
    .join("\n\n");
}

/** Text drawn over a stretch of the finished video, its middle at `y` of the height. */
export type Text = { text: string; from: number; to: number; y?: number };

/** A picture or video laid over the finished video from `from` to `to` seconds; its sound isn't used. */
export type Insert = { path: string; from: number; to: number };

/** Files ffmpeg reads as one still picture, which then has to be repeated to last. */
const STILL = /\.(png|jpe?g|webp|heic|bmp|tiff?)$/i;

/**
 * Cuts `clips` out of a video and joins them into one MP4, optionally 9:16
 * or split, with captions, text, inserts and sounds. The client chooses all
 * of those; this only runs ffmpeg. Captions are drawn as images with Core
 * Text and laid over the picture; failing that, drawn by ffmpeg if it has
 * libass; failing that, put in a subtitle track and an .srt beside the video.
 */
async function render(
  path: string,
  clips: Clip[],
  {
    vertical = false,
    split,
    captions,
    captionsY = CAPTIONS_Y,
    texts = [],
    inserts = [],
    sounds = [],
    out,
  }: {
    vertical?: boolean;
    split?: { top: Area; bottom: Area };
    captions?: string;
    captionsY?: number;
    texts?: Text[];
    inserts?: Insert[];
    sounds?: (Sound & { path: string })[];
    out?: string;
  },
): Promise<string> {
  requireFile(path, "File");
  if (!clips.length) throw new Error("No clips: give at least one { from, to } in seconds.");
  for (const c of clips) {
    if (!(Number.isFinite(c.from) && Number.isFinite(c.to) && c.from >= 0 && c.to > c.from)) {
      throw new Error(`A clip needs 0 <= from < to, in seconds; got ${JSON.stringify(c)}.`);
    }
  }
  for (const file of [...inserts, ...sounds]) requireFile(file.path, "File");
  const source = await probe(path);
  if (!source.video) throw new Error(`${path} has no video, only audio.`);
  // A clip past the end would come out short, and captions timed to it would drift.
  const over = clips.find((c) => source.seconds && c.to > source.seconds);
  if (over)
    throw new Error(`A clip ends at ${over.to}s, after the end of ${path} (${source.seconds}s).`);
  const text = captions?.trim();
  const cues = text ? parseSrt(text) : [];

  const dir = mkdtempSync(join(tmpdir(), "mockingbird-render-"));
  let target: string | undefined;
  let sidecar = false;
  let made = false;
  try {
    const lines = [...cues.map((c) => c.text), ...texts.map((t) => t.text)];
    const width = vertical || split ? 1080 : Number(source.size.split("x")[0]);
    const images = lines.length ? drawCaptions(lines, dir, width) : undefined;
    const burn = !!text && !images && (await canBurn());
    sidecar = !!text && !images && !burn;
    target = outputFor(path, out, sidecar);
    const srt = text && !images ? join(dir, CAPTIONS) : undefined;
    if (srt) writeFileSync(srt, `${text}\n`);
    const graph = renderGraph(clips, {
      audio: source.audio,
      vertical,
      size: source.size,
      split,
      burn,
      captionsY,
      overlays: images && [
        ...cues.map(({ start, end }) => ({ start, end, y: captionsY })),
        ...texts.map(({ from, to, y }) => ({ start: from, end: to, y })),
      ],
      inserts: inserts.map(({ from, to }) => ({ start: from, end: to })),
      sounds,
    });
    const extras = [
      ...(images ?? []).flatMap((image) => ["-i", image]),
      ...inserts.flatMap((i) => [...(STILL.test(i.path) ? ["-loop", "1"] : []), "-i", i.path]),
      ...sounds.flatMap((s) => [...(s.loop ? ["-stream_loop", "-1"] : []), "-i", s.path]),
    ];
    const hasSound = source.audio || sounds.length > 0;
    const proc = Bun.spawn(
      [
        "ffmpeg",
        ...["-nostdin", "-y", "-loglevel", "error", "-i", path],
        ...extras,
        ...(sidecar ? ["-i", CAPTIONS] : []),
        ...["-filter_complex", graph, "-map", "[v]"],
        ...(hasSound ? ["-map", "[a]", "-c:a", "aac", "-b:a", "160k"] : []),
        // The subtitle file is the input after the source and the extras.
        ...(sidecar ? ["-map", `${1 + extras.filter((a) => a === "-i").length}:s`] : []),
        ...(sidecar ? ["-c:s", "mov_text"] : []),
        ...["-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p"],
        ...["-movflags", "+faststart", target],
      ],
      { cwd: dir, stderr: "pipe" },
    );
    if ((await proc.exited) !== 0) {
      throw new Error(
        `ffmpeg couldn't render ${target}: ${(await new Response(proc.stderr).text()).trim()}`,
      );
    }
    const length = fineClock((await probe(target)).seconds * 1000);
    // Over the empty file outputFor claimed.
    if (srt && sidecar) copyFileSync(srt, srtFor(target));
    made = true;
    const lost =
      texts.length && !images ? "; the text couldn't be drawn here, so it's left out" : "";
    if (!text) return `${target} (${length})${lost}`;
    if (!sidecar) return `${target} (${length}), captions drawn on the picture${lost}`;
    return `${target} (${length}), captions as a subtitle track and in ${srtFor(target)}${lost}. They couldn't be drawn onto the picture here; an editor such as CapCut can burn in the .srt.`;
  } finally {
    // The claimed names stay only if the video and its .srt were both made.
    if (!made && target) {
      rmSync(target, { force: true });
      if (sidecar) rmSync(srtFor(target), { force: true });
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Word-by-word captions for the video `clips` make out of `path`, as SRT
 * for render: each clip transcribed with word times, then wordCaptions.
 */
async function captions(
  path: string,
  log: (m: string) => void,
  clips: Clip[],
  options: Parameters<typeof wordCaptions>[2],
): Promise<string> {
  const file = await loadAudio(requireFile(path, "File"));
  const rate = file.sampleRate;
  const dictionary = names(log);
  const engines = await ownEngines(log, dictionary);
  try {
    const words: AsrWord[][] = [];
    for (const { from, to } of clips) {
      // Two seconds either side: Whisper places words better with some speech around them.
      const first = Math.max(0, Math.round((from - 2) * rate));
      const last = Math.min(file.samples.length, Math.round((to + 2) * rate));
      const audio = { sampleRate: rate, samples: file.samples.subarray(first, last) };
      const heard: AsrWord[] = [];
      for await (const c of hear(audio, (first / rate) * 1000, engines.deps)) {
        for (const w of timedWords(c.heard, c.offsetMs)) {
          heard.push({ ...w, word: correctNames(w.word, dictionary) });
        }
      }
      words.push(heard);
    }
    return wordCaptions(clips, words, options) || "No speech in those clips.";
  } finally {
    await engines.close();
  }
}

/** A tool's seconds argument: absent stays absent, anything else must be a number. */
const seconds = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Not a time in seconds: ${value}`);
  return n;
};

/** A number argument from `min` to `max`, or `fallback` when it's absent and has one. */
const within = (value: unknown, min: number, max: number, what: string, fallback?: number) => {
  if ((value === undefined || value === null) && fallback !== undefined) return fallback;
  const n = Number(value);
  if (value === null || !Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${what} must be from ${min} to ${max}; got ${JSON.stringify(value)}`);
  }
  return n;
};

/** An array argument's items as objects; anything else is no items. */
const items = (value: unknown) =>
  (Array.isArray(value) ? value : []).map((v) => (v ?? {}) as Record<string, unknown>);

/** An area argument, inside the picture. */
function area(value: unknown, what: string): Area {
  const a = (value ?? {}) as Record<string, unknown>;
  const r = {
    x: within(a.x, 0, 1, `${what}.x`),
    y: within(a.y, 0, 1, `${what}.y`),
    w: within(a.w, 0.01, 1, `${what}.w`),
    h: within(a.h, 0.01, 1, `${what}.h`),
  };
  if (r.x + r.w > 1.001 || r.y + r.h > 1.001) throw new Error(`${what} goes past the picture`);
  return r;
}

/** A stretch of the finished video, `from` before `to`. */
function stretch(a: Record<string, unknown>, what: string) {
  const from = seconds(a.from) ?? Number.NaN;
  const to = seconds(a.to) ?? Number.NaN;
  if (!(from < to)) throw new Error(`${what} needs from < to, in seconds`);
  return { from, to };
}

export const PROMPTS: Prompt[] = [
  {
    name: "make_short",
    description:
      "Cut a vertical Short or Reel, with captions, out of a longer video using mockingbird's tools.",
    arguments: [{ name: "path", description: "Absolute path to the video", required: true }],
    text: ({ path }) => `Make a vertical short from the video at ${path}, with mockingbird's tools.

1. Call \`transcribe\` on it for an outline with timestamps. If what's on screen matters (slides, a demo), call \`frames\` too and look at the stills.
2. Pick one to three moments of 15 to 60 seconds that make sense to someone who hasn't seen the rest: one idea, a clear start, a finished last sentence. Tell me which and why before going on, unless I already said what I want.
3. For each moment, call \`transcribe\` with \`from\`/\`to\` a little either side of it and \`words: true\`. Put each cut just before a word starts and just after a sentence's last word ends. Cut out long pauses and false starts inside a moment by splitting it into several clips.
4. Call \`captions\` with the same clips for word-by-word SRT timed to the finished video. Fix any misheard word in it (\`dictionary_list\` has the names).
5. Call \`frames\` with \`from\`/\`to\` over each moment to see where the speaker is, and give each clip a \`focus\` on them. For a screen recording with a webcam in a corner, use \`split\` instead: the screen on top, the webcam below, and \`captionsY: 0.5\`.
6. Call \`render\` with the clips, \`vertical: true\` and the captions. One call per short.
7. Tell me where each file is, how long it is, what it covers, and whether the captions are drawn on or in a separate .srt.`,
  },
];

export function mcpTools(status: () => Promise<object>, log: (m: string) => void): Tool[] {
  const path = { type: "string", description: "Absolute path to the file" };
  const areaSchema = {
    type: "object",
    properties: {
      x: { type: "number" },
      y: { type: "number" },
      w: { type: "number" },
      h: { type: "number" },
    },
    required: ["x", "y", "w", "h"],
  };
  return [
    {
      name: "transcribe",
      description:
        "Transcribe an audio or video file on this Mac (anything ffmpeg reads: m4a, mp3, wav, mp4, mov, mkv) with mockingbird's local Whisper. Returns the text in lines timestamped [mm:ss], with names fixed from the user's dictionary. Takes a few minutes for an hour of audio. `from`/`to` (seconds) transcribe one stretch only; `words: true` gives every word's start and end ([mm:ss.cc-mm:ss.cc] word) to cut a clip on, so keep that to a few minutes at a time.",
      inputSchema: {
        type: "object",
        properties: {
          path,
          from: { type: "number", description: "Start, in seconds from the start of the file" },
          to: { type: "number", description: "End, in seconds from the start of the file" },
          words: { type: "boolean", description: "One line per word, with start and end" },
        },
        required: ["path"],
      },
      run: (a) =>
        transcribe(String(a.path), log, { from: seconds(a.from), to: seconds(a.to) }, !!a.words),
    },
    {
      name: "render",
      description:
        "Cut clips out of a video and join them into one MP4, for a Short or Reel. You choose the clips (cut on word ends from `transcribe` with `words: true`) and write the captions; this runs ffmpeg on the Mac. Returns the new file's path and length. It never overwrites a file.",
      inputSchema: {
        type: "object",
        properties: {
          path,
          clips: {
            type: "array",
            description: "Stretches of the source to keep, in order, in seconds",
            items: {
              type: "object",
              properties: {
                from: { type: "number" },
                to: { type: "number" },
                focus: {
                  type: "object",
                  description:
                    "The point to keep in frame, 0-1 of the source's width and height (default the middle). Find it with `frames`.",
                  properties: { x: { type: "number" }, y: { type: "number" } },
                },
                zoom: {
                  type: "number",
                  description:
                    "Punch in on the focus, 1-4 (default 1). 1.1-1.2 on alternate jump cuts hides them.",
                },
              },
              required: ["from", "to"],
            },
          },
          vertical: {
            type: "boolean",
            description: "Crop to 9:16 at 1080x1920, around each clip's focus",
          },
          split: {
            type: "object",
            description:
              "Two areas of the source stacked into 1080x1920, each filling half, e.g. a screen recording on top and the webcam below. Areas are { x, y, w, h }, 0-1 of the source's width and height. Clips' focus and zoom don't apply.",
            properties: { top: areaSchema, bottom: areaSchema },
            required: ["top", "bottom"],
          },
          captions: {
            type: "string",
            description:
              "SRT text timed to the finished video, not the source: subtract each clip's start, and add the length of the clips before it. Drawn onto the picture, white with a black outline; a word written *like this* is drawn yellow, for word-by-word captions with the spoken word lit. If they can't be drawn here, a subtitle track and an .srt file beside the video.",
          },
          captionsY: {
            type: "number",
            description:
              "Where the middle of the captions sits, 0-1 of the height (default 0.7). 0.5 puts them on a split's seam.",
          },
          texts: {
            type: "array",
            description:
              "More text drawn like the captions over a stretch of the finished video, such as a title for the first seconds. *Words* are yellow here too.",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                from: { type: "number" },
                to: { type: "number" },
                y: { type: "number", description: "Its middle, 0-1 of the height (default 0.7)" },
              },
              required: ["text", "from", "to"],
            },
          },
          inserts: {
            type: "array",
            description:
              "Pictures or videos (b-roll) laid over the whole frame for a stretch of the finished video while the speech carries on, under the text. Scaled to fill; a video's own sound isn't used.",
            items: {
              type: "object",
              properties: { path, from: { type: "number" }, to: { type: "number" } },
              required: ["path", "from", "to"],
            },
          },
          audio: {
            type: "array",
            description:
              "Sounds mixed under the speech: music (`loop`, `duck`, volume about 0.15) or a sound effect at a moment. The result is brought to -14 LUFS, the loudness Shorts, Reels and TikTok play at.",
            items: {
              type: "object",
              properties: {
                path,
                at: { type: "number", description: "Seconds into the finished video (default 0)" },
                volume: { type: "number", description: "0-4 (default 1)" },
                loop: { type: "boolean", description: "Repeat it to the end of the video" },
                duck: { type: "boolean", description: "Turn it down while someone speaks" },
              },
              required: ["path"],
            },
          },
          out: {
            type: "string",
            description: "Absolute path for the MP4. Default: <source>-short-N.mp4 beside it",
          },
        },
        required: ["path", "clips"],
      },
      // Absolute paths, since ffmpeg runs in a temp folder.
      run: (a) =>
        render(
          resolve(String(a.path)),
          items(a.clips).map((c, i) => {
            const focus = c.focus as Record<string, unknown> | undefined;
            return {
              from: seconds(c.from) ?? Number.NaN,
              to: seconds(c.to) ?? Number.NaN,
              ...(focus && {
                focus: {
                  x: within(focus.x, 0, 1, `clips[${i}].focus.x`, 0.5),
                  y: within(focus.y, 0, 1, `clips[${i}].focus.y`, 0.5),
                },
              }),
              zoom: within(c.zoom, 1, 4, `clips[${i}].zoom`, 1),
            };
          }),
          {
            vertical: !!a.vertical,
            split: a.split
              ? {
                  top: area((a.split as Record<string, unknown>).top, "split.top"),
                  bottom: area((a.split as Record<string, unknown>).bottom, "split.bottom"),
                }
              : undefined,
            captions: a.captions === undefined ? undefined : String(a.captions),
            captionsY: within(a.captionsY, 0, 1, "captionsY", CAPTIONS_Y),
            texts: items(a.texts).map((t, i) => ({
              text: String(t.text ?? ""),
              ...stretch(t, `texts[${i}]`),
              y: within(t.y, 0, 1, `texts[${i}].y`, CAPTIONS_Y),
            })),
            inserts: items(a.inserts).map((t, i) => ({
              path: resolve(String(t.path)),
              ...stretch(t, `inserts[${i}]`),
            })),
            sounds: items(a.audio).map((t, i) => ({
              path: resolve(String(t.path)),
              at: within(t.at, 0, Number.MAX_VALUE, `audio[${i}].at`, 0),
              volume: within(t.volume, 0, 4, `audio[${i}].volume`, 1),
              loop: !!t.loop,
              duck: !!t.duck,
            })),
            out: a.out === undefined ? undefined : resolve(String(a.out)),
          },
        ),
    },
    {
      name: "captions",
      description:
        "Word-by-word captions for the video `render` will make from these clips, as SRT timed to the finished video: up to `perCue` words a cue, the word being said marked *like this* so render draws it yellow. Edit the text if you like (fix a misheard word, mark a different word), then pass it to render's `captions`.",
      inputSchema: {
        type: "object",
        properties: {
          path,
          clips: {
            type: "array",
            description: "The same clips you'll give render, in order, in seconds",
            items: {
              type: "object",
              properties: { from: { type: "number" }, to: { type: "number" } },
              required: ["from", "to"],
            },
          },
          perCue: { type: "number", description: "Most words on screen at once, 1-8 (default 3)" },
          lit: { type: "boolean", description: "Mark the word being said (default true)" },
          upper: { type: "boolean", description: "In capitals (default false)" },
        },
        required: ["path", "clips"],
      },
      run: (a) => {
        const clips = items(a.clips).map((c, i) => stretch(c, `clips[${i}]`));
        if (!clips.length) throw new Error("No clips: give at least one { from, to } in seconds.");
        return captions(resolve(String(a.path)), log, clips, {
          perCue: Math.round(within(a.perCue, 1, 8, "perCue", 3)),
          lit: a.lit === undefined ? true : !!a.lit,
          upper: !!a.upper,
        });
      },
    },
    {
      name: "frames",
      description:
        "Save stills from a video file, one every `every` seconds (default 60), and return their paths with [mm:ss] times, to see slides and screen shares next to the transcript, or where the speaker is before framing a clip. `from`/`to` (seconds) take stills from one stretch only.",
      inputSchema: {
        type: "object",
        properties: {
          path,
          every: { type: "number", description: "Seconds between stills" },
          from: { type: "number", description: "Start, in seconds from the start of the file" },
          to: { type: "number", description: "End, in seconds from the start of the file" },
        },
        required: ["path"],
      },
      run: (a) =>
        frames(String(a.path), Math.max(1, Number(a.every ?? 60)), {
          from: seconds(a.from),
          to: seconds(a.to),
        }),
    },
    {
      name: "status",
      description:
        "Whether mockingbird's background agent is running, which permissions it's missing, and whether macOS still has the Fn key.",
      inputSchema: { type: "object", properties: {} },
      run: async () => JSON.stringify(await status()),
    },
    {
      name: "dictionary_list",
      description: "The words mockingbird spells a particular way: names, places, jargon.",
      inputSchema: { type: "object", properties: {} },
      run: async () => readDictionary().map(formatEntry).join("\n") || "The dictionary is empty.",
    },
    {
      name: "dictionary_add",
      description:
        'Teach mockingbird a word: "Catppuccin", "Catppuccin (a colour theme)", or "cat puck => Catppuccin" (what it hears => what to write). Needs mockingbird running.',
      inputSchema: {
        type: "object",
        properties: { entry: { type: "string" } },
        required: ["entry"],
      },
      run: async (a) => {
        const reply = await tellDaemon("/dictionary/add", String(a.entry)).catch(() => {
          throw new Error(
            "mockingbird isn't running, so the dictionary can't change: `mockingbird start`.",
          );
        });
        const text = await reply.text();
        if (!reply.ok) throw new Error(text);
        return text;
      },
    },
  ];
}

/** Serves `tools` and `prompts` on stdin/stdout until stdin closes. Logs go to stderr only. */
export async function serve(tools: Tool[], prompts = PROMPTS): Promise<number> {
  const decoder = new TextDecoder();
  let pending = "";
  const answer = async (line: string) => {
    let message: Message;
    try {
      message = JSON.parse(line);
    } catch {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "not JSON" } })}\n`,
      );
      return;
    }
    if (typeof message !== "object" || message === null || Array.isArray(message)) {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "not a JSON-RPC message" } })}\n`,
      );
      return;
    }
    const reply = await handle(message, tools, prompts);
    if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
  };
  // Each request is answered when it's done, so a status call isn't stuck
  // behind a long transcribe. Replies carry their id, so order doesn't matter.
  // ponytail: notifications/cancelled is ignored; a cancelled call still runs and replies.
  const inFlight = new Set<Promise<void>>();
  const start = (line: string) => {
    // A reply that can't be written (the client closed the pipe) ends that
    // reply, not the session. stderr is the client's log, never the protocol.
    const p = answer(line)
      .catch((error) => console.error(`mcp: couldn't answer: ${error}`))
      .finally(() => inFlight.delete(p));
    inFlight.add(p);
  };
  for await (const chunk of Bun.stdin.stream()) {
    const lines = (pending + decoder.decode(chunk, { stream: true })).split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines.filter((l) => l.trim())) start(line);
  }
  if (pending.trim()) start(pending);
  // The client closed stdin: finish what it asked for before exiting.
  await Promise.all(inFlight);
  return 0;
}
