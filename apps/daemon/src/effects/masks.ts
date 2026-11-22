import { along, type TrackPoint } from "../inspect/track.ts";
import { type Ctx, even, f } from "./catalog.ts";

/**
 * Where a picture effect applies, when not the whole frame (#198): a
 * rectangle, an ellipse or a polygon, in 0-1 of the width and height,
 * softened by `feather` (0-1 of the width), outside it with `invert`. A
 * rectangle or ellipse with `end` moves to that box over the clip. A
 * `subject` mask is the person in the frame, found by MODNet (#260).
 */
export type Mask = {
  shape: "rect" | "ellipse" | "polygon" | "subject";
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  points?: [number, number][];
  feather?: number;
  invert?: boolean;
  end?: { x: number; y: number; w: number; h: number };
  /** A rect or ellipse following a path, its top left `at` seconds into the clip: what `track` gives. */
  path?: TrackPoint[];
  /** A subject mask's video, made by render before the graph (subject.ts), never by hand, and its source's size. */
  file?: string;
  size?: string;
  /** That video as filters, framed like the clip: set by renderGraph. */
  source?: string;
};

/**
 * The mask's graph steps, ending in `out`. One that follows a path is its
 * shape drawn once and moved over black by overlay, whose position is worked
 * out per frame, not per pixel as geq's would be.
 */
export function maskSteps(m: Mask, ctx: Ctx, out: string, tag: string): string[] {
  if (m.shape === "subject") {
    if (!m.source)
      throw new Error("A subject mask goes on a clip's effects, not a layer or insert's.");
    const soft = m.feather ? `,gblur=sigma=${f(m.feather * ctx.width)}` : "";
    return [`${m.source},format=gray${m.invert ? ",negate" : ""}${soft}${out}`];
  }
  if (!m.path?.length) return [`${maskSource(m, ctx)}${out}`];
  const { width: W, height: H, fps, length, speed = 1 } = ctx;
  // The path is timed in the source; at a speed, output time t is source time t*speed.
  // Unrounded, as setpts has it: at 0.250049x a rounded speed puts the mask 44 px behind by 470 s.
  const at = speed === 1 ? "t" : `(t*${speed})`;
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
    `[${tag}mb][${tag}ms]overlay=x='${along(m.path, "x", at, W)}':y='${along(m.path, "y", at, H)}':shortest=1,format=gray${m.invert ? ",negate" : ""}${soft}${out}`,
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
    // The same rules as a project's tracked box (packages/timeline): from 0, rising.
    if (typeof t !== "number" || !(t > last) || t < 0 || t > 86400)
      throw new Error(`${at}[${i}].at must be rising seconds from 0`);
    if (
      typeof x !== "number" ||
      !(x >= -1 && x <= 2) ||
      typeof y !== "number" ||
      !(y >= -1 && y <= 2)
    ) {
      throw new Error(`${at}[${i}] needs x and y from -1 to 2 (0-1 is the picture)`);
    }
    last = t;
  });
}

/** `v` checked as a Mask. */
export function checkMask(v: unknown, at: string): void {
  if (typeof v !== "object" || v === null) throw new Error(`${at} must be an object`);
  const m = v as Record<string, unknown>;
  const keys = ["shape", "x", "y", "w", "h", "points", "feather", "invert", "end", "path"];
  const extra = Object.keys(m).filter((k) => !keys.includes(k));
  if (extra.length)
    throw new Error(`${at} has no ${extra.join(", ")}; it takes ${keys.join(", ")}`);
  if (!["rect", "ellipse", "polygon", "subject"].includes(String(m.shape))) {
    throw new Error(`${at}.shape must be rect, ellipse, polygon or subject`);
  }
  if (m.shape === "subject") {
    const shaped = ["x", "y", "w", "h", "points", "end", "path"].filter((k) => m[k] !== undefined);
    if (shaped.length)
      throw new Error(`${at}: a subject mask finds its own shape; drop ${shaped.join(", ")}`);
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
