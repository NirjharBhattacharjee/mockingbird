// Wood-type letterpress broadside: black and red ink on cream stock, heavy
// condensed display faces, double rules, gear cuts, dashed rule arrows. Each
// piece is set block by block and lands with a heavy kiss of the platen
// (it drops from a touch larger and darker, then bites in), and the ink is
// worn and uneven, with paper showing through the solids.
import {
  clamp,
  counting,
  curve,
  frame,
  hash,
  type Look,
  leftOf,
  type Pt,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const STOCK = "#EFE4CA";
const BLACK = "#1E1B18";
const RED = "#C3352B";
const INK: Record<Tone, string> = {
  ink: BLACK,
  accent: RED,
  good: BLACK,
  bad: RED,
  muted: "#7B7265",
};
const WOOD = '"Anton", "Noto Color Emoji", sans-serif';
const SLAB = '"Arvo", "Noto Color Emoji", serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__pressWear ??= new Map();
  const cache: Map<string, any> = g.__pressWear;

  /** The platen's kiss: before `at` nothing, then 0.12 s from larger to seated. */
  function kissed(cx: number, cy: number, at: number, draw: () => void) {
    if (t < at) return;
    const p = clamp((t - at) / 0.12);
    const s = 1 + (1 - p) * 0.14;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    ctx.globalAlpha = 0.35 + 0.65 * p;
    draw();
    ctx.restore();
  }

  /** Display type with ink squeezed to its rim: a slightly darker edge round a flat fill. */
  function wood(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align = "left",
    font = WOOD,
  ) {
    ctx.font = `400 ${Math.round(size * u)}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
    ctx.lineWidth = Math.max(1, size * 0.02 * u);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.strokeText(s, x, y);
  }

  function gear(cx: number, cy: number, r: number, teeth: number, rot: number, color: string) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a0 = (i / (teeth * 2)) * Math.PI * 2;
      const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
      const rr = i % 2 ? r * 0.78 : r;
      ctx.arc(0, 0, rr, a0, a1);
    }
    ctx.closePath();
    ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2, true);
    ctx.fillStyle = color;
    ctx.fill("evenodd");
    ctx.restore();
  }

  function rule(x1: number, x2: number, y: number, weight: number, color = BLACK) {
    ctx.fillStyle = color;
    ctx.fillRect(x1, y - weight / 2, x2 - x1, weight);
  }

  /** A cached veil of paper-coloured flecks laid over the ink: wood grain and worn edges. */
  function wearTile() {
    const key = `${W}x${H}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      for (let i = 0; i < (W * H) / 90; i++) {
        c.fillStyle = `rgba(239,228,202,${0.25 + 0.5 * hash(i * 0.53)})`;
        const len = 1 + hash(i * 6.1) * 6;
        c.fillRect(hash(i * 1.37) * W, hash(i * 2.91) * H, len, 1.2);
      }
      cache.set(key, tile);
    }
    return tile;
  }

  return {
    surface() {
      ctx.fillStyle = STOCK;
      ctx.fillRect(0, 0, W, H);
      const v = ctx.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.3,
        W / 2,
        H / 2,
        Math.hypot(W, H) * 0.6,
      );
      v.addColorStop(0, "rgba(255,250,235,0.3)");
      v.addColorStop(1, "rgba(140,110,60,0.2)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      // Double rules top and bottom, set before anything else.
      const m0 = W * 0.03;
      rule(m0, W - m0, H * 0.025, 4 * u);
      rule(m0, W - m0, H * 0.025 + 9 * u, 1.5 * u);
      rule(m0, W - m0, H * 0.965, 4 * u);
      rule(m0, W - m0, H * 0.965 - 9 * u, 1.5 * u);
      // A row of red ornaments along the foot.
      ctx.fillStyle = RED;
      for (let i = 0; i < 24; i++) {
        ctx.beginPath();
        ctx.arc(W * 0.38 + i * W * 0.01, H * 0.93, 2 * u, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    title(s, o = {}) {
      // Set letter by letter, each landing with its own kiss and a slightly different inking.
      const { x = 0.035, y = 0.1, size = 76, at = 0, dur = 0.9 } = o;
      const text = s.toUpperCase();
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${WOOD}`;
      const gap = size * 0.02 * u;
      const full = [...text].reduce((s, ch) => s + ctx.measureText(ch).width + gap, 0) - gap;
      let cx = leftOf(X(x), full, o.align);
      const step = dur / text.length;
      for (const [i, ch] of [...text].entries()) {
        const w = ctx.measureText(ch).width;
        const tone = 0.82 + 0.18 * hash(i * 3.7);
        kissed(cx + w / 2, Y(y), at + i * step, () => {
          ctx.globalAlpha *= tone;
          wood(ch, cx, Y(y), size, i >= text.lastIndexOf(" ") + 1 ? RED : BLACK);
        });
        cx += w + gap;
      }
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 26, tone = "ink", align = "center" } = o;
      kissed(X(x), Y(y), at, () => {
        ctx.letterSpacing = `${(size * 0.08 * u).toFixed(1)}px`;
        wood(s.toUpperCase(), X(x), Y(y), size, INK[tone], align);
        ctx.letterSpacing = "0px";
      });
    },
    node(x, y, r, o = {}) {
      // A stock cut of a gear, turning slowly once it is printed.
      const { at = 0, tone = "ink" } = o;
      const R = r * 1.05 * u;
      kissed(X(x), Y(y), at, () =>
        gear(
          X(x),
          Y(y),
          R,
          8,
          (t - at) * 0.6 * (hash(x * 9 + y) > 0.5 ? 1 : -1),
          INK[tone === "accent" ? "ink" : tone],
        ),
      );
    },
    box(x, y, w, h, o = {}) {
      // A frame of rule: a heavy outer line and a thin one inside.
      const { at = 0, tone = "ink" } = o;
      const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
      kissed(l + ww / 2, tp + hh / 2, at, () => {
        ctx.lineWidth = 5 * u;
        ctx.strokeStyle = INK[tone === "good" ? "ink" : tone];
        ctx.strokeRect(l, tp, ww, hh);
        ctx.lineWidth = 1.5 * u;
        ctx.strokeRect(l + 8 * u, tp + 8 * u, ww - 16 * u, hh - 16 * u);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      // Short pieces of rule locked up one after another, ending in a solid head.
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      if (t < at) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const color = INK[tone === "accent" ? "ink" : tone];
      if (!head) {
        const p = clamp((t - at) / dur);
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2 * u;
        trace(ctx, pts.slice(0, Math.max(2, Math.round(pts.length * p))));
        ctx.stroke();
        ctx.restore();
        return;
      }
      const n = pts.length - 1;
      const shown = Math.floor(clamp((t - at) / dur) * n);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.5 * u;
      for (let i = 0; i < shown; i += 2) {
        const a = pts[i] as Pt;
        const b = pts[i + 1] as Pt;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      if (shown >= n) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 16 * u;
        trace(
          ctx,
          [
            [end[0] + Math.cos(a) * 4 * u, end[1] + Math.sin(a) * 4 * u],
            [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
            [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s],
          ],
          true,
        );
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      // Four wood blocks in a 2x2 lockup, each a framed square with an inked face.
      const { at = 0, dur = 0.8 } = o;
      const s = Math.min(X(w) / 2.1, Y(h) / 2.1);
      const l = X(x + w / 2) - s * 1.05;
      const tp = Y(y + h / 2) - s * 1.05;
      for (let i = 0; i < 4; i++) {
        const bx = l + (i % 2) * s * 1.1;
        const by = tp + Math.floor(i / 2) * s * 1.1;
        kissed(bx + s / 2, by + s / 2, at + (i * dur) / 5, () => {
          ctx.lineWidth = 3.5 * u;
          ctx.strokeStyle = BLACK;
          ctx.strokeRect(bx, by, s, s);
          ctx.fillStyle = i === 1 || i === 2 ? RED : BLACK;
          ctx.fillRect(bx + 6 * u, by + 6 * u, s - 12 * u, s - 12 * u);
          ctx.fillStyle = STOCK;
          ctx.beginPath();
          ctx.arc(bx + s / 2, by + s * 0.55, s * 0.22, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at) return;
      // Re-set and re-stamped six times a second while it counts.
      const tq = Math.floor(t * 6) / 6;
      const value = count ? counting(tq, at, dur, count) + s : s;
      const stamp = Math.floor(Math.max(0, t - at) * 6) / 6 + at;
      const color = tone === "accent" || tone === "ink" ? BLACK : INK[tone];
      kissed(X(x), Y(y), count && t < at + dur ? stamp : at, () => {
        wood(value, X(x), Y(y), size * 1.15, color, "center");
      });
      if (sub) {
        kissed(X(x), Y(y) - size * 0.85 * u, at, () => {
          ctx.letterSpacing = `${(size * 0.05 * u).toFixed(1)}px`;
          wood(sub.toUpperCase(), X(x), Y(y) - size * 0.85 * u, size * 0.3, RED, "center", SLAB);
          ctx.letterSpacing = "0px";
          // Stars either side, and a red double rule under the number.
          ctx.fillStyle = RED;
          for (const side of [-1, 1]) {
            const cx = X(x) + side * size * 0.95 * u;
            const cy = Y(y) - size * 0.55 * u;
            ctx.beginPath();
            for (let k = 0; k < 10; k++) {
              const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
              const rr = (k % 2 ? 0.4 : 1) * size * 0.1 * u;
              ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            }
            ctx.fill();
          }
          rule(X(x) - size * 0.8 * u, X(x) + size * 0.8 * u, Y(y) + size * 0.72 * u, 4 * u, RED);
          rule(
            X(x) - size * 0.8 * u,
            X(x) + size * 0.8 * u,
            Y(y) + size * 0.72 * u + 7 * u,
            1.5 * u,
            RED,
          );
        });
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const s = (o.size ?? 34) * u;
      const cx = X(x);
      const cy = Y(y);
      if (kind === "check") {
        kissed(cx, cy, at, () => {
          ctx.strokeStyle = RED;
          ctx.lineWidth = 7 * u;
          ctx.lineJoin = "miter";
          trace(ctx, [
            [cx - s * 0.5, cy],
            [cx - s * 0.1, cy + s * 0.45],
            [cx + s * 0.6, cy - s * 0.6],
          ]);
          ctx.stroke();
        });
      } else {
        // A red rubber stamp, tilted, with a ragged border.
        kissed(cx, cy, at, () => {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(-0.15);
          ctx.globalAlpha *= 0.88;
          ctx.strokeStyle = RED;
          ctx.lineWidth = 4 * u;
          ctx.strokeRect(-s * 1.7, -s * 0.55, s * 3.4, s * 1.1);
          wood("WRONG", 0, 2 * u, (s * 0.9) / u, RED, "center", SLAB);
          ctx.restore();
        });
      }
    },
    finish() {
      ctx.drawImage(wearTile(), 0, 0);
    },
  };
}

export default {
  id: "letterpress",
  name: "Wood type press",
  category: "Print",
  make,
} satisfies Style;
