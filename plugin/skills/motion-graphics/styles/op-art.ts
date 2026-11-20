// Optical art: a hard-edged black and ivory checkerboard that swells into a
// lens and ripples at its margins, with red cells flipping in at the centre.
// Words sit on hard black slabs; pieces flip in like cards turning over, and
// numbers sit on ivory bands in a heavy grotesque.
import {
  alpha,
  arrowhead,
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
  spring,
  type Tone,
  trace,
} from "./look.ts";

const IVORY = "#F1ECDF";
const BLACK = "#121212";
const RED = "#D7261E";
const SLAB: Record<Tone, string> = {
  ink: BLACK,
  accent: RED,
  good: BLACK,
  bad: RED,
  muted: "#6B6B6B",
};
const HEAVY = '"Archivo Black", "Noto Color Emoji", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const lens = { x: W * 0.34, y: H * 0.42, r: H * 0.3 * spring(t, { stiffness: 70, damping: 9 }) };

  /** Where a flat grid point lands once the lens swells and the field ripples. */
  function warp(x: number, y: number): Pt {
    const dx = x - lens.x;
    const dy = y - lens.y;
    const d = Math.hypot(dx, dy) || 1;
    let k = 1;
    if (lens.r > 1 && d < lens.r) k = (lens.r * (d / lens.r) ** 0.55) / d;
    const ripple = Math.sin(d / (60 * u) - t * 2.4) * 5 * u * clamp((d - lens.r) / (200 * u));
    return [lens.x + dx * k + (dx / d) * ripple, lens.y + dy * k + (dy / d) * ripple];
  }

  /** Flip in like a card turning: squash horizontally about (cx, cy). */
  function flipped(cx: number, cy: number, at: number | undefined, draw: () => void) {
    const p = progress(t, at ?? 0, 0.28);
    if (p <= 0) return;
    const s = Math.abs(Math.cos((1 - expo(p)) * Math.PI * 0.5 * 2)) * 0.999 + 0.001;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(p < 0.5 ? Math.max(0.02, expo(p)) : s, 1);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }

  /** A hard slab with heavy uppercase type, centred unless aligned. */
  function slab(
    s: string,
    cx: number,
    cy: number,
    size: number,
    fill: string,
    ink = IVORY,
    align = "center",
  ) {
    ctx.font = `900 ${Math.round(size * u)}px ${HEAVY}`;
    const w = ctx.measureText(s).width + size * 0.9 * u;
    const h = size * 1.55 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    ctx.fillStyle = fill;
    ctx.fillRect(left, cy - h / 2, w, h);
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + w / 2, cy + u);
    return { left, w, h };
  }

  return {
    surface() {
      ctx.fillStyle = IVORY;
      ctx.fillRect(0, 0, W, H);
      const s = 44 * u;
      const cols = Math.ceil(W / s) + 2;
      const rows = Math.ceil(H / s) + 2;
      const redP = progress(t, 0.8, 1.6);
      for (let j = -1; j < rows; j++)
        for (let i = -1; i < cols; i++) {
          if ((i + j) % 2 === 0) continue;
          const x = i * s;
          const y = j * s;
          const q = [warp(x, y), warp(x + s, y), warp(x + s, y + s), warp(x, y + s)];
          const cx = x + s / 2 - lens.x;
          const cy = y + s / 2 - lens.y;
          const d = Math.hypot(cx, cy);
          // Red cells flip in from the centre outward.
          const red = d < H * 0.2 * redP && hash(i * 7.3 + j * 3.1) > 0.5;
          ctx.fillStyle = red ? RED : BLACK;
          trace(ctx, q, true);
          ctx.fill();
        }
    },
    title(s, o = {}) {
      const { x = 0.025, y = 0.07, size = 34, at = 0, align = "left" } = o;
      const p = progress(t, at, o.dur ?? 0.5);
      if (p <= 0) return;
      ctx.save();
      ctx.font = `900 ${Math.round(size * u)}px ${HEAVY}`;
      const w = ctx.measureText(s.toUpperCase()).width + size * 0.9 * u;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      ctx.beginPath();
      ctx.rect(left, 0, w * expo(p), H);
      ctx.clip();
      const r = slab(s.toUpperCase(), left, Y(y), size, BLACK, IVORY, "left");
      ctx.fillStyle = RED;
      ctx.fillRect(r.left, Y(y) + r.h / 2, r.w, 6 * u);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      flipped(X(x), Y(y), o.at, () =>
        slab(
          s.toUpperCase(),
          X(x),
          Y(y),
          o.size ?? 28,
          SLAB[o.tone ?? "ink"],
          IVORY,
          o.align ?? "center",
        ),
      );
    },
    node(x, y, r, o = {}) {
      const tone = o.tone ?? "accent";
      flipped(X(x), Y(y), o.at, () => {
        // A bullseye of hard rings.
        const R = r * u * 1.2;
        const rings = [IVORY, BLACK, IVORY, tone === "accent" || tone === "bad" ? RED : BLACK];
        for (const [k, col] of rings.entries()) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(X(x), Y(y), R * (1 - k * 0.22), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = BLACK;
        ctx.lineWidth = 2.5 * u;
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
        ctx.stroke();
      });
    },
    box(x, y, w, h, o = {}) {
      flipped(X(x + w / 2), Y(y + h / 2), o.at, () => {
        const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
        ctx.fillStyle = IVORY;
        ctx.fillRect(x0, y0, bw, bh);
        ctx.strokeStyle = BLACK;
        ctx.lineWidth = 5 * u;
        ctx.strokeRect(x0, y0, bw, bh);
        ctx.fillStyle = o.tone === "bad" || o.tone === "accent" ? RED : BLACK;
        ctx.fillRect(x0, y0 + bh - 10 * u, bw, 10 * u);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.3, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * expo(p))));
      const col = tone === "ink" || tone === "accent" || tone === "bad" ? RED : BLACK;
      ctx.save();
      ctx.lineCap = "butt";
      trace(ctx, shown);
      ctx.strokeStyle = IVORY;
      ctx.lineWidth = (head ? 9 : 4) * u;
      ctx.stroke();
      trace(ctx, shown);
      ctx.strokeStyle = head ? col : alpha(BLACK, 0.85);
      ctx.lineWidth = (head ? 4 : 1.5) * u;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 18 * u, false);
        ctx.fillStyle = col;
        ctx.strokeStyle = IVORY;
        ctx.lineWidth = 2.5 * u;
        ctx.stroke();
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6 } = o;
      // An ivory panel of black stripes that crowd together toward the foot.
      flipped(X(x + w / 2), Y(y + h / 2), at, () => {
        const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
        ctx.fillStyle = IVORY;
        ctx.fillRect(x0, y0, bw, bh);
        const n = 9;
        const shown = Math.ceil(n * progress(t, at + 0.1, dur));
        for (let i = 0; i < shown; i++) {
          const f0 = (i / n) ** 0.7;
          const f1 = ((i + 0.5) / n) ** 0.7;
          ctx.fillStyle = i === n - 1 ? RED : BLACK;
          ctx.fillRect(x0, y0 + bh * f0, bw, bh * (f1 - f0));
        }
        ctx.strokeStyle = BLACK;
        ctx.lineWidth = 4 * u;
        ctx.strokeRect(x0, y0, bw, bh);
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      flipped(X(x), Y(y), at, () => {
        const value = count ? counting(t, at, dur, count) + s : s;
        ctx.font = `900 ${Math.round(size * u)}px ${HEAVY}`;
        const w = Math.max(ctx.measureText(`${value}0`).width, size * 2 * u);
        const h = size * 1.2 * u;
        ctx.fillStyle = IVORY;
        ctx.fillRect(X(x) - w / 2, Y(y) - h / 2, w, h);
        ctx.fillStyle = BLACK;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(value, X(x), Y(y) + 2 * u);
        if (tone === "accent" && t > at + dur) {
          const q = progress(t, at + dur, 0.3);
          ctx.strokeStyle = RED;
          ctx.lineWidth = 4 * u;
          ctx.beginPath();
          ctx.ellipse(
            X(x),
            Y(y),
            w * 0.48,
            h * 0.55,
            0,
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * q,
          );
          ctx.stroke();
        }
        if (sub) slab(sub.toUpperCase(), X(x), Y(y) - h / 2 - size * 0.2 * u, size * 0.24, BLACK);
      });
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 22) * u;
      flipped(X(x), Y(y), o.at, () => {
        const [cx, cy] = [X(x), Y(y)];
        ctx.fillStyle = kind === "check" ? BLACK : RED;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        ctx.strokeStyle = IVORY;
        ctx.lineWidth = r * 0.24;
        ctx.lineJoin = "miter";
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.5, cy],
            [cx - r * 0.12, cy + r * 0.38],
            [cx + r * 0.55, cy - r * 0.4],
          ]);
        else
          trace(ctx, [
            [cx - r * 0.45, cy - r * 0.45],
            [cx + r * 0.45, cy + r * 0.45],
            [cx, cy],
            [cx + r * 0.45, cy - r * 0.45],
            [cx - r * 0.45, cy + r * 0.45],
          ]);
        ctx.stroke();
      });
    },
    finish() {},
  };
}

export default {
  id: "op-art",
  name: "Op art",
  category: "Generative & Type",
  make,
} satisfies Style;
