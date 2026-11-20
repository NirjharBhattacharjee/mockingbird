// A leaded church window in a stone wall: hand-cut pieces of streaky glass
// held in thick dark lead, light blazing through. Each element is fitted in
// as glass and then lit from behind with a flare; words are painted dark on
// pale banner glass, arrows are strips of amber glass in lead, and a ruby
// ring marks the result.
import {
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

const LEAD = "#1B1714";
const GLASS: Record<Tone, string> = {
  ink: "#EDE3C4",
  accent: "#E2B62C",
  good: "#3E9C5A",
  bad: "#C2262E",
  muted: "#8CA0C8",
};
const PAINT = "#2A1E14";
const SERIF = '"Cormorant Garamond", serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__stainedWindow ??= new Map();

  /** How lit a piece is: dark glass, a flare as light hits it, then steady. */
  function lit(at = 0, dur = 0.5) {
    const p = progress(t, at, dur);
    return { a: expo(p), flare: p > 0 && p < 1 ? Math.sin(p * Math.PI) : 0 };
  }

  /** Fill the current path as glass: colour, streaks, lead round it, flare. */
  function glass(color: string, a: number, flare: number, leadW = 5) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fill();
    if (flare > 0) {
      ctx.fillStyle = `rgba(255,250,230,${flare * 0.7})`;
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = LEAD;
    ctx.lineWidth = leadW * u;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }

  function painted(s: string, x: number, y: number, size: number, align = "center") {
    ctx.font = `600 ${Math.round(size * u)}px ${SERIF}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = PAINT;
    ctx.fillText(s, x, y);
  }

  /** A pale banner of glass with painted words, fitted in and lit. */
  function banner(
    s: string,
    cx: number,
    cy: number,
    size: number,
    align: string,
    at: number,
    tone: Tone = "ink",
  ) {
    const { a, flare } = lit(at, 0.4);
    if (a <= 0) return;
    ctx.save();
    ctx.font = `600 ${Math.round(size * u)}px ${SERIF}`;
    const w = ctx.measureText(s).width + size * 0.9 * u;
    ctx.restore();
    const h = size * 1.5 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    ctx.beginPath();
    ctx.rect(left, cy - h / 2, w, h);
    const fill = tone === "bad" ? "#F2C9CC" : tone === "good" ? "#D9EDD4" : GLASS.ink;
    glass(fill, a, flare, 4);
    ctx.save();
    ctx.globalAlpha = a;
    painted(s, left + w / 2, cy + 1 * u, size, "center");
    ctx.restore();
  }

  return {
    surface() {
      const key = `${W}x${H}`;
      let tile = g.__stainedWindow.get(key);
      if (!tile) {
        tile = new OffscreenCanvas(W, H);
        const c = tile.getContext("2d");
        // Stone wall.
        c.fillStyle = "#6E6253";
        c.fillRect(0, 0, W, H);
        const bh = 40 * u;
        for (let row = 0; row * bh < H; row++) {
          for (let x = row % 2 ? -50 * u : 0; x < W; x += 100 * u) {
            const v = 95 + hash(row * 31 + x) * 25;
            c.fillStyle = `rgb(${v},${v * 0.88},${v * 0.74})`;
            c.fillRect(x + 2 * u, row * bh + 2 * u, 96 * u, bh - 4 * u);
          }
        }
        // The arched opening.
        const [x0, x1, top, bot] = [W * 0.015, W * 0.985, H * 0.02, H * 0.975];
        const spring = top + (x1 - x0) * 0.12;
        const arch = () => {
          c.beginPath();
          c.moveTo(x0, bot);
          c.lineTo(x0, spring);
          c.quadraticCurveTo(x0, top, W / 2, top);
          c.quadraticCurveTo(x1, top, x1, spring);
          c.lineTo(x1, bot);
          c.closePath();
        };
        arch();
        c.fillStyle = LEAD;
        c.fill();
        c.save();
        arch();
        c.clip();
        // Blue field: irregular quads from a jittered grid.
        const s = 46 * u;
        const nx = Math.ceil(W / s) + 2;
        const ny = Math.ceil(H / s) + 2;
        const P = (i: number, j: number): Pt => [
          (i + (hash(i * 7 + j * 131) - 0.5) * 0.7) * s,
          (j + (hash(i * 13 + j * 71 + 5) - 0.5) * 0.7) * s,
        ];
        for (let j = -1; j < ny; j++) {
          for (let i = -1; i < nx; i++) {
            const k = i * 17 + j * 29;
            const q = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
            c.beginPath();
            for (const [n, [px, py]] of q.entries()) n ? c.lineTo(px, py) : c.moveTo(px, py);
            c.closePath();
            const hue = 218 + hash(k) * 30;
            const light = 30 + hash(k + 1) * 22;
            const gr = c.createLinearGradient(q[0][0], q[0][1], q[2][0], q[2][1]);
            gr.addColorStop(0, `hsl(${hue},70%,${light + 8}%)`);
            gr.addColorStop(1, `hsl(${hue},75%,${light - 6}%)`);
            c.fillStyle = gr;
            c.fill();
            c.strokeStyle = LEAD;
            c.lineWidth = 4 * u;
            c.stroke();
          }
        }
        // Border band of small red, gold and green pieces.
        const band = 18 * u;
        c.lineWidth = band;
        const cols = ["#C2262E", "#E2B62C", "#3E9C5A", "#C2262E"];
        c.setLineDash([band * 0.9, band * 0.25]);
        arch();
        c.strokeStyle = cols[0];
        c.stroke();
        c.lineDashOffset = band * 0.6;
        c.setLineDash([band * 0.4, band * 1.6]);
        c.strokeStyle = "#E2B62C";
        c.stroke();
        c.restore();
        c.setLineDash([]);
        arch();
        c.lineWidth = 8 * u;
        c.strokeStyle = "#4B4036";
        c.stroke();
        g.__stainedWindow.set(key, tile);
      }
      ctx.drawImage(tile, 0, 0);
      // Daylight moving across the window: a broad bright band.
      const lx = (((t * 0.08) % 1.3) - 0.15) * W;
      const sun = ctx.createLinearGradient(lx - W * 0.25, 0, lx + W * 0.25, H);
      sun.addColorStop(0, "rgba(255,240,200,0)");
      sun.addColorStop(0.5, "rgba(255,240,200,0.12)");
      sun.addColorStop(1, "rgba(255,240,200,0)");
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, W, H);
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.085, size = 40, at = 0 } = o;
      ctx.save();
      ctx.font = `600 ${Math.round(size * u)}px ${SERIF}`;
      const w = ctx.measureText(s).width + size * 0.9 * u;
      ctx.restore();
      const align = o.align ?? "left";
      banner(s, align === "left" ? X(x) : X(x), Y(y), size, align, at);
      void w;
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 24, align = "center", tone = "ink" } = o;
      banner(s, X(x), Y(y), size, align, at, tone);
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const { a, flare } = lit(at, 0.4);
      if (a <= 0) return;
      const R = r * u;
      const [cx, cy] = [X(x), Y(y)];
      // A roundel: ring of alternating red and gold pieces round a pale centre.
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, R, a0, a1);
        ctx.arc(cx, cy, R * 0.55, a1, a0, true);
        ctx.closePath();
        glass(i % 2 ? GLASS.bad : GLASS[tone], a, flare, 2.5);
      }
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2);
      glass("#8FC6E8", a, flare, 2.5);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const { a, flare } = lit(at, 0.5);
      if (a <= 0) return;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      ctx.beginPath();
      ctx.rect(x0, y0, bw, bh);
      glass(tone === "good" ? "#DDEBD3" : GLASS.ink, a, flare, 7);
      // A thin coloured border of glass inside the lead.
      ctx.beginPath();
      ctx.rect(x0 + 10 * u, y0 + 10 * u, bw - 20 * u, bh - 20 * u);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = GLASS[tone === "ink" ? "accent" : tone];
      ctx.lineWidth = 5 * u;
      ctx.stroke();
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      const color = GLASS[tone === "ink" ? "accent" : tone];
      ctx.save();
      ctx.lineCap = "butt";
      ctx.lineJoin = "round";
      trace(ctx, shown);
      ctx.strokeStyle = LEAD;
      ctx.lineWidth = (head ? 15 : 5) * u;
      ctx.stroke();
      if (head) {
        trace(ctx, shown);
        ctx.strokeStyle = color;
        ctx.lineWidth = 8 * u;
        ctx.stroke();
        // Lead joints across the strip at intervals.
        for (let i = 4; i < shown.length - 1; i += 5) {
          const [a, b] = [shown[i - 1] as Pt, shown[i] as Pt];
          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(b[0] + Math.cos(ang) * 6 * u, b[1] + Math.sin(ang) * 6 * u);
          ctx.lineTo(b[0] - Math.cos(ang) * 6 * u, b[1] - Math.sin(ang) * 6 * u);
          ctx.strokeStyle = LEAD;
          ctx.lineWidth = 2.5 * u;
          ctx.stroke();
        }
      } else {
        trace(ctx, shown);
        ctx.strokeStyle = "rgba(245,215,120,0.85)";
        ctx.lineWidth = 2.5 * u;
        ctx.stroke();
      }
      ctx.restore();
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 22 * u;
        ctx.beginPath();
        ctx.moveTo(end[0] + Math.cos(ang) * 4 * u, end[1] + Math.sin(ang) * 4 * u);
        ctx.lineTo(end[0] - Math.cos(ang - 0.5) * s, end[1] - Math.sin(ang - 0.5) * s);
        ctx.lineTo(end[0] - Math.cos(ang + 0.5) * s, end[1] - Math.sin(ang + 0.5) * s);
        ctx.closePath();
        glass(color, 1, 0, 3);
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "muted" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const cx = (x0 + x1) / 2;
      const rx = (x1 - x0) / 2;
      const ry = rx * 0.3;
      // A drum built from stacked glass bands, fitted bottom to top.
      const n = 4;
      const bandH = (y1 - y0 - 2 * ry) / n;
      for (let i = n - 1; i >= 0; i--) {
        const { a, flare } = lit(at + ((n - 1 - i) * dur) / (n + 1), 0.35);
        const top = y0 + ry + i * bandH;
        const pts: Pt[] = [
          ...ellipse(cx, top, rx, ry, 16, Math.PI, -0.5),
          ...ellipse(cx, top + bandH, rx, ry, 16, 0, 0.5),
        ];
        trace(ctx, pts, true);
        glass(i % 2 ? GLASS[tone] : "#5B78B8", a, flare, 4);
      }
      const { a, flare } = lit(at + dur * 0.8, 0.35);
      trace(ctx, ellipse(cx, y0 + ry, rx, ry, 30), true);
      glass(GLASS.accent, a, flare, 4);
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      const { a, flare } = lit(at, 0.4);
      if (a <= 0) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${SERIF}`;
      const w = ctx.measureText(value).width;
      ctx.restore();
      if (sub) {
        const bw = Math.max(w, size * 2.2 * u) + 40 * u;
        const bh = size * 1.9 * u;
        ctx.beginPath();
        ctx.rect(X(x) - bw / 2, Y(y) - bh * 0.55, bw, bh);
        glass(GLASS.ink, a, flare, 7);
        ctx.save();
        ctx.globalAlpha = a;
        painted(sub, X(x), Y(y) - bh * 0.33, size * 0.32);
        painted(value, X(x), Y(y) + size * 0.12 * u, size);
        ctx.restore();
        // A gold-and-ruby ring fitted round it once it lands.
        const r = lit(at + dur + 0.1, 0.4);
        if (r.a > 0) {
          ctx.save();
          ctx.globalAlpha = r.a;
          trace(ctx, ellipse(X(x), Y(y) + size * 0.1 * u, w * 0.72, size * 0.62 * u, 40), true);
          ctx.strokeStyle = LEAD;
          ctx.lineWidth = 14 * u;
          ctx.stroke();
          ctx.strokeStyle = r.flare > 0 ? "#FFE9A0" : GLASS.accent;
          ctx.lineWidth = 7 * u;
          ctx.stroke();
          ctx.restore();
        }
      } else {
        ctx.save();
        ctx.globalAlpha = a;
        painted(value, X(x), Y(y), size);
        ctx.restore();
      }
      void clamp;
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 34 } = o;
      const { a, flare } = lit(at, 0.35);
      if (a <= 0) return;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      const path: Pt[] =
        kind === "check"
          ? [
              [cx - s * 0.5, cy],
              [cx - s * 0.12, cy + s * 0.4],
              [cx + s * 0.6, cy - s * 0.5],
            ]
          : [
              [cx - s * 0.45, cy - s * 0.45],
              [cx + s * 0.45, cy + s * 0.45],
            ];
      const draw = (pp: Pt[]) => {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        trace(ctx, pp);
        ctx.strokeStyle = LEAD;
        ctx.lineWidth = 14 * u;
        ctx.stroke();
        ctx.strokeStyle = flare > 0 ? "#FFFBE0" : kind === "check" ? GLASS.good : GLASS.bad;
        ctx.lineWidth = 8 * u;
        ctx.stroke();
        ctx.restore();
      };
      draw(path);
      if (kind === "cross")
        draw([
          [cx + s * 0.45, cy - s * 0.45],
          [cx - s * 0.45, cy + s * 0.45],
        ]);
    },
    finish() {
      // Dusty rays falling from the upper left.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 4; i++) {
        const x = W * (0.1 + i * 0.22) + Math.sin(t * 0.3 + i) * 10 * u;
        const ray = ctx.createLinearGradient(x, 0, x + W * 0.2, H);
        ray.addColorStop(0, "rgba(255,240,200,0.07)");
        ray.addColorStop(1, "rgba(255,240,200,0)");
        ctx.fillStyle = ray;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 50 * u, 0);
        ctx.lineTo(x + W * 0.25, H);
        ctx.lineTo(x + W * 0.15, H);
        ctx.fill();
      }
      ctx.restore();
    },
  };
}

export default {
  id: "stained-glass",
  name: "Cathedral glass",
  category: "Painterly",
  make,
} satisfies Style;
