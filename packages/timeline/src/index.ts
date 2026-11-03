import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

/**
 * An edit kept in a file, `project.json` (#148): the clips that make the cut
 * and everything laid over it. The agent edits it with ops or by hand; the
 * engine compiles it into render's inputs. Nothing derived (transcripts,
 * probes) goes in it, so it stays a self-contained document.
 */

/** A point of a picture, 0–1 of its width and height. */
export type Point = { x: number; y: number };

/** An area of a picture: its left, top, width and height, each 0–1. */
export type Area = { x: number; y: number; w: number; h: number };

/**
 * One stretch of a source on the main track: `from`/`to` are seconds in
 * that source. Clips play in order with no gaps.
 */
export type Clip = {
  id: string;
  path: string;
  from: number;
  to: number;
  focus?: Point;
  zoom?: number;
};

/**
 * Laid over the cut. With `clip`, its times are seconds from that clip's
 * start in the finished video, so it moves with the clip; without, from the
 * start of the video.
 */
export type Text = {
  id: string;
  text: string;
  clip?: string;
  from: number;
  to: number;
  y?: number;
};
export type Insert = { id: string; path: string; clip?: string; from: number; to: number };
export type Sound = {
  id: string;
  path: string;
  clip?: string;
  at: number;
  volume?: number;
  loop?: boolean;
  duck?: boolean;
};

/** Word-by-word captions, made for the cut as it is when it's rendered. */
export type Captions = { perCue?: number; lit?: boolean; upper?: boolean; y?: number };

export type Project = {
  version: 1;
  /** The finished picture, `WxH`; default the first clip's source. */
  size?: string;
  fps?: number;
  split?: { top: Area; bottom: Area };
  captions?: Captions | null;
  clips: Clip[];
  texts: Text[];
  inserts: Insert[];
  audio: Sound[];
};

type Obj = Record<string, unknown>;

const fail = (message: string): never => {
  throw new Error(message);
};

/** `v` as an object with only `keys`, so a misspelt field is an error, not ignored. */
function obj(v: unknown, what: string, keys: string[]): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(`${what} must be an object`);
  const extra = Object.keys(v as Obj).filter((k) => !keys.includes(k));
  if (extra.length) fail(`${what} has no ${extra.join(", ")}; it takes ${keys.join(", ")}`);
  return v as Obj;
}

function num(v: unknown, what: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
    fail(`${what} must be a number from ${min} to ${max}; got ${JSON.stringify(v)}`);
  }
  return v as number;
}

const maybe = <T>(v: unknown, read: (v: unknown) => T): T | undefined =>
  v === undefined ? undefined : read(v);

function str(v: unknown, what: string): string {
  if (typeof v !== "string" || !v) fail(`${what} must be a string`);
  return v as string;
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== "boolean") fail(`${what} must be true or false`);
  return v as boolean;
}

/** Drops absent fields, so a file keeps only what was set. */
const clean = <T extends Obj>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

function stretch(o: Obj, what: string) {
  const from = num(o.from, `${what}.from`, 0, Number.MAX_VALUE);
  const to = num(o.to, `${what}.to`, 0, Number.MAX_VALUE);
  if (!(from < to)) fail(`${what} needs from < to; got ${from} and ${to}`);
  return { from, to };
}

function area(v: unknown, what: string): Area {
  const o = obj(v, what, ["x", "y", "w", "h"]);
  const a = {
    x: num(o.x, `${what}.x`, 0, 1),
    y: num(o.y, `${what}.y`, 0, 1),
    w: num(o.w, `${what}.w`, 0.01, 1),
    h: num(o.h, `${what}.h`, 0.01, 1),
  };
  if (a.x + a.w > 1.001 || a.y + a.h > 1.001) fail(`${what} goes past the picture`);
  return a;
}

const CLIP = ["id", "path", "from", "to", "focus", "zoom"];
const TEXT = ["id", "text", "clip", "from", "to", "y"];
const INSERT = ["id", "path", "clip", "from", "to"];
const SOUND = ["id", "path", "clip", "at", "volume", "loop", "duck"];
const CAPTIONS = ["perCue", "lit", "upper", "y"];

