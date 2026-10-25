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
  let dictionary: ReturnType<typeof readDictionary> = [];
  try {
    dictionary = readDictionary();
  } catch (error) {
    // Names come out as heard; the transcript is still worth having.
    log(`warning: couldn't read the dictionary from data.db: ${error}`);
  }
  // A whisper-server of its own, so the agent's stays free for dictation.
  process.env.MOCKINGBIRD_ASR_PORT ??= String(freePort());
  const engines = await startEngines(log, dictionary);
  try {
    const { detectSpeech, asr } = engines.deps;
    const lines: string[] = [];
    for (const c of chunks(await detectSpeech(audio), 30 * rate)) {
      const piece = {
        sampleRate: rate,
        samples: audio.samples.subarray(c.startSample, c.endSample),
      };
      const heard = (await asr.transcribe(piece)).words;
      const offsetMs = startMs + (c.startSample / rate) * 1000;
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

/** Stills from a video, one every `every` seconds, as JPEGs in a new temp folder. */
async function frames(path: string, every: number): Promise<string> {
  requireFile(path, "File");
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-frames-"));
  const proc = Bun.spawn(
    [
      "ffmpeg",
      "-nostdin",
      "-loglevel",
      "error",
      "-i",
      path,
      "-vf",
      `fps=1/${every},scale='min(1280,iw)':-2`,
      join(dir, "%04d.jpg"),
    ],
    { stderr: "pipe" },
  );
  const failed = (await proc.exited) !== 0;
  const files = readdirSync(dir).sort();
  if (failed || !files.length) {
    rmSync(dir, { recursive: true, force: true });
    const why = await new Response(proc.stderr).text();
    // An audio file has no video stream to take stills from.
    if (!files.length && (!failed || /does not contain any stream/.test(why))) {
      return `${path} has no video, only audio. \`transcribe\` reads it.`;
    }
    throw new Error(`ffmpeg couldn't read frames from ${path}: ${why.trim()}`);
  }
  return files.map((f, i) => `[${clock(i * every * 1000)}] ${join(dir, f)}`).join("\n");
}

/** The captions file's name in render's temp folder. */
const CAPTIONS = "captions.srt";

/** A stretch of the source to keep, in seconds. */
export type Clip = { from: number; to: number };

/**
 * The ffmpeg filter graph that keeps `clips` in order and joins them, with
 * the picture cropped to 9:16 if `vertical`, and `burn` drawing the captions
 * in CAPTIONS onto it. `overlays` lays inputs 1, 2, … (captions drawn as
 * images) over the picture, each for its stretch of the finished video, in
 * seconds. Ends in [v], and [a] if the source has sound.
 */
export function renderGraph(
  clips: Clip[],
  {
    audio,
    vertical,
    burn = false,
    overlays = [],
  }: { audio: boolean; vertical: boolean; burn?: boolean; overlays?: Omit<Cue, "text">[] },
): string {
  const parts = clips.map(({ from, to }, i) => {
    const v = `[0:v]trim=start=${from}:end=${to},setpts=PTS-STARTPTS[v${i}]`;
    return audio ? `${v};[0:a]atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS[a${i}]` : v;
  });
  const inputs = clips.map((_, i) => (audio ? `[v${i}][a${i}]` : `[v${i}]`)).join("");
  const joined = `${inputs}concat=n=${clips.length}:v=1:a=${audio ? 1 : 0}[joined]${audio ? "[a]" : ""}`;
  const look = [
    // The middle of the frame, as wide as 9:16 allows, at the size Shorts and Reels take.
    vertical && "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=1080:1920,setsar=1",
    // ffmpeg runs in the folder that holds it, so no path needs escaping in the graph.
    burn && `subtitles=filename=${CAPTIONS}`,
  ].filter(Boolean);
  const label = (i: number) => (i === overlays.length ? "[v]" : `[c${i}]`);
  const laid = overlays.map(
    ({ start, end }, i) =>
      // Centred, a little below the middle, where Shorts and Reels leave room for text.
      `${label(i)}[${i + 1}:v]overlay=x=(main_w-overlay_w)/2:y=main_h*0.7-overlay_h/2:enable='between(t,${start},${end})'${label(i + 1)}`,
  );
  return [...parts, joined, `[joined]${look.join(",") || "null"}${label(0)}`, ...laid].join(";");
}

/** The streams in a media file, how long it is, and the short side of its picture. */
async function probe(
  path: string,
): Promise<{ video: boolean; audio: boolean; seconds: number; side: number }> {
  const proc = Bun.spawn(
    [
      "ffprobe",
      ...["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration"],
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
  type Stream = { codec_type: string; width?: number; height?: number };
  const has = (type: string) => streams.some((s: Stream) => s.codec_type === type);
  const picture: Stream | undefined = streams.find((s: Stream) => s.codec_type === "video");
  return {
    video: has("video"),
    audio: has("audio"),
    seconds: Number(format?.duration ?? 0),
    side: Math.min(picture?.width ?? 0, picture?.height ?? 0),
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

/**
 * Cuts `clips` out of a video and joins them into one MP4, optionally 9:16
 * with captions. The client chooses the clips and writes the captions; this
 * only runs ffmpeg. Captions are drawn as images with Core Text and laid over
 * the picture; failing that, drawn by ffmpeg if it has libass; failing that,
 * put in a subtitle track and an .srt beside the video.
 */
async function render(
  path: string,
  clips: Clip[],
  { vertical = false, captions, out }: { vertical?: boolean; captions?: string; out?: string },
): Promise<string> {
  requireFile(path, "File");
  if (!clips.length) throw new Error("No clips: give at least one { from, to } in seconds.");
  for (const c of clips) {
    if (!(Number.isFinite(c.from) && Number.isFinite(c.to) && c.from >= 0 && c.to > c.from)) {
      throw new Error(`A clip needs 0 <= from < to, in seconds; got ${JSON.stringify(c)}.`);
    }
  }
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
    const images = cues.length
      ? drawCaptions(
          cues.map((c) => c.text),
          dir,
          vertical ? 1080 : source.side,
        )
      : undefined;
    const burn = !!text && !images && (await canBurn());
    sidecar = !!text && !images && !burn;
    target = outputFor(path, out, sidecar);
    const srt = text && !images ? join(dir, CAPTIONS) : undefined;
    if (srt) writeFileSync(srt, `${text}\n`);
    const graph = renderGraph(clips, {
      audio: source.audio,
      vertical,
      burn,
      overlays: images && cues,
    });
    const proc = Bun.spawn(
      [
        "ffmpeg",
        ...["-nostdin", "-y", "-loglevel", "error", "-i", path],
        ...(images ?? []).flatMap((image) => ["-i", image]),
        ...(sidecar ? ["-i", CAPTIONS] : []),
        ...["-filter_complex", graph, "-map", "[v]"],
        ...(source.audio ? ["-map", "[a]", "-c:a", "aac", "-b:a", "160k"] : []),
        ...(sidecar ? ["-map", "1:s", "-c:s", "mov_text"] : []),
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
    if (!text) return `${target} (${length})`;
    if (!sidecar) return `${target} (${length}), captions drawn on the picture`;
    return `${target} (${length}), captions as a subtitle track and in ${srtFor(target)}. They couldn't be drawn onto the picture here; an editor such as CapCut can burn in the .srt.`;
  } finally {
    // The claimed names stay only if the video and its .srt were both made.
    if (!made && target) {
      rmSync(target, { force: true });
      if (sidecar) rmSync(srtFor(target), { force: true });
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A tool's seconds argument: absent stays absent, anything else must be a number. */
const seconds = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Not a time in seconds: ${value}`);
  return n;
};

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
4. Write captions as SRT: two to four words a cue, following the word times, timed to the finished video. A word at source time t in clip k lands at t - (clip k's from) + (the length of the clips before k). Fix names with \`dictionary_list\` if a word looks misheard.
5. Call \`render\` with the clips, \`vertical: true\` and the captions. One call per short.
6. Tell me where each file is, how long it is, what it covers, and whether the captions are drawn on or in a separate .srt.`,
  },
];

export function mcpTools(status: () => Promise<object>, log: (m: string) => void): Tool[] {
  const path = { type: "string", description: "Absolute path to the file" };
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
              properties: { from: { type: "number" }, to: { type: "number" } },
              required: ["from", "to"],
            },
          },
          vertical: {
            type: "boolean",
            description: "Crop the middle of the frame to 9:16 at 1080x1920",
          },
          captions: {
            type: "string",
            description:
              "SRT text timed to the finished video, not the source: subtract each clip's start, and add the length of the clips before it. Drawn onto the picture, white with a black outline, a little below the middle; if that can't be done here, a subtitle track and an .srt file beside the video.",
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
          (Array.isArray(a.clips) ? a.clips : []).map((c: { from?: unknown; to?: unknown }) => ({
            from: seconds(c?.from) ?? Number.NaN,
            to: seconds(c?.to) ?? Number.NaN,
          })),
          {
            vertical: !!a.vertical,
            captions: a.captions === undefined ? undefined : String(a.captions),
            out: a.out === undefined ? undefined : resolve(String(a.out)),
          },
        ),
    },
    {
      name: "frames",
      description:
        "Save stills from a video file, one every `every` seconds (default 60), and return their paths with [mm:ss] times, to see slides and screen shares next to the transcript.",
      inputSchema: {
        type: "object",
        properties: { path, every: { type: "number", description: "Seconds between stills" } },
        required: ["path"],
      },
      run: (a) => frames(String(a.path), Math.max(1, Number(a.every ?? 60))),
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
