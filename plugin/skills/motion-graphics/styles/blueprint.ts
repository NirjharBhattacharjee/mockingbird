// A drafted cyanotype: white line-work on mottled Prussian blue, a faint
// grid, fold creases, a ruled border and a title block. Each line is preceded
// by a faint construction line run edge to edge, then a glowing plotter head
// inks it; lettering is stencilled capitals in a monospace.
import {
  type Cue,
  along,
  counting,
  curve,
  ellipse,
  frame,
  hash,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const LINE: Record<Tone, string> = {
  ink: "#F2F7FF",
  accent: "#D4E8FF",
  good: "#C4F2D8",
  bad: "#FFC9BE",
  muted: "#93B4DD",
};
const MONO = '"Courier New", "Menlo", "Consolas", monospace';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__blueprint ??= new Map();
  const cache: Map<string, any> = g.__blueprint;
  let tip: Pt | null = null;

  function sheet() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      const gr = b.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.6);
      gr.addColorStop(0, "#1E4E9C");
      gr.addColorStop(1, "#123476");
      b.fillStyle = gr;
      b.fillRect(0, 0, W, H);
      b.filter = `blur(${30 * u}px)`;
      for (let i = 0; i < 24; i++) {
        b.fillStyle = hash(i) > 0.5 ? "rgba(90,140,210,0.10)" : "rgba(8,24,70,0.14)";
        b.beginPath();
        b.ellipse(hash(i + 1) * W, hash(i + 2) * H, (80 + hash(i + 3) * 200) * u, (60 + hash(i + 4) * 120) * u, hash(i + 5) * 3, 0, Math.PI * 2);
        b.fill();
      }
      b.filter = "none";
      // Grid: fine lines, every fifth a little stronger.
      const s = 24 * u;
      for (let i = 0, x = 0; x < W; i++, x += s) {
        b.fillStyle = `rgba(200,225,255,${i % 5 ? 0.05 : 0.1})`;
        b.fillRect(x, 0, 1, H);
      }
      for (let i = 0, y = 0; y < H; i++, y += s) {
        b.fillStyle = `rgba(200,225,255,${i % 5 ? 0.05 : 0.1})`;
        b.fillRect(0, y, W, 1);
      }
      // Fold creases.
      for (const [x, y, w, h] of [
        [W / 3, 0, 2 * u, H],
        [(W * 2) / 3, 0, 2 * u, H],
        [0, H / 2, W, 2 * u],
      ] as const) {
        b.fillStyle = "rgba(0,10,40,0.25)";
        b.fillRect(x, y, w, h);
        b.fillStyle = "rgba(180,210,255,0.08)";
        b.fillRect(x + (w < h ? 2 * u : 0), y + (w < h ? 0 : 2 * u), w, h);
      }
      for (let i = 0; i < (W * H) / 250; i++) {
        b.fillStyle = `rgba(255,255,255,${hash(i * 1.7) * 0.04})`;
        b.fillRect(hash(i * 1.1) * W, hash(i * 2.3 + 1) * H, 1.5 * u, 1.5 * u);
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  /** Draft a path: a construction line flashes along it first, then the plotter inks it. */
  function draft(points: Pt[], { at = 0, dur = 0.5, tone = "ink" as Tone, width = 2.6, dash = false, guide = true } = {}) {
    if (t < at) return;
    const col = LINE[tone];
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (guide) {
      const g0 = progress(t, at - 0.15, 0.25);
      const a = points[0] as Pt;
      const b = points.at(-1) as Pt;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const ex = ((b[0] - a[0]) / len) * 60 * u;
      const ey = ((b[1] - a[1]) / len) * 60 * u;
      ctx.strokeStyle = `rgba(200,225,255,${0.08 + 0.2 * (1 - g0)})`;
      ctx.lineWidth = u;
      trace(ctx, [[a[0] - ex, a[1] - ey], [b[0] + ex, b[1] + ey]]);
      ctx.stroke();
    }
    const p = progress(t, at, dur);
    const { points: drawn } = along(points, p);
    ctx.strokeStyle = col;
    ctx.shadowColor = "rgba(220,235,255,0.6)";
    ctx.shadowBlur = 5 * u;
    ctx.lineWidth = width * u;
    if (dash || tone === "bad") ctx.setLineDash([10 * u, 6 * u]);
    trace(ctx, drawn);
    ctx.stroke();
    ctx.restore();
    if (p < 1) tip = drawn.at(-1) as Pt;
  }

  /** Stencilled capitals that appear letter by letter like a lettering guide. */
  function letter(s: string, x: number, y: number, o: Cue & { size?: number; align?: string; weight?: number } = {}) {
    const { at = 0, size = 30, tone = "ink", align = "left", weight = 700 } = o;
    if (t < at) return 0;
    const dur = o.dur ?? 0.04 * s.length + 0.1;
    const text = s.toUpperCase();
    const n = Math.ceil(text.length * progress(t, at, dur));
    ctx.save();
    ctx.font = `${weight} ${Math.round(size * u)}px ${MONO}`;
    ctx.textBaseline = "middle";
    ctx.letterSpacing = `${size * 0.08 * u}px`;
    const w = ctx.measureText(text).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.textAlign = "left";
    ctx.fillStyle = LINE[tone];
    ctx.shadowColor = "rgba(220,235,255,0.55)";
    ctx.shadowBlur = 4 * u;
    const shown = text.slice(0, n);
    ctx.fillText(shown, left, Y(y));
    if (n < text.length) tip = [left + ctx.measureText(shown).width, Y(y)];
    ctx.restore();
    return w;
  }

  return {
    surface() {
      sheet();
      const f = 26 * u;
      ctx.save();
      ctx.strokeStyle = "rgba(235,244,255,0.75)";
      ctx.lineWidth = 2.5 * u;
      ctx.strokeRect(f, f, W - 2 * f, H - 2 * f);
      ctx.lineWidth = u;
      ctx.strokeRect(f + 8 * u, f + 8 * u, W - 2 * f - 16 * u, H - 2 * f - 16 * u);
      // Zone ticks along the border.
      ctx.font = `600 ${Math.round(11 * u)}px ${MONO}`;
      ctx.fillStyle = "rgba(235,244,255,0.6)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 1; i < 8; i++) {
        const x = f + ((W - 2 * f) * i) / 8;
        ctx.fillRect(x, f, u, 8 * u);
        ctx.fillText(String(i), x - (W - 2 * f) / 16, f - 10 * u);
      }
      // Title block.
      const bw = 300 * u;
      const bh = 70 * u;
      const bx = W - f - 8 * u - bw;
      const by = H - f - 8 * u - bh;
      ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh * 0.5);
      ctx.strokeRect(bx, by + bh * 0.5, bw * 0.5, bh * 0.5);
      ctx.textAlign = "left";
      ctx.font = `700 ${Math.round(16 * u)}px ${MONO}`;
      ctx.fillText("SHEET 1 OF 1", bx + 10 * u, by + bh * 0.25);
      ctx.font = `600 ${Math.round(11 * u)}px ${MONO}`;
      ctx.fillText("DWG NO. EX-01", bx + 10 * u, by + bh * 0.75);
      ctx.fillText("SCALE NTS", bx + bw * 0.5 + 10 * u, by + bh * 0.75);
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.06, y = 0.13, size = 52, at = 0 } = o;
      const w = letter(s, x, y, { ...o, size, at, align: o.align ?? "left", weight: 700 });
      if (!w) return;
      const done = at + (o.dur ?? 0.04 * s.length + 0.1);
      const yy = Y(y) + size * 0.7 * u;
      draft([[X(x), yy], [X(x) + w, yy]], { at: done, dur: 0.3, width: 2 });
    },
    label(s, x, y, o = {}) {
      letter(s, x, y, { size: 22, align: "center", ...o });
    },
    node(x, y, r, o = {}) {
      const at = o.at ?? 0;
      const [cx, cy, R] = [X(x), Y(y), r * u];
      // Centre marks first, then the circle.
      draft([[cx - R * 1.4, cy], [cx + R * 1.4, cy]], { at, dur: 0.08, width: 1, tone: "muted", guide: false });
      draft([[cx, cy - R * 1.4], [cx, cy + R * 1.4]], { at, dur: 0.08, width: 1, tone: "muted", guide: false });
      draft(ellipse(cx, cy, R, R, 48), { ...o, at: at + 0.06, dur: o.dur ?? 0.2, guide: false });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6 } = o;
      const a: Pt = [X(x), Y(y)];
      const b: Pt = [X(x + w), Y(y + h)];
      const q = dur / 4;
      draft([a, [b[0], a[1]]], { ...o, at, dur: q });
      draft([[b[0], a[1]], b], { ...o, at: at + q, dur: q });
      draft([b, [a[0], b[1]]], { ...o, at: at + 2 * q, dur: q });
      draft([[a[0], b[1]], a], { ...o, at: at + 3 * q, dur: q });
      // A dimension line under it once drawn.
      const dy = b[1] + 16 * u;
      draft([[a[0], dy], [b[0], dy]], { at: at + dur, dur: 0.2, tone: "muted", width: 1, guide: false });
      if (t >= at + dur + 0.2) {
        ctx.save();
        ctx.fillStyle = LINE.muted;
        for (const ex of [a[0], b[0]]) ctx.fillRect(ex - u / 2, dy - 6 * u, u, 12 * u);
        ctx.restore();
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true } = o;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      draft(shaft, { ...o, at, dur, width: head ? 2.4 : 1.4, guide: bend === 0 && head });
      if (!head || t < at + dur) return;
      const end = shaft.at(-1) as Pt;
      const prev = shaft.at(-3) as Pt;
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 16 * u;
      ctx.save();
      ctx.fillStyle = LINE[o.tone ?? "ink"];
      trace(ctx, [end, [end[0] - Math.cos(a - 0.3) * s, end[1] - Math.sin(a - 0.3) * s], [end[0] - Math.cos(a + 0.3) * s, end[1] - Math.sin(a + 0.3) * s]], true);
      ctx.fill();
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.3;
      const top = Y(y) + ry;
      const bottom = Y(y + h) - ry;
      const step = dur / 4;
      draft(ellipse(cx, top, rx, ry, 40), { ...o, at, dur: step, guide: false });
      draft([[cx - rx, top], [cx - rx, bottom]], { ...o, at: at + step, dur: step });
      draft([[cx + rx, top], [cx + rx, bottom]], { ...o, at: at + step, dur: step });
      draft(ellipse(cx, bottom, rx, ry, 24, 0, 0.5), { ...o, at: at + step * 2, dur: step, guide: false });
      // Section hatching across the body.
      if (t >= at + step * 3) {
        const p = progress(t, at + step * 3, step);
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - rx, top, rx * 2, (bottom - top) * p);
        ctx.clip();
        ctx.strokeStyle = "rgba(220,235,255,0.35)";
        ctx.lineWidth = u;
        for (let d = -rx * 2; d < bottom - top + rx * 2; d += 12 * u) trace(ctx, [[cx - rx, top + d], [cx + rx, top + d - rx * 2]]), ctx.stroke();
        ctx.restore();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${MONO}`;
      const w = ctx.measureText(value).width;
      ctx.restore();
      // A dimension-style callout box drawn round the number.
      const pad = size * 0.25 * u;
      const bx = X(x) - w / 2 - pad;
      const by = Y(y) - size * 0.6 * u;
      const bw = w + pad * 2;
      const bh = size * 1.2 * u;
      if (size >= 80) draft([[bx, by], [bx + bw, by], [bx + bw, by + bh], [bx, by + bh], [bx, by]], { at, dur: 0.4, tone: "muted", width: 1.4, guide: false });
      letter(value, x, y, { at, dur: 0.01, size, tone, align: "center" });
      if (sub) letter(sub, x, y - (size * 0.95 * u) / H, { at: at + 0.3, size: size * 0.26, align: "center", tone: "ink" });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 32) * u;
      const [cx, cy] = [X(x), Y(y)];
      const at = o.at ?? 0;
      if (kind === "check") {
        draft([[cx - s * 0.5, cy], [cx - s * 0.1, cy + s * 0.4], [cx + s * 0.6, cy - s * 0.5]], { dur: 0.3, tone: "good", ...o, guide: false });
      } else {
        draft([[cx - s * 0.5, cy - s * 0.5], [cx + s * 0.5, cy + s * 0.5]], { dur: 0.15, tone: "bad", ...o, guide: false });
        draft([[cx + s * 0.5, cy - s * 0.5], [cx - s * 0.5, cy + s * 0.5]], { dur: 0.15, tone: "bad", ...o, at: at + 0.15, guide: false });
      }
    },
    finish() {
      if (!tip) return;
      const [x, y] = tip;
      ctx.save();
      const gl = ctx.createRadialGradient(x, y, 0, x, y, 26 * u);
      gl.addColorStop(0, "rgba(255,255,255,0.95)");
      gl.addColorStop(0.2, "rgba(220,235,255,0.6)");
      gl.addColorStop(1, "rgba(200,225,255,0)");
      ctx.fillStyle = gl;
      ctx.fillRect(x - 26 * u, y - 26 * u, 52 * u, 52 * u);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = u;
      trace(ctx, [[x - 14 * u, y], [x + 14 * u, y]]);
      ctx.stroke();
      trace(ctx, [[x, y - 14 * u], [x, y + 14 * u]]);
      ctx.stroke();
      ctx.restore();
    },
  };
}

export default { id: "blueprint", name: "Blueprint", category: "Hand-drawn", make } satisfies Style;
