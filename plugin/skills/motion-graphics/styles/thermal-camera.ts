// Seen through a handheld infrared camera in an iron-bow palette: a soft,
// low-resolution heat field, things that warm up from violet through
// orange to white-hot, a cold blue wave for the correction, and the
// camera's own white HUD (tags, measurement boxes, spot meter, scale bar).
import {
  clamp,
  counting,
  curve,
  frame,
  grain,
  hash,
  type Look,
  leftOf,
  type Pt,
  progress,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const STOPS: [number, number, number, number][] = [
  [0, 22, 0, 60],
  [0.25, 95, 10, 150],
  [0.45, 190, 30, 120],
  [0.65, 240, 95, 30],
  [0.85, 255, 195, 35],
  [1, 255, 250, 225],
];
/** The iron-bow palette: 0 cold violet to 1 white-hot. */
function iron(v: number, a = 1) {
  const x = clamp(v);
  for (let i = 1; i < STOPS.length; i++) {
    const b = STOPS[i] as [number, number, number, number];
    const p = STOPS[i - 1] as [number, number, number, number];
    if (x <= b[0]) {
      const f = (x - p[0]) / (b[0] - p[0]);
      return `rgba(${Math.round(p[1] + (b[1] - p[1]) * f)},${Math.round(p[2] + (b[2] - p[2]) * f)},${Math.round(p[3] + (b[3] - p[3]) * f)},${a})`;
    }
  }
  return `rgba(255,250,225,${a})`;
}
const HEAT: Record<Tone, number> = { ink: 0.7, accent: 0.88, good: 0.95, bad: 0, muted: 0.45 };
const HUD = '"Inter", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__thermalField ??= new Map();

  /** How warm something has got since `at`: heats up over `dur`. */
  const warm = (at = 0, dur = 0.8) => clamp((t - at) / dur) ** 0.7;

  function hudText(
    s: string,
    x: number,
    y: number,
    size: number,
    color = "#FFFFFF",
    align = "left",
    weight = 700,
  ) {
    ctx.font = `${weight} ${Math.round(size * u)}px ${HUD}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillText(s, x + 1.5 * u, y + 1.5 * u);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  /** A soft heat blob along a path: wide dim violet, narrower hot core. */
  function heatPath(points: Pt[], heat: number, width: number, close = false) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [k, f] of [
      [2.6, 0.45],
      [1.6, 0.7],
      [0.8, 1],
    ] as [number, number][]) {
      trace(ctx, points, close);
      ctx.strokeStyle = iron(heat * f, 0.55);
      ctx.shadowColor = iron(heat * f, 0.8);
      ctx.shadowBlur = width * k * u;
      ctx.lineWidth = width * k * u;
      ctx.stroke();
    }
    ctx.restore();
  }

  function blob(cx: number, cy: number, r: number, heat: number) {
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2);
    gr.addColorStop(0, iron(heat, 1));
    gr.addColorStop(0.35, iron(heat * 0.8, 0.9));
    gr.addColorStop(0.7, iron(heat * 0.5, 0.4));
    gr.addColorStop(1, iron(heat * 0.3, 0));
    ctx.fillStyle = gr;
    ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
  }

  return {
    surface() {
      const key = `${W}x${H}`;
      let field = g.__thermalField.get(key);
      if (!field) {
        // A coarse heat field (the sensor's own resolution), scaled up soft.
        field = new OffscreenCanvas(80, 45);
        const c = field.getContext("2d");
        for (let y = 0; y < 45; y++) {
          for (let x = 0; x < 80; x++) {
            const v =
              0.22 +
              0.08 * Math.sin(x * 0.15 + y * 0.1) +
              hash(x * 7 + y * 131) * 0.06 +
              (y > 30 ? 0.04 : 0);
            c.fillStyle = iron(v);
            c.fillRect(x, y, 1, 1);
          }
        }
        g.__thermalField.set(key, field);
      }
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(field, 0, 0, W, H);
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.01, y = 0.04, size = 30, at = 0, dur = 0.9 } = o;
      if (t < at) return;
      const n = Math.ceil(s.length * clamp((t - at) / dur));
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${HUD}`;
      const w = ctx.measureText(s).width + 24 * u;
      ctx.fillStyle = "rgba(20,10,40,0.55)";
      const left = leftOf(X(x), w, o.align);
      ctx.fillRect(left, Y(y) - size * 0.8 * u, w, size * 1.6 * u);
      hudText(s.slice(0, n), left + 12 * u, Y(y), size);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 26, align = "center", tone = "ink" } = o;
      if (t < at) return;
      const n = Math.ceil(s.length * clamp((t - at) / (o.dur ?? 0.3)));
      const color = tone === "bad" ? "#7FD8FF" : tone === "good" ? "#9DFF8A" : "#FFFFFF";
      hudText(s.slice(0, n), X(x), Y(y), size, color, align);
      // A tag tick down to what it names.
      if (n >= s.length && tone !== "bad") {
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillRect(X(x) - 0.5 * u, Y(y) + size * 0.55 * u, 1 * u, 6 * u);
      }
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.8, tone = "accent" } = o;
      if (t < at) return;
      const h = HEAT[tone] * warm(at, dur);
      blob(X(x), Y(y), r * u * 0.9, Math.max(0.3, h + 0.05 * Math.sin(t * 3 + x * 20)));
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "good" } = o;
      if (t < at) return;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const heat = (tone === "bad" ? 0.2 : 0.62) * warm(at, dur);
      // A warm slab with soft edges, then the camera's box measurement on it.
      ctx.save();
      ctx.shadowColor = iron(heat, 0.9);
      ctx.shadowBlur = 30 * u;
      ctx.fillStyle = iron(heat, 0.9);
      ctx.fillRect(x0 + 6 * u, y0 + 6 * u, bw - 12 * u, bh - 12 * u);
      ctx.restore();
      if (t > at + 0.2) {
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1.5 * u;
        ctx.strokeRect(x0, y0, bw, bh);
        hudText(
          `max ${(30 + heat * 25).toFixed(1)}°`,
          x0 + 4 * u,
          y0 - 10 * u,
          12,
          "#FFFFFF",
          "left",
          500,
        );
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      if (!head) {
        heatPath(shown, 0.75 * warm(at, 0.6) + 0.15, 3);
        return;
      }
      // HUD arrows are thin white (or cold cyan for the correction).
      const color = tone === "bad" ? "#7FD8FF" : "#FFFFFF";
      if (tone === "bad") heatPath(shown, 0.12, 6);
      ctx.save();
      trace(ctx, shown);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8 * u;
      ctx.stroke();
      if (p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        trace(ctx, [
          [end[0] - Math.cos(a - 0.4) * 12 * u, end[1] - Math.sin(a - 0.4) * 12 * u],
          end,
          [end[0] - Math.cos(a + 0.4) * 12 * u, end[1] - Math.sin(a + 0.4) * 12 * u],
        ]);
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (t < at) return;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const p = warm(at, dur);
      // A rack whose shelves heat up bottom to top.
      for (let i = 0; i < 5; i++) {
        const f = clamp(p * 5 - (4 - i));
        const sy = y0 + (bh / 5) * i;
        ctx.save();
        ctx.shadowColor = iron(0.35 + 0.5 * f, 0.8);
        ctx.shadowBlur = 14 * u;
        ctx.fillStyle = iron(0.3 + 0.55 * f + 0.03 * Math.sin(t * 4 + i), 0.95);
        ctx.fillRect(x0, sy + 3 * u, bw, bh / 5 - 6 * u);
        ctx.restore();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const done = t >= at + dur;
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${HUD}`;
      const w = ctx.measureText(value).width + 24 * u;
      const hgt = size * 1.2 * u;
      if (sub) {
        // A live readout panel; it turns green when the number settles.
        ctx.fillStyle = "rgba(15,8,30,0.6)";
        ctx.fillRect(X(x) - w / 2, Y(y) - hgt / 2, w, hgt);
        if (done) {
          ctx.strokeStyle = "#7CFF6B";
          ctx.lineWidth = 2.5 * u;
          ctx.strokeRect(X(x) - w / 2, Y(y) - hgt / 2, w, hgt);
        }
        hudText(sub, X(x) - w / 2, Y(y) - hgt / 2 - 14 * u, size * 0.26, "#FFFFFF", "left", 600);
      }
      ctx.restore();
      hudText(
        value,
        X(x),
        Y(y) + size * 0.04 * u,
        size,
        sub && done ? "#7CFF6B" : "#FFFFFF",
        "center",
        800,
      );
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 30 } = o;
      if (t < at) return;
      const s = size * u * clamp((t - at) / 0.15);
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.strokeStyle = kind === "check" ? "#7CFF6B" : "#FF4040";
      ctx.lineWidth = 3 * u;
      ctx.lineCap = "round";
      if (kind === "check")
        trace(ctx, [
          [cx - s * 0.5, cy],
          [cx - s * 0.12, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5],
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.4, cy - s * 0.4);
        ctx.lineTo(cx + s * 0.4, cy + s * 0.4);
        ctx.moveTo(cx + s * 0.4, cy - s * 0.4);
        ctx.lineTo(cx - s * 0.4, cy + s * 0.4);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      grain(ctx, m, t, 0.05, 3);
      // The camera's HUD: emissivity, palette, battery, REC, scale bar, clock.
      hudText("ε 0.95   IRONBOW", W - 150 * u, 22 * u, 12, "#FFFFFF", "right", 500);
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1.2 * u;
      ctx.strokeRect(W - 132 * u, 16 * u, 22 * u, 11 * u);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(W - 130 * u, 18 * u, 14 * u, 7 * u);
      ctx.fillStyle = Math.floor(t * 2) % 2 ? "#FF3030" : "rgba(255,48,48,0.3)";
      ctx.beginPath();
      ctx.arc(W - 96 * u, 22 * u, 4 * u, 0, Math.PI * 2);
      ctx.fill();
      hudText("REC", W - 88 * u, 22 * u, 12, "#FFFFFF", "left", 600);
      const bx = W - 42 * u;
      const by0 = H * 0.12;
      const by1 = H * 0.86;
      const sg = ctx.createLinearGradient(0, by1, 0, by0);
      for (const [v] of STOPS) sg.addColorStop(v, iron(v));
      ctx.fillStyle = sg;
      ctx.fillRect(bx, by0, 10 * u, by1 - by0);
      hudText("47.0", bx + 5 * u, by0 - 12 * u, 11, "#FFFFFF", "center", 500);
      hudText("19.5", bx + 5 * u, by1 + 12 * u, 11, "#FFFFFF", "center", 500);
      const sec = String(10 + Math.floor(t)).padStart(2, "0");
      hudText(`2026-10-09  23:41:${sec}`, W - 60 * u, H - 18 * u, 11, "#FFFFFF", "right", 500);
      // The spot meter crosshair, drifting slowly.
      const sx = W * (0.5 + Math.sin(t * 0.3) * 0.08);
      const sy = H * (0.5 + Math.cos(t * 0.4) * 0.05);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1.2 * u;
      ctx.beginPath();
      ctx.moveTo(sx - 14 * u, sy);
      ctx.lineTo(sx - 5 * u, sy);
      ctx.moveTo(sx + 5 * u, sy);
      ctx.lineTo(sx + 14 * u, sy);
      ctx.moveTo(sx, sy - 14 * u);
      ctx.lineTo(sx, sy - 5 * u);
      ctx.moveTo(sx, sy + 5 * u);
      ctx.lineTo(sx, sy + 14 * u);
      ctx.stroke();
      hudText(
        `${(28 + Math.sin(t) * 2).toFixed(1)}°C`,
        sx + 16 * u,
        sy - 12 * u,
        11,
        "#FFFFFF",
        "left",
        500,
      );
    },
  };
}

export default {
  id: "thermal-camera",
  name: "Thermal camera",
  category: "Light & Imaging",
  make,
} satisfies Style;
