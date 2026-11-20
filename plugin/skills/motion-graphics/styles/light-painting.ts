// A long-exposure light painting in a dark field: every line is a glowing
// trail left by a moving LED wand, shaky like a hand drew it in the air,
// with a white-hot core and a spark at the tip. Numbers come from a pixel
// stick of amber LEDs. Stars overhead, town bokeh on the horizon.
import {
  along,
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
  roughen,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const LIGHT: Record<Tone, string> = {
  ink: "#5FF0FF",
  accent: "#FF5FE6",
  good: "#FFD24A",
  bad: "#FF4A5C",
  muted: "#8F8CFF",
};
const HAND = '"Caveat", "Noto Color Emoji", cursive';
// A 5x7 LED font: each row a 5-bit mask, top to bottom.
const LED: Record<string, number[]> = {
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  "%": [24, 25, 2, 4, 8, 19, 3],
  ",": [0, 0, 0, 0, 6, 2, 4],
};

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const tips: { x: number; y: number; color: string }[] = [];
  let seed = 7;

  /** A light trail following points up to `p`, hand-jittered, glowing. */
  function trail(points: Pt[], at: number, dur: number, color: string, width = 3.5, close = false) {
    seed++;
    const p = progress(t, at, dur);
    if (p <= 0) return 0;
    const shaky = roughen(points, 1.6 * u, seed * 5.1);
    const { points: drawn } = along(close ? [...shaky, shaky[0] as Pt] : shaky, p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "lighter";
    trace(ctx, drawn);
    ctx.shadowColor = color;
    ctx.shadowBlur = 18 * u;
    ctx.strokeStyle = alpha(color, 0.55);
    ctx.lineWidth = width * 2.2 * u;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = width * 0.35 * u;
    ctx.stroke();
    ctx.restore();
    if (p < 1) {
      const e = drawn.at(-1) as Pt;
      tips.push({ x: e[0], y: e[1], color });
    }
    return p;
  }

  /** Script written in light, revealed left to right with the wand at its end. */
  function script(
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
    ctx.font = `700 ${Math.round(size * u)}px ${HAND}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 6 * u, y - size * u, (w + 12 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.textAlign = "left";
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = color;
    ctx.shadowBlur = 16 * u;
    ctx.fillStyle = color;
    ctx.fillText(s, left, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(s, left, y);
    ctx.restore();
    if (p < 1) tips.push({ x: left + w * p, y: y + Math.sin(t * 40) * size * 0.2 * u, color });
  }

  return {
    surface() {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#03040C");
      sky.addColorStop(0.75, "#0B1028");
      sky.addColorStop(1, "#05060A");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      // Stars, each a short arc: the exposure is long.
      ctx.save();
      for (let i = 0; i < 160; i++) {
        const x = hash(i * 1.3) * W;
        const y = hash(i * 2.9) * H * 0.75;
        const b = 0.3 + hash(i * 4.1) * 0.7;
        ctx.strokeStyle = `rgba(220,230,255,${b * 0.8})`;
        ctx.lineWidth = (0.6 + b) * u;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 2 * u + t * 0.3 * u, y - 0.6 * u);
        ctx.stroke();
      }
      // The horizon: dark hills, then blurred town lights.
      const hz = H * 0.8;
      ctx.fillStyle = "#020205";
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 40 * u)
        ctx.lineTo(x, hz - (hash(x * 0.37) * 14 + Math.sin((x / W) * 6) * 10) * u);
      ctx.lineTo(W, H);
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 26; i++) {
        const x = hash(i * 7.7) * W;
        const y = hz - 6 * u + hash(i * 3.3) * 10 * u;
        const r = (5 + hash(i * 5.5) * 9) * u;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const warm = hash(i) > 0.4;
        g.addColorStop(0, warm ? "rgba(255,200,140,0.35)" : "rgba(150,190,255,0.3)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 56, at = 0, dur = 0.9 } = o;
      script(s, X(x), Y(y), size, LIGHT.ink, o.align ?? "left", at, dur);
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${HAND}`;
      const w = ctx.measureText(s).width;
      ctx.restore();
      const lx = (o.align ?? "left") === "left" ? X(x) : X(x) - w / 2;
      trail(
        curve([lx, Y(y) + size * 0.65 * u], [lx + w, Y(y) + size * 0.6 * u], -0.04, 16),
        at + dur,
        0.35,
        LIGHT.good,
        2.5,
      );
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, tone = "ink", align = "center" } = o;
      script(s, X(x), Y(y), size, LIGHT[tone], align, at, o.dur ?? 0.04 * s.length + 0.15);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.2, tone = "accent" } = o;
      const R = r * u * 0.8;
      trail(ellipse(X(x), Y(y), R, R, 30), at, dur, LIGHT[tone], 3);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.5, tone = "good" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      trail(
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
          [x0, y0 - 2 * u],
        ],
        at,
        dur,
        LIGHT[tone],
        3,
      );
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const color = head ? LIGHT[tone === "accent" ? "ink" : tone] : LIGHT[tone];
      const p = trail(pts, at, dur, color, head ? 3 : 1.2);
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 16 * u;
        trail(
          [
            [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
            end,
            [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s],
          ],
          at + dur,
          0.12,
          color,
          3,
        );
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      // A twisting RGB light-tube ribbon swept round a column.
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const cx = (x0 + x1) / 2;
      const rx = (x1 - x0) / 2;
      const turns = 3;
      const n = 90;
      const pts: Pt[] = Array.from({ length: n + 1 }, (_, i) => {
        const f = i / n;
        return [cx + Math.sin(f * turns * Math.PI * 2) * rx, y0 + f * (y1 - y0)];
      });
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (let i = 1; i < shown.length; i++) {
        const a = shown[i - 1] as Pt;
        const b = shown[i] as Pt;
        const hue = (i * 6 + t * 40) % 360;
        const front = Math.cos((i / n) * turns * Math.PI * 2) > 0;
        ctx.strokeStyle = `hsla(${hue},100%,${front ? 65 : 45}%,${front ? 0.9 : 0.4})`;
        ctx.lineWidth = (front ? 7 : 4) * u;
        ctx.shadowColor = `hsl(${hue},100%,60%)`;
        ctx.shadowBlur = 12 * u;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      ctx.restore();
      if (p < 1) {
        const e = shown.at(-1) as Pt;
        tips.push({ x: e[0], y: e[1], color: "#FFFFFF" });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      // The pixel stick: columns of amber LEDs light as it sweeps across.
      const dot = size * 0.13 * u;
      const cw = dot * 6;
      // Every character keeps its place: those without an LED glyph (a unit, a
      // minus sign) are written in amber rather than dropped.
      const chars = value.split("");
      const total = chars.length * cw;
      const left = X(x) - total / 2;
      const top = Y(y) - dot * 3.5;
      const sweep = clamp((t - at) / 0.4);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "#FFC23A";
      ctx.shadowColor = "#FF9A1A";
      ctx.shadowBlur = 8 * u;
      chars.forEach((c, i) => {
        const rows = LED[c];
        if (!rows) {
          if (c.trim() && (i * cw) / total <= sweep) {
            ctx.font = `700 ${Math.round(dot * 7)}px ${HAND}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(c, left + i * cw + dot * 2.5, top + dot * 3.5);
          }
          return;
        }
        for (let r = 0; r < 7; r++) {
          for (let k = 0; k < 5; k++) {
            if (!((rows[r] as number) & (1 << (4 - k)))) continue;
            const px = left + i * cw + k * dot;
            if ((px - left) / total > sweep) continue;
            ctx.beginPath();
            ctx.arc(px + dot / 2, top + r * dot + dot / 2, dot * 0.38, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
      ctx.restore();
      if (sub)
        script(sub, X(x), top - size * 0.35 * u, size * 0.4, LIGHT.ink, "center", at + 0.2, 0.45);
      if (sub) {
        // A ring traced round it and a burst of sparks.
        const ring = ellipse(X(x), Y(y), total * 0.7, size * 0.75 * u, 40, -Math.PI * 0.6, 1.05);
        const p = trail(ring, at + dur + 0.1, 0.5, LIGHT.accent, 2.5);
        if (p >= 1) {
          const b = clamp((t - (at + dur + 0.6)) / 0.6);
          if (b > 0 && b < 1) {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            for (let i = 0; i < 18; i++) {
              const a = (i / 18) * Math.PI * 2;
              const d = total * 0.7 + b * 50 * u;
              ctx.fillStyle = `rgba(255,220,150,${1 - b})`;
              ctx.beginPath();
              ctx.arc(X(x) + Math.cos(a) * d, Y(y) + Math.sin(a) * d * 0.6, 2 * u, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 34 } = o;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check")
        trail(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.12, cy + s * 0.4],
            [cx + s * 0.6, cy - s * 0.5],
          ],
          at,
          dur,
          LIGHT.good,
          3.5,
        );
      else {
        trail(
          [
            [cx - s * 0.45, cy - s * 0.45],
            [cx + s * 0.45, cy + s * 0.45],
          ],
          at,
          dur / 2,
          LIGHT.bad,
          3.5,
        );
        trail(
          [
            [cx + s * 0.45, cy - s * 0.45],
            [cx - s * 0.45, cy + s * 0.45],
          ],
          at + dur / 2,
          dur / 2,
          LIGHT.bad,
          3.5,
        );
      }
    },
    finish() {
      // The wand tips: bright sparks wherever a line is still being drawn.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const { x, y, color } of tips) {
        const r = 22 * u;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.2, alpha(color, 0.9));
        g.addColorStop(1, alpha(color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    },
  };
}

export default {
  id: "light-painting",
  name: "Light painting",
  category: "Light & Imaging",
  make,
} satisfies Style;