function clip(v: unknown, what: string): Clip {
  const o = obj(v, what, CLIP);
  return clean({
    id: str(o.id, `${what}.id`),
    path: str(o.path, `${what}.path`),
    ...stretch(o, what),
    focus: maybe(o.focus, (f) => {
      const p = obj(f, `${what}.focus`, ["x", "y"]);
      return { x: num(p.x, `${what}.focus.x`, 0, 1), y: num(p.y, `${what}.focus.y`, 0, 1) };
    }),
    zoom: maybe(o.zoom, (z) => num(z, `${what}.zoom`, 1, 4)),
  });
}

function text(v: unknown, what: string): Text {
  const o = obj(v, what, TEXT);
  return clean({
    id: str(o.id, `${what}.id`),
    text: str(o.text, `${what}.text`),
    clip: maybe(o.clip, (c) => str(c, `${what}.clip`)),
    ...stretch(o, what),
    y: maybe(o.y, (y) => num(y, `${what}.y`, 0, 1)),
  });
}

function insert(v: unknown, what: string): Insert {
  const o = obj(v, what, INSERT);
  return clean({
    id: str(o.id, `${what}.id`),
    path: str(o.path, `${what}.path`),
    clip: maybe(o.clip, (c) => str(c, `${what}.clip`)),
    ...stretch(o, what),
  });
}

function sound(v: unknown, what: string): Sound {
  const o = obj(v, what, SOUND);
  return clean({
    id: str(o.id, `${what}.id`),
    path: str(o.path, `${what}.path`),
    clip: maybe(o.clip, (c) => str(c, `${what}.clip`)),
    at: num(o.at ?? 0, `${what}.at`, 0, Number.MAX_VALUE),
    volume: maybe(o.volume, (n) => num(n, `${what}.volume`, 0, 4)),
    loop: maybe(o.loop, (b) => bool(b, `${what}.loop`)),
    duck: maybe(o.duck, (b) => bool(b, `${what}.duck`)),
  });
}

function captions(v: unknown, what: string): Captions | null {
  if (v === null) return null;
  const o = obj(v, what, CAPTIONS);
  return clean({
    perCue: maybe(o.perCue, (n) => Math.round(num(n, `${what}.perCue`, 1, 8))),
    lit: maybe(o.lit, (b) => bool(b, `${what}.lit`)),
    upper: maybe(o.upper, (b) => bool(b, `${what}.upper`)),
    y: maybe(o.y, (n) => num(n, `${what}.y`, 0, 1)),
  });
}

function size(v: unknown): string {
  const m = /^(\d+)x(\d+)$/.exec(String(v));
  const [w, h] = [Number(m?.[1]), Number(m?.[2])];
  // Even, which yuv420p needs.
  if (!m || w % 2 || h % 2 || w < 16 || h < 16 || w > 8192 || h > 8192) {
    fail(
      `size must be WIDTHxHEIGHT, even, from 16 to 8192, like "1080x1920"; got ${JSON.stringify(v)}`,
    );
  }
  return String(v);
}

const KINDS = [
  ["clips", clip],
  ["texts", text],
  ["inserts", insert],
  ["audio", sound],
] as const;

/** `v` as a project, or an error naming what's wrong in it. */
export function check(v: unknown): Project {
  const o = obj(v, "the project", [
    "version",
    "size",
    "fps",
    "split",
    "captions",
    "clips",
    "texts",
    "inserts",
    "audio",
  ]);
  if (o.version !== 1) fail(`version must be 1; got ${JSON.stringify(o.version)}`);
  const list = (key: string) => {
    const l = o[key] ?? [];
    if (!Array.isArray(l)) fail(`${key} must be a list`);
    return l as unknown[];
  };
  const p: Project = clean({
    version: 1 as const,
    size: maybe(o.size, size),
    fps: maybe(o.fps, (n) => num(n, "fps", 1, 120)),
    split: maybe(o.split, (s) => {
      const t = obj(s, "split", ["top", "bottom"]);
      return { top: area(t.top, "split.top"), bottom: area(t.bottom, "split.bottom") };
    }),
    captions: maybe(o.captions, (c) => captions(c, "captions")),
    clips: list("clips").map((c, i) => clip(c, `clips[${i}]`)),
    texts: list("texts").map((t, i) => text(t, `texts[${i}]`)),
    inserts: list("inserts").map((t, i) => insert(t, `inserts[${i}]`)),
    audio: list("audio").map((t, i) => sound(t, `audio[${i}]`)),
  });
  const seen = new Set<string>();
  for (const [key] of KINDS) {
    for (const item of p[key]) {
      if (seen.has(item.id)) fail(`Two items have the id ${item.id}`);
      seen.add(item.id);
    }
  }
  const clips = new Set(p.clips.map((c) => c.id));
  for (const item of attached(p)) {
    if (item.clip !== undefined && !clips.has(item.clip)) {
      fail(`${item.id} is on clip ${item.clip}, which isn't in clips`);
    }
  }
  return p;
}

