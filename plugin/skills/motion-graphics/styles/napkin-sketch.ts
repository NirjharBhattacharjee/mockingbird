// A cafe-table pitch: black felt-tip on a paper napkin lying on a wooden
// table. Ink bleeds a little into the tissue, the napkin has an embossed
// border, fold creases, crumples and a coffee ring, and a red pen comes out
// for the correction. Strokes are fast and confident, with the pen in hand.
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

const INK: Record<Tone, string> = {
  ink: "#151515",
  accent: "#151515",
  good: "#1C4F33",
  bad: "#D3202A",
  muted: "#6B6B6B",
};
const HAND = '"Kalam", "Noto Color Emoji", cursive';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__napkin ??= new Map();
  const cache: Map<string, any> = g.__napkin;
  let tip: { pt: Pt; color: string } | null = null;
  let seed = 1;
  const nx = W * 0.025;
  const ny = H * 0.035;

  function table() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      b.fillStyle = "#6E4128";
      b.fillRect(0, 0, W, H);
      // Planks and grain.
      for (let i = 0; i < 200; i++) {
        const y = hash(i * 1.3) * H;
        b.strokeStyle = hash(i) > 0.5 ? "rgba(40,20,8,0.18)" : "rgba(160,100,60,0.12)";
        b.lineWidth = (1 + hash(i + 4) * 3) * u;
        b.beginPath();
        b.moveTo(0, y);
        for (let x = 0; x <= W; x += 40 * u) b.lineTo(x, y + Math.sin(x / (90 * u) + i) * 3 * u);
        b.stroke();
      }
      for (let y = 0; y < H; y += H / 4) {
        b.fillStyle = "rgba(20,10,4,0.5)";
        b.fillRect(0, y, W, 2 * u);
      }
      // The napkin: soft white tissue with crumples.
      const [x0, y0, w, h] = [nx, ny, W - nx * 2, H - ny * 2];
      b.shadowColor = "rgba(0,0,0,0.35)";
      b.shadowBlur = 20 * u;
      b.shadowOffsetY = 6 * u;
      b.fillStyle = "#F7F5F0";
      b.fillRect(x0, y0, w, h);
      b.shadowColor = "transparent";
      for (let i = 0; i < 70; i++) {
        const cx = x0 + hash(i * 2.1) * w;
        const cy = y0 + hash(i * 3.7) * h;
        const r = (40 + hash(i + 9) * 120) * u;
        const gr = b.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
        gr.addColorStop(0, "rgba(255,255,255,0.0)");
        gr.addColorStop(0.5, `rgba(120,115,105,${0.08 + hash(i) * 0.08})`);
        gr.addColorStop(0.52, "rgba(255,255,255,0.35)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        b.fillStyle = gr;
        b.save();
        b.beginPath();
        b.rect(x0, y0, w, h);
        b.clip();
        b.translate(cx, cy);
        b.rotate(hash(i + 5) * 6);
        b.fillRect(-r, -r * 0.4, r * 2, r * 0.8);
        b.restore();
      }
      // Quarter folds.
      b.fillStyle = "rgba(110,100,90,0.3)";
      b.fillRect(x0 + w / 2, y0, 2 * u, h);
      b.fillRect(x0, y0 + h / 2, w, 2 * u);
      b.fillStyle = "rgba(255,255,255,0.7)";
      b.fillRect(x0 + w / 2 + 2 * u, y0, 2 * u, h);
      b.fillRect(x0, y0 + h / 2 + 2 * u, w, 2 * u);
      // Embossed border: a dotted band inset from the edge.
      const inset = 18 * u;
      for (let x = x0 + inset; x < x0 + w - inset; x += 9 * u)
        for (const yy of [y0 + inset, y0 + h - inset]) {
          b.fillStyle = "rgba(160,150,135,0.6)";
          b.fillRect(x, yy, 4 * u, 4 * u);
        }
      for (let y = y0 + inset; y < y0 + h - inset; y += 9 * u)
        for (const xx of [x0 + inset, x0 + w - inset]) {
          b.fillStyle = "rgba(160,150,135,0.6)";
          b.fillRect(xx, y, 4 * u, 4 * u);
        }
      // A coffee ring.
      const rx = x0 + w * 0.92;
      const ry = y0 + h * 0.86;
      for (let i = 0; i < 3; i++) {
        b.strokeStyle = `rgba(140,90,45,${0.18 + i * 0.08})`;
        b.lineWidth = (3 - i) * 2 * u;
        b.beginPath();
        b.arc(rx + i * 3 * u, ry - i * 2 * u, (58 - i * 3) * u, 0, Math.PI * 2);
        b.stroke();
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  /** A felt-tip stroke, drawn on fast, with a soft halo where the ink spreads into the tissue. */
  function ink(points: Pt[], { at = 0, dur = 0.4, tone = "ink" as Tone, width = 7 } = {}) {
    const p = progress(t, at, dur);
    seed += 1;
    if (p <= 0) return;
    const { points: drawn } = along(roughen(points, 1.6 * u, seed * 5.7), p);
    const col = INK[tone];
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    trace(ctx, drawn);
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = width * 2.1 * u;
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
    if (p < 1) tip = { pt: drawn.at(-1) as Pt, color: col };
  }

  function write(s: string, x: number, y: number, o: Cue & { size?: number; align?: string } = {}) {
    const { at = 0, size = 40, tone = "ink", align = "left" } = o;
    const dur = o.dur ?? 0.04 * s.length + 0.1;
    const p = progress(t, at, dur);
    if (p <= 0) return 0;
    ctx.save();
    ctx.font = `800 ${Math.round(size * u)}px ${HAND}`;
    ctx.textBaseline = "middle";
    const text = s.toUpperCase();
    const w = ctx.measureText(text).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.beginPath();
    ctx.rect(left - 4 * u, Y(y) - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = INK[tone];
    ctx.shadowColor = INK[tone];
    ctx.shadowBlur = 2.5 * u;
    ctx.fillText(text, left, Y(y));
    ctx.restore();
    if (p < 1) tip = { pt: [left + w * p, Y(y)], color: INK[tone] };
    return w;
  }

  return {
    surface() {
      table();
    },
    title(s, o = {}) {
      const { x = 0.06, y = 0.13, size = 74, at = 0 } = o;
      const w = write(s, x, y, { ...o, size, at, align: o.align ?? "left" });
      if (!w) return;
      const done = at + (o.dur ?? 0.04 * s.length + 0.1);
      ink(curve([X(x), Y(y) + size * 0.75 * u], [X(x) + w, Y(y) + size * 0.72 * u], -0.01, 12), {
        at: done,
        dur: 0.25,
        width: 6,
      });
    },
    label(s, x, y, o = {}) {
      write(s, x, y, { size: 36, align: "center", ...o });
    },
    node(x, y, r, o = {}) {
      ink(ellipse(X(x), Y(y), r * u, r * u, 36, -Math.PI / 2, 1.06), { dur: 0.15, width: 5, ...o });
    },
    box(x, y, w, h, o = {}) {
      const a: Pt = [X(x), Y(y)];
      const b: Pt = [X(x + w), Y(y + h)];
      ink([a, [b[0], a[1]], b, [a[0], b[1]], [a[0], a[1] - 3 * u]], { dur: 0.4, ...o });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.3, head = true } = o;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      ink(shaft, { ...o, at, dur, width: head ? 5 : 3 });
      if (!head) return;
      const end = shaft.at(-1) as Pt;
      const prev = shaft.at(-3) as Pt;
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 18 * u;
      ink(
        [
          [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
          end,
          [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s],
        ],
        { ...o, at: at + dur, dur: 0.1, width: 5 },
      );
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.28;
      const top = Y(y) + ry;
      const bottom = Y(y + h) - ry;
      const half = (cy: number) => ellipse(cx, cy, rx, ry, 24, 0, 0.5);
      const step = dur / 5;
      ink(ellipse(cx, top, rx, ry, 28, Math.PI, 1.05), { ...o, at, dur: step * 1.5 });
      ink(
        [
          [cx - rx, top],
          [cx - rx, bottom],
        ],
        { ...o, at: at + step * 1.5, dur: step * 0.7 },
      );
      ink(half(bottom), { ...o, at: at + step * 2.2, dur: step });
      ink(
        [
          [cx + rx, bottom],
          [cx + rx, top],
        ],
        { ...o, at: at + step * 3.2, dur: step * 0.6 },
      );
      ink(half(top + (bottom - top) / 2), { ...o, at: at + step * 3.8, dur: step });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      write(value, x, y, { at, size, align: "center", dur: 0.25 });
      if (sub)
        write(sub, x, y - (size * 0.8 * u) / H, {
          at: at + 0.2,
          size: size * 0.3,
          align: "center",
        });
      // The big number gets circled in red once it lands.
      if (size >= 80)
        ink(ellipse(X(x), Y(y), size * 1.55 * u, size * 0.8 * u, 40, -Math.PI * 0.75, 1.1), {
          at: at + dur,
          dur: 0.35,
          tone: "bad",
          width: 6,
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check") {
        ink(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.1, cy + s * 0.4],
            [cx + s * 0.6, cy - s * 0.5],
          ],
          { dur: 0.25, ...o },
        );
      } else {
        const at = o.at ?? 0;
        ink(
          [
            [cx - s * 0.5, cy - s * 0.5],
            [cx + s * 0.5, cy + s * 0.5],
          ],
          { dur: 0.12, tone: "bad", ...o },
        );
        ink(
          [
            [cx + s * 0.5, cy - s * 0.5],
            [cx - s * 0.5, cy + s * 0.5],
          ],
          { dur: 0.12, tone: "bad", ...o, at: at + 0.12 },
        );
      }
    },
    finish() {
      const tp = tip as { pt: Pt; color: string } | null;
      if (!tp) return;
      const [x, y] = tp.pt;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI * 0.3);
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 14 * u;
      ctx.shadowOffsetX = 10 * u;
      ctx.shadowOffsetY = 12 * u;
      const L = 190 * u;
      const R = 10 * u;
      ctx.fillStyle = tp.color === INK.bad ? "#C21C25" : "#1B1B1B";
      ctx.beginPath();
      ctx.roundRect(16 * u, -R, L, R * 2, R);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#D9D9D9";
      ctx.fillRect(60 * u, -R, 50 * u, R * 2);
      ctx.fillStyle = "#2A2A2A";
      trace(
        ctx,
        [
          [0, 0],
          [18 * u, -R * 0.7],
          [18 * u, R * 0.7],
        ],
        true,
      );
      ctx.fill();
      ctx.restore();
    },
  };
}

export default {
  id: "napkin-sketch",
  name: "Napkin sketch",
  category: "Hand-drawn",
  make,
} satisfies Style;
