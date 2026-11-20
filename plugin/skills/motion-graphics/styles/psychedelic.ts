// Sixties ballroom-poster psychedelia: the whole frame is liquid bands of
// full-strength ink that keep churning, fat melting italic lettering in a
// heavy outline, cream speech blobs so words stay readable, and eye-flowers
// whose petals unfurl one by one. Things ripple in rather than appear.
import {
  arrowhead,
  clamp,
  counting,
  curve,
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

const INK = "#2A0F3D";
const CREAM = "#FFF1D6";
const TONE: Record<Tone, string> = {
  ink: "#7B2CBF",
  accent: "#FF2E88",
  good: "#18B05A",
  bad: "#FF3B1F",
  muted: "#F5A623",
};
const BANDS: [number, number, number][] = [
  [255, 46, 136],
  [166, 226, 46],
  [245, 127, 32],
  [45, 63, 209],
  [123, 44, 191],
  [255, 210, 63],
];
const BULB = '"Fraunces", "Noto Color Emoji", serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const font = (size: number) => `italic 900 ${Math.round(size * u)}px ${BULB}`;
  const unfurl = (at = 0) => spring(t, { start: at, stiffness: 120, damping: 9 });
  const g = globalThis as any;

  /** The churning bands, computed small each frame and scaled up. */
  function bands() {
    const w = 320;
    const h = Math.round((320 * H) / W);
    g.__psyField ??= {};
    const f = g.__psyField;
    if (!f.canvas || f.w !== w || f.h !== h) {
      f.canvas = new OffscreenCanvas(w, h);
      f.c = f.canvas.getContext("2d");
      f.img = f.c.createImageData(w, h);
      f.w = w;
      f.h = h;
    }
    const d = f.img.data;
    const cx = w * 0.62;
    const cy = h * 0.5;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / w;
        const dy = (y - cy) / w;
        const warp =
          Math.sin(dx * 14 + t * 0.7) * 1.6 +
          Math.sin(dy * 18 - t * 0.5) * 1.6 +
          Math.sin((dx - dy) * 10 + t * 0.9) * 1.2;
        const v = Math.sqrt(dx * dx + dy * dy) * 22 + warp - t * 1.2;
        const k = ((Math.floor(v) % BANDS.length) + BANDS.length) % BANDS.length;
        const edge = v - Math.floor(v) < 0.12;
        const [r, gg, b] = BANDS[k] as [number, number, number];
        const i = (y * w + x) * 4;
        d[i] = edge ? 42 : r;
        d[i + 1] = edge ? 15 : gg;
        d[i + 2] = edge ? 61 : b;
        d[i + 3] = 255;
      }
    f.c.putImageData(f.img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(f.canvas, 0, 0, W, H);
    ctx.restore();
  }

  /** Bulbous lettering: deep shadow, thick outline, bright fill. */
  function bulb(
    s: string,
    x: number,
    y: number,
    size: number,
    fill: string,
    align = "center",
    melt = 1,
  ) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, melt);
    ctx.font = font(size);
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.fillStyle = INK;
    ctx.fillText(s, size * 0.06 * u, size * 0.08 * u);
    ctx.lineWidth = size * 0.16 * u;
    ctx.strokeStyle = INK;
    ctx.strokeText(s, 0, 0);
    ctx.lineWidth = size * 0.06 * u;
    ctx.strokeStyle = CREAM;
    ctx.strokeText(s, 0, 0);
    ctx.fillStyle = fill;
    ctx.fillText(s, 0, 0);
    ctx.restore();
  }

  /** A wobbly cream blob outlined in ink. */
  function blob(cx: number, cy: number, rx: number, ry: number, seed: number) {
    const pts: Pt[] = Array.from({ length: 49 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2;
      const wob = 1 + Math.sin(a * 5 + seed + t * 1.5) * 0.04 + Math.sin(a * 3 + seed * 2) * 0.03;
      return [cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * wob];
    });
    trace(ctx, pts, true);
    ctx.fillStyle = CREAM;
    ctx.fill();
    ctx.lineWidth = 5 * u;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function rippled(cx: number, cy: number, at: number | undefined, draw: () => void) {
    const s = unfurl(at);
    if (s <= 0) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((1 - clamp(s)) * 0.6);
    ctx.scale(s, s * (1 + Math.sin(t * 6) * 0.02 * (1 - clamp(progress(t, at ?? 0, 1.2)))));
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }

  /** An eye-flower: petals unfurling round an iris. */
  function flower(cx: number, cy: number, R: number, at: number, color: string, seed: number) {
    const n = 10;
    for (let layer = 1; layer >= 0; layer--)
      for (let i = 0; i < n; i++) {
        const p = progress(t, at + (i / n) * 0.35 + layer * 0.1, 0.35);
        if (p <= 0) continue;
        const a = (i / n) * Math.PI * 2 + layer * (Math.PI / n) + Math.sin(t + seed) * 0.05;
        const len = R * (layer ? 1.9 : 1.5) * p;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(R * 0.6 + len / 2, 0, len / 2, R * (layer ? 0.42 : 0.32), 0, 0, Math.PI * 2);
        ctx.fillStyle = layer ? (`rgb(${BANDS[(i + seed) % BANDS.length]})` as string) : color;
        ctx.fill();
        ctx.lineWidth = 2.5 * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.restore();
      }
    const e = progress(t, at + 0.3, 0.3);
    if (e <= 0) return;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = CREAM;
    ctx.fill();
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 0.5, R * 0.5 * e, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.22 * e, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
  }

  return {
    surface() {
      bands();
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.09, size = 72, at = 0, dur = 0.9, align = "left" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      // melts into place: drips long, then firms up
      const melt = 1 + (1 - p) ** 2 * 1.4 + Math.sin(t * 2) * 0.02;
      ctx.save();
      ctx.globalAlpha = clamp(p * 3);
      bulb(s, X(x), Y(y), size, "#FFB000", align, melt);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { size = 34, align = "center", tone = "ink", at = 0 } = o;
      ctx.font = font(size);
      const w = ctx.measureText(s).width + size * 1.1 * u;
      const h = size * 1.6 * u;
      const cx = align === "center" ? X(x) : align === "right" ? X(x) - w / 2 : X(x) + w / 2;
      rippled(cx, Y(y), at, () => {
        blob(cx, Y(y), w / 2, h / 2, x * 10 + y);
        ctx.font = font(size);
        ctx.fillStyle = tone === "ink" ? INK : TONE[tone];
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s, cx, Y(y) + 1 * u);
      });
    },
    node(x, y, r, o = {}) {
      const at = o.at ?? 0;
      if (t < at) return;
      flower(
        X(x),
        Y(y),
        r * u * 0.62,
        at,
        TONE[o.tone ?? "accent"],
        Math.floor(hash(x * 13 + y * 7) * 6),
      );
    },
    box(x, y, w, h, o = {}) {
      const [cx, cy] = [X(x + w / 2), Y(y + h / 2)];
      rippled(cx, cy, o.at, () => {
        ctx.save();
        ctx.translate(6 * u, 7 * u);
        blob(cx, cy, X(w) / 2, Y(h) / 2, 3);
        ctx.restore();
        ctx.save();
        blob(cx, cy, X(w) / 2, Y(h) / 2, 3);
        ctx.clip();
        // stripes of the tone across the card's foot
        ctx.strokeStyle = TONE[o.tone ?? "ink"];
        ctx.lineWidth = 5 * u;
        for (let k = -10; k < 20; k++) {
          ctx.beginPath();
          ctx.moveTo(X(x) + k * 16 * u, Y(y + h));
          ctx.lineTo(X(x) + k * 16 * u + 40 * u, Y(y + h) - 40 * u);
          ctx.stroke();
        }
        ctx.restore();
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30).map(
        ([px, py], i) => [px, py + Math.sin(i * 0.6 + t * 3) * 2 * u] as Pt,
      );
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      trace(ctx, shown);
      ctx.strokeStyle = INK;
      ctx.lineWidth = (head ? 16 : 6) * u;
      ctx.stroke();
      trace(ctx, shown);
      ctx.strokeStyle = TONE[tone];
      ctx.lineWidth = (head ? 10 : 3) * u;
      ctx.stroke();
      if (head) {
        trace(ctx, shown);
        ctx.setLineDash([8 * u, 8 * u]);
        ctx.lineDashOffset = -t * 40 * u;
        ctx.strokeStyle = CREAM;
        ctx.lineWidth = 2.5 * u;
        ctx.stroke();
        ctx.setLineDash([]);
        if (p >= 1) {
          const end = pts.at(-1) as Pt;
          const prev = pts.at(-3) as Pt;
          arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 26 * u, false);
          ctx.fillStyle = TONE[tone];
          ctx.fill();
          ctx.lineWidth = 4 * u;
          ctx.strokeStyle = INK;
          ctx.stroke();
        }
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      // a jar of swirling stripes
      const [bx, by, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      rippled(bx + bw / 2, by + bh / 2, o.at, () => {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, bw * 0.3);
        ctx.fillStyle = CREAM;
        ctx.fill();
        ctx.clip();
        for (let k = 0; k < 8; k++) {
          ctx.beginPath();
          for (let i = 0; i <= 20; i++) {
            const px = bx + (i / 20) * bw;
            const py = by + (k / 7) * bh + Math.sin(i * 0.6 + t * 2 + k) * 6 * u;
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          }
          ctx.strokeStyle = `rgb(${BANDS[k % BANDS.length]})`;
          ctx.lineWidth = bh / 9;
          ctx.stroke();
        }
        ctx.restore();
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, bw * 0.3);
        ctx.lineWidth = 5 * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "accent" } = o;
      const str = count ? counting(t, at, dur, count) + s : s;
      const [cx, cy] = [X(x), Y(y)];
      if (sub && t >= at) {
        // a sunburst flower behind the big number
        flower(cx, cy, size * 0.95 * u, at, TONE.muted, 2);
      }
      rippled(cx, cy, at, () => {
        if (sub) blob(cx, cy, size * 1.25 * u, size * 0.85 * u, 5);
        bulb(str, cx, cy - (sub ? size * 0.12 * u : 0), size * (sub ? 0.85 : 1), TONE[tone]);
        if (sub) {
          ctx.font = font(size * 0.28);
          ctx.fillStyle = INK;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(sub, cx, cy + size * 0.5 * u);
        }
      });
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 32) * u;
      rippled(X(x), Y(y), o.at, () => {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const [cx, cy] = [X(x), Y(y)];
        const path = () => {
          if (kind === "check")
            trace(ctx, [
              [cx - r * 0.6, cy],
              [cx - r * 0.15, cy + r * 0.5],
              [cx + r * 0.7, cy - r * 0.6],
            ]);
          else {
            ctx.beginPath();
            ctx.moveTo(cx - r * 0.55, cy - r * 0.55);
            ctx.lineTo(cx + r * 0.55, cy + r * 0.55);
            ctx.moveTo(cx + r * 0.55, cy - r * 0.55);
            ctx.lineTo(cx - r * 0.55, cy + r * 0.55);
          }
        };
        path();
        ctx.strokeStyle = INK;
        ctx.lineWidth = r * 0.55;
        ctx.stroke();
        path();
        ctx.strokeStyle = kind === "check" ? TONE.good : TONE.bad;
        ctx.lineWidth = r * 0.3;
        ctx.stroke();
        ctx.restore();
      });
    },
    finish() {},
  };
}

export default {
  id: "psychedelic",
  name: "Psychedelic poster",
  category: "Cosmic & Psychedelic",
  make,
} satisfies Style;