/** Everything laid over the cut. */
const attached = (p: Project): (Text | Insert | Sound)[] => [...p.texts, ...p.inserts, ...p.audio];

const empty = (): Project => ({ version: 1, clips: [], texts: [], inserts: [], audio: [] });

/** The project in `file`, or a new empty one if there's no file. */
export function load(file: string): { project: Project; created: boolean } {
  if (!existsSync(file)) return { project: empty(), created: true };
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${file} isn't JSON: ${(error as Error).message}`);
  }
  try {
    return { project: check(json), created: false };
  } catch (error) {
    throw new Error(`${file}: ${(error as Error).message}`);
  }
}

/** Writes `p` to `file` whole or not at all: a crash halfway leaves the old file. */
export function save(file: string, p: Project): void {
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(p, null, 2)}\n`);
  renameSync(temp, file);
}

const PREFIX = { clips: "c", texts: "t", inserts: "b", audio: "a" } as const;

/** The first `<prefix>N` no item has. */
function freeId(p: Project, prefix: string): string {
  const ids = new Set(KINDS.flatMap(([key]) => p[key].map((i) => i.id)));
  for (let n = 1; ; n++) if (!ids.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

/** The list `id` is in, and where. */
function find(p: Project, id: unknown) {
  for (const [key] of KINDS) {
    const index = (p[key] as { id: string }[]).findIndex((i) => i.id === id);
    if (index >= 0) return { key, index };
  }
  return fail(`No item has the id ${JSON.stringify(id)}`);
}

function findClip(p: Project, id: unknown): Clip {
  const { key, index } = find(p, id);
  if (key !== "clips") fail(`${id} isn't a clip`);
  return p.clips[index] as Clip;
}

/**
 * Moves what's on `clip` by `by` seconds (a trim off its start moves it
 * earlier), so it stays on the same picture. Anything that then starts
 * before the clip is pulled to its start, and anything that ends before
 * it is removed, since what it was on is gone.
 */
function shift(p: Project, clip: string, by: number, notes: string[]) {
  const gone = new Set<string>();
  for (const t of [...p.texts, ...p.inserts]) {
    if (t.clip !== clip) continue;
    t.from += by;
    t.to += by;
    if (t.to <= 0) gone.add(t.id);
    t.from = Math.max(0, t.from);
  }
  for (const s of p.audio) {
    if (s.clip !== clip) continue;
    s.at += by;
    if (s.at < 0) gone.add(s.id);
  }
  if (!gone.size) return;
  p.texts = p.texts.filter((t) => !gone.has(t.id));
  p.inserts = p.inserts.filter((t) => !gone.has(t.id));
  p.audio = p.audio.filter((t) => !gone.has(t.id));
  notes.push(`removed ${[...gone].join(", ")}: what they were on was cut`);
}

const OPS = ["add", "remove", "split", "trim", "move", "set"];
const READ = { clip, text, insert, audio: sound } as const;
const LIST = { clip: "clips", text: "texts", insert: "inserts", audio: "audio" } as const;

