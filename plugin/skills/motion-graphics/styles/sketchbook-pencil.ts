// A graphite study on toothy cream paper. Each shape is laid in twice: a
// faint construction pass that overshoots its ends, then a firm contour over
// it, then hatching sweeps over the shadow side. Graphite skips on the paper
// grain; a red pencil marks the correction, and the pencil itself follows
// every stroke.
import {
  along,
  type Cue,
  counting,
  curve,
  ellipse,
  frame,
  hash,
  type Look,
  leftOf,
  type Pt,
  progress,
  roughen,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const LEAD: Record<Tone, string> = {
  ink: "#3A3936",
  accent: "#2E2D2B",
  good: "#3A3936",
  bad: "#C2362F",
  muted: "#8E8A82",
};
const HAND = '"Caveat", "Noto Color Emoji", cursive';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__pencil ??= new Map();
  const cache: Map<string, any> = g.__pencil;
  let tip: { pt: Pt; color: string } | null = null;
  let seed = 1;

  function paper() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      const gr = b.createRadialGradient(
        W * 0.5,
        H * 0.45,
        0,
        W * 0.5,
        H * 0.5,
        Math.hypot(W, H) * 0.6,
      );
      gr.addColorStop(0, "#F3EDDF");
      gr.addColorStop(1, "#E2D9C6");
      b.fillStyle = gr;
      b.fillRect(0, 0, W, H);
      for (let i = 0; i < (W * H) / 60; i++) {
        b.fillStyle = hash(i * 1.3) > 0.5 ? "rgba(255,255,255,0.18)" : "rgba(110,95,70,0.06)";
        b.fillRect(hash(i * 0.7) * W, hash(i * 1.9 + 2) * H, u, u);
      }
      b.font = `italic ${Math.round(16 * u)}px ${HAND}`;
      b.fillStyle = "rgba(90,85,78,0.6)";
      b.textAlign = "right";
      b.fillText("p. 14", W * 0.95, H * 0.06);
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  /** Graphite in one colour as a fill: the paper's grain breaks it up. */
  function lead(tone: Tone) {
    const key = `lead:${tone}`;
    let tile = cache.get(key);
    if (!tile) {
      const n = 96;
      tile = new OffscreenCanvas(n, n);
      const c = tile.getContext("2d");
      const img = c.createImageData(n, n);
      const hex = Number.parseInt(LEAD[tone].slice(1), 16);
      for (let i = 0; i < n * n; i++) {
        img.data[i * 4] = (hex >> 16) & 255;
        img.data[i * 4 + 1] = (hex >> 8) & 255;
        img.data[i * 4 + 2] = hex & 255;
        img.data[i * 4 + 3] =
          hash(i * 0.913 + 1.7) < 0.15 ? 40 : Math.round(255 * (0.6 + 0.4 * hash(i * 1.71)));
      }
      c.putImageData(img, 0, 0);
      cache.set(key, tile);
    }
    return ctx.createPattern(tile, "repeat");
  }

  /** One shape: a faint overshooting construction line, then the firm contour drawn on. */
  function pencil(
    points: Pt[],
    { at = 0, dur = 0.5, tone = "ink" as Tone, width = 2.6, build = true } = {},
  ) {
    seed += 1;
    if (t < at) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (build) {
      const c = progress(t, at, 0.25);
      const ghost = roughen(points, 2.4 * u, seed * 11.3);
      const a = ghost[0] as Pt;
      const b = ghost.at(-1) as Pt;
      const a2 = ghost[1] as Pt;
      const b2 = ghost.at(-2) as Pt;
      const over = 14 * u;
      const ext = (p: Pt, q: Pt): Pt => {
        const l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
        return [p[0] + ((p[0] - q[0]) / l) * over, p[1] + ((p[1] - q[1]) / l) * over];
      };
      const closed = Math.hypot(a[0] - b[0], a[1] - b[1]) < 4 * u;
      const path = closed ? ghost : [ext(a, a2), ...ghost, ext(b, b2)];
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = LEAD.muted;
      ctx.lineWidth = 1 * u;
      trace(ctx, along(path, c).points);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const p = progress(t, build ? at + 0.15 : at, dur);
    if (p > 0) {
      const { points: drawn } = along(roughen(points, 1 * u, seed * 5.1), p);
      ctx.strokeStyle = lead(tone);
      ctx.lineWidth = width * u;
      trace(ctx, drawn);
      ctx.stroke();
      if (p < 1) tip = { pt: drawn.at(-1) as Pt, color: LEAD[tone] };
    }
    ctx.restore();
  }

  /** Crescent hatching across the lower right of a shape, sweeping in after its contour. */
  function shade(clip: () => void, cx: number, cy: number, r: number, at: number, tone: Tone) {
    const p = progress(t, at, 0.5);
    if (p <= 0) return;
    ctx.save();
    clip();
    ctx.clip();
    ctx.strokeStyle = lead(tone);
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.3 * u;
    const step = 4 * u;
    const n = Math.ceil((r * 2) / step);
    for (let i = 0; i < n * p; i++) {
      const d = -r + i * step;
      // Only the far side: lines get shorter towards the light.
      const len = Math.max(0, (d + r * 0.2) / (r * 1.2)) * r * 1.4;
      if (len <= 0) continue;
      trace(ctx, [
        [cx + d - len * 0.3, cy + r - len],
        [cx + d + len * 0.3, cy + r + len * 0.1],
      ]);
      ctx.stroke();
    }
    ctx.restore();
  }

  function write(s: string, x: number, y: number, o: Cue & { size?: number; align?: string } = {}) {
    const { at = 0, size = 34, tone = "ink", align = "left" } = o;
    const dur = o.dur ?? 0.05 * s.length + 0.1;
    const p = progress(t, at, dur);
    if (p <= 0) return 0;
    ctx.save();
    ctx.font = `600 ${Math.round(size * u)}px ${HAND}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.beginPath();
    ctx.rect(left - 4 * u, Y(y) - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = lead(tone);
    ctx.fillText(s, left, Y(y));
    ctx.restore();
    if (p < 1) tip = { pt: [left + w * p, Y(y) + size * 0.15 * u], color: LEAD[tone] };
    return w;
  }

  return {
    surface() {
      paper();
    },
    title(s, o = {}) {
      const { x = 0.06, y = 0.12, size = 68, at = 0 } = o;
      const w = write(s, x, y, { ...o, size, at, align: o.align ?? "left" });
      if (!w) return;
      const done = at + (o.dur ?? 0.05 * s.length + 0.1);
      // Under the text where write() put it, whatever the alignment.
      const left = leftOf(X(x), w, o.align ?? "left");
      pencil(
        curve(
          [left - 10 * u, Y(y) + size * 0.75 * u],
          [left + w + 14 * u, Y(y) + size * 0.7 * u],
          -0.01,
          12,
        ),
        {
          at: done,
          dur: 0.35,
          width: 1.8,
          build: false,
        },
      );
    },
    label(s, x, y, o = {}) {
      write(s, x, y, { size: 40, align: "center", ...o });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const [cx, cy, R] = [X(x), Y(y), r * u];
      pencil(ellipse(cx, cy, R, R, 40, -Math.PI / 2, 1.04), { dur: 0.2, width: 2.2, ...o });
      shade(
        () => {
          ctx.beginPath();
          ctx.arc(cx, cy, R, 0, Math.PI * 2);
        },
        cx,
        cy,
        R,
        at + 0.25,
        tone,
      );
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      const a: Pt = [X(x), Y(y)];
      const b: Pt = [X(x + w), Y(y + h)];
      const q = dur / 4;
      pencil([a, [b[0], a[1]]], { ...o, at, dur: q });
      pencil([[b[0], a[1]], b], { ...o, at: at + q, dur: q });
      pencil([b, [a[0], b[1]]], { ...o, at: at + 2 * q, dur: q });
      pencil([[a[0], b[1]], a], { ...o, at: at + 3 * q, dur: q });
      // A soft cast shadow under its right and bottom edges.
      const s = progress(t, at + dur, 0.5);
      if (s > 0) {
        ctx.save();
        ctx.globalAlpha = 0.5 * s;
        ctx.fillStyle = lead(tone);
        ctx.fillRect(b[0], a[1] + 8 * u, 6 * u, b[1] - a[1]);
        ctx.fillRect(a[0] + 8 * u, b[1], b[0] - a[0], 6 * u);
        ctx.restore();
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true } = o;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      pencil(shaft, { ...o, at, dur, width: head ? 2 : 1.3, build: head });
      if (!head) return;
      const end = shaft.at(-1) as Pt;
      const prev = shaft.at(-3) as Pt;
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 15 * u;
      pencil(
        [
          [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
          end,
          [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s],
        ],
        { ...o, at: at + dur, dur: 0.1, width: 2, build: false },
      );
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9, tone = "ink" } = o;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.28;
      const top = Y(y) + ry;
      const bottom = Y(y + h) - ry;
      const step = dur / 4;
      pencil(ellipse(cx, top, rx, ry, 32), { ...o, at, dur: step });
      pencil(
        [
          [cx - rx, top],
          [cx - rx, bottom],
        ],
        { ...o, at: at + step, dur: step },
      );
      pencil(
        [
          [cx + rx, top],
          [cx + rx, bottom],
        ],
        { ...o, at: at + step, dur: step },
      );
      pencil(ellipse(cx, bottom, rx, ry, 24, 0, 0.5), { ...o, at: at + step * 2, dur: step });
      shade(
        () => {
          ctx.beginPath();
          ctx.rect(cx, top, rx, bottom - top + ry);
        },
        cx + rx * 0.5,
        (top + bottom) / 2,
        Math.max(rx, (bottom - top) / 2),
        at + step * 3,
        tone,
      );
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      write(value, x, y, { at, size, align: "center", dur: 0.25 });
      if (sub)
        write(sub, x, y - (size * 0.8 * u) / H, {
          at: at + 0.2,
          size: size * 0.34,
          align: "center",
        });
      if (size >= 80)
        pencil(ellipse(X(x), Y(y), size * 1.7 * u, size * 0.85 * u, 44, -Math.PI * 0.7, 1.08), {
          at: at + dur,
          dur: 0.4,
          tone: "bad",
          width: 2,
          build: false,
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 32) * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check") {
        pencil(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.1, cy + s * 0.4],
            [cx + s * 0.6, cy - s * 0.5],
          ],
          { dur: 0.25, width: 2.6, build: false, ...o },
        );
      } else {
        const at = o.at ?? 0;
        pencil(
          [
            [cx - s * 0.5, cy - s * 0.5],
            [cx + s * 0.5, cy + s * 0.5],
          ],
          { dur: 0.12, tone: "bad", build: false, ...o },
        );
        pencil(
          [
            [cx + s * 0.5, cy - s * 0.5],
            [cx - s * 0.5, cy + s * 0.5],
          ],
          { dur: 0.12, tone: "bad", build: false, ...o, at: at + 0.12 },
        );
      }
    },
    finish() {
      const tp = tip as { pt: Pt; color: string } | null;
      if (!tp) return;
      const [x, y] = tp.pt;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI * 0.25);
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 10 * u;
      ctx.shadowOffsetX = 10 * u;
      ctx.shadowOffsetY = 12 * u;
      const L = 220 * u;
      const R = 6 * u;
      ctx.fillStyle = tp.color === LEAD.bad ? "#B3332C" : "#2F5D3A";
      ctx.fillRect(26 * u, -R, L, R * 2);
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#E3C79C";
      trace(
        ctx,
        [
          [4 * u, -R * 0.25],
          [26 * u, -R],
          [26 * u, R],
          [4 * u, R * 0.25],
        ],
        true,
      );
      ctx.fill();
      ctx.fillStyle = tp.color;
      trace(
        ctx,
        [
          [0, 0],
          [5 * u, -R * 0.3],
          [5 * u, R * 0.3],
        ],
        true,
      );
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(26 * u, -R, L, R * 0.6);
      ctx.restore();
    },
  };
}

export default {
  id: "sketchbook-pencil",
  name: "Graphite sketchbook",
  category: "Hand-drawn",
  make,
} satisfies Style;
