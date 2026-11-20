// Chalk on a green slate: dusty, broken strokes that skip over the board's
// tooth, coloured chalk for emphasis, old eraser clouds, an oak frame and a
// tray. Every line and word is scratched on with the stick following it.
import {
  along,
  type Cue,
  counting,
  curve,
  ellipse,
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

const CHALK: Record<Tone, string> = {
  ink: "#F1F0E8",
  accent: "#F2D86B",
  good: "#A6E8BE",
  bad: "#F4A3BF",
  muted: "#AFC2B6",
};
const HAND = '"Comic Neue", "Noto Color Emoji", cursive';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__chalk ??= new Map();
  const cache: Map<string, any> = g.__chalk;
  let tip: Pt | null = null;
  let seed = 1;

  /** Chalk in one colour as a fill: the colour with gaps where the board shows through. */
  function chalk(tone: Tone) {
    const key = `tile:${tone}`;
    let tile = cache.get(key);
    if (!tile) {
      const n = 128;
      tile = new OffscreenCanvas(n, n);
      const c = tile.getContext("2d");
      const img = c.createImageData(n, n);
      const hex = Number.parseInt(CHALK[tone].slice(1), 16);
      for (let i = 0; i < n * n; i++) {
        img.data[i * 4] = (hex >> 16) & 255;
        img.data[i * 4 + 1] = (hex >> 8) & 255;
        img.data[i * 4 + 2] = hex & 255;
        img.data[i * 4 + 3] =
          hash(i * 0.731 + 3.3) < 0.24 ? 0 : Math.round(255 * (0.5 + 0.5 * hash(i * 1.37)));
      }
      c.putImageData(img, 0, 0);
      cache.set(key, tile);
    }
    return ctx.createPattern(tile, "repeat");
  }

  function board() {
    const key = `board:${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      const gr = b.createRadialGradient(
        W * 0.45,
        H * 0.4,
        0,
        W * 0.5,
        H * 0.5,
        Math.hypot(W, H) * 0.6,
      );
      gr.addColorStop(0, "#2F5A47");
      gr.addColorStop(1, "#1C382D");
      b.fillStyle = gr;
      b.fillRect(0, 0, W, H);
      b.filter = `blur(${24 * u}px)`;
      for (let i = 0; i < 16; i++) {
        b.fillStyle = `rgba(215,235,222,${0.03 + hash(i) * 0.035})`;
        b.beginPath();
        b.ellipse(
          hash(i + 3) * W,
          hash(i + 7) * H,
          (90 + hash(i + 11) * 220) * u,
          (30 + hash(i + 13) * 70) * u,
          hash(i) * 3,
          0,
          Math.PI * 2,
        );
        b.fill();
      }
      b.filter = "none";
      for (let i = 0; i < (W * H) / 300; i++) {
        b.fillStyle = `rgba(255,255,255,${0.02 + hash(i * 2.1) * 0.05})`;
        b.fillRect(hash(i * 1.1) * W, hash(i * 1.9 + 4) * H, 1.4 * u, 1.4 * u);
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  const dashes = (s: number) =>
    Array.from({ length: 8 }, (_, i) => (i % 2 ? 1 + hash(s + i) * 3.5 : 8 + hash(s + i) * 34) * u);

  /** A chalk line scratched on from `at` over `dur`: a broken main pass and a thinner dusty one. */
  function line(points: Pt[], { at = 0, dur = 0.6, tone = "ink" as Tone, width = 7.5 } = {}) {
    const p = progress(t, at, dur);
    seed += 1;
    if (p <= 0) return;
    const { points: drawn } = along(roughen(points, 1.5 * u, seed * 7.3), p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = chalk(tone);
    ctx.setLineDash(dashes(seed));
    ctx.lineWidth = width * u;
    trace(ctx, drawn);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = width * 0.45 * u;
    ctx.translate(0.9 * u, -0.7 * u);
    trace(ctx, drawn);
    ctx.stroke();
    ctx.restore();
    if (p < 1) tip = drawn.at(-1) as Pt;
  }

  /** Chalk lettering revealed left to right behind the stick. */
  function write(s: string, x: number, y: number, o: Cue & { size?: number; align?: string } = {}) {
    const { at = 0, size = 40, tone = "ink", align = "left" } = o;
    const dur = o.dur ?? 0.05 * s.length + 0.1;
    const p = progress(t, at, dur);
    if (p <= 0) return 0;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${HAND}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.beginPath();
    ctx.rect(left - 4 * u, Y(y) - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = chalk(tone);
    ctx.shadowColor = "rgba(255,255,255,0.12)";
    ctx.shadowBlur = 6 * u;
    ctx.fillText(s, left, Y(y));
    ctx.restore();
    if (p < 1) tip = [left + w * p, Y(y) + size * 0.2 * u];
    return w;
  }

  return {
    surface() {
      board();
      const f = 18 * u;
      const wood = (x: number, y: number, w: number, h: number) => {
        const wg = ctx.createLinearGradient(x, y, x + (w < h ? w : 0), y + (w < h ? 0 : h));
        wg.addColorStop(0, "#9A6B3F");
        wg.addColorStop(0.5, "#7A512D");
        wg.addColorStop(1, "#5A3A1F");
        ctx.fillStyle = wg;
        ctx.fillRect(x, y, w, h);
      };
      wood(0, 0, W, f);
      wood(0, 0, f, H);
      wood(W - f, 0, f, H);
      wood(0, H - f * 2, W, f * 2);
      ctx.fillStyle = "rgba(240,240,232,0.35)";
      for (let i = 0; i < 40; i++)
        ctx.fillRect(
          hash(i) * W,
          H - f * 1.4 + hash(i + 2) * f * 0.5,
          (2 + hash(i + 5) * 6) * u,
          2 * u,
        );
      (["ink", "bad", "accent"] as Tone[]).forEach((c, i) => {
        ctx.fillStyle = CHALK[c];
        ctx.beginPath();
        ctx.roundRect(W * (0.62 + i * 0.06), H - f * 1.55, 54 * u, 11 * u, 5 * u);
        ctx.fill();
      });
      ctx.fillStyle = "#3B3631";
      ctx.fillRect(W * 0.08, H - f * 1.7, 120 * u, 22 * u);
      ctx.fillStyle = "#CFC6B6";
      ctx.fillRect(W * 0.08, H - f * 1.7 + 14 * u, 120 * u, 8 * u);
    },
    title(s, o = {}) {
      const { x = 0.05, y = 0.11, size = 74, at = 0 } = o;
      const w = write(s, x, y, { ...o, size, at, align: o.align ?? "left" }) || 0;
      if (!w) return;
      const done = at + (o.dur ?? 0.05 * s.length + 0.1);
      line(curve([X(x), Y(y) + size * 0.75 * u], [X(x) + w, Y(y) + size * 0.7 * u], -0.02, 16), {
        at: done,
        dur: 0.35,
        tone: "accent",
        width: 5,
      });
    },
    label(s, x, y, o = {}) {
      write(s, x, y, { size: 38, align: "center", ...o });
    },
    node(x, y, r, o = {}) {
      line(ellipse(X(x), Y(y), r * u, r * u, 40, -Math.PI / 2, 1.08), {
        dur: 0.18,
        width: 5,
        ...o,
      });
    },
    box(x, y, w, h, o = {}) {
      const a: Pt = [X(x), Y(y)];
      const b: Pt = [X(x + w), Y(y + h)];
      line([a, [b[0], a[1]], b, [a[0], b[1]], [a[0], a[1] - 3 * u]], { dur: 0.5, ...o });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true } = o;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      line(shaft, { ...o, at, dur, width: head ? 5 : 3 });
      if (!head) return;
      const end = shaft.at(-1) as Pt;
      const prev = shaft.at(-3) as Pt;
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 20 * u;
      line(
        [
          [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
          end,
          [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s],
        ],
        { ...o, at: at + dur, dur: 0.12, width: 5 },
      );
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.28;
      const top = Y(y) + ry;
      const bottom = Y(y + h) - ry;
      const half = (cy: number) => ellipse(cx, cy, rx, ry, 28, 0, 0.5);
      const step = dur / 5;
      line(ellipse(cx, top, rx, ry, 28, Math.PI, 1), { ...o, at, dur: step * 1.5 });
      line(
        [
          [cx - rx, top],
          [cx - rx, bottom],
        ],
        { ...o, at: at + step * 1.5, dur: step * 0.7 },
      );
      line(half(bottom), { ...o, at: at + step * 2.2, dur: step });
      line(
        [
          [cx + rx, bottom],
          [cx + rx, top],
        ],
        { ...o, at: at + step * 3.2, dur: step * 0.6 },
      );
      line(half(top + (bottom - top) / 2), { ...o, at: at + step * 3.8, dur: step });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      write(value, x, y, { ...o, size, align: "center", dur: 0.3 });
      if (sub)
        write(sub, x, y - (size * 0.8 * u) / H, {
          at: at + 0.2,
          size: size * 0.32,
          align: "center",
          tone: "muted",
        });
      // Big numbers get ringed in pink once they land.
      if (size >= 80)
        line(ellipse(X(x), Y(y), size * 1.25 * u, size * 0.75 * u, 44, -Math.PI * 0.7, 1.08), {
          at: at + dur,
          dur: 0.4,
          tone: tone === "accent" ? "bad" : tone,
          width: 5,
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check") {
        line(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.1, cy + s * 0.4],
            [cx + s * 0.6, cy - s * 0.5],
          ],
          { dur: 0.3, tone: "good", ...o },
        );
      } else {
        const at = o.at ?? 0;
        line(
          [
            [cx - s * 0.5, cy - s * 0.5],
            [cx + s * 0.5, cy + s * 0.5],
          ],
          { dur: 0.15, tone: "bad", ...o },
        );
        line(
          [
            [cx + s * 0.5, cy - s * 0.5],
            [cx - s * 0.5, cy + s * 0.5],
          ],
          { dur: 0.15, tone: "bad", ...o, at: at + 0.15 },
        );
      }
    },
    finish() {
      if (!tip) return;
      const [x, y] = tip;
      ctx.save();
      // A puff of dust where the stick touches.
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = `rgba(240,240,232,${0.25 * hash(i + t * 30)})`;
        ctx.fillRect(
          x + (hash(i * 3 + t * 20) - 0.5) * 14 * u,
          y + hash(i * 5 + t * 25) * 26 * u,
          2 * u,
          2 * u,
        );
      }
      ctx.translate(x, y);
      ctx.rotate(-Math.PI * 0.78);
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 12 * u;
      ctx.shadowOffsetX = 8 * u;
      ctx.shadowOffsetY = 10 * u;
      ctx.fillStyle = "#F4F2EA";
      ctx.beginPath();
      ctx.roundRect(-4 * u, -8 * u, 80 * u, 16 * u, 4 * u);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(-4 * u, 3 * u, 80 * u, 5 * u);
      ctx.restore();
    },
  };
}

export default {
  id: "chalkboard",
  name: "Chalkboard",
  category: "Hand-drawn",
  make,
} satisfies Style;
