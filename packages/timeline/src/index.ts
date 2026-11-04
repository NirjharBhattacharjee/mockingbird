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
 * A change of framing during a clip: by `at` seconds into the clip in the
 * finished video, the focus and zoom have moved to these, from where the
 * move before left them. `smooth` (the default) eases in and out.
 */
export type Move = { at: number; focus?: Point; zoom?: number; ease?: "linear" | "smooth" };

/** How a clip comes in over the end of the one before it: one of TRANSITIONS, for `duration` seconds. */
export type Transition = { type: string; duration: number };

/** ffmpeg's xfade transitions: the ones a clip can come in with. */
export const TRANSITIONS = [
  "fade",
  "fadeblack",
  "fadewhite",
  "fadegrays",
  "dissolve",
  "wipeleft",
  "wiperight",
  "wipeup",
  "wipedown",
  "slideleft",
  "slideright",
  "slideup",
  "slidedown",
  "smoothleft",
  "smoothright",
  "smoothup",
  "smoothdown",
  "coverleft",
  "coverright",
  "revealleft",
  "revealright",
  "circleopen",
  "circleclose",
  "radial",
  "zoomin",
  "hblur",
  "pixelize",
];

/**
 * One stretch of a source on the main track: `from`/`to` are seconds in
 * that source. Clips play in order with no gaps, unless one comes in with a
 * `transition` over the end of the one before. `speed` plays it faster or
 * slower (0.25 to 4), and `moves` change its framing as it plays. `lead`
 * moves the sound's cut away from the picture's: positive, its sound starts
 * that many seconds before its picture (a J cut); negative, the clip
 * before's sound carries on that long over its picture (an L cut).
 */
export type Clip = {
  id: string;
  path: string;
  from: number;
  to: number;
  focus?: Point;
  zoom?: number;
  speed?: number;
  moves?: Move[];
  transition?: Transition;
  lead?: number;
};

/** How long a clip lasts in the finished video. */
export const lengthOf = (c: { from: number; to: number; speed?: number }) =>
  (c.to - c.from) / (c.speed ?? 1);

/** Smoothstep: eases in and out. */
const smooth = (u: number) => u * u * (3 - 2 * u);

/** Clip `c`'s focus and zoom `t` seconds into it in the finished video. */
export function framing(c: Clip, t: number): { focus: Point; zoom: number } {
  let at = 0;
  let now = { focus: c.focus ?? { x: 0.5, y: 0.5 }, zoom: c.zoom ?? 1 };
  for (const m of c.moves ?? []) {
    const next = { focus: m.focus ?? now.focus, zoom: m.zoom ?? now.zoom };
    if (t < m.at) {
      const raw = Math.min(1, Math.max(0, (t - at) / (m.at - at)));
      const u = m.ease === "linear" ? raw : smooth(raw);
      const mix = (a: number, b: number) => a + (b - a) * u;
      return {
        focus: { x: mix(now.focus.x, next.focus.x), y: mix(now.focus.y, next.focus.y) },
        zoom: mix(now.zoom, next.zoom),
      };
    }
    at = m.at;
    now = next;
  }
  return now;
}

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

const CLIP = ["id", "path", "from", "to", "focus", "zoom", "speed", "moves", "transition", "lead"];
const TEXT = ["id", "text", "clip", "from", "to", "y"];
const INSERT = ["id", "path", "clip", "from", "to"];
const SOUND = ["id", "path", "clip", "at", "volume", "loop", "duck"];
const CAPTIONS = ["perCue", "lit", "upper", "y"];

function point(v: unknown, what: string): Point {
  const p = obj(v, what, ["x", "y"]);
  return { x: num(p.x, `${what}.x`, 0, 1), y: num(p.y, `${what}.y`, 0, 1) };
}

