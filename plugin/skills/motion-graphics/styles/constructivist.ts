// Revolutionary agitprop poster: red, black and cream only, mottled litho
// ink on cheap stock, hard diagonals, condensed capitals set on a slant.
// Everything moves on twos: bars shoot in along their diagonal, words slam
// down from oversize, and the big number bursts out of a fan of beams.
import {
  arrowhead,
  clamp,
  counting,
  curve,
  frame,
  hash,
  type Look,
  type Pt,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const RED = "#C8261E";
const BLACK = "#1B1714";
const CREAM = "#EADFC6";
const TONE: Record<Tone, string> = {
  ink: BLACK,
  accent: RED,
  good: BLACK,
  bad: RED,
  muted: "#8A7F6C",
};
const HEAVY = '"Anton", "Impact", "Haettenschweiler", "Arial Narrow", "Helvetica Neue", sans-serif';
const SLANT = -0.09;

function make(ctx: any, t0: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  // on twos: the poster moves at 12 frames a second
  const t = Math.floor(t0 * 12) / 12;
  const font = (size: number) => `400 ${Math.round(size * u)}px ${HEAVY}`;
  const g = globalThis as any;
  g.__agitMottle ??= new Map();
  const cache: Map<string, any> = g.__agitMottle;
  const prog = (at = 0, dur = 0.3) => clamp((t - at) / (dur || 1e-6));
  /** A slam: scale from 1.7 to 1 over a quarter second, then dead still. */
  const slam = (at = 0) => {
    const p = prog(at, 0.25);
    return p <= 0 ? 0 : 1 + (1 - p) ** 2 * 0.7;
  };

  function slanted(cx: number, cy: number, s: number, draw: () => void) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(SLANT);
    ctx.scale(s, s);
    draw();
    ctx.restore();
  }

  function caps(s: string, x: number, y: number, size: number, color: string, align = "center") {
    ctx.font = font(size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s.toUpperCase(), x, y);
  }

  /** Words on a slanted slab: slab colour behind, caps in front. */
  function slab(
    s: string,
    cx: number,
    cy: number,
    size: number,
    bg: string,
    fg: string,
    at: number,
    align = "center",
  ) {
    const k = slam(at);
    if (k <= 0) return;
    ctx.font = font(size);
    const w = ctx.measureText(s.toUpperCase()).width + size * 0.5 * u;
    const h = size * 1.2 * u;
    const ox = align === "center" ? -w / 2 : align === "right" ? -w : 0;
    slanted(cx, cy, k, () => {
      ctx.fillStyle = bg;
      ctx.fillRect(ox, -h / 2, w, h);
      caps(s, ox + w / 2, h * 0.04, size, fg);
    });
  }

  function mottle() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const x = c.getContext("2d");
      for (let i = 0; i < 2600; i++) {
        const v = hash(i * 1.37);
        x.fillStyle = v > 0.5 ? "rgba(255,250,235,0.08)" : "rgba(60,40,20,0.07)";
        x.beginPath();
        x.arc(hash(i * 2.11) * W, hash(i * 3.17) * H, (1 + hash(i * 4.3) * 5) * u, 0, Math.PI * 2);
        x.fill();
      }
      const vg = x.createRadialGradient(
        W / 2,
        H / 2,
        H * 0.3,
        W / 2,
        H / 2,
        Math.hypot(W, H) * 0.6,
      );
      vg.addColorStop(0, "rgba(90,60,30,0)");
      vg.addColorStop(1, "rgba(90,60,30,0.28)");
      x.fillStyle = vg;
      x.fillRect(0, 0, W, H);
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  /** Halftone dots inside the current clip, for printed-photo shading. */
  function halftone(x: number, y: number, w: number, h: number, color: string) {
    ctx.fillStyle = color;
    const s = 7 * u;
    for (let py = y; py < y + h; py += s)
      for (let px = x; px < x + w; px += s) {
        const f = clamp(0.25 + ((px - x) / w) * 0.6);
        ctx.beginPath();
        ctx.arc(px, py, s * 0.5 * f, 0, Math.PI * 2);
        ctx.fill();
      }
  }

  return {
    surface() {
      ctx.fillStyle = CREAM;
      ctx.fillRect(0, 0, W, H);
      // the red disc rolls in from the right and a black bar cuts the corner
      const p = prog(0, 0.6);
      const ease = 1 - (1 - p) ** 3;
      ctx.beginPath();
      ctx.arc(X(1.0) + (1 - ease) * 500 * u, Y(1.0), 340 * u, 0, Math.PI * 2);
      ctx.fillStyle = RED;
      ctx.fill();
      ctx.save();
      ctx.translate(X(0.5), Y(0.93));
      ctx.rotate(SLANT * 1.6);
      ctx.fillStyle = BLACK;
      ctx.fillRect(-W * 0.8 * ease, -14 * u, W * 0.8 * ease * 2, 28 * u);
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.09, size = 66, at = 0 } = o;
      slab(s, X(x), Y(y), size, BLACK, CREAM, at, "left");
    },
    label(s, x, y, o = {}) {
      const { size = 36, align = "center", tone = "ink", at = 0 } = o;
      const bg = tone === "bad" || tone === "accent" ? RED : BLACK;
      slab(s, X(x), Y(y), size, bg, CREAM, at, align);
    },
    node(x, y, r, o = {}) {
      const k = slam(o.at);
      if (k <= 0) return;
      const R = r * u;
      const tone = o.tone ?? "accent";
      ctx.save();
      ctx.translate(X(x), Y(y));
      ctx.scale(k, k);
      ctx.beginPath();
      ctx.arc(3 * u, 3 * u, R, 0, Math.PI * 2);
      ctx.fillStyle = BLACK;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fillStyle = tone === "accent" || tone === "bad" ? RED : CREAM;
      ctx.fill();
      ctx.save();
      ctx.clip();
      halftone(-R, -R, R * 2, R * 2, "rgba(27,23,20,0.55)");
      ctx.restore();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const p = prog(o.at, 0.25);
      if (p <= 0) return;
      // slides in along its diagonal, a red wedge pinned to the corner
      const off = (1 - p) * 120 * u;
      const [bx, by, bw, bh] = [X(x) - off, Y(y) + off * 0.3, X(w), Y(h)];
      ctx.save();
      ctx.fillStyle = BLACK;
      ctx.fillRect(bx + 8 * u, by + 8 * u, bw, bh);
      ctx.fillStyle = CREAM;
      ctx.fillRect(bx, by, bw, bh);
      ctx.lineWidth = 6 * u;
      ctx.strokeStyle = BLACK;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + bw * 0.35, by);
      ctx.lineTo(bx, by + bh * 0.35);
      ctx.closePath();
      ctx.fillStyle = o.tone === "bad" ? BLACK : RED;
      ctx.fill();
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.3, bend = 0, head = true, tone = "accent" } = o;
      const p = prog(at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 24);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      trace(ctx, shown);
      ctx.strokeStyle = head ? TONE[tone] : tone === "accent" ? "rgba(200,38,30,0.7)" : TONE[tone];
      ctx.lineWidth = (head ? 9 : 3) * u;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 30 * u, false);
        ctx.fillStyle = TONE[tone];
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const n = 5;
      for (let i = 0; i < n; i++) {
        const p = prog(at + i * 0.08, 0.2);
        if (p <= 0) continue;
        const bh = Y(h) / n;
        const off = (1 - p) * -200 * u;
        ctx.save();
        ctx.translate(X(x + w / 2) + off, Y(y) + bh * (i + 0.5));
        ctx.rotate(SLANT);
        ctx.fillStyle = i % 2 ? RED : BLACK;
        ctx.fillRect(-X(w) / 2 - (i % 2) * 6 * u, -bh * 0.38, X(w) + (i % 2) * 12 * u, bh * 0.76);
        ctx.restore();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "accent" } = o;
      const k = slam(at);
      if (k <= 0) return;
      const [cx, cy] = [X(x), Y(y)];
      if (sub) {
        // beams punching out from behind, two frames at a time
        const n = 14;
        const reach = prog(at, 0.4);
        ctx.save();
        ctx.translate(cx, cy);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + 0.2;
          const l = size * (2.8 + hash(i) * 1.2) * u * reach * (1 + 0.05 * Math.sin(t * 12 + i));
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - 0.16) * size * 0.6 * u, Math.sin(a - 0.16) * size * 0.6 * u);
          ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l);
          ctx.lineTo(Math.cos(a + 0.16) * size * 0.6 * u, Math.sin(a + 0.16) * size * 0.6 * u);
          ctx.closePath();
          ctx.fillStyle = i % 2 ? RED : BLACK;
          ctx.fill();
        }
        ctx.restore();
      }
      const str = count ? counting(t, at, dur, count) + s : s;
      slanted(cx, cy, k, () => {
        if (sub) {
          ctx.font = font(size);
          const w = ctx.measureText(`${count ? count[1] : ""}${s}`).width + size * 0.4 * u;
          ctx.fillStyle = BLACK;
          ctx.fillRect(-w / 2, -size * 0.62 * u, w, size * 1.2 * u);
          caps(str, 0, size * 0.03 * u, size, tone === "accent" || tone === "bad" ? RED : CREAM);
          ctx.fillStyle = RED;
          ctx.font = font(size * 0.3);
          const sw = ctx.measureText(sub.toUpperCase()).width + 16 * u;
          ctx.fillRect(-sw / 2, -size * 0.95 * u, sw, size * 0.38 * u);
          caps(sub, 0, -size * 0.76 * u, size * 0.3, CREAM);
        } else caps(str, 0, 0, size, TONE[tone]);
      });
    },
    mark(kind, x, y, o = {}) {
      const k = slam(o.at);
      if (k <= 0) return;
      const r = (o.size ?? 34) * u;
      ctx.save();
      ctx.translate(X(x), Y(y));
      ctx.scale(k, k);
      ctx.rotate(SLANT);
      ctx.strokeStyle = kind === "check" ? BLACK : RED;
      ctx.lineWidth = r * 0.38;
      ctx.lineCap = "butt";
      if (kind === "check")
        trace(ctx, [
          [-r * 0.7, 0],
          [-r * 0.15, r * 0.55],
          [r * 0.8, -r * 0.6],
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, -r * 0.7);
        ctx.lineTo(r * 0.7, r * 0.7);
        ctx.moveTo(r * 0.7, -r * 0.7);
        ctx.lineTo(-r * 0.7, r * 0.7);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      mottle();
    },
  };
}

export default {
  id: "constructivist",
  name: "Agitprop poster",
  category: "Art & Design Movements",
  make,
} satisfies Style;
