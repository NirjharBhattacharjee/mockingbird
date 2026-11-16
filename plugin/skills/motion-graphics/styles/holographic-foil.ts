// Holo trading cards and die-cut stickers on a dark desk: cracked-ice foil
// whose rainbow slides as the light moves, a white glint sweeping across,
// cards dealt in with a spin and stickers slapped down with an overshoot.
import {
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

const NAVY = "#1A1C33";
const TINT: Record<Tone, number> = { ink: 200, accent: 280, good: 140, bad: 350, muted: 230 };
const HEAVY = '"Avenir Next", "Futura", "Helvetica Neue", Arial, sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__holoIce ??= new Map();

  /** Cracked-ice shards in grey, laid over the rainbow to break it up. */
  function ice() {
    const key = `${W}x${H}`;
    let tile = g.__holoIce.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      const s = 26 * u;
      for (let gy = -1; gy < H / s + 1; gy++) {
        for (let gx = -1; gx < W / s + 1; gx++) {
          const k = gx * 71 + gy * 131;
          const cx = (gx + hash(k)) * s;
          const cy = (gy + hash(k + 1)) * s;
          c.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 + hash(k + i) * 0.9;
            const r = s * (0.5 + hash(k + i * 3) * 0.5);
            i
              ? c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
              : c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          }
          c.closePath();
          const v = Math.floor(hash(k + 9) * 255);
          c.fillStyle = `rgba(${v},${v},${v},0.55)`;
          c.fill();
        }
      }
      g.__holoIce.set(key, tile);
    }
    return tile;
  }

  /** Fill the current path with holo foil across a box: rainbow, shards, a moving glint. */
  function foil(x0: number, y0: number, x1: number, y1: number, hue = 260) {
    ctx.save();
    ctx.clip();
    const shift = t * 0.25;
    const gr = ctx.createLinearGradient(x0, y0, x1, y1);
    for (let i = 0; i <= 6; i++) {
      const h = hue + ((i / 6 + shift) % 1) * 300;
      gr.addColorStop(i / 6, `hsl(${h % 360},85%,68%)`);
    }
    ctx.fillStyle = gr;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.globalCompositeOperation = "overlay";
    ctx.drawImage(ice(), 0, 0);
    ctx.globalCompositeOperation = "source-over";
    const sx = x0 + (((t * 0.4 + (x0 / W) * 0.3) % 1.6) - 0.3) * (x1 - x0);
    const sp = ctx.createLinearGradient(sx - 40 * u, y0, sx + 40 * u, y1);
    sp.addColorStop(0, "rgba(255,255,255,0)");
    sp.addColorStop(0.5, "rgba(255,255,255,0.55)");
    sp.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sp;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }

  function rounded(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  /** Bold foil lettering with a dark outline, so it reads on anything. */
  function foilText(
    s: string,
    x: number,
    y: number,
    size: number,
    align = "center",
    hue = 260,
    plain = false,
  ) {
    ctx.save();
    ctx.font = `800 ${Math.round(size * u)}px ${HEAVY}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.14 * u;
    ctx.strokeStyle = plain ? "#F4F4FA" : "#15162A";
    ctx.strokeText(s, x, y);
    if (plain) {
      ctx.fillStyle = "#15162A";
      ctx.fillText(s, x, y);
    } else {
      const gr = ctx.createLinearGradient(left, y - size * 0.5 * u, left + w, y + size * 0.5 * u);
      for (let i = 0; i <= 6; i++)
        gr.addColorStop(i / 6, `hsl(${(hue + ((i / 6 + t * 0.3) % 1) * 300) % 360},90%,70%)`);
      ctx.fillStyle = gr;
      ctx.fillText(s, x, y);
      // An embossed highlight along the top of the glyphs.
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, y - size * u, w, size * 0.45 * u);
      ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillText(s, x, y);
      ctx.restore();
    }
    ctx.restore();
  }

  /** A card dealt in: slides and spins from the lower left, then settles. */
  function dealt(cx: number, cy: number, at: number, k: number, draw: () => void) {
    const p = expo(progress(t, at, 0.5));
    if (p <= 0) return;
    ctx.save();
    ctx.translate(cx - (1 - p) * W * 0.35, cy + (1 - p) * H * 0.25);
    ctx.rotate((1 - p) * -0.9 + (hash(k) - 0.5) * 0.05);
    ctx.translate(-cx, -cy);
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 18 * u;
    ctx.shadowOffsetY = 8 * u;
    draw();
    ctx.restore();
  }

  /** A sticker slapped down: big, then overshoots small, then settles. */
  function slapped(cx: number, cy: number, at: number, draw: () => void) {
    const s = spring(t, { start: at, stiffness: 380, damping: 15 });
    if (s <= 0) return;
    ctx.save();
    ctx.translate(cx, cy);
    const k = 1.6 - 0.6 * s;
    ctx.scale(k, k);
    ctx.globalAlpha = clamp(s * 3);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }

  return {
    surface() {
      ctx.fillStyle = "#17171C";
      ctx.fillRect(0, 0, W, H);
      const lamp = ctx.createRadialGradient(W * 0.35, H * 0.3, 0, W * 0.35, H * 0.3, W * 0.8);
      lamp.addColorStop(0, "rgba(90,90,110,0.45)");
      lamp.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = lamp;
      ctx.fillRect(0, 0, W, H);
      // A faint rainbow spill on the desk, drifting.
      const sx = W * (0.5 + Math.sin(t * 0.4) * 0.2);
      const sp = ctx.createRadialGradient(sx, H * 0.85, 0, sx, H * 0.85, W * 0.4);
      sp.addColorStop(0, `hsla(${(t * 40) % 360},80%,60%,0.08)`);
      sp.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sp;
      ctx.fillRect(0, 0, W, H);
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.05, size = 40, at = 0 } = o;
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${HEAVY}`;
      const w = ctx.measureText(s).width + 40 * u;
      ctx.restore();
      const h = size * 1.6 * u;
      const [x0, y0] = [X(x), Y(y)];
      slapped(x0 + w / 2, y0 + h / 2, at, () => {
        rounded(x0 - 4 * u, y0 - 4 * u, w + 8 * u, h + 8 * u, 14 * u);
        ctx.fillStyle = "#F4F4FA";
        ctx.fill();
        rounded(x0, y0, w, h, 11 * u);
        foil(x0, y0, x0 + w, y0 + h, 180);
        foilText(s, x0 + 20 * u, y0 + h / 2, size, "left", 0, true);
      });
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, align = "center", tone = "ink" } = o;
      slapped(X(x), Y(y), at, () => {
        ctx.save();
        ctx.font = `800 ${Math.round(size * u)}px ${HEAVY}`;
        const w = ctx.measureText(s).width + 26 * u;
        ctx.restore();
        const h = size * 1.45 * u;
        const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
        rounded(left - 3 * u, Y(y) - h / 2 - 3 * u, w + 6 * u, h + 6 * u, 10 * u);
        ctx.fillStyle = "#F4F4FA";
        ctx.fill();
        rounded(left, Y(y) - h / 2, w, h, 8 * u);
        foil(left, Y(y) - h / 2, left + w, Y(y) + h / 2, TINT[tone]);
        foilText(s, left + w / 2, Y(y), size, "center", 0, true);
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const R = r * u;
      const [cx, cy] = [X(x), Y(y)];
      slapped(cx, cy, at, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, R + 3 * u, 0, Math.PI * 2);
        ctx.fillStyle = "#F4F4FA";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        foil(cx - R, cy - R, cx + R, cy + R, TINT[tone]);
      });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      dealt(x0 + bw / 2, y0 + bh / 2, at, x * 9, () => {
        rounded(x0, y0, bw, bh, 12 * u);
        foil(x0, y0, x0 + bw, y0 + bh, TINT[tone]);
        ctx.shadowColor = "transparent";
        rounded(x0 + 9 * u, y0 + 9 * u, bw - 18 * u, bh - 18 * u, 8 * u);
        ctx.fillStyle = NAVY;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1 * u;
        ctx.stroke();
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      if (!head) {
        const p = progress(t, at, dur);
        if (p <= 0) return;
        const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
        ctx.save();
        trace(ctx, pts.slice(0, Math.max(2, Math.round(pts.length * p))));
        ctx.strokeStyle = `hsla(${(TINT[tone] + x1 * 400 + t * 60) % 360},80%,75%,0.6)`;
        ctx.lineWidth = 1.5 * u;
        ctx.stroke();
        ctx.restore();
        return;
      }
      // A die-cut foil arrow sticker along the path.
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 24);
      const mid = pts[12] as Pt;
      slapped(mid[0], mid[1], at, () => {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-4) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const hs = 22 * u;
        const base: Pt = [end[0] - Math.cos(a) * hs, end[1] - Math.sin(a) * hs];
        const shaft = pts.filter((p) => Math.hypot(p[0] - end[0], p[1] - end[1]) > hs);
        const outline = () => {
          trace(ctx, [...shaft, base]);
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
        };
        const head = () => {
          ctx.beginPath();
          ctx.moveTo(end[0], end[1]);
          ctx.lineTo(
            base[0] + Math.cos(a + Math.PI / 2) * hs * 0.8,
            base[1] + Math.sin(a + Math.PI / 2) * hs * 0.8,
          );
          ctx.lineTo(
            base[0] - Math.cos(a + Math.PI / 2) * hs * 0.8,
            base[1] - Math.sin(a + Math.PI / 2) * hs * 0.8,
          );
          ctx.closePath();
        };
        outline();
        ctx.strokeStyle = "#F4F4FA";
        ctx.lineWidth = 18 * u;
        ctx.stroke();
        head();
        ctx.lineWidth = 6 * u;
        ctx.stroke();
        ctx.fillStyle = "#F4F4FA";
        ctx.fill();
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const bx0 = Math.min(...xs) - hs;
        const by0 = Math.min(...ys) - hs;
        const bx1 = Math.max(...xs) + hs;
        const by1 = Math.max(...ys) + hs;
        // Foil inside: the shaft as a thick stroke turned into a clip via a stroked path isn't possible, so paint a thinner foil line.
        outline();
        ctx.save();
        ctx.lineWidth = 10 * u;
        const gr = ctx.createLinearGradient(bx0, by0, bx1, by1);
        for (let i = 0; i <= 6; i++)
          gr.addColorStop(
            i / 6,
            `hsl(${(TINT[tone] + ((i / 6 + t * 0.3) % 1) * 300) % 360},85%,66%)`,
          );
        ctx.strokeStyle = gr;
        ctx.stroke();
        ctx.restore();
        head();
        foil(bx0, by0, bx1, by1, TINT[tone]);
      });
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      // A pile of cards dealt one on another.
      for (let i = 0; i < 4; i++) {
        const ox = (hash(i * 3) - 0.5) * 10 * u - i * 3 * u;
        const oy = -i * 4 * u;
        dealt(x0 + bw / 2 + ox, y0 + bh / 2 + oy, at + i * 0.12, i + 4, () => {
          rounded(x0 + ox, y0 + oy, bw, bh, 9 * u);
          foil(x0 + ox, y0 + oy, x0 + ox + bw, y0 + oy + bh, TINT[tone] + i * 30);
          ctx.shadowColor = "transparent";
          rounded(x0 + ox + 6 * u, y0 + oy + bh * 0.62, bw - 12 * u, bh * 0.3, 4 * u);
          ctx.fillStyle = "#EDEDF4";
          ctx.fill();
        });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      if (sub) {
        const bw = size * 3 * u;
        const bh = size * 2.1 * u;
        const [x0, y0] = [X(x) - bw / 2, Y(y) - bh * 0.6];
        dealt(X(x), Y(y), at, 3, () => {
          rounded(x0, y0, bw, bh, 12 * u);
          foil(x0, y0, x0 + bw, y0 + bh, TINT[tone]);
          ctx.shadowColor = "transparent";
          rounded(x0 + 8 * u, y0 + 8 * u, bw - 16 * u, bh - 16 * u, 8 * u);
          ctx.fillStyle = NAVY;
          ctx.fill();
          foilText(sub.toUpperCase(), X(x), y0 + bh * 0.22, size * 0.3, "center", TINT[tone]);
          foilText(value, X(x), Y(y) + size * 0.12 * u, size, "center", TINT[tone]);
        });
      } else if (t >= at) {
        ctx.save();
        ctx.globalAlpha = expo(progress(t, at, 0.3));
        foilText(value, X(x), Y(y), size, "center", TINT[tone]);
        ctx.restore();
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 34 } = o;
      const r = size * u;
      const [cx, cy] = [X(x), Y(y)];
      slapped(cx, cy, at, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4 * u, 0, Math.PI * 2);
        ctx.fillStyle = "#F4F4FA";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = kind === "check" ? "#1FA463" : "#E5304A";
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 6 * u;
        ctx.lineCap = "round";
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.45, cy],
            [cx - r * 0.1, cy + r * 0.35],
            [cx + r * 0.5, cy - r * 0.35],
          ]);
        else {
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.4, cy - r * 0.4);
          ctx.lineTo(cx + r * 0.4, cy + r * 0.4);
          ctx.moveTo(cx + r * 0.4, cy - r * 0.4);
          ctx.lineTo(cx - r * 0.4, cy + r * 0.4);
        }
        ctx.stroke();
      });
    },
    finish() {
      // Glitter flecks catching the light.
      for (let i = 0; i < 30; i++) {
        const a = clamp(Math.sin(t * 3 + i * 1.7) * 2 - 1);
        if (a <= 0) continue;
        ctx.fillStyle = `hsla(${(i * 47) % 360},90%,85%,${a * 0.8})`;
        ctx.fillRect(hash(i * 2.1) * W, hash(i * 3.3) * H, 2.5 * u, 2.5 * u);
      }
    },
  };
}

export default {
  id: "holographic-foil",
  name: "Holo foil cards",
  category: "Light & Imaging",
  make,
} satisfies Style;