function clip(v: unknown, what: string): Clip {
  const o = obj(v, what, CLIP);
  const c: Clip = clean({
    id: str(o.id, `${what}.id`),
    path: str(o.path, `${what}.path`),
    ...stretch(o, what),
    focus: maybe(o.focus, (f) => point(f, `${what}.focus`)),
    zoom: maybe(o.zoom, (z) => num(z, `${what}.zoom`, 1, 4)),
    speed: maybe(o.speed, (n) => num(n, `${what}.speed`, 0.25, 4)),
    moves: maybe(o.moves, (l) => {
      if (!Array.isArray(l)) fail(`${what}.moves must be a list`);
      return (l as unknown[]).map((m, i) => {
        const at = `${what}.moves[${i}]`;
        const r = obj(m, at, ["at", "focus", "zoom", "ease"]);
        if (r.focus === undefined && r.zoom === undefined) fail(`${at} needs a focus or a zoom`);
        if (r.ease !== undefined && r.ease !== "linear" && r.ease !== "smooth") {
          fail(`${at}.ease must be "linear" or "smooth"`);
        }
        return clean({
          at: num(r.at, `${at}.at`, 0, Number.MAX_VALUE),
          focus: maybe(r.focus, (f) => point(f, `${at}.focus`)),
          zoom: maybe(r.zoom, (z) => num(z, `${at}.zoom`, 1, 4)),
          ease: r.ease as Move["ease"],
        });
      });
    }),
    lead: maybe(o.lead, (n) => num(n, `${what}.lead`, -5, 5)),
    transition: maybe(o.transition, (t) => {
      const r = obj(t, `${what}.transition`, ["type", "duration"]);
      if (!TRANSITIONS.includes(String(r.type))) {
        fail(`${what}.transition.type must be one of ${TRANSITIONS.join(", ")}`);
      }
      return {
        type: String(r.type),
        duration: num(r.duration, `${what}.transition.duration`, 0.04, 5),
      };
    }),
  });
  const length = lengthOf(c);
  let last = 0;
  for (const [i, m] of (c.moves ?? []).entries()) {
    if (!(m.at > last || (i === 0 && m.at >= 0)) || m.at > length + 1e-6) {
      fail(
        `${what}.moves need rising times within the clip's ${length.toFixed(2)} s; moves[${i}] is at ${m.at}`,
      );
    }
    last = m.at;
  }
  return c;
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
  for (const [i, c] of p.clips.entries()) {
    if (!c.lead) continue;
    const before = p.clips[i - 1];
    if (!before) fail(`clips[0] can't have a lead: no cut comes before it`);
    if (c.transition)
      fail(`clips[${i}] has a transition and a lead; a transition already blends the sound`);
    // Each clip's sound runs from its own lead to the next clip's; it can't run out.
    const after = p.clips[i + 1]?.lead ?? 0;
    if (
      lengthOf(c) + c.lead - after <= 0 ||
      lengthOf(before as Clip) - c.lead + (before?.lead ?? 0) <= 0
    ) {
      fail(`clips[${i}].lead is ${c.lead} s, more than ${c.id} or the clip before it lasts`);
    }
  }
  for (const [i, c] of p.clips.entries()) {
    if (!c.transition) continue;
    const before = p.clips[i - 1];
    if (!before) fail(`clips[0] can't have a transition: nothing comes before it`);
    const d = c.transition.duration;
    if (d >= lengthOf(c) || d >= lengthOf(before as Clip)) {
      fail(`clips[${i}].transition is ${d} s, longer than ${c.id} or the clip before it`);
    }
  }
  // A split is stacked into 1080x1920; a size it can't have would only mislead.
  if (p.split && p.size && p.size !== "1080x1920") {
    fail(`a split always comes out 1080x1920, so size must be that or left out; got ${p.size}`);
  }
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

/** To the millisecond, so a file the agent reads says 2.7 and not 2.6999999999999997. */
const ms = (t: number) => Math.round(t * 1000) / 1000;

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
    t.from = ms(t.from + by);
    t.to = ms(t.to + by);
    if (t.to <= 0) gone.add(t.id);
    t.from = Math.max(0, t.from);
  }
  for (const s of p.audio) {
    if (s.clip !== clip) continue;
    s.at = ms(s.at + by);
    if (s.at < 0) gone.add(s.id);
  }
  if (!gone.size) return;
  p.texts = p.texts.filter((t) => !gone.has(t.id));
  p.inserts = p.inserts.filter((t) => !gone.has(t.id));
  p.audio = p.audio.filter((t) => !gone.has(t.id));
  notes.push(`removed ${[...gone].join(", ")}: what they were on was cut`);
}

/**
 * Takes away what's on `clip` that starts at or after `length` seconds into
 * it: a trim off its end cut away the picture it was on.
 */
function dropPast(p: Project, clip: string, length: number, notes: string[]) {
  const gone = new Set(
    attached(p)
      .filter((t) => t.clip === clip && ("at" in t ? t.at : t.from) >= length)
      .map((t) => t.id),
  );
  if (!gone.size) return;
  p.texts = p.texts.filter((t) => !gone.has(t.id));
  p.inserts = p.inserts.filter((t) => !gone.has(t.id));
  p.audio = p.audio.filter((t) => !gone.has(t.id));
  notes.push(`removed ${[...gone].join(", ")}: what they were on was cut`);
}

