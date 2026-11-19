// Marbled paper: floated drops of indigo, ochre, sky and sand on a cream
// laid sheet, some pulled into veins and ring-drops. New things land as ink
// drops that spread out in rings; words sit on small bookbinder's labels
// in an italic book face; corrections are a fine red ink line.
import {
  along,
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

const PAPER = "#EFE6D2";
const LABEL = "#F7F1E3";
const INK = "#2A2219";
const TONE: Record<Tone, string> = {
  ink: "#1F2A5C",
  accent: "#C9962E",
  good: "#3B7A57",
  bad: "#A3262A",
  muted: "#8DA9C8",
};
const PIGMENTS = ["#1F2A5C", "#C9962E", "#8DA9C8", "#C8B28A", "#2E6F73"];
const SERIF = '"Charis SIL", serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__marbling ??= new Map();
  const cache: Map<string, any> = g.__marbling;

  /** A blob outline: a circle wobbled by a few slow waves, then dragged sideways by `pull`. */
  function blob(cx: number, cy: number, r: number, seed: number, pull = 0): Pt[] {
    return Array.from({ length: 49 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2;
      const k = 1 + Math.sin(a * 3 + seed) * 0.08 + Math.sin(a * 5 + seed * 2) * 0.05;
      const x = cx + Math.cos(a) * r * k;
      const y = cy + Math.sin(a) * r * k;
      // A tine pull: points near the drop's axis get dragged further.
      return [x + pull * r * Math.exp(-(((y - cy) / r) ** 2) * 3) * (Math.cos(a) > 0 ? 1 : 0.2), y];
    });
  }

  /** The marbled sheet, made once per size. */
  function sheet() {
    const key = `${W}x${H}`;
    let tex = cache.get(key);
    if (tex) return tex;
    tex = new OffscreenCanvas(W, H);
    const c = tex.getContext("2d");
    c.fillStyle = PAPER;
    c.fillRect(0, 0, W, H);
    // Laid lines in the paper.
    c.strokeStyle = "rgba(120,95,60,0.06)";
    c.lineWidth = 1;
    for (let y = 0; y < H; y += 5 * u) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }
    const fill = (pts: Pt[], col: string) => {
      c.fillStyle = col;
      c.beginPath();
      for (const [i, [x, y]] of pts.entries()) i ? c.lineTo(x, y) : c.moveTo(x, y);
      c.closePath();
      c.fill();
    };
    // Real floated marbling: each new drop pushes every earlier outline
    // outward (area-preserving), then a few tine strokes drag it into veins.
    const shapes: { pts: Pt[]; col: string }[] = [];
    for (let i = 0; i < 46; i++) {
      const cx = hash(i * 3.3) * W;
      const cy = hash(i * 5.1 + 2) * H;
      const r = (40 + hash(i * 7.7) * 80) * u;
      for (const sh of shapes)
        sh.pts = sh.pts.map(([x, y]) => {
          const dx = x - cx;
          const dy = y - cy;
          const d2 = dx * dx + dy * dy || 1;
          const k = Math.sqrt(1 + (r * r) / d2);
          return [cx + dx * k, cy + dy * k] as Pt;
        });
      shapes.push({
        pts: Array.from({ length: 160 }, (_, k) => {
          const a = (k / 160) * Math.PI * 2;
          return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as Pt;
        }),
        col: (i % 7 === 6 ? PAPER : PIGMENTS[i % PIGMENTS.length]) as string,
      });
    }
    for (let k = 0; k < 5; k++) {
      const ty = H * (0.1 + k * 0.2);
      const amp = (k % 2 ? -1 : 1) * W * 0.07;
      const lam = H * 0.06;
      for (const sh of shapes)
        sh.pts = sh.pts.map(([x, y]) => [x + (amp * lam) / (Math.abs(y - ty) + lam), y] as Pt);
    }
    for (const sh of shapes) fill(sh.pts, alpha(sh.col, 0.92));
    // A calmer band through the middle where the explanation sits.
    const calm = c.createLinearGradient(0, 0, 0, H);
    calm.addColorStop(0.12, "rgba(239,230,210,0)");
    calm.addColorStop(0.3, "rgba(239,230,210,0.72)");
    calm.addColorStop(0.78, "rgba(239,230,210,0.72)");
    calm.addColorStop(0.95, "rgba(239,230,210,0)");
    c.fillStyle = calm;
    c.fillRect(0, 0, W, H);
    // Paper fibres and a soft wash.
    for (let i = 0; i < 400; i++) {
      c.fillStyle = `rgba(90,70,40,${0.03 + hash(i) * 0.04})`;
      c.fillRect(hash(i * 1.7) * W, hash(i * 2.9) * H, (2 + hash(i * 4.4) * 8) * u, 1 * u);
    }
    cache.set(key, tex);
    return tex;
  }

  /** A paper label with a fine double rule, italic serif inside. Returns its width. */
  function label(
    s: string,
    cx: number,
    cy: number,
    size: number,
    tone: Tone,
    align = "center",
    italic = true,
  ) {
    ctx.font = `${italic ? "italic " : ""}500 ${Math.round(size * u)}px ${SERIF}`;
    const w = ctx.measureText(s).width + size * 1.1 * u;
    const h = size * 1.55 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    const red = tone === "bad";
    ctx.fillStyle = "rgba(40,25,10,0.22)";
    ctx.fillRect(left + 3 * u, cy - h / 2 + 3 * u, w, h);
    ctx.fillStyle = red ? "#F9E4DE" : LABEL;
    ctx.fillRect(left, cy - h / 2, w, h);
    ctx.strokeStyle = red ? TONE.bad : "rgba(42,34,25,0.7)";
    ctx.lineWidth = 1 * u;
    ctx.strokeRect(left + 3 * u, cy - h / 2 + 3 * u, w - 6 * u, h - 6 * u);
    ctx.fillStyle = red ? TONE.bad : INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + w / 2, cy + u);
    return w;
  }

  /** Lay a label down: it settles from a slight tilt as if pressed on. */
  function laid(cx: number, cy: number, at: number | undefined, draw: () => void) {
    const s = spring(t, { start: at ?? 0, stiffness: 180, damping: 15 });
    if (s <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(s * 2);
    ctx.translate(cx, cy);
    ctx.rotate((1 - s) * 0.08);
    ctx.scale(1.08 - 0.08 * s, 1.08 - 0.08 * s);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }

  /** An ink drop spreading in concentric rings from (cx, cy). */
  function drop(cx: number, cy: number, r: number, at: number, colors: string[], seed: number) {
    const p = progress(t, at, 0.7);
    if (p <= 0) return;
    const grow = expo(p);
    for (let k = 0; k < colors.length; k++) {
      const rr = r * grow * (1 - k / (colors.length + 0.5));
      if (rr <= 0) continue;
      ctx.fillStyle = colors[k] as string;
      trace(ctx, blob(cx, cy, rr, seed + k), true);
      ctx.fill();
    }
  }

  return {
    surface() {
      ctx.drawImage(sheet(), 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 40, at = 0, align = "left" } = o;
      ctx.save();
      ctx.font = `italic 500 ${Math.round(size * u)}px ${SERIF}`;
      const w = ctx.measureText(s).width + size * 1.1 * u;
      ctx.restore();
      const cx = align === "center" ? X(x) : align === "right" ? X(x) - w / 2 : X(x) + w / 2;
      laid(cx, Y(y), at, () => label(s, cx, Y(y), size, "ink"));
    },
    label(s, x, y, o = {}) {
      laid(X(x), Y(y), o.at, () =>
        label(s, X(x), Y(y), o.size ?? 28, o.tone ?? "ink", o.align ?? "center"),
      );
    },
    node(x, y, r, o = {}) {
      const tone = o.tone ?? "accent";
      const base = tone === "accent" ? TONE.ink : TONE[tone];
      const second = tone === "accent" ? TONE.accent : PAPER;
      drop(X(x), Y(y), r * u * 1.1, o.at ?? 0, [base, second, base, PAPER], x * 40 + y * 13);
    },
    box(x, y, w, h, o = {}) {
      laid(X(x + w / 2), Y(y + h / 2), o.at, () => {
        const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
        ctx.fillStyle = "rgba(40,25,10,0.25)";
        ctx.fillRect(x0 + 5 * u, y0 + 5 * u, bw, bh);
        ctx.fillStyle = LABEL;
        ctx.fillRect(x0, y0, bw, bh);
        ctx.strokeStyle = o.tone === "good" ? TONE.good : "rgba(42,34,25,0.75)";
        ctx.lineWidth = 1.2 * u;
        ctx.strokeRect(x0 + 6 * u, y0 + 6 * u, bw - 12 * u, bh - 12 * u);
        ctx.lineWidth = 0.6 * u;
        ctx.strokeRect(x0 + 10 * u, y0 + 10 * u, bw - 20 * u, bh - 20 * u);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const { points, angle } = along(pts, expo(p));
      const col = tone === "accent" ? TONE.ink : tone === "ink" ? INK : TONE[tone];
      ctx.save();
      ctx.strokeStyle = col;
      ctx.globalAlpha = head ? 1 : 0.55;
      ctx.lineWidth = (head ? 2 : 1.1) * u;
      ctx.lineCap = "round";
      trace(ctx, points);
      ctx.stroke();
      if (head && p >= 1) {
        arrowhead(ctx, pts.at(-1) as Pt, angle, 12 * u, false);
        ctx.fillStyle = col;
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      // A pool of overlapping ring drops, landing one after another.
      const cx = X(x + w / 2);
      const r = X(w) * 0.7;
      const n = 4;
      for (let i = 0; i < n; i++) {
        const cy = Y(y) + Y(h) * ((i + 0.5) / n);
        const cols =
          i % 2 ? [TONE.accent, PAPER, TONE.accent] : [TONE.ink, TONE.muted, TONE.ink, PAPER];
        drop(
          cx + (hash(i) - 0.5) * r * 0.5,
          cy,
          r * (0.75 + hash(i + 2) * 0.3),
          at + (i / n) * dur,
          cols,
          i * 9 + x * 30,
        );
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      laid(X(x), Y(y), at, () => {
        ctx.font = `600 ${Math.round(size * u)}px ${SERIF}`;
        const w = ctx.measureText(value).width;
        if (sub) {
          const bw = Math.max(w + size * 0.8 * u, size * 2.6 * u);
          const bh = size * 1.75 * u;
          ctx.fillStyle = "rgba(40,25,10,0.25)";
          ctx.fillRect(X(x) - bw / 2 + 5 * u, Y(y) - bh / 2 + 5 * u, bw, bh);
          ctx.fillStyle = LABEL;
          ctx.fillRect(X(x) - bw / 2, Y(y) - bh / 2, bw, bh);
          ctx.strokeStyle = "rgba(42,34,25,0.75)";
          ctx.lineWidth = 1.2 * u;
          ctx.strokeRect(X(x) - bw / 2 + 6 * u, Y(y) - bh / 2 + 6 * u, bw - 12 * u, bh - 12 * u);
          ctx.font = `italic 500 ${Math.round(size * 0.26 * u)}px ${SERIF}`;
          ctx.fillStyle = INK;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(
            sub[0]?.toUpperCase() + sub.slice(1),
            X(x) - bw / 2 + size * 0.25 * u,
            Y(y) - bh / 2 + size * 0.3 * u,
          );
        }
        ctx.font = `600 ${Math.round(size * u)}px ${SERIF}`;
        ctx.fillStyle = tone === "good" ? TONE.good : INK;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const vy = Y(y) + (sub ? size * 0.15 * u : 0);
        ctx.fillText(value, X(x), vy);
        if (tone === "accent") {
          // Circled in red ink once the count lands.
          const q = progress(t, at + dur, 0.4);
          if (q > 0) {
            trace(
              ctx,
              along(
                Array.from({ length: 41 }, (_, i) => {
                  const a = (i / 40) * Math.PI * 2.1 - 2.6;
                  return [
                    X(x) + Math.cos(a) * (w / 2 + 12 * u),
                    vy + Math.sin(a) * size * 0.5 * u,
                  ] as Pt;
                }),
                q,
              ).points,
            );
            ctx.strokeStyle = TONE.bad;
            ctx.lineWidth = 2.5 * u;
            ctx.stroke();
          }
        }
      });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 24) * u;
      const p = progress(t, o.at ?? 0, 0.3);
      if (p <= 0) return;
      const [cx, cy] = [X(x), Y(y)];
      const path: Pt[] =
        kind === "check"
          ? [
              [cx - s * 0.5, cy],
              [cx - s * 0.15, cy + s * 0.4],
              [cx + s * 0.55, cy - s * 0.45],
            ]
          : [
              [cx - s * 0.45, cy - s * 0.45],
              [cx + s * 0.45, cy + s * 0.45],
              [cx, cy],
              [cx + s * 0.45, cy - s * 0.45],
              [cx - s * 0.45, cy + s * 0.45],
            ];
      trace(ctx, along(path, p).points);
      ctx.strokeStyle = TONE.bad;
      ctx.lineWidth = 3 * u;
      ctx.lineCap = "round";
      ctx.stroke();
    },
    finish() {
      // A faint wet sheen gliding across.
      const x = ((t * 0.15) % 1.6) * W - W * 0.3;
      const sheen = ctx.createLinearGradient(x, 0, x + W * 0.3, H);
      sheen.addColorStop(0, "rgba(255,255,255,0)");
      sheen.addColorStop(0.5, "rgba(255,255,255,0.08)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, W, H);
    },
  };
}

export default {
  id: "paper-marbling",
  name: "Marbled paper",
  category: "Generative & Type",
  make,
} satisfies Style;
