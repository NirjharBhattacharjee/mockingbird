// Math animation: pure black, crisp thin vector lines, a small palette of
// blue, teal, yellow, red and green, serif type with italic variables. Lines
// are created along their length, text is written outline first and then
// filled, and a finished element flashes yellow once to point at itself.
import {
  along,
  clamp,
  counting,
  curve,
  ellipse,
  frame,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const COL: Record<Tone, string> = {
  ink: "#FFFFFF",
  accent: "#58C4DD",
  good: "#83C167",
  bad: "#FC6255",
  muted: "#888888",
};
const YELLOW = "#FFFF00";
const SERIF = '"CMU Serif", "Latin Modern Roman", "Times New Roman", Times, Georgia, serif';

/** The smooth S-curve every animation here runs on. */
const smooth = (p: number) => {
  const x = clamp(p);
  return x * x * (3 - 2 * x);
};

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);

  /** Draw a path created along its length from `at` over `dur`. */
  function create(points: Pt[], at: number, dur: number, color: string, width = 3) {
    const p = smooth(progress(t, at, dur));
    if (p <= 0) return null;
    const res = along(points, p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    trace(ctx, res.points);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
    return res;
  }

  /** Text written on: the outline sweeps in left to right, then the fill fades up behind it. */
  function write(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    at: number,
    dur: number,
    align = "left",
    italic = false,
  ) {
    const p = progress(t, at, dur);
    if (p <= 0) return;
    ctx.save();
    ctx.font = `${italic ? "italic " : ""}400 ${Math.round(size * u)}px ${SERIF}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 4 * u, y - size * u, (w + 8 * u) * smooth(clamp(p * 1.4)), size * 2 * u);
    ctx.clip();
    ctx.lineWidth = 1.2 * u;
    ctx.strokeStyle = color;
    ctx.strokeText(s, left, y);
    ctx.globalAlpha = smooth(clamp((p - 0.45) / 0.55));
    ctx.fillStyle = color;
    ctx.fillText(s, left, y);
    ctx.restore();
  }

  /** A short yellow pulse once something lands: scale up and back, tinted yellow. */
  function indicate(at: number) {
    const k = clamp((t - at) / 0.5);
    const bump = k > 0 && k < 1 ? Math.sin(k * Math.PI) : 0;
    return { scale: 1 + 0.18 * bump, tint: bump };
  }

  function mix(color: string, tint: number) {
    return tint > 0.35 ? YELLOW : color;
  }

  return {
    surface() {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, W, H);
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.07, size = 44, at = 0, dur = 0.9, align = "left" } = o;
      // The idea word (the second) in yellow, the rest white, like a coloured term in an equation.
      const words = s.split(" ");
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${SERIF}`;
      const full = ctx.measureText(s).width;
      let cx = align === "center" ? X(x) - full / 2 : align === "right" ? X(x) - full : X(x);
      const space = ctx.measureText(" ").width;
      words.forEach((w, i) => {
        const ww = ctx.measureText(w).width;
        const color = i === words.length - 1 ? COL.accent : i === 1 ? YELLOW : COL.ink;
        write(w, cx, Y(y), size, color, at + (i * dur) / words.length, dur / words.length + 0.25);
        cx += ww + space;
      });
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, tone = "ink", align = "center" } = o;
      write(s, X(x), Y(y), size, COL[tone], at, o.dur ?? 0.04 * s.length + 0.3, align);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      const cx = X(x);
      const cy = Y(y);
      const R = r * 0.8 * u;
      const ring = create(ellipse(cx, cy, R, R, 40, -Math.PI / 2, 1), at, dur, COL.ink, 2.5);
      if (!ring) return;
      // Activation: the neuron fills grey, the idea ones a little brighter.
      const f = smooth(progress(t, at + dur, 0.4));
      if (f > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, R - 1.5 * u, 0, Math.PI * 2);
        ctx.fillStyle =
          tone === "accent" ? `rgba(255,255,255,${0.55 * f})` : `rgba(88,196,221,${0.5 * f})`;
        ctx.fill();
      }
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "ink" } = o;
      const a: Pt = [X(x), Y(y)];
      const b: Pt = [X(x + w), Y(y + h)];
      const ind = indicate(at + dur);
      create(
        [a, [b[0], a[1]], b, [a[0], b[1]], a],
        at,
        dur,
        mix(tone === "ink" ? COL.ink : COL[tone], ind.tint),
        3,
      );
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const a: Pt = [X(x1), Y(y1)];
      const b: Pt = [X(x2), Y(y2)];
      // Weights: a soft blue or red by direction, the way a network's edges show their sign.
      const color =
        !head && tone === "accent"
          ? (x1 * 31 + y1 * 17 + y2 * 13) % 1 > 0.5
            ? "#58C4DDAA"
            : "#FC6255AA"
          : COL[tone];
      const res = create(curve(a, b, bend, 32), at, dur, color, head ? 3 : 1.6);
      if (!res || !head || progress(t, at, dur) < 1) return;
      const tip = res.points.at(-1) as Pt;
      const s = 16 * u;
      ctx.beginPath();
      ctx.moveTo(tip[0], tip[1]);
      ctx.lineTo(tip[0] - Math.cos(res.angle - 0.42) * s, tip[1] - Math.sin(res.angle - 0.42) * s);
      ctx.lineTo(tip[0] - Math.cos(res.angle + 0.42) * s, tip[1] - Math.sin(res.angle + 0.42) * s);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    },
    store(x, y, w, h, o = {}) {
      // Data as a column vector: brackets created first, then its entries written in.
      const { at = 0, dur = 0.8, tone = "ink" } = o;
      const l = X(x);
      const r = X(x + w);
      const top = Y(y);
      const bot = Y(y + h);
      const lip = X(w) * 0.18;
      create(
        [
          [l + lip, top],
          [l, top],
          [l, bot],
          [l + lip, bot],
        ],
        at,
        dur * 0.5,
        COL[tone],
        3,
      );
      create(
        [
          [r - lip, top],
          [r, top],
          [r, bot],
          [r - lip, bot],
        ],
        at,
        dur * 0.5,
        COL[tone],
        3,
      );
      const rows = ["x₁", "x₂", "⋮", "xₙ"];
      rows.forEach((s, i) => {
        write(
          s,
          (l + r) / 2,
          top + ((bot - top) * (i + 0.5)) / rows.length,
          30,
          COL.accent,
          at + dur * 0.4 + i * 0.08,
          0.3,
          "center",
          true,
        );
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      const p = progress(t, at, 0.4);
      if (p <= 0) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const done = count ? at + dur : at + 0.4;
      const ind = indicate(done);
      const color = tone === "accent" ? YELLOW : COL[tone];
      ctx.save();
      ctx.translate(X(x), Y(y));
      ctx.scale(ind.scale, ind.scale);
      ctx.globalAlpha = smooth(p);
      ctx.font = `700 ${Math.round(size * u)}px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.fillText(value, 0, 0);
      ctx.restore();
      if (sub)
        write(sub, X(x), Y(y) - size * 0.85 * u, size * 0.32, COL.ink, at + 0.2, 0.5, "center");
      // A surrounding rectangle drawn round the big result once it settles.
      if (count && size >= 80) {
        ctx.save();
        ctx.font = `700 ${Math.round(size * u)}px ${SERIF}`;
        const tw = ctx.measureText(value).width;
        ctx.restore();
        const pad = 16 * u;
        const a: Pt = [X(x) - tw / 2 - pad, Y(y) - size * 0.55 * u];
        const b: Pt = [X(x) + tw / 2 + pad, Y(y) + size * 0.55 * u];
        create([a, [b[0], a[1]], b, [a[0], b[1]], a], done + 0.2, 0.6, YELLOW, 3);
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const s = (o.size ?? 30) * u;
      const cx = X(x);
      const cy = Y(y);
      if (kind === "check")
        create(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.12, cy + s * 0.4],
            [cx + s * 0.55, cy - s * 0.5],
          ],
          at,
          0.35,
          COL.good,
          4,
        );
      else {
        create(
          [
            [cx - s * 0.45, cy - s * 0.45],
            [cx + s * 0.45, cy + s * 0.45],
          ],
          at,
          0.2,
          COL.bad,
          4,
        );
        create(
          [
            [cx + s * 0.45, cy - s * 0.45],
            [cx - s * 0.45, cy + s * 0.45],
          ],
          at + 0.2,
          0.2,
          COL.bad,
          4,
        );
      }
    },
    finish() {},
  };
}

export default {
  id: "math-anim",
  name: "Math animation",
  category: "Popular Explainer Looks",
  make,
} satisfies Style;
