// Watercolour in a sketchbook: transparent pigment glazed in ragged
// layers on cold-press paper, edges darker where the water pooled, a faint
// pencil sketch under each wash. Washes flood out from their pencil lines,
// lettering and arrows are loaded round-brush strokes, and an alizarin
// circle does the emphasis.
import {
  along,
  alpha,
  clamp,
  counting,
  curve,
  ellipse,
  expo,
  frame,
  hash,
  type Look,
  type Pt,
  progress,
  roughen,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const PAINT: Record<Tone, string> = {
  ink: "#2E3A6E",
  accent: "#3E7FC1",
  good: "#5C9E58",
  bad: "#B5303B",
  muted: "#C99A58",
};
const BRUSH = '"Caveat", cursive';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__wcPaper ??= new Map();
  let seed = 13;

  function paper() {
    const key = `${W}x${H}`;
    let tile = g.__wcPaper.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      c.fillStyle = "#F6EFDF";
      c.fillRect(0, 0, W, H);
      // Cold-press tooth: soft light and dark pits.
      for (let i = 0; i < 9000; i++) {
        const v = hash(i * 1.1);
        c.fillStyle = v > 0.5 ? "rgba(255,255,255,0.35)" : "rgba(150,120,80,0.10)";
        const s = (1 + hash(i * 2.7) * 3) * u;
        c.beginPath();
        c.arc(hash(i * 3.9) * W, hash(i * 5.1) * H, s, 0, Math.PI * 2);
        c.fill();
      }
      g.__wcPaper.set(key, tile);
    }
    return tile;
  }

  /** A ragged outline round (cx, cy): radius wobbling, the same every frame. */
  function ragged(cx: number, cy: number, rx: number, ry: number, k: number, rough = 0.18): Pt[] {
    return Array.from({ length: 36 }, (_, i) => {
      const a = (i / 36) * Math.PI * 2;
      const n = 1 + (hash(k + i * 1.7) - 0.5) * rough * 2 + Math.sin(a * 3 + k) * rough * 0.5;
      return [cx + Math.cos(a) * rx * n, cy + Math.sin(a) * ry * n] as Pt;
    });
  }

  /** A wash: several transparent glazes, a darker pooled edge, flooding out with `p`. */
  function wash(pts: Pt[], cx: number, cy: number, color: string, p: number, strength = 1) {
    if (p <= 0) return;
    const s = expo(p);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(0.2 + 0.8 * s, 0.2 + 0.8 * s);
    ctx.translate(-cx, -cy);
    for (let layer = 0; layer < 3; layer++) {
      const shrink = 1 - layer * 0.08;
      const pp = pts.map(
        ([x, y], i) =>
          [
            cx + (x - cx) * shrink + (hash(i + layer * 50) - 0.5) * 6 * u,
            cy + (y - cy) * shrink + (hash(i * 2 + layer * 50) - 0.5) * 6 * u,
          ] as Pt,
      );
      trace(ctx, pp, true);
      ctx.fillStyle = alpha(color, 0.16 * strength);
      ctx.fill();
    }
    // Pigment pooled at the edge as it dries.
    trace(ctx, pts, true);
    ctx.strokeStyle = alpha(color, 0.35 * strength * clamp(p * 1.5 - 0.3));
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();
    // A bloom or two: lighter blotches where water crept back.
    for (let i = 0; i < 2; i++) {
      const bx = cx + (hash(cx + i) - 0.5) * (pts[0] as Pt)[0] * 0;
      void bx;
    }
    ctx.restore();
  }

  /** A faint pencil line under everything, drawn on. */
  function sketch(points: Pt[], at: number, dur: number) {
    seed++;
    const p = progress(t, at, dur);
    if (p <= 0) return;
    const { points: drawn } = along(roughen(points, 1 * u, seed * 2.1), p);
    ctx.save();
    trace(ctx, drawn);
    ctx.strokeStyle = "rgba(90,85,80,0.35)";
    ctx.lineWidth = 1 * u;
    ctx.stroke();
    ctx.restore();
  }

  /** A loaded round-brush stroke: thick and wet at the start, thinning, a pool at the end. */
  function brush(points: Pt[], at: number, dur: number, color: string, width = 6) {
    seed++;
    const p = progress(t, at, dur);
    if (p <= 0) return 0;
    const { points: drawn } = along(roughen(points, 1.2 * u, seed * 4.7), p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < drawn.length; i++) {
      const f = i / Math.max(1, drawn.length - 1);
      const a = drawn[i - 1] as Pt;
      const b = drawn[i] as Pt;
      ctx.strokeStyle = alpha(color, 0.75);
      ctx.lineWidth = width * u * (1.15 - 0.55 * f * p);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    ctx.restore();
    return p;
  }

  /** Brush lettering, written in left to right. */
  function letter(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: string,
    p: number,
  ) {
    if (p <= 0) return;
    ctx.save();
    ctx.font = `italic 700 ${Math.round(size * u)}px ${BRUSH}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 6 * u, y - size * u, (w + 12 * u) * clamp(p), size * 2 * u);
    ctx.clip();
    ctx.textAlign = "left";
    ctx.fillStyle = alpha(color, 0.9);
    ctx.fillText(s, left, y);
    ctx.restore();
  }

  return {
    surface() {
      ctx.drawImage(paper(), 0, 0);
      // Loose background washes that flood in across the sheet at the start.
      const zones: [number, number, number, number, Tone][] = [
        [0.3, 0.45, 0.3, 0.2, "muted"],
        [0.62, 0.42, 0.2, 0.24, "accent"],
        [0.86, 0.5, 0.14, 0.2, "good"],
      ];
      zones.forEach(([zx, zy, rx, ry, tone], i) => {
        wash(
          ragged(X(zx), Y(zy), X(rx), Y(ry), i * 17 + 3, 0.22),
          X(zx),
          Y(zy),
          PAINT[tone],
          progress(t, 0.3 + i * 0.4, 1.4),
          0.45,
        );
      });
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 52, at = 0, dur = 0.9 } = o;
      letter(s, X(x), Y(y), size, PAINT.ink, o.align ?? "left", progress(t, at, dur));
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, tone = "ink", align = "center" } = o;
      letter(
        s,
        X(x),
        Y(y),
        size,
        PAINT[tone === "accent" ? "ink" : tone],
        align,
        progress(t, at, o.dur ?? 0.04 * s.length + 0.15),
      );
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "accent" } = o;
      const R = r * u;
      const [cx, cy] = [X(x), Y(y)];
      const k = x * 311 + y * 97;
      sketch(ellipse(cx, cy, R, R, 24), at, 0.15);
      wash(
        ragged(cx, cy, R * 1.25, R * 1.25, k, 0.15),
        cx,
        cy,
        PAINT[tone],
        progress(t, at + 0.1, dur),
        1.8,
      );
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "good" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      sketch(
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
          [x0, y0],
        ],
        at,
        0.3,
      );
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      // A rough rectangle of wash that overshoots the pencil a little.
      const pts: Pt[] = Array.from({ length: 40 }, (_, i) => {
        const f = i / 40;
        const side = Math.floor(f * 4);
        const s = (f * 4) % 1;
        const j = (hash(i * 3.3 + x0) - 0.5) * 22 * u;
        const corners: Pt[] = [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ];
        const a = corners[side] as Pt;
        const b = corners[(side + 1) % 4] as Pt;
        return [a[0] + (b[0] - a[0]) * s + j, a[1] + (b[1] - a[1]) * s + j] as Pt;
      });
      wash(pts, cx, cy, PAINT[tone], progress(t, at + 0.2, dur), 1.2);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const color = PAINT[tone === "accent" && head ? "ink" : tone];
      if (!head) {
        const p = progress(t, at, dur);
        if (p <= 0) return;
        const { points: drawn } = along(pts, p);
        ctx.save();
        trace(ctx, drawn);
        ctx.strokeStyle = alpha(color, 0.35);
        ctx.lineWidth = 1.6 * u;
        ctx.stroke();
        ctx.restore();
        return;
      }
      const p = brush(pts, at, dur, color, 7);
      if (p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 16 * u;
        brush(
          [[end[0] - Math.cos(a - 0.55) * s, end[1] - Math.sin(a - 0.55) * s], end],
          at + dur,
          0.08,
          color,
          4,
        );
        brush(
          [[end[0] - Math.cos(a + 0.55) * s, end[1] - Math.sin(a + 0.55) * s], end],
          at + dur + 0.05,
          0.08,
          color,
          4,
        );
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "muted" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const cx = (x0 + x1) / 2;
      const rx = (x1 - x0) / 2;
      const ry = rx * 0.3;
      sketch(ellipse(cx, y0 + ry, rx, ry, 30), at, 0.2);
      sketch(
        [
          [x0, y0 + ry],
          [x0, y1 - ry],
        ],
        at + 0.15,
        0.12,
      );
      sketch(
        [
          [x1, y0 + ry],
          [x1, y1 - ry],
        ],
        at + 0.2,
        0.12,
      );
      sketch(ellipse(cx, y1 - ry, rx, ry, 20, 0, 0.5), at + 0.25, 0.15);
      const body: Pt[] = [
        ...ellipse(cx, y1 - ry, rx, ry, 18, 0, 0.5),
        ...ellipse(cx, y0 + ry, rx, ry, 18, Math.PI, 0.5),
      ];
      wash(
        roughen(body, 3 * u, 77),
        cx,
        (y0 + y1) / 2,
        PAINT[tone],
        progress(t, at + 0.3, dur),
        1.4,
      );
      wash(
        ragged(cx, y0 + ry, rx * 0.95, ry * 0.9, 5, 0.06),
        cx,
        y0 + ry,
        PAINT.accent,
        progress(t, at + 0.5, dur),
        1,
      );
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const color = tone === "good" ? PAINT.ink : PAINT[tone === "accent" ? "bad" : tone];
      letter(value, X(x), Y(y), size, color, "center", 1);
      if (sub) {
        letter(
          sub,
          X(x),
          Y(y) - size * 0.85 * u,
          size * 0.4,
          PAINT.ink,
          "center",
          progress(t, at + 0.2, 0.4),
        );
        ctx.save();
        ctx.font = `italic 700 ${Math.round(size * u)}px ${BRUSH}`;
        const w = ctx.measureText(value).width;
        ctx.restore();
        brush(
          ellipse(X(x), Y(y), w * 0.7, size * 0.62 * u, 40, -Math.PI * 0.65, 1.08),
          at + dur + 0.1,
          0.45,
          PAINT.bad,
          3.5,
        );
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 34 } = o;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check")
        brush(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.12, cy + s * 0.4],
            [cx + s * 0.6, cy - s * 0.5],
          ],
          at,
          dur,
          PAINT.good,
          6,
        );
      else {
        brush(
          [
            [cx - s * 0.45, cy - s * 0.45],
            [cx + s * 0.45, cy + s * 0.45],
          ],
          at,
          dur / 2,
          PAINT.bad,
          6,
        );
        brush(
          [
            [cx + s * 0.45, cy - s * 0.45],
            [cx - s * 0.45, cy + s * 0.45],
          ],
          at + dur / 2,
          dur / 2,
          PAINT.bad,
          6,
        );
      }
    },
    finish() {
      // The paper's tooth shows through the pigment: granulation.
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.5;
      ctx.drawImage(paper(), 0, 0);
      ctx.restore();
    },
  };
}

export default {
  id: "watercolor",
  name: "Watercolour wash",
  category: "Painterly",
  make,
} satisfies Style;
