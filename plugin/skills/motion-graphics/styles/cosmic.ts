// Deep space crossed with an engraved star atlas: a slow-drifting nebula in
// teal, violet and rose, a field of stars, and hairline gold and pale-cyan
// chart work laid over it (dotted orbits, degree rings, spaced small-caps
// serif labels). Stars flare before planets light; chart lines engrave on.
import {
  alpha,
  arrowhead,
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
  vignette,
} from "./look.ts";

const SPACE = "#070818";
const GOLD = "#DDBF7A";
const CYAN = "#A8DDE6";
const STAR = "#F4F1E8";
const TONE: Record<Tone, string> = {
  ink: GOLD,
  accent: CYAN,
  good: "#9BE3B0",
  bad: "#F07A7A",
  muted: "#8A86A8",
};
// planet bodies per tone: lit side, shadow side
const BODY: Record<Tone, [string, string]> = {
  ink: ["#F2D9A0", "#5A4220"],
  accent: ["#BFEFF5", "#1D4E66"],
  good: ["#C8F2C9", "#1E5634"],
  bad: ["#F6B39A", "#6A2320"],
  muted: ["#C9C3E0", "#34304F"],
};
const SANS = '"Montserrat", sans-serif';
const SERIF = '"Cormorant Garamond", serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const sans = (size: number) => `700 ${Math.round(size * u)}px ${SANS}`;
  const serif = (size: number, style = "500") => `${style} ${Math.round(size * u)}px ${SERIF}`;
  const g = globalThis as any;
  g.__cosmicSky ??= new Map();
  const cache: Map<string, any> = g.__cosmicSky;

  function sky() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      const cw = Math.round(W * 1.1);
      const chh = Math.round(H * 1.1);
      c = new OffscreenCanvas(cw, chh);
      const x = c.getContext("2d");
      x.fillStyle = SPACE;
      x.fillRect(0, 0, cw, chh);
      const clouds = ["58,190,200", "130,70,200", "220,90,170", "80,60,170", "230,180,110"];
      for (let i = 0; i < 46; i++) {
        const px = (0.15 + hash(i * 1.3) * 0.8) * cw;
        const py = (0.2 + hash(i * 2.1) * 0.7) * chh;
        const r = (80 + hash(i * 3.7) * 260) * u;
        const gr = x.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, `rgba(${clouds[i % clouds.length]},${0.1 + hash(i) * 0.12})`);
        gr.addColorStop(1, `rgba(${clouds[i % clouds.length]},0)`);
        x.fillStyle = gr;
        x.fillRect(px - r, py - r, r * 2, r * 2);
      }
      for (let i = 0; i < 900; i++) {
        const b = hash(i * 4.4);
        x.fillStyle = `rgba(244,241,232,${0.25 + b * 0.7})`;
        x.beginPath();
        x.arc(hash(i * 5.1) * cw, hash(i * 6.3) * chh, (0.4 + b ** 4 * 1.8) * u, 0, Math.PI * 2);
        x.fill();
      }
      cache.set(key, c);
    }
    // slow drift in
    const d = clamp(t / 20);
    ctx.drawImage(c, -W * 0.05 * d, -H * 0.04 * d);
  }

  /** Spaced small caps engraved on. */
  function caps(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align = "left",
    at = 0,
  ) {
    const p = progress(t, at, 0.5);
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.font = serif(size, "600");
    ctx.letterSpacing = `${Math.round(size * 0.18 * u)}px`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s.toUpperCase(), x, y);
    ctx.restore();
  }

  function flare(x: number, y: number, size: number, p: number) {
    if (p <= 0 || p >= 1) return;
    const k = Math.sin(p * Math.PI);
    ctx.save();
    ctx.globalAlpha = k;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, size);
    gr.addColorStop(0, "rgba(255,250,235,0.9)");
    gr.addColorStop(1, "rgba(255,250,235,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(x - size, y - size, size * 2, size * 2);
    ctx.strokeStyle = "rgba(255,250,235,0.8)";
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(x - size * 1.6, y);
    ctx.lineTo(x + size * 1.6, y);
    ctx.moveTo(x, y - size * 1.6);
    ctx.lineTo(x, y + size * 1.6);
    ctx.stroke();
    ctx.restore();
  }

  function dotted(points: Pt[], color: string, w = 1.2, gap = 6) {
    ctx.save();
    trace(ctx, points);
    ctx.setLineDash([1.5 * u, gap * u]);
    ctx.lineCap = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = w * u;
    ctx.stroke();
    ctx.restore();
  }

  return {
    surface() {
      sky();
      // a banded, ringed giant low in the corner, lighting up
      const p = progress(t, 0.2, 1.5);
      if (p <= 0) return;
      const [cx, cy, R] = [X(0.9), Y(0.86), 105 * u];
      ctx.save();
      ctx.globalAlpha = p;
      ctx.translate(cx, cy);
      ctx.rotate(-0.35);
      const ring = (front: boolean) => {
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.ellipse(
            0,
            0,
            R * (1.45 + k * 0.08),
            R * (0.32 + k * 0.02),
            0,
            front ? 0 : Math.PI,
            front ? Math.PI : Math.PI * 2,
          );
          ctx.strokeStyle = `rgba(221,191,122,${0.55 - k * 0.08})`;
          ctx.lineWidth = 5 * u;
          ctx.stroke();
        }
      };
      ring(false);
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.clip();
      const bands = ["#E9C9A0", "#C98E6A", "#F1DDBE", "#B67A63", "#E6C7A6", "#9C6B5E"];
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = bands[i % bands.length] as string;
        ctx.fillRect(-R, -R + (i / 12) * R * 2, R * 2, (R * 2) / 12 + 1);
      }
      const sh = ctx.createRadialGradient(-R * 0.4, -R * 0.4, R * 0.2, 0, 0, R * 1.05);
      sh.addColorStop(0, "rgba(0,0,0,0)");
      sh.addColorStop(1, "rgba(7,8,24,0.85)");
      ctx.fillStyle = sh;
      ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.restore();
      ring(true);
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.08, size = 50, at = 0, dur = 0.9, align = "left" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = sans(size);
      ctx.letterSpacing = `${Math.round((0.02 + (1 - expo(p)) * 0.2) * size * u)}px`;
      ctx.fillStyle = STAR;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(168,221,230,0.5)";
      ctx.shadowBlur = 12 * u;
      ctx.fillText(s, X(x), Y(y));
      const w = ctx.measureText(s).width;
      ctx.restore();
      // a scale rule engraved under it
      const q = expo(progress(t, at + 0.3, 0.7));
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      ctx.fillStyle = alpha(GOLD, 0.8);
      ctx.fillRect(left, Y(y) + size * 0.7 * u, w * q, 1.2 * u);
      for (let k = 0; k <= 20 * q; k++)
        ctx.fillRect(left + (w / 20) * k, Y(y) + size * 0.7 * u, 1 * u, (k % 5 ? 4 : 8) * u);
    },
    label(s, x, y, o = {}) {
      const { size = 30, align = "center", tone = "ink", at = 0 } = o;
      caps(s, X(x), Y(y), size, TONE[tone], align, at);
    },
    node(x, y, r, o = {}) {
      const at = o.at ?? 0;
      const tone = o.tone ?? "accent";
      const [cx, cy] = [X(x), Y(y)];
      const R = r * u * 0.8;
      flare(cx, cy, R * 1.6, progress(t, at, 0.5));
      const p = progress(t, at + 0.2, 0.5);
      if (p <= 0) return;
      // a dotted orbit and a lit sphere
      dotted(ellipse(cx, cy, R * 1.9, R * 0.75, 40, Math.PI, p), alpha(GOLD, 0.6), 1.2, 4);
      const [lit, dark] = BODY[tone];
      const gr = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.1, cx, cy, R);
      gr.addColorStop(0, lit);
      gr.addColorStop(1, dark);
      ctx.save();
      ctx.globalAlpha = p;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.restore();
      // a moon on its orbit
      const a = t * 0.8 + hash(x * 9 + y * 3) * 6;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * R * 1.9, cy + Math.sin(a) * R * 0.75, 2 * u, 0, Math.PI * 2);
      ctx.fillStyle = alpha(STAR, p);
      ctx.fill();
    },
    box(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const p = expo(progress(t, at, o.dur ?? 0.7));
      if (p <= 0) return;
      const col = TONE[o.tone ?? "ink"];
      const [bx, by, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      ctx.save();
      ctx.fillStyle = `rgba(7,8,24,${0.55 * p})`;
      ctx.fillRect(bx, by, bw, bh);
      const outline: Pt[] = [
        [bx, by],
        [bx + bw, by],
        [bx + bw, by + bh],
        [bx, by + bh],
        [bx, by],
      ];
      trace(ctx, outline.slice(0, 2 + Math.floor(p * 3)));
      ctx.strokeStyle = alpha(col, 0.85);
      ctx.lineWidth = 1.2 * u;
      ctx.stroke();
      // degree ticks along the top
      ctx.fillStyle = alpha(col, 0.8);
      for (let k = 0; k <= 24 * p; k++)
        ctx.fillRect(bx + (bw / 24) * k, by, 1 * u, (k % 6 ? 4 : 9) * u);
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const p = expo(progress(t, at, dur));
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      if (head) {
        ctx.save();
        trace(ctx, shown);
        ctx.strokeStyle = alpha(TONE[tone], 0.9);
        ctx.lineWidth = 1.6 * u;
        ctx.shadowColor = TONE[tone];
        ctx.shadowBlur = 6 * u;
        ctx.stroke();
        ctx.restore();
        if (p >= 0.99) {
          const end = pts.at(-1) as Pt;
          const prev = pts.at(-3) as Pt;
          ctx.save();
          arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 12 * u);
          ctx.strokeStyle = TONE[tone];
          ctx.lineWidth = 1.6 * u;
          ctx.stroke();
          ctx.restore();
        }
      } else dotted(shown, alpha(TONE[tone], 0.6), 1.3, 4);
    },
    store(x, y, w, h, o = {}) {
      // a star cluster held in a ringed chart circle
      const at = o.at ?? 0;
      const [cx, cy] = [X(x + w / 2), Y(y + h / 2)];
      const R = Math.max(X(w), Y(h)) * 0.55;
      const p = expo(progress(t, at, o.dur ?? 0.8));
      if (p <= 0) return;
      ctx.save();
      trace(ctx, ellipse(cx, cy, R, R, 60, -Math.PI / 2, p));
      ctx.strokeStyle = alpha(GOLD, 0.85);
      ctx.lineWidth = 1.2 * u;
      ctx.stroke();
      ctx.fillStyle = alpha(GOLD, 0.8);
      for (let k = 0; k < 36 * p; k++) {
        const a = -Math.PI / 2 + (k / 36) * Math.PI * 2;
        const l = (k % 9 ? 4 : 9) * u;
        ctx.fillRect(cx + Math.cos(a) * R - 0.5 * u, cy + Math.sin(a) * R - 0.5 * u, 1 * u, 1 * u);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.lineTo(cx + Math.cos(a) * (R + l), cy + Math.sin(a) * (R + l));
        ctx.strokeStyle = alpha(GOLD, 0.7);
        ctx.stroke();
      }
      ctx.restore();
      for (let i = 0; i < 26; i++) {
        const q = progress(t, at + 0.2 + i * 0.025, 0.3);
        if (q <= 0) continue;
        const a = hash(i * 3.1) * Math.PI * 2;
        const rr = Math.sqrt(hash(i * 5.7)) * R * 0.85;
        const sx = cx + Math.cos(a) * rr;
        const sy = cy + Math.sin(a) * rr;
        const tw = 0.6 + 0.4 * Math.sin(t * 3 + i);
        ctx.beginPath();
        ctx.arc(sx, sy, (1 + hash(i) * 2.2) * u, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(244,241,232,${q * tw})`;
        ctx.fill();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "ink" } = o;
      const p = progress(t, at, 0.4);
      if (p <= 0) return;
      const [cx, cy] = [X(x), Y(y)];
      const str = count ? counting(t, at, dur, count) + s : s;
      if (sub) {
        // a degree ring sweeping round the number
        const R = size * 1.25 * u;
        const q = expo(progress(t, at, 1.2));
        ctx.save();
        trace(ctx, ellipse(cx, cy, R, R, 72, -Math.PI / 2, q));
        ctx.strokeStyle = alpha(GOLD, 0.7);
        ctx.lineWidth = 1.2 * u;
        ctx.stroke();
        ctx.strokeStyle = alpha(GOLD, 0.6);
        for (let k = 0; k < 72 * q; k++) {
          const a = -Math.PI / 2 + (k / 72) * Math.PI * 2;
          const l = (k % 6 ? 4 : 10) * u;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
          ctx.lineTo(cx + Math.cos(a) * (R - l), cy + Math.sin(a) * (R - l));
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = sans(size);
      ctx.letterSpacing = `${Math.round(size * 0.04 * u)}px`;
      ctx.fillStyle = sub ? STAR : TONE[tone];
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = alpha(TONE[tone], 0.6);
      ctx.shadowBlur = 14 * u;
      ctx.fillText(str, cx, cy - (sub ? size * 0.1 * u : 0));
      ctx.restore();
      if (sub) {
        ctx.save();
        ctx.globalAlpha = p;
        ctx.font = serif(size * 0.32, "italic 500");
        ctx.fillStyle = CYAN;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(sub, cx, cy + size * 0.55 * u);
        ctx.restore();
      }
    },
    mark(kind, x, y, o = {}) {
      const at = o.at ?? 0;
      const p = expo(progress(t, at, 0.4));
      if (p <= 0) return;
      const r = (o.size ?? 22) * u;
      const col = kind === "check" ? TONE.good : TONE.bad;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      trace(ctx, ellipse(cx, cy, r, r, 40, -Math.PI / 2, p));
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.4 * u;
      ctx.stroke();
      ctx.beginPath();
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        ctx.moveTo(cx + dx * r * 0.8, cy + dy * r * 0.8);
        ctx.lineTo(cx + dx * r * 1.3, cy + dy * r * 1.3);
      }
      ctx.stroke();
      ctx.lineWidth = 2.2 * u;
      if (kind === "check")
        trace(ctx, [
          [cx - r * 0.4, cy],
          [cx - r * 0.1, cy + r * 0.3],
          [cx + r * 0.45, cy - r * 0.35],
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.35, cy - r * 0.35);
        ctx.lineTo(cx + r * 0.35, cy + r * 0.35);
        ctx.moveTo(cx + r * 0.35, cy - r * 0.35);
        ctx.lineTo(cx - r * 0.35, cy + r * 0.35);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      // a comet streaking across once, early on
      const p = progress(t, 1.0, 1.6);
      if (p > 0 && p < 1) {
        const hx = X(1.05 - p * 0.7);
        const hy = Y(0.05 + p * 0.25);
        const gr = ctx.createLinearGradient(hx, hy, hx + 160 * u, hy - 60 * u);
        gr.addColorStop(0, "rgba(244,241,232,0.9)");
        gr.addColorStop(1, "rgba(244,241,232,0)");
        ctx.save();
        ctx.strokeStyle = gr;
        ctx.lineWidth = 2.5 * u;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + 160 * u, hy - 60 * u);
        ctx.stroke();
        ctx.restore();
      }
      vignette(ctx, m, 0.5);
    },
  };
}

export default {
  id: "cosmic",
  name: "Celestial atlas",
  category: "Cosmic & Psychedelic",
  make,
} satisfies Style;