/** A word heard in a source: its start and end, in seconds in that source. */
export type Word = { word: string; start: number; end: number };

/** A source's words, in order, by the path the project gives it. */
export type Words = (path: string) => Word[];

/** A source's silences, in seconds, by the path the project gives it: where a cut can land unheard. */
export type Gaps = (path: string) => { from: number; to: number }[];

/**
 * How far from Whisper's guess a cut looks for a silence. Whisper's word
 * times run up to about half a second off (0.45 s late on a recorded talk),
 * so a cut placed by them alone can clip a word kept or leave half of one cut.
 */
const SNAP = 0.6;

/** The silence in clip `c` nearest `at`, within SNAP of it. */
function silenceNear(gaps: { from: number; to: number }[], at: number, c: Clip) {
  const off = (g: { from: number; to: number }) => Math.abs((g.from + g.to) / 2 - at);
  return gaps
    .filter((g) => g.from >= c.from && g.to <= c.to && off(g) <= SNAP)
    .sort((a, b) => off(a) - off(b))[0];
}

/** The words said in clip `c`: those whose middle is inside it, as captions count them. */
export const wordsIn = (c: { from: number; to: number }, words: Word[]) =>
  words.filter((w) => {
    const middle = (w.start + w.end) / 2;
    return middle >= c.from && middle < c.to;
  });

/**
 * How far past the last word kept a cut lands, and how far before the next:
 * auto-editor's margin. Less where the words are closer than that.
 */
const MARGIN = 0.2;

