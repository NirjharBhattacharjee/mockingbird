import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AsrWord, stripNonSpeech } from "@mockingbird/asr";
import { loadAudio, type PcmAudio } from "@mockingbird/audio";
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

type Message = {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: { protocolVersion?: string; name?: string; arguments?: Record<string, unknown> };
};

/** The MCP versions this server speaks, newest first. It uses nothing newer than tools. */
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

/** One JSON-RPC message in, its reply out; undefined for a notification. */
export async function handle(message: Message, tools: Tool[]): Promise<object | undefined> {
  const { id, method, params } = message;
  if (id === undefined) return undefined;
  const reply = (result: object) => ({ jsonrpc: "2.0", id, result });
  switch (method) {
    case "initialize":
      return reply({
        // The client's version if it's one this speaks, else the newest; the
        // client then decides whether it can go on (MCP lifecycle).
        protocolVersion: VERSIONS.find((v) => v === params?.protocolVersion) ?? VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "mockingbird", version: "1" },
      });
    case "ping":
      return reply({});
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

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor(s / 60) % 60).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
};

/**
 * An audio or video file as timestamped lines of Whisper's text, names fixed
 * from the dictionary. No cleanup model: the client's model does better with a
 * whole meeting than a 4B one does with each 30 seconds of it.
 */
async function transcribe(path: string, log: (m: string) => void): Promise<string> {
  const audio: PcmAudio = await loadAudio(requireFile(path, "File"));
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
    const rate = audio.sampleRate;
    const lines: string[] = [];
    for (const c of chunks(await detectSpeech(audio), 30 * rate)) {
      const piece = {
        sampleRate: rate,
        samples: audio.samples.subarray(c.startSample, c.endSample),
      };
      const { words } = await asr.transcribe(piece);
      for (const line of timedLines(words, (c.startSample / rate) * 1000)) {
        const text = correctNames(line.text, dictionary);
        if (text) lines.push(`[${clock(line.atMs)}] ${text}`);
      }
    }
    const minutes = Math.round(audio.samples.length / rate / 60);
    return lines.length
      ? `${path} (${minutes} min)\n\n${lines.join("\n")}`
      : `${path}: no speech found.`;
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

export function mcpTools(status: () => Promise<object>, log: (m: string) => void): Tool[] {
  const path = { type: "string", description: "Absolute path to the file" };
  return [
    {
      name: "transcribe",
      description:
        "Transcribe an audio or video file on this Mac (anything ffmpeg reads: m4a, mp3, wav, mp4, mov, mkv) with mockingbird's local Whisper. Returns the text in lines timestamped [mm:ss], with names fixed from the user's dictionary. Takes a few minutes for an hour of audio.",
      inputSchema: { type: "object", properties: { path }, required: ["path"] },
      run: (a) => transcribe(String(a.path), log),
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

/** Serves `tools` on stdin/stdout until stdin closes. Logs go to stderr only. */
export async function serve(tools: Tool[]): Promise<number> {
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
    const reply = await handle(message, tools);
    if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
  };
  // Each request is answered when it's done, so a status call isn't stuck
  // behind a long transcribe. Replies carry their id, so order doesn't matter.
  // ponytail: notifications/cancelled is ignored; a cancelled call still runs and replies.
  const inFlight = new Set<Promise<void>>();
  const start = (line: string) => {
    const p = answer(line).finally(() => inFlight.delete(p));
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
