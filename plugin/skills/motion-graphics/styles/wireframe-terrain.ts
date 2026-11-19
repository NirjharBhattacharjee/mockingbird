// Vector-display 3D: a perspective wire-mesh landscape with hidden lines
// removed, a wireframe moon, phosphor cyan on deep navy with a soft bloom,
// and HUD panels whose corner brackets snap on. Labels type out behind a
// block cursor; shapes trace themselves.
import {
  along,
  alpha,
  arrowhead,
  clamp,
  counting,
  curve,
  ellipse,
  expo,
  frame,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const NIGHT = "#070B24";
const TONE: Record<Tone, string> = {
  ink: "#8FE9FF",
  accent: "#FFC247",
  good: "#5CF29A",
  bad: "#FF5470",
  muted: "#4F6A9A",
};
const MONO = '"JetBrains Mono", monospace';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);

  /** Glowing stroke of the current path. */
  function glow(color: string, width: number, blur = 8) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * u;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
  }

  /** Mono text typed on behind a block cursor. */
  function typed(
    s: string,
    x: number,
    y: number,
    size: number,
    o: { at?: number; tone?: Tone; align?: string; weight?: number } = {},
  ) {
    const { at = 0, tone = "ink", align = "left", weight = 600 } = o;
    const n = Math.floor((t - at) / 0.03);
    if (n <= 0) return 0;
    ctx.save();
    ctx.font = `${weight} ${Math.round(size * u)}px ${MONO}`;
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    const shown = s.slice(0, n);
    ctx.fillStyle = tone === "ink" ? "#E8FBFF" : TONE[tone];
    ctx.shadowColor = TONE[tone];
    ctx.shadowBlur = 8 * u;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(shown, left, y);
    if (n <= s.length + 6 && Math.floor(t * 4) % 2 === 0) {
      ctx.fillRect(
        left + ctx.measureText(shown).width + 2 * u,
        y - size * 0.45 * u,
        size * 0.5 * u,
        size * 0.9 * u,
      );
    }
    ctx.restore();
    return w;
  }

  /** HUD corner brackets round a rectangle, snapping in from outside. */
  function brackets(x: number, y: number, w: number, h: number, p: number, color: string) {
    const o = (1 - expo(p)) * 20 * u;
    const l = Math.min(w, h) * 0.18;
    ctx.beginPath();
    for (const [cx, cy, dx, dy] of [
      [x - o, y - o, 1, 1],
      [x + w + o, y - o, -1, 1],
      [x - o, y + h + o, 1, -1],
      [x + w + o, y + h + o, -1, -1],
    ] as number[][]) {
      ctx.moveTo((cx as number) + (dx as number) * l, cy as number);
      ctx.lineTo(cx as number, cy as number);
      ctx.lineTo(cx as number, (cy as number) + (dy as number) * l);
    }
    glow(color, 2, 6);
  }

  /** A wire sphere: rings of latitude and longitude, traced on to `p`. */
  function sphere(cx: number, cy: number, r: number, p: number, color: string, spin = 0) {
    for (let i = 1; i < 6; i++) {
      const lat = (i / 6) * Math.PI - Math.PI / 2;
      trace(
        ctx,
        along(
          ellipse(cx, cy + Math.sin(lat) * r, Math.cos(lat) * r, Math.cos(lat) * r * 0.18, 32),
          p,
        ).points,
      );
      glow(color, 1, 5);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI + spin;
      trace(ctx, along(ellipse(cx, cy, Math.abs(Math.cos(a)) * r, r, 32), p).points);
      glow(color, 1, 5);
    }
    trace(ctx, along(ellipse(cx, cy, r, r, 48), p).points);
    glow(color, 1.5, 10);
  }

  return {
    surface() {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#050820");
      sky.addColorStop(0.45, "#0E1A4A");
      sky.addColorStop(1, NIGHT);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      // The moon, drawn behind the mesh.
      ctx.save();
      ctx.globalAlpha = 0.7;
      sphere(W * 0.86, H * 0.16, H * 0.09, progress(t, 0, 1.2), "#4FC9F0", t * 0.2);
      ctx.restore();
      // The mesh: back rows first, each quad filled with night then stroked,
      // so nearer ridges hide what's behind them. Rows scan in front to back.
      const cols = 64;
      const rows = 30;
      const horizon = H * 0.42;
      const glide = t * 0.25;
      const height = (x: number, z: number) =>
        Math.sin(x * 2.1 + (z + glide) * 0.9) * 0.35 +
        Math.cos(x * 0.8 - (z + glide) * 1.7) * 0.25 +
        Math.sin((z + glide) * 2.6 + x * 3.3) * 0.08;
      const proj = (x: number, z: number): Pt => {
        const y = height(x, z);
        return [W / 2 + (x / z) * W * 0.55, horizon + ((1.1 - y) / z) * H * 0.72];
      };
      const zAt = (j: number) => 1.7 + (j / rows) ** 1.25 * 10;
      const xAt = (i: number) => (i / cols - 0.5) * 12;
      const scan = clamp(t / 1.4);
      ctx.save();
      ctx.lineWidth = 1 * u;
      for (let j = rows - 1; j >= 0; j--) {
        if (j / rows > scan) continue;
        const front = Math.abs(j / rows - scan) < 0.06 && scan < 1;
        const fade = 0.35 + 0.65 * (1 - j / rows);
        ctx.strokeStyle = front ? "#E8FBFF" : alpha("#5FD3FF", fade);
        for (let i = 0; i < cols; i++) {
          const q = [
            proj(xAt(i), zAt(j)),
            proj(xAt(i + 1), zAt(j)),
            proj(xAt(i + 1), zAt(j + 1)),
            proj(xAt(i), zAt(j + 1)),
          ];
          trace(ctx, q, true);
          ctx.fillStyle = NIGHT;
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
      // A soft bloom along the horizon.
      const bloom = ctx.createLinearGradient(0, horizon - H * 0.05, 0, horizon + H * 0.1);
      bloom.addColorStop(0, "rgba(80,200,255,0)");
      bloom.addColorStop(0.5, "rgba(80,200,255,0.12)");
      bloom.addColorStop(1, "rgba(80,200,255,0)");
      ctx.fillStyle = bloom;
      ctx.fillRect(0, horizon - H * 0.05, W, H * 0.15);
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 32, at = 0, align = "left" } = o;
      const w = typed(s.toUpperCase(), X(x), Y(y), size, { at, align, weight: 700 });
      if (!w) return;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      const p = progress(t, at + s.length * 0.03, 0.4);
      ctx.beginPath();
      ctx.moveTo(left, Y(y) + size * 0.75 * u);
      ctx.lineTo(left + w * expo(p), Y(y) + size * 0.75 * u);
      glow(TONE.ink, 1.5);
    },
    label(s, x, y, o = {}) {
      const { at = 0, tone = "ink", align = "center" } = o;
      if (t < at) return;
      const size = o.size ?? 28;
      ctx.save();
      ctx.font = `600 ${Math.round(size * u)}px ${MONO}`;
      const w = ctx.measureText(s.toUpperCase()).width + size * u;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      const h = size * 1.5 * u;
      const p = progress(t, at, 0.2);
      ctx.fillStyle = "rgba(7,11,36,0.85)";
      ctx.fillRect(left, Y(y) - h / 2, w * expo(p), h);
      ctx.beginPath();
      ctx.rect(left, Y(y) - h / 2, w * expo(p), h);
      glow(tone === "ink" ? TONE.ink : TONE[tone], 1.2, 4);
      ctx.restore();
      typed(s.toUpperCase(), left + size * 0.5 * u, Y(y), size, { at: at + 0.1, tone });
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.arc(X(x), Y(y), r * u, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(7,11,36,0.9)";
      ctx.fill();
      sphere(X(x), Y(y), r * u, expo(p), TONE[tone === "accent" ? "ink" : tone], t * 0.8 + x * 10);
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.4, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const col = TONE[tone];
      ctx.save();
      ctx.globalAlpha = expo(p);
      ctx.fillStyle = "rgba(7,11,36,0.9)";
      ctx.fillRect(x0, y0, bw, bh);
      ctx.strokeStyle = alpha(col, 0.5);
      ctx.lineWidth = 1 * u;
      ctx.strokeRect(x0, y0, bw, bh);
      // A meter along the foot.
      ctx.fillStyle = alpha(col, 0.8);
      ctx.fillRect(
        x0 + 10 * u,
        y0 + bh - 14 * u,
        (bw - 20 * u) * progress(t, at + 0.3, 0.8),
        4 * u,
      );
      ctx.restore();
      brackets(x0, y0, bw, bh, p, col);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 36);
      const { points, angle } = along(pts, expo(p));
      const col = TONE[tone === "accent" && !head ? "ink" : tone];
      ctx.save();
      if (tone === "bad") ctx.setLineDash([8 * u, 6 * u]);
      ctx.globalAlpha = head ? 1 : 0.5;
      trace(ctx, points);
      glow(col, head ? 2 : 1, head ? 10 : 4);
      ctx.setLineDash([]);
      if (p < 1) {
        const [hx, hy] = points.at(-1) as Pt;
        ctx.fillStyle = "#FFFFFF";
        ctx.shadowColor = col;
        ctx.shadowBlur = 14 * u;
        ctx.beginPath();
        ctx.arc(hx, hy, 3 * u, 0, Math.PI * 2);
        ctx.fill();
      } else if (head) {
        arrowhead(ctx, pts.at(-1) as Pt, angle, 12 * u);
        glow(col, 2);
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      // A wire cylinder of stacked rings.
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.28;
      const top = Y(y) + ry;
      const bottom = Y(y + h) - ry;
      ctx.save();
      ctx.fillStyle = "rgba(7,11,36,0.9)";
      ctx.fillRect(cx - rx, top, rx * 2, bottom - top);
      for (let i = 0; i <= 5; i++) {
        const q = clamp(p * 6 - i);
        if (q <= 0) continue;
        trace(ctx, along(ellipse(cx, bottom - ((bottom - top) * i) / 5, rx, ry, 36), q).points);
        glow(i === 5 ? "#E8FBFF" : TONE.ink, i === 5 ? 1.8 : 1.1);
      }
      for (const s of [-1, 1]) {
        trace(ctx, [
          [cx + s * rx, bottom],
          [cx + s * rx, bottom - (bottom - top) * p],
        ]);
        glow(TONE.ink, 1.2);
      }
      ctx.restore();
      brackets(X(x) - 8 * u, Y(y) - 8 * u, X(w) + 16 * u, Y(h) + 16 * u, p, alpha(TONE.ink, 0.6));
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const col = tone === "ink" ? "#E8FBFF" : tone === "accent" ? TONE.good : TONE[tone];
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${MONO}`;
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 16 * u;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = Math.floor(t * 30) % 3 === 0 && t < at + 0.25 ? 0.4 : 1;
      ctx.fillText(value, X(x), Y(y));
      ctx.restore();
      if (sub)
        typed(sub.toUpperCase(), X(x), Y(y) - size * 0.75 * u, size * 0.22, {
          at,
          align: "center",
          tone: "ink",
          weight: 500,
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 24) * u;
      const p = progress(t, o.at ?? 0, 0.25);
      if (p <= 0) return;
      const [cx, cy] = [X(x), Y(y)];
      const path: Pt[] =
        kind === "check"
          ? [
              [cx - s * 0.5, cy],
              [cx - s * 0.15, cy + s * 0.4],
              [cx + s * 0.55, cy - s * 0.45],
            ]
          : [
              [cx - s * 0.45, cy - s * 0.45],
              [cx + s * 0.45, cy + s * 0.45],
              [cx, cy],
              [cx + s * 0.45, cy - s * 0.45],
              [cx - s * 0.45, cy + s * 0.45],
            ];
      trace(ctx, along(path, p).points);
      ctx.lineCap = "round";
      glow(kind === "check" ? TONE.good : TONE.bad, 3, 10);
    },
    finish() {
      // Frame corners of the HUD and faint scanlines.
      const c = 26 * u;
      const e = 14 * u;
      ctx.beginPath();
      for (const [x, y, dx, dy] of [
        [e, e, 1, 1],
        [W - e, e, -1, 1],
        [e, H - e, 1, -1],
        [W - e, H - e, -1, -1],
      ] as number[][]) {
        ctx.moveTo((x as number) + (dx as number) * c, y as number);
        ctx.lineTo(x as number, y as number);
        ctx.lineTo(x as number, (y as number) + (dy as number) * c);
      }
      ctx.strokeStyle = alpha(TONE.ink, 0.5);
      ctx.lineWidth = 1.5 * u;
      ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (let y = 0; y < H; y += 4 * u) ctx.fillRect(0, y, W, 1.2 * u);
    },
  };
}

export default {
  id: "wireframe-terrain",
  name: "Wireframe terrain",
  category: "Dimensional",
  make,
} satisfies Style;
