// Frosted glass over drifting colour: vivid magenta, violet, blue and orange
// blobs move slowly behind translucent panels that really blur them, with a
// one-pixel light edge, a diagonal sheen and crisp white type. Panels rise in
// and frost over; orbs bloom; connectors glow with a travelling light.
import {
  along,
  alpha,
  clamp,
  counting,
  curve,
  expo,
  frame,
  type Look,
  type Pt,
  progress,
  type Style,
  spring,
  type Tone,
  trace,
} from "./look.ts";

const TONE: Record<Tone, string> = {
  ink: "#FFFFFF",
  accent: "#FF6FD8",
  good: "#5CF2B0",
  bad: "#FF5A6E",
  muted: "#C9B8FF",
};
const SANS = '"Inter", "Noto Color Emoji", sans-serif';
const BLOBS: [number, number, number, string][] = [
  [0.2, 0.3, 0.38, "#E03BE0"],
  [0.75, 0.25, 0.32, "#7B3BFF"],
  [0.55, 0.75, 0.4, "#2E7BFF"],
  [0.9, 0.8, 0.3, "#FF7A2E"],
  [0.1, 0.85, 0.3, "#23C4FF"],
  [0.45, 0.4, 0.25, "#B03BFF"],
];

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__glass ??= new Map();
  const cache: Map<string, any> = g.__glass;
  const rise = (at = 0) => spring(t, { start: at, stiffness: 170, damping: 18 });
  let frosted: any = null;

  /** The colour field this frame, painted into a canvas `div` times smaller (which is itself the blur). */
  function blobs(div: number) {
    const key = `${W}x${H}/${div}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(Math.ceil(W / div), Math.ceil(H / div));
      cache.set(key, c);
    }
    const x = c.getContext("2d");
    const [w, h] = [c.width, c.height];
    x.fillStyle = "#2A0F5C";
    x.fillRect(0, 0, w, h);
    for (const [i, [bx, by, br, col]] of BLOBS.entries()) {
      const cx = (bx + Math.sin(t * 0.35 + i * 1.7) * 0.06) * w;
      const cy = (by + Math.cos(t * 0.3 + i * 2.3) * 0.06) * h;
      const r = br * Math.max(w, h);
      const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, alpha(col, 0.95));
      gr.addColorStop(1, alpha(col, 0));
      x.fillStyle = gr;
      x.fillRect(0, 0, w, h);
    }
    return c;
  }

  /** A frosted glass panel: the field blurred hard inside it, a white wash, a sheen and a light edge. */
  function glass(x: number, y: number, w: number, h: number, r: number, tint = "#FFFFFF") {
    frosted ??= blobs(48);
    ctx.save();
    ctx.shadowColor = "rgba(20,0,60,0.35)";
    ctx.shadowBlur = 30 * u;
    ctx.shadowOffsetY = 12 * u;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = "rgba(255,255,255,0.01)";
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.clip();
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(frosted, 0, 0, W, H);
    ctx.fillStyle = alpha(tint, 0.14);
    ctx.fillRect(x, y, w, h);
    const sheen = ctx.createLinearGradient(x, y, x + w, y + h);
    sheen.addColorStop(0, "rgba(255,255,255,0.22)");
    sheen.addColorStop(0.45, "rgba(255,255,255,0.04)");
    sheen.addColorStop(1, "rgba(255,255,255,0.0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.stroke();
  }

  /** Rise from below and fade in. */
  function risen(at: number | undefined, draw: () => void) {
    const s = rise(at);
    if (s <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(s * 1.5);
    ctx.translate(0, (1 - s) * 40 * u);
    draw();
    ctx.restore();
  }

  /** A glass pill with white type. */
  function pill(s: string, cx: number, cy: number, size: number, tone: Tone, align = "center") {
    ctx.font = `600 ${Math.round(size * u)}px ${SANS}`;
    const w = ctx.measureText(s).width + size * 1.4 * u;
    const h = size * 1.7 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    glass(
      left,
      cy - h / 2,
      w,
      h,
      h / 2,
      tone === "ink" || tone === "muted" ? "#FFFFFF" : TONE[tone],
    );
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + size * 0.7 * u, cy + u);
  }

  return {
    surface() {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(blobs(10), 0, 0, W, H);
      // Two glossy orbs floating in the field.
      for (const [i, [ox, oy, or, col]] of (
        [
          [0.88, 0.16, 46, "#FF6FD8"],
          [0.14, 0.82, 38, "#FF8A3D"],
        ] as [number, number, number, string][]
      ).entries()) {
        const cx = X(ox) + Math.sin(t * 0.8 + i) * 10 * u;
        const cy = Y(oy) + Math.cos(t * 0.6 + i) * 10 * u;
        const r = or * u;
        const gr = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
        gr.addColorStop(0, "#FFFFFF");
        gr.addColorStop(0.25, col);
        gr.addColorStop(1, alpha(col, 0.6));
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 38, at = 0, align = "left" } = o;
      risen(at, () => {
        ctx.font = `700 ${Math.round(size * u)}px ${SANS}`;
        const w = ctx.measureText(s).width + size * 1.4 * u;
        const h = size * 1.8 * u;
        const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
        glass(left, Y(y) - h / 2, w, h, 14 * u);
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(s, left + size * 0.7 * u, Y(y) + u);
      });
    },
    label(s, x, y, o = {}) {
      risen(o.at, () => pill(s, X(x), Y(y), o.size ?? 30, o.tone ?? "ink", o.align ?? "center"));
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      // A glowing orb that blooms open.
      const R = r * u * (0.5 + 0.5 * spring(t, { start: at, stiffness: 240, damping: 12 })) * 0.95;
      const col = TONE[tone];
      ctx.save();
      const halo = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), R * 2.6);
      halo.addColorStop(0, alpha(col, 0.55 * p));
      halo.addColorStop(1, alpha(col, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(X(x) - R * 3, Y(y) - R * 3, R * 6, R * 6);
      ctx.fillStyle = "#FFFFFF";
      ctx.globalAlpha = p;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = alpha(col, 0.9);
      ctx.lineWidth = R * 0.3;
      ctx.stroke();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const tone = o.tone ?? "ink";
      risen(o.at, () =>
        glass(X(x), Y(y), X(w), Y(h), 18 * u, tone === "good" ? "#5CF2B0" : "#FFFFFF"),
      );
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 36);
      const { points, angle } = along(pts, expo(p));
      const col = tone === "ink" ? "#FFFFFF" : TONE[tone];
      ctx.save();
      ctx.lineCap = "round";
      ctx.shadowColor = col;
      ctx.shadowBlur = (head ? 12 : 6) * u;
      ctx.strokeStyle = alpha(col, head ? 0.95 : 0.55);
      ctx.lineWidth = (head ? 3 : 1.4) * u;
      trace(ctx, points);
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        ctx.beginPath();
        ctx.moveTo(
          end[0] - Math.cos(angle - 0.5) * 12 * u,
          end[1] - Math.sin(angle - 0.5) * 12 * u,
        );
        ctx.lineTo(end[0], end[1]);
        ctx.lineTo(
          end[0] - Math.cos(angle + 0.5) * 12 * u,
          end[1] - Math.sin(angle + 0.5) * 12 * u,
        );
        ctx.stroke();
        // A light dot travelling along the wire.
        const [dx, dy] = along(pts, (t * 0.8 + x1 * 3) % 1).points.at(-1) as Pt;
        ctx.fillStyle = "#FFFFFF";
        ctx.shadowBlur = 16 * u;
        ctx.beginPath();
        ctx.arc(dx, dy, 4 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      risen(at, () => {
        glass(X(x), Y(y), X(w), Y(h), 16 * u);
        // Small glass tiles filling in, the examples in the set.
        const pad = 10 * u;
        const rows = 4;
        const th = (Y(h) - pad * (rows + 1)) / rows;
        for (let i = 0; i < rows; i++) {
          const q = progress(t, at + 0.2 + (i / rows) * dur * 0.7, 0.3);
          if (q <= 0) continue;
          ctx.globalAlpha = q;
          ctx.fillStyle = "rgba(255,255,255,0.18)";
          ctx.strokeStyle = "rgba(255,255,255,0.4)";
          ctx.lineWidth = 1 * u;
          ctx.beginPath();
          ctx.roundRect(X(x) + pad, Y(y) + pad + i * (th + pad), X(w) - pad * 2, th, 8 * u);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = i % 2 ? TONE.accent : "#5CD8FF";
          ctx.beginPath();
          ctx.arc(X(x) + pad * 2.2, Y(y) + pad + i * (th + pad) + th / 2, 4 * u, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      risen(at, () => {
        const value = count ? counting(t, at, dur, count) + s : s;
        if (sub) {
          const w = size * 2.9 * u;
          const h = size * 1.9 * u;
          glass(X(x) - w / 2, Y(y) - h / 2, w, h, 20 * u);
          ctx.font = `600 ${Math.round(size * 0.2 * u)}px ${SANS}`;
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(
            sub.toUpperCase(),
            X(x) - w / 2 + size * 0.3 * u,
            Y(y) - h / 2 + size * 0.32 * u,
          );
        }
        ctx.font = `800 ${Math.round(size * u)}px ${SANS}`;
        const col = tone === "good" ? TONE.good : "#FFFFFF";
        ctx.fillStyle = col;
        ctx.shadowColor = alpha(tone === "ink" ? "#FFFFFF" : TONE[tone], 0.6);
        ctx.shadowBlur = 20 * u;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(value, X(x), Y(y) + (sub ? size * 0.15 * u : 0));
      });
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 22) * u;
      const s = spring(t, { start: o.at ?? 0, stiffness: 260, damping: 13 });
      if (s <= 0) return;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
      const col = kind === "check" ? TONE.good : TONE.bad;
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 16 * u;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = r * 0.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (kind === "check")
        trace(ctx, [
          [cx - r * 0.42, cy],
          [cx - r * 0.1, cy + r * 0.32],
          [cx + r * 0.45, cy - r * 0.3],
        ]);
      else
        trace(ctx, [
          [cx - r * 0.35, cy - r * 0.35],
          [cx + r * 0.35, cy + r * 0.35],
          [cx, cy],
          [cx + r * 0.35, cy - r * 0.35],
          [cx - r * 0.35, cy + r * 0.35],
        ]);
      ctx.stroke();
      ctx.restore();
    },
    finish() {},
  };
}

export default {
  id: "glassmorphism",
  name: "Frosted glass",
  category: "Dimensional",
  make,
} satisfies Style;
