// Vienna-method picture statistics: cream litho paper, three muted inks,
// flat identical pictograms on a strict grid where each figure stands for a
// fixed amount, spaced geometric capitals. Everything is stamped on in
// stepped, twelve-a-second timing: a symbol is either there or not, with a
// heavier first impression that settles.
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

const PAPER = "#EEE7D6";
const INK = "#2A2522";
const TONE: Record<Tone, string> = {
  ink: INK,
  accent: "#2F5375",
  good: "#2F5375",
  bad: "#C8402F",
  muted: "#D7A23B",
};
const SANS = '"Montserrat", "Noto Color Emoji", sans-serif';

function make(ctx: any, t0: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const t = Math.floor(t0 * 12) / 12;
  const font = (size: number, w = 700) => `${w} ${Math.round(size * u)}px ${SANS}`;
  const g = globalThis as any;
  g.__isotypePaper ??= new Map();
  const cache: Map<string, any> = g.__isotypePaper;

  /** Stamp state: hidden, a heavy first impression for a frame or two, then settled. */
  const stamp = (at = 0) => (t < at ? 0 : t < at + 2 / 12 ? 1.12 : 1);

  function stamped(cx: number, cy: number, at: number | undefined, draw: () => void) {
    const s = stamp(at);
    if (!s) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }

  function caps(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align = "left",
    w = 700,
  ) {
    ctx.save();
    ctx.font = font(size, w);
    ctx.letterSpacing = `${Math.round(size * 0.14 * u)}px`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s.toUpperCase(), x, y);
    ctx.restore();
  }

  /** The pictogram for one unit: a standing figure, head and body, `h` tall. */
  function figure(cx: number, base: number, h: number, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, base - h * 0.83, h * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - h * 0.2, base - h * 0.64);
    ctx.lineTo(cx + h * 0.2, base - h * 0.64);
    ctx.lineTo(cx + h * 0.24, base - h * 0.28);
    ctx.lineTo(cx + h * 0.12, base - h * 0.28);
    ctx.lineTo(cx + h * 0.12, base);
    ctx.lineTo(cx - h * 0.12, base);
    ctx.lineTo(cx - h * 0.12, base - h * 0.28);
    ctx.lineTo(cx - h * 0.24, base - h * 0.28);
    ctx.closePath();
    ctx.fill();
  }

  function paper() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const x = c.getContext("2d");
      x.fillStyle = PAPER;
      x.fillRect(0, 0, W, H);
      for (let i = 0; i < 3000; i++) {
        x.fillStyle = hash(i) > 0.5 ? "rgba(255,255,250,0.10)" : "rgba(90,70,40,0.06)";
        x.fillRect(
          hash(i * 1.7) * W,
          hash(i * 2.3) * H,
          (1 + hash(i * 3.1) * 2) * u,
          (1 + hash(i * 4.9) * 2) * u,
        );
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  return {
    surface() {
      paper();
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.08, size = 46, at = 0 } = o;
      if (!stamp(at)) return;
      ctx.font = font(size);
      const gap = Math.round(size * 0.14 * u);
      ctx.letterSpacing = `${gap}px`;
      // Canvas adds the spacing after the last letter too; it isn't drawn.
      const w = ctx.measureText(s.toUpperCase()).width - gap;
      ctx.letterSpacing = "0px";
      const left = leftOf(X(x), w, o.align);
      caps(s, left, Y(y), size, INK);
      // the rule steps out in stamp-sized pieces
      const steps = clamp(Math.floor((t - at) * 12) / 6);
      ctx.fillStyle = INK;
      ctx.fillRect(left, Y(y) + size * 0.75 * u, w * steps, 3 * u);
    },
    label(s, x, y, o = {}) {
      const { size = 28, align = "center", tone = "ink", at = 0 } = o;
      stamped(X(x), Y(y), at, () => caps(s, X(x), Y(y), size, TONE[tone], align));
    },
    node(x, y, r, o = {}) {
      const h = r * u * 2.6;
      stamped(X(x), Y(y), o.at, () => figure(X(x), Y(y) + h / 2, h, TONE[o.tone ?? "accent"]));
    },
    box(x, y, w, h, o = {}) {
      const tone = o.tone ?? "ink";
      stamped(X(x + w / 2), Y(y + h / 2), o.at, () => {
        ctx.fillStyle = "rgba(42,37,34,0.10)";
        ctx.fillRect(X(x), Y(y), X(w), Y(h));
        ctx.fillStyle = TONE[tone];
        ctx.fillRect(X(x), Y(y), X(w), 10 * u);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.3, bend = 0, head = true, tone = "ink" } = o;
      if (t < at) return;
      // flat arrows arrive whole, in three stamped steps
      const p = clamp(Math.ceil(((t - at) / (dur || 1e-6)) * 3) / 3);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 24);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      trace(ctx, shown);
      ctx.strokeStyle = head ? TONE[tone] : "rgba(47,83,117,0.45)";
      ctx.lineWidth = (head ? 10 : 2) * u;
      ctx.lineCap = "butt";
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 22 * u;
        const tip: Pt = [end[0] + Math.cos(a) * s * 0.4, end[1] + Math.sin(a) * s * 0.4];
        ctx.beginPath();
        ctx.moveTo(tip[0], tip[1]);
        ctx.lineTo(
          tip[0] - Math.cos(a) * s + Math.cos(a + Math.PI / 2) * s * 0.7,
          tip[1] - Math.sin(a) * s + Math.sin(a + Math.PI / 2) * s * 0.7,
        );
        ctx.lineTo(
          tip[0] - Math.cos(a) * s - Math.cos(a + Math.PI / 2) * s * 0.7,
          tip[1] - Math.sin(a) * s - Math.sin(a + Math.PI / 2) * s * 0.7,
        );
        ctx.closePath();
        ctx.fillStyle = TONE[tone];
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      // rows of identical figures stamped out row by row, the last one partial
      const at = o.at ?? 0;
      const dur = o.dur ?? 0.8;
      // A store with no width or height has nothing to fill, and would divide by zero.
      if (X(w) <= 0 || Y(h) <= 0) return;
      const cols = 3;
      const cw = X(w) / cols;
      const rows = Math.max(2, Math.floor(Y(h) / (cw * 1.3)));
      const rh = Y(h) / rows;
      const total = rows * cols;
      for (let i = 0; i < total; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        if (t < at + (i / total) * dur) continue;
        const fh = Math.min(rh * 0.9, cw * 1.3);
        const cx = X(x) + cw * (c + 0.5);
        const base = Y(y) + rh * (r + 1) - rh * 0.05;
        if (i === total - 1) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(cx - cw / 2, base - fh, cw * 0.55, fh);
          ctx.clip();
          figure(cx, base, fh, r % 2 ? TONE.muted : TONE.accent);
          ctx.restore();
        } else figure(cx, base, fh, r % 2 ? TONE.muted : TONE.accent);
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "ink" } = o;
      if (t < at) return;
      // numerals re-stamped each step rather than rolling smoothly
      const str = count ? counting(t, at, dur, count) + s : s;
      stamped(X(x), Y(y), at, () => {
        ctx.font = font(size);
        ctx.fillStyle = tone === "good" || tone === "accent" ? INK : TONE[tone];
        if (sub) ctx.fillStyle = TONE.bad;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(str, X(x), Y(y) - (sub ? size * 0.1 * u : 0));
        if (sub) caps(sub, X(x), Y(y) - size * 0.85 * u, size * 0.26, TONE.bad, "center");
      });
      if (sub && count) {
        // a row of ten ticks under it, filled to the count
        const n = Math.round((Number(counting(t, at, dur, count).replace(/,/g, "")) / 100) * 10);
        const step = size * 0.4 * u;
        for (let i = 0; i < 10; i++) {
          const cx = X(x) + (i - 4.5) * step;
          const cy = Y(y) + size * 0.8 * u;
          ctx.save();
          ctx.strokeStyle = i < n ? TONE.accent : "rgba(42,37,34,0.18)";
          ctx.lineWidth = step * 0.22;
          ctx.lineCap = "butt";
          trace(ctx, [
            [cx - step * 0.32, cy],
            [cx - step * 0.08, cy + step * 0.25],
            [cx + step * 0.35, cy - step * 0.3],
          ]);
          ctx.stroke();
          ctx.restore();
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 28) * u;
      stamped(X(x), Y(y), o.at, () => {
        ctx.save();
        ctx.strokeStyle = kind === "check" ? TONE.accent : TONE.bad;
        ctx.lineWidth = r * 0.36;
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
        const [cx, cy] = [X(x), Y(y)];
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.65, cy],
            [cx - r * 0.15, cy + r * 0.5],
            [cx + r * 0.75, cy - r * 0.6],
          ]);
        else {
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.55, cy - r * 0.55);
          ctx.lineTo(cx + r * 0.55, cy + r * 0.55);
          ctx.moveTo(cx + r * 0.55, cy - r * 0.55);
          ctx.lineTo(cx - r * 0.55, cy + r * 0.55);
        }
        ctx.stroke();
        ctx.restore();
      });
    },
    finish() {},
  };
}

export default {
  id: "isotype",
  name: "Picture statistics",
  category: "Data & Information",
  make,
} satisfies Style;
