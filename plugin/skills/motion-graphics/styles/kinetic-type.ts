// Typographic music video: strictly two colours, acid yellow on black.
// Heavy condensed words slam in oversized and settle, trailing outline
// echoes; numbers tear in with a slice glitch; labels are inverted mono
// tags that drop onto their targets; rules end in chevrons.
import {
  alpha,
  clamp,
  counting,
  curve,
  easeIn,
  expo,
  frame,
  hash,
  type Look,
  type Pt,
  progress,
  type Style,
  trace,
} from "./look.ts";

const BLACK = "#0B0B0B";
const ACID = "#E2FF3D";
const BLOCK = '"Anton", sans-serif';
const MONO = '"JetBrains Mono", monospace';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__kineticDots ??= new Map();
  const cache: Map<string, any> = g.__kineticDots;

  /** A halftone dot pattern in acid, cached per size. */
  function dots() {
    const s = Math.max(3, Math.round(7 * u));
    let pat = cache.get(s);
    if (!pat) {
      const c = new OffscreenCanvas(s, s);
      const x = c.getContext("2d") as any;
      x.fillStyle = ACID;
      x.beginPath();
      x.arc(s / 2, s / 2, s * 0.28, 0, Math.PI * 2);
      x.fill();
      pat = ctx.createPattern(c, "repeat");
      cache.set(s, pat);
    }
    return pat;
  }

  /** A slammed word: starts big, snaps to size, leaves outline echoes that fade. */
  function slam(
    s: string,
    x: number,
    y: number,
    size: number,
    at: number,
    align = "left",
    outline = false,
  ) {
    const p = progress(t, at, 0.22);
    if (p <= 0) return 0;
    const scale = 1 + (1 - expo(p)) * 0.7;
    ctx.save();
    ctx.font = `400 ${Math.round(size * u)}px ${BLOCK}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    // Strobe echoes behind, offset and stepping back.
    const echo = clamp(1 - (t - at) / 0.8);
    if (echo > 0) {
      ctx.strokeStyle = alpha(ACID, 0.6 * echo);
      ctx.lineWidth = 1.5 * u;
      for (let k = 1; k <= 3; k++) ctx.strokeText(s, x - k * 10 * u * echo, y + k * 4 * u * echo);
    }
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (outline) {
      ctx.strokeStyle = ACID;
      ctx.lineWidth = 2.5 * u;
      ctx.strokeText(s, 0, 0);
    } else {
      ctx.fillStyle = ACID;
      ctx.fillText(s, 0, 0);
    }
    ctx.restore();
    // One-frame inverted flash on impact.
    if (t - at > 0.2 && t - at < 0.24) {
      ctx.save();
      ctx.globalCompositeOperation = "difference";
      ctx.fillStyle = ACID;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    return w;
  }

  /** An inverted mono tag that drops onto (cx, cy). */
  function tag(
    s: string,
    cx: number,
    cy: number,
    size: number,
    at: number,
    align = "center",
    invert = true,
  ) {
    const p = progress(t, at, 0.18);
    if (p <= 0) return;
    const y = cy - (1 - easeIn(1 - (1 - p))) * 0 - (1 - p) * 40 * u;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${MONO}`;
    const w = ctx.measureText(s).width + size * 0.8 * u;
    const h = size * 1.5 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    ctx.fillStyle = invert ? ACID : BLACK;
    ctx.fillRect(left, y - h / 2, w, h);
    ctx.strokeStyle = ACID;
    ctx.lineWidth = 1.5 * u;
    ctx.strokeRect(left, y - h / 2, w, h);
    ctx.fillStyle = invert ? BLACK : ACID;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + w / 2, y + u);
    ctx.restore();
  }

  return {
    surface() {
      ctx.fillStyle = BLACK;
      ctx.fillRect(0, 0, W, H);
    },
    title(s, o = {}) {
      const { x = 0.025, y = 0.12, size = 140, at = 0, align = "left" } = o;
      // One word per beat: filled, outlined, filled.
      const words = s.toUpperCase().split(" ");
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${BLOCK}`;
      const gap = size * 0.22 * u;
      const widths = words.map((w) => ctx.measureText(w).width);
      ctx.restore();
      const total = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
      let left = align === "center" ? X(x) - total / 2 : align === "right" ? X(x) - total : X(x);
      const beat = (o.dur ?? 0.9) / Math.max(1, words.length);
      for (const [i, w] of words.entries()) {
        slam(w, left, Y(y), size, at + i * beat, "left", i % 2 === 1);
        left += (widths[i] as number) + gap;
      }
    },
    label(s, x, y, o = {}) {
      tag(
        s.toUpperCase(),
        X(x),
        Y(y),
        o.size ?? 28,
        o.at ?? 0,
        o.align ?? "center",
        o.tone !== "muted",
      );
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const p = progress(t, at, 0.15);
      if (p <= 0) return;
      // A square frame filled with halftone, snapping from big to size.
      const R = r * u * (1 + (1 - expo(p)) * 0.8);
      ctx.save();
      ctx.fillStyle = BLACK;
      ctx.fillRect(X(x) - R, Y(y) - R, R * 2, R * 2);
      ctx.fillStyle = tone === "muted" ? alpha(ACID, 0.4) : dots();
      ctx.fillRect(X(x) - R * 0.7, Y(y) - R * 0.7, R * 1.4, R * 1.4);
      ctx.strokeStyle = ACID;
      ctx.lineWidth = 3 * u;
      ctx.strokeRect(X(x) - R, Y(y) - R, R * 2, R * 2);
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.25 } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      // A heavy frame wiped up from the bottom, with an offset shadow frame.
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const e = expo(p);
      ctx.save();
      ctx.strokeStyle = ACID;
      ctx.lineWidth = 2 * u;
      ctx.strokeRect(x0 + 8 * u, y0 + 8 * u + bh * (1 - e), bw, bh * e);
      ctx.fillStyle = BLACK;
      ctx.fillRect(x0, y0 + bh * (1 - e), bw, bh * e);
      ctx.lineWidth = 5 * u;
      ctx.strokeRect(x0, y0 + bh * (1 - e), bw, bh * e);
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.25, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * expo(p))));
      ctx.save();
      ctx.strokeStyle = head ? ACID : alpha(ACID, 0.45);
      ctx.lineWidth = (head ? 5 : 1.5) * u;
      ctx.lineCap = "butt";
      if (tone === "bad") ctx.setLineDash([12 * u, 8 * u]);
      trace(ctx, shown);
      ctx.stroke();
      ctx.setLineDash([]);
      if (head && p >= 1) {
        // A filled chevron.
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 22 * u;
        ctx.fillStyle = ACID;
        trace(
          ctx,
          [
            end,
            [end[0] - Math.cos(a - 0.6) * s, end[1] - Math.sin(a - 0.6) * s],
            [end[0] - Math.cos(a) * s * 0.55, end[1] - Math.sin(a) * s * 0.55],
            [end[0] - Math.cos(a + 0.6) * s, end[1] - Math.sin(a + 0.6) * s],
          ],
          true,
        );
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6 } = o;
      // A deck of outlined cards slapped down one after another.
      const n = 4;
      for (let i = 0; i < n; i++) {
        const p = progress(t, at + (i / n) * dur, 0.15);
        if (p <= 0) continue;
        const off = (n - 1 - i) * 8 * u;
        const s = 1 + (1 - expo(p)) * 0.4;
        const cx = X(x + w / 2) + off;
        const cy = Y(y + h / 2) - off;
        const bw = (X(w) - 24 * u) * s;
        const bh = (Y(h) - 24 * u) * s;
        ctx.fillStyle = BLACK;
        ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
        ctx.strokeStyle = ACID;
        ctx.lineWidth = 3 * u;
        ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
        if (i === n - 1) {
          // Little bars on the front card, like a weights readout.
          for (let k = 0; k < 4; k++) {
            const bhk = bh * (0.2 + hash(k * 3.3) * 0.5);
            ctx.fillStyle = ACID;
            ctx.fillRect(cx - bw * 0.35 + k * bw * 0.19, cy + bh * 0.38 - bhk, bw * 0.12, bhk);
          }
        }
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const big = size * 1.25;
      ctx.save();
      ctx.font = `400 ${Math.round(big * u)}px ${BLOCK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const w = ctx.measureText(value).width;
      const h = big * u;
      // Slice glitch while counting: horizontal bands shoved sideways.
      const glitch = clamp(1 - (t - at) / (dur + 0.2));
      const bands = 6;
      for (let b = 0; b < bands; b++) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(X(x) - w, Y(y) - h / 2 + (b * h) / bands, w * 2, h / bands + 1);
        ctx.clip();
        const shove = (hash(b * 7.1 + Math.floor(t * 20)) - 0.5) * 40 * u * glitch;
        ctx.fillStyle = ACID;
        ctx.fillText(value, X(x) + shove, Y(y));
        ctx.restore();
      }
      ctx.restore();
      if (sub) tag(sub.toUpperCase(), X(x), Y(y) - h * 0.72, size * 0.22, at + 0.1, "center", true);
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 30) * u;
      const p = progress(t, o.at ?? 0, 0.15);
      if (p <= 0) return;
      const k = 1 + (1 - expo(p)) * 0.8;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(k, k);
      ctx.strokeStyle = ACID;
      ctx.lineWidth = 6 * u;
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      if (kind === "check")
        trace(ctx, [
          [-s * 0.5, 0],
          [-s * 0.15, s * 0.4],
          [s * 0.6, -s * 0.5],
        ]);
      else
        trace(ctx, [
          [-s * 0.5, -s * 0.5],
          [s * 0.5, s * 0.5],
          [0, 0],
          [s * 0.5, -s * 0.5],
          [-s * 0.5, s * 0.5],
        ]);
      ctx.stroke();
      ctx.restore();
    },
    finish() {},
  };
}

export default {
  id: "kinetic-type",
  name: "Kinetic type",
  category: "Generative & Type",
  make,
} satisfies Style;
