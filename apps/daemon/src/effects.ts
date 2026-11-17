/**
 * The effects catalog (#197): each effect is an entry here, not a tool, so
 * the catalog can grow without a tool description per effect. An entry
 * names its parameters with their ranges and builds the ffmpeg filter that
 * render puts on a clip's picture or sound.
 */
import { along, type Point } from "./track.ts";

type Param = { min: number; max: number; default: number; about: string };
/** What an effect is put on: the picture's size, and how long it lasts in the finished video. */
export type Ctx = { width: number; height: number; length: number; fps: number };
type Entry = {
  kind: "video" | "audio";
  about: string;
  params: Record<string, Param>;
  /** Paths the effect reads, besides its numbers: a LUT. */
  files?: string[];
  /** Colours it takes as #rrggbb, with their defaults. */
  colors?: Record<string, string>;
  build: (p: Record<string, number>, strings: Record<string, string>, ctx: Ctx) => string;
  /** For a picture effect that changes the sound too (reverse). */
  sound?: (p: Record<string, number>) => string;
};

/**
 * Where a picture effect applies, when not the whole frame (#198): a
 * rectangle, an ellipse or a polygon, in 0-1 of the width and height,
 * softened by `feather` (0-1 of the width), outside it with `invert`. A
 * rectangle or ellipse with `end` moves to that box over the clip.
 */
export type Mask = {
  shape: "rect" | "ellipse" | "polygon";
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  points?: [number, number][];
  feather?: number;
  invert?: boolean;
  end?: { x: number; y: number; w: number; h: number };
  /** A rect or ellipse following a path, its top left `at` seconds into the clip: what `track` gives. */
  path?: Point[];
};

const DEFAULT_CTX: Ctx = { width: 1920, height: 1080, length: 0, fps: 30 };
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** An effect as a project keeps it: its name and its settings. */
export type Effect = { name: string } & Record<string, unknown>;

/**
 * A path as a filter option inside a graph, escaped at both levels ffmpeg
 * parses: the option value (`\`, `'`, `:`), then the graph (`\`, `'`, `[`, `]`,
 * `,`, `;`). Quoting it instead breaks on an apostrophe: `O'Brien.cube`.
 */
export const quoted = (path: string) =>
  path.replace(/[\\':]/g, (c) => `\\${c}`).replace(/[\\'[\],;]/g, (c) => `\\${c}`);

const f = (n: number) => String(Math.round(n * 10000) / 10000);