/** One op applied to `p` in place. */
function step(p: Project, raw: unknown, what: string, notes: string[]) {
  if (typeof raw !== "object" || raw === null) fail(`${what} must be an object`);
  const { op, ...a } = raw as Obj;
  switch (op) {
    case "add": {
      const { type, index, ...fields } = a;
      if (!(typeof type === "string" && type in READ)) {
        fail(`${what}: add needs type: clip, text, insert or audio`);
      }
      const kind = type as keyof typeof READ;
      const key = LIST[kind];
      const item = READ[kind]({ id: freeId(p, PREFIX[key]), ...fields }, what);
      const list = p[key] as unknown[];
      const at = index === undefined ? list.length : num(index, `${what}.index`, 0, list.length);
      list.splice(Math.round(at), 0, item);
      return;
    }
    case "remove": {
      const { key, index } = find(p, a.id);
      (p[key] as unknown[]).splice(index, 1);
      if (key !== "clips") return;
      // What was on the clip goes with it; the cut closes up behind it.
      const on = attached(p).filter((t) => t.clip === a.id);
      if (!on.length) return;
      const ids = new Set(on.map((t) => t.id));
      p.texts = p.texts.filter((t) => !ids.has(t.id));
      p.inserts = p.inserts.filter((t) => !ids.has(t.id));
      p.audio = p.audio.filter((t) => !ids.has(t.id));
      notes.push(`removed ${[...ids].join(", ")} with ${a.id}`);
      return;
    }
    case "split": {
      obj(a, what, ["id", "at", "newId"]);
      const c = findClip(p, a.id);
      const at = num(a.at, `${what}.at`, 0, Number.MAX_VALUE);
      if (!(c.from < at && at < c.to)) {
        fail(`${what}: split ${c.id} at a source time inside it, from ${c.from} to ${c.to}`);
      }
      const id = a.newId === undefined ? freeId(p, "c") : str(a.newId, `${what}.newId`);
      p.clips.splice(p.clips.indexOf(c) + 1, 0, { ...c, id, from: at });
      // What starts in the second half goes with it.
      const offset = at - c.from;
      c.to = at;
      for (const t of [...p.texts, ...p.inserts]) {
        if (t.clip === c.id && t.from >= offset) {
          Object.assign(t, { clip: id, from: t.from - offset, to: t.to - offset });
        }
      }
      for (const s of p.audio) {
        if (s.clip === c.id && s.at >= offset) Object.assign(s, { clip: id, at: s.at - offset });
      }
      return;
    }
    case "trim": {
      obj(a, what, ["id", "from", "to"]);
      const c = findClip(p, a.id);
      const from = a.from === undefined ? c.from : num(a.from, `${what}.from`, 0, Number.MAX_VALUE);
      const to = a.to === undefined ? c.to : num(a.to, `${what}.to`, 0, Number.MAX_VALUE);
      if (!(from < to)) fail(`${what}: ${c.id} needs from < to; got ${from} and ${to}`);
      const by = c.from - from;
      Object.assign(c, { from, to });
      if (by) shift(p, c.id, by, notes);
      return;
    }
    case "move": {
      obj(a, what, ["id", "index"]);
      const c = findClip(p, a.id);
      const index = Math.round(num(a.index, `${what}.index`, 0, p.clips.length - 1));
      p.clips.splice(p.clips.indexOf(c), 1);
      p.clips.splice(index, 0, c);
      return;
    }
    case "set": {
      const { id, ...fields } = a;
      // null clears a field: focus, a text's clip, the captions.
      const merge = (target: Obj) => {
        for (const [k, v] of Object.entries(fields)) {
          if (v === null && k !== "captions") delete target[k];
          else target[k] = v;
        }
      };
      if (id === undefined) {
        obj(fields, what, ["size", "fps", "split", "captions"]);
        merge(p as unknown as Obj);
        return;
      }
      if ("id" in fields) fail(`${what}: an id can't be changed`);
      const { key, index } = find(p, id);
      merge((p[key] as unknown as Obj[])[index] as Obj);
      return;
    }
    default:
      fail(`${what}: op must be one of ${OPS.join(", ")}; got ${JSON.stringify(op)}`);
  }
}

/**
 * `ops` applied to a copy of `p`, all of them or none: the first that fails
 * throws, naming it, and `p` is left as it was. `notes` says what an op did
 * besides what was asked, like removing a text whose words were cut.
 */
export function apply(p: Project, ops: unknown[]): { project: Project; notes: string[] } {
  const next = structuredClone(p);
  const notes: string[] = [];
  ops.forEach((op, i) => {
    const what = `ops[${i}]${typeof (op as Obj)?.op === "string" ? ` (${(op as Obj).op})` : ""}`;
    step(next, op, what, notes);
  });
  return { project: check(next), notes };
}

/** Each clip's start in the finished video, by id, and the video's length. */
export function starts(p: Project): { at: Map<string, number>; length: number } {
  const at = new Map<string, number>();
  let length = 0;
  for (const c of p.clips) {
    at.set(c.id, length);
    length += c.to - c.from;
  }
  return { at, length };
}

/** `m:ss.cc`, to the hundredth of a second. */
export const stamp = (seconds: number) => {
  const cs = Math.round(seconds * 100);
  const m = Math.floor(cs / 6000);
  const s = String(Math.floor(cs / 100) % 60).padStart(2, "0");
  return `${m}:${s}.${String(cs % 100).padStart(2, "0")}`;
};

/** `n` without trailing zeros, for the outline. */
const short = (n: number) => String(Number(n.toFixed(2)));

