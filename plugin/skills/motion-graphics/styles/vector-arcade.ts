// An XY vector cabinet: hair-thin phosphor beams on pure black with a soft
// bloom, brighter dots where the beam lingers on a corner, wireframe solids
// that fly in spinning, and every letter stroked in a home-made line font.
// The whole picture flickers a little with the load on the beam.
import {
  clamp,
  counting,
  curve,
  ellipse,
  frame,
  hash,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
} from "./look.ts";

const BEAM: Record<Tone, string> = {
  ink: "#7CFFA0",
  accent: "#F0FFF4",
  good: "#7CFFA0",
  bad: "#FF5A3C",
  muted: "#3A9A5C",
};

// A line font on a 4x6 grid: each glyph is polylines of (x, y) digit pairs.
const GLYPH: Record<string, string> = {
  A: "0602204246 0343",
  B: "06003041423303 3344453606",
  C: "40000646",
  D: "00304244360600",
  E: "40000646 0333",
  F: "400006 0333",
  G: "41400006464323",
  H: "0006 4046 0343",
  I: "0040 2026 0646",
  J: "40460604",
  K: "0006 400346",
  L: "000646",
  M: "0600234046",
  N: "06004640",
  O: "0040460600",
  P: "0600404303",
  Q: "0040460600 2446",
  R: "0600404303 2346",
  S: "400003434606",
  T: "0040 2026",
  U: "00064640",
  V: "002640",
  W: "0016233640",
  X: "0046 4006",
  Y: "0023 4023 2326",
  Z: "00400646",
  "0": "0040460600 4006",
  "1": "112026 0646",
  "2": "004043030646",
  "3": "00404606 0343",
  "4": "000343 4046",
  "5": "400003434606",
  "6": "400006464303",
  "7": "004016",
  "8": "0040460600 0343",
  "9": "430300404606",
  "%": "0640 0010110100 3545463635",
  "?": "010040432324 2526",
  "!": "2024 2526",
  ".": "2526",
  ",": "2516",
  "-": "0343",
  ">": "004306",
  "<": "400346",
  ":": "2122 2425",
  "'": "2021",
  "/": "0640",
  "(": "30111536",
  ")": "10313516",
  "+": "2125 0343",
  "=": "0242 0444",
};
const strokes = (ch: string): Pt[][] =>
  (GLYPH[ch] ?? "")
    .split(" ")
    .filter(Boolean)
    .map((s) =>
      Array.from(
        { length: s.length / 2 },
        (_, i) => [Number(s[i * 2]), Number(s[i * 2 + 1])] as Pt,
      ),
    );

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const flicker = 0.86 + 0.14 * hash(Math.floor(t * 30) * 1.31);

  /** One beam pass: a wide dim halo, then the thin bright core, and dwell dots on the corners. */
  function beam(lines: Pt[][], color: string, width = 1.6, dots = true) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [lw, a] of [
      [width * 5, 0.12],
      [width * 2.2, 0.25],
      [width, 0.95],
    ] as const) {
      ctx.globalAlpha = a * flicker;
      ctx.lineWidth = lw * u;
      ctx.beginPath();
      for (const pl of lines)
        for (const [i, [x, y]] of pl.entries()) i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      ctx.stroke();
    }
    if (dots) {
      ctx.globalAlpha = flicker;
      ctx.fillStyle = "#FFFFFF";
      const r = width * 1.1 * u;
      for (const pl of lines) for (const [x, y] of pl) ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }
  /** Text in the line font, `n` glyphs drawn so far; returns its polylines' width. */
  function letters(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align = "left",
    n = Infinity,
  ) {
    const k = (size * u) / 9;
    const adv = 6 * k;
    const up = s.toUpperCase();
    const tw = up.length * adv - 2 * k;
    const x0 = align === "center" ? x - tw / 2 : align === "right" ? x - tw : x;
    const lines: Pt[][] = [];
    for (let i = 0; i < Math.min(n, up.length); i++)
      for (const pl of strokes(up[i] as string))
        lines.push(pl.map(([gx, gy]) => [x0 + i * adv + gx * k, y - 3 * k + gy * k]));
    beam(lines, color, Math.max(1.2, size / 28));
    return tw;
  }
  const typed = (s: string, at: number, dur: number) => Math.ceil(s.length * progress(t, at, dur));

  return {
    surface() {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      const haze = ctx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, W * 0.6);
      haze.addColorStop(0, "rgba(40,90,60,0.12)");
      haze.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, W, H);
      // A low ridge on the horizon, traced in over the first second.
      const ridge: Pt[] = Array.from({ length: 33 }, (_, i) => [
        (i / 32) * W,
        H * 0.88 - (i % 2 ? hash(i * 3.7) * 40 + 10 : hash(i) * 8) * u,
      ]);
      const p = progress(t, 0, 1);
      beam([ridge.slice(0, Math.max(2, Math.round(ridge.length * p)))], BEAM.muted, 1.1, false);
      beam(
        [
          [
            [0, H * 0.88],
            [W * p, H * 0.88],
          ],
        ],
        BEAM.muted,
        1,
        false,
      );
    },
    title(text, o = {}) {
      const { x = 0.035, y = 0.06, size = 56, at = 0, dur = 0.9 } = o;
      if (t < at) return;
      letters(text, X(x), Y(y) + size * u * 0.5, size, BEAM.bad, "left", typed(text, at, dur));
    },
    label(text, x, y, o = {}) {
      const { at = 0, dur = 0.35, size = 38, tone = "ink", align = "center" } = o;
      if (t < at) return;
      letters(text, X(x), Y(y), size, BEAM[tone], align, typed(text, at, dur));
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "accent" } = o;
      if (t < at) return;
      // A wireframe octahedron flying in from far away, spinning.
      const p = progress(t, at, dur);
      const e = 1 - (1 - p) ** 3;
      const rr = r * u * 1.15 * (0.15 + 0.85 * e);
      const spin = t * 1.2 + x * 9 + (1 - e) * 6;
      const tilt = 0.5;
      const v: [number, number, number][] = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
      const pr = v.map(([a, b, c]) => {
        const x1 = a * Math.cos(spin) - c * Math.sin(spin);
        const z1 = a * Math.sin(spin) + c * Math.cos(spin);
        const y1 = b * Math.cos(tilt) - z1 * Math.sin(tilt);
        return [X(x) + x1 * rr, Y(y) + y1 * rr] as Pt;
      });
      const E = [
        [0, 2],
        [0, 3],
        [0, 4],
        [0, 5],
        [1, 2],
        [1, 3],
        [1, 4],
        [1, 5],
        [2, 4],
        [4, 3],
        [3, 5],
        [5, 2],
      ];
      beam(
        E.map(([a, b]) => [pr[a as number] as Pt, pr[b as number] as Pt]),
        BEAM[tone],
        1.3,
      );
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.45, tone = "ink" } = o;
      if (t < at) return;
      const p = progress(t, at, dur);
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const ring: Pt[] = [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
      ];
      const per = 2 * (x1 - x0 + y1 - y0);
      let left = per * p;
      const out: Pt[] = [ring[0] as Pt];
      for (let i = 1; i < ring.length && left > 0; i++) {
        const a = ring[i - 1] as Pt;
        const b = ring[i] as Pt;
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const f = Math.min(1, left / l);
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
        left -= l;
      }
      beam([out], BEAM[tone], 1.4);
      if (p >= 1) {
        // Lock-on brackets just outside the corners.
        const g = 10 * u;
        const L = 18 * u;
        beam(
          [
            [
              [x0 - g, y0 - g + L],
              [x0 - g, y0 - g],
              [x0 - g + L, y0 - g],
            ],
            [
              [x1 + g - L, y0 - g],
              [x1 + g, y0 - g],
              [x1 + g, y0 - g + L],
            ],
            [
              [x1 + g, y1 + g - L],
              [x1 + g, y1 + g],
              [x1 + g - L, y1 + g],
            ],
            [
              [x0 - g + L, y1 + g],
              [x0 - g, y1 + g],
              [x0 - g, y1 + g - L],
            ],
          ],
          BEAM.muted,
          1.1,
          false,
        );
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      if (t < at) return;
      const p = progress(t, at, dur);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      const color = head ? BEAM[tone === "accent" ? "ink" : tone] : BEAM.muted;
      beam([shown], color, head ? 1.4 : 0.8, false);
      const tip = shown.at(-1) as Pt;
      if (p < 1) beam([[tip, tip]], "#FFFFFF", 3);
      else if (head) {
        const q = pts.at(-3) as Pt;
        const a = Math.atan2(tip[1] - q[1], tip[0] - q[0]);
        const s = 16 * u;
        beam(
          [
            [
              [tip[0] - Math.cos(a - 0.45) * s, tip[1] - Math.sin(a - 0.45) * s],
              tip,
              [tip[0] - Math.cos(a + 0.45) * s, tip[1] - Math.sin(a + 0.45) * s],
            ],
          ],
          color,
          1.4,
        );
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "ink" } = o;
      if (t < at) return;
      // A wireframe drum: rings stacked up, then the sides.
      const p = progress(t, at, dur);
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.32;
      const lines: Pt[][] = [];
      const rings = 4;
      for (let i = 0; i < rings; i++) {
        const f = clamp(p * rings - i);
        if (f <= 0) continue;
        const cy = Y(y + h) - ry - (i / (rings - 1)) * (Y(h) - ry * 2);
        lines.push(ellipse(cx, cy, rx, ry, 32, Math.PI / 2, f));
      }
      if (p >= 1)
        lines.push(
          [
            [cx - rx, Y(y) + ry],
            [cx - rx, Y(y + h) - ry],
          ],
          [
            [cx + rx, Y(y) + ry],
            [cx + rx, Y(y + h) - ry],
          ],
        );
      beam(lines, BEAM[tone], 1.3, false);
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "ink" } = o;
      if (t < at) return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const yy = Y(y) - (sub ? size * u * 0.25 : 0);
      letters(s, X(x), yy, size * 1.35, BEAM[tone === "accent" ? "accent" : tone], "center");
      if (sub)
        letters(
          sub,
          X(x),
          Y(y) + size * u * 0.55,
          size * 0.3,
          BEAM.ink,
          "center",
          typed(sub, at, 0.4),
        );
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.25, size = 40 } = o;
      if (t < at) return;
      const r = size * u * 0.6;
      const p = progress(t, at, dur);
      const cx = X(x);
      const cy = Y(y);
      if (kind === "check") {
        const pts: Pt[] = [
          [cx - r, cy],
          [cx - r * 0.3, cy + r * 0.7],
          [cx + r, cy - r * 0.8],
        ];
        beam([pts.slice(0, p < 0.5 ? 2 : 3)], BEAM.good, 1.8);
      } else {
        const ls: Pt[][] = [
          [
            [cx - r, cy - r],
            [cx + r, cy + r],
          ],
        ];
        if (p > 0.5)
          ls.push([
            [cx + r, cy - r],
            [cx - r, cy + r],
          ]);
        beam(ls, BEAM.bad, 1.8);
      }
    },
    finish() {},
  };
}

export default {
  id: "vector-arcade",
  name: "Vector cabinet",
  category: "Retro Digital",
  make,
} satisfies Style;
