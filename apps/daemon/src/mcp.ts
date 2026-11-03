import {
  closeSync,
  copyFileSync,
  mkdtempSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { type AsrWord, stripNonSpeech } from "@mockingbird/asr";
import { loadAudio, type PcmAudio } from "@mockingbird/audio";
import { type Cue, drawCaptions, parseSrt } from "@mockingbird/captions";
import { applyCorrections, correctNames } from "@mockingbird/store";
import type { SpeechSegment } from "@mockingbird/vad";
import { audioStats } from "./audio-stats.ts";
import { addEntries, formatEntry, readDictionary } from "./dictionary.ts";
import { guide, INSTRUCTIONS, playbooks } from "./guide.ts";
import { type Engines, requireFile, spokenLanguage, startEngines } from "./runtime.ts";

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
        instructions: INSTRUCTIONS,
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

/**
 * Spells words the user's way: their `heard => term` corrections, then names
 * matched by sound, which only works for English (as dictation's cleanup
 * did). If data.db can't be read, words come out as heard.
 */
function speller(log: (m: string) => void): (text: string) => string {
  let dictionary: ReturnType<typeof readDictionary> = [];
  try {
    dictionary = readDictionary();
  } catch (error) {
    log(`warning: couldn't read the dictionary from data.db: ${error}`);
  }
  const english = spokenLanguage() === "en";
  return (text) => {
    const fixed = applyCorrections(text, dictionary);
    return english ? correctNames(fixed, dictionary) : fixed;
  };
}

/**
 * Whisper's words for `audio`, a piece at a time: VAD's speech, in chunks
 * of up to 30 seconds, each with where it starts in the file, in ms.
 */
async function* hear(
  audio: PcmAudio,
  startMs: number,
  { detectSpeech, asr }: Pick<Engines, "detectSpeech" | "asr">,
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
export async function transcribe(
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
  const spell = speller(log);
  // A whisper-server per call, since two requests can run at once.
  const engines = await startEngines(log);
  try {
    const lines: string[] = [];
    for await (const { heard, offsetMs } of hear(audio, startMs, engines)) {
      if (words) {
        // ponytail: names are fixed one word at a time, so a name misheard as
        // two words stays as heard; the line transcript fixes those.
        for (const w of timedWords(heard, offsetMs)) {
          const word = spell(w.word);
          lines.push(`[${fineClock(w.startMs)}-${fineClock(w.endMs)}] ${word}`);
        }
        continue;
      }
      for (const line of timedLines(heard, offsetMs)) {
        const text = spell(line.text);
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

/** The loudness Shorts, Reels, TikTok and YouTube play at: EBU R128 integrated, in LUFS. */
const LUFS = -14;

/**
 * Holds peaks under -1.5 dBTP, oversampled 4x so the peaks between samples
 * are caught too, as a true-peak meter reads them. It limits at -2 dB, since
 * encoding to AAC afterwards adds about 0.3 dB to the peaks.
 */
const LIMIT =
  "aresample=192000,alimiter=limit=-2dB:level=false:attack=5:release=50,aresample=48000";

/** The most gain `level` adds: past it is mostly the noise floor of a near-silent file. */
const MAX_GAIN = 30;

/**
 * Square pixels at the width the picture is shown at. Every clip starts with
 * it: concat refuses clips whose pixel shapes differ, and crops then measure
 * the picture as it's seen.
 */
const SQUARE = "scale='trunc(iw*sar/2)*2':ih,setsar=1";

/** What SQUARE does to a width: down to an even number. */
const even = (n: number) => Math.trunc(n / 2) * 2;

/** `area` of the picture, scaled and cropped to fill `w`x`h`. Even sizes, which yuv420p needs. */
const fill = ({ x, y, w, h }: Area, size: string) =>
  `crop=w='floor(${w}*iw/2)*2':h='floor(${h}*ih/2)*2':x='${x}*iw':y='${y}*ih',` +
  `scale=${size.replace("x", ":")}:force_original_aspect_ratio=increase,crop=${size.replace("x", ":")}`;

/**
 * The filters that frame one clip: a 9:16 window around its focus if
 * `vertical`, punched in by its zoom, and scaled back to `size`.
 */
function frame({ focus = { x: 0.5, y: 0.5 }, zoom = 1 }: Clip, vertical: boolean, size: string) {
  if (!vertical && zoom === 1) return "";
  // The widest 9:16 window, or the whole picture, made smaller by the zoom.
  const [w, h] = vertical ? ["min(iw,ih*9/16)", "min(ih,iw*16/9)"] : ["iw", "ih"];
  const crop =
    `crop=w='floor(${w}/${zoom}/2)*2':h='floor(${h}/${zoom}/2)*2'` +
    `:x='clip(${focus.x}*iw-ow/2,0,iw-ow)':y='clip(${focus.y}*ih-oh/2,0,ih-oh)'`;
  return `,${crop},scale=${size.replace("x", ":")},setsar=1`;
}

/**
 * The ffmpeg filter graph that joins `clips` in order, each its own input
 * (0, 1, …, from seekClips), framed by its focus and zoom, cropped to 9:16
 * if `vertical`, or with `split`'s two areas stacked into 1080x1920. Then,
 * over the picture: `inserts` (images or videos, the inputs after the
 * overlays), and `overlays` (text drawn as images, the inputs after the
 * clips), each for its stretch of the finished video in seconds, its middle
 * at `y` of the height. `burn` draws the captions in CAPTIONS over all of it,
 * at `captionsY`. `sounds` (the inputs after the inserts) are mixed under the
 * speech, the sound cut to the picture's length unless `whole`, and left
 * for `level` to bring to LUFS. `size` is the source picture's, `WxH`. Ends in
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
    whole = false,
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
    whole?: boolean;
  },
): string {
  const out = vertical || split ? "1080x1920" : size;
  // A split takes its areas from the whole picture, so its clips aren't framed one by one.
  const parts = clips.map((clip, i) => {
    const look = split ? "" : frame(clip, vertical, out);
    const v = `[${i}:v]setpts=PTS-STARTPTS,${SQUARE}${look}[v${i}]`;
    return audio ? `${v};[${i}:a]asetpts=PTS-STARTPTS[a${i}]` : v;
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
    ...inserts.map((cue, i) => ({
      ...cue,
      y: 0,
      input: clips.length + overlays.length + i,
      insert: true,
    })),
    ...overlays.map((cue, i) => ({ ...cue, input: clips.length + i, insert: false })),
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
  return [
    ...parts,
    joined,
    ...(stacked || []),
    `${base}null${label(0)}`,
    ...laid,
    ...burnt,
    ...mixGraph(sounds, {
      speech: audio,
      length,
      first: clips.length + overlays.length + inserts.length,
      whole,
    }),
  ].join(";");
}

/**
 * The filter steps that mix `sounds` (inputs `first`, `first + 1`, …) under
 * the speech, labelled [speech] if there is any, cut to `length` seconds and
 * left for `level` to bring to LUFS; a batch's, with `whole`, isn't cut. Ends
 * in [a] if there's any sound at all.
 */
export function mixGraph(
  sounds: Sound[],
  {
    speech: audio,
    length,
    first,
    whole = false,
  }: { speech: boolean; length: number; first: number; whole?: boolean },
): string[] {
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
  // A batch keeps its sound whole: concat pads each clip's sound to its
  // picture, which runs a little over from whole frames, so cutting it to
  // `length` would leave a gap where the next batch joins (#137).
  const level = whole ? "anull[a]" : `atrim=duration=${length}[a]`;
  const sound = tracks.length
    ? [
        tracks.length === 1
          ? `${tracks[0]}${level}`
          : `${tracks.join("")}amix=inputs=${tracks.length}:duration=longest:normalize=0,${level}`,
      ]
    : [];
  return [...keys, ...mixed, ...sound];
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
      "stream=codec_type,width,height,sample_aspect_ratio:stream_side_data=rotation:format=duration",
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
    sample_aspect_ratio?: string;
    side_data_list?: { rotation?: number }[];
  };
  const has = (type: string) => streams.some((s: Stream) => s.codec_type === type);
  const picture: Stream | undefined = streams.find((s: Stream) => s.codec_type === "video");
  const { width: w = 0, height: h = 0 } = picture ?? {};
  const [num, den] = (picture?.sample_aspect_ratio ?? "1:1").split(":").map(Number);
  const sar = num && den ? num / den : 1;
  // ffmpeg turns the picture upright as it decodes, so filters see it turned,
  // with its pixel ratio turned over too. The size is SQUARE's, so every clip matches it.
  const turned = Math.abs(picture?.side_data_list?.find((d) => d.rotation)?.rotation ?? 0) === 90;
  const [width, height] = turned ? [even(h / sar), w] : [even(w * sar), h];
  return {
    video: has("video"),
    audio: has("audio"),
    seconds: Number(format?.duration ?? 0),
    side: Math.min(width, height),
    size: `${width}x${height}`,
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

/** `out`, or `<name>-<kind>-N.mp4` next to the source with the first N that's free; claimed. */
function outputFor(
  path: string,
  out: string | undefined,
  sidecar: boolean,
  kind = "short",
): string {
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
    if (claimAll(`${base}-${kind}-${n}.mp4`, sidecar)) return `${base}-${kind}-${n}.mp4`;
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
      // Half-open, so a word right on a cut between two clips shows once.
      const middle = (start + end) / 2;
      if (middle < from || middle >= to) continue;
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

/**
 * ffmpeg's inputs for `clips`: the source once per clip, opened at its start
 * and read for its length. Seeking decodes only what's kept, where trimming
 * one input decodes the whole source and drifts a frame here and there (#137).
 */
export const seekClips = (path: string, clips: Clip[]) =>
  clips.flatMap(({ from, to }) => ["-ss", String(from), "-t", String(to - from), "-i", path]);

/**
 * The most clips one ffmpeg opens at once. Each is an input with its own
 * decoder, about 23 MB at 1080p, so 100 is about 2.3 GB. More are rendered
 * in batches and joined (#137).
 */
export const CLIPS_PER_PASS = 100;

/** Runs ffmpeg with `args`, throwing its error output if it fails. */
async function ffmpeg(args: string[], what: string): Promise<void> {
  const proc = Bun.spawn(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", ...args], {
    stderr: "pipe",
  });
  if ((await proc.exited) !== 0) {
    throw new Error(`ffmpeg couldn't ${what}: ${(await new Response(proc.stderr).text()).trim()}`);
  }
}

/** `file`'s integrated loudness in LUFS, through `filter` first if given. */
async function loudness(file: string, filter = ""): Promise<number> {
  const proc = Bun.spawn(
    [
      ...["ffmpeg", "-nostdin", "-nostats", "-i", file, "-map", "0:a"],
      ...["-af", `${filter}ebur128=framelog=quiet`, "-f", "null", "-"],
    ],
    { stderr: "pipe" },
  );
  const said = await new Response(proc.stderr).text();
  if ((await proc.exited) !== 0) throw new Error(`ffmpeg couldn't measure ${file}: ${said.trim()}`);
  // The summary's "I:" line, the last one in the log.
  const found = [...said.matchAll(/^\s*I:\s+(-?[\d.]+|-inf) LUFS/gm)].at(-1)?.[1];
  return found === undefined || found === "-inf" ? -Infinity : Number(found);
}

/**
 * The gain, in dB, that brings `file`'s sound to LUFS through LIMIT. The
 * limiter takes a little loudness off as it holds the peaks, so the sound is
 * measured as it is, then again through the limiter, and the gain corrected
 * once: within about half a dB (#127). Silence gets none.
 */
async function levelGain(file: string): Promise<number> {
  const before = await loudness(file);
  if (!(before > -70)) return 0;
  const first = Math.min(MAX_GAIN, LUFS - before);
  const after = await loudness(file, `volume=${first}dB,${LIMIT},`);
  return Math.min(MAX_GAIN, first + LUFS - after);
}

/**
 * `file` (render's or motion's, its sound not yet levelled) saved as the MP4
 * `out` with its sound at LUFS and its peaks held by LIMIT. The picture and
 * any subtitles are copied, not encoded again.
 */
async function level(file: string, out: string): Promise<void> {
  const gain = await levelGain(file);
  await ffmpeg(
    [
      ...["-i", file, "-map", "0", "-c", "copy", "-c:s", "mov_text"],
      ...["-af", `volume=${gain.toFixed(2)}dB,${LIMIT}`, "-c:a", "aac", "-b:a", "160k"],
      ...["-movflags", "+faststart", out],
    ],
    `bring ${out}'s sound to ${LUFS} LUFS`,
  );
}

/**
 * `clips` cut, framed and joined into one file in `dir`, CLIPS_PER_PASS at
 * a time: each batch is encoded at a high quality, and the batches are joined
 * without encoding again. The sound is levelled after render's last pass,
 * over all of it.
 */
async function joinBatches(
  path: string,
  clips: Clip[],
  dir: string,
  look: { audio: boolean; vertical: boolean; size: string; split?: { top: Area; bottom: Area } },
): Promise<string> {
  const batches: string[] = [];
  for (let i = 0; i < clips.length; i += CLIPS_PER_PASS) {
    const batch = clips.slice(i, i + CLIPS_PER_PASS);
    const file = `batch-${batches.length}.mkv`;
    await ffmpeg(
      [
        ...seekClips(path, batch),
        ...["-filter_complex", renderGraph(batch, { ...look, whole: true }), "-map", "[v]"],
        ...(look.audio ? ["-map", "[a]", "-c:a", "pcm_f32le"] : []),
        // Encoded once more in the last pass, so near-lossless here.
        ...["-c:v", "libx264", "-crf", "10", "-preset", "veryfast", "-pix_fmt", "yuv420p"],
        join(dir, file),
      ],
      `render clips ${i + 1}-${i + batch.length} of ${path}`,
    );
    batches.push(file);
  }
  // Names beside the list, so no path in it needs quoting.
  const list = join(dir, "batches.txt");
  writeFileSync(list, batches.map((b) => `file '${b}'`).join("\n"));
  const joined = join(dir, "joined.mkv");
  await ffmpeg(["-f", "concat", "-i", list, "-c", "copy", joined], `join ${path}'s clips`);
  // Only the joined file is needed now, which halves the disk this takes.
  for (const b of batches) rmSync(join(dir, b), { force: true });
  return joined;
}

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
    named = path,
  }: {
    vertical?: boolean;
    split?: { top: Area; bottom: Area };
    captions?: string;
    captionsY?: number;
    texts?: Text[];
    inserts?: Insert[];
    sounds?: (Sound & { path: string })[];
    out?: string;
    /** The file the default output is named after and put beside: the source, unless this is render's last pass over joined batches. */
    named?: string;
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
  if (clips.length > CLIPS_PER_PASS) {
    const batches = mkdtempSync(join(tmpdir(), "mockingbird-batches-"));
    try {
      const look = { audio: source.audio, vertical, size: source.size, split };
      const joined = await joinBatches(path, clips, batches, look);
      // Its own length, which rounding to whole frames can leave a hair short of the clips'.
      const { seconds } = await probe(joined);
      // Framed and split already; this pass lays everything else over it.
      return await render(joined, [{ from: 0, to: seconds }], {
        captions,
        captionsY,
        texts,
        inserts,
        sounds,
        out,
        named,
      });
    } finally {
      rmSync(batches, { recursive: true, force: true });
    }
  }
  const text = captions?.trim();
  const cues = text ? parseSrt(text) : [];

  const dir = mkdtempSync(join(tmpdir(), "mockingbird-render-"));
  let target: string | undefined;
  let sidecar = false;
  let made = false;
  try {
    const lines = [...cues.map((c) => c.text), ...texts.map((t) => t.text)];
    const [width, height] = vertical || split ? [1080, 1920] : source.size.split("x").map(Number);
    const images = lines.length ? drawCaptions(lines, dir, width ?? 1080, height) : undefined;
    const burn = !!text && !images && (await canBurn());
    sidecar = !!text && !images && !burn;
    target = outputFor(named, out, sidecar);
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
    const unlevelled = join(dir, "unlevelled.mkv");
    const proc = Bun.spawn(
      [
        "ffmpeg",
        ...["-nostdin", "-y", "-loglevel", "error", ...seekClips(path, clips)],
        ...extras,
        ...(sidecar ? ["-i", CAPTIONS] : []),
        ...["-filter_complex", graph, "-map", "[v]"],
        // Uncompressed until `level` sets the volume, and in floating point:
        // music and effects mixed over speech can go past full scale, which
        // 16-bit samples would clip before the limiter could hold it.
        ...(hasSound ? ["-map", "[a]", "-c:a", "pcm_f32le"] : []),
        // The subtitle file is the input after the clips and the extras.
        ...(sidecar ? ["-map", `${clips.length + extras.filter((a) => a === "-i").length}:s`] : []),
        ...(sidecar ? ["-c:s", "srt"] : []),
        ...["-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p"],
        unlevelled,
      ],
      { cwd: dir, stderr: "pipe" },
    );
    if ((await proc.exited) !== 0) {
      throw new Error(
        `ffmpeg couldn't render ${target}: ${(await new Response(proc.stderr).text()).trim()}`,
      );
    }
    if (hasSound) await level(unlevelled, target);
    else {
      await ffmpeg(
        [
          "-i",
          unlevelled,
          "-map",
          "0",
          "-c",
          "copy",
          "-c:s",
          "mov_text",
          "-movflags",
          "+faststart",
          target,
        ],
        `save ${target}`,
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
 * The stretches of the source to transcribe for `clips`: each clip with
 * `pad` seconds either side, since Whisper places words better with some
 * speech around them, and stretches that overlap made one. An edit cut at
 * its pauses would otherwise hear most of its audio twice (#127). In source
 * order, whatever order the clips are in.
 */
export function spans(clips: Clip[], pad = 2): { from: number; to: number }[] {
  const padded = clips
    .map(({ from, to }) => ({ from: Math.max(0, from - pad), to: to + pad }))
    .sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  for (const s of padded) {
    const last = merged.at(-1);
    if (last && s.from <= last.to) last.to = Math.max(last.to, s.to);
    else merged.push({ ...s });
  }
  return merged;
}

/**
 * Word-by-word captions for the video `clips` make out of `path`, as SRT
 * for render: each clip transcribed with word times, then wordCaptions.
 */
/** macOS's sandbox, and a profile that allows everything but the network. */
const SANDBOX = "/usr/bin/sandbox-exec";
const NO_NETWORK = "(version 1)(allow default)(deny network*)";
const MOTION_RUNNER = join(import.meta.dir, "motion-run.ts");
/** Two hours: past any real video, short of a frame count that never ends. */
const MOTION_MAX_SECONDS = 7200;

/**
 * Runs the motion script at `script`, whose default export draws one frame,
 * over the video at `path` or on its own at `size` for `duration` seconds,
 * and saves the result. The script runs in its own sandboxed process with no network.
 */
async function motion(
  script: string,
  {
    path,
    size = "1080x1920",
    duration,
    fps = 30,
    captions,
    out,
  }: {
    path?: string;
    size?: string;
    duration?: number;
    fps?: number;
    captions?: string;
    out?: string;
  },
): Promise<string> {
  requireFile(script, "Script");
  if (path) requireFile(path, "File");
  let seconds = duration;
  let audio = false;
  let picture = size;
  if (path) {
    const source = await probe(path);
    if (!source.video) throw new Error(`${path} has no video, only audio.`);
    picture = source.size;
    audio = source.audio;
    seconds = Math.min(duration ?? source.seconds, source.seconds);
  }
  const [width = 0, height = 0] = picture.split("x").map(Number);
  if (
    !/^\d+x\d+$/.test(picture) ||
    width % 2 ||
    height % 2 ||
    width < 16 ||
    height < 16 ||
    width > 4096 ||
    height > 4096
  ) {
    throw new Error(`size must be WIDTHxHEIGHT, even, 16 to 4096; got ${picture}`);
  }
  if (!seconds) throw new Error("Give a `duration` in seconds, or a video `path` to draw over.");
  if (!(seconds <= MOTION_MAX_SECONDS)) {
    throw new Error(`duration must be at most ${MOTION_MAX_SECONDS} s; got ${seconds}`);
  }
  const target = outputFor(path ?? script, out, false, "motion");
  const started = performance.now();
  const options = {
    script,
    out: target,
    width,
    height,
    fps,
    duration: seconds,
    video: path,
    audio,
    cues: captions?.trim() ? parseSrt(captions) : [],
  };
  // A fresh process per call, sandboxed with no network: the script is the
  // client's code, and mockingbird's only download is `models pull`.
  const proc = Bun.spawn(
    [SANDBOX, "-p", NO_NETWORK, process.execPath, MOTION_RUNNER, JSON.stringify(options)],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [said, why, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    rmSync(target, { force: true });
    throw new Error(why.trim() || `the motion script stopped (exit ${code})`);
  }
  let frames = 0;
  let work: string | undefined;
  try {
    // The runner's last line; a script's own console.log comes before it. A
    // script that exits early leaves none, and the claimed target goes with the error.
    let result: { frames?: unknown; sounds?: unknown } = {};
    try {
      result = JSON.parse(said.trim().split("\n").at(-1) || "{}") ?? {};
    } catch {}
    frames = Number(result.frames);
    if (!Number.isInteger(frames) || frames < 1) {
      throw new Error("the motion script stopped without drawing; did it call process.exit?");
    }
    // The script's `audio` export, its paths already from the script's folder.
    const sounds = items(result.sounds).map((t, i) => ({
      path: requireFile(String(t.path), `audio[${i}]`),
      at: within(t.at, 0, Number.MAX_VALUE, `audio[${i}].at`, 0),
      volume: within(t.volume, 0, 4, `audio[${i}].volume`, 1),
      loop: !!t.loop,
      duck: !!t.duck,
    }));
    if (sounds.length) {
      // A folder of its own beside the target: the same disk, so the move is a rename,
      // and a name no one else's file can have.
      work = mkdtempSync(join(dirname(target), ".mockingbird-mix-"));
      const mixing = join(work, "mix.mkv");
      const levelled = join(work, "levelled.mp4");
      const graph = [
        ...(audio ? ["[0:a]anull[speech]"] : []),
        ...mixGraph(sounds, { speech: audio, length: frames / fps, first: 1 }),
      ].join(";");
      const mix = Bun.spawn(
        [
          ...["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", target],
          ...sounds.flatMap((s) => [...(s.loop ? ["-stream_loop", "-1"] : []), "-i", s.path]),
          ...["-filter_complex", graph, "-map", "0:v", "-map", "[a]", "-c:v", "copy"],
          // Floating point, as in render: the mix can go past full scale.
          ...["-c:a", "pcm_f32le", mixing],
        ],
        { stderr: "pipe" },
      );
      if ((await mix.exited) !== 0) {
        throw new Error(
          `ffmpeg couldn't mix the sound into ${target}: ${(await new Response(mix.stderr).text()).trim()}`,
        );
      }
      await level(mixing, levelled);
      renameSync(levelled, target);
    }
  } catch (error) {
    rmSync(target, { force: true });
    throw error;
  } finally {
    if (work) rmSync(work, { recursive: true, force: true });
  }
  const took = ((performance.now() - started) / 1000).toFixed(1);
  return `${target} (${clock((frames / fps) * 1000)}, ${width}x${height}, ${fps} fps), drawn in ${took} s`;
}

async function captions(
  path: string,
  log: (m: string) => void,
  clips: Clip[],
  options: Parameters<typeof wordCaptions>[2],
): Promise<string> {
  const file = await loadAudio(requireFile(path, "File"));
  const rate = file.sampleRate;
  const spell = speller(log);
  // A whisper-server per call, since two requests can run at once.
  const engines = await startEngines(log);
  try {
    const heard: AsrWord[][] = [];
    const stretches = spans(clips);
    for (const { from, to } of stretches) {
      const first = Math.round(from * rate);
      const last = Math.min(file.samples.length, Math.round(to * rate));
      const audio = { sampleRate: rate, samples: file.samples.subarray(first, last) };
      const said: AsrWord[] = [];
      for await (const c of hear(audio, (first / rate) * 1000, engines)) {
        for (const w of timedWords(c.heard, c.offsetMs)) said.push({ ...w, word: spell(w.word) });
      }
      heard.push(said);
    }
    // Each clip gets the words of the stretch it's in; wordCaptions keeps the ones inside it.
    const words = clips.map(
      ({ from, to }) => heard[stretches.findIndex((s) => s.from <= from && to <= s.to)] ?? [],
    );
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
      name: "motion",
      description:
        'Motion graphics written as code, drawn on this Mac with Core Graphics (no browser). `script` is a .ts or .js file whose `export default function draw(ctx, t, m)` draws the frame `t` seconds in, with the Canvas 2D API: paths, arc, roundRect, fill, stroke, clip, gradients, shadows, globalAlpha, globalCompositeOperation, save/restore, translate/rotate/scale/setTransform, fillText/strokeText/measureText (font like "900 96px SF Pro"; a family that isn\'t installed is an error, so list fallbacks: "40px SF Mono, Menlo"), drawImage, setLineDash, Path2D (also from SVG path data: new Path2D("M10 10 h80 v80 Z")) for fill/stroke/clip(path), and ctx.filter with CSS filter functions (blur, brightness, contrast, drop-shadow, grayscale, hue-rotate, invert, opacity, saturate, sepia). No DOM. Sound: `export const audio = [{ path, at, volume, loop, duck }]` beside draw (paths from the script\'s folder), or a function of { width, height, fps, duration, cues } returning one, is mixed in as render\'s audio is, ducked under any speech and brought to -14 LUFS. With `path` (usually render\'s output), each frame of that video is drawn first, its sound is kept, and the frame is `m.video` too: draw it again scaled to zoom or move it. `m` has width, height, fps, duration, frame, video, cues (from `captions`, timed to this video), image(path) for a picture file, interpolate(t, [t0, t1], [v0, v1], easing), spring(t, { from, to, start, stiffness, damping }), and ease (linear, in, out, inOut, back, bezier(x1, y1, x2, y2)). Without `path`, give `size` and `duration`. Saves to `out` or <name>-motion-N.mp4 and never overwrites. The script runs in a sandbox with no network access.',
      inputSchema: {
        type: "object",
        properties: {
          script: { type: "string", description: "Absolute path to the motion script" },
          path: { type: "string", description: "Absolute path to a video to draw over" },
          captions: { type: "string", description: "SRT for m.cues, timed to the video" },
          size: { type: "string", description: "WIDTHxHEIGHT without `path` (default 1080x1920)" },
          duration: { type: "number", description: "Seconds; without `path`, required" },
          fps: { type: "number", description: "Frames a second, 1-120 (default 30)" },
          out: { type: "string", description: "Absolute path for the MP4" },
        },
        required: ["script"],
      },
      run: (a) =>
        motion(resolve(String(a.script)), {
          path: a.path === undefined ? undefined : resolve(String(a.path)),
          size: a.size === undefined ? undefined : String(a.size),
          duration: seconds(a.duration),
          fps: Math.round(within(a.fps, 1, 120, "fps", 30)),
          captions: a.captions === undefined ? undefined : String(a.captions),
          out: a.out === undefined ? undefined : resolve(String(a.out)),
        }),
    },
    {
      name: "audio_stats",
      description:
        "Measure a file's sound, since you can't listen to it: integrated loudness (aim for -14 LUFS), loudness range, true and sample peak (clipping), and noise floor. With speech: how much of it is speech, and how far under the voice the sound between phrases sits (music under speech: 18 to 24 dB under) and how much of the 1 to 4 kHz speech band it fills. The beat (tempo and where beats fall, to cut on) when there's a steady one: measure the music file itself, since speech over it hides the beat; and the sections where the energy changes for a while. `from`/`to` (seconds) measure one stretch; times come back from the start of the file.",
      inputSchema: {
        type: "object",
        properties: {
          path,
          from: { type: "number", description: "Start, in seconds from the start of the file" },
          to: { type: "number", description: "End, in seconds from the start of the file" },
        },
        required: ["path"],
      },
      run: (a) => audioStats(resolve(String(a.path)), { from: seconds(a.from), to: seconds(a.to) }),
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
      name: "guide",
      description: `How to edit with these tools: one job's playbook, from mockingbird's plugin. Call it before an edit and follow it. Topics: ${playbooks()
        .map((p) => p.topic)
        .join(", ")}.`,
      inputSchema: {
        type: "object",
        properties: {
          topic: { type: "string", enum: playbooks().map((p) => p.topic) },
        },
        required: ["topic"],
      },
      run: async (a) => guide(String(a.topic)),
    },
    {
      name: "status",
      description:
        "Whether mockingbird is ready: the transcription model in use, and whether ffmpeg and whisper-server are installed.",
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
        'Teach mockingbird a word for transcripts and captions: "Catppuccin", "Catppuccin (a colour theme)", or "cat puck => Catppuccin" (what it hears => what to write).',
      inputSchema: {
        type: "object",
        properties: { entry: { type: "string" } },
        required: ["entry"],
      },
      run: async (a) => addEntries(String(a.entry)),
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