/**
 * The project as a few lines for the agent: each clip at its place in the
 * finished video with its source stretch, what's on it under it, then what's
 * timed from the start of the video.
 */
export function outline(p: Project, file: string): string {
  const { at, length } = starts(p);
  const head = [
    p.size ?? "size of the first clip's source",
    p.fps ? `${p.fps} fps` : undefined,
    p.split ? "split" : undefined,
    stamp(length),
    p.captions
      ? `captions on${p.captions.perCue ? ` (${p.captions.perCue} a cue)` : ""}`
      : undefined,
  ].filter(Boolean);
  const line = (t: Text | Insert | Sound, base: number) => {
    if ("at" in t) {
      const how = [
        t.volume === undefined ? "" : ` volume ${short(t.volume)}`,
        t.loop ? " loop" : "",
        t.duck ? " duck" : "",
      ].join("");
      return `${t.id}  ${stamp(base + t.at)}  audio ${basename(t.path)}${how}`;
    }
    const when = `${stamp(base + t.from)}-${stamp(base + t.to)}`;
    if ("text" in t) {
      const y = t.y === undefined ? "" : ` y ${short(t.y)}`;
      return `${t.id}  ${when}  text ${JSON.stringify(t.text)}${y}`;
    }
    return `${t.id}  ${when}  insert ${basename(t.path)}`;
  };
  const lines = [`${file}: ${head.join(", ")}`];
  for (const c of p.clips) {
    const start = at.get(c.id) ?? 0;
    const look = [
      c.focus ? `  focus ${short(c.focus.x)},${short(c.focus.y)}` : "",
      c.zoom && c.zoom !== 1 ? `  zoom ${short(c.zoom)}` : "",
    ].join("");
    lines.push(
      `${c.id}  ${stamp(start)}-${stamp(start + c.to - c.from)}  ${basename(c.path)} ${short(c.from)}-${short(c.to)}${look}`,
    );
    for (const t of attached(p)) if (t.clip === c.id) lines.push(`    ${line(t, start)}`);
  }
  for (const t of attached(p)) if (t.clip === undefined) lines.push(line(t, 0));
  if (!p.clips.length)
    lines.push('No clips yet: add one with { op: "add", type: "clip", path, from, to }.');
  return lines.join("\n");
}

/** What render takes: everything timed in the finished video, every path absolute. */
export type Compiled = {
  clips: { path: string; from: number; to: number; focus?: Point; zoom?: number }[];
  texts: { text: string; from: number; to: number; y?: number }[];
  inserts: { path: string; from: number; to: number }[];
  sounds: { path: string; at: number; volume: number; loop: boolean; duck: boolean }[];
  size?: string;
  fps?: number;
  split?: { top: Area; bottom: Area };
  captions?: Captions;
};

/** `p` as render's inputs, its relative paths taken from `dir`, the project file's folder. */
export function compile(p: Project, dir: string): Compiled {
  const { at } = starts(p);
  const base = (clip?: string) => (clip === undefined ? 0 : (at.get(clip) ?? 0));
  const path = (f: string) => resolve(dir, f);
  return clean({
    clips: p.clips.map(({ path: f, from, to, focus, zoom }) =>
      clean({ path: path(f), from, to, focus, zoom }),
    ),
    texts: p.texts.map(({ text, clip, from, to, y }) =>
      clean({ text, from: base(clip) + from, to: base(clip) + to, y }),
    ),
    inserts: p.inserts.map(({ path: f, clip, from, to }) => ({
      path: path(f),
      from: base(clip) + from,
      to: base(clip) + to,
    })),
    sounds: p.audio.map(({ path: f, clip, at: when, volume = 1, loop = false, duck = false }) => ({
      path: path(f),
      at: base(clip) + when,
      volume,
      loop,
      duck,
    })),
    size: p.size,
    fps: p.fps,
    split: p.split,
    captions: p.captions ?? undefined,
  });
}

/**
 * `ops` applied to the project in `file` (made if it isn't there) and saved,
 * then its outline. No ops only reads it.
 */
export function edit(file: string, ops: unknown[]): string {
  const { project, created } = load(file);
  // ponytail: no lock, so two edits of one file at once keep the last one's; a lock file if agents start doing that.
  const { project: next, notes } = apply(project, ops);
  if (ops.length || created) save(file, next);
  return [...(created ? [`Made ${file}.`] : []), ...notes, outline(next, file)].join("\n");
}
