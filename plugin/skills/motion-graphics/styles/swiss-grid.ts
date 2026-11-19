// International typographic poster: off-white sheet on a strict twelve
// column grid, red, black and white only, a big tight grotesk set flush
// left, hairline rules with solid heads, and a red disc ringed by arc
// segments that turn and lock in place. Rules draw out along the grid, type
// rises out of its baseline, blocks step in column by column.
import {
  clamp,
  counting,
  curve,
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

const PAPER = "#EFEEEA";
const BLACK = "#111111";
const RED = "#E1251B";
const TONE: Record<Tone, string> = {
  ink: BLACK,
  accent: BLACK,
  good: BLACK,
  bad: RED,
  muted: "#8C8C88",
};
const GROTESK = '"Inter", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const font = (size: number, w = 700) => `${w} ${Math.round(size * u)}px ${GROTESK}`;
  const ease = (at = 0, dur = 0.5) => expo(progress(t, at, dur));

  /** Type rising out of a mask at its baseline. */
  function rise(
    s: string,
    x: number,
    y: number,
    size: number,
    at: number,
    dur: number,
    color: string,
    align = "left",
    w = 700,
  ) {
    const p = ease(at, dur);
    if (p <= 0) return;
    ctx.save();
    ctx.font = font(size, w);
    ctx.letterSpacing = `${Math.round(-size * 0.03 * u)}px`;
    const tw = ctx.measureText(s).width;
    const left = align === "center" ? x - tw / 2 : align === "right" ? x - tw : x;
    ctx.beginPath();
    ctx.rect(left - 10 * u, y - size * 0.9 * u, tw + 20 * u, size * 1.15 * u);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(s, left, y + (1 - p) * size * u);
    ctx.restore();
  }

  function rule(x1: number, y1: number, x2: number, p: number, w = 1.5, color = BLACK) {
    if (p <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(x1, y1, (x2 - x1) * p, w * u);
  }

  return {
    surface() {
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      // the twelve-column grid, faint
      const gp = ease(0, 0.9);
      ctx.fillStyle = "rgba(17,17,17,0.08)";
      for (let c = 0; c <= 12; c++) ctx.fillRect(X(0.03 + (0.94 / 12) * c), 0, 1 * u, H * gp);
      rule(X(0.03), Y(0.035), X(0.97), ease(0, 0.8), 2);
      // the disc and its ring segments, turning and settling on a 22.5 degree module
      const d = ease(0.2, 0.7);
      if (d > 0) {
        const [cx, cy] = [X(0.9), Y(0.16)];
        ctx.beginPath();
        ctx.arc(cx, cy, 58 * u * d, 0, Math.PI * 2);
        ctx.fillStyle = RED;
        ctx.fill();
        ctx.strokeStyle = BLACK;
        ctx.lineCap = "butt";
        for (let i = 0; i < 4; i++) {
          const settle = expo(progress(t, 0.4 + i * 0.15, 1.6));
          const base = Math.round(hash(i * 3.7) * 16) * (Math.PI / 8);
          const a = base + (1 - settle) * (2 + i) + Math.sin(t * 0.4 + i) * 0.04;
          ctx.lineWidth = (7 - i) * u;
          ctx.beginPath();
          ctx.arc(
            cx + 10 * u,
            cy - 6 * u,
            (32 + i * 13) * u,
            a,
            a + Math.PI * (0.5 + hash(i) * 0.5),
          );
          ctx.stroke();
        }
      }
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.15, size = 84, at = 0, dur = 0.7, align = "left" } = o;
      rise(s, X(x), Y(y), size, at, dur, BLACK, align);
    },
    label(s, x, y, o = {}) {
      const { size = 34, align = "center", tone = "ink", at = 0 } = o;
      rise(s, X(x), Y(y) + size * 0.35 * u, size, at, 0.4, TONE[tone], align, 600);
      // a short rule above, red when it is the key word
      ctx.font = font(size, 600);
      const tw = ctx.measureText(s).width;
      const left = align === "center" ? X(x) - tw / 2 : align === "right" ? X(x) - tw : X(x);
      rule(left, Y(y) - size * 0.85 * u, left + tw, ease(at, 0.4), 2, tone === "bad" ? RED : BLACK);
    },
    node(x, y, r, o = {}) {
      const p = ease(o.at, 0.35);
      if (p <= 0) return;
      const R = r * u * 0.55 * p;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
      ctx.fillStyle = PAPER;
      ctx.fill();
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = o.tone === "bad" ? RED : BLACK;
      ctx.stroke();
      if (o.tone === "good" || o.tone === "bad") {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = TONE[o.tone];
        ctx.fill();
      }
    },
    box(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const p = ease(at, 0.6);
      if (p <= 0) return;
      // a heavy rule on top and a hairline frame, stepping in from the left
      rule(X(x), Y(y), X(x + w), p, 7, o.tone === "bad" ? RED : BLACK);
      const q = ease(at + 0.15, 0.5);
      ctx.strokeStyle = BLACK;
      ctx.lineWidth = 1.2 * u;
      ctx.beginPath();
      ctx.moveTo(X(x), Y(y));
      ctx.lineTo(X(x), Y(y) + Y(h) * q);
      ctx.moveTo(X(x + w), Y(y));
      ctx.lineTo(X(x + w), Y(y) + Y(h) * q);
      ctx.stroke();
      rule(X(x), Y(y + h), X(x + w), q, 1.2);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const p = ease(at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      trace(ctx, shown);
      ctx.strokeStyle = TONE[tone];
      ctx.lineWidth = (head ? 2.5 : 1.2) * u;
      ctx.stroke();
      if (head && p >= 0.98) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 14 * u;
        ctx.beginPath();
        ctx.moveTo(end[0], end[1]);
        ctx.lineTo(end[0] - Math.cos(a - 0.4) * s, end[1] - Math.sin(a - 0.4) * s);
        ctx.lineTo(end[0] - Math.cos(a + 0.4) * s, end[1] - Math.sin(a + 0.4) * s);
        ctx.closePath();
        ctx.fillStyle = TONE[tone];
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      // a block of small black cells filling column by column
      const at = o.at ?? 0;
      const dur = o.dur ?? 0.8;
      // A store with no width or height has nothing to fill, and would divide by zero.
      if (X(w) <= 0 || Y(h) <= 0) return;
      const cols = 4;
      const cw = X(w) / cols;
      const rows = Math.max(3, Math.floor(Y(h) / cw));
      const ch = Y(h) / rows;
      for (let c = 0; c < cols; c++)
        for (let r = 0; r < rows; r++) {
          const p = progress(t, at + (c / cols) * dur * 0.7 + r * 0.02, 0.15);
          if (p <= 0) continue;
          ctx.fillStyle = (c + r * 3) % 7 === 0 ? RED : BLACK;
          const s = clamp(p) * 0.72;
          ctx.fillRect(
            X(x) + cw * c + (cw * (1 - s)) / 2,
            Y(y) + ch * r + (ch * (1 - s)) / 2,
            cw * s,
            ch * s,
          );
        }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "ink" } = o;
      const str = count ? counting(t, at, dur, count) + s : s;
      const color = sub ? RED : TONE[tone];
      rise(str, X(x), Y(y) + size * 0.36 * u, size * 1.1, at, 0.5, color, "center", 800);
      if (sub) {
        rise(sub, X(x), Y(y) + size * 0.95 * u, size * 0.34, at + 0.2, 0.4, BLACK, "center", 600);
        ctx.font = font(size * 1.1, 800);
        const w = ctx.measureText(`${count ? count[1] : ""}${s}`).width;
        rule(X(x) - w / 2, Y(y) - size * 0.75 * u, X(x) + w / 2, ease(at, 0.6), 2);
      }
    },
    mark(kind, x, y, o = {}) {
      const p = ease(o.at, 0.35);
      if (p <= 0) return;
      const r = (o.size ?? 26) * u;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.strokeStyle = kind === "check" ? BLACK : RED;
      ctx.lineWidth = 5 * u;
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      if (kind === "check") {
        const pts: Pt[] = [
          [cx - r * 0.6, cy],
          [cx - r * 0.15, cy + r * 0.45],
          [cx + r * 0.7, cy - r * 0.6],
        ];
        trace(ctx, pts.slice(0, p < 0.5 ? 2 : 3));
      } else {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.55, cy - r * 0.55);
        ctx.lineTo(cx + r * 0.55, cy + r * 0.55);
        if (p > 0.5) {
          ctx.moveTo(cx + r * 0.55, cy - r * 0.55);
          ctx.lineTo(cx - r * 0.55, cy + r * 0.55);
        }
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {},
  };
}

export default {
  id: "swiss-grid",
  name: "Swiss grid",
  category: "Art & Design Movements",
  make,
} satisfies Style;