export const EFFECTS: Record<string, Entry> = {
  color: {
    kind: "video",
    about: "Exposure, contrast, saturation, gamma and white balance, in one pass",
    params: {
      exposure: { min: -3, max: 3, default: 0, about: "stops; +1 doubles the light" },
      contrast: { min: 0, max: 3, default: 1, about: "1 leaves it" },
      saturation: { min: 0, max: 3, default: 1, about: "0 is black and white" },
      gamma: { min: 0.2, max: 5, default: 1, about: "above 1 lifts the mids" },
      temperature: {
        min: 1000,
        max: 40000,
        default: 6500,
        about: "kelvin the picture is shot at; lower warms a cold picture",
      },
    },
    build: (p) =>
      [
        p.exposure ? `exposure=exposure=${f(p.exposure as number)}` : "",
        p.contrast !== 1 || p.saturation !== 1 || p.gamma !== 1
          ? `eq=contrast=${f(p.contrast as number)}:saturation=${f(p.saturation as number)}:gamma=${f(p.gamma as number)}`
          : "",
        p.temperature !== 6500
          ? `colortemperature=temperature=${Math.round(p.temperature as number)}`
          : "",
      ]
        .filter(Boolean)
        .join(","),
  },
  lut: {
    kind: "video",
    about: "A look from a .cube 3D LUT, at full strength",
    // ponytail: no partial mix; a split and blend need their own graph labels, add if wanted.
    params: {},
    files: ["file"],
    build: (_, files) => `lut3d=file=${quoted(files.file as string)}`,
  },
  vignette: {
    kind: "video",
    about: "Darkens the corners, to pull the eye to the middle",
    params: { amount: { min: 0, max: 1, default: 0.4, about: "0 none, 1 strong" } },
    build: (p) => `vignette=angle=${f((p.amount as number) * (Math.PI / 2.5))}`,
  },
  sharpen: {
    kind: "video",
    about: "Unsharp mask, for soft footage",
    params: { amount: { min: 0, max: 2, default: 0.5, about: "how much" } },
    build: (p) => `unsharp=5:5:${f(p.amount as number)}:5:5:0`,
  },
  blur: {
    kind: "video",
    about: "Gaussian blur over the whole picture",
    params: { radius: { min: 0.5, max: 50, default: 8, about: "pixels" } },
    build: (p) => `gblur=sigma=${f(p.radius as number)}`,
  },
  chromakey: {
    kind: "video",
    about:
      "Keys out a green or blue screen and takes the colour's spill off the edges. Put it on an insert, so the cut shows through where the screen was",
    params: {
      similarity: { min: 0.01, max: 1, default: 0.15, about: "how far from the colour still keys" },
      blend: { min: 0, max: 1, default: 0.05, about: "how soft the key's edge is" },
      spill: { min: 0, max: 1, default: 0.5, about: "how much spill to take off" },
    },
    colors: { color: "#00ff00" },
    build: (p, s) => {
      const hex = (s.color as string).replace("#", "");
      const [, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
      const spill = p.spill
        ? `,despill=${(g as number) >= (b as number) ? "type=green:green=-1:blue=0" : "type=blue:green=0:blue=-1"}:mix=${f(p.spill as number)}`
        : "";
      return `format=yuva420p,chromakey=color=0x${hex}:similarity=${f(p.similarity as number)}:blend=${f(p.blend as number)}${spill}`;
    },
  },
  stabilize: {
    kind: "video",
    about:
      "Steadies a shaky handheld clip (ffmpeg's deshake), then zooms in a little so the moving edges stay out of frame",
    params: {
      strength: { min: 0, max: 1, default: 0.5, about: "how far it searches for the shake" },
      zoom: { min: 0, max: 0.2, default: 0.05, about: "how much to crop to hide the edges" },
    },
    build: (p, _, c) => {
      // deshake searches 16, 32, 48 or 64 pixels each way.
      const range = 16 * Math.round(1 + 3 * (p.strength as number));
      const z = p.zoom as number;
      const crop = z
        ? `,crop=${even(c.width * (1 - z))}:${even(c.height * (1 - z))},scale=${c.width}:${c.height}`
        : "";
      return `deshake=rx=${range}:ry=${range}:edge=mirror${crop}`;
    },
  },
  crop: {
    kind: "video",
    about:
      "Cuts edges off, each 0-0.5 of the picture, leaving the rest where it was: on an insert the cut shows through, on a clip they're black",
    params: {
      left: { min: 0, max: 0.5, default: 0, about: "of the width" },
      right: { min: 0, max: 0.5, default: 0, about: "of the width" },
      top: { min: 0, max: 0.5, default: 0, about: "of the height" },
      bottom: { min: 0, max: 0.5, default: 0, about: "of the height" },
    },
    build: (p, _, c) => {
      const [l, r, t, b] = [p.left, p.right, p.top, p.bottom] as number[];
      if (!(l || r || t || b)) return "";
      const [x, y] = [even(c.width * (l as number)), even(c.height * (t as number))];
      const w = Math.max(2, even(c.width * (1 - (l as number) - (r as number))));
      const h = Math.max(2, even(c.height * (1 - (t as number) - (b as number))));
      return `format=yuva420p,crop=${w}:${h}:${x}:${y},pad=${c.width}:${c.height}:${x}:${y}:color=black@0`;
    },
  },
  freeze: {
    kind: "video",
    about:
      "Holds the clip's first frame for its whole length while its sound plays on; split a clip where the freeze should start",
    params: {},
    build: (_, __, c) =>
      `trim=end_frame=1,tpad=stop_mode=clone:stop_duration=${f(c.length)},trim=duration=${f(c.length)}`,
  },
  interpolate: {
    kind: "video",
    about:
      "Smooth slow motion: a slowed clip (speed under 1) gets new in-between frames from the motion instead of repeated ones. Slow to render: 4 s at 720p took 9.5 s",
    params: {},
    // Placed by render before the frame rate is set, not in the effect chain.
    build: () => "",
  },
  reverse: {
    kind: "video",
    about: "Plays the clip backwards, picture and sound. Keep it short: the clip is held in memory",
    params: {},
    build: () => "reverse",
    sound: () => "areverse",
  },
  gain: {
    kind: "audio",
    about:
      "Raises or lowers the clip's sound by dB; a project's `level` sets it for each source (#265)",
    params: { db: { min: -30, max: 30, default: 0, about: "dB; +6 is about twice as loud" } },
    build: (p) => (p.db ? `volume=${f(p.db as number)}dB` : ""),
  },
  denoise: {
    kind: "audio",
    about:
      "Takes out steady background noise (hiss, hum, fans). Set floor to the source's noise floor from audio_stats",
    params: {
      amount: { min: 0, max: 1, default: 0.5, about: "0 light, 1 strong" },
      floor: {
        min: -80,
        max: -20,
        default: -40,
        about: "dBFS where the noise sits; audio_stats on the source gives it",
      },
    },
    build: (p) => `afftdn=nr=${f(12 + (p.amount as number) * 28)}:nf=${f(p.floor as number)}:tn=1`,
  },
  highpass: {
    kind: "audio",
    about: "Cuts rumble below a frequency; 80 Hz suits speech",
    params: { frequency: { min: 20, max: 400, default: 80, about: "Hz" } },
    build: (p) => `highpass=f=${Math.round(p.frequency as number)}`,
  },
  compress: {
    kind: "audio",
    about: "Evens out loud and quiet speech",
    params: {
      threshold: { min: -60, max: 0, default: -24, about: "dB where it starts" },
      ratio: { min: 1, max: 20, default: 3, about: "how hard" },
    },
    build: (p) =>
      `acompressor=threshold=${f(10 ** ((p.threshold as number) / 20))}:ratio=${f(p.ratio as number)}:attack=10:release=150`,
  },
  deess: {
    kind: "audio",
    about: "Softens harsh s and sh sounds",
    params: { amount: { min: 0, max: 1, default: 0.5, about: "how much" } },
    build: (p) => `deesser=i=${f(p.amount as number)}`,
  },
};

/** `effects`, checked against the catalog: each one's numbers in range, its files given. */
export function checkEffects(effects: unknown, what: string): Effect[] {
  if (effects === undefined) return [];
  if (!Array.isArray(effects)) throw new Error(`${what} must be a list of { name, ... }`);
  return effects.map((e, i) => {
    const at = `${what}[${i}]`;
    if (typeof e !== "object" || e === null) throw new Error(`${at} must be an object`);
    const { name, ...given } = e as Record<string, unknown>;
    const entry = EFFECTS[String(name)];
    if (!entry) {
      throw new Error(`${at}.name must be one of ${Object.keys(EFFECTS).join(", ")}; got ${name}`);
    }
    for (const [key, value] of Object.entries(given)) {
      if (key === "mask") {
        if (entry.kind !== "video") throw new Error(`${at}: only a picture effect takes a mask`);
        checkMask(value, `${at}.mask`);
        continue;
      }
      if (entry.colors && key in entry.colors) {
        if (typeof value !== "string" || !/^#?[0-9a-f]{6}$/i.test(value)) {
          throw new Error(
            `${at}.${key} must be a colour like "#00ff00"; got ${JSON.stringify(value)}`,
          );
        }
        continue;
      }
      if (entry.files?.includes(key)) {
        if (typeof value !== "string" || !value) throw new Error(`${at}.${key} must be a path`);
        continue;
      }
      const p = entry.params[key];
      if (!p) {
        const known = [
          ...Object.keys(entry.params),
          ...(entry.files ?? []),
          ...Object.keys(entry.colors ?? {}),
          ...(entry.kind === "video" ? ["mask"] : []),
        ].join(", ");
        throw new Error(`${at}: ${name} has no ${key}; it takes ${known}`);
      }
      const n = Number(value);
      if (typeof value !== "number" || !Number.isFinite(n) || n < p.min || n > p.max) {
        throw new Error(
          `${at}.${key} must be from ${p.min} to ${p.max}; got ${JSON.stringify(value)}`,
        );
      }
    }
    for (const file of entry.files ?? []) {
      if (given[file] === undefined) throw new Error(`${at}: ${name} needs ${file}`);
    }
    return { name: String(name), ...given };
  });
}

/** One effect's filter for its picture or sound, and for the sound too if it changes both. */
function built(
  { name, ...given }: Effect,
  ctx: Ctx,
): { kind: "video" | "audio"; filter: string; sound: string } | undefined {
  const entry = EFFECTS[name];
  if (!entry) return undefined;
  const numbers: Record<string, number> = {};
  for (const [key, p] of Object.entries(entry.params)) {
    numbers[key] = typeof given[key] === "number" ? (given[key] as number) : p.default;
  }
  const strings: Record<string, string> = {
    ...entry.colors,
    ...Object.fromEntries(
      [...(entry.files ?? []), ...Object.keys(entry.colors ?? {})]
        .filter((k) => given[k] !== undefined)
        .map((k) => [k, String(given[k])]),
    ),
  };
  return {
    kind: entry.kind,
    filter: entry.build(numbers, strings, ctx),
    sound: entry.sound?.(numbers) ?? "",
  };
}

/**
 * A clip's effects as filter chains for its picture and its sound ("" for
 * none). Masked picture effects are left to pictureSteps, which needs a graph.
 */
export function effectFilters(
  effects: Effect[] = [],
  ctx: Ctx = DEFAULT_CTX,
): { video: string; audio: string } {
  const chains = { video: [] as string[], audio: [] as string[] };
  for (const e of effects) {
    const b = built(e, ctx);
    if (!b) continue;
    if (b.filter && !e.mask) chains[b.kind].push(b.filter);
    if (b.sound) chains.audio.push(b.sound);
  }
  return { video: chains.video.join(","), audio: chains.audio.join(",") };
}

/** Whether any of `effects` is masked, so the picture needs pictureSteps' graph. */
export const masked = (effects: Effect[] = []) => effects.some((e) => e.mask);

/**
 * The picture effects from `input` to `output` as graph steps; each masked
 * one is split off, put through its effect, given the mask as its alpha and
 * laid back over the picture. `tag` keeps the labels apart between clips.
 */
export function pictureSteps(
  effects: Effect[],
  input: string,
  output: string,
  ctx: Ctx,
  tag: string,
): string[] {
  const steps: string[] = [];
  let at = input;
  let chain: string[] = [];
  const flush = (to: string) => {
    steps.push(`${at}${chain.join(",") || "null"}${to}`);
    at = to;
    chain = [];
  };
  effects.forEach((e, n) => {
    const b = built(e, ctx);
    if (!b?.filter || b.kind !== "video") return;
    if (!e.mask) {
      chain.push(b.filter);
      return;
    }
    const l = (s: string) => `[${tag}${s}${n}]`;
    flush(l("p"));
    steps.push(
      `${at}split${l("k")}${l("e")}`,
      ...maskSteps(e.mask as Mask, ctx, l("m"), `${tag}${n}`),
      `${l("e")}${b.filter},format=yuva420p${l("f")}`,
      `${l("f")}${l("m")}alphamerge${l("x")}`,
      `${l("k")}${l("x")}overlay=format=auto${l("o")}`,
    );
    at = l("o");
  });
  flush(output);
  return steps;
}

/**
 * The mask's graph steps, ending in `out`. One that follows a path is its
 * shape drawn once and moved over black by overlay, whose position is worked
 * out per frame, not per pixel as geq's would be.
 */
export function maskSteps(m: Mask, ctx: Ctx, out: string, tag: string): string[] {
  if (!m.path?.length) return [`${maskSource(m, ctx)}${out}`];
  const { width: W, height: H, fps, length } = ctx;
  const pw = even((m.w ?? 0.2) * W);
  const ph = even((m.h ?? 0.2) * H);
  const d = f(Math.max(length, 1 / fps));
  const round =
    m.shape === "ellipse"
      ? ",format=gray,geq=lum='255*lte(pow((X-W/2)/(W/2),2)+pow((Y-H/2)/(H/2),2),1)'"
      : "";
  const soft = m.feather ? `,gblur=sigma=${f(m.feather * W)}` : "";
  return [
    `color=c=white:s=${pw}x${ph}:r=${fps}:d=${d}${round},format=yuv420p[${tag}ms]`,
    `color=c=black:s=${W}x${H}:r=${fps}:d=${d},format=yuv420p[${tag}mb]`,
    `[${tag}mb][${tag}ms]overlay=x='${along(m.path, "x", "t", W)}':y='${along(m.path, "y", "t", H)}':shortest=1,format=gray${m.invert ? ",negate" : ""}${soft}${out}`,
  ];
}

/**
 * The mask as a grey picture as long as the clip, white where the effect
 * applies: drawn per frame by geq, so a moving box is exact on every frame.
 */
export function maskSource(m: Mask, ctx: Ctx): string {
  const { width: W, height: H, fps, length } = ctx;
  const u = "(X/W)";
  const v = "(Y/H)";
  // A value moving from `a` to `b` over the clip.
  const go = (a: number, b: number | undefined) =>
    b === undefined || b === a
      ? f(a)
      : `(${f(a)}+${f(b - a)}*clip(T/${f(Math.max(length, 1e-3))},0,1))`;
  const box = { x: m.x ?? 0, y: m.y ?? 0, w: m.w ?? 1, h: m.h ?? 1 };
  const [x, y, w, h] = [
    go(box.x, m.end?.x),
    go(box.y, m.end?.y),
    go(box.w, m.end?.w),
    go(box.h, m.end?.h),
  ];
  let inside: string;
  if (m.shape === "polygon") {
    const pts = m.points ?? [];
    // Crossing number: a point is inside when a ray to its left crosses an odd number of edges.
    const edges = pts.flatMap(([xi, yi], i) => {
      const [xj, yj] = pts[(i + 1) % pts.length] as [number, number];
      if (yi === yj) return [];
      return [
        `gt(${v},${f(Math.min(yi, yj))})*lte(${v},${f(Math.max(yi, yj))})*lt(${u},${f(xi)}+${f((xj - xi) / (yj - yi))}*(${v}-${f(yi)}))`,
      ];
    });
    inside = `mod(${edges.join("+") || "0"},2)`;
  } else if (m.shape === "ellipse") {
    inside = `lte(pow((${u}-${x}-${w}/2)/(${w}/2),2)+pow((${v}-${y}-${h}/2)/(${h}/2),2),1)`;
  } else {
    inside = `between(${u},${x},${x}+${w})*between(${v},${y},${y}+${h})`;
  }
  const value = m.invert ? `(1-${inside})` : inside;
  const soft = m.feather ? `,gblur=sigma=${f(m.feather * W)}` : "";
  return `color=c=black:s=${W}x${H}:r=${fps}:d=${f(length)},format=gray,geq=lum='255*${value}'${soft}`;
}

/** `v` checked as a path: [{at, x, y}], at rising, x and y 0-1. */
export function checkPath(v: unknown, at: string): void {
  if (!Array.isArray(v) || !v.length) throw new Error(`${at} must be a list of { at, x, y }`);
  let last = -1;
  v.forEach((p, i) => {
    const o = p as Record<string, unknown>;
    if (typeof o !== "object" || o === null) throw new Error(`${at}[${i}] must be { at, x, y }`);
    const [t, x, y] = [o.at, o.x, o.y];
    if (typeof t !== "number" || !(t > last))
      throw new Error(`${at}[${i}].at must be rising seconds`);
    if (
      typeof x !== "number" ||
      !(x >= -1 && x <= 2) ||
      typeof y !== "number" ||
      !(y >= -1 && y <= 2)
    ) {
      throw new Error(`${at}[${i}] needs x and y, 0-1 of the picture`);
    }
    last = t;
  });
}

/** `v` checked as a Mask. */
function checkMask(v: unknown, at: string): void {
  if (typeof v !== "object" || v === null) throw new Error(`${at} must be an object`);
  const m = v as Record<string, unknown>;
  const keys = ["shape", "x", "y", "w", "h", "points", "feather", "invert", "end", "path"];
  const extra = Object.keys(m).filter((k) => !keys.includes(k));
  if (extra.length)
    throw new Error(`${at} has no ${extra.join(", ")}; it takes ${keys.join(", ")}`);
  if (!["rect", "ellipse", "polygon"].includes(String(m.shape))) {
    throw new Error(`${at}.shape must be rect, ellipse or polygon`);
  }
  const unit = (n: unknown, what: string, lo = 0, hi = 1) => {
    if (n === undefined) return;
    if (typeof n !== "number" || !(n >= lo && n <= hi)) {
      throw new Error(`${what} must be from ${lo} to ${hi}; got ${JSON.stringify(n)}`);
    }
  };
  for (const k of ["x", "y", "w", "h"]) unit(m[k], `${at}.${k}`);
  unit(m.feather, `${at}.feather`, 0, 0.5);
  if (m.invert !== undefined && typeof m.invert !== "boolean")
    throw new Error(`${at}.invert must be true or false`);
  if (m.path !== undefined) {
    if (m.shape === "polygon" || m.end !== undefined) {
      throw new Error(`${at}: a path moves a rect or ellipse, and takes no end`);
    }
    checkPath(m.path, `${at}.path`);
  }
  if (m.shape === "polygon") {
    if (m.end !== undefined)
      throw new Error(`${at}: a polygon doesn't move; use a rect or ellipse with end`);
    if (!Array.isArray(m.points) || m.points.length < 3) {
      throw new Error(`${at}.points must be at least 3 [x, y] pairs`);
    }
    m.points.forEach((pt, i) => {
      if (!Array.isArray(pt) || pt.length !== 2)
        throw new Error(`${at}.points[${i}] must be [x, y]`);
      unit(pt[0], `${at}.points[${i}][0]`);
      unit(pt[1], `${at}.points[${i}][1]`);
    });
  } else if (m.end !== undefined) {
    if (typeof m.end !== "object" || m.end === null)
      throw new Error(`${at}.end must be { x, y, w, h }`);
    for (const k of ["x", "y", "w", "h"]) {
      const n = (m.end as Record<string, unknown>)[k];
      if (n === undefined) throw new Error(`${at}.end needs ${k}`);
      unit(n, `${at}.end.${k}`);
    }
  }
}

/** The catalog as text, for the `effects` tool. */
export function catalog(): string {
  return Object.entries(EFFECTS)
    .map(([name, e]) => {
      const params = Object.entries(e.params).map(
        ([k, p]) => `    ${k}: ${p.min} to ${p.max}, default ${p.default} (${p.about})`,
      );
      const files = (e.files ?? []).map((k) => `    ${k}: an absolute path`);
      const colors = Object.entries(e.colors ?? {}).map(
        ([k, d]) => `    ${k}: a colour like "#00ff00", default ${d}`,
      );
      return [`${name} (${e.kind}): ${e.about}`, ...files, ...colors, ...params].join("\n");
    })
    .join("\n")
    .concat(
      '\n\nAny picture effect takes mask: { shape: "rect" | "ellipse" | "polygon", x, y, w, h (0-1 of the picture; a polygon has points: [[x, y], ...]), feather (0-0.5 of the width), invert, end: { x, y, w, h } to move a rect or ellipse there over the clip }, to apply it to that part of the frame only.',
    );
}
