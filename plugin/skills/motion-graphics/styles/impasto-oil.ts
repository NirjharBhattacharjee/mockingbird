// Thick oil paint on a swirling night sky: every mark is a fat daub with a
// dark edge, a coloured body and a lit ridge, laid on along its path. Chrome
// yellow for the idea, vermilion for the fix, cream for structure.
import {
  type Align,
  along,
  clamp,
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

const PAINT: Record<Tone, [string, string, string]> = {
  // shadow edge, body, highlight ridge
  ink: ["#2A2E44", "#EDE3C4", "#FFFBEA"],
  accent: ["#6B4A0E", "#F2C230", "#FFF0A0"],
  good: ["#1E4A2A", "#7CC36A", "#D6F5B8"],
  bad: ["#5A140E", "#E0432B", "#FFB08E"],
  muted: ["#232B4A", "#8FA3C8", "#D5E0F2"],
};
const FACE = '"Cooper Black", "Rockwell Extra Bold", "Bookman Old Style", Georgia, serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__impastoSky ??= new Map();
  const cache: Map<string, any> = g.__impastoSky;
  let seed = 5;

  /** The flow the sky's strokes follow: bands with a few whirlpools. */
  function flow(x: number, y: number) {
    let a = Math.sin(y / (H * 0.08) + x / (W * 0.3)) * 0.35;
    for (const [cx, cy, r] of [
      [0.3, 0.15, 0.16],
      [0.82, 0.22, 0.12],
      [0.55, 0.45, 0.1],
    ] as const) {
      const dx = x - cx * W;
      const dy = y - cy * H;
      const d = Math.hypot(dx, dy) / (r * Math.min(W, H) * 2.2);
      if (d < 1.4) a = lerpA(a, Math.atan2(dy, dx) + Math.PI / 2, clamp(1.4 - d));
    }
    return a;
  }

  /** The painted sky and hills, made once per size: thousands of short loaded strokes. */
  function sky() {
    const key = `${W}x${H}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      c.fillStyle = "#1E3A7A";
      c.fillRect(0, 0, W, H);
      c.lineCap = "round";
      const blues = ["#14265A", "#1D3A80", "#2A55A6", "#3A6CBE", "#6F9AD8", "#A9C8EC", "#E2EEFA"];
      const greens = ["#1E4A2C", "#2F6B3A", "#4C8A44", "#173A26", "#6FA455"];
      const n = Math.floor((W * H) / (150 * u * u));
      for (let i = 0; i < n; i++) {
        const x = hash(i * 1.1) * W;
        const y = hash(i * 2.3 + 7) * H;
        const hill =
          H * (0.83 + Math.sin(x / (W * 0.18)) * 0.04 + Math.sin(x / (W * 0.07)) * 0.015);
        const inHill = y > hill;
        const a = inHill ? Math.sin(x / (W * 0.1)) * 0.25 : flow(x, y);
        const l = (18 + hash(i * 3.3) * 22) * u;
        const w = (6 + hash(i * 5.1) * 4) * u;
        const pal = inHill ? greens : blues;
        // Light and dark bands that follow the swirl, so the flow reads from afar.
        const band = Math.sin(y / (H * 0.035) + Math.sin(x / (W * 0.12)) * 2 + a * 2) * 0.5 + 0.5;
        const pick = inHill
          ? hash(i * 4.7) * pal.length
          : clamp(band * 0.75 + hash(i * 4.7) * 0.35) * 5.99 + (hash(i * 9.1) > 0.95 ? 1 : 0);
        const col = (pal[Math.floor(pick)] ?? pal[0]) as string;
        const [dx, dy] = [(Math.cos(a) * l) / 2, (Math.sin(a) * l) / 2];
        c.lineWidth = w;
        c.strokeStyle = "rgba(10,18,40,0.45)";
        c.beginPath();
        c.moveTo(x - dx + w * 0.25, y - dy + w * 0.3);
        c.lineTo(x + dx + w * 0.25, y + dy + w * 0.3);
        c.stroke();
        c.strokeStyle = col;
        c.beginPath();
        c.moveTo(x - dx, y - dy);
        c.lineTo(x + dx, y + dy);
        c.stroke();
        c.lineWidth = w * 0.3;
        c.strokeStyle = "rgba(255,255,255,0.22)";
        c.beginPath();
        c.moveTo(x - dx - w * 0.2, y - dy - w * 0.25);
        c.lineTo(x + dx - w * 0.2, y + dy - w * 0.25);
        c.stroke();
      }
      cache.set(key, tile);
    }
    ctx.drawImage(tile, 0, 0);
  }

  /** A fat lit daub laid along `points` from `at` over `dur`. */
  function daub(points: Pt[], { at = 0, dur = 0.5, tone = "accent" as Tone, width = 14 } = {}) {
    seed += 1;
    const p = progress(t, at, dur);
    if (p <= 0) return null;
    const { points: drawn, angle } = along(roughen(points, 1.4 * u, seed * 5.7), 1 - (1 - p) ** 2);
    const [dark, body, hi] = PAINT[tone];
    const w = width * u;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.translate(w * 0.14, w * 0.18);
    trace(ctx, drawn);
    ctx.strokeStyle = dark;
    ctx.lineWidth = w * 1.15;
    ctx.stroke();
    ctx.translate(-w * 0.14, -w * 0.18);
    trace(ctx, drawn);
    ctx.strokeStyle = body;
    ctx.lineWidth = w;
    ctx.stroke();
    // Bristle grooves through the body, then the lit ridge.
    for (const [off, col, lw] of [
      [0.22, "rgba(0,0,0,0.16)", 0.12],
      [-0.2, hi, 0.22],
      [-0.32, "rgba(255,255,255,0.5)", 0.08],
    ] as const) {
      ctx.save();
      ctx.translate(off * w * 0.6, off * w);
      trace(ctx, drawn);
      ctx.strokeStyle = col;
      ctx.lineWidth = w * lw;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    return { end: drawn.at(-1) as Pt, angle, done: p >= 1 };
  }

  /** Lettering in thick paint: a dark edge, a body, a lit top; swept on left to right. */
  function letters(
    s: string,
    x: number,
    y: number,
    size: number,
    o: { at?: number; dur?: number; tone?: Tone; align?: Align } = {},
  ) {
    const { at = 0, tone = "accent", align = "left" } = o;
    const dur = o.dur ?? 0.03 * s.length + 0.2;
    const p = progress(t, at, dur);
    if (p <= 0) return 0;
    const [dark, body, hi] = PAINT[tone];
    ctx.save();
    ctx.font = `italic 900 ${Math.round(size * u)}px ${FACE}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 10 * u, y - size * u, (w + 20 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, size * 0.14 * u);
    ctx.strokeStyle = dark;
    ctx.strokeText(s, left + size * 0.04 * u, y + size * 0.05 * u);
    ctx.fillStyle = dark;
    ctx.fillText(s, left + size * 0.04 * u, y + size * 0.05 * u);
    const gr = ctx.createLinearGradient(0, y - size * 0.5 * u, 0, y + size * 0.5 * u);
    gr.addColorStop(0, hi);
    gr.addColorStop(0.45, body);
    gr.addColorStop(1, body);
    ctx.fillStyle = gr;
    ctx.fillText(s, left, y);
    ctx.restore();
    return w;
  }

  /** Concentric painted rings, the swirl the sky makes round a star. */
  function rings(cx: number, cy: number, R: number, at: number, tone: Tone, k: number) {
    for (let i = 0; i < k; i++) {
      const r = R * (1 - i * 0.3);
      if (r <= 2 * u) break;
      daub(ellipse(cx, cy, r, r, 30, -Math.PI / 2 + i, 0.95), {
        at: at + i * 0.08,
        dur: 0.3,
        tone: i === 1 ? "bad" : tone,
        width: Math.max(4, R / u / 6),
      });
    }
  }

  return {
    surface() {
      sky();
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.08, size = 56, at = 0, tone = "accent", align = "left" } = o;
      letters(s, X(x), Y(y), size, { at, dur: o.dur, tone, align });
    },
    label(s, x, y, o = {}) {
      letters(s, X(x), Y(y), o.size ?? 34, {
        at: o.at ?? 0,
        dur: o.dur,
        tone: o.tone === "accent" ? "accent" : (o.tone ?? "ink"),
        align: o.align ?? "center",
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const R = r * u;
      const p = progress(t, at, 0.4);
      if (p <= 0) return;
      // A halo that pulses ring by ring, then the star's own rings.
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + x * 10);
      const gr = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), R * 2.2);
      gr.addColorStop(0, `rgba(255,236,150,${0.35 * p})`);
      gr.addColorStop(0.6, `rgba(255,236,150,${0.1 * p * (0.6 + 0.4 * pulse)})`);
      gr.addColorStop(1, "rgba(255,236,150,0)");
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R * 2.2, 0, Math.PI * 2);
      ctx.fill();
      rings(X(x), Y(y), R, at, tone, 2);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "ink" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const p = progress(t, at, 0.3);
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.fillStyle = "rgba(20,30,70,0.55)";
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
      const frameTone: Tone = tone === "good" ? "accent" : tone;
      daub(
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
          [x0, y0 - 2 * u],
        ],
        { at, dur, tone: frameTone, width: 12 },
      );
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const light = !head && tone === "accent";
      const r = daub(pts, { at, dur, tone, width: light ? 4 : 11 });
      if (!r || !head || !r.done) return;
      const s = 24 * u;
      daub(
        [
          [r.end[0] - Math.cos(r.angle - 0.5) * s, r.end[1] - Math.sin(r.angle - 0.5) * s],
          r.end,
          [r.end[0] - Math.cos(r.angle + 0.5) * s, r.end[1] - Math.sin(r.angle + 0.5) * s],
        ],
        { at: at + dur, dur: 0.12, tone, width: 10 },
      );
    },
    store(x, y, w, h, o = {}) {
      // A stack of little painted canvases.
      const { at = 0, dur = 0.8, tone = "accent" } = o;
      const n = 4;
      for (let i = 0; i < n; i++) {
        const a = at + (dur / n) * i;
        const p = progress(t, a, 0.25);
        if (p <= 0) continue;
        const cy = Y(y + h) - (Y(h) / n) * (i + 1) - (1 - p) * 30 * u;
        const cx = X(x) + (i % 2 ? 6 : -4) * u;
        const ch = Y(h) / n - 8 * u;
        ctx.save();
        ctx.fillStyle = "#3B2A1A";
        ctx.fillRect(cx + 4 * u, cy + 5 * u, X(w), ch);
        ctx.fillStyle = "#E9D9A8";
        ctx.fillRect(cx, cy, X(w), ch);
        ctx.fillStyle = i % 2 ? "#E08A3C" : "#C79A55";
        ctx.fillRect(cx + 6 * u, cy + 6 * u, X(w) - 12 * u, ch - 12 * u);
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillRect(cx + 6 * u, cy + 6 * u, X(w) - 12 * u, 3 * u);
        ctx.restore();
        void tone;
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const w = letters(value, X(x), Y(y), size, { at, dur: 0.15, tone, align: "center" });
      if (sub)
        letters(sub, X(x), Y(y) + size * 0.95 * u, size * 0.36, {
          at: at + 0.3,
          tone: "ink",
          align: "center",
        });
      if (sub && count) {
        const rx = w / 2 + size * 0.35 * u;
        daub(ellipse(X(x), Y(y), rx, size * 0.6 * u, 40, -Math.PI * 0.8, 1.02), {
          at: at + dur,
          dur: 0.45,
          tone: "accent",
          width: 9,
        });
      }
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const [cx, cy] = [X(x), Y(y)];
      const at = o.at ?? 0;
      if (kind === "check") {
        daub(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.12, cy + s * 0.4],
            [cx + s * 0.6, cy - s * 0.5],
          ],
          { at, dur: 0.3, tone: o.tone ?? "good", width: 11 },
        );
      } else {
        daub(
          [
            [cx - s * 0.5, cy - s * 0.5],
            [cx + s * 0.5, cy + s * 0.5],
          ],
          { at, dur: 0.15, tone: o.tone ?? "bad", width: 11 },
        );
        daub(
          [
            [cx + s * 0.5, cy - s * 0.5],
            [cx - s * 0.5, cy + s * 0.5],
          ],
          { at: at + 0.15, dur: 0.15, tone: o.tone ?? "bad", width: 11 },
        );
      }
    },
    finish() {
      // The canvas weave catching the light.
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = "#FFFFFF";
      const s = 6 * u;
      for (let y = 0; y < H; y += s * 2) ctx.fillRect(0, y, W, Math.max(1, u));
      ctx.restore();
    },
  };
}

/** Blend two angles by `f`, the short way round. */
function lerpA(a: number, b: number, f: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * f;
}

export default {
  id: "impasto-oil",
  name: "Swirling oil",
  category: "Painterly",
  make,
} satisfies Style;