/** A word for matching: no case, no punctuation, and ’ the same as ' ("I’m" is "i'm"). */
const plain = (w: string) =>
  w
    .toLocaleLowerCase()
    .replace(/’/g, "'")
    .replace(/[^\p{L}\p{N}']/gu, "");
const plainWords = (text: string) => text.split(/\s+/).map(plain).filter(Boolean);

/** Every word said in the cut, in order, with its clip. */
function spoken(p: Project, words: Words) {
  return p.clips.flatMap((clip) =>
    wordsIn(clip, words(clip.path)).map((word, i, all) => ({ clip, word, i, all })),
  );
}

type Spoken = ReturnType<typeof spoken>;

/** Where `query` is said in `said`, as the first word's position, in clip `scope` if given. */
function places(said: Spoken, query: string[], scope?: string): number[] {
  const found: number[] = [];
  for (let at = 0; at + query.length <= said.length; at++) {
    const run = said.slice(at, at + query.length);
    if (scope && run.some((s) => s.clip.id !== scope)) continue;
    if (run.every((s, k) => plain(s.word.word) === query[k])) found.push(at);
  }
  return found;
}

/**
 * Cuts the words `said[first..last]` out of their clips, a clip at a time:
 * from just after the word before them to just before the word after,
 * MARGIN either side where the pause allows. Each edge moves into the
 * silence nearest it if `gaps` has one, since silence is measured to the
 * millisecond and Whisper's word times aren't. A clip left with nothing goes.
 */
function cutSaid(
  p: Project,
  said: Spoken,
  first: number,
  last: number,
  notes: string[],
  gaps?: Gaps,
) {
  const cuts: { id: string; from: number; to: number }[] = [];
  for (let k = first; k <= last; k++) {
    const s = said[k] as Spoken[number];
    const cut = cuts.at(-1);
    if (cut && cut.id === s.clip.id) continue;
    // The last of this clip's words in the run.
    let end = k;
    while (end < last && (said[end + 1] as Spoken[number]).clip.id === s.clip.id) end++;
    const { clip, all } = s;
    const before = all[s.i - 1];
    const after = all[(said[end] as Spoken[number]).i + 1];
    const lastWord = (said[end] as Spoken[number]).word;
    let from = before
      ? Math.max(before.end, Math.min(before.end + MARGIN, s.word.start))
      : clip.from;
    let to = after ? Math.min(after.start, Math.max(after.start - MARGIN, lastWord.end)) : clip.to;
    const silences = gaps?.(clip.path) ?? [];
    const a = before && silenceNear(silences, (before.end + s.word.start) / 2, clip);
    const b = after && silenceNear(silences, (lastWord.end + after.start) / 2, clip);
    const snapped = [
      a ? Math.min(a.from + MARGIN, (a.from + a.to) / 2) : from,
      b ? Math.max(b.to - MARGIN, (b.from + b.to) / 2) : to,
    ] as const;
    // Both edges in one silence would cut nothing: keep Whisper's then.
    if (snapped[1] - snapped[0] >= 0.05) [from, to] = snapped;
    const span = {
      id: clip.id,
      from: ms(Math.max(clip.from, from)),
      to: ms(Math.min(clip.to, to)),
    };
    // Overlapping word times can leave nothing to remove: say so rather than keep it.
    if (!(span.to > span.from)) {
      throw new Error(`cut_words: couldn't place a cut around "${s.word.word}" in ${clip.id}`);
    }
    cuts.push(span);
  }
  for (const { id, from, to } of cuts) {
    const c = findClip(p, id);
    const whole = from <= c.from + 1e-6;
    const end = to >= c.to - 1e-6;
    if (whole && end) step(p, { op: "remove", id }, `cut_words`, notes);
    else if (whole) step(p, { op: "trim", id, from: to }, `cut_words`, notes);
    else if (end) step(p, { op: "trim", id, to: from }, `cut_words`, notes);
    else {
      const second = freeId(p, "c");
      step(p, { op: "split", id, at: from, newId: second }, `cut_words`, notes);
      step(p, { op: "trim", id: second, from: to }, `cut_words`, notes);
    }
  }
  const length = cuts.reduce((sum, c) => sum + c.to - c.from, 0);
  const words = said.slice(first, last + 1).map((s) => s.word.word.trim());
  const shown =
    words.length > 8
      ? `${words.slice(0, 4).join(" ")} … ${words.slice(-3).join(" ")}`
      : words.join(" ");
  notes.push(
    `cut "${shown}" (${words.length} word${words.length === 1 ? "" : "s"}, ${length.toFixed(2)} s)`,
  );
}

/** cut_words: the words given as `text`, or from `from` to `to`, cut out of the cut. */
function cutWords(p: Project, a: Obj, what: string, notes: string[], words?: Words, gaps?: Gaps) {
  obj(a, what, ["text", "from", "to", "clip", "all"]);
  if (!words) return fail(`${what}: cut_words needs the transcript, which only the engine has`);
  const scope = maybe(a.clip, (c) => findClip(p, c).id);
  const all = maybe(a.all, (b) => bool(b, `${what}.all`)) ?? false;
  const where = scope ?? "the cut";
  const query = (v: unknown, key: string) => {
    const q = plainWords(str(v, `${what}.${key}`));
    if (!q.length) fail(`${what}.${key} has no words`);
    return q;
  };
  const listed = (said: Spoken, found: number[]) =>
    found
      .slice(0, 5)
      .map((at) => (said[at] as Spoken[number]).clip.id)
      .join(", ");
  const missing = (text: unknown) =>
    `${what}: "${text}" isn't said in ${where}. Words match without case or punctuation; \`transcribe\` with the project shows the cut's words.`;
  if (a.text !== undefined) {
    if (a.from !== undefined || a.to !== undefined)
      fail(`${what}: give text, or from and to, not both`);
    const q = query(a.text, "text");
    const said = spoken(p, words);
    const found = places(said, q, scope);
    if (!found.length) fail(missing(a.text));
    if (found.length > 1 && !all) {
      fail(
        `${what}: "${a.text}" is said ${found.length} times (in ${listed(said, found)}); add words around it, give its clip, or all: true`,
      );
    }
    // One at a time, since each cut changes the clips the next is found in.
    for (let n = 0; n < found.length; n++) {
      const now = spoken(p, words);
      const at = places(now, q, scope)[0];
      if (at === undefined) break;
      cutSaid(p, now, at, at + q.length - 1, notes, gaps);
    }
    return;
  }
  if (all) fail(`${what}: all works with text, not from and to`);
  const [start, end] = [query(a.from, "from"), query(a.to, "to")];
  const said = spoken(p, words);
  const begins = places(said, start, scope);
  if (!begins.length) fail(missing(a.from));
  if (begins.length > 1) {
    fail(
      `${what}: "${a.from}" is said ${begins.length} times (in ${listed(said, begins)}); add words to it or give its clip`,
    );
  }
  const first = begins[0] as number;
  // The first place `to` is said from there on, so a range can run across clips.
  const stop = places(said, end).find((at) => at >= first);
  if (stop === undefined) fail(`${what}: "${a.to}" isn't said after "${a.from}"`);
  cutSaid(p, said, first, (stop as number) + end.length - 1, notes, gaps);
}

const OPS = ["add", "remove", "split", "trim", "move", "set", "cut_words"];
const READ = { clip, text, insert, audio: sound } as const;
const LIST = { clip: "clips", text: "texts", insert: "inserts", audio: "audio" } as const;

/** One op applied to `p` in place. */
function step(p: Project, raw: unknown, what: string, notes: string[], words?: Words, gaps?: Gaps) {
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
      // Where the split falls in the finished video, which a speed changes.
      const offset = (at - c.from) / (c.speed ?? 1);
      const second: Clip = { ...c, id, from: at };
      delete second.transition;
      delete second.lead;
      if (c.moves?.length) {
        // The second half starts framed as the first half was there, and keeps the moves after.
        Object.assign(second, framing(c, offset));
        second.moves = c.moves
          .filter((m) => m.at > offset)
          .map((m) => ({ ...m, at: ms(m.at - offset) }));
        c.moves = c.moves.filter((m) => m.at <= offset);
        if (!second.moves.length) delete second.moves;
        if (!c.moves.length) delete c.moves;
      }
      p.clips.splice(p.clips.indexOf(c) + 1, 0, second);
      // What starts in the second half goes with it.
      c.to = at;
      for (const t of [...p.texts, ...p.inserts]) {
        if (t.clip === c.id && t.from >= offset) {
          Object.assign(t, { clip: id, from: ms(t.from - offset), to: ms(t.to - offset) });
        }
      }
      for (const s of p.audio) {
        if (s.clip === c.id && s.at >= offset)
          Object.assign(s, { clip: id, at: ms(s.at - offset) });
      }
      return;
    }
    case "trim": {
      obj(a, what, ["id", "from", "to"]);
      const c = findClip(p, a.id);
      const from = a.from === undefined ? c.from : num(a.from, `${what}.from`, 0, Number.MAX_VALUE);
      const to = a.to === undefined ? c.to : num(a.to, `${what}.to`, 0, Number.MAX_VALUE);
      if (!(from < to)) fail(`${what}: ${c.id} needs from < to; got ${from} and ${to}`);
      // How far the clip's picture moves in the finished video: a speed changes it.
      const by = (c.from - from) / (c.speed ?? 1);
      if (c.moves?.length && by < 0) {
        // Trimmed off the start: frame the new start as it was there, and keep the moves after.
        Object.assign(c, framing(c, -by));
        c.moves = c.moves.filter((m) => m.at > -by).map((m) => ({ ...m, at: ms(m.at + by) }));
      } else if (c.moves?.length) c.moves = c.moves.map((m) => ({ ...m, at: ms(m.at + by) }));
      Object.assign(c, { from, to });
      if (c.moves) c.moves = c.moves.filter((m) => m.at <= lengthOf(c));
      if (c.moves && !c.moves.length) delete c.moves;
      if (by) shift(p, c.id, by, notes);
      dropPast(p, c.id, lengthOf(c), notes);
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
    case "cut_words":
      cutWords(p, a, what, notes, words, gaps);
      return;
    default:
      fail(`${what}: op must be one of ${OPS.join(", ")}; got ${JSON.stringify(op)}`);
  }
}

/**
 * `ops` applied to a copy of `p`, all of them or none: the first that fails
 * throws, naming it, and `p` is left as it was. `notes` says what an op did
 * besides what was asked, like removing a text whose words were cut.
 * `words` gives a source's words, for cut_words, and `gaps` its silences.
 */
export function apply(
  p: Project,
  ops: unknown[],
  words?: Words,
  gaps?: Gaps,
): { project: Project; notes: string[] } {
  const next = structuredClone(p);
  const notes: string[] = [];
  ops.forEach((op, i) => {
    const what = `ops[${i}]${typeof (op as Obj)?.op === "string" ? ` (${(op as Obj).op})` : ""}`;
    step(next, op, what, notes, words, gaps);
  });
  return { project: check(next), notes };
}

/** Each clip's start in the finished video, by id, and the video's length. */
export function starts(p: Project): { at: Map<string, number>; length: number } {
  const at = new Map<string, number>();
  let length = 0;
  for (const c of p.clips) {
    // A transition starts the clip over the end of the one before.
    const start = Math.max(0, length - (c.transition?.duration ?? 0));
    at.set(c.id, start);
    length = start + lengthOf(c);
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
      c.transition ? `  ${c.transition.type} in ${short(c.transition.duration)} s` : "",
      c.lead ? `  ${c.lead > 0 ? "J" : "L"} cut ${short(Math.abs(c.lead))} s` : "",
      c.speed && c.speed !== 1 ? `  speed ${short(c.speed)}x` : "",
      c.focus ? `  focus ${short(c.focus.x)},${short(c.focus.y)}` : "",
      c.zoom && c.zoom !== 1 ? `  zoom ${short(c.zoom)}` : "",
      c.moves?.length
        ? `  moves ${c.moves.map((m) => `${short(m.at)}s${m.zoom === undefined ? "" : ` zoom ${short(m.zoom)}`}${m.focus ? ` focus ${short(m.focus.x)},${short(m.focus.y)}` : ""}`).join("; ")}`
        : "",
    ].join("");
    lines.push(
      `${c.id}  ${stamp(start)}-${stamp(start + lengthOf(c))}  ${basename(c.path)} ${short(c.from)}-${short(c.to)}${look}`,
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
  clips: {
    path: string;
    from: number;
    to: number;
    focus?: Point;
    zoom?: number;
    speed?: number;
    moves?: Move[];
    transition?: Transition;
    /** The stretch of the source its sound comes from, where a J or L cut moves it off the picture's. */
    sound?: { from: number; to: number };
  }[];
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
    clips: p.clips.map(({ id, path: f, lead, ...rest }, i) => {
      // A lead in finished seconds is that much source at the clip's speed.
      const speed = rest.speed ?? 1;
      const next = p.clips[i + 1]?.lead ?? 0;
      const sound =
        lead || next
          ? { from: ms(rest.from - (lead ?? 0) * speed), to: ms(rest.to - next * speed) }
          : undefined;
      return clean({ path: path(f), ...rest, sound });
    }),
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
 * The cut as text, for reading the edit and choosing what to cut: each clip
 * at its place in the finished video, then its words, a line a sentence,
 * each line at the time it starts in the finished video.
 */
export function transcript(p: Project, file: string, words: Words): string {
  const { at, length } = starts(p);
  const lines = [`${file}: the words in the cut (${stamp(length)})`];
  for (const c of p.clips) {
    const start = at.get(c.id) ?? 0;
    lines.push(`${c.id}  ${stamp(start)}  ${basename(c.path)} ${short(c.from)}-${short(c.to)}`);
    const said = wordsIn(c, words(c.path));
    if (!said.length) lines.push("    (no speech)");
    let line: string[] = [];
    let when = 0;
    for (const w of said) {
      if (!line.length) when = start + (Math.max(w.start, c.from) - c.from) / (c.speed ?? 1);
      line.push(w.word.trim());
      if (/[.?!]["')\]]?$/.test(w.word) || line.length >= 25) {
        lines.push(`    [${stamp(when)}] ${line.join(" ")}`);
        line = [];
      }
    }
    if (line.length) lines.push(`    [${stamp(when)}] ${line.join(" ")}`);
  }
  return lines.join("\n");
}

/** The sources a project and its ops ask for, and the stretches of each: what cut_words needs heard. */
export function wanted(p: Project, ops: unknown[]): Map<string, { from: number; to: number }[]> {
  const out = new Map<string, { from: number; to: number }[]>();
  const add = (path: string, from: number, to: number) =>
    out.set(path, [...(out.get(path) ?? []), { from, to }]);
  for (const c of p.clips) add(c.path, c.from, c.to);
  for (const op of ops) {
    const o = op as Obj;
    if (o?.op === "add" && o.type === "clip" && typeof o.path === "string") {
      const [from, to] = [Number(o.from), Number(o.to)];
      if (from < to) add(o.path, from, to);
    }
  }
  return out;
}

/**
 * `ops` applied to the project in `file` (made if it isn't there) and saved,
 * then its outline. No ops only reads it. `words` is needed for cut_words,
 * and `gaps` lets its cuts land in the silences.
 */
export function edit(file: string, ops: unknown[], words?: Words, gaps?: Gaps): string {
  const { project, created } = load(file);
  // ponytail: no lock, so two edits of one file at once keep the last one's; a lock file if agents start doing that.
  const { project: next, notes } = apply(project, ops, words, gaps);
  if (ops.length || created) save(file, next);
  return [...(created ? [`Made ${file}.`] : []), ...notes, outline(next, file)].join("\n");
}
