// Stacked signal traces on black: thin white lines, each one filled black so
// it hides the trace behind it, plotted left to right like a pen recorder.
// Tiny monospace captions typed out, nothing louder than a peak.
import {
  along,
  arrowhead,
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
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const BG = "#0D0D0D";
const LINE: Record<Tone, string> = {
  ink: "#F2F2EE",
  accent: "#FFFFFF",
  good: "#F2F2EE",
  bad: "#BDBDB8",
  muted: "#8A8A86",
};
const MONO = '"Space Mono", monospace';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  let pen: Pt | null = null;

  /** A noisy trace from x0 to x1 at baseline y, with a peak at `peak` (0-1 along it), swept on to `p`. */
  function ridge(
    x0: number,
    x1: number,
    y: number,
    amp: number,
    seed: number,
    p: number,
    peak = 0.5,
    color = LINE.ink,
  ) {
    if (p <= 0) return;
    const n = Math.max(12, Math.round((x1 - x0) / (4 * u)));
    const pts: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const g = Math.exp(-(((f - peak) / 0.09) ** 2));
      const wob =
        (hash(seed + i * 0.73) - 0.5) * 3 * u * (1 + g * 2) +
        Math.sin(f * 40 + seed + t * 3) * 0.6 * u;
      pts.push([x0 + (x1 - x0) * f, y - g * amp + wob]);
    }
    const shown = along(pts, p).points;
    ctx.save();
    trace(ctx, [...shown, [(shown.at(-1) as Pt)[0], y + 4 * u], [x0, y + 4 * u]], true);
    ctx.fillStyle = BG;
    ctx.fill();
    trace(ctx, shown);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6 * u;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
    if (p < 1) pen = shown.at(-1) as Pt;
  }

  /** Monospace text typed out a character at a time. */
  function typed(
    s: string,
    x: number,
    y: number,
    size: number,
    o: { at?: number; tone?: Tone; align?: string; weight?: number; spacing?: number } = {},
  ) {
    const { at = 0, tone = "ink", align = "left", weight = 400, spacing = 0.08 } = o;
    const n = Math.floor((t - at) / 0.035);
    if (n <= 0) return;
    ctx.save();
    ctx.font = `${weight} ${Math.round(size * u)}px ${MONO}`;
    ctx.letterSpacing = `${spacing * size * u}px`;
    ctx.fillStyle = LINE[tone];
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.textAlign = "left";
    ctx.fillText(s.slice(0, n), left, y);
    ctx.restore();
  }

  return {
    surface() {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      // A faint axis along the foot of the frame.
      ctx.strokeStyle = "rgba(242,242,238,0.18)";
      ctx.lineWidth = 1 * u;
      ctx.beginPath();
      ctx.moveTo(W * 0.04, H * 0.9);
      ctx.lineTo(W * 0.96, H * 0.9);
      ctx.stroke();
      for (let i = 0; i <= 16; i++) {
        const x = W * (0.04 + (0.92 * i) / 16);
        ctx.beginPath();
        ctx.moveTo(x, H * 0.9);
        ctx.lineTo(x, H * 0.9 + 6 * u);
        ctx.stroke();
      }
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.08, size = 34, at = 0, align = "left" } = o;
      typed(s.toUpperCase(), X(x), Y(y), size, { at, align, weight: 700, spacing: 0.22 });
    },
    label(s, x, y, o = {}) {
      typed(s.toLowerCase(), X(x), Y(y), o.size ?? 26, {
        at: o.at,
        tone: o.tone === "muted" ? "muted" : "ink",
        align: o.align ?? "center",
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.3 } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const R = r * u;
      // A tiny trace with a pulse, inside a hairline ring.
      ctx.save();
      trace(ctx, along(ellipse(X(x), Y(y), R, R, 40), p).points);
      ctx.fillStyle = BG;
      ctx.fill();
      ctx.strokeStyle = LINE[o.tone ?? "ink"];
      ctx.lineWidth = 1.4 * u;
      ctx.stroke();
      ctx.restore();
      ridge(
        X(x) - R * 0.7,
        X(x) + R * 0.7,
        Y(y) + R * 0.3,
        R * 0.75,
        x * 91 + y * 37,
        clamp(p * 1.4 - 0.3),
      );
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      // Hairline rows printed top to bottom, the model's empty tape.
      ctx.save();
      ctx.fillStyle = BG;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      const rows = Math.floor((y1 - y0) / (5 * u));
      ctx.strokeStyle = "rgba(242,242,238,0.22)";
      ctx.lineWidth = 1 * u;
      for (let i = 0; i < rows * p; i++) {
        const yy = y0 + (i + 0.5) * ((y1 - y0) / rows);
        ctx.beginPath();
        ctx.moveTo(x0, yy);
        ctx.lineTo(x1, yy);
        ctx.stroke();
      }
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const { points, angle } = along(pts, expo(p));
      ctx.save();
      ctx.strokeStyle = LINE[tone];
      ctx.globalAlpha = head ? 1 : 0.45;
      ctx.lineWidth = (head ? 1.6 : 1) * u;
      if (tone === "bad") ctx.setLineDash([6 * u, 5 * u]);
      trace(ctx, points);
      ctx.stroke();
      ctx.setLineDash([]);
      if (head && p >= 1) {
        arrowhead(ctx, pts.at(-1) as Pt, angle, 10 * u);
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      if (t < at) return;
      // A stack of traces, the back one first, each hiding the one behind.
      const n = 14;
      const gap = Y(h) / (n + 2);
      for (let i = 0; i < n; i++) {
        const p = progress(t, at + (i / n) * dur * 0.6, dur * 0.4);
        ridge(
          X(x),
          X(x + w),
          Y(y) + gap * (i + 2.5),
          gap * (2 + hash(i) * 2.5),
          i * 13.7 + x * 50,
          p,
          0.35 + hash(i + 4) * 0.3,
        );
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${MONO}`;
      ctx.fillStyle = LINE[tone];
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = clamp((t - at) / 0.15);
      ctx.fillText(value, X(x), Y(y));
      const w = ctx.measureText(value).width;
      ctx.restore();
      if (sub) {
        typed(sub.toUpperCase(), X(x), Y(y) - size * 0.8 * u, size * 0.2, {
          at: at + 0.1,
          align: "center",
          spacing: 0.25,
        });
        const p = progress(t, at + 0.3, 0.4);
        ctx.strokeStyle = LINE.ink;
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.moveTo(X(x) - w / 2, Y(y) + size * 0.55 * u);
        ctx.lineTo(X(x) - w / 2 + w * expo(p), Y(y) + size * 0.55 * u);
        ctx.stroke();
      }
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 22) * u;
      const p = progress(t, o.at ?? 0, 0.25);
      if (p <= 0) return;
      const [cx, cy] = [X(x), Y(y)];
      const path: Pt[] =
        kind === "check"
          ? [
              [cx - s * 0.5, cy],
              [cx - s * 0.15, cy + s * 0.4],
              [cx + s * 0.55, cy - s * 0.45],
            ]
          : [
              [cx - s * 0.45, cy - s * 0.45],
              [cx + s * 0.45, cy + s * 0.45],
              [cx, cy],
              [cx + s * 0.45, cy - s * 0.45],
              [cx - s * 0.45, cy + s * 0.45],
            ];
      ctx.save();
      trace(ctx, along(path, p).points);
      ctx.strokeStyle = LINE.ink;
      ctx.lineWidth = 2 * u;
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      if (!pen) return;
      // The recorder's stylus: a bright dot at the tip of the trace being plotted.
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(pen[0], pen[1], 3 * u, 0, Math.PI * 2);
      ctx.fill();
    },
  };
}

export default {
  id: "ridgeline",
  name: "Ridgeline",
  category: "Data & Information",
  make,
} satisfies Style;
