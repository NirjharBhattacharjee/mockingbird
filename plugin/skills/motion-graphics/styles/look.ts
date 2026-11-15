// What every explainer style draws, so one page renders in any of them:
// pick a style by name and the same title, nodes, boxes, links, numbers and
// marks come out in its look, with its own entrances. Positions are 0-1 of
// the frame; sizes are units (a pixel at 1080 on the short side).
import { clamp, hash, lerp } from "../kit.ts";

export { alpha, clamp, easeIn, expo, hash, lerp, spring } from "../kit.ts";

/** What an element is in the explanation; each style picks its colour for it. */
export type Tone = "ink" | "accent" | "good" | "bad" | "muted";
/** When an element arrives (`at` seconds), how long its entrance takes, and its tone. */
export type Cue = { at?: number; dur?: number; tone?: Tone };
export type Align = "left" | "center" | "right";

export interface Look {
  /** The world everything sits on, drawn first: a board, paper, space, a screen. */
  surface(): void;
  /** The heading, top left unless placed. */
  title(text: string, o?: Cue & { x?: number; y?: number; size?: number; align?: Align }): void;
  /** A short label. */
  label(text: string, x: number, y: number, o?: Cue & { size?: number; align?: Align }): void;
  /** A thing or a point: a node, a dot, a planet, a cell. `r` in units. */
  node(x: number, y: number, r: number, o?: Cue): void;
  /** A container: a card, a panel, a frame. */
  box(x: number, y: number, w: number, h: number, o?: Cue): void;
  /** A connection from one point to another, bowed by `bend`, with an arrowhead unless `head` is false. */
  link(x1: number, y1: number, x2: number, y2: number, o?: Cue & { bend?: number; head?: boolean }): void;
  /** Where data lives: a drum, a stack, a jar. */
  store(x: number, y: number, w: number, h: number, o?: Cue): void;
  /** A big number; with `count` it counts from count[0] to count[1] over `dur`. */
  stat(
    text: string,
    x: number,
    y: number,
    o?: Cue & { count?: [number, number]; size?: number; sub?: string },
  ): void;
  /** A tick or a cross. */
  mark(kind: "check" | "cross", x: number, y: number, o?: Cue & { size?: number }): void;
  /** Drawn last: grain, scanlines, a vignette, the pen. */
  finish(): void;
}

/** A style: its id, name, family, and a Look for one frame. */
export type Style = {
  id: string;
  name: string;
  category: string;
  make: (ctx: any, t: number, m: any) => Look;
};

// ------------------------------------------------------------ shared pieces

export type Pt = [number, number];

/** A frame's measures: width, height, the unit, and 0-1 to pixels. */
export function frame(m: any) {
  const W: number = m.width;
  const H: number = m.height;
  const u = Math.min(W, H) / 1080;
  return { W, H, u, X: (x: number) => x * W, Y: (y: number) => y * H };
}

/** How far an entrance is: 0 before `at`, 1 after `at + dur`. */
export const progress = (t: number, at = 0, dur = 0.5) => clamp((t - at) / (dur || 1e-6));

/** Points along a polyline up to fraction `p` of its length, and the direction at its end. */
export function along(points: Pt[], p: number): { points: Pt[]; angle: number } {
  const lengths = points.slice(1).map((q, i) => {
    const a = points[i] as Pt;
    return Math.hypot(q[0] - a[0], q[1] - a[1]);
  });
  let left = lengths.reduce((s, l) => s + l, 0) * clamp(p);
  const out: Pt[] = [points[0] as Pt];
  let angle = 0;
  for (let i = 0; i < lengths.length && left > 0; i++) {
    const a = points[i] as Pt;
    const b = points[i + 1] as Pt;
    const l = lengths[i] as number;
    const f = Math.min(1, left / (l || 1));
    out.push([lerp(a[0], b[0], f), lerp(a[1], b[1], f)]);
    angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    left -= l;
  }
  return { points: out, angle };
}

/** A path nudged like a hand drew it: each point moved up to `wobble` pixels, the same every frame. */
export function roughen(points: Pt[], wobble: number, seed: number): Pt[] {
  return points.map(([x, y], i) => [
    x + (hash(seed + i * 1.7) - 0.5) * 2 * wobble,
    y + (hash(seed + i * 2.3 + 9) - 0.5) * 2 * wobble,
  ]);
}

/** `n` + 1 points along a quadratic curve from a to b, bowed `bend` (a fraction of its length) to the left. */
export function curve(a: Pt, b: Pt, bend = 0, n = 24): Pt[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const c: Pt = [
    (a[0] + b[0]) / 2 + (a[1] - b[1]) * bend,
    (a[1] + b[1]) / 2 + (b[0] - a[0]) * bend,
  ];
  void len;
  return Array.from({ length: n + 1 }, (_, i) => {
    const s = i / n;
    return [
      (1 - s) ** 2 * a[0] + 2 * (1 - s) * s * c[0] + s ** 2 * b[0],
      (1 - s) ** 2 * a[1] + 2 * (1 - s) * s * c[1] + s ** 2 * b[1],
    ] as Pt;
  });
}

/** Points round an ellipse, starting at the top and going clockwise. */
export function ellipse(cx: number, cy: number, rx: number, ry: number, n = 48, from = -Math.PI / 2, turn = 1) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = from + (i / n) * Math.PI * 2 * turn;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Pt;
  });
}

/** Trace a list of points as the current path. */
export function trace(ctx: any, points: Pt[], close = false) {
  ctx.beginPath();
  for (const [i, [x, y]] of points.entries()) i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  if (close) ctx.closePath();
}

/** An arrowhead at `tip` pointing along `angle`, `size` pixels long. */
export function arrowhead(ctx: any, tip: Pt, angle: number, size: number, open = true) {
  const a: Pt = [tip[0] - Math.cos(angle - 0.45) * size, tip[1] - Math.sin(angle - 0.45) * size];
  const b: Pt = [tip[0] - Math.cos(angle + 0.45) * size, tip[1] - Math.sin(angle + 0.45) * size];
  trace(ctx, [a, tip, b], !open);
}

/** A number counting between two values, eased, written with thousands commas. */
export function counting(t: number, at: number, dur: number, [from, to]: [number, number]) {
  const p = clamp((t - at) / (dur || 1e-6));
  const e = p === 1 ? 1 : 1 - 2 ** (-10 * p);
  return Math.round(lerp(from, to, e)).toLocaleString("en-US");
}

/** Film grain over the frame: `amount` 0-1, changing every frame. */
export function grain(ctx: any, m: any, t: number, amount = 0.06, size = 2) {
  const { W, H, u } = frame(m);
  const s = Math.max(1, size * u);
  ctx.save();
  const n = Math.floor(((W * H) / (s * s)) * 0.02);
  const f = Math.floor(t * 24);
  for (let i = 0; i < n; i++) {
    const v = hash(i * 3.1 + f * 17.3);
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${amount})` : `rgba(0,0,0,${amount})`;
    ctx.fillRect(hash(i + f * 7.7) * W, hash(i * 1.3 + f * 3.9) * H, s, s);
  }
  ctx.restore();
}

/** A soft dark edge round the frame. */
export function vignette(ctx: any, m: any, strength = 0.45, color = "0,0,0") {
  const { W, H } = frame(m);
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(1, `rgba(${color},${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Write text centred or aligned at (x, y) pixels, middle baseline. */
export function text(ctx: any, s: string, x: number, y: number, font: string, color: string, align: Align = "left") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(s, x, y);
}
