// The midnight zone: near-black water with marine snow drifting up past
// the lens, and the only light is living light. Things switch on like
// animals: a flicker, then a steady pulse of cyan and teal, magenta for the
// correction. Words gather out of glowing plankton.
import {
  alpha,
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

const GLOW: Record<Tone, string> = {
  ink: "#9BEFFF",
  accent: "#3FD8FF",
  good: "#7DFFC0",
  bad: "#FF5FCB",
  muted: "#3E7F9C",
};
const SERIF = '"Charis SIL", "Noto Color Emoji", serif';
const MONO = '"JetBrains Mono", "Noto Color Emoji", monospace';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);

  /** How lit a creature is: a stutter of flickers, then on, then a slow breath. */
  function lit(at = 0, dur = 0.5, k = 0) {
    const p = progress(t, at, dur);
    if (p <= 0) return 0;
    const stutter = p < 1 ? (hash(Math.floor(t * 30) + k) > 0.35 ? p : p * 0.3) : 1;
    return stutter * (0.85 + 0.15 * Math.sin(t * 2.4 + k));
  }

  function glow(color: string, blur: number) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * u;
  }

  /** Glowing serif text that sharpens out of a soft haze, plankton drifting in to it. */
  function words(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: string,
    at: number,
    dur: number,
  ) {
    const p = progress(t, at, dur);
    if (p <= 0) return;
    ctx.save();
    ctx.font = `600 ${Math.round(size * u)}px ${SERIF}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    // Plankton converging.
    if (p < 1) {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 26; i++) {
        const tx = left + hash(i * 3.1 + x) * w;
        const ty = y + (hash(i * 4.3 + y) - 0.5) * size * 0.6 * u;
        const a = hash(i * 7.7) * Math.PI * 2;
        const d = (1 - expo(p)) * (60 + hash(i) * 80) * u;
        ctx.fillStyle = alpha(color, 0.8);
        ctx.beginPath();
        ctx.arc(tx + Math.cos(a) * d, ty + Math.sin(a) * d, 1.8 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = clamp((p - 0.35) / 0.65);
    ctx.textAlign = "left";
    glow(color, 18);
    ctx.fillStyle = color;
    ctx.fillText(s, left, y);
    ctx.shadowBlur = 4 * u;
    ctx.fillStyle = "#EFFFFF";
    ctx.globalAlpha *= 0.55;
    ctx.fillText(s, left, y);
    ctx.restore();
  }

  /** A glowing stroke along points. */
  function strand(points: Pt[], color: string, width: number, a: number) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    glow(color, 14);
    trace(ctx, points);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(235,255,255,0.7)";
    ctx.lineWidth = width * 0.35 * u;
    ctx.stroke();
    ctx.restore();
  }

  return {
    surface() {
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#06223A");
      bg.addColorStop(0.5, "#03121F");
      bg.addColorStop(1, "#010609");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      // Faint shafts from far above.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 5; i++) {
        const x = (0.1 + i * 0.2 + Math.sin(t * 0.2 + i) * 0.02) * W;
        const g = ctx.createLinearGradient(0, 0, 0, H * 0.7);
        g.addColorStop(0, "rgba(60,140,190,0.07)");
        g.addColorStop(1, "rgba(60,140,190,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - 20 * u, 0);
        ctx.lineTo(x + 20 * u, 0);
        ctx.lineTo(x + 120 * u, H * 0.7);
        ctx.lineTo(x - 60 * u, H * 0.7);
        ctx.fill();
      }
      // Marine snow, three depths, drifting upward (we're sinking).
      for (let i = 0; i < 220; i++) {
        const depth = 0.3 + hash(i * 1.9) * 0.7;
        const x = (hash(i * 2.3) * W + Math.sin(t * 0.6 + i) * 6 * u) % W;
        const y = (((hash(i * 3.7) - t * 0.04 * depth) % 1) + 1) % 1;
        ctx.fillStyle = `rgba(170,220,235,${0.12 + depth * 0.25})`;
        ctx.beginPath();
        ctx.arc(x, y * H, depth * 1.8 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.09, size = 50, at = 0, dur = 0.9 } = o;
      words(s, X(x), Y(y), size, GLOW.ink, o.align ?? "left", at, dur);
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, tone = "ink", align = "center" } = o;
      words(s, X(x), Y(y), size, GLOW[tone], align, at, o.dur ?? 0.45);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.4, tone = "accent" } = o;
      const k = x * 91 + y * 37;
      const a = lit(at, dur, k);
      if (a <= 0) return;
      const R = r * u * 0.75;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 3);
      halo.addColorStop(0, alpha(GLOW[tone], 0.55 * a));
      halo.addColorStop(1, alpha(GLOW[tone], 0));
      ctx.fillStyle = halo;
      ctx.fillRect(cx - R * 3, cy - R * 3, R * 6, R * 6);
      ctx.fillStyle = alpha("#E8FFFF", a);
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = alpha(GLOW[tone], 0.8 * a);
      ctx.lineWidth = 1.5 * u;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "accent" } = o;
      const a = lit(at, dur, x * 7);
      if (a <= 0) return;
      // A jellyfish: a translucent bell with a glowing rim, tentacles trailing.
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const cx = x0 + bw / 2;
      const rim = y0 + bh * 0.78;
      const pulse = 1 + Math.sin(t * 2.2) * 0.03;
      ctx.save();
      const bell = ellipse(cx, rim, (bw / 2) * pulse, bh * 0.78, 40, Math.PI, 0.5);
      trace(ctx, bell, true);
      const fill = ctx.createLinearGradient(0, y0, 0, rim);
      fill.addColorStop(0, alpha(GLOW[tone], 0.22 * a));
      fill.addColorStop(1, alpha(GLOW[tone], 0.06 * a));
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
      strand(bell, GLOW[tone], 2.5, a);
      for (let i = 0; i < 9; i++) {
        const tx = x0 + bw * (0.1 + (i / 8) * 0.8);
        const pts: Pt[] = Array.from({ length: 12 }, (_, j) => [
          tx + Math.sin(t * 1.6 + i + j * 0.5) * 5 * u * (j / 11),
          rim + (j / 11) * bh * (0.5 + hash(i) * 0.4),
        ]);
        strand(pts, GLOW[tone], 1, a * 0.45);
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      const color = GLOW[tone];
      if (!head) {
        // A nerve-net strand.
        strand(shown, color, 0.9, 0.5);
        return;
      }
      // A current of glowing dots flowing along.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.setLineDash([3 * u, 7 * u]);
      ctx.lineDashOffset = -t * 30 * u;
      glow(color, 10);
      trace(ctx, shown);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5 * u;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.setLineDash([]);
      if (p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        trace(ctx, [
          [end[0] - Math.cos(ang - 0.5) * 14 * u, end[1] - Math.sin(ang - 0.5) * 14 * u],
          end,
          [end[0] - Math.cos(ang + 0.5) * 14 * u, end[1] - Math.sin(ang + 0.5) * 14 * u],
        ]);
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "accent" } = o;
      // A comb jelly: an upright oval with rainbow comb rows rippling down it.
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const cx = x0 + bw / 2;
      const cy = y0 + bh / 2;
      const a = lit(at, dur, 3);
      if (a <= 0) return;
      const body = ellipse(cx, cy, bw / 2, bh / 2, 48);
      ctx.save();
      trace(ctx, body, true);
      ctx.fillStyle = alpha(GLOW[tone], 0.1 * a);
      ctx.fill();
      ctx.restore();
      strand(body, GLOW[tone], 1.8, a);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const side of [-0.55, -0.2, 0.2, 0.55]) {
        for (let j = 0; j < 9; j++) {
          const f = j / 8;
          const yy = y0 + bh * (0.12 + f * 0.76);
          const xx = cx + side * (bw / 2) * Math.sqrt(1 - ((yy - cy) / (bh / 2)) ** 2);
          const hue = (t * 120 + j * 40 + side * 200) % 360;
          ctx.fillStyle = `hsla(${hue},100%,65%,${0.8 * a})`;
          ctx.beginPath();
          ctx.arc(xx, yy, 2.4 * u, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const color = GLOW[tone];
      const p = expo(progress(t, at, 0.4));
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = `600 ${Math.round(size * u)}px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      glow(color, 26);
      ctx.fillStyle = color;
      ctx.fillText(value, X(x), Y(y));
      ctx.shadowBlur = 6 * u;
      ctx.fillStyle = "rgba(240,255,255,0.6)";
      ctx.fillText(value, X(x), Y(y));
      ctx.restore();
      if (sub)
        words(sub, X(x), Y(y) - size * 0.85 * u, size * 0.36, GLOW.ink, "center", at + 0.2, 0.5);
      // A ring of light pulses out once the count lands.
      const rp = progress(t, at + dur, 1.2);
      if (rp > 0 && rp < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - rp;
        glow(color, 12);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.arc(X(x), Y(y), size * (0.8 + rp * 1.4) * u, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 34 } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      const pts: Pt[] =
        kind === "check"
          ? [
              [cx - s * 0.5, cy],
              [cx - s * 0.12, cy + s * 0.4],
              [cx + s * 0.6, cy - s * 0.5],
            ]
          : [
              [cx - s * 0.45, cy - s * 0.45],
              [cx + s * 0.45, cy + s * 0.45],
              [cx, cy],
              [cx + s * 0.45, cy - s * 0.45],
              [cx - s * 0.45, cy + s * 0.45],
            ];
      const n = Math.max(2, Math.ceil(pts.length * p));
      strand(pts.slice(0, n), kind === "check" ? GLOW.good : GLOW.bad, 4, 1);
    },
    finish() {
      vignette(ctx, m, 0.7, "0,3,8");
      ctx.save();
      ctx.font = `${Math.round(12 * u)}px ${MONO}`;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(150,210,230,0.55)";
      ctx.fillText(`DEPTH ${Math.round(1000 + t * 6)} m`, W - 30 * u, 22 * u);
      ctx.fillText("TEMP 3.4 °C", W - 30 * u, 38 * u);
      ctx.fillStyle = Math.floor(t * 2) % 2 ? "rgba(255,70,90,0.9)" : "rgba(255,70,90,0.3)";
      ctx.beginPath();
      ctx.arc(W - 150 * u, 28 * u, 3.5 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  };
}

export default {
  id: "deep-sea",
  name: "Deep sea glow",
  category: "Light & Imaging",
  make,
} satisfies Style;
