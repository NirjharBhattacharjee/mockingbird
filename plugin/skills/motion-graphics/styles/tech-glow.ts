// Neon tech explainer: deep indigo space with slow glows and a floor grid,
// glassy tiles with gradient rims that pop in with overshoot, connectors that
// trace out and then carry light pulses, gradient numbers with bloom.
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

const GLOW: Record<Tone, [string, string]> = {
  ink: ["#9FB4FF", "#6C7CFF"],
  accent: ["#4FE3FF", "#8A5CFF"],
  good: ["#3DF5C4", "#2BB8FF"],
  bad: ["#FF5C9A", "#FF3D6E"],
  muted: ["#6E7BB0", "#4A5490"],
};
const SANS = '"SF Pro Display", "Inter", "Helvetica Neue", Arial, sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const pop = (at = 0) => spring(t, { start: at, stiffness: 220, damping: 15 });

  function grad(x0: number, y0: number, x1: number, y1: number, tone: Tone) {
    const [a, b] = GLOW[tone];
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    return g;
  }

  function scaled(cx: number, cy: number, s: number, draw: () => void) {
    if (s <= 0) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }

  /** A glass tile with a glowing gradient rim. */
  function tile(x: number, y: number, w: number, h: number, r: number, tone: Tone, fill = 0.55) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, `rgba(40,46,120,${fill})`);
    bg.addColorStop(1, `rgba(14,16,58,${fill + 0.2})`);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.shadowColor = GLOW[tone][0];
    ctx.shadowBlur = 22 * u;
    ctx.lineWidth = 2.5 * u;
    ctx.strokeStyle = grad(x, y, x + w, y + h, tone);
    ctx.stroke();
    ctx.restore();
  }

  function glowText(
    s: string,
    x: number,
    y: number,
    size: number,
    weight: number,
    fill: any,
    align = "left",
    blur = 16,
  ) {
    ctx.save();
    ctx.font = `${weight} ${Math.round(size * u)}px ${SANS}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(120,160,255,0.75)";
    ctx.shadowBlur = blur * u;
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  return {
    surface() {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#070A2A");
      g.addColorStop(0.55, "#12105A");
      g.addColorStop(1, "#1B0F6B");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // Drifting electric glows.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 4; i++) {
        const cx = W * (0.2 + 0.6 * hash(i * 3.1)) + Math.sin(t * 0.25 + i) * 60 * u;
        const cy = H * (0.2 + 0.6 * hash(i * 5.7)) + Math.cos(t * 0.2 + i * 2) * 40 * u;
        const r = (380 + 220 * hash(i + 9)) * u;
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        rg.addColorStop(0, i % 2 ? "rgba(60,90,255,0.22)" : "rgba(130,60,255,0.2)");
        rg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
      // Perspective floor grid.
      ctx.save();
      const hz = H * 0.66;
      ctx.strokeStyle = "rgba(120,140,255,0.09)";
      ctx.lineWidth = 1.2 * u;
      for (let i = -12; i <= 12; i++) {
        ctx.beginPath();
        ctx.moveTo(W / 2 + i * 40 * u, hz);
        ctx.lineTo(W / 2 + i * 260 * u, H);
        ctx.stroke();
      }
      for (let k = 0; k < 8; k++) {
        const f = ((k + ((t * 0.15) % 1)) / 8) ** 2;
        const yy = hz + (H - hz) * f;
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(W, yy);
        ctx.stroke();
      }
      ctx.restore();
      // Particles.
      ctx.save();
      for (let i = 0; i < 70; i++) {
        const px = (hash(i * 1.3) * W + t * (6 + hash(i) * 14) * u) % W;
        const py = (hash(i * 2.9) * H - t * (4 + hash(i + 4) * 10) * u + H * 4) % H;
        ctx.fillStyle = `rgba(190,210,255,${0.15 + 0.4 * hash(i * 7.7) * (0.6 + 0.4 * Math.sin(t * 2 + i))})`;
        ctx.fillRect(px, py, 2.4 * u, 2.4 * u);
      }
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.08, size = 52, at = 0, dur = 0.9, align = "left" } = o;
      if (t < at) return;
      const words = s.split(" ");
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${SANS}`;
      const full = ctx.measureText(s).width;
      let cx = align === "center" ? X(x) - full / 2 : align === "right" ? X(x) - full : X(x);
      const space = ctx.measureText(" ").width;
      words.forEach((w, i) => {
        const p = expo(progress(t, at + (i * dur) / words.length, 0.5));
        const ww = ctx.measureText(w).width;
        if (p > 0) {
          ctx.globalAlpha = p;
          const fill = i === words.length - 1 ? grad(cx, 0, cx + ww, 0, "accent") : "#EEF1FF";
          glowText(w, cx, Y(y) + (1 - p) * 26 * u, size, 700, fill, "left", 18);
        }
        cx += ww + space;
      });
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { at = 0, dur = 0.4, size = 24, tone = "ink", align = "center" } = o;
      const p = expo(progress(t, at, dur));
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = `600 ${Math.round(size * u)}px ${SANS}`;
      const tw = ctx.measureText(s).width;
      const pad = 14 * u;
      const pw = tw + pad * 2 + 14 * u;
      const ph = size * 1.55 * u;
      const left = align === "center" ? X(x) - pw / 2 : align === "right" ? X(x) - pw : X(x);
      const top = Y(y) - ph / 2 + (1 - p) * 10 * u;
      ctx.beginPath();
      ctx.roundRect(left, top, pw, ph, ph / 2);
      ctx.fillStyle = "rgba(14,18,64,0.8)";
      ctx.fill();
      ctx.lineWidth = 1.5 * u;
      ctx.strokeStyle = alpha(GLOW[tone][0], 0.6);
      ctx.stroke();
      ctx.fillStyle = GLOW[tone][0];
      ctx.shadowColor = GLOW[tone][0];
      ctx.shadowBlur = 8 * u;
      ctx.beginPath();
      ctx.arc(left + pad + 3 * u, top + ph / 2, 3.5 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#E8ECFF";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(s, left + pad + 14 * u, top + ph / 2);
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const tone = o.tone ?? "accent";
      const cx = X(x);
      const cy = Y(y);
      const R = r * u;
      scaled(cx, cy, pop(o.at), () => {
        ctx.save();
        const halo = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 2.4);
        halo.addColorStop(0, alpha(GLOW[tone][0], 0.35));
        halo.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = halo;
        ctx.fillRect(cx - R * 2.5, cy - R * 2.5, R * 5, R * 5);
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = "#151A5C";
        ctx.fill();
        ctx.shadowColor = GLOW[tone][0];
        ctx.shadowBlur = 14 * u;
        ctx.lineWidth = 3 * u;
        ctx.strokeStyle = grad(cx - R, cy - R, cx + R, cy + R, tone);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = GLOW[tone][0];
        ctx.fill();
        ctx.restore();
      });
    },
    box(x, y, w, h, o = {}) {
      const tone = o.tone ?? "ink";
      const s = pop(o.at);
      if (s <= 0) return;
      ctx.save();
      ctx.globalAlpha = clamp(s);
      scaled(X(x + w / 2), Y(y + h / 2), 0.92 + 0.08 * s, () =>
        tile(X(x), Y(y), X(w), Y(h), 16 * u, tone, 0.6),
      );
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 32);
      const { points, angle } = along(pts, expo(p));
      ctx.save();
      ctx.lineCap = "round";
      ctx.shadowColor = GLOW[tone][0];
      ctx.shadowBlur = 10 * u;
      trace(ctx, points);
      ctx.strokeStyle = alpha(GLOW[tone][0], head ? 0.85 : 0.45);
      ctx.lineWidth = (head ? 3 : 1.6) * u;
      ctx.stroke();
      if (head && p >= 1) {
        arrowhead(ctx, pts.at(-1) as Pt, angle, 14 * u, true);
        ctx.lineWidth = 3 * u;
        ctx.stroke();
      }
      // Light pulses riding the finished wire.
      if (p >= 1) {
        ctx.globalCompositeOperation = "lighter";
        const k = ((t - at - dur) * 0.6 + hash(x1 * 9 + y2 * 7)) % 1;
        const [px, py] = along(pts, k).points.at(-1) as Pt;
        const pg = ctx.createRadialGradient(px, py, 0, px, py, 12 * u);
        pg.addColorStop(0, "rgba(255,255,255,0.95)");
        pg.addColorStop(0.3, alpha(GLOW[tone][0], 0.7));
        pg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = pg;
        ctx.fillRect(px - 12 * u, py - 12 * u, 24 * u, 24 * u);
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const cx = X(x + w / 2);
      const cy = Y(y + h / 2);
      const side = Math.min(X(w), Y(h)) * 1.05;
      scaled(cx, cy, pop(at), () => {
        tile(cx - side / 2, cy - side / 2, side, side, side * 0.24, tone, 0.65);
        // A database glyph drawn on inside.
        const d = progress(t, at + 0.2, 0.6);
        const rx = side * 0.24;
        const ry = rx * 0.35;
        const top = cy - side * 0.2;
        const bot = cy + side * 0.2;
        ctx.save();
        ctx.lineWidth = 3 * u;
        ctx.strokeStyle = grad(cx - rx, top, cx + rx, bot, tone);
        ctx.shadowColor = GLOW[tone][0];
        ctx.shadowBlur = 10 * u;
        ctx.beginPath();
        ctx.ellipse(cx, top, rx, ry, 0, 0, Math.PI * 2 * d);
        ctx.stroke();
        for (let i = 1; i <= 2; i++) {
          if (d < i / 3) continue;
          ctx.beginPath();
          ctx.ellipse(cx, top + ((bot - top) * i) / 2, rx, ry, 0, 0, Math.PI);
          ctx.stroke();
        }
        if (d > 0.3) {
          ctx.beginPath();
          ctx.moveTo(cx - rx, top);
          ctx.lineTo(cx - rx, bot);
          ctx.moveTo(cx + rx, top);
          ctx.lineTo(cx + rx, bot);
          ctx.stroke();
        }
        ctx.restore();
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "accent" } = o;
      const p = expo(progress(t, at, 0.5));
      if (p <= 0) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = `800 ${Math.round(size * u)}px ${SANS}`;
      const tw = ctx.measureText(value).width;
      const cy = Y(y) + (1 - p) * 20 * u;
      glowText(
        value,
        X(x),
        cy,
        size,
        800,
        grad(X(x) - tw / 2, cy - size * u, X(x) + tw / 2, cy + size * u, tone),
        "center",
        26,
      );
      if (sub) {
        ctx.font = `700 ${Math.round(size * 0.24 * u)}px ${SANS}`;
        ctx.textAlign = "center";
        ctx.fillStyle = GLOW[tone][0];
        ctx.fillText(`• ${sub.toUpperCase().split("").join(" ")}`, X(x), Y(y) - size * 0.72 * u);
      }
      ctx.restore();
    },
    mark(kind, x, y, o = {}) {
      const R = (o.size ?? 34) * u;
      const tone: Tone = kind === "check" ? "good" : "bad";
      const cx = X(x);
      const cy = Y(y);
      scaled(cx, cy, pop(o.at), () => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = alpha(GLOW[tone][1], 0.22);
        ctx.fill();
        ctx.shadowColor = GLOW[tone][0];
        ctx.shadowBlur = 18 * u;
        ctx.lineWidth = 3 * u;
        ctx.strokeStyle = GLOW[tone][0];
        ctx.stroke();
        const d = progress(t, (o.at ?? 0) + 0.15, 0.3);
        ctx.lineWidth = 4.5 * u;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const pts: Pt[] =
          kind === "check"
            ? [
                [cx - R * 0.42, cy + R * 0.02],
                [cx - R * 0.1, cy + R * 0.34],
                [cx + R * 0.45, cy - R * 0.32],
              ]
            : [
                [cx - R * 0.35, cy - R * 0.35],
                [cx + R * 0.35, cy + R * 0.35],
              ];
        trace(ctx, along(pts, d).points);
        ctx.stroke();
        if (kind === "cross" && d > 0) {
          trace(ctx, [
            [cx + R * 0.35, cy - R * 0.35],
            [cx - R * 0.35, cy + R * 0.35],
          ]);
          ctx.stroke();
        }
        ctx.restore();
      });
    },
    finish() {
      const g = ctx.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.35,
        W / 2,
        H / 2,
        Math.hypot(W, H) * 0.6,
      );
      g.addColorStop(0, "rgba(4,4,20,0)");
      g.addColorStop(1, "rgba(4,4,20,0.55)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    },
  };
}

export default {
  id: "tech-glow",
  name: "Neon tech",
  category: "Popular Explainer Looks",
  make,
} satisfies Style;
