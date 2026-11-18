// A forties crime picture as a newsreel: black-and-white only, blind-slat
// light across a dark wall, a spotlight that warms up, a headline that spins
// in, dial gauges, white newsreel arrows, rolling odometer numbers and a
// rubber stamp slammed down, all under grain, flicker and gate weave.
import {
  arrowhead,
  clamp,
  counting,
  curve,
  expo,
  frame,
  grain,
  hash,
  type Look,
  leftOf,
  type Pt,
  progress,
  type Style,
  spring,
  type Tone,
  trace,
  vignette,
} from "./look.ts";

const GREY: Record<Tone, string> = {
  ink: "#EDEDED",
  accent: "#FFFFFF",
  good: "#F4F4F4",
  bad: "#D8D8D8",
  muted: "#8A8A8A",
};
const BOLD =
  '"Futura Condensed ExtraBold", "Impact", "Haettenschweiler", "Arial Narrow", sans-serif';
const BLACK = '"Didot", "Bodoni 72", "Times New Roman", serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__noirWall ??= new Map();
  const flicker = 0.93 + hash(Math.floor(t * 24) * 1.7) * 0.07;

  function caps(s: string, x: number, y: number, size: number, color: string, align = "center") {
    ctx.font = `400 ${Math.round(size * u)}px ${BOLD}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(s.toUpperCase(), x, y);
  }

  /** A dim iris-in: things fade up from black like a lamp coming on. */
  const lamp = (at = 0, dur = 0.4) => expo(progress(t, at, dur));

  return {
    surface() {
      const key = `${W}x${H}`;
      let tile = g.__noirWall.get(key);
      if (!tile) {
        tile = new OffscreenCanvas(W, H);
        const c = tile.getContext("2d");
        c.fillStyle = "#2A2A2A";
        c.fillRect(0, 0, W, H);
        // Blind slats of light, slanting across the wall.
        c.save();
        c.translate(W * 0.5, H * 0.5);
        c.rotate(-0.42);
        for (let i = -30; i < 30; i++) {
          const y = i * 30 * u;
          const gr = c.createLinearGradient(-W, 0, W, 0);
          gr.addColorStop(0, "rgba(200,200,200,0)");
          gr.addColorStop(0.55, "rgba(200,200,200,0.13)");
          gr.addColorStop(1, "rgba(200,200,200,0.02)");
          c.fillStyle = gr;
          c.fillRect(-W, y, W * 2, 13 * u);
        }
        c.restore();
        // The floor line.
        c.fillStyle = "#1A1A1A";
        c.fillRect(0, H * 0.86, W, H * 0.14);
        c.fillStyle = "rgba(255,255,255,0.12)";
        c.fillRect(0, H * 0.86, W, 2 * u);
        g.__noirWall.set(key, tile);
      }
      ctx.save();
      // Gate weave: the whole picture shivers a pixel or two. Undone in finish().
      ctx.translate(
        (hash(Math.floor(t * 12)) - 0.5) * 3 * u,
        (hash(Math.floor(t * 12) + 5) - 0.5) * 3 * u,
      );
      ctx.fillStyle = "#000";
      ctx.fillRect(-10, -10, W + 20, H + 20);
      ctx.globalAlpha = flicker;
      ctx.drawImage(tile, 0, 0);
      ctx.globalAlpha = 1;
      // A spotlight pooled over the middle of the frame.
      const sx = W * 0.47;
      const cone = ctx.createRadialGradient(sx, H * 0.1, 0, sx, H * 0.5, H * 0.75);
      cone.addColorStop(0, `rgba(255,255,255,${0.2 * flicker})`);
      cone.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(sx - 40 * u, 0);
      ctx.lineTo(sx + 40 * u, 0);
      ctx.lineTo(sx + W * 0.28, H * 0.86);
      ctx.lineTo(sx - W * 0.28, H * 0.86);
      ctx.closePath();
      ctx.fill();
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.06, size = 46, at = 0, dur = 0.9 } = o;
      if (t < at) return;
      // A newspaper spins in from small and settles at a tilt.
      const p = expo(progress(t, at, dur));
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${BOLD}`;
      const tw = ctx.measureText(s.toUpperCase()).width;
      const w = tw + 50 * u;
      const h = size * 2.3 * u;
      const cx = leftOf(X(x), w, o.align) + w / 2;
      const cy = Y(y) + h / 2;
      ctx.translate(cx, cy);
      ctx.rotate((1 - p) * Math.PI * 4 - 0.025);
      ctx.scale(0.1 + 0.9 * p, 0.1 + 0.9 * p);
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 20 * u;
      ctx.shadowOffsetY = 8 * u;
      ctx.fillStyle = "#E9E6DE";
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.shadowColor = "transparent";
      ctx.font = `700 ${Math.round(size * 0.32 * u)}px ${BLACK}`;
      ctx.fillStyle = "#222";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("The Evening Wire", 0, -h * 0.33);
      ctx.fillRect(-w / 2 + 10 * u, -h * 0.2, w - 20 * u, 1.5 * u);
      caps(s, 0, h * 0.1, size, "#151515");
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      for (let i = 0; i < 3; i++)
        ctx.fillRect(-w / 2 + 12 * u, h * 0.33 + i * 5 * u, w - 24 * u, 2 * u);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, tone = "ink", align = "center" } = o;
      const a = lamp(at, 0.25);
      if (a <= 0) return;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 6 * u;
      caps(s, X(x), Y(y), size, GREY[tone], align);
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const { at = 0 } = o;
      const a = lamp(at, 0.3);
      if (a <= 0) return;
      const R = r * u;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.globalAlpha = a;
      // A gauge: dark bezel, pale face, ticks and a needle that swings up.
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
      ctx.fill();
      const face = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R);
      face.addColorStop(0, "#FAFAFA");
      face.addColorStop(1, "#B5B5B5");
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.92, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 1.2 * u;
      for (let i = 0; i < 9; i++) {
        const ang = Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * R * 0.7, cy + Math.sin(ang) * R * 0.7);
        ctx.lineTo(cx + Math.cos(ang) * R * 0.85, cy + Math.sin(ang) * R * 0.85);
        ctx.stroke();
      }
      const swing = spring(t, { start: at, stiffness: 120, damping: 7 });
      const ang = Math.PI * 0.75 + swing * Math.PI * (0.6 + hash(cx + cy) * 0.8);
      ctx.lineWidth = 2.2 * u;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * R * 0.78, cy + Math.sin(ang) * R * 0.78);
      ctx.stroke();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0 } = o;
      const a = lamp(at, 0.35);
      if (a <= 0) return;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 24 * u;
      ctx.shadowOffsetY = 10 * u;
      ctx.fillStyle = "#1B1B1B";
      ctx.fillRect(x0, y0, bw, bh);
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "#6B6B6B";
      ctx.lineWidth = 5 * u;
      ctx.strokeRect(x0, y0, bw, bh);
      ctx.strokeStyle = "#BDBDBD";
      ctx.lineWidth = 1.2 * u;
      ctx.strokeRect(x0 + 8 * u, y0 + 8 * u, bw - 16 * u, bh - 16 * u);
      // The booking placard along the bottom.
      ctx.fillStyle = "#E4E4E4";
      ctx.fillRect(x0 + bw * 0.2, y0 + bh - 26 * u, bw * 0.6, 16 * u);
      ctx.fillStyle = "#111";
      ctx.font = `400 ${Math.round(11 * u)}px ${BOLD}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("EXHIBIT A", x0 + bw / 2, y0 + bh - 18 * u);
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = expo(progress(t, at, dur));
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      trace(ctx, shown);
      ctx.strokeStyle = head ? GREY[tone] : "rgba(230,230,230,0.55)";
      ctx.lineWidth = (head ? 5 : 1.2) * u;
      if (tone === "bad") ctx.setLineDash([14 * u, 9 * u]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (head && p > 0.98) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 20 * u, false);
        ctx.fillStyle = GREY[tone];
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0 } = o;
      // A stack of case files dropped in one after another.
      const n = 5;
      for (let i = 0; i < n; i++) {
        const s = spring(t, { start: at + i * 0.1, stiffness: 300, damping: 18 });
        if (s <= 0) continue;
        const fh = Y(h) / n;
        const fy = Y(y + h) - (i + 1) * fh - (1 - s) * 60 * u;
        ctx.save();
        ctx.globalAlpha = clamp(s * 2);
        ctx.translate(X(x + w / 2), fy + fh / 2);
        ctx.rotate((hash(i * 3.3) - 0.5) * 0.12);
        ctx.fillStyle = i % 2 ? "#C9C4B8" : "#B4AFA3";
        ctx.fillRect(-X(w) / 2, -fh / 2, X(w), fh - 3 * u);
        ctx.fillRect(-X(w) / 2 + 6 * u, -fh / 2 - 5 * u, X(w) * 0.35, 6 * u);
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1 * u;
        ctx.strokeRect(-X(w) / 2, -fh / 2, X(w), fh - 3 * u);
        ctx.restore();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      const a = lamp(at, 0.3);
      if (a <= 0) return;
      const value = count ? counting(t, at, dur, count) : s;
      const unit = count ? s : "";
      const chars = value.replace(/,/g, "").split("");
      const cw = size * 0.66 * u;
      const ch = size * 1.0 * u;
      const total = chars.length * cw + (unit ? size * 0.7 * u : 0);
      let left = X(x) - total / 2;
      const top = Y(y) - ch / 2 + (sub ? size * 0.12 * u : 0);
      ctx.save();
      ctx.globalAlpha = a;
      if (sub) caps(sub, X(x), top - size * 0.4 * u, size * 0.38, "#EDEDED");
      for (const d of chars) {
        // Odometer wheels: dark windows with a white digit rolling through.
        const wg = ctx.createLinearGradient(0, top, 0, top + ch);
        wg.addColorStop(0, "#080808");
        wg.addColorStop(0.5, "#2C2C2C");
        wg.addColorStop(1, "#080808");
        ctx.fillStyle = "#9A9A9A";
        ctx.fillRect(left - 2 * u, top - 2 * u, cw * 0.92 + 4 * u, ch + 4 * u);
        ctx.fillStyle = wg;
        ctx.fillRect(left, top, cw * 0.92, ch);
        caps(d, left + cw * 0.46, top + ch / 2, size * 0.82, "#F2F2F2");
        left += cw;
      }
      if (unit) caps(unit, left + size * 0.3 * u, top + ch / 2, size * 0.75, "#F2F2F2");
      ctx.restore();
      // A stamp lands on the big stat once the count settles.
      if (sub)
        stamp(X(x) + total * 0.35, top + ch * 1.15, "CONFIRMED", at + dur + 0.15, size * 0.25);
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 34 } = o;
      const s = spring(t, { start: at, stiffness: 400, damping: 20 });
      if (s <= 0) return;
      const r = size * u;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(2 - s, 2 - s);
      ctx.globalAlpha = clamp(s * 2);
      ctx.strokeStyle = "#F0F0F0";
      ctx.lineWidth = 6 * u;
      ctx.lineCap = "round";
      if (kind === "check")
        trace(ctx, [
          [-r * 0.5, 0],
          [-r * 0.12, r * 0.4],
          [r * 0.6, -r * 0.5],
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, -r * 0.5);
        ctx.lineTo(r * 0.5, r * 0.5);
        ctx.moveTo(r * 0.5, -r * 0.5);
        ctx.lineTo(-r * 0.5, r * 0.5);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      ctx.restore();
      vignette(ctx, m, 0.75);
      grain(ctx, m, t, 0.1, 2);
      // A scratch or two and a dust fleck, different every few frames.
      const f = Math.floor(t * 8);
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1 * u;
      if (hash(f * 1.3) > 0.4) {
        const sx = hash(f * 2.7) * W;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx + (hash(f) - 0.5) * 20 * u, H);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.arc(hash(f * 5.1) * W, hash(f * 6.3) * H, (1 + hash(f * 7) * 3) * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Letterbox bars.
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H * 0.025);
      ctx.fillRect(0, H * 0.975, W, H * 0.025);
    },
  };

  /** A rubber stamp slammed down: big and faint, then hard and small, tilted. */
  function stamp(cx: number, cy: number, s: string, at: number, size: number) {
    const k = spring(t, { start: at, stiffness: 500, damping: 22 });
    if (k <= 0) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.18);
    ctx.scale(2.2 - 1.2 * k, 2.2 - 1.2 * k);
    ctx.globalAlpha = clamp(k * 1.5) * 0.92;
    ctx.font = `400 ${Math.round(size * u)}px ${BOLD}`;
    const w = ctx.measureText(s).width + 24 * u;
    const h = size * 1.6 * u;
    ctx.strokeStyle = "#F2F2F2";
    ctx.lineWidth = 3 * u;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    caps(s, 0, 0, size, "#F2F2F2");
    ctx.restore();
  }
}

export default {
  id: "film-noir",
  name: "Film noir newsreel",
  category: "Light & Imaging",
  make,
} satisfies Style;
