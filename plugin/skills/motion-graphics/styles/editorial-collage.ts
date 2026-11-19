// Editorial collage: warm grainy paper, torn red and kraft blocks, cut-out
// condensed headlines on paper strips, graph-paper sheets held by masking
// tape, halftone prints, a yellow highlighter swept over the key word and
// red marker for the correction. Pieces drop in on 12 fps steps.
import {
  along,
  clamp,
  counting,
  curve,
  ellipse,
  frame,
  hash,
  type Look,
  leftOf,
  type Pt,
  roughen,
  type Style,
  trace,
} from "./look.ts";

const PAPER = "#EFE6D3";
const BLACK = "#151413";
const RED = "#D23B2E";
const HILITE = "rgba(255,214,0,0.78)";
const COND = '"Anton", "Bebas Neue", "Oswald", Impact, "Arial Narrow", sans-serif';
const SERIF = '"Georgia", "Times New Roman", serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const tq = Math.floor(t * 12) / 12;
  const g = globalThis as any;
  g.__collageGrain ??= new Map();
  const cache: Map<string, any> = g.__collageGrain;

  /** 0 before `at`, then a stepped drop-in that lands by `at + 0.25`. */
  const land = (at = 0) => clamp((tq - at) / 0.25);

  /** A torn-edged polygon round a rectangle. */
  function torn(x: number, y: number, w: number, h: number, seed: number, rag = 4) {
    const pts: Pt[] = [];
    const n = Math.max(6, Math.round(w / (14 * u)));
    const k = Math.max(4, Math.round(h / (14 * u)));
    for (let i = 0; i <= n; i++) pts.push([x + (w * i) / n, y + (hash(seed + i) - 0.5) * rag * u]);
    for (let i = 0; i <= k; i++)
      pts.push([x + w + (hash(seed + 50 + i) - 0.5) * rag * u, y + (h * i) / k]);
    for (let i = n; i >= 0; i--)
      pts.push([x + (w * i) / n, y + h + (hash(seed + 90 + i) - 0.5) * rag * u]);
    for (let i = k; i >= 0; i--)
      pts.push([x + (hash(seed + 140 + i) - 0.5) * rag * u, y + (h * i) / k]);
    trace(ctx, pts, true);
  }

  function softShadow() {
    ctx.shadowColor = "rgba(40,25,10,0.3)";
    ctx.shadowBlur = 12 * u;
    ctx.shadowOffsetX = 3 * u;
    ctx.shadowOffsetY = 6 * u;
  }

  function tape(cx: number, cy: number, w: number, rot: number) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.fillStyle = "rgba(226,214,180,0.82)";
    ctx.fillRect(-w / 2, -9 * u, w, 18 * u);
    ctx.restore();
  }

  /** Run `draw` dropped in: falls from slightly above and larger, with a little twist. */
  function dropped(cx: number, cy: number, at: number | undefined, seed: number, draw: () => void) {
    const p = land(at);
    if (p <= 0) return;
    const e = 1 - (1 - p) ** 3;
    ctx.save();
    ctx.translate(cx, cy - (1 - e) * 40 * u);
    ctx.rotate((hash(seed) - 0.5) * 0.05 + (1 - e) * 0.08);
    ctx.scale(1 + (1 - e) * 0.08, 1 + (1 - e) * 0.08);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }

  /** Condensed caps cut out on a white strip. */
  function strip(
    s: string,
    x: number,
    y: number,
    size: number,
    ink: string,
    paper: string,
    seed: number,
  ) {
    ctx.font = `400 ${Math.round(size * u)}px ${COND}`;
    const w = ctx.measureText(s).width + size * 0.5 * u;
    const h = size * 1.28 * u;
    ctx.save();
    softShadow();
    ctx.fillStyle = paper;
    torn(x, y - h / 2, w, h, seed, 3);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(s, x + size * 0.25 * u, y + size * 0.04 * u);
    return w;
  }

  function grainTile() {
    const key = `${W}x${H}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      for (let i = 0; i < (W * H) / 60; i++) {
        const v = hash(i * 1.37);
        c.fillStyle = v > 0.5 ? "rgba(255,250,235,0.18)" : "rgba(60,40,20,0.12)";
        c.fillRect(hash(i * 2.11) * W, hash(i * 3.07) * H, 1.5, 1.5);
      }
      cache.set(key, tile);
    }
    return tile;
  }

  return {
    surface() {
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      // Torn red block and a kraft panel tucked behind the layout.
      ctx.save();
      ctx.fillStyle = RED;
      torn(W * 0.74, -10 * u, W * 0.3, H * 0.34, 7, 10);
      ctx.fill();
      ctx.fillStyle = "#C9A878";
      torn(-10 * u, H * 0.24, W * 0.2, H * 0.52, 19, 6);
      ctx.fill();
      // A faded newspaper clipping in the corner.
      ctx.translate(W * 0.8, H * 0.78);
      ctx.rotate(0.04);
      ctx.fillStyle = "#E4DAC3";
      torn(0, 0, W * 0.18, H * 0.2, 31, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(40,30,20,0.55)";
      ctx.font = `700 ${Math.round(18 * u)}px ${SERIF}`;
      ctx.fillText("Can a machine", 10 * u, 24 * u);
      ctx.fillText("think?", 10 * u, 44 * u);
      for (let i = 0; i < 6; i++)
        ctx.fillRect(10 * u, (60 + i * 11) * u, W * 0.18 - 20 * u - hash(i) * 30 * u, 3 * u);
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.09, size = 54, at = 0, dur = 0.9 } = o;
      const words = s.toUpperCase().split(" ");
      // Words cut out one by one; the last one gets the highlighter.
      const half = Math.ceil(words.length / 2);
      const lines = [words.slice(0, half).join(" "), words.slice(half).join(" ")].filter(Boolean);
      // The block's width: each strip as strip() measures it, the second one stepped in.
      ctx.font = `400 ${Math.round(size * u)}px ${COND}`;
      const reach = Math.max(
        ...lines.map((l, i) => i * 26 * u + ctx.measureText(l).width + size * 0.5 * u),
      );
      const left = leftOf(X(x), reach, o.align);
      lines.forEach((line, i) => {
        const ly = Y(y) + i * size * 1.25 * u;
        const lx = left + i * 26 * u;
        dropped(lx, ly, at + (i * dur) / 2, i + 3, () => {
          const w = strip(line, lx, ly, size, BLACK, "#FAF7EF", 11 + i);
          if (i === lines.length - 1) {
            const p = clamp((t - at - dur) / 0.4);
            if (p > 0) {
              ctx.save();
              ctx.globalCompositeOperation = "multiply";
              ctx.fillStyle = HILITE;
              ctx.fillRect(lx + 4 * u, ly - size * 0.5 * u, (w - 8 * u) * p, size * u);
              ctx.restore();
            }
          }
        });
      });
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 26, tone = "ink" } = o;
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${COND}`;
      const w = ctx.measureText(s.toUpperCase()).width + size * 0.5 * u;
      ctx.restore();
      const left = leftOf(X(x), w, o.align ?? "center");
      dropped(left + w / 2, Y(y), at, x * 7 + y, () => {
        const bg = tone === "bad" ? RED : BLACK;
        strip(s.toUpperCase(), left, Y(y), size, "#F7F2E6", bg, x * 99);
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const R = r * 0.85 * u;
      dropped(X(x), Y(y), at, x * 3 + y, () => {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
        ctx.fillStyle = "#FBF8F1";
        ctx.fill();
        ctx.lineWidth = 3 * u;
        ctx.strokeStyle = BLACK;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = tone === "accent" ? RED : BLACK;
        ctx.fill();
      });
    },
    box(x, y, w, h, o = {}) {
      // A graph-paper sheet taped down.
      dropped(X(x + w / 2), Y(y + h / 2), o.at, x * 17, () => {
        const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
        ctx.save();
        softShadow();
        ctx.fillStyle = "#F9F7F0";
        ctx.fillRect(l, tp, ww, hh);
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = "rgba(90,110,120,0.16)";
        ctx.lineWidth = 1 * u;
        for (let gx = l + 14 * u; gx < l + ww; gx += 14 * u) {
          ctx.beginPath();
          ctx.moveTo(gx, tp);
          ctx.lineTo(gx, tp + hh);
          ctx.stroke();
        }
        for (let gy = tp + 14 * u; gy < tp + hh; gy += 14 * u) {
          ctx.beginPath();
          ctx.moveTo(l, gy);
          ctx.lineTo(l + ww, gy);
          ctx.stroke();
        }
        ctx.restore();
        tape(l + ww / 2, tp, Math.min(90 * u, ww * 0.5), -0.03);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = clamp((t - at) / dur);
      if (p <= 0) return;
      const marker = tone === "bad";
      const base = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 28);
      const pts = marker ? roughen(base, 2 * u, x1 * 41) : base;
      const res = along(pts, p);
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = marker ? RED : BLACK;
      ctx.lineWidth = (marker ? 6 : head ? 2.6 : 1.3) * u;
      if (head && !marker) ctx.setLineDash([9 * u, 7 * u]);
      if (!head) ctx.globalAlpha = 0.6;
      trace(ctx, res.points);
      ctx.stroke();
      ctx.setLineDash([]);
      if (head && p >= 1) {
        const tip = pts.at(-1) as Pt;
        const s = (marker ? 22 : 16) * u;
        ctx.beginPath();
        ctx.moveTo(tip[0] - Math.cos(res.angle - 0.5) * s, tip[1] - Math.sin(res.angle - 0.5) * s);
        ctx.lineTo(tip[0], tip[1]);
        ctx.lineTo(tip[0] - Math.cos(res.angle + 0.5) * s, tip[1] - Math.sin(res.angle + 0.5) * s);
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      // A small pile of halftone prints with white borders.
      const { at = 0, dur = 0.8 } = o;
      for (let i = 0; i < 3; i++) {
        const cx = X(x + w / 2) + (i - 1) * 8 * u;
        const cy = Y(y + h / 2) + (i - 1) * 10 * u;
        dropped(cx, cy, at + (i * dur) / 4, i * 5 + 2, () => {
          const pw = X(w) * 1.15;
          const ph = Y(h) * 0.55;
          const l = cx - pw / 2;
          const tp = cy - ph / 2;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate((i - 1) * 0.08);
          ctx.translate(-cx, -cy);
          softShadow();
          ctx.fillStyle = "#FBFAF5";
          ctx.fillRect(l, tp, pw, ph);
          ctx.shadowColor = "transparent";
          const b = 6 * u;
          ctx.fillStyle = "#3B3833";
          ctx.fillRect(l + b, tp + b, pw - b * 2, ph - b * 2);
          ctx.fillStyle = "#9A948A";
          for (let gy = tp + b + 3 * u; gy < tp + ph - b; gy += 6 * u)
            for (let gx = l + b + 3 * u; gx < l + pw - b; gx += 6 * u) {
              const f =
                0.5 + 0.5 * Math.sin((gx - l) / (pw * 0.18) + i) * Math.cos((gy - tp) / (ph * 0.3));
              ctx.beginPath();
              ctx.arc(gx, gy, 2.6 * u * f, 0, Math.PI * 2);
              ctx.fill();
            }
          ctx.restore();
        });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      const value = count ? counting(tq, at, dur, count) + s : s;
      dropped(X(x), Y(y), at, x * 11, () => {
        ctx.save();
        ctx.font = `400 ${Math.round(size * u)}px ${COND}`;
        const w = ctx.measureText(value).width + size * 0.5 * u;
        strip(value, X(x) - w / 2, Y(y), size, tone === "bad" ? RED : BLACK, "#FAF7EF", x * 77);
        ctx.restore();
        if (sub) {
          ctx.save();
          ctx.font = `400 ${Math.round(size * 0.3 * u)}px ${COND}`;
          const sw = ctx.measureText(sub.toUpperCase()).width + size * 0.15 * u;
          strip(
            sub.toUpperCase(),
            X(x) - sw / 2,
            Y(y) - size * 0.95 * u,
            size * 0.3,
            "#F7F2E6",
            BLACK,
            x * 51,
          );
          ctx.restore();
        }
      });
      // The highlighter swept under the finished number.
      if (count && size >= 80) {
        const p = clamp((t - at - dur) / 0.4);
        if (p > 0) {
          ctx.save();
          ctx.font = `400 ${Math.round(size * u)}px ${COND}`;
          const w = ctx.measureText(value).width;
          ctx.globalCompositeOperation = "multiply";
          ctx.fillStyle = HILITE;
          ctx.fillRect(X(x) - w / 2, Y(y) + size * 0.12 * u, w * p, size * 0.36 * u);
          ctx.restore();
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const s = (o.size ?? 34) * u;
      const cx = X(x);
      const cy = Y(y);
      const p = clamp((t - at) / 0.35);
      if (p <= 0) return;
      ctx.save();
      ctx.strokeStyle = RED;
      ctx.lineWidth = 6 * u;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (kind === "check") {
        trace(
          ctx,
          along(
            roughen(
              [
                [cx - s * 0.5, cy],
                [cx - s * 0.1, cy + s * 0.45],
                [cx + s * 0.6, cy - s * 0.55],
              ],
              1.5 * u,
              3,
            ),
            p,
          ).points,
        );
        ctx.stroke();
      } else {
        // A marker ring with a cross through it.
        trace(
          ctx,
          along(roughen(ellipse(cx, cy, s * 1.2, s * 0.9, 30, -2, 1.1), 2 * u, 5), p).points,
        );
        ctx.stroke();
        trace(
          ctx,
          along(
            [
              [cx - s * 0.5, cy - s * 0.5],
              [cx + s * 0.5, cy + s * 0.5],
            ],
            p,
          ).points,
        );
        ctx.stroke();
      }
      ctx.restore();
    },
    finish() {
      ctx.drawImage(grainTile(), 0, 0);
      const v = ctx.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.4,
        W / 2,
        H / 2,
        Math.hypot(W, H) * 0.6,
      );
      v.addColorStop(0, "rgba(60,35,10,0)");
      v.addColorStop(1, "rgba(60,35,10,0.22)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    },
  };
}

export default {
  id: "editorial-collage",
  name: "Editorial collage",
  category: "Popular Explainer Looks",
  make,
} satisfies Style;
