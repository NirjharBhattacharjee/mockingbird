// Pop-art comic: cream paper, thick black outlines, halftone dots in flat
// print colours, caption boxes, speech-bubble lettering, starbursts that
// count up, fat yellow arrows. Everything pops in on a spring.
import {
  arrowhead,
  clamp,
  counting,
  curve,
  frame,
  hash,
  type Look,
  type Pt,
  type Style,
  spring,
  type Tone,
  trace,
} from "./look.ts";

const INK = "#141414";
const PAPER = "#F2EAD7";
const CREAM = "#FDF9EE";
const FILL: Record<Tone, string> = {
  ink: CREAM,
  accent: "#FFE45C",
  good: "#3F72C9",
  bad: "#E63946",
  muted: "#E9DFC6",
};
const LETTER = '"Bangers", "Impact", "Haettenschweiler", "Arial Narrow", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const letter = (size: number) => `italic 400 ${Math.round(size * u)}px ${LETTER}`;
  const pop = (at = 0) => spring(t, { start: at, stiffness: 260, damping: 14 });
  const g = globalThis as any;
  g.__comicDots ??= new Map();
  const cache: Map<string, any> = g.__comicDots;

  /** A flat gradient printed as halftone: the darker colour as dots that grow across it. */
  function halftone(x: number, y: number, w: number, h: number, light: string, dark: string) {
    const key = `${Math.round(w)}x${Math.round(h)}:${light}:${dark}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(Math.ceil(w), Math.ceil(h));
      const c = tile.getContext("2d");
      c.fillStyle = light;
      c.fillRect(0, 0, w, h);
      c.fillStyle = dark;
      const s = 18 * u;
      for (let row = 0, py = 0; py < h + s; row++, py += s * 0.87) {
        for (let px = row % 2 ? s / 2 : 0; px < w + s; px += s) {
          const f = clamp((px / w) * 0.6 + (py / h) * 0.4);
          c.beginPath();
          c.arc(px, py, s * (0.12 + 0.46 * f), 0, Math.PI * 2);
          c.fill();
        }
      }
      cache.set(key, tile);
    }
    ctx.drawImage(tile, x, y);
  }

  /** Comic lettering centred at (cx, cy) pixels. */
  function letters(s: string, cx: number, cy: number, size: number, color = INK, align = "center") {
    ctx.font = letter(size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s.toUpperCase(), cx, cy);
  }

  /** Scale what `draw` draws about (cx, cy) by the spring that starts at `at`. */
  function popped(cx: number, cy: number, at: number | undefined, draw: () => void) {
    const s = pop(at);
    if (s <= 0) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }

  return {
    surface() {
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      const m0 = 0.02 * H;
      halftone(m0, m0, W - m0 * 2, H - m0 * 2, "#B9CDEB", "#3F72C9");
      ctx.lineWidth = 7 * u;
      ctx.strokeStyle = INK;
      ctx.strokeRect(m0, m0, W - m0 * 2, H - m0 * 2);
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.06, size = 40, at = 0 } = o;
      if (t < at) return;
      ctx.save();
      ctx.globalAlpha = clamp((t - at) / 0.2);
      ctx.font = letter(size);
      const tw = ctx.measureText(s.toUpperCase()).width + 34 * u;
      ctx.fillStyle = "#FFE45C";
      ctx.fillRect(X(x), Y(y), tw, size * 1.5 * u);
      ctx.lineWidth = 4 * u;
      ctx.strokeStyle = INK;
      ctx.strokeRect(X(x), Y(y), tw, size * 1.5 * u);
      letters(s, X(x) + 16 * u, Y(y) + size * 0.78 * u, size, INK, "left");
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      popped(X(x), Y(y), o.at, () =>
        letters(s, X(x), Y(y), o.size ?? 34, INK, o.align ?? "center"),
      );
    },
    node(x, y, r, o = {}) {
      popped(X(x), Y(y), o.at, () => {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), r * u, 0, Math.PI * 2);
        ctx.fillStyle = FILL[o.tone ?? "accent"];
        ctx.fill();
        ctx.lineWidth = 5 * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
      });
    },
    box(x, y, w, h, o = {}) {
      popped(X(x + w / 2), Y(y + h / 2), o.at, () => {
        ctx.fillStyle = FILL[o.tone ?? "ink"];
        ctx.fillRect(X(x), Y(y), X(w), Y(h));
        ctx.lineWidth = 6 * u;
        ctx.strokeStyle = INK;
        ctx.strokeRect(X(x), Y(y), X(w), Y(h));
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      const p = clamp((t - at) / dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      trace(ctx, shown);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 20 * u;
      ctx.stroke();
      trace(ctx, shown);
      ctx.strokeStyle = FILL[tone === "ink" ? "accent" : tone];
      ctx.lineWidth = 12 * u;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 38 * u, false);
        ctx.fillStyle = FILL[tone === "ink" ? "accent" : tone];
        ctx.fill();
        ctx.lineWidth = 5 * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      popped(X(x + w / 2), Y(y + h / 2), o.at, () => {
        const n = 4;
        for (let i = n - 1; i >= 0; i--) {
          const cy = Y(y) + (Y(h) / n) * i;
          ctx.beginPath();
          ctx.roundRect(X(x) + i * 6 * u, cy, X(w), Y(h) / n - 6 * u, 10 * u);
          ctx.fillStyle = i % 2 ? "#FFE45C" : CREAM;
          ctx.fill();
          ctx.lineWidth = 5 * u;
          ctx.strokeStyle = INK;
          ctx.stroke();
        }
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "bad" } = o;
      popped(X(x), Y(y), at, () => {
        const r = size * 2 * u;
        ctx.save();
        ctx.translate(X(x), Y(y));
        ctx.rotate(Math.sin(t * 9) * 0.02);
        const n = 16;
        const pts: Pt[] = Array.from({ length: n * 2 }, (_, i) => {
          const a = (i / (n * 2)) * Math.PI * 2;
          const rr = i % 2 ? r * 0.7 : r * (0.95 + hash(i) * 0.12);
          return [Math.cos(a) * rr, Math.sin(a) * rr];
        });
        trace(ctx, pts, true);
        ctx.fillStyle = FILL[tone];
        ctx.fill();
        ctx.lineWidth = 6 * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
        const color = tone === "ink" || tone === "accent" ? INK : CREAM;
        letters(
          count ? counting(t, at, dur, count) + s : s,
          0,
          sub ? -size * 0.15 * u : 0,
          size,
          color,
        );
        if (sub) letters(sub, 0, size * 0.62 * u, size * 0.36, color);
        ctx.restore();
      });
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 40) * u;
      popped(X(x), Y(y), o.at, () => {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), r, 0, Math.PI * 2);
        ctx.fillStyle = kind === "check" ? "#2563EB" : "#E63946";
        ctx.fill();
        ctx.lineWidth = 5 * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.lineWidth = 9 * u;
        ctx.strokeStyle = CREAM;
        ctx.lineCap = "round";
        const [cx, cy] = [X(x), Y(y)];
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.45, cy],
            [cx - r * 0.1, cy + r * 0.35],
            [cx + r * 0.5, cy - r * 0.35],
          ]);
        else {
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.4, cy - r * 0.4);
          ctx.lineTo(cx + r * 0.4, cy + r * 0.4);
          ctx.moveTo(cx + r * 0.4, cy - r * 0.4);
          ctx.lineTo(cx - r * 0.4, cy + r * 0.4);
        }
        ctx.stroke();
      });
    },
    finish() {},
  };
}

export default { id: "comic", name: "Halftone comic", category: "Print", make } satisfies Style;
