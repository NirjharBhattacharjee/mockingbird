// Silkscreen pop grid: garish flat flood panels on a cream wall, loose
// hand-cut colour shapes that never line up, and a grainy black screen
// pulled over them. Each element prints in three passes: the colour shape
// slaps down off-register, then the squeegee drags the black across it
// left to right with a wet edge.
import {
  along,
  clamp,
  counting,
  curve,
  ellipse,
  frame,
  hash,
  type Look,
  type Pt,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const WALL = "#ECE6DA";
const BLACK = "#161412";
const PLATE: Record<Tone, string> = {
  ink: "#FFE14D",
  accent: "#FF4FA3",
  good: "#B8F04A",
  bad: "#FF3B30",
  muted: "#8FD7F0",
};
const PANELS: [number, number, number, number, string][] = [
  [0.025, 0.2, 0.17, 0.66, "#FF5FAE"],
  [0.205, 0.2, 0.555, 0.66, "#22C1C8"],
  [0.77, 0.2, 0.205, 0.66, "#FF8A1F"],
];
const STENCIL = '"Impact", "Haettenschweiler", "Bebas Neue", "Arial Narrow", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__silkGrain ??= new Map();
  const cache: Map<string, any> = g.__silkGrain;

  /** How far the squeegee has dragged the black screen across, left to right. */
  const pull = (at: number) => clamp((t - at - 0.15) / 0.3);

  /** The colour plate slaps down: it appears at full size with a little jolt. */
  function slap(at: number) {
    const p = clamp((t - at) / 0.1);
    return { on: p > 0, s: 1 + (1 - p) * 0.06 };
  }

  /** Clip what follows to the part of [x, x+w] the squeegee has reached, and draw the wet edge. */
  function squeegee(x: number, y: number, w: number, h: number, at: number, draw: () => void) {
    const p = pull(at);
    if (p <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 20 * u, y - 20 * u, (w + 40 * u) * p, h + 40 * u);
    ctx.clip();
    draw();
    ctx.restore();
    if (p < 1) {
      // The bead of wet ink riding the squeegee blade.
      ctx.fillStyle = "rgba(22,20,18,0.8)";
      ctx.fillRect(x - 20 * u + (w + 40 * u) * p - 3 * u, y - 20 * u, 6 * u, h + 40 * u);
    }
  }

  function grainTile() {
    const key = `${W}x${H}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      // Squeegee streaks and screen grain, in wall colour, laid over the ink.
      for (let i = 0; i < (W * H) / 70; i++) {
        c.fillStyle = `rgba(236,230,218,${0.15 + 0.35 * hash(i * 0.91)})`;
        c.fillRect(hash(i * 1.53) * W, hash(i * 2.17) * H, 1.5, 1.5);
      }
      for (let i = 0; i < 30; i++) {
        c.fillStyle = "rgba(255,255,255,0.06)";
        c.fillRect(0, hash(i * 7.9) * H, W, 1 + hash(i) * 3);
      }
      cache.set(key, tile);
    }
    return tile;
  }

  function stencil(s: string, x: number, y: number, size: number, color: string, align = "center") {
    ctx.font = `400 ${Math.round(size * u)}px ${STENCIL}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(s.toUpperCase(), x, y);
  }

  /** A hand-cut shape: a rectangle with slightly uneven corners. */
  function cut(x: number, y: number, w: number, h: number, seed: number) {
    const j = (k: number) => (hash(seed + k) - 0.5) * 6 * u;
    trace(
      ctx,
      [
        [x + j(1), y + j(2)],
        [x + w + j(3), y + j(4)],
        [x + w + j(5), y + h + j(6)],
        [x + j(7), y + h + j(8)],
      ],
      true,
    );
  }

  return {
    surface() {
      ctx.fillStyle = WALL;
      ctx.fillRect(0, 0, W, H);
      // Flood panels, the first pass of every print on the wall.
      for (const [x, y, w, h, c] of PANELS) {
        ctx.fillStyle = c;
        ctx.fillRect(X(x), Y(y), X(w), Y(h));
      }
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.09, size = 54, at = 0 } = o;
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${STENCIL}`;
      const w = ctx.measureText(s.toUpperCase()).width + 30 * u;
      ctx.restore();
      const h = size * 1.3 * u;
      const { on } = slap(at);
      if (!on) return;
      ctx.fillStyle = PLATE.ink;
      cut(X(x) + 6 * u, Y(y) - h / 2 + 4 * u, w, h, 3);
      ctx.fill();
      squeegee(X(x), Y(y) - h / 2, w, h, at, () =>
        stencil(s, X(x) + 15 * u, Y(y), size, BLACK, "left"),
      );
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 26, tone = "ink", align = "center" } = o;
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${STENCIL}`;
      const w = ctx.measureText(s.toUpperCase()).width + 18 * u;
      ctx.restore();
      const h = size * 1.3 * u;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      if (!slap(at).on) return;
      ctx.fillStyle = tone === "ink" ? "#F6F1E4" : PLATE[tone];
      cut(left + 4 * u, Y(y) - h / 2 + 3 * u, w, h, x * 77);
      ctx.fill();
      squeegee(left, Y(y) - h / 2, w, h, at, () => stencil(s, left + w / 2, Y(y), size, BLACK));
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const R = r * u;
      const cx = X(x);
      const cy = Y(y);
      const { on, s } = slap(at);
      if (!on) return;
      // Off-register colour disc.
      ctx.beginPath();
      ctx.arc(cx + 5 * u, cy - 4 * u, R * s, 0, Math.PI * 2);
      ctx.fillStyle = PLATE[tone === "accent" ? "ink" : tone];
      ctx.fill();
      squeegee(cx - R, cy - R, R * 2, R * 2, at - 0.1, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.lineWidth = 4 * u;
        ctx.strokeStyle = BLACK;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx - R * 0.15, cy + R * 0.1, R * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = BLACK;
        ctx.fill();
      });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
      if (!slap(at).on) return;
      ctx.fillStyle = "#F6F1E4";
      cut(l, tp, ww, hh, x * 19);
      ctx.fill();
      ctx.fillStyle = PLATE[tone];
      cut(l + ww * 0.08 + 7 * u, tp + hh * 0.55, ww * 0.84, hh * 0.32, x * 23);
      ctx.fill();
      squeegee(l, tp, ww, hh, at, () => {
        ctx.lineWidth = 5 * u;
        ctx.strokeStyle = BLACK;
        ctx.strokeRect(l - 3 * u, tp + 3 * u, ww, hh);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      // Fat black arrows painted across the panels.
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = clamp((t - at) / dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 28);
      const res = along(pts, p);
      const color = tone === "bad" ? PLATE.bad : BLACK;
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = color;
      ctx.globalAlpha = head ? 1 : 0.6;
      ctx.lineWidth = (head ? 6 : 1.8) * u;
      trace(ctx, res.points);
      ctx.stroke();
      if (tone === "bad") {
        ctx.strokeStyle = BLACK;
        ctx.lineWidth = 2 * u;
        trace(
          ctx,
          res.points.map(([px, py]) => [px - 3 * u, py + 3 * u] as Pt),
        );
        ctx.stroke();
      }
      if (head && p >= 1) {
        const tip = pts.at(-1) as Pt;
        const s = 22 * u;
        trace(
          ctx,
          [
            [tip[0] + Math.cos(res.angle) * 4 * u, tip[1] + Math.sin(res.angle) * 4 * u],
            [tip[0] - Math.cos(res.angle - 0.5) * s, tip[1] - Math.sin(res.angle - 0.5) * s],
            [tip[0] - Math.cos(res.angle + 0.5) * s, tip[1] - Math.sin(res.angle + 0.5) * s],
          ],
          true,
        );
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      // A grid of picture cards, printed one after another.
      const { at = 0, dur = 0.8 } = o;
      const cols = 2;
      const rows = 3;
      const cw = X(w) / cols;
      const ch = Y(h) / rows;
      for (let i = 0; i < cols * rows; i++) {
        const l = X(x) + (i % cols) * cw;
        const tp = Y(y) + Math.floor(i / cols) * ch;
        const a = at + (i * dur) / (cols * rows + 2);
        if (!slap(a).on) continue;
        ctx.fillStyle = "#F6F1E4";
        cut(l + 2 * u, tp + 2 * u, cw - 4 * u, ch - 4 * u, i * 5 + x * 9);
        ctx.fill();
        ctx.fillStyle = i % 3 === 1 ? PLATE.accent : PLATE.ink;
        ctx.fillRect(l + 6 * u, tp + ch * 0.66, cw - 12 * u, ch * 0.24);
        squeegee(l, tp, cw, ch, a - 0.1, () => {
          ctx.lineWidth = 2.5 * u;
          ctx.strokeStyle = BLACK;
          ctx.strokeRect(l + 3 * u, tp + 3 * u, cw - 6 * u, ch - 6 * u);
          ctx.beginPath();
          ctx.arc(l + cw / 2, tp + ch * 0.38, Math.min(cw, ch) * 0.2, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      if (!slap(at).on) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${STENCIL}`;
      const w = ctx.measureText(value).width + 24 * u;
      ctx.restore();
      const h = size * 1.15 * u;
      const big = size >= 80;
      // A loose colour strip under the number; the big one gets a flicker of colourways.
      const ways = [PLATE.ink, PLATE.good, PLATE.accent];
      const color =
        big && count && t < at + dur
          ? (ways[Math.floor(t * 6) % 3] as string)
          : PLATE[tone === "accent" ? "ink" : tone];
      ctx.fillStyle = color;
      cut(X(x) - w / 2 + 6 * u, Y(y) - h / 2 + 5 * u, w, h, x * 31);
      ctx.fill();
      squeegee(X(x) - w / 2, Y(y) - h / 2, w, h, at, () =>
        stencil(value, X(x), Y(y) + 2 * u, size, BLACK),
      );
      if (sub)
        squeegee(X(x) - w / 2, Y(y) - size * u, w, size * 0.4 * u, at + 0.1, () =>
          stencil(sub, X(x), Y(y) - size * 0.78 * u, size * 0.26, BLACK),
        );
      if (big && count) {
        const q = clamp((t - at - dur) / 0.4);
        if (q > 0) {
          ctx.save();
          ctx.strokeStyle = BLACK;
          ctx.lineWidth = 4 * u;
          trace(ctx, along(ellipse(X(x), Y(y), w * 0.68, h * 0.75, 40, -2.4, 1.05), q).points);
          ctx.stroke();
          ctx.restore();
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const s = (o.size ?? 32) * u;
      const cx = X(x);
      const cy = Y(y);
      if (!slap(at).on) return;
      ctx.save();
      ctx.lineCap = "square";
      ctx.lineJoin = "miter";
      ctx.lineWidth = 8 * u;
      ctx.strokeStyle = kind === "check" ? PLATE.good : PLATE.bad;
      const pts: Pt[] =
        kind === "check"
          ? [
              [cx - s * 0.5, cy],
              [cx - s * 0.1, cy + s * 0.45],
              [cx + s * 0.6, cy - s * 0.55],
            ]
          : [];
      if (kind === "check") {
        trace(
          ctx,
          pts.map(([px, py]) => [px + 4 * u, py - 3 * u] as Pt),
        );
        ctx.stroke();
      }
      ctx.restore();
      squeegee(cx - s, cy - s, s * 2, s * 2, at - 0.1, () => {
        ctx.save();
        ctx.lineWidth = 6 * u;
        ctx.strokeStyle = BLACK;
        if (kind === "check") trace(ctx, pts);
        else {
          ctx.beginPath();
          ctx.moveTo(cx - s * 0.5, cy - s * 0.5);
          ctx.lineTo(cx + s * 0.5, cy + s * 0.5);
          ctx.moveTo(cx + s * 0.5, cy - s * 0.5);
          ctx.lineTo(cx - s * 0.5, cy + s * 0.5);
          ctx.strokeStyle = PLATE.bad;
        }
        ctx.stroke();
        ctx.restore();
      });
    },
    finish() {
      ctx.drawImage(grainTile(), 0, 0);
    },
  };
}

export default {
  id: "screenprint-grid",
  name: "Silkscreen pop",
  category: "Print",
  make,
} satisfies Style;
