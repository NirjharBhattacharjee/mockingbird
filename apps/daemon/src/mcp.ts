import { createHash, type Hash, randomUUID } from "node:crypto";
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
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type AsrWord, stripNonSpeech } from "@mockingbird/asr";
import { loadAudio, type PcmAudio } from "@mockingbird/audio";
import { type Cue, drawCaptions, parseSrt } from "@mockingbird/captions";
import type { MusicParams } from "@mockingbird/motion";
import { noNetwork } from "@mockingbird/motion/sandbox";
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
import { catalog, checkEffects, type Effect, effectFilters } from "./effects.ts";
import { guide, INSTRUCTIONS, PLUGIN, playbooks } from "./guide.ts";
import { findChrome, fontFaces } from "./models.ts";
import { clipsFrom, findPauses, measure } from "./pauses.ts";
import {
  asrChoice,
  type Engines,
  enginesFor,
  type ModelChoice,
  mockingbirdHome,
  requireFile,
  startEngines,
  WHISPER_LANGUAGES,
} from "./runtime.ts";
import { scopes } from "./scopes.ts";

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
function speller(log: (m: string) => void, language: string): (text: string) => string {
  let dictionary: ReturnType<typeof readDictionary> = [];
  try {
    dictionary = readDictionary();
  } catch (error) {
    log(`warning: couldn't read the dictionary from data.db: ${error}`);
  }
  const english = language === "en";
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
  // A whisper-server per call, since two requests can run at once.
  const picked = await enginesFor(audio, choice, log);
  const { engines } = picked;
  const spell = speller(log, picked.language);
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

/**
 * The shot changes ffmpeg's `scdet` logged, `from` seconds added back, since
 * a seek starts its times at 0: `lavfi.scd.score: 29.3, lavfi.scd.time: 2`.
 */
export function parseScenes(log: string, from = 0): { at: number; score: number }[] {
  return [...log.matchAll(/lavfi\.scd\.score: ([\d.]+), lavfi\.scd\.time: ([\d.]+)/g)]
    .map(([, score, at]) => ({ at: from + Number(at), score: Number(score) }))
    .filter((c) => c.score > 0); // At threshold 0, an unchanged frame is logged too.
}

/**
 * The shot changes in a video, from `from` to `to` seconds: ffmpeg's `scdet`
 * over each frame shrunk to 180 lines, which is plenty to see a cut and
 * quick to compare. `threshold` (0-100, default 10) is how different two
 * frames must be to count; a jump cut in one shot scores lower than a cut
 * to another shot. Decoded with the hardware when there's a decoder for it:
 * a minute of 4K HEVC from a phone took 21.6 s that way, 165.6 s without.
 */
async function scenes(
  path: string,
  { from = 0, to, threshold = 10 }: { from?: number; to?: number; threshold?: number },
): Promise<string> {
  requireFile(path, "File");
  const source = await probe(path);
  if (!source.video) return `${path} has no video, only audio.`;
  const end = Math.min(to ?? source.seconds, source.seconds);
  if (!(end > from))
    throw new Error(`Nothing to look at from ${from}s: ${path} is ${source.seconds}s.`);
  const run = async (hw: boolean) => {
    const proc = Bun.spawn(
      [
        ...["ffmpeg", "-nostdin", "-nostats", ...(hw ? ["-hwaccel", "auto"] : [])],
        ...["-ss", String(from), "-t", String(end - from), "-i", path, "-an"],
        ...["-vf", `scale=-2:180,scdet=threshold=${threshold}`, "-f", "null", "-"],
      ],
      { stderr: "pipe" },
    );
    const said = await new Response(proc.stderr).text();
    return { said, code: await proc.exited };
  };
  // A hardware decoder that can't hand its frames over fails; software then.
  let { said, code } = await run(true);
  if (code !== 0) ({ said, code } = await run(false));
  if (code !== 0) {
    throw new Error(
      `ffmpeg couldn't look for cuts in ${path}: ${said.trim().split("\n").slice(-3).join("\n")}`,
    );
  }
  const cuts = parseScenes(said, from);
  const length = end - from;
  const pace = `, ${((cuts.length / length) * 60).toFixed(1)} a minute, ${(length / (cuts.length + 1)).toFixed(1)} s a shot`;
  const head = `${path}: ${cuts.length} cut${cuts.length === 1 ? "" : "s"} from ${fineClock(from * 1000)} to ${fineClock(end * 1000)}${pace}`;
  return [head, ...cuts.map((c) => `[${fineClock(c.at * 1000)}] ${c.score.toFixed(1)}`)].join("\n");
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
  /** From the effects catalog (#197), on its picture and its sound. */
  effects?: Effect[];
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
 * The filters that frame one clip: the widest window of `size`'s width to
 * height around its focus, made smaller by its zoom, scaled to `size`.
 */
function frame({ focus = { x: 0.5, y: 0.5 }, zoom = 1 }: Clip, size: string) {
  const [sw = 1, sh = 1] = size.split("x").map(Number);
  const [a, b] = [sw / gcd(sw, sh), sh / gcd(sw, sh)];
  const crop =
    `crop=w='floor(min(iw,ih*${a}/${b})/${zoom}/2)*2':h='floor(min(ih,iw*${b}/${a})/${zoom}/2)*2'` +
    `:x='clip(${focus.x}*iw-ow/2,0,iw-ow)':y='clip(${focus.y}*ih-oh/2,0,ih-oh)'`;
  return `,${crop},scale=${size.replace("x", ":")},setsar=1`;
}

/**
 * The ffmpeg filter graph that joins `clips` in order, each its own input
 * (0, 1, …, from seekClips), cropped to `size`'s shape around its focus,
 * punched in by its zoom or moved by its moves, scaled to `size` and set to
 * `fps`, so clips from any sources join; or with `split`'s two areas stacked
 * into 1080x1920. Then,
 * over the picture: `inserts` (images or videos, the inputs after the
 * overlays), and `overlays` (text drawn as images, the inputs after the
 * clips), each for its stretch of the finished video in seconds, its middle
 * at `y` of the height. `burn` draws the captions in CAPTIONS over all of it,
 * at `captionsY`. `sounds` (the inputs after the inserts) are mixed under the
 * speech, the sound cut to the picture's length unless `whole`, and left
 * for `level` to bring to LUFS. `size` is the finished picture's, `WxH` (a
 * split's clips are brought to it before their areas are taken). A `silent`
 * clip's sound is silence. Ends in [v], and [a] if there's sound.
 */
export function renderGraph(
  clips: (Clip & { silent?: boolean })[],
  {
    audio,
    size = "1920x1080",
    fps,
    split,
    burn = false,
    captionsY = CAPTIONS_Y,
    overlays = [],
    inserts = [],
    sounds = [],
    whole = false,
    gain = 0,
  }: {
    audio: boolean;
    size?: string;
    fps: number;
    split?: { top: Area; bottom: Area };
    burn?: boolean;
    captionsY?: number;
    overlays?: (Omit<Cue, "text"> & { y?: number })[];
    inserts?: Omit<Cue, "text">[];
    sounds?: Sound[];
    whole?: boolean;
    /** The speech's gain in dB before sounds are mixed under it: see mixGraph. */
    gain?: number;
  },
): string {
  const out = split ? "1080x1920" : size;
  // Transitions overlap clips with xfade, which needs every input on one timebase.
  const chained = clips.some((c, i) => i > 0 && c.transition);
  // A J or L cut makes a clip's sound longer or shorter than its picture, so they're joined apart.
  const apart = clips.some((c) => c.sound);
  // A split takes its areas from the whole picture, so its clips aren't framed
  // one by one, only brought to one size if they're from different sources.
  const parts = clips.map((clip, i) => {
    const speed = clip.speed && clip.speed !== 1 ? `,setpts=PTS/${clip.speed}` : "";
    const look =
      split || !clip.moves?.length
        ? `${frame(split ? { from: 0, to: 0 } : clip, size)},fps=${fps}`
        : `,fps=${fps},${moving(clip, size, fps)}`;
    const tb = chained ? `,settb=1/${fps}` : "";
    // The input opens the picture's and the sound's stretches together; each takes its own.
    const start = opened(clip).from;
    const cut = clip.sound
      ? `trim=start=${clip.from - start}:duration=${clip.to - clip.from},`
      : "";
    const fx = effectFilters(clip.effects);
    const v = `[${i}:v]${cut}setpts=PTS-STARTPTS${speed},${SQUARE}${look}${fx.video ? `,${fx.video}` : ""}${tb}[v${i}]`;
    if (!audio) return v;
    const heard = clip.sound ?? clip;
    const acut = clip.sound
      ? `atrim=start=${heard.from - start}:duration=${heard.to - heard.from},`
      : "";
    const a = clip.silent
      ? `aevalsrc=0:c=stereo:s=48000:d=${(heard.to - heard.from) / (clip.speed ?? 1)}[a${i}]`
      : `[${i}:a]${acut}asetpts=PTS-STARTPTS${speed ? `,${tempo(clip.speed as number)}` : ""}${fx.audio ? `,${fx.audio}` : ""}[a${i}]`;
    return `${v};${a}`;
  });
  const inputs = clips.map((_, i) => (audio ? `[v${i}][a${i}]` : `[v${i}]`)).join("");
  const joined = chained
    ? chain(clips, audio, fps)
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
      gain,
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
 * the speech, labelled [speech] if there is any and raised by `gain` dB
 * when there's something to mix under it, cut to `length` seconds and
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
    gain = 0,
  }: { speech: boolean; length: number; first: number; whole?: boolean; gain?: number },
): string[] {
  const ducked = sounds.filter((s) => s.duck).length;
  const keyLabels = sounds.flatMap((s, i) => (s.duck ? [`[key${i}]`] : [])).join("");
  // The speech brought to LUFS first (`gain`, from speechGain), so a sound's
  // volume and the duck's threshold mean the same on any recording (#212).
  const lift =
    audio && sounds.length && gain ? [`[speech]volume=${gain.toFixed(2)}dB[lifted]`] : [];
  const source = lift.length ? "[lifted]" : "[speech]";
  const speech = ducked ? "[voice]" : source;
  const keys = audio && ducked ? [`${source}asplit=${ducked + 1}${speech}${keyLabels}`] : [];
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
  return [...lift, ...keys, ...mixed, ...sound];
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
  /** The picture's codec and pixel format, e.g. "h264" and "yuv420p". */
  codec: string;
  pix: string;
}> {
  const proc = Bun.spawn(
    [
      "ffprobe",
      ...["-v", "error", "-show_entries"],
      "stream=codec_type,codec_name,pix_fmt,width,height,sample_aspect_ratio,avg_frame_rate:stream_side_data=rotation:format=duration",
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
    codec_name?: string;
    pix_fmt?: string;
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
    codec: picture?.codec_name ?? "",
    pix: picture?.pix_fmt ?? "",
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

/** `out`, or `<name>-<kind>-N.mp4` (or `ext`) next to the source with the first N that's free; claimed. */
function outputFor(
  path: string,
  out: string | undefined,
  sidecar: boolean,
  kind = "short",
  ext = ".mp4",
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
    if (claimAll(`${base}-${kind}-${n}${ext}`, sidecar)) return `${base}-${kind}-${n}${ext}`;
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
      // Stays up into a short pause rather than flickering off. Across a
      // transition the next page can start before this one ends: end with it.
      const until = Math.min(
        cut,
        next <= last.end ? last.end : next - last.end <= 0.5 ? next : last.end + 0.2,
      );
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

/**
 * ffmpeg's `-filter_complex graph`, read from a file in `dir`: 100 clips make
 * a graph longer than a Windows command line can be (32,767 characters, #202).
 */
function graphFile(graph: string, dir: string, name = "graph"): string[] {
  const file = join(dir, `${name}.txt`);
  writeFileSync(file, graph);
  // `-/option file` arrived in ffmpeg 7.0; 6.x (Ubuntu 24.04's) only knows
  // -filter_complex_script, which newer releases dropped (9.0 has none).
  return [ffmpegMajor() >= 7 ? "-/filter_complex" : "-filter_complex_script", file];
}

/** The system ffmpeg's major version, read once; 99 for a git build, which is newer than any release. */
let major: number | undefined;
export const ffmpegMajor = () => {
  major ??= (() => {
    const r = Bun.spawnSync(["ffmpeg", "-hide_banner", "-version"], { stderr: "ignore" });
    const n = Number(r.stdout.toString().match(/^ffmpeg version n?(\d+)\./)?.[1]);
    return Number.isFinite(n) && n > 0 ? n : 99;
  })();
  return major;
};

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
  return integrated(said);
}

/** The integrated loudness in an ebur128 log: its summary's "I:" line, the last one. */
function integrated(said: string): number {
  const found = [...said.matchAll(/^\s*I:\s+(-?[\d.]+|-inf) LUFS/gm)].at(-1)?.[1];
  return found === undefined || found === "-inf" ? -Infinity : Number(found);
}

/**
 * The gain in dB that brings the speech to LUFS before sounds are mixed
 * under it (#212). Without it, a quiet recording (-31 LUFS is common) never
 * reaches the duck's threshold, and music at a given volume sits far above
 * it until `level` raises the whole mix. `input` is ffmpeg's inputs and
 * `streams` the speech in them, joined in order. 0 for silence.
 */
async function speechGain(input: string[], streams: string[]): Promise<number> {
  if (!streams.length) return 0;
  const graph = `${streams.join("")}concat=n=${streams.length}:v=0:a=1,ebur128=framelog=quiet`;
  const proc = Bun.spawn(
    ["ffmpeg", "-nostdin", "-nostats", ...input, "-filter_complex", graph, "-f", "null", "-"],
    { stderr: "pipe" },
  );
  const said = await new Response(proc.stderr).text();
  if ((await proc.exited) !== 0)
    throw new Error(`ffmpeg couldn't measure the speech: ${said.trim()}`);
  const lufs = integrated(said);
  return lufs > -70 ? Math.min(MAX_GAIN, LUFS - lufs) : 0;
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
    size: string;
    fps: number;
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
        ...graphFile(renderGraph(batch, { ...look, whole: true }), dir),
        "-map",
        "[v]",
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

/** A stretch of a clip's picture, frames `a` to `b` of its source: copied as it is, or encoded. */
export type Piece = { clip: Clip; a: number; b: number; copy: boolean };

/**
 * How each clip's picture is made when render can copy: a clip that `can`
 * be copied keeps the whole groups of pictures inside it, from the first
 * keyframe in `keys` (frame numbers of its source) at or after its start to
 * the last at or before its end, and only the frames either side are
 * encoded. A clip with no whole group inside, or that can't be copied, is
 * encoded. Clips are cut to whole frames at `fps`.
 */
export function pieces(
  clips: Clip[],
  fps: number,
  keys: (c: Clip) => number[],
  can: (c: Clip) => boolean,
): Piece[] {
  return clips.flatMap((clip) => {
    const [a, b] = [Math.round(clip.from * fps), Math.round(clip.to * fps)];
    const ks = can(clip) ? keys(clip) : [];
    const first = ks.find((k) => k >= a);
    const last = ks.findLast((k) => k <= b);
    if (first === undefined || last === undefined || first >= last) {
      return [{ clip, a, b, copy: false }];
    }
    return [
      { clip, a, b: first, copy: false },
      { clip, a: first, b: last, copy: true },
      { clip, a: last, b, copy: false },
    ].filter((p) => p.b > p.a);
  });
}

/**
 * The keyframes of `path`'s picture that a copy can start at, as frame
 * numbers at `fps` from the file's start: each one starts a closed group
 * (no picture after it in decode order shows before it), and every packet
 * sits on a whole frame, so a copied stretch keeps the output's rate.
 * Empty if the frames aren't evenly `fps` apart.
 */
export async function copyKeys(path: string, fps: number): Promise<number[]> {
  const proc = Bun.spawn(
    [
      ...["ffprobe", "-v", "error", "-select_streams", "v:0"],
      ...["-show_entries", "packet=pts_time,flags:format=start_time", "-of", "csv=p=0", path],
    ],
    { stderr: "ignore" },
  );
  const lines = (await new Response(proc.stdout).text()).trim().split("\n");
  if ((await proc.exited) !== 0) return [];
  // Packets in decode order, then the format's start time last.
  const start = Number(lines.pop()) || 0;
  const packets = lines.map((l) => {
    const [pts = "", flags = ""] = l.split(",");
    return { at: (Number(pts) - start) * fps, key: flags.startsWith("K") };
  });
  if (packets.some((p) => !Number.isFinite(p.at) || Math.abs(p.at - Math.round(p.at)) > 0.01))
    return [];
  const keys: number[] = [];
  packets.forEach((p, i) => {
    if (!p.key) return;
    const frame = Math.round(p.at);
    // A leading picture (an open group) shows before its keyframe but is decoded after it.
    let open = false;
    for (let j = i + 1; j < packets.length && !packets[j]?.key; j++) {
      if ((packets[j]?.at ?? 0) < p.at) open = true;
    }
    if (!open) keys.push(frame);
  });
  return keys;
}

/**
 * Writes `unlevelled` (picture and unlevelled sound, as render's one pass
 * would) by copying the groups of pictures that need nothing done to them
 * and encoding only the rest: clip edges and reframed clips. The encoded
 * frames are one x264 stream, a keyframe forced at each piece, then split
 * at those frames. x264 numbers its parameter sets 1, so they never replace
 * the source's 0 where the two meet (#166). Returns false, having written
 * nothing usable, if there's nothing to copy.
 */
async function copyRender(
  path: string,
  clips: (Clip & { silent?: boolean })[],
  dir: string,
  unlevelled: string,
  {
    audio,
    size,
    fps,
    sounds,
    probes,
    gain,
  }: {
    audio: boolean;
    size: string;
    fps: number;
    sounds: (Sound & { path: string })[];
    probes: Map<string, Awaited<ReturnType<typeof probe>>>;
    gain: number;
  },
): Promise<boolean> {
  // ponytail: copies from the first source only, so its parameter sets are the only 0s; one per source if mixed edits need it.
  const from = clips[0]?.path ?? path;
  const p = probes.get(from);
  if (p?.codec !== "h264" || p.pix !== "yuv420p" || p.size !== size || p.fps !== fps) {
    return false;
  }
  const keys = await copyKeys(from, fps);
  const plan = pieces(
    clips,
    fps,
    () => keys,
    (c) => (c.path ?? path) === from && (c.zoom ?? 1) === 1 && !c.moves?.length,
  );
  if (!plan.some((q) => q.copy)) return false;
  const at = (q: Piece) => ({ ...q.clip, from: q.a / fps, to: q.b / fps });
  const files: string[] = plan.map((_, i) => `piece-${i}.ts`);
  // The encoded pieces, CLIPS_PER_PASS to an ffmpeg, each starting on a keyframe.
  const encoded = plan.flatMap((q, i) => (q.copy ? [] : [{ q, i }]));
  for (let n = 0; n < encoded.length; n += CLIPS_PER_PASS) {
    const batch = encoded.slice(n, n + CLIPS_PER_PASS);
    let frame = 0;
    const starts = batch.map(({ q }) => {
      const s = frame;
      frame += q.b - q.a;
      return s;
    });
    const parts = batch.map(({ q }) => at(q));
    await ffmpeg(
      [
        // Decoded in software: a source in the output's codec and size decodes
        // fast anyway, and setting up 100 hardware decoders took longer (#166).
        ...seekClips(path, parts).filter((arg) => arg !== "-hwaccel" && arg !== "auto"),
        ...graphFile(renderGraph(parts, { audio: false, size, fps }), dir),
        "-map",
        "[v]",
        ...["-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p"],
        ...["-x264-params", "sps-id=1", "-forced-idr", "1"],
        // A quarter frame early: a time a hair past frame s would force the keyframe onto s + 1.
        ...[
          "-force_key_frames",
          starts.map((s) => (Math.max(0, s - 0.25) / fps).toFixed(6)).join(","),
        ],
        ...["-f", "segment", "-segment_format", "mpegts"],
        ...(starts.length > 1 ? ["-segment_frames", starts.slice(1).join(",")] : []),
        join(dir, `encoded-${n}-%d.ts`),
      ],
      `encode the edges of ${path}'s clips`,
    );
    batch.forEach(({ i }, k) => {
      renameSync(join(dir, `encoded-${n}-${k}.ts`), join(dir, files[i] as string));
    });
  }
  // The copied groups, a few at a time: each is a seek and a copy.
  const copied = plan.flatMap((q, i) => (q.copy ? [{ q, i }] : []));
  for (let n = 0; n < copied.length; n += 8) {
    await Promise.all(
      copied.slice(n, n + 8).map(({ q, i }) =>
        ffmpeg(
          [
            // Half a frame in, so the seek lands on this keyframe, not the one before.
            ...["-ss", ((q.a + 0.5) / fps).toFixed(6), "-i", from, "-map", "0:v:0"],
            ...["-frames:v", String(q.b - q.a), "-c", "copy", "-f", "mpegts"],
            join(dir, files[i] as string),
          ],
          `copy ${from} from ${(q.a / fps).toFixed(2)}s`,
        ),
      ),
    );
  }
  // Each piece has exactly its frames, or the picture would drift from the sound.
  await Promise.all(
    plan.map(async (q, i) => {
      const got = await packets(join(dir, files[i] as string));
      if (got !== q.b - q.a) {
        throw new Error(
          `piece ${i} of ${path} has ${got} frames, not ${q.b - q.a} (${q.copy ? "copied" : "encoded"}, ${q.a}-${q.b})`,
        );
      }
    }),
  );
  const list = join(dir, "pieces.txt");
  writeFileSync(list, files.map((f) => `file '${f}'`).join("\n"));
  // The sound, cut to the same whole frames, with the sounds mixed under it.
  const cut = clips.map((c) => ({
    ...c,
    from: Math.round(c.from * fps) / fps,
    to: Math.round(c.to * fps) / fps,
  }));
  const hasSound = audio || sounds.length > 0;
  const sound = join(dir, "sound.mkv");
  if (hasSound) {
    const speech = audio
      ? [
          ...cut.map((c, i) =>
            c.silent
              ? `aevalsrc=0:c=stereo:s=48000:d=${c.to - c.from}[a${i}]`
              : `[${i}:a]asetpts=PTS-STARTPTS[a${i}]`,
          ),
          `${cut.map((_, i) => `[a${i}]`).join("")}concat=n=${cut.length}:v=0:a=1[speech]`,
        ]
      : [];
    const length = cut.reduce((t, c) => t + c.to - c.from, 0);
    const graph = [
      ...speech,
      ...mixGraph(sounds, { speech: audio, length, first: cut.length, gain }),
    ].join(";");
    await ffmpeg(
      [
        ...seekClips(path, cut),
        ...sounds.flatMap((s) => [...(s.loop ? ["-stream_loop", "-1"] : []), "-i", s.path]),
        ...graphFile(graph, dir, "sound"),
        ...["-map", "[a]", "-c:a", "pcm_f32le", sound],
      ],
      `cut ${path}'s sound`,
    );
  }
  await ffmpeg(
    [
      ...["-f", "concat", "-safe", "0", "-i", list],
      ...(hasSound ? ["-i", sound, "-map", "0:v", "-map", "1:a"] : []),
      ...["-c", "copy", unlevelled],
    ],
    `join ${path}'s pieces`,
  );
  return true;
}

/** How many video packets `file` has: its frames, without decoding them. */
async function packets(file: string): Promise<number> {
  const proc = Bun.spawn(
    [
      ...["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets"],
      ...["-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", file],
    ],
    { stderr: "ignore" },
  );
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  // An MPEG-TS lists its stream again under its program: the first line is enough.
  return Number.parseInt(out, 10);
}

/** Files ffmpeg reads as one still picture, which then has to be repeated to last. */
const STILL = /\.(png|jpe?g|webp|heic|bmp|tiff?)$/i;

/** How long a segment runs before the cache may start another (#165). */
const SEGMENT_SECONDS = 10;

/**
 * Where a project's render is cut into cached segments (#165): runs of
 * clips, as [first, end) indexes. A segment ends at a clip edge once it's
 * SEGMENT_SECONDS long or CLIPS_PER_PASS clips, but never where a transition
 * joins two clips or an insert plays across the edge: the insert, a video,
 * would start over. Captions and texts are still pictures, so each segment
 * draws its part of one that crosses.
 */
export function segments(
  clips: Clip[],
  inserts: { from: number; to: number }[],
): [number, number][] {
  const { starts } = timeline(clips);
  const runs: [number, number][] = [];
  let first = 0;
  for (let i = 1; i < clips.length; i++) {
    const t = starts[i] as number;
    const long = t - (starts[first] as number) >= SEGMENT_SECONDS || i - first >= CLIPS_PER_PASS;
    // A J or L cut moves the sound's edge off the picture's, and concat would
    // start the next file's sound after this one's: keep that edge inside a segment.
    const next = clips[i];
    const before = clips[i - 1];
    const moved =
      (next?.sound && next.sound.from !== next.from) ||
      (before?.sound && before.sound.to !== before.to);
    const crossed = next?.transition || moved || inserts.some((s) => s.from < t && s.to > t);
    if (long && !crossed) {
      runs.push([first, i]);
      first = i;
    }
  }
  runs.push([first, clips.length]);
  return runs;
}

/** What a file is, for a cache key: a file changed on disk gets a new key. */
const stamp = (file: string) => {
  const s = statSync(file);
  return `${resolve(file)}:${s.size}:${s.mtimeMs}`;
};

/**
 * Every file under `dir` that `keep` accepts, by path, size and time, into a
 * cache key: a page's image in assets/, or lib/harmony.js a generator
 * imports, changes the key when it changes. Hidden entries (a kit copy being
 * rendered, a temp file) and node_modules are left out.
 */
// ponytail: at most 5,000 files, so a page kept in a big folder can't stall a render; past that the rest go unnoticed.
function stampFolder(hash: Hash, dir: string, keep: (name: string) => boolean = () => true) {
  let left = 5000;
  const walk = (at: string) => {
    for (const f of readdirSync(at).sort()) {
      if (left <= 0 || f.startsWith(".") || f === "node_modules") continue;
      const full = join(at, f);
      const s = statSync(full);
      if (s.isDirectory()) walk(full);
      else if (s.isFile() && keep(f)) {
        left--;
        hash.update(`${relative(dir, full)}:${s.size}:${s.mtimeMs}\n`);
      }
    }
  };
  walk(dir);
}

/** The engine's own code, so a segment drawn by an older engine isn't used again. */
// ponytail: the files that build the picture, not everything they import; add any whose change goes unnoticed.
const ENGINE = createHash("sha256")
  .update(readFileSync(import.meta.path))
  .update(readFileSync(join(import.meta.dir, "effects.ts")))
  .update(readFileSync(Bun.resolveSync("@mockingbird/captions", import.meta.dir)))
  .digest("hex");

/**
 * A project's render from segments kept under ~/.mockingbird/cache/segments/
 * (#165): each run of clips from `segments` is rendered with the captions,
 * texts and inserts over it, keyed by all of those, the look and the engine,
 * so an edit renders again only the segments it touches. The segments are
 * joined without encoding again, then the sounds are mixed and levelled over
 * the whole video. Undefined, having made nothing, if the captions or texts
 * can't be drawn as pictures here: render's own way handles those.
 */
async function segmented(
  path: string,
  clips: (Clip & { silent?: boolean })[],
  {
    audio,
    size,
    fps,
    split,
    cues,
    captionsY,
    texts,
    inserts,
    sounds,
    out,
    named,
    kind,
  }: {
    audio: boolean;
    size: string;
    fps: number;
    split?: { top: Area; bottom: Area };
    cues: Cue[];
    captionsY: number;
    texts: Text[];
    inserts: Insert[];
    sounds: (Sound & { path: string })[];
    out?: string;
    named: string;
    kind: string;
  },
): Promise<string | undefined> {
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-segments-"));
  let target: string | undefined;
  let made = false;
  try {
    const lines = [...cues.map((c) => c.text), ...texts.map((t) => t.text)];
    const [width, height] = (split ? "1080x1920" : size).split("x").map(Number);
    const chrome = lines.length ? findChrome() : undefined;
    const wrap = noNetwork();
    const fonts = fontFaces();
    const images = lines.length
      ? await drawCaptions(lines, dir, width ?? 1080, height, { chrome, wrap, fonts })
      : [];
    if (!images) return undefined;
    const layers = [
      ...cues.map(({ start, end }) => ({ start, end, y: captionsY })),
      ...texts.map(({ from, to, y }) => ({ start: from, end: to, y })),
    ].map((l, i) => ({ ...l, image: images[i] as string, text: lines[i] }));
    const put = inserts.map((i) => ({ path: i.path, start: i.from, end: i.to }));
    const { starts, length } = timeline(clips);
    const cache = join(mockingbirdHome(), "cache", "segments");
    mkdirSync(cache, { recursive: true });
    const runs = segments(clips, inserts);
    // ponytail: one segment at a time, since each is timed from the ones before; a first render is ~10% slower than one pass. Render the segments with nothing over them in parallel if that matters.
    const files: string[] = [];
    let reused = 0;
    // Where this segment starts in the joined video: concat puts each file after
    // the ones before by their length, sound included, which rounding to whole
    // frames leaves a little off the timeline's time.
    let t0 = 0;
    for (const [a, b] of runs) {
      const part = clips.slice(a, b);
      const t1 = t0 + (b < clips.length ? (starts[b] as number) : length) - (starts[a] as number);
      // What lies over this segment, timed from its first frame; a frame to spare at its end.
      const over = <T extends { start: number; end: number }>(xs: T[]) =>
        xs
          .filter((x) => x.start < t1 + 1 / fps && x.end > t0)
          .map((x) => ({ ...x, start: Math.max(0, x.start - t0), end: x.end - t0 }));
      const laid = over(layers);
      const shown = over(put);
      const key = createHash("sha256")
        .update(
          JSON.stringify([
            ENGINE,
            audio,
            size,
            fps,
            split ?? null,
            // A LUT edited in place changes the grade, so effects' files are stamped too.
            part.map((c) => ({
              ...c,
              path: stamp(c.path ?? path),
              ...(c.effects && {
                effects: c.effects.map((e) =>
                  typeof e.file === "string" ? { ...e, file: stamp(e.file) } : e,
                ),
              }),
            })),
            // By its words, not its pixels: Chrome's antialiasing varies a little with the line drawn before.
            chrome ?? null,
            // The fonts are pinned, so which are there says what they draw.
            fonts.map((f) => f.url),
            laid.map((l) => [l.start, l.end, l.y, l.text]),
            shown.map((s) => [s.start, s.end, stamp(s.path)]),
          ]),
        )
        .digest("hex")
        .slice(0, 32);
      const file = join(cache, `${key}.mkv`);
      files.push(file);
      if (existsSync(file)) {
        reused++;
        t0 += (await probe(file)).seconds;
        continue;
      }
      // Its own temp name, so two renders of the same segment don't write one file.
      const tmp = join(cache, `${key}.${process.pid}-${randomUUID()}.part.mkv`);
      try {
        await ffmpeg(
          [
            ...seekClips(path, part),
            ...laid.flatMap((l) => ["-i", l.image]),
            ...shown.flatMap((s) => [...(STILL.test(s.path) ? ["-loop", "1"] : []), "-i", s.path]),
            ...graphFile(
              renderGraph(part, {
                audio,
                size,
                fps,
                split,
                overlays: laid,
                inserts: shown,
                whole: true,
              }),
              dir,
              "segment",
            ),
            ...["-map", "[v]", ...(audio ? ["-map", "[a]", "-c:a", "pcm_f32le"] : [])],
            ...["-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", tmp],
          ],
          `render clips ${a + 1}-${b} of ${named}`,
        );
        renameSync(tmp, file);
      } finally {
        rmSync(tmp, { force: true });
      }
      t0 += (await probe(file)).seconds;
    }
    const list = join(dir, "segments.txt");
    writeFileSync(list, files.map((f) => `file '${f.replaceAll("'", "'\\''")}'`).join("\n"));
    const joined = join(dir, "joined.mkv");
    await ffmpeg(
      ["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined],
      `join ${named}'s segments`,
    );
    target = outputFor(named, out, false, kind);
    if (audio || sounds.length) {
      const unlevelled = join(dir, "unlevelled.mkv");
      const gain = audio && sounds.length ? await speechGain(["-i", joined], ["[0:a]"]) : 0;
      const graph = [
        ...(audio ? ["[0:a]anull[speech]"] : []),
        ...mixGraph(sounds, { speech: audio, length, first: 1, gain }),
      ].join(";");
      await ffmpeg(
        [
          "-i",
          joined,
          ...sounds.flatMap((s) => [...(s.loop ? ["-stream_loop", "-1"] : []), "-i", s.path]),
          ...["-filter_complex", graph, "-map", "0:v", "-map", "[a]"],
          ...["-c:v", "copy", "-c:a", "pcm_f32le", unlevelled],
        ],
        `mix ${target}'s sound`,
      );
      await level(unlevelled, target);
    } else {
      await ffmpeg(
        ["-i", joined, "-map", "0", "-c", "copy", "-movflags", "+faststart", target],
        `save ${target}`,
      );
    }
    made = true;
    const kept = `${reused} of ${runs.length} segments reused`;
    return `${target} (${fineClock((await probe(target)).seconds * 1000)}), ${kept}${cues.length ? ", captions drawn on the picture" : ""}`;
  } finally {
    if (!made && target) rmSync(target, { force: true });
    rmSync(dir, { recursive: true, force: true });
  }
}

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
    draft = false,
    soundOnly = false,
    cache = false,
  }: {
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
    /** Half the size, encoded as fast as x264 goes: a preview to check the edit with. */
    draft?: boolean;
    /** The sound alone, as an .m4a: the picture is built but not encoded (#170). */
    soundOnly?: boolean;
    /** A project's: rendered from cached segments, so an edit renders only what it changed (#165). */
    cache?: boolean;
  },
): Promise<string> {
  requireFile(path, "File");
  if (!clips.length) throw new Error("No clips: give at least one { from, to } in seconds.");
  for (const [i, c] of clips.entries()) {
    if (!(Number.isFinite(c.from) && Number.isFinite(c.to) && c.from >= 0 && c.to > c.from)) {
      throw new Error(`A clip needs 0 <= from < to, in seconds; got ${JSON.stringify(c)}.`);
    }
    for (const e of checkEffects(c.effects, `clips[${i}].effects`)) {
      if (typeof e.file === "string") requireFile(e.file, "LUT");
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
  // A split takes its areas from one picture, so its clips are brought to the first's size.
  const frameSize = split ? source.size : (size ?? source.size);
  const rate = fps ?? source.fps;
  const bare =
    !soundOnly &&
    !captions?.trim() &&
    !texts.length &&
    !split &&
    !draft &&
    !inserts.length &&
    clips.every((c) => !c.transition && !c.sound && (c.speed ?? 1) === 1 && !c.effects?.length);
  // Nothing drawn and every clip as recorded: copying (#166) beats encoding segments to cache.
  if (cache && !draft && !soundOnly && !bare) {
    const made = await segmented(path, shaped, {
      audio,
      size: frameSize,
      fps: rate,
      split,
      cues: captions?.trim() ? parseSrt(captions.trim()) : [],
      captionsY,
      texts,
      inserts,
      sounds,
      out,
      named,
      kind,
    });
    if (made) return made;
  }
  if (clips.length > CLIPS_PER_PASS) {
    // ponytail: a transition can't cross two batches; join batches with xfade if long edits need them.
    if (clips.some((c, i) => i > 0 && c.transition)) {
      throw new Error(
        `Transitions work with up to ${CLIPS_PER_PASS} clips for now; this has ${clips.length}.`,
      );
    }
    const batches = mkdtempSync(join(tmpdir(), "mockingbird-batches-"));
    try {
      const look = { audio, size: frameSize, fps: rate, split };
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
        draft,
        soundOnly,
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
    const [width, height] = (split ? "1080x1920" : frameSize).split("x").map(Number);
    // Drawn in the pinned Chrome, started under the no-network sandbox where there is one (#157).
    const chrome = lines.length ? findChrome() : undefined;
    const wrap = noNetwork();
    const images = chrome
      ? await drawCaptions(lines, dir, width ?? 1080, height, { chrome, wrap, fonts: fontFaces() })
      : undefined;
    const burn = !!text && !images && (await canBurn());
    sidecar = !!text && !images && !burn;
    target = outputFor(named, out, sidecar, kind, soundOnly ? ".m4a" : ".mp4");
    const srt = text && !images ? join(dir, CAPTIONS) : undefined;
    if (srt) writeFileSync(srt, `${text}\n`);
    const gain =
      audio && sounds.length
        ? await speechGain(
            seekClips(path, clips),
            shaped.flatMap((c, i) => (c.silent ? [] : [`[${i}:a]`])),
          )
        : 0;
    const graph = renderGraph(shaped, {
      audio,
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
      gain,
    });
    const extras = [
      ...(images ?? []).flatMap((image) => ["-i", image]),
      ...inserts.flatMap((i) => [...(STILL.test(i.path) ? ["-loop", "1"] : []), "-i", i.path]),
      ...sounds.flatMap((s) => [...(s.loop ? ["-stream_loop", "-1"] : []), "-i", s.path]),
    ];
    const hasSound = audio || sounds.length > 0;
    if (soundOnly && !hasSound) throw new Error("This edit has no sound to render on its own.");
    const unlevelled = join(dir, "unlevelled.mkv");
    // Nothing drawn over the picture, no split, and every clip played as it
    // was recorded: the stretches already in the output's codec, size and rate
    // can be copied (#166). If copying fails, the whole picture is encoded.
    // The sound alone still runs the picture's graph, into ffmpeg's null output: unencoded, it costs little.
    const picture = soundOnly
      ? ["-map", "[a]", "-c:a", "pcm_f32le", unlevelled, "-map", "[v]", "-f", "null", "-"]
      : undefined;
    const copied =
      bare &&
      (await copyRender(path, shaped, dir, unlevelled, {
        audio,
        size: frameSize,
        fps: rate,
        sounds,
        probes,
        gain,
      }).catch(() => false));
    if (!copied) {
      const proc = Bun.spawn(
        [
          "ffmpeg",
          ...["-nostdin", "-y", "-loglevel", "error", ...seekClips(path, clips)],
          ...extras,
          ...(sidecar ? ["-i", CAPTIONS] : []),
          // A draft is the finished picture at half the size, captions and all.
          // The sound alone maps [v] to the null output, so it's never scaled.
          ...(draft && !soundOnly
            ? graphFile(`${graph};[v]scale=trunc(iw/4)*2:trunc(ih/4)*2,setsar=1[small]`, dir)
            : graphFile(graph, dir)),
          ...(picture ?? [
            ...["-map", draft ? "[small]" : "[v]"],
            // Uncompressed until `level` sets the volume, and in floating point:
            // music and effects mixed over speech can go past full scale, which
            // 16-bit samples would clip before the limiter could hold it.
            ...(hasSound ? ["-map", "[a]", "-c:a", "pcm_f32le"] : []),
            // The subtitle file is the input after the clips and the extras.
            ...(sidecar
              ? ["-map", `${clips.length + extras.filter((a) => a === "-i").length}:s`]
              : []),
            ...(sidecar ? ["-c:s", "srt"] : []),
            ...["-c:v", "libx264", "-crf", draft ? "23" : "18"],
            ...["-preset", draft ? "ultrafast" : "veryfast", "-pix_fmt", "yuv420p"],
            unlevelled,
          ]),
        ],
        { cwd: dir, stderr: "pipe" },
      );
      if ((await proc.exited) !== 0) {
        throw new Error(
          `ffmpeg couldn't render ${target}: ${(await new Response(proc.stderr).text()).trim()}`,
        );
      }
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
const MOTION_RUNNER = join(import.meta.dir, "motion-run.ts");
/** Two hours: past any real video, short of a frame count that never ends. */
const MOTION_MAX_SECONDS = 7200;

/**
 * Runs MOTION_RUNNER with `options` in a fresh process, sandboxed with no
 * network where the OS can (Chrome blocks it everywhere): the script is the client's code, and mockingbird's only download
 * is `models pull`. Returns what it printed.
 */
async function sandboxed(options: object, what: string): Promise<string> {
  const proc = Bun.spawn(
    [...noNetwork(), process.execPath, MOTION_RUNNER, JSON.stringify(options)],
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

/** The motion kit, as the URL a page imports it from. */
export const KIT_URL = pathToFileURL(join(PLUGIN, "skills", "motion-graphics", "kit.js")).href;

/**
 * A template imports the kit `from "KIT"`, and motion fills it in (#213): an
 * agent replacing it by hand hit the template's comment first, and a Windows
 * path isn't a URL. The filled-in copy goes beside the page, so the page's own
 * files are where it says. Returns the page to load: `script` itself when it
 * doesn't import "KIT".
 */
export function withKit(script: string): string {
  const html = readFileSync(script, "utf8");
  if (!html.includes('from "KIT"')) return script;
  const copy = join(dirname(script), `.${basename(script)}.${process.pid}-${Date.now()}.html`);
  writeFileSync(copy, html.replaceAll('from "KIT"', `from ${JSON.stringify(KIT_URL)}`));
  return copy;
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
  const chrome = needChrome();
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
  const page = withKit(script);
  const options = {
    script: page,
    chrome,
    out: target,
    width,
    height,
    fps,
    duration: seconds,
    video: path,
    audio,
    cues: captions?.trim() ? parseSrt(captions) : [],
    fonts: fontFaces(),
  };
  let said: string;
  try {
    said = await sandboxed(options, "the motion script");
  } catch (error) {
    rmSync(target, { force: true });
    throw error;
  } finally {
    if (page !== script) rmSync(page, { force: true });
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
      const gain = audio ? await speechGain(["-i", target], ["[0:a]"]) : 0;
      const graph = [
        ...(audio ? ["[0:a]anull[speech]"] : []),
        ...mixGraph(sounds, { speech: audio, length: frames / fps, first: 1, gain }),
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
  const { engines, language } = await enginesFor(sample, choice, log);
  const spell = speller(log, language);
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
    .update(JSON.stringify([3, source, size, mtimeMs, resolve(model), language]))
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
  const spell = speller(log, language);
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
 * Word-by-word captions for a compiled project's cut, as SRT timed to the
 * finished video: speed, transitions and J and L cuts included. Each
 * source's words come from the word cache.
 */
async function cutCaptions(
  cut: ReturnType<typeof compile>,
  log: (m: string) => void,
  { perCue = 3, lit = true, upper = false }: { perCue?: number; lit?: boolean; upper?: boolean },
): Promise<string> {
  const heard = await sourceWords(
    new Map(
      [...new Set(cut.clips.map((c) => c.path))].map((path) => [
        path,
        // The sound's stretch, which a J or L cut moves off the picture's.
        cut.clips.filter((c) => c.path === path).map((c) => c.sound ?? c),
      ]),
    ),
    log,
  );
  // Every word of the clip's source: wordCaptions keeps the ones inside each clip.
  const asr = (path: string): AsrWord[] =>
    (heard.get(path)?.words ?? []).map((w) => ({
      word: w.word,
      startMs: w.start * 1000,
      endMs: w.end * 1000,
      probability: 1,
    }));
  return wordCaptions(
    cut.clips,
    cut.clips.map((c) => asr(c.path)),
    { perCue, lit, upper },
  );
}

/** A source bigger than this on its short side is drafted from a proxy. */
const PROXY_OVER = 1080;

/**
 * `clips` with any from a source bigger than PROXY_OVER read from a proxy of
 * just the stretch it opens: 720 lines of H.264, made once and kept in
 * ~/.mockingbird/cache/proxies/. 4K HEVC decodes so slowly that a half-size
 * draft of a minute of it took 20.7 s from the source and 2.1 s from a proxy,
 * which took 22.2 s to make. Only the stretches used are proxied, so an
 * hour-long source isn't converted for a two-minute edit (#167).
 */
async function proxied(clips: Clip[]): Promise<Clip[]> {
  const sides = new Map<string, number>();
  const out: Clip[] = [];
  for (const c of clips) {
    const path = c.path as string;
    if (!sides.has(path)) sides.set(path, (await probe(path)).side);
    if ((sides.get(path) ?? 0) <= PROXY_OVER) {
      out.push(c);
      continue;
    }
    const { from, to } = opened(c);
    const { size, mtimeMs } = statSync(path);
    const key = createHash("sha256")
      .update(JSON.stringify([1, path, size, mtimeMs, from, to]))
      .digest("hex")
      .slice(0, 32);
    const file = join(mockingbirdHome(), "cache", "proxies", `${key}.mp4`);
    if (!existsSync(file)) {
      mkdirSync(dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.tmp.mp4`;
      await ffmpeg(
        [
          ...["-hwaccel", "auto", "-ss", String(from), "-t", String(to - from), "-i", path],
          ...[
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-vf",
            "scale='if(lt(iw,ih),720,-2)':'if(lt(iw,ih),-2,720)'",
          ],
          ...["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-g", "15"],
          ...["-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", temp],
        ],
        `make a draft proxy of ${path}`,
      );
      renameSync(temp, file);
    }
    // The proxy starts where the clip's input opened, and can end a frame short of it.
    const length = (await probe(file)).seconds;
    const moved = (r: { from: number; to: number }) => ({
      from: r.from - from,
      to: Math.min(r.to - from, length),
    });
    out.push({ ...c, path: file, ...moved(c), ...(c.sound && { sound: moved(c.sound) }) });
  }
  return out;
}

/**
 * The project in `file` rendered: its clips from their sources, framed to
 * its size, with captions made for the cut as it is now and everything on
 * it timed from its clips. Saved beside the project as `<name>-render-N.mp4`.
 */
/**
 * A project's overlays (#163), inserts whose picture is an HTML page: each
 * rendered alone with its transparency (ProRes 4444) at the project's size
 * and rate for its stretch, kept under ~/.mockingbird/cache/overlays/ by the
 * page's folder and the look, and laid over the cut like b-roll. A page's
 * `mockingbird.audio` joins the project's sound, timed from the overlay.
 */
async function overlays(
  inserts: Insert[],
  look: { size: string; fps: number },
  log: (m: string) => void,
): Promise<{ inserts: Insert[]; sounds: (Sound & { path: string })[] }> {
  const laid: Insert[] = [];
  const heard: (Sound & { path: string })[] = [];
  for (const insert of inserts) {
    if (!/\.html?$/i.test(insert.path)) {
      laid.push(insert);
      continue;
    }
    const page = requireFile(insert.path, "Page");
    const [width = 0, height = 0] = look.size.split("x").map(Number);
    const duration = Math.round((insert.to - insert.from) * 1000) / 1000;
    // A page loads its neighbours (CSS, images, the kit), so their sizes and times are in the key.
    // The pinned fonts are in it too, since the page draws with them.
    const fonts = fontFaces();
    const hash = createHash("sha256").update(
      JSON.stringify([2, basename(page), look, duration, fonts.map((f) => f.url)]),
    );
    stampFolder(hash, dirname(page));
    const key = hash.digest("hex").slice(0, 32);
    const cache = join(mockingbirdHome(), "cache", "overlays");
    const mov = join(cache, `${key}.mov`);
    const listed = join(cache, `${key}.json`);
    if (existsSync(mov) && existsSync(listed)) {
      log(`${basename(page)}: reusing the overlay rendered before`);
    } else {
      mkdirSync(cache, { recursive: true });
      log(`${basename(page)}: rendering ${duration.toFixed(1)} s of overlay`);
      // Temp names of its own, so two renders of one overlay don't write the same file.
      const part = join(cache, `${key}.${process.pid}-${randomUUID()}.part`);
      // A page copied from the templates imports "KIT", which motion fills in; so does this.
      const filled = withKit(page);
      try {
        const said = await sandboxed(
          {
            script: filled,
            chrome: needChrome(),
            out: `${part}.mov`,
            width,
            height,
            fps: look.fps,
            duration,
            alpha: true,
            fonts,
          },
          "the overlay page",
        );
        const result = JSON.parse(said.trim().split("\n").at(-1) || "{}") ?? {};
        writeFileSync(`${part}.json`, JSON.stringify(result.sounds ?? []));
        // The sounds first: a reader goes by the .mov, and finds its list there.
        renameSync(`${part}.json`, listed);
        renameSync(`${part}.mov`, mov);
      } finally {
        rmSync(`${part}.mov`, { force: true });
        rmSync(`${part}.json`, { force: true });
        if (filled !== page) rmSync(filled, { force: true });
      }
    }
    laid.push({ ...insert, path: mov });
    const sounds = JSON.parse(readFileSync(listed, "utf8")) as unknown;
    for (const [i, t] of items(sounds).entries()) {
      heard.push({
        path: requireFile(String(t.path), `${basename(page)}'s audio[${i}]`),
        at: insert.from + within(t.at, 0, Number.MAX_VALUE, `audio[${i}].at`, 0),
        volume: within(t.volume, 0, 4, `audio[${i}].volume`, 1),
        loop: !!t.loop,
        duck: !!t.duck,
      });
    }
  }
  return { inserts: laid, sounds: heard };
}

/**
 * A project's generated sounds made into WAVs (#170), each as long as the
 * video from where it starts, and kept under ~/.mockingbird/cache/music/ by
 * the generator's folder of modules and its arguments, so a render after an
 * edit doesn't generate the same bed again.
 */
async function beds(
  cut: ReturnType<typeof compile>,
  log: (m: string) => void,
): Promise<(Sound & { path: string })[]> {
  const out: (Sound & { path: string })[] = [];
  for (const { generator: g, path: file, ...rest } of cut.sounds) {
    if (!g) {
      out.push({ ...rest, path: file ?? "" });
      continue;
    }
    const script = requireFile(g.generator, "Generator");
    const params = {
      duration: Math.min(
        MOTION_MAX_SECONDS,
        Math.max(1, Math.round((cut.length - rest.at) * 1000) / 1000),
      ),
      seed: g.seed ?? 1,
      tempo: g.tempo,
      key: g.key,
      energy: g.energy,
    };
    // The generator imports its neighbours (lib.js, lib/harmony.js), so all of them are in the key.
    const hash = createHash("sha256").update(JSON.stringify([2, params]));
    stampFolder(hash, dirname(script), (f) => /\.m?js$/i.test(f));
    hash.update(basename(script));
    const wav = join(mockingbirdHome(), "cache", "music", `${hash.digest("hex").slice(0, 32)}.wav`);
    if (existsSync(wav)) {
      log(`${basename(script)}: reusing the bed made before`);
    } else {
      mkdirSync(dirname(wav), { recursive: true });
      log(`${basename(script)}: generating ${params.duration.toFixed(1)} s of music`);
      // Made under a temp name and renamed when whole: music() claims its out
      // file at the start, and another render would mix that empty file.
      const part = `${wav.slice(0, -4)}.${process.pid}-${randomUUID()}.part.wav`;
      try {
        await music(script, part, params);
        renameSync(part, wav);
      } finally {
        rmSync(part, { force: true });
      }
    }
    out.push({ ...rest, path: wav });
  }
  return out;
}

async function renderProject(
  file: string,
  log: (m: string) => void,
  out?: string,
  draft = false,
  soundOnly = false,
) {
  const { project, created } = load(file);
  if (created) throw new Error(`No project at ${file}; make one with \`edit\`.`);
  const cut = compile(project, dirname(file));
  const first = cut.clips[0]?.path;
  if (!first) throw new Error(`${file} has no clips yet; add some with \`edit\`.`);
  // The sound alone needs nothing drawn, so nothing is transcribed for captions.
  const said = cut.captions && !soundOnly ? await cutCaptions(cut, log, cut.captions) : undefined;
  // A draft reads 4K from proxies; its size is still the source's, not the proxy's.
  const clips = draft ? await proxied(cut.clips) : cut.clips;
  const source = await probe(first);
  const laid = soundOnly
    ? { inserts: [], sounds: [] }
    : await overlays(
        cut.inserts,
        { size: cut.size ?? source.size, fps: cut.fps ?? source.fps },
        log,
      );
  return render(clips[0]?.path ?? first, clips, {
    size: cut.size ?? (draft ? source.size : undefined),
    fps: cut.fps,
    split: cut.split,
    captions: said,
    captionsY: cut.captions?.y ?? CAPTIONS_Y,
    texts: soundOnly ? [] : cut.texts,
    inserts: laid.inserts,
    sounds: [...(await beds(cut, log)), ...laid.sounds],
    out,
    named: file,
    kind: soundOnly ? "sound" : draft ? "draft" : "render",
    draft,
    soundOnly,
    cache: true,
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
        if (a.project !== undefined) {
          // A project's words come from the word cache, heard with the user's settings.
          if (a.model !== undefined || a.language !== undefined) {
            throw new Error("`model` and `language` work with `path`, not with `project` yet.");
          }
          return projectTranscript(resolve(String(a.project)), log);
        }
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
- {op:"add", type:"audio", path, at?, clip?, volume?, loop?, duck?}: music or a sound effect under the speech. Or generated music in place of path: generator:{generator:"/abs/lofi.js", tempo?, key?, energy?, seed?} (a music generator; the bed is made at render time, as long as the video from at, and kept, so it isn't made again)
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
          sound: {
            type: "boolean",
            description:
              "A project's sound alone, as <name>-sound-N.m4a at -14 LUFS, to check the mix (speech, music, effects) without rendering the picture",
          },
          draft: {
            type: "boolean",
            description:
              "A quick preview at half the size, to check the cut before the real render: a project's 4K sources are read from small proxies of the stretches it uses, made once and kept",
          },
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
                effects: {
                  type: "array",
                  items: { type: "object" },
                  description: "Effects from the catalog (`effects` lists them), in order",
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
        if (a.project !== undefined) {
          return renderProject(resolve(String(a.project)), log, out, !!a.draft, !!a.sound);
        }
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
              ...(c.effects === undefined
                ? {}
                : { effects: checkEffects(c.effects, `clips[${i}].effects`) }),
            };
          }),
          {
            // Vertical is the 9:16 frame a project would ask for by size.
            size: a.vertical ? "1080x1920" : undefined,
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
            draft: !!a.draft,
          },
        );
      },
    },
    {
      name: "captions",
      description:
        "Word-by-word captions for the video `render` will make from these clips, or from an `edit` `project` (speed, transitions and J and L cuts included), as SRT timed to the finished video: up to `perCue` words a cue, the word being said marked *like this* so render draws it yellow. Edit the text if you like (fix a misheard word, mark a different word), then pass it to render's `captions`.",
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
          project: {
            type: "string",
            description:
              "Absolute path to a project file from `edit`, in place of `path` and `clips`; perCue, lit and upper default to the project's captions",
          },
        },
      },
      run: async (a) => {
        if (a.project !== undefined) {
          if (a.model !== undefined || a.language !== undefined) {
            throw new Error("`model` and `language` work with `path`, not with `project` yet.");
          }
          const file = resolve(String(a.project));
          const { project, created } = load(file);
          if (created) throw new Error(`No project at ${file}; make one with \`edit\`.`);
          const cut = compile(project, dirname(file));
          if (!cut.clips.length)
            throw new Error(`${file} has no clips yet; add some with \`edit\`.`);
          const set = project.captions ?? {};
          const srt = await cutCaptions(cut, log, {
            perCue: Math.round(within(a.perCue, 1, 8, "perCue", set.perCue ?? 3)),
            lit: a.lit === undefined ? (set.lit ?? true) : !!a.lit,
            upper: a.upper === undefined ? (set.upper ?? false) : !!a.upper,
          });
          return srt || "No speech in the cut.";
        }
        if (a.path === undefined) throw new Error("Give a `path` and `clips`, or a `project`.");
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
      name: "effects",
      description:
        "The effects catalog: each effect's name, whether it's on the picture or the sound, and its settings with their ranges and defaults. Put effects on a project's clip with edit's {op:\"set\", id, effects:[{name:\"color\", exposure:0.5}, {name:\"denoise\", amount:0.4}]}, or on render's clips (effects: [...]). They apply in order, after the clip's framing; check a grade with `scopes`.",
      inputSchema: { type: "object", properties: {} },
      run: async () => catalog(),
    },
    {
      name: "scopes",
      description:
        "Measure a video's picture, as a colourist reads the scopes, since you can't judge a grade from a few stills: mean and 5th to 95th percentile luma, the histogram's shadows, mids and highlights, crushed blacks and clipped whites, mean saturation, and how far skin sits from the skin-tone line. Each number comes with what a graded picture usually shows. `from`/`to` (seconds) measure one stretch; it samples up to 60 frames. Grade with `effect`s, render, and measure again.",
      inputSchema: {
        type: "object",
        properties: {
          path,
          from: { type: "number", description: "Start, in seconds from the start of the file" },
          to: { type: "number", description: "End, in seconds (default the end)" },
          every: { type: "number", description: "Seconds between frames (default 1)" },
        },
        required: ["path"],
      },
      run: async (a) => {
        const file = requireFile(resolve(String(a.path)), "File");
        const info = await probe(file);
        if (!info.video) throw new Error(`${file} has no video, only audio.`);
        const from = seconds(a.from) ?? 0;
        return scopes(file, info.size, {
          from,
          to: Math.min(seconds(a.to) ?? info.seconds, info.seconds),
          every: within(a.every, 0.04, 600, "every", 1),
        });
      },
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
      name: "scenes",
      description:
        "The cuts in a video: each shot change's time ([mm:ss.cc]) and how big a change it is (0-100), plus cuts a minute and seconds a shot. To find the shots in b-roll, a screen recording or multi-camera footage without looking at every frame, or to measure a reference video's pace. `from`/`to` (seconds) look at one stretch. `threshold` (0-100, default 10) is how different two frames must be: lower finds subtler cuts, such as a jump cut within one shot.",
      inputSchema: {
        type: "object",
        properties: {
          path,
          from: { type: "number", description: "Start, in seconds from the start of the file" },
          to: { type: "number", description: "End, in seconds from the start of the file" },
          threshold: {
            type: "number",
            minimum: 0,
            maximum: 100,
            description: "0-100 (default 10)",
          },
        },
        required: ["path"],
      },
      run: (a) =>
        scenes(String(a.path), {
          from: seconds(a.from),
          to: seconds(a.to),
          threshold: within(a.threshold, 0, 100, "threshold", 10),
        }),
    },
    {
      name: "pauses",
      description:
        "The pauses in a file's sound (ffmpeg's silencedetect), and render's clips that keep the speech between them: each pause at least `minPause` seconds long is cut, `margin` seconds kept into it either side, and a stretch of 0.3 s or less is joined to the next so no word is lost. Returns one line per pause (start end length, in seconds of the file), then the clips as JSON for render. Short: minPause 0.3, margin 0.1. Long-form: 0.5 and 0.2. Whisper's word times smear across silences, so cut pauses with this, not with word gaps.",
      inputSchema: {
        type: "object",
        properties: {
          path,
          from: { type: "number", description: "Start, in seconds from the start of the file" },
          to: { type: "number", description: "End, in seconds (default the end)" },
          noise: {
            type: "number",
            description: "Quieter than this is a pause, in dB (default -35)",
          },
          shortest: {
            type: "number",
            description: "Shortest pause to report, in seconds (default 0.25)",
          },
          minPause: {
            type: "number",
            description: "Shortest pause to cut, in seconds (default 0.4)",
          },
          margin: {
            type: "number",
            description: "Kept into each cut pause, in seconds (default 0.15)",
          },
        },
        required: ["path"],
      },
      run: async (a) => {
        const file = requireFile(String(a.path), "File");
        const from = seconds(a.from) ?? 0;
        const length = (await probe(file)).seconds;
        const end = Math.min(seconds(a.to) ?? length, length);
        if (!(end > from))
          throw new Error(`Nothing to look at from ${from}s: ${file} is ${length}s.`);
        const found = await findPauses(file, {
          from,
          to: end,
          noise: within(a.noise, -90, 0, "noise", -35),
          shortest: within(a.shortest, 0.01, 10, "shortest", 0.25),
        });
        const clips = clipsFrom(found, from, end, {
          min: within(a.minPause, 0.05, 30, "minPause", 0.4),
          margin: within(a.margin, 0, 5, "margin", 0.15),
        });
        const lines = found.map(
          (p) => `${p.start.toFixed(2)} ${p.end.toFixed(2)} ${p.length.toFixed(2)}`,
        );
        return `${lines.length ? lines.join("\n") : "no pauses"}\n\nclips: ${JSON.stringify(clips)}`;
      },
    },
    {
      name: "measure",
      description:
        "A finished video's picture size (WxH), length and loudness (EBU R128 integrated LUFS and true peak), to match a reference's style or check a render. Its cuts come from `scenes`.",
      inputSchema: { type: "object", properties: { path }, required: ["path"] },
      run: (a) => measure(requireFile(String(a.path), "File")),
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
