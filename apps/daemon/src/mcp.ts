import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { type AsrWord, stripNonSpeech } from "@mockingbird/asr";
import { loadAudio, type PcmAudio } from "@mockingbird/audio";
import { type Cue, drawCaptions, parseSrt } from "@mockingbird/captions";
import type { MusicParams } from "@mockingbird/motion";
import { applyCorrections, correctNames } from "@mockingbird/store";
import {
  compile,
  edit,
  lengthOf,
  load,
  type Move,
  type Project,
  transcript,
  type Word,
  wanted,
} from "@mockingbird/timeline";
import type { SpeechSegment } from "@mockingbird/vad";
import { audioStats } from "./audio-stats.ts";
import { addEntries, formatEntry, readDictionary } from "./dictionary.ts";
import { guide, INSTRUCTIONS, playbooks } from "./guide.ts";
import { findChrome } from "./models.ts";
import {
  asrChoice,
  type Engines,
  enginesFor,
  type ModelChoice,
  mockingbirdHome,
  requireFile,
  spokenLanguage,
  startEngines,
  WHISPER_LANGUAGES,
} from "./runtime.ts";

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
 * ("dict" + "ation", or a full stop). A word's DTW point is its first
 * token's, and `atEndMs` its last's.
 */
export function timedWords(words: AsrWord[], offsetMs: number): AsrWord[] {
  const out: AsrWord[] = [];
  for (const w of words) {
    const last = out.at(-1);
    const at = w.atMs === undefined ? undefined : offsetMs + w.atMs;
    if (last && !/^\s/.test(w.word)) {
      last.word += w.word;
      last.endMs = offsetMs + w.endMs;
      // A full stop has a point of its own, after the word: the word's last is its own last letter's.
      if (at !== undefined && /[\p{L}\p{N}]/u.test(w.word)) last.atEndMs = at;
    } else {
      out.push({
        ...w,
        startMs: offsetMs + w.startMs,
        endMs: offsetMs + w.endMs,
        ...(at !== undefined && { atMs: at, atEndMs: at }),
      });
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
  choice: ModelChoice = {},
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
  const picked = await enginesFor(audio, choice, log);
  const { engines } = picked;
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
    // Which language and model, when the call picked them or the language was detected.
    const how =
      choice.model || choice.language || picked.detected
        ? `, ${WHISPER_LANGUAGES.get(picked.language) ?? picked.language}${picked.detected ? " (detected)" : ""} with ${picked.model}`
        : "";
    return lines.length
      ? `${path} (${span}${how})\n\n${lines.join("\n")}`
      : `${path} (${span}${how}): no speech found.`;
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
          ...[
            "ffmpeg",
            "-nostdin",
            "-loglevel",
            "error",
            "-hwaccel",
            "auto",
            "-ss",
            String(t),
            "-i",
            path,
          ],
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
 * how far to punch in on it (1 to 4, default 1). `path` is its own source,
 * for a project's clips; without it, render's.
 */
export type Clip = {
  from: number;
  to: number;
  focus?: { x: number; y: number };
  zoom?: number;
  path?: string;
  /** A project's: played faster or slower, framed differently as it plays, and how it comes in. */
  speed?: number;
  moves?: Move[];
  transition?: { type: string; duration: number };
  /** Where its sound comes from in the source, when a J or L cut moves it off the picture's stretch. */
  sound?: { from: number; to: number };
};

/** The stretch of the source a clip's input opens: its picture's and its sound's together. */
const opened = (c: Clip) => ({
  from: Math.min(c.from, c.sound?.from ?? c.from),
  to: Math.max(c.to, c.sound?.to ?? c.to),
});

/**
 * Each clip's start in the finished video and the video's length: a clip
 * lasts its source stretch over its speed, and one with a transition starts
 * that much before the clip ahead of it ends.
 */
export function timeline(clips: Clip[]): { starts: number[]; length: number } {
  const starts: number[] = [];
  let length = 0;
  for (const c of clips) {
    const start = Math.max(0, length - (c.transition?.duration ?? 0));
    starts.push(start);
    length = start + lengthOf(c);
  }
  return { starts, length };
}

/** atempo steps for `speed`: each step can only be 0.5 to 2. */
export function tempo(speed: number): string {
  const steps: number[] = [];
  let left = speed;
  while (left > 2) {
    steps.push(2);
    left /= 2;
  }
  while (left < 0.5) {
    steps.push(0.5);
    left /= 0.5;
  }
  steps.push(Number(left.toFixed(6)));
  return steps.map((s) => `atempo=${s}`).join(",");
}

/**
 * The perspective filter that frames a clip with moves: each frame, a window
 * of `shape`'s width to height around the focus, made smaller by the zoom,
 * mapped onto the whole frame with sub-pixel accuracy, then scaled to
 * `shape`. Measured on a slow push: crop sizes and positions rounded to whole
 * pixels jitter (frame-to-frame change 7.6 ± 3.9 for scale and overlay, 9.0 ±
 * 2.7 for zoompan, against 3.4 ± 0.3 for a 4x supersampled reference);
 * perspective moved 3.1 ± 0.06, at the same speed (#161). The clip's time is
 * its frame number over `fps`, as perspective has no other clock.
 */
export function moving(clip: Clip, shape: string, fps: number): string {
  const [sw = 1, sh = 1] = shape.split("x").map(Number);
  const [a, b] = [sw / gcd(sw, sh), sh / gcd(sw, sh)];
  const t = `(in/${fps})`;
  // Each value over time: a nested if() of eased segments, then the last value held.
  const over = (pick: (s: { focus: { x: number; y: number }; zoom: number }) => number) => {
    let at = 0;
    let now = { focus: clip.focus ?? { x: 0.5, y: 0.5 }, zoom: clip.zoom ?? 1 };
    const parts: [number, string][] = [];
    for (const m of clip.moves ?? []) {
      const next = { focus: m.focus ?? now.focus, zoom: m.zoom ?? now.zoom };
      const [from, to] = [pick(now), pick(next)];
      const u = `clip((${t}-${at})/${Math.max(m.at - at, 1e-3)},0,1)`;
      const eased = m.ease === "linear" ? u : `(${u}*${u}*(3-2*${u}))`;
      parts.push([m.at, from === to ? `${from}` : `(${from}+${to - from}*${eased})`]);
      at = m.at;
      now = next;
    }
    return parts.reduceRight(
      (rest, [until, value]) => `if(lt(${t},${until}),${value},${rest})`,
      `${pick(now)}`,
    );
  };
  const z = over((s) => s.zoom);
  const w = `(min(W,H*${a}/${b})/${z})`;
  const h = `(min(H,W*${b}/${a})/${z})`;
  const x = `clip(${over((s) => s.focus.x)}*W-${w}/2,0,W-${w})`;
  const y = `clip(${over((s) => s.focus.y)}*H-${h}/2,0,H-${h})`;
  const corners = [
    [x, y],
    [`${x}+${w}`, y],
    [x, `${y}+${h}`],
    [`${x}+${w}`, `${y}+${h}`],
  ];
  const points = corners.flatMap(([cx, cy], i) => [`x${i}='${cx}'`, `y${i}='${cy}'`]).join(":");
  return `perspective=${points}:interpolation=linear:eval=frame,scale=${shape.replace("x", ":")},setsar=1`;
}

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

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/**
 * The filters that frame one clip: a window of `shape`'s width to height
 * around its focus if given, punched in by its zoom, and scaled to `size`.
 */
function frame(
  { focus = { x: 0.5, y: 0.5 }, zoom = 1 }: Clip,
  shape: string | undefined,
  size: string,
) {
  if (!shape && zoom === 1) return "";
  const [sw = 1, sh = 1] = (shape ?? "1x1").split("x").map(Number);
  const [a, b] = [sw / gcd(sw, sh), sh / gcd(sw, sh)];
  // The widest window of that shape, or the whole picture, made smaller by the zoom.
  const [w, h] = shape ? [`min(iw,ih*${a}/${b})`, `min(ih,iw*${b}/${a})`] : ["iw", "ih"];
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
 *
 * With `fps`, the clips come from sources that may differ (a project's): each
 * is cropped to `size`'s shape around its focus, scaled to `size`, and set
 * to `fps`, so they join; a `silent` clip's sound is silence.
 */
export function renderGraph(
  clips: (Clip & { silent?: boolean })[],
  {
    audio,
    vertical,
    size = "1920x1080",
    fps,
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
    fps?: number;
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
  // Transitions overlap clips with xfade, which needs every input on one timebase.
  const chained = !!fps && clips.some((c, i) => i > 0 && c.transition);
  // A J or L cut makes a clip's sound longer or shorter than its picture, so they're joined apart.
  const apart = clips.some((c) => c.sound);
  // A split takes its areas from the whole picture, so its clips aren't framed
  // one by one, only brought to one size if they're from different sources.
  const parts = clips.map((clip, i) => {
    const speed = clip.speed && clip.speed !== 1 ? `,setpts=PTS/${clip.speed}` : "";
    const look = fps
      ? split || !clip.moves?.length
        ? `${frame(split ? { from: 0, to: 0 } : clip, size, size)},fps=${fps}`
        : `,fps=${fps},${moving(clip, size, fps)}`
      : split
        ? ""
        : frame(clip, vertical ? out : undefined, out);
    const tb = chained ? `,settb=1/${fps}` : "";
    // The input opens the picture's and the sound's stretches together; each takes its own.
    const start = opened(clip).from;
    const cut = clip.sound
      ? `trim=start=${clip.from - start}:duration=${clip.to - clip.from},`
      : "";
    const v = `[${i}:v]${cut}setpts=PTS-STARTPTS${speed},${SQUARE}${look}${tb}[v${i}]`;
    if (!audio) return v;
    const heard = clip.sound ?? clip;
    const acut = clip.sound
      ? `atrim=start=${heard.from - start}:duration=${heard.to - heard.from},`
      : "";
    const a = clip.silent
      ? `aevalsrc=0:c=stereo:s=48000:d=${(heard.to - heard.from) / (clip.speed ?? 1)}[a${i}]`
      : `[${i}:a]${acut}asetpts=PTS-STARTPTS${speed ? `,${tempo(clip.speed as number)}` : ""}[a${i}]`;
    return `${v};${a}`;
  });
  const inputs = clips.map((_, i) => (audio ? `[v${i}][a${i}]` : `[v${i}]`)).join("");
  const joined = chained
    ? chain(clips, audio, fps as number)
    : apart
      ? [
          `${clips.map((_, i) => `[v${i}]`).join("")}concat=n=${clips.length}:v=1:a=0[joined]`,
          ...(audio
            ? [`${clips.map((_, i) => `[a${i}]`).join("")}concat=n=${clips.length}:v=0:a=1[speech]`]
            : []),
        ].join(";")
      : `${inputs}concat=n=${clips.length}:v=1:a=${audio ? 1 : 0}[joined]${audio ? "[speech]" : ""}`;
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

  const { length } = timeline(clips);
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
 * The clips [v0], [v1], … joined one after another into [joined], and their
 * sounds [a0], [a1], … into [speech]: by concat, or by xfade and acrossfade
 * where a clip comes in with a transition, starting that long before the
 * clip ahead of it ends. Picture and sound are joined apart, since a J or L
 * cut makes a clip's sound longer or shorter than its picture.
 */
function chain(clips: Clip[], audio: boolean, fps: number): string {
  const steps: string[] = [];
  let [v, a] = ["[v0]", "[a0]"];
  let length = lengthOf(clips[0] as Clip);
  clips.slice(1).forEach((c, k) => {
    const i = k + 1;
    const last = i === clips.length - 1;
    const [nv, na] = last ? ["[joined]", "[speech]"] : [`[jv${i}]`, `[ja${i}]`];
    const t = c.transition;
    if (t) {
      steps.push(
        `${v}[v${i}]xfade=transition=${t.type}:duration=${t.duration}:offset=${(length - t.duration).toFixed(6)}${nv}`,
      );
      if (audio) steps.push(`${a}[a${i}]acrossfade=d=${t.duration}${na}`);
      length += lengthOf(c) - t.duration;
    } else {
      // concat's timebase isn't xfade's: set it back.
      steps.push(`${v}[v${i}]concat=n=2:v=1:a=0,settb=1/${fps}${nv}`);
      if (audio) steps.push(`${a}[a${i}]concat=n=2:v=0:a=1${na}`);
      length += lengthOf(c);
    }
    [v, a] = [nv, na];
  });
  return steps.join(";");
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
 * The streams in a media file, how long it is, its picture's size as played
 * (`WxH`, turned for a phone video recorded on its side) and short side, and
 * its frame rate.
 */
async function probe(path: string): Promise<{
  video: boolean;
  audio: boolean;
  seconds: number;
  side: number;
  size: string;
  fps: number;
}> {
  const proc = Bun.spawn(
    [
      "ffprobe",
      ...["-v", "error", "-show_entries"],
      "stream=codec_type,width,height,sample_aspect_ratio,avg_frame_rate:stream_side_data=rotation:format=duration",
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
    avg_frame_rate?: string;
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
  // "30000/1001"; a still picture or an odd file says "0/0".
  const [fn, fd] = (picture?.avg_frame_rate ?? "0/0").split("/").map(Number);
  const fps = fn && fd ? Number((fn / fd).toFixed(3)) : 30;
  return {
    fps,
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
  const { starts } = timeline(clips);
  clips.forEach((clip, i) => {
    // Captions follow the sound, which a J or L cut moves off the picture.
    const { from, to } = clip.sound ?? clip;
    const offset = (starts[i] ?? 0) + (from - clip.from) / (clip.speed ?? 1);
    // A word's time in the finished video: a clip's speed shortens or stretches it.
    const at = (t: number) => (t - from) / (clip.speed ?? 1) + offset;
    const cut = offset + (to - from) / (clip.speed ?? 1);
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
        start: at(Math.max(start, from)),
        end: at(Math.min(end, to)),
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
  clips.flatMap((c) => {
    const { from, to } = opened(c);
    // Decoded with the hardware where there's a decoder: a minute of 4K HEVC rendered in 34.0 s against 91.1 s, frame for frame the same (#167).
    return ["-hwaccel", "auto", "-ss", String(from), "-t", String(to - from), "-i", c.path ?? path];
  });

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
  clips: (Clip & { silent?: boolean })[],
  dir: string,
  look: {
    audio: boolean;
    vertical: boolean;
    size: string;
    fps?: number;
    split?: { top: Area; bottom: Area };
  },
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
 *
 * A project's clips each have their own `path` and come with `fit`: each is
 * framed to `size` (default the first clip's source) at `fps` (default its
 * rate), so clips from different sources join.
 */
async function render(
  path: string,
  clips: Clip[],
  {
    vertical = false,
    fit = false,
    size,
    fps,
    split,
    captions,
    captionsY = CAPTIONS_Y,
    texts = [],
    inserts = [],
    sounds = [],
    out,
    named = path,
    kind = "short",
  }: {
    vertical?: boolean;
    fit?: boolean;
    size?: string;
    fps?: number;
    split?: { top: Area; bottom: Area };
    captions?: string;
    captionsY?: number;
    texts?: Text[];
    inserts?: Insert[];
    sounds?: (Sound & { path: string })[];
    out?: string;
    /** The file the default output is named after and put beside: the source, unless this is render's last pass over joined batches. */
    named?: string;
    /** The default output is `<named>-<kind>-N.mp4`. */
    kind?: string;
  },
): Promise<string> {
  requireFile(path, "File");
  if (!clips.length) throw new Error("No clips: give at least one { from, to } in seconds.");
  for (const c of clips) {
    if (!(Number.isFinite(c.from) && Number.isFinite(c.to) && c.from >= 0 && c.to > c.from)) {
      throw new Error(`A clip needs 0 <= from < to, in seconds; got ${JSON.stringify(c)}.`);
    }
  }
  const files = [...new Set([path, ...clips.map((c) => c.path ?? path)])];
  for (const file of [...files, ...inserts.map((i) => i.path), ...sounds.map((s) => s.path)]) {
    requireFile(file, "File");
  }
  const probes = new Map(await Promise.all(files.map(async (f) => [f, await probe(f)] as const)));
  const of = (c: Clip) => probes.get(c.path ?? path) as Awaited<ReturnType<typeof probe>>;
  const source = probes.get(path) as Awaited<ReturnType<typeof probe>>;
  for (const c of clips) {
    const from = of(c);
    if (!from.video) throw new Error(`${c.path ?? path} has no video, only audio.`);
    // A J or L cut's sound has to be there too.
    const range = opened(c);
    if (range.from < 0) {
      throw new Error(
        `A J cut needs sound from ${range.from.toFixed(2)}s, before the start of ${c.path ?? path}.`,
      );
    }
    // A clip past the end would come out short, and captions timed to it would drift.
    if (from.seconds && range.to > from.seconds) {
      throw new Error(
        `A clip ${c.to < range.to ? "with an L cut needs sound until" : "ends at"} ${range.to}s, after the end of ${c.path ?? path} (${from.seconds}s).`,
      );
    }
  }
  // The whole cut has sound if any clip does; a clip without fills its stretch with silence.
  const audio = clips.some((c) => of(c).audio);
  const shaped = clips.map((c) => ({ ...c, silent: audio && !of(c).audio }));
  // A split takes its areas from one picture, so a project's clips are brought to the first's size.
  const frameSize = fit && !split ? (size ?? source.size) : source.size;
  const rate = fit ? (fps ?? source.fps) : undefined;
  if (clips.length > CLIPS_PER_PASS) {
    // ponytail: a transition can't cross two batches; join batches with xfade if long edits need them.
    if (clips.some((c, i) => i > 0 && c.transition)) {
      throw new Error(
        `Transitions work with up to ${CLIPS_PER_PASS} clips for now; this has ${clips.length}.`,
      );
    }
    const batches = mkdtempSync(join(tmpdir(), "mockingbird-batches-"));
    try {
      const look = { audio, vertical, size: frameSize, fps: rate, split };
      const joined = await joinBatches(path, shaped, batches, look);
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
        kind,
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
    const [width, height] = vertical || split ? [1080, 1920] : frameSize.split("x").map(Number);
    // Drawn in the pinned Chrome, started under the no-network sandbox where there is one (#157).
    const chrome = lines.length ? findChrome() : undefined;
    const wrap = existsSync(SANDBOX) ? [SANDBOX, "-p", NO_NETWORK] : [];
    const images = chrome
      ? await drawCaptions(lines, dir, width ?? 1080, height, { chrome, wrap })
      : undefined;
    const burn = !!text && !images && (await canBurn());
    sidecar = !!text && !images && !burn;
    target = outputFor(named, out, sidecar, kind);
    const srt = text && !images ? join(dir, CAPTIONS) : undefined;
    if (srt) writeFileSync(srt, `${text}\n`);
    const graph = renderGraph(shaped, {
      audio,
      vertical,
      size: frameSize,
      fps: rate,
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
    const hasSound = audio || sounds.length > 0;
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
 * Runs MOTION_RUNNER with `options` in a fresh process, sandboxed with no
 * network: the script is the client's code, and mockingbird's only download
 * is `models pull`. Returns what it printed.
 */
async function sandboxed(options: object, what: string): Promise<string> {
  const proc = Bun.spawn(
    [SANDBOX, "-p", NO_NETWORK, process.execPath, MOTION_RUNNER, JSON.stringify(options)],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [said, why, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(why.trim() || `${what} stopped (exit ${code})`);
  return said;
}

/** Chrome's path, or the error that says how to get it. */
function needChrome(): string {
  const chrome = findChrome();
  if (chrome) return chrome;
  throw new Error(
    process.env.MOCKINGBIRD_CHROME
      ? `MOCKINGBIRD_CHROME is ${process.env.MOCKINGBIRD_CHROME}, which isn't a program that can run. Ask the user to fix it, or to unset it and run \`mockingbird models pull chrome\`.`
      : "An HTML page renders in a headless Chrome that isn't downloaded yet. Ask the user to run `mockingbird models pull chrome` (about 100 MB), or to set MOCKINGBIRD_CHROME to one.",
  );
}

/**
 * Renders `script`, an HTML page, in Chrome, over the video at `path` or on
 * its own at `size` for `duration` seconds, and saves the result. It runs in its own
 * sandboxed process with no network, Chrome included.
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
  if (!/\.html?$/i.test(script)) {
    throw new Error(
      `motion renders an HTML page; ${script} isn't one. Canvas scripts went with the Canvas engine (#169): draw on a <canvas> in a page, with the kit's page() (guide("motion-graphics")).`,
    );
  }
  const chrome = findChrome();
  if (!chrome) {
    throw new Error(
      process.env.MOCKINGBIRD_CHROME
        ? `MOCKINGBIRD_CHROME is ${process.env.MOCKINGBIRD_CHROME}, which isn't a program that can run. Ask the user to fix it, or to unset it and run \`mockingbird models pull chrome\`.`
        : "An HTML page renders in a headless Chrome that isn't downloaded yet. Ask the user to run `mockingbird models pull chrome` (about 100 MB), or to set MOCKINGBIRD_CHROME to one.",
    );
  }
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
    chrome,
    out: target,
    width,
    height,
    fps,
    duration: seconds,
    video: path,
    audio,
    cues: captions?.trim() ? parseSrt(captions) : [],
  };
  let said: string;
  try {
    said = await sandboxed(options, "the motion script");
  } catch (error) {
    rmSync(target, { force: true });
    throw error;
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

/**
 * Each clip's words, timed in its source (`path`, or its own), names fixed
 * from the dictionary. Each source is heard once, over the stretches its
 * clips need; a source with no sound has no words.
 */
async function clipWords(
  path: string,
  clips: Clip[],
  log: (m: string) => void,
  choice: ModelChoice = {},
) {
  const spell = speller(log);
  const words: AsrWord[][] = clips.map(() => []);
  // The first clip's source, loaded once: the language is detected from that
  // clip (what's captioned first), and the loop below reuses the file.
  const opening = clips[0];
  const openingSource = opening ? (opening.path ?? path) : undefined;
  let loaded: { source: string; file: PcmAudio } | undefined;
  let sample: PcmAudio = { sampleRate: 16_000, samples: new Int16Array(0) };
  if (opening && openingSource && (await probe(requireFile(openingSource, "File"))).audio) {
    const file = await loadAudio(openingSource);
    loaded = { source: openingSource, file };
    const rate = file.sampleRate;
    sample = {
      sampleRate: rate,
      samples: file.samples.subarray(
        Math.round(opening.from * rate),
        Math.round(opening.to * rate),
      ),
    };
  }
  // A whisper-server per call, since two requests can run at once.
  const { engines } = await enginesFor(sample, choice, log);
  try {
    for (const source of new Set(clips.map((c) => c.path ?? path))) {
      const mine = clips.flatMap((c, i) => ((c.path ?? path) === source ? [{ c, i }] : []));
      if (!(await probe(requireFile(source, "File"))).audio) continue;
      const file = loaded?.source === source ? loaded.file : await loadAudio(source);
      const rate = file.sampleRate;
      const stretches = spans(mine.map(({ c }) => c));
      const heard: AsrWord[][] = [];
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
      for (const { c, i } of mine) {
        words[i] = heard[stretches.findIndex((s) => s.from <= c.from && c.to <= s.to)] ?? [];
      }
    }
    return words;
  } finally {
    await engines.close();
  }
}

/** The rate every generated track is made at. */
const MUSIC_RATE = 48000;

/**
 * Music written as code: the generator module `script` played into an
 * OfflineAudioContext in the pinned Chrome, sandboxed like `motion`, and
 * saved as a WAV at `out` brought to LUFS through LIMIT, like everything
 * mockingbird makes. The same arguments make the same track, to the last
 * bits: Chrome sums a node's inputs in an order that varies between runs.
 */
async function music(
  script: string,
  out: string,
  params: Omit<MusicParams, "sampleRate">,
): Promise<string> {
  requireFile(script, "Generator");
  if (!/\.m?js$/i.test(script)) throw new Error(`A generator is a .js module; got ${script}`);
  if (!/\.wav$/i.test(out)) throw new Error(`out must be a .wav file; got ${out}`);
  const chrome = needChrome();
  const target = outputFor(out, out, false);
  const started = performance.now();
  const work = mkdtempSync(join(dirname(target), ".mockingbird-music-"));
  let reached = LUFS;
  try {
    const raw = join(work, "raw.wav");
    await sandboxed(
      { music: true, script, chrome, out: raw, params: { ...params, sampleRate: MUSIC_RATE } },
      "the generator",
    );
    if (!((await loudness(raw)) > -70)) throw new Error(`${script} made silence.`);
    // levelGain's one correction falls short on music with big hits (cinematic
    // drums: -14.9 LUFS). A bed is short, so measure through the limiter once more.
    let gain = await levelGain(raw);
    gain = Math.min(MAX_GAIN, gain + LUFS - (await loudness(raw, `volume=${gain}dB,${LIMIT},`)));
    const levelled = join(work, "levelled.wav");
    await ffmpeg(
      ["-i", raw, "-af", `volume=${gain.toFixed(2)}dB,${LIMIT}`, "-c:a", "pcm_s16le", levelled],
      `bring ${target} to ${LUFS} LUFS`,
    );
    reached = await loudness(levelled);
    renameSync(levelled, target);
  } catch (error) {
    rmSync(target, { force: true });
    throw error;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const took = ((performance.now() - started) / 1000).toFixed(1);
  return `${target} (${clock(params.duration * 1000)}, 48 kHz stereo, ${reached.toFixed(1)} LUFS), made in ${took} s`;
}

/** An `energy` argument: a level 0-1, or [seconds, level] points in time order. */
function energy(value: unknown): MusicParams["energy"] {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return within(value, 0, 1, "energy");
  if (!value.length) throw new Error("energy's curve needs at least one [seconds, level] point");
  let last = -1;
  return value.map((point, i) => {
    if (!Array.isArray(point) || point.length !== 2) {
      throw new Error(`energy[${i}] must be [seconds, level]; got ${JSON.stringify(point)}`);
    }
    const at = within(point[0], 0, MOTION_MAX_SECONDS, `energy[${i}][0]`);
    if (at <= last) throw new Error(`energy's points must be in time order; energy[${i}] isn't`);
    last = at;
    return [at, within(point[1], 0, 1, `energy[${i}][1]`)];
  });
}

/** A stretch of a source, in seconds. */
type Span = { from: number; to: number };

/** `spans` in order, joined where they overlap or are less than `gap` seconds apart. */
export function union(spans: Span[], gap = 0): Span[] {
  const out: Span[] = [];
  for (const s of [...spans].sort((a, b) => a.from - b.from)) {
    const last = out.at(-1);
    if (last && s.from <= last.to + gap) last.to = Math.max(last.to, s.to);
    else out.push({ ...s });
  }
  return out;
}

/** The parts of `needed` that `covered` leaves out. */
export function uncovered(needed: Span[], covered: Span[]): Span[] {
  const have = union(covered);
  const out: Span[] = [];
  for (const n of union(needed)) {
    let at = n.from;
    for (const c of have) {
      if (c.to <= at || c.from >= n.to) continue;
      if (c.from > at) out.push({ from: at, to: c.from });
      at = Math.max(at, c.to);
    }
    if (at < n.to) out.push({ from: at, to: n.to });
  }
  return out.filter((s) => s.to - s.from > 0.01);
}

/**
 * Each word's start and end from where DTW put it and the silences around
 * it: it starts where the last silence before its first point ends, and
 * ends where the first silence after its last point begins, never past the
 * points of the words either side. With no silence there, halfway to the
 * next word's point. A word with no point keeps Whisper's times, which drift
 * up to half a second over a 30-second window; on a recorded talk they put
 * "create" 0.5 s early, inside the pause before it.
 */
export function align(words: (Word & { at?: [number, number] })[], gaps: Span[]): Word[] {
  const ms = (t: number) => Math.round(t * 1000) / 1000;
  return words.map((w, i) => {
    const { word, start, end, at } = w;
    if (!at) return { word, start, end };
    const [first, last] = at;
    const prev = words[i - 1]?.at?.[1];
    const next = words[i + 1]?.at?.[0];
    const before = gaps.filter((g) => g.to <= first && (prev === undefined || g.to >= prev)).at(-1);
    const after = gaps.find((g) => g.from >= last && (next === undefined || g.from <= next));
    const from = before
      ? before.to
      : prev === undefined
        ? Math.min(start, first)
        : (prev + first) / 2;
    const to = after ? after.from : next === undefined ? Math.max(end, last) : (last + next) / 2;
    return { word, start: ms(from), end: ms(Math.max(from, to)) };
  });
}

/** A source's words and silences as heard so far, and the stretches they cover. */
type Heard = { covered: Span[]; words: Word[]; gaps: Span[] };

/**
 * The silences in `source` from `from` to `to` seconds: 80 ms or more under
 * -35 dBFS, the gaps between words that a cut can land in.
 * ponytail: a fixed level; from the recording's noise floor once audio_stats (#171) measures it.
 */
async function silences(source: string, { from, to }: Span): Promise<Span[]> {
  const proc = Bun.spawn(
    [
      ...["ffmpeg", "-nostdin", "-nostats", "-ss", String(from), "-t", String(to - from)],
      ...["-i", source, "-map", "0:a:0", "-af", "silencedetect=n=-35dB:d=0.08", "-f", "null", "-"],
    ],
    { stderr: "pipe" },
  );
  const said = await new Response(proc.stderr).text();
  if ((await proc.exited) !== 0) {
    throw new Error(`ffmpeg couldn't find the pauses in ${source}: ${said.trim()}`);
  }
  const ms = (t: number) => Math.round(t * 1000) / 1000;
  const out: Span[] = [];
  let start: number | undefined;
  for (const [, edge, at] of said.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    const t = from + Number(at);
    if (edge === "start") start = Math.max(from, t);
    else if (start !== undefined) {
      out.push({ from: ms(start), to: ms(t) });
      start = undefined;
    }
  }
  // A silence still going at the end of the stretch.
  if (start !== undefined) out.push({ from: ms(start), to: ms(to) });
  return out;
}

/**
 * Where a source's words are kept: a file per source, model and language
 * under ~/.mockingbird/cache/words/. A source that changes on disk gets a new
 * one, so its old words are never used.
 */
function heardFile(source: string, model: string, language: string): string {
  const { size, mtimeMs } = statSync(source);
  const key = createHash("sha256")
    // "3": words placed by DTW and the silences between them.
    .update(JSON.stringify([3, source, size, mtimeMs, basename(model), language]))
    .digest("hex")
    .slice(0, 32);
  return join(mockingbirdHome(), "cache", "words", `${key}.json`);
}

/**
 * Each source's words and silences over the stretches asked for (absolute
 * paths), heard once and kept, so a later call hears only what no call
 * before it did. A new stretch is heard with 2 s either side, as captions
 * are, and keeps the words whose middle is in it. Names are fixed from the
 * dictionary as the words are read, so a word added to the dictionary later
 * still applies.
 */
export async function sourceWords(
  sources: Map<string, Span[]>,
  log: (m: string) => void,
): Promise<Map<string, { words: Word[]; gaps: Span[] }>> {
  const { whisperModel, language } = asrChoice(log);
  const spell = speller(log);
  const out = new Map<string, { words: Word[]; gaps: Span[] }>();
  let engines: Engines | undefined;
  try {
    for (const [source, spans] of sources) {
      const file = heardFile(requireFile(source, "File"), whisperModel, language);
      let heard: Heard = { covered: [], words: [], gaps: [] };
      try {
        heard = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        // Not heard yet, or a file from a crash: hear it again.
      }
      // Stretches less than 4 s apart are heard as one: their padding would overlap anyway.
      const todo = union(uncovered(spans, heard.covered), 4);
      if (todo.length) {
        if ((await probe(source)).audio) {
          const audio = await loadAudio(source);
          const rate = audio.sampleRate;
          engines ??= await startEngines(log, undefined, undefined, { dtw: true });
          const before = heard.covered;
          const fresh = (middle: number, s: Span) =>
            middle >= s.from &&
            middle < s.to &&
            !before.some((c) => middle >= c.from && middle < c.to);
          for (const s of todo) {
            // Silences either side too, for a cut at the stretch's edge to land in.
            const around = { from: Math.max(0, s.from - 2), to: s.to + 2 };
            heard.gaps = union([...heard.gaps, ...(await silences(source, around))]);
            const first = Math.max(0, Math.round((s.from - 2) * rate));
            const last = Math.min(audio.samples.length, Math.round((s.to + 2) * rate));
            const piece = { sampleRate: rate, samples: audio.samples.subarray(first, last) };
            const placed: (Word & { at?: [number, number] })[] = [];
            for await (const c of hear(piece, (first / rate) * 1000, engines)) {
              for (const w of timedWords(c.heard, c.offsetMs)) {
                const at: [number, number] | undefined =
                  w.atMs === undefined ? undefined : [w.atMs / 1000, (w.atEndMs ?? w.atMs) / 1000];
                placed.push({ word: w.word, start: w.startMs / 1000, end: w.endMs / 1000, at });
              }
            }
            // A word belongs to the stretch its middle is in: by its DTW points where it has them.
            for (const w of align(placed, heard.gaps)) {
              if (fresh((w.start + w.end) / 2, s)) heard.words.push(w);
            }
          }
        }
        heard.covered = union([...heard.covered, ...todo]);
        heard.words.sort((a, b) => a.start - b.start);
        mkdirSync(dirname(file), { recursive: true });
        const temp = `${file}.${process.pid}.tmp`;
        writeFileSync(temp, JSON.stringify(heard));
        renameSync(temp, file);
      }
      out.set(source, {
        words: heard.words.map((w) => ({ ...w, word: spell(w.word) })),
        gaps: heard.gaps,
      });
    }
  } finally {
    await engines?.close();
  }
  return out;
}

/** What `wanted` asks of a project in `dir`, by absolute path. */
function wantedFrom(p: Project, ops: unknown[], dir: string): Map<string, Span[]> {
  const out = new Map<string, Span[]>();
  for (const [path, spans] of wanted(p, ops)) {
    const full = resolve(dir, path);
    out.set(full, [...(out.get(full) ?? []), ...spans]);
  }
  return out;
}

/**
 * `ops` applied to the project in `file`, hearing first whatever cut_words
 * needs: the words of every clip there is or will be.
 */
async function editProject(file: string, ops: unknown[], log: (m: string) => void) {
  if (!ops.some((o) => (o as { op?: unknown })?.op === "cut_words")) return edit(file, ops);
  const dir = dirname(file);
  const heard = await sourceWords(wantedFrom(load(file).project, ops, dir), log);
  return edit(
    file,
    ops,
    (path) => heard.get(resolve(dir, path))?.words ?? [],
    (path) => heard.get(resolve(dir, path))?.gaps ?? [],
  );
}

/** The words in the project in `file`'s cut, from the word cache. */
async function projectTranscript(file: string, log: (m: string) => void) {
  const { project, created } = load(file);
  if (created) throw new Error(`No project at ${file}; make one with \`edit\`.`);
  const dir = dirname(file);
  const heard = await sourceWords(wantedFrom(project, [], dir), log);
  return transcript(project, file, (path) => heard.get(resolve(dir, path))?.words ?? []);
}

async function captions(
  path: string,
  log: (m: string) => void,
  clips: Clip[],
  options: Parameters<typeof wordCaptions>[2],
  choice: ModelChoice = {},
): Promise<string> {
  const words = await clipWords(path, clips, log, choice);
  return wordCaptions(clips, words, options) || "No speech in those clips.";
}

/**
 * The project in `file` rendered: its clips from their sources, framed to
 * its size, with captions made for the cut as it is now and everything on
 * it timed from its clips. Saved beside the project as `<name>-render-N.mp4`.
 */
async function renderProject(file: string, log: (m: string) => void, out?: string) {
  const { project, created } = load(file);
  if (created) throw new Error(`No project at ${file}; make one with \`edit\`.`);
  const cut = compile(project, dirname(file));
  const first = cut.clips[0]?.path;
  if (!first) throw new Error(`${file} has no clips yet; add some with \`edit\`.`);
  const heard = cut.captions
    ? await sourceWords(
        new Map(
          [...new Set(cut.clips.map((c) => c.path))].map((path) => [
            path,
            cut.clips.filter((c) => c.path === path),
          ]),
        ),
        log,
      )
    : undefined;
  // Every word of the clip's source: wordCaptions keeps the ones inside each clip.
  const asr = (path: string): AsrWord[] =>
    (heard?.get(path)?.words ?? []).map((w) => ({
      word: w.word,
      startMs: w.start * 1000,
      endMs: w.end * 1000,
      probability: 1,
    }));
  const said = cut.captions
    ? wordCaptions(
        cut.clips,
        cut.clips.map((c) => asr(c.path)),
        {
          perCue: cut.captions.perCue ?? 3,
          lit: cut.captions.lit ?? true,
          upper: cut.captions.upper ?? false,
        },
      )
    : undefined;
  return render(first, cut.clips, {
    fit: true,
    size: cut.size,
    fps: cut.fps,
    split: cut.split,
    captions: said,
    captionsY: cut.captions?.y ?? CAPTIONS_Y,
    texts: cut.texts,
    inserts: cut.inserts,
    sounds: cut.sounds,
    out,
    named: file,
    kind: "render",
  });
}

/** A tool's `model` and `language`, each only if given. */
const choiceOf = (a: Record<string, unknown>): ModelChoice => ({
  ...(a.model === undefined ? {} : { model: String(a.model) }),
  ...(a.language === undefined ? {} : { language: String(a.language).toLowerCase() }),
});

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
        "Transcribe an audio or video file on this Mac (anything ffmpeg reads: m4a, mp3, wav, mp4, mov, mkv) with mockingbird's local Whisper. Returns the text in lines timestamped [mm:ss], with names fixed from the user's dictionary. Takes a few minutes for an hour of audio. `from`/`to` (seconds) transcribe one stretch only; `words: true` gives every word's start and end ([mm:ss.cc-mm:ss.cc] word) to cut a clip on, so keep that to a few minutes at a time. With `project` (an `edit` project file) instead of `path`: the words in its cut, clip by clip, each line at its time in the finished video, to read the edit and choose words for `cut_words`. A project's sources are heard once and kept, so this is quick after the first time.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Absolute path to a project file from `edit`" },
          path,
          from: { type: "number", description: "Start, in seconds from the start of the file" },
          to: { type: "number", description: "End, in seconds from the start of the file" },
          words: { type: "boolean", description: "One line per word, with start and end" },
          model: {
            type: "string",
            description:
              "A Whisper model file in models/ for this call (`mockingbird models` lists them), e.g. a Bangla fine-tune for a Bangla video. Default: the one picked for the language.",
          },
          language: {
            type: "string",
            description:
              "What's spoken, as a Whisper code (en, bn, de, hi, …) or auto. Default: the user's setting. Give it for mixed speech, like Bangla and English in one sentence, where detection guesses wrong.",
          },
        },
      },
      run: (a) => {
        if (a.project !== undefined) return projectTranscript(resolve(String(a.project)), log);
        if (a.path === undefined) throw new Error("Give a `path`, or a `project`.");
        return transcribe(
          String(a.path),
          log,
          { from: seconds(a.from), to: seconds(a.to) },
          !!a.words,
          choiceOf(a),
        );
      },
    },
    {
      name: "edit",
      description: `Edit a project file (project.json): an edit kept between calls, whose clips can come from several sources and whose texts, b-roll and sounds stay on their clips as the cut changes. Applies \`ops\` in order, all or none, saves, and returns an outline: each clip's place in the finished video and what's on it. Makes the file if it isn't there; no ops only reads it. You can also edit the JSON by hand. Times: a clip's from/to are seconds in its source (as \`transcribe\` gives them); a text's, insert's or sound's are seconds from the start of its \`clip\` in the finished video, or of the video without one. Ops:
- {op:"add", type:"clip", path, from, to, focus?:{x,y}, zoom?, speed?, moves?, transition?, lead?, index?}: on the main track, which plays in order with no gaps (default at the end). speed: 0.25-4. moves: [{at, focus?, zoom?, ease?}], the framing by \`at\` seconds into the clip, eased ("smooth", or "linear") from the one before: a slow push-in, a move to the other speaker. transition: {type, duration}, how the clip comes in over the end of the one before: ffmpeg xfade's fade, fadeblack, fadewhite, dissolve, wipe*, slide*, smooth*, circleopen, zoomin and others. lead: a J cut (positive: the clip's sound starts that many seconds before its picture) or an L cut (negative: the clip before's sound carries on over its picture)
- {op:"add", type:"text", text, from, to, clip?, y?}: drawn like the captions, *words* yellow
- {op:"add", type:"insert", path, from, to, clip?}: a picture or video over the whole frame (b-roll)
- {op:"add", type:"audio", path, at?, clip?, volume?, loop?, duck?}: music or a sound effect under the speech
- {op:"remove", id}: a clip goes with everything on it, and the cut closes up
- {op:"split", id, at}: a clip in two at a source time; what's on the second half moves with it
- {op:"trim", id, from?, to?}: a clip's source times; what's on it stays on the same picture
- {op:"move", id, index}: a clip to another place in the cut
- {op:"cut_words", text, clip?, all?} or {op:"cut_words", from, to, clip?}: cut words out of the cut by quoting them from \`transcribe\` with the project (no case or punctuation needed): \`text\` must be said once (or give \`clip\`, or \`all: true\` for every time), and from/to cuts from the first words through the last, across clips. Cuts land in the pauses, 0.2 s from the words kept; clips are split, trimmed or removed to do it
- {op:"set", id, ...fields}: change an item (null clears a field); without id, the project's size ("1080x1920" makes it vertical, cropping each clip around its focus), fps, split {top, bottom} and captions {perCue?, lit?, upper?, y?} (null for none). Ids are given out as c1, t1, b1, a1.`,
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Absolute path to the project's .json file" },
          ops: { type: "array", items: { type: "object" }, description: "The ops, in order" },
        },
        required: ["project"],
      },
      run: async (a) => {
        // Unchecked, a missing project would make a file named "undefined" here.
        if (typeof a.project !== "string" || !a.project) {
          throw new Error("project must be the path to a project file");
        }
        if (!Array.isArray(a.ops ?? [])) throw new Error("ops must be a list");
        return editProject(resolve(String(a.project)), (a.ops ?? []) as unknown[], log);
      },
    },
    {
      name: "render",
      description:
        "Render an `edit` project to MP4 (`project`), or cut clips out of one video and join them (`path` and `clips`), for a Short, Reel or long-form video. You choose the clips (cut on word ends from `transcribe` with `words: true`) and write the captions; this runs ffmpeg on the Mac. A project's captions are made from its clips' words when it renders. Returns the new file's path and length. It never overwrites a file.",
      inputSchema: {
        type: "object",
        properties: {
          project: {
            type: "string",
            description:
              "Absolute path to a project file from `edit`. Takes the place of everything else but `out`; the video goes beside it as <name>-render-N.mp4",
          },
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
      },
      // Absolute paths, since ffmpeg runs in a temp folder.
      run: (a) => {
        const out = a.out === undefined ? undefined : resolve(String(a.out));
        if (a.project !== undefined) return renderProject(resolve(String(a.project)), log, out);
        if (a.path === undefined) throw new Error("Give a `project`, or a `path` and `clips`.");
        return render(
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
            out,
          },
        );
      },
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
          model: {
            type: "string",
            description:
              "A Whisper model file in models/ for this call (`mockingbird models` lists them), e.g. a Bangla fine-tune for a Bangla video. Default: the one picked for the language.",
          },
          language: {
            type: "string",
            description:
              "What's spoken, as a Whisper code (en, bn, de, hi, …) or auto. Default: the user's setting. Give it for mixed speech, like Bangla and English in one sentence, where detection guesses wrong.",
          },
        },
        required: ["path", "clips"],
      },
      run: (a) => {
        const clips = items(a.clips).map((c, i) => stretch(c, `clips[${i}]`));
        if (!clips.length) throw new Error("No clips: give at least one { from, to } in seconds.");
        return captions(
          resolve(String(a.path)),
          log,
          clips,
          {
            perCue: Math.round(within(a.perCue, 1, 8, "perCue", 3)),
            lit: a.lit === undefined ? true : !!a.lit,
            upper: !!a.upper,
          },
          choiceOf(a),
        );
      },
    },
    {
      name: "motion",
      description:
        "Motion graphics written as code. `script` is an HTML page, rendered in a pinned headless Chrome at the video's size, with a transparent background: any HTML, CSS, SVG, fonts and images by relative path. For each frame at `t` seconds, every CSS animation, transition and Web Animation is set to `t` (stylesheet animations start at 0, so time them with animation-delay; one started later runs from when it started), requestAnimationFrame callbacks run with performance.now() and Date.now() frozen at `t`, and `mockingbird.draw(t, m)`, if the page sets it, is called and awaited. The global `mockingbird` (also `m`) has width, height, fps, duration, frame and cues, and is there before the page's own scripts run, so a page can build captions from cues as it loads. Sound: set `mockingbird.audio = [{ path, at, volume, loop, duck }]` (paths from the page's folder), mixed in as render's audio is, ducked under any speech if `duck`, and brought to -14 LUFS. With `path` (usually render's output), the page is laid over each frame of that video, whose sound is kept; or, if the page sets `mockingbird.drawVideo = true`, it gets each frame as `m.video` (an ImageBitmap) before draw and draws the whole picture itself, e.g. ctx.drawImage(m.video, ...) on a <canvas> to zoom, shake, cut between framings or make a picture-in-picture. setTimeout runs in real time, so don't time anything with it; Math.random is seeded, the same every render. Without `path`, give `size` and `duration`. Saves to `out` or <name>-motion-N.mp4 and never overwrites. The page runs in a sandbox with no network access.",
      inputSchema: {
        type: "object",
        properties: {
          script: {
            type: "string",
            description: "Absolute path to the .html page",
          },
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
      name: "music",
      description:
        "Background music written as code, with no samples to license: `script` is a generator, a .js module whose `export default function (ctx, params)` schedules sound on `ctx`, an OfflineAudioContext as long as `duration`, with Web Audio nodes (oscillators, filters, gains, buffers of noise, convolvers). It runs in the pinned headless Chrome, in a sandbox with no network. `params` has duration, sampleRate (48000), seed, and the tempo, key and energy given here, for the generator to read. Math.random is seeded from `seed`, so the same arguments make the same track (Chrome's mixer can round the last bits differently between runs, never audibly). Saves a 48 kHz stereo WAV at `out`, brought to -14 LUFS with its peaks held, and never overwrites. Use it as one of render's `audio` tracks (volume about 0.1 to 0.2 under speech, `duck: true`). The plugin's generators and how to choose one are in guide(\"music\").",
      inputSchema: {
        type: "object",
        properties: {
          script: { type: "string", description: "Absolute path to the generator (.js)" },
          duration: { type: "number", description: "Seconds, 1 to 7200" },
          out: { type: "string", description: "Absolute path for the WAV" },
          tempo: { type: "number", description: "Beats a minute, 30 to 240, for the generator" },
          key: { type: "string", description: 'A key for the generator, like "A minor"' },
          energy: {
            description:
              "0 to 1, or a curve of [seconds, level] points in time order, eased between: how busy the music is",
            oneOf: [
              { type: "number" },
              { type: "array", items: { type: "array", items: { type: "number" } } },
            ],
          },
          seed: {
            type: "number",
            description: "Another whole number makes a variation (default 1)",
          },
        },
        required: ["script", "duration", "out"],
      },
      run: async (a) =>
        music(resolve(String(a.script)), resolve(String(a.out)), {
          duration: within(a.duration, 1, MOTION_MAX_SECONDS, "duration"),
          seed: Math.round(within(a.seed, 0, 2 ** 32 - 1, "seed", 1)),
          tempo: a.tempo === undefined ? undefined : within(a.tempo, 30, 240, "tempo"),
          key: a.key === undefined ? undefined : String(a.key).slice(0, 40),
          energy: energy(a.energy),
        }),
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
