// Flat vector space for science explainers: a navy-to-violet sky with
// sparkles, chunky outline-free planets lit by a flat crescent shadow and a
// rim of light, rounded pill labels and dotted curving arrows. Everything
// pops in on a soft spring and keeps a gentle float.
import {
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
  vignette,
} from "./look.ts";

const WHITE = "#FFFFFF";
const NAVY = "#1B1550";
// [light, mid, dark] for each tone's bodies
const BODY: Record<Tone, [string, string, string]> = {
  ink: ["#E8E4FF", "#A99CF0", "#5A4BB0"],
  accent: ["#8FF0FF", "#38C2E8", "#1A6FB0"],
  good: ["#B9F7C8", "#45D58A", "#1C8A5C"],
  bad: ["#FFB3C2", "#FF5C7A", "#B8244A"],
  muted: ["#D6D2EE", "#9590C0", "#5B5690"],
};
const ROUND =
  '"Nunito", "Avenir Next Rounded", "Arial Rounded MT Bold", "Avenir Next", "Helvetica Neue", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const font = (size: number, weight = 800) => `${weight} ${Math.round(size * u)}px ${ROUND}`;
  /** A pop-in scale: 0 before `at`, overshoots a little, settles at 1. */
  const pop = (at: number) => spring(t, { start: at, stiffness: 170, damping: 12 });
  /** A slow bob so nothing sits perfectly still. */
  const bob = (seed: number) => Math.sin(t * 1.6 + seed * 7) * 3 * u;
  const g = globalThis as any;
  g.__flatSpaceSky ??= new Map();
  const cache: Map<string, any> = g.__flatSpaceSky;

  function sky() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const x = c.getContext("2d");
      const gr = x.createLinearGradient(0, 0, W * 0.4, H);
      gr.addColorStop(0, "#14123F");
      gr.addColorStop(0.55, "#2C1B6B");
      gr.addColorStop(1, "#5A2A8C");
      x.fillStyle = gr;
      x.fillRect(0, 0, W, H);
      const glow = x.createRadialGradient(W * 0.75, H * 0.35, 0, W * 0.75, H * 0.35, W * 0.55);
      glow.addColorStop(0, "rgba(140,90,230,0.28)");
      glow.addColorStop(1, "rgba(140,90,230,0)");
      x.fillStyle = glow;
      x.fillRect(0, 0, W, H);
      for (let i = 0; i < 260; i++) {
        const b = hash(i * 4.4);
        x.fillStyle = `rgba(255,255,255,${0.2 + b * 0.6})`;
        x.beginPath();
        x.arc(hash(i * 5.1) * W, hash(i * 6.3) * H, (0.6 + b ** 3 * 1.6) * u, 0, Math.PI * 2);
        x.fill();
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  /** A four-point sparkle. */
  function sparkle(x: number, y: number, r: number, a: number) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
    ctx.restore();
  }

  /** A flat planet: gradient body, a crescent of shadow, a rim of light. */
  function planet(cx: number, cy: number, R: number, tone: Tone, bands = 0) {
    const [light, mid, dark] = BODY[tone];
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    const gr = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    gr.addColorStop(0, light);
    gr.addColorStop(0.5, mid);
    gr.addColorStop(1, dark);
    ctx.fillStyle = gr;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    for (let i = 0; i < bands; i++) {
      ctx.fillStyle = i % 2 ? alpha(light, 0.25) : alpha(dark, 0.22);
      ctx.fillRect(cx - R, cy - R + ((i + 0.5) / bands) * R * 2, R * 2, (R * 2) / bands / 2);
    }
    // crescent shadow: the body minus a circle shifted to the light
    ctx.fillStyle = alpha(dark, 0.55);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.arc(cx - R * 0.28, cy - R * 0.22, R * 0.98, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.86, Math.PI * 1.05, Math.PI * 1.45);
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = Math.max(2, R * 0.09);
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  }

  function glow(cx: number, cy: number, r: number, color: string, a: number) {
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, alpha(color, a));
    gr.addColorStop(1, alpha(color, 0));
    ctx.fillStyle = gr;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  function rounded(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2));
  }

  /** Scale everything drawn in `draw` about (cx, cy). */
  function scaled(cx: number, cy: number, s: number, draw: () => void) {
    if (s <= 0.001) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }

  return {
    surface() {
      sky();
      // a little moon top right and a pink ringed giant rising bottom right
      const pm = pop(0.3);
      scaled(X(0.88), Y(0.12), pm, () => planet(X(0.88), Y(0.12) + bob(1), 18 * u, "ink"));
      const p = expo(progress(t, 0.1, 1.4));
      if (p <= 0) return;
      const cx = X(0.93);
      const cy = Y(0.98) + (1 - p) * 220 * u;
      const R = 150 * u;
      const ring = (front: boolean) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.28);
        for (const [k, c] of ["#F2B37A", "#D98A6A", "#F7CF9C"].entries()) {
          ctx.beginPath();
          ctx.ellipse(
            0,
            0,
            R * (1.55 + k * 0.1),
            R * (0.3 + k * 0.03),
            0,
            front ? 0 : Math.PI,
            front ? Math.PI : Math.PI * 2,
          );
          ctx.strokeStyle = c;
          ctx.lineWidth = 9 * u;
          ctx.stroke();
        }
        ctx.restore();
      };
      ring(false);
      planet(cx, cy, R, "bad", 6);
      ring(true);
    },
    title(s, o = {}) {
      const { x = 0.05, y = 0.11, size = 76, at = 0, align = "left" } = o;
      const p = pop(at);
      if (p <= 0) return;
      ctx.save();
      ctx.font = font(size, 900);
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      const tx = X(x);
      const ty = Y(y) + (1 - clamp(p)) * 30 * u;
      ctx.globalAlpha = clamp(p * 1.5);
      ctx.shadowColor = "rgba(10,6,40,0.5)";
      ctx.shadowOffsetY = 4 * u;
      ctx.fillStyle = WHITE;
      ctx.fillText(s, tx, ty);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { size = 34, align = "center", tone = "ink", at = 0 } = o;
      const p = pop(at);
      if (p <= 0) return;
      ctx.font = font(size);
      const w = ctx.measureText(s).width + size * 1.1 * u;
      const h = size * 1.55 * u;
      const cx = align === "left" ? X(x) + w / 2 : align === "right" ? X(x) - w / 2 : X(x);
      const cy = Y(y) + bob(x + y);
      const filled = tone !== "ink" && tone !== "muted";
      scaled(cx, cy, p, () => {
        ctx.save();
        ctx.shadowColor = "rgba(10,6,40,0.45)";
        ctx.shadowOffsetY = 4 * u;
        rounded(cx - w / 2, cy - h / 2, w, h, h / 2);
        ctx.fillStyle = filled ? BODY[tone][1] : WHITE;
        ctx.fill();
        ctx.restore();
        ctx.font = font(size);
        ctx.fillStyle = filled ? WHITE : NAVY;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s, cx, cy + size * 0.04 * u);
      });
    },
    node(x, y, r, o = {}) {
      const at = o.at ?? 0;
      const tone = o.tone ?? "accent";
      const p = pop(at);
      if (p <= 0) return;
      const cx = X(x);
      const cy = Y(y) + bob(x * 3 + y);
      const R = r * u;
      scaled(cx, cy, p, () => {
        glow(cx, cy, R * 2.2, BODY[tone][1], 0.35 + 0.1 * Math.sin(t * 3 + x * 9));
        planet(cx, cy, R, tone);
      });
    },
    box(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const tone = o.tone ?? "ink";
      const p = pop(at);
      if (p <= 0) return;
      const [bx, by, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const [light, mid] = BODY[tone];
      scaled(bx + bw / 2, by + bh / 2, p, () => {
        ctx.save();
        ctx.shadowColor = "rgba(10,6,40,0.5)";
        ctx.shadowOffsetY = 8 * u;
        rounded(bx, by, bw, bh, 28 * u);
        const gr = ctx.createLinearGradient(bx, by, bx, by + bh);
        gr.addColorStop(0, "#3A2C8A");
        gr.addColorStop(1, "#24196A");
        ctx.fillStyle = gr;
        ctx.fill();
        ctx.restore();
        rounded(bx, by, bw, bh, 28 * u);
        ctx.strokeStyle = mid;
        ctx.lineWidth = 5 * u;
        ctx.stroke();
        // a highlight along the top edge
        rounded(bx + 14 * u, by + 10 * u, bw - 28 * u, 7 * u, 4 * u);
        ctx.fillStyle = alpha(light, 0.35);
        ctx.fill();
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const p = expo(progress(t, at, dur));
      if (p <= 0) return;
      const color = tone === "ink" ? "#8FD8FF" : BODY[tone][1];
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      trace(ctx, shown);
      ctx.lineCap = "round";
      ctx.strokeStyle = head ? color : alpha(color, 0.4);
      ctx.lineWidth = (head ? 5 : 2) * u;
      ctx.setLineDash(head ? [0.1, 11 * u] : []);
      ctx.stroke();
      ctx.restore();
      if (head && p >= 0.99) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-4) as Pt;
        ctx.save();
        arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 16 * u, false);
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineJoin = "round";
        ctx.lineWidth = 4 * u;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    },
    store(x, y, w, h, o = {}) {
      // a banded blue planet with a ring: where the examples live
      const at = o.at ?? 0;
      const p = pop(at);
      if (p <= 0) return;
      const cx = X(x + w / 2);
      const cy = Y(y + h / 2) + bob(2);
      const R = Math.min(X(w), Y(h)) * 0.48;
      scaled(cx, cy, p, () => {
        glow(cx, cy, R * 1.8, "#5AB8FF", 0.3);
        const ring = (front: boolean) => {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(-0.3);
          ctx.beginPath();
          ctx.ellipse(
            0,
            0,
            R * 1.6,
            R * 0.38,
            0,
            front ? 0 : Math.PI,
            front ? Math.PI : Math.PI * 2,
          );
          ctx.strokeStyle = "#F5B85A";
          ctx.lineWidth = 7 * u;
          ctx.stroke();
          ctx.restore();
        };
        ring(false);
        planet(cx, cy, R, "accent", 8);
        ring(true);
        // examples orbiting it as little dots
        for (let i = 0; i < 6; i++) {
          const a = t * 1.2 + (i / 6) * Math.PI * 2;
          const k = clamp((t - at - 0.3 - i * 0.08) * 3);
          ctx.beginPath();
          ctx.arc(
            cx + Math.cos(a) * R * 1.6,
            cy + Math.sin(a) * R * 0.38 - Math.cos(a) * R * 0.4,
            4 * u * k,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = WHITE;
          ctx.fill();
        }
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "ink" } = o;
      const p = pop(at);
      if (p <= 0) return;
      const str = count ? counting(t, at, dur, count) + s : s;
      const cx = X(x);
      const cy = Y(y);
      const done = !count || t >= at + dur;
      const gold = tone === "accent";
      scaled(cx, cy, p, () => {
        if (gold && done) {
          // a burst of light once it lands
          const b = progress(t, at + dur, 0.8);
          glow(cx, cy, size * 2 * u, "#FFD15A", 0.45 * (1 - b * 0.5));
        }
        ctx.save();
        ctx.font = font(size, 900);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(10,6,40,0.5)";
        ctx.shadowOffsetY = 5 * u;
        if (gold) {
          const gr = ctx.createLinearGradient(0, cy - size * 0.5 * u, 0, cy + size * 0.5 * u);
          gr.addColorStop(0, "#FFE58A");
          gr.addColorStop(1, "#E8A53A");
          ctx.fillStyle = gr;
        } else ctx.fillStyle = tone === "ink" || tone === "muted" ? WHITE : BODY[tone][0];
        ctx.fillText(str, cx, cy);
        ctx.restore();
        if (sub) {
          ctx.font = font(size * 0.34, 800);
          ctx.fillStyle = "#CFC8FF";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(sub, cx, cy + size * 0.72 * u);
        }
      });
    },
    mark(kind, x, y, o = {}) {
      const at = o.at ?? 0;
      const p = pop(at);
      if (p <= 0) return;
      const r = (o.size ?? 24) * u;
      const cx = X(x);
      const cy = Y(y) + bob(x + 5);
      const tone: Tone = kind === "check" ? "good" : "bad";
      scaled(cx, cy, p, () => {
        ctx.save();
        ctx.shadowColor = "rgba(10,6,40,0.45)";
        ctx.shadowOffsetY = 4 * u;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = BODY[tone][1];
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = WHITE;
        ctx.lineWidth = r * 0.24;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.45, cy + r * 0.02],
            [cx - r * 0.1, cy + r * 0.35],
            [cx + r * 0.45, cy - r * 0.3],
          ]);
        else {
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.35, cy - r * 0.35);
          ctx.lineTo(cx + r * 0.35, cy + r * 0.35);
          ctx.moveTo(cx + r * 0.35, cy - r * 0.35);
          ctx.lineTo(cx - r * 0.35, cy + r * 0.35);
        }
        ctx.stroke();
      });
    },
    finish() {
      // sparkles that twinkle in and out
      for (let i = 0; i < 14; i++) {
        const a = Math.max(0, Math.sin(t * 2.2 + i * 1.9)) ** 3;
        sparkle(hash(i * 7.3) * W, hash(i * 3.9) * H, (5 + hash(i * 2.2) * 6) * u, a * 0.9);
      }
      vignette(ctx, m, 0.3, "12,8,40");
    },
  };
}

export default {
  id: "flat-space",
  name: "Flat vector space",
  category: "Popular Explainer Looks",
  make,
} satisfies Style;
