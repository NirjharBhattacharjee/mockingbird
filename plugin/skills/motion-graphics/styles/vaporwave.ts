// A pastel dreamscape played off a worn tape: sliced sunset sun, a glowing
// grid floor, palm silhouettes, checkerboard plinths, pop-up windows in
// lavender and cyan. Everything glitches in, slice by slice, with its colour
// channels split; a tracking band crawls down and the deck's counter runs.
import {
  alpha,
  clamp,
  counting,
  curve,
  frame,
  hash,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
} from "./look.ts";

const TONE: Record<Tone, string> = {
  ink: "#F4ECFF",
  accent: "#7DF9FF",
  good: "#9CFFCF",
  bad: "#FF5FA8",
  muted: "#C9B3FF",
};
/** Darker tones for numbers sitting on the pale windows. */
const DEEP: Record<Tone, string> = {
  ink: "#4A2A7A",
  accent: "#4A2A7A",
  good: "#1E8F6A",
  bad: "#D62E7A",
  muted: "#6A5A9A",
};
const SERIF = '"Playfair Display", serif';
const MONO = '"Courier Prime", monospace';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const HZ = H * 0.62;
  const g = globalThis as any;
  g.__vapor ??= {};
  const st = g.__vapor;

  /**
   * Draw something glitching in: for `dur` after `at` it's cut into
   * horizontal slices pushed sideways, with a cyan and pink ghost either side.
   */
  function glitch(at: number, dur: number, y0: number, y1: number, draw: () => void) {
    if (t < at) return;
    const p = progress(t, at, dur);
    if (p >= 1) return draw();
    const n = 6;
    const f = Math.floor(t * 30);
    for (let i = 0; i < n; i++) {
      if (hash(i * 3.1 + f) > 0.35 + p) continue;
      const a = y0 + ((y1 - y0) * i) / n - 4 * u;
      const b = (y1 - y0) / n + 8 * u;
      const dx = (hash(i * 7.3 + f * 1.7) - 0.5) * 60 * u * (1 - p);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, a, W, b);
      ctx.clip();
      for (const [ox, col] of [
        [-5 * u, "rgba(0,255,255,0.5)"],
        [5 * u, "rgba(255,0,170,0.5)"],
      ] as const) {
        ctx.save();
        ctx.translate(dx + ox, 0);
        ctx.globalAlpha = 0.5;
        ctx.globalCompositeOperation = "lighter";
        ctx.shadowColor = col;
        draw();
        ctx.restore();
      }
      ctx.translate(dx, 0);
      draw();
      ctx.restore();
    }
  }
  /** Text with its channels split: cyan left, pink right, white on top. */
  function split(
    s: string,
    x: number,
    y: number,
    font: string,
    color: string,
    align = "center",
    off = 3,
  ) {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,240,255,0.75)";
    ctx.fillText(s, x - off * u, y);
    ctx.fillStyle = "rgba(255,40,170,0.75)";
    ctx.fillText(s, x + off * u, y);
    ctx.shadowColor = "rgba(40,0,70,0.85)";
    ctx.shadowBlur = 5 * u;
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  function palm(c: any, x: number, base: number, hgt: number, lean: number) {
    c.strokeStyle = c.fillStyle = "#2A0F45";
    c.lineCap = "round";
    c.lineWidth = 14 * u;
    const top: Pt = [x + lean * hgt, base - hgt];
    c.beginPath();
    c.moveTo(x, base);
    c.quadraticCurveTo(x + lean * hgt * 0.2, base - hgt * 0.6, top[0], top[1]);
    c.stroke();
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI + (i / 8) * Math.PI + (hash(i + x) - 0.5) * 0.3;
      const len = hgt * (0.38 + hash(i * 2 + x) * 0.15);
      const ex = top[0] + Math.cos(a) * len;
      const ey = top[1] + Math.sin(a) * len * 0.5 + len * 0.35;
      c.lineWidth = 9 * u;
      c.beginPath();
      c.moveTo(top[0], top[1]);
      c.quadraticCurveTo(top[0] + Math.cos(a) * len * 0.5, top[1] - len * 0.25, ex, ey);
      c.stroke();
    }
  }
  function backdrop() {
    const key = `${W}x${H}`;
    if (st.key === key) return st.bg;
    const bg = new OffscreenCanvas(W, H);
    const c = bg.getContext("2d");
    const sky = c.createLinearGradient(0, 0, 0, HZ);
    sky.addColorStop(0, "#3A1A6B");
    sky.addColorStop(0.55, "#B04FB0");
    sky.addColorStop(1, "#FFA6C9");
    c.fillStyle = sky;
    c.fillRect(0, 0, W, HZ);
    const sr = H * 0.25;
    const sx = W * 0.42;
    const sy = HZ - sr * 0.45;
    const sun = c.createLinearGradient(0, sy - sr, 0, sy + sr);
    sun.addColorStop(0, "#FFE27A");
    sun.addColorStop(1, "#FF6FA8");
    c.fillStyle = sun;
    c.beginPath();
    c.arc(sx, sy, sr, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = sky;
    for (let i = 0; i < 8; i++)
      c.fillRect(sx - sr, sy + sr * (0.0 + i * 0.13), sr * 2, sr * (0.015 + i * 0.012));
    palm(c, W * 0.08, HZ + 10 * u, H * 0.55, 0.15);
    palm(c, W * 0.93, HZ + 10 * u, H * 0.62, -0.12);
    palm(c, W * 0.82, HZ + 10 * u, H * 0.4, -0.05);
    const floor = c.createLinearGradient(0, HZ, 0, H);
    floor.addColorStop(0, "#3A0F5E");
    floor.addColorStop(1, "#1A0730");
    c.fillStyle = floor;
    c.fillRect(0, HZ, W, H - HZ);
    c.strokeStyle = "rgba(240,140,255,0.8)";
    c.lineWidth = 1.5 * u;
    c.beginPath();
    for (let i = -16; i <= 16; i++) {
      c.moveTo(W / 2 + i * W * 0.025, HZ);
      c.lineTo(W / 2 + i * W * 0.14, H);
    }
    for (let k = 1; k < 12; k++) {
      const y = HZ + (H - HZ) * (k / 11) ** 2;
      c.moveTo(0, y);
      c.lineTo(W, y);
    }
    c.stroke();
    st.key = key;
    st.bg = bg;
    return bg;
  }

  return {
    surface() {
      ctx.drawImage(backdrop(), 0, 0);
      // Tape start: the deck's blue screen for a moment.
      if (t < 0.25) {
        ctx.fillStyle = "#1A3BFF";
        ctx.fillRect(0, 0, W, H * (1 - t / 0.25));
      }
    },
    title(text, o = {}) {
      const { x = 0.035, y = 0.06, size = 54, at = 0, dur = 0.5 } = o;
      const fy = Y(y) + size * u * 0.6;
      glitch(at, dur, fy - size * u, fy + size * u, () =>
        split(
          text.toUpperCase(),
          X(x),
          fy,
          `700 ${Math.round(size * u)}px ${SERIF}`,
          TONE.ink,
          o.align ?? "left",
          4,
        ),
      );
    },
    label(text, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 38, tone = "ink", align = "center" } = o;
      glitch(at, dur, Y(y) - size * u, Y(y) + size * u, () =>
        split(
          text.toUpperCase(),
          X(x),
          Y(y),
          `700 ${Math.round(size * u)}px ${MONO}`,
          TONE[tone],
          align,
          2,
        ),
      );
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.3, tone = "accent" } = o;
      const rr = r * u;
      glitch(at, dur, Y(y) - rr, Y(y) + rr, () => {
        // A marble sphere tinted by its tone.
        const gr = ctx.createRadialGradient(
          X(x) - rr * 0.4,
          Y(y) - rr * 0.4,
          rr * 0.1,
          X(x),
          Y(y),
          rr,
        );
        gr.addColorStop(0, "#FFFFFF");
        gr.addColorStop(0.55, "#E6DDF5");
        gr.addColorStop(1, TONE[tone === "ink" ? "muted" : tone]);
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(X(x), Y(y), rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = alpha("#5A2A8A", 0.5);
        ctx.lineWidth = 1.5 * u;
        ctx.stroke();
      });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.35, tone = "ink" } = o;
      glitch(at, dur, Y(y), Y(y + h), () => {
        // A pastel pop-up window.
        const bar = 20 * u;
        ctx.save();
        ctx.shadowColor = "rgba(40,0,70,0.45)";
        ctx.shadowOffsetX = 6 * u;
        ctx.shadowOffsetY = 6 * u;
        ctx.fillStyle = "#EDE4FF";
        ctx.fillRect(X(x), Y(y), X(w), Y(h));
        ctx.restore();
        const gr = ctx.createLinearGradient(X(x), 0, X(x + w), 0);
        gr.addColorStop(0, "#7DF9FF");
        gr.addColorStop(1, tone === "bad" ? "#FF5FA8" : "#FF9DE2");
        ctx.fillStyle = gr;
        ctx.fillRect(X(x), Y(y), X(w), bar);
        ctx.strokeStyle = "#5A2A8A";
        ctx.lineWidth = 2 * u;
        ctx.strokeRect(X(x), Y(y), X(w), Y(h));
        ctx.fillStyle = "#5A2A8A";
        ctx.font = `700 ${Math.round(bar * 0.8)}px ${MONO}`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText("×", X(x + w) - 6 * u, Y(y) + bar / 2);
        ctx.fillStyle = tone === "good" ? alpha("#2FBF8A", 0.18) : alpha("#B04FB0", 0.1);
        ctx.fillRect(X(x) + 2 * u, Y(y) + bar, X(w) - 4 * u, Y(h) - bar - 2 * u);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (t < at) return;
      const p = progress(t, at, dur);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      ctx.strokeStyle = head ? TONE[tone] : "rgba(255,255,255,0.55)";
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 10 * u;
      ctx.lineWidth = (head ? 3 : 1.2) * u;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const [i, [px, py]] of shown.entries()) i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      ctx.stroke();
      if (head && p >= 1) {
        const e = pts.at(-1) as Pt;
        const q = pts.at(-3) as Pt;
        const a = Math.atan2(e[1] - q[1], e[0] - q[0]);
        const s = 16 * u;
        ctx.beginPath();
        ctx.moveTo(e[0] - Math.cos(a - 0.6) * s, e[1] - Math.sin(a - 0.6) * s);
        ctx.lineTo(e[0], e[1]);
        ctx.lineTo(e[0] - Math.cos(a + 0.6) * s, e[1] - Math.sin(a + 0.6) * s);
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6 } = o;
      glitch(at, dur, Y(y), Y(y + h), () => {
        // A checkerboard plinth, seen a little from above.
        const x0 = X(x);
        const y0 = Y(y);
        const ww = X(w);
        const hh = Y(h);
        const top = ww * 0.22;
        ctx.fillStyle = "#F4ECFF";
        ctx.beginPath();
        ctx.moveTo(x0, y0 + top);
        ctx.lineTo(x0 + top, y0);
        ctx.lineTo(x0 + ww, y0);
        ctx.lineTo(x0 + ww - top, y0 + top);
        ctx.closePath();
        ctx.fill();
        const n = 5;
        const cw = (ww - top) / n;
        const rows = Math.max(3, Math.round((hh - top) / cw));
        const ch = (hh - top) / rows;
        for (let i = 0; i < n; i++)
          for (let j = 0; j < rows; j++) {
            ctx.fillStyle = (i + j) % 2 ? "#120822" : "#FFFFFF";
            ctx.fillRect(x0 + i * cw, y0 + top + j * ch, cw + 0.5, ch + 0.5);
          }
        ctx.fillStyle = "#8A6AB8";
        ctx.beginPath();
        ctx.moveTo(x0 + ww - top, y0 + top);
        ctx.lineTo(x0 + ww, y0);
        ctx.lineTo(x0 + ww, y0 + hh - top);
        ctx.lineTo(x0 + ww - top, y0 + hh);
        ctx.closePath();
        ctx.fill();
      });
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "ink" } = o;
      if (t < at) return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const yy = Y(y) - (sub ? size * u * 0.2 : 0);
      split(
        s,
        X(x),
        yy,
        `400 ${Math.round(size * u * 1.1)}px ${SERIF}`,
        tone === "accent" ? "#FFFFFF" : DEEP[tone],
        "center",
        4,
      );
      if (sub)
        split(
          sub.toUpperCase(),
          X(x),
          Y(y) + size * u * 0.62,
          `700 ${Math.round(size * u * 0.26)}px ${MONO}`,
          TONE.ink,
          "center",
          2,
        );
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.25, size = 40 } = o;
      const r = size * u * 0.6;
      glitch(at, dur, Y(y) - r, Y(y) + r, () => {
        const cx = X(x);
        const cy = Y(y);
        ctx.save();
        ctx.strokeStyle = kind === "check" ? TONE.accent : TONE.bad;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 10 * u;
        ctx.lineWidth = 5 * u;
        ctx.lineCap = "round";
        ctx.beginPath();
        if (kind === "check") {
          ctx.moveTo(cx - r, cy);
          ctx.lineTo(cx - r * 0.3, cy + r * 0.7);
          ctx.lineTo(cx + r, cy - r * 0.8);
        } else {
          ctx.moveTo(cx - r, cy - r);
          ctx.lineTo(cx + r, cy + r);
          ctx.moveTo(cx + r, cy - r);
          ctx.lineTo(cx - r, cy + r);
        }
        ctx.stroke();
        ctx.restore();
      });
    },
    finish() {
      // Tape wear: scanlines, a noisy tracking band crawling down, the deck's readout.
      ctx.fillStyle = "rgba(20,0,40,0.14)";
      for (let y = 0; y < H; y += 3 * u) ctx.fillRect(0, y, W, 1.2 * u);
      const by = ((t * 0.12) % 1.2) * H - H * 0.1;
      const f = Math.floor(t * 30);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.08 + hash(i + f) * 0.18})`;
        ctx.fillRect(
          hash(i * 3.3 + f) * W,
          by + hash(i * 1.7 + f) * H * 0.04,
          (20 + hash(i * 9 + f) * 120) * u,
          1.5 * u,
        );
      }
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(0, by, W, H * 0.04);
      const font = `700 ${Math.round(20 * u)}px ${MONO}`;
      split("PLAY ▶", W - 40 * u, 36 * u, font, "#FFFFFF", "right", 1.5);
      const secs = 52 + Math.floor(t);
      const clock = `SP 0:${String(21 + Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
      split(clock, W - 40 * u, H - 36 * u, font, "#FFFFFF", "right", 1.5);
      const k = clamp(1 - t / 0.6);
      if (k > 0) {
        ctx.fillStyle = `rgba(255,255,255,${k * 0.2})`;
        ctx.fillRect(0, 0, W, H);
      }
    },
  };
}

export default {
  id: "vaporwave",
  name: "Pastel tape dream",
  category: "Retro UI & Neon",
  make,
} satisfies Style;
