// Bent-glass neon on an old brick wall after rain: every shape is a tube with
// a white-hot core and a coloured halo, and each one buzzes on with a
// stutter. Arrows are chase lights that run toward their target, and the
// wet pavement at the bottom shivers with the reflection.
import {
  alpha,
  clamp,
  counting,
  curve,
  ellipse,
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

const TUBE: Record<Tone, string> = {
  ink: "#4FEFFF",
  accent: "#FF3FB4",
  good: "#5CFF73",
  bad: "#FF3A3A",
  muted: "#9C8CFF",
};
const ROUND = '"Nunito", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__neonBrick ??= new Map();
  const FLOOR = 0.89;

  /** How bright a tube is: off, a stutter as it strikes, then on with a faint hum. */
  function power(at = 0, k = 0, dur = 0.35) {
    const p = progress(t, at, dur);
    if (p <= 0) return 0;
    if (p < 1) return hash(Math.floor(t * 40) + k * 13) > 0.45 ? 0.9 : 0.12;
    return 0.94 + 0.06 * Math.sin(t * 60 + k);
  }

  /** The tube behind glass, unlit: a dull line so the sign is visible before it strikes. */
  function dead(points: Pt[], width: number) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    trace(ctx, points);
    ctx.strokeStyle = "rgba(120,110,120,0.35)";
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
  }

  /** A lit tube: wide halo, saturated glass, white core. */
  function tube(points: Pt[], color: string, a: number, width = 5, close = false) {
    if (a <= 0) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = a;
    trace(ctx, points, close);
    ctx.shadowColor = color;
    ctx.shadowBlur = 26 * u;
    ctx.strokeStyle = alpha(color, 0.5);
    ctx.lineWidth = width * 2.4 * u;
    ctx.stroke();
    ctx.shadowBlur = 10 * u;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = width * 0.35 * u;
    ctx.stroke();
    ctx.restore();
  }

  /** Neon lettering, each letter striking on in turn. */
  function sign(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: string,
    at: number,
    per = 0.06,
  ) {
    if (t < at) return;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${ROUND}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const w = ctx.measureText(s).width;
    let cx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    for (const [i, ch] of [...s].entries()) {
      const cw = ctx.measureText(ch).width;
      let a = power(at + i * per, i + size, 0.25);
      // One letter in a long sign never quite settles.
      if (s.length > 6 && i === Math.floor(s.length * 0.6) && hash(Math.floor(t * 9)) > 0.8)
        a *= 0.25;
      if (a > 0) {
        ctx.globalAlpha = a;
        ctx.shadowColor = color;
        ctx.shadowBlur = 24 * u;
        ctx.fillStyle = color;
        ctx.fillText(ch, cx, y);
        ctx.shadowBlur = 6 * u;
        ctx.fillStyle = alpha("#FFFFFF", 0.65);
        ctx.fillText(ch, cx, y);
      } else {
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(110,100,110,0.3)";
        ctx.fillText(ch, cx, y);
      }
      cx += cw;
    }
    ctx.restore();
  }

  return {
    surface() {
      const key = `${W}x${H}`;
      let tile = g.__neonBrick.get(key);
      if (!tile) {
        tile = new OffscreenCanvas(W, H);
        const c = tile.getContext("2d");
        c.fillStyle = "#1A1012";
        c.fillRect(0, 0, W, H);
        const bh = 22 * u;
        const bw = 64 * u;
        for (let row = 0; row * bh < H * FLOOR; row++) {
          for (let x = row % 2 ? -bw / 2 : 0; x < W; x += bw) {
            const k = row * 131 + x;
            const v = 30 + hash(k) * 22;
            c.fillStyle = `rgb(${v + 22},${v * 0.55},${v * 0.5})`;
            c.fillRect(x + 1.5 * u, row * bh + 1.5 * u, bw - 3 * u, bh - 3 * u);
          }
        }
        // Wet pavement.
        const pv = c.createLinearGradient(0, H * FLOOR, 0, H);
        pv.addColorStop(0, "#0E0C10");
        pv.addColorStop(1, "#050406");
        c.fillStyle = pv;
        c.fillRect(0, H * FLOOR, W, H * (1 - FLOOR));
        c.fillStyle = "rgba(255,255,255,0.06)";
        c.fillRect(0, H * FLOOR, W, 2 * u);
        g.__neonBrick.set(key, tile);
      }
      ctx.drawImage(tile, 0, 0);
      // The wall is dark until signs light it; a little ambient spill.
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, W, H * FLOOR);
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 56, at = 0 } = o;
      sign(
        s,
        X(x),
        Y(y),
        size,
        TUBE.accent,
        o.align ?? "left",
        at,
        (o.dur ?? 0.9) / Math.max(1, s.length),
      );
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, tone = "ink", align = "center" } = o;
      sign(s, X(x), Y(y), size, TUBE[tone === "ink" ? "ink" : tone], align, at, 0.03);
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const R = r * u * 0.8;
      const ring = ellipse(X(x), Y(y), R, R, 40);
      if (t < at) return;
      dead(ring, 4);
      tube(ring, TUBE[tone], power(at, x * 97 + y * 13), 3.5, true);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      if (t < at) return;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const r = 14 * u;
      const pts: Pt[] = [
        ...ellipse(x0 + r, y0 + r, r, r, 6, Math.PI, 0.25),
        ...ellipse(x1 - r, y0 + r, r, r, 6, -Math.PI / 2, 0.25),
        ...ellipse(x1 - r, y1 - r, r, r, 6, 0, 0.25),
        ...ellipse(x0 + r, y1 - r, r, r, 6, Math.PI / 2, 0.25),
      ];
      // Mounting clips at the corners.
      ctx.fillStyle = "#3A3438";
      for (const [cx, cy] of [
        [x0 + r, y0],
        [x1 - r, y0],
        [x0 + r, y1],
        [x1 - r, y1],
      ] as Pt[])
        ctx.fillRect(cx - 4 * u, cy - 6 * u, 8 * u, 12 * u);
      dead(pts, 5);
      tube(pts, TUBE[tone === "good" ? "muted" : tone], power(at, 5), 4.5, true);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      if (t < at) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const color = TUBE[tone === "accent" && head ? "ink" : tone];
      if (!head) {
        tube(pts, color, power(at, x1 * 50 + y2 * 70, dur) * 0.55, 1.4);
        return;
      }
      // Chase lights: short segments ignite one after another toward the tip.
      const p = progress(t, at, dur * 1.6);
      const n = 10;
      for (let i = 0; i < n; i++) {
        const seg = pts.slice(Math.floor((i / n) * 30), Math.floor(((i + 0.7) / n) * 30) + 1);
        dead(seg, 3.5);
        const on =
          p >= 1
            ? 0.7 + 0.3 * ((Math.floor(t * 8) - i + 100) % 3 === 0 ? 1 : 0)
            : i / n < p
              ? 1
              : 0;
        tube(seg, color, on, 3.5);
      }
      if (p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 16 * u;
        tube(
          [
            [end[0] - Math.cos(a - 0.6) * s, end[1] - Math.sin(a - 0.6) * s],
            end,
            [end[0] - Math.cos(a + 0.6) * s, end[1] - Math.sin(a + 0.6) * s],
          ],
          color,
          1,
          3.5,
        );
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "muted" } = o;
      if (t < at) return;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const cx = (x0 + x1) / 2;
      const rx = (x1 - x0) / 2;
      const ry = rx * 0.3;
      const parts: Pt[][] = [
        ellipse(cx, y0 + ry, rx, ry, 30),
        [
          [x0, y0 + ry],
          [x0, y1 - ry],
        ],
        ellipse(cx, y1 - ry, rx, ry, 20, 0, 0.5),
        [
          [x1, y1 - ry],
          [x1, y0 + ry],
        ],
        ellipse(cx, (y0 + y1) / 2, rx, ry, 20, 0, 0.5),
      ];
      parts.forEach((pp, i) => {
        dead(pp, 4);
        tube(pp, TUBE[tone], power(at + (i * dur) / 6, i + 40), 3.5);
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      // Digits re-strike as they change, so the count flickers a little.
      const a = power(at, 9);
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${ROUND}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const changing = count && t < at + dur && hash(Math.floor(t * 20)) > 0.7 ? 0.7 : 1;
      ctx.globalAlpha = a * changing;
      ctx.shadowColor = TUBE[tone];
      ctx.shadowBlur = 30 * u;
      ctx.fillStyle = TUBE[tone];
      ctx.fillText(value, X(x), Y(y));
      ctx.shadowBlur = 8 * u;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(value, X(x), Y(y));
      const tw = ctx.measureText(value).width;
      ctx.restore();
      if (sub) {
        sign(sub, X(x), Y(y) - size * 0.85 * u, size * 0.36, TUBE.ink, "center", at + 0.2, 0.04);
        const ring = ellipse(X(x), Y(y), tw * 0.68, size * 0.7 * u, 48);
        if (t >= at + dur) tube(ring, TUBE.good, power(at + dur, 77), 3, true);
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 34 } = o;
      if (t < at) return;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      const color = kind === "check" ? TUBE.good : TUBE.bad;
      const a = power(at, 61);
      tube(ellipse(cx, cy, s * 0.8, s * 0.8, 36), color, a * 0.8, 2.5, true);
      if (kind === "check")
        tube(
          [
            [cx - s * 0.4, cy],
            [cx - s * 0.1, cy + s * 0.32],
            [cx + s * 0.45, cy - s * 0.38],
          ],
          color,
          a,
          3.5,
        );
      else {
        tube(
          [
            [cx - s * 0.38, cy - s * 0.38],
            [cx + s * 0.38, cy + s * 0.38],
          ],
          color,
          a,
          3.5,
        );
        tube(
          [
            [cx + s * 0.38, cy - s * 0.38],
            [cx - s * 0.38, cy + s * 0.38],
          ],
          color,
          a,
          3.5,
        );
      }
    },
    finish() {
      // The puddle: the wall above mirrored into the pavement, rippling.
      const src = ctx.canvas;
      const top = H * FLOOR;
      const band = H - top;
      const rows = 24;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < rows; i++) {
        const dy = (band / rows) * i;
        const sy = top - dy - band / rows;
        const wob = Math.sin(t * 6 + i * 0.9) * 3 * u * (i / rows);
        ctx.drawImage(src, 0, sy, W, band / rows, wob, top + dy, W, band / rows + 1);
      }
      ctx.restore();
      vignette(ctx, m, 0.55);
      void clamp;
    },
  };
}

export default {
  id: "neon-sign",
  name: "Neon sign",
  category: "Light & Imaging",
  make,
} satisfies Style;
