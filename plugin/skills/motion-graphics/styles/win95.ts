// A mid-90s beige-box desktop at double pixels: teal wallpaper, one big grey
// window with a navy title bar, two-pixel bevels raised and sunken, group
// boxes, radio-button nodes, dotted pixel arrows, and windows that open
// behind a burst of outline rectangles. A pointer follows the action.
import {
  counting,
  curve,
  frame,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
} from "./look.ts";

const FACE = "#C0C0C0";
const HI = "#FFFFFF";
const SH = "#808080";
const DK = "#000000";
const NAVY = "#000080";
const TONE: Record<Tone, string> = {
  ink: "#000000",
  accent: NAVY,
  good: "#008000",
  bad: "#C00000",
  muted: "#808080",
};
const FONT = '"Inter", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const full = frame(m);
  const h = 360;
  const w = Math.round((full.W / full.H) * h);
  const g = globalThis as any;
  g.__w95 ??= {};
  const st = g.__w95;
  if (!st.buf || st.buf.width !== w) st.buf = new OffscreenCanvas(w, h);
  const c = st.buf.getContext("2d");
  const { u, X, Y } = frame({ width: w, height: h });
  const R = Math.round;
  let pointer: Pt | null = null;
  let pointerAt = -1;
  const arrived = (at: number, x: number, y: number) => {
    if (t >= at && at >= pointerAt) {
      pointerAt = at;
      pointer = [x, y];
    }
  };
  const px = (size: number) => Math.max(10, R(size * u));
  function write(
    s: string,
    x: number,
    y: number,
    size: number,
    color = DK,
    align = "left",
    bold = false,
  ) {
    c.font = `${bold ? "bold " : ""}${px(size)}px ${FONT}`;
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = "middle";
    c.fillText(s, R(x), R(y));
  }
  /** A two-pixel bevel: raised (light top-left) or sunken (dark top-left). */
  function bevel(x: number, y: number, ww: number, hh: number, raised: boolean, fill = FACE) {
    x = R(x);
    y = R(y);
    ww = R(ww);
    hh = R(hh);
    const [a, b, a2, b2] = raised ? [HI, DK, FACE, SH] : [SH, HI, DK, FACE];
    c.fillStyle = b;
    c.fillRect(x, y, ww, hh);
    c.fillStyle = a;
    c.fillRect(x, y, ww - 1, hh - 1);
    c.fillStyle = b2;
    c.fillRect(x + 1, y + 1, ww - 2, hh - 2);
    c.fillStyle = a2;
    c.fillRect(x + 1, y + 1, ww - 3, hh - 3);
    c.fillStyle = fill;
    c.fillRect(x + 2, y + 2, ww - 4, hh - 4);
  }
  /** Outline rectangles growing from a point out to the target, as a window opens. */
  function zoom(p: number, x: number, y: number, ww: number, hh: number) {
    c.strokeStyle = HI;
    c.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const f = Math.min(1, p + k * 0.12);
      c.strokeRect(
        R(x + (ww * (1 - f)) / 2) + 0.5,
        R(y + (hh * (1 - f)) / 2) + 0.5,
        R(ww * f),
        R(hh * f),
      );
    }
  }
  /** A dotted pixel line along points, revealed to fraction p. */
  function dotted(pts: Pt[], p: number, color: string) {
    c.fillStyle = color;
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1] as Pt;
      const b = pts[i] as Pt;
      total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    let left = total * p;
    let carry = 0;
    for (let i = 1; i < pts.length && left > 0; i++) {
      const a = pts[i - 1] as Pt;
      const b = pts[i] as Pt;
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let d = carry;
      for (; d < Math.min(l, left); d += 2) {
        c.fillRect(R(a[0] + ((b[0] - a[0]) * d) / l), R(a[1] + ((b[1] - a[1]) * d) / l), 1, 1);
      }
      // How far into the next segment the next dot falls, even when no dot fit in
      // this one: a run of segments shorter than the gap would otherwise stop the line.
      carry = d - l;
      left -= l;
    }
  }
  const win = { x: 6, y: 6, w: w - 12, h: h - 12 };

  return {
    surface() {
      c.imageSmoothingEnabled = false;
      c.fillStyle = "#008080";
      c.fillRect(0, 0, w, h);
      const p = progress(t, 0, 0.3);
      if (p < 1) return zoom(p, win.x, win.y, win.w, win.h);
      bevel(win.x, win.y, win.w, win.h, true);
      c.fillStyle = NAVY;
      c.fillRect(win.x + 3, win.y + 3, win.w - 6, 18);
      bevel(win.x + win.w - 22, win.y + 5, 16, 14, true);
      write("×", win.x + win.w - 14, win.y + 11.5, 0, DK, "center", true);
      bevel(win.x + 4, win.y + 23, win.w - 8, win.h - 46, false, FACE);
      // Status bar.
      bevel(win.x + 4, win.y + win.h - 21, win.w * 0.6, 17, false);
      bevel(win.x + 8 + win.w * 0.6, win.y + win.h - 21, win.w * 0.4 - 12, 17, false);
      write("Ready", win.x + 10, win.y + win.h - 12.5, 0);
    },
    title(text, o = {}) {
      const { at = 0, dur = 0.5 } = o;
      if (t < at) return;
      const n = Math.ceil(text.length * progress(t, at, dur));
      write(text.slice(0, n), win.x + 8, win.y + 12, 0, HI, "left", true);
    },
    label(text, x, y, o = {}) {
      const { at = 0, size = 38, tone = "ink", align = "center" } = o;
      if (t < at) return;
      arrived(at, X(x) + 10, Y(y));
      write(text, X(x), Y(y), size, TONE[tone], align, tone !== "ink" && tone !== "muted");
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      if (t < at) return;
      arrived(at, X(x), Y(y));
      // A radio button: sunken white circle, its dot filled once selected.
      const rr = Math.max(4, R(r * u * 1.1));
      const cx = R(X(x));
      const cy = R(Y(y));
      const arc = (rad: number, a0: number, a1: number, col: string) => {
        c.strokeStyle = col;
        c.lineWidth = 1;
        c.beginPath();
        c.arc(cx, cy, rad, a0, a1);
        c.stroke();
      };
      c.fillStyle = HI;
      c.beginPath();
      c.arc(cx, cy, rr, 0, Math.PI * 2);
      c.fill();
      arc(rr, Math.PI * 0.75, Math.PI * 1.75, SH);
      arc(rr - 1, Math.PI * 0.75, Math.PI * 1.75, DK);
      arc(rr, -Math.PI * 0.25, Math.PI * 0.75, HI);
      arc(rr - 1, -Math.PI * 0.25, Math.PI * 0.75, FACE);
      if (t - at > 0.12) {
        c.fillStyle = TONE[tone];
        c.beginPath();
        c.arc(cx, cy, Math.max(2, rr * 0.45), 0, Math.PI * 2);
        c.fill();
      }
    },
    box(x, y, bw, bh, o = {}) {
      const { at = 0, dur = 0.25, tone = "ink" } = o;
      if (t < at) return;
      const p = progress(t, at, dur);
      if (p < 1) return zoom(p, X(x), Y(y), X(bw), Y(bh));
      arrived(at, X(x + bw) - 8, Y(y + bh) - 8);
      // A sunken white field, with a navy strip when it's a result.
      bevel(X(x), Y(y), X(bw), Y(bh), false, HI);
      if (tone !== "ink") {
        c.fillStyle = TONE[tone];
        c.fillRect(R(X(x)) + 2, R(Y(y)) + 2, R(X(bw)) - 4, 3);
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (t < at) return;
      const p = Math.floor(progress(t, at, dur) * 8) / 8 || 1 / 8;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const col = head ? TONE[tone] : SH;
      dotted(pts, p, col);
      if (head && p >= 1) {
        const e = pts.at(-1) as Pt;
        const q = pts.at(-3) as Pt;
        const a = Math.atan2(e[1] - q[1], e[0] - q[0]);
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(R(e[0]), R(e[1]));
        c.lineTo(R(e[0] - Math.cos(a - 0.5) * 6), R(e[1] - Math.sin(a - 0.5) * 6));
        c.lineTo(R(e[0] - Math.cos(a + 0.5) * 6), R(e[1] - Math.sin(a + 0.5) * 6));
        c.fill();
      }
    },
    store(x, y, bw, bh, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (t < at) return;
      arrived(at, X(x + bw / 2), Y(y + bh / 2));
      // A drive bay: raised case with slots that light up one by one.
      bevel(X(x), Y(y), X(bw), Y(bh), true);
      const n = 4;
      const sh = (Y(bh) - 8) / n;
      for (let i = 0; i < n; i++) {
        const yy = Y(y) + 4 + i * sh;
        bevel(X(x) + 4, yy, X(bw) - 8, sh - 3, false, "#A0A0A0");
        if (t >= at + ((i + 1) * dur) / n) {
          c.fillStyle = "#00C000";
          c.fillRect(R(X(x + bw)) - 10, R(yy + sh / 2) - 2, 3, 2);
        }
      }
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "accent" } = o;
      if (t < at) return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const big = size * 1.05;
      if (sub) {
        // On its own it gets a little panel, like a dialog's readout.
        c.font = `bold ${px(big)}px ${FONT}`;
        const tw = Math.max(c.measureText(s).width, 60) + 20;
        bevel(X(x) - tw / 2, Y(y) - px(big) * 0.9, tw, px(big) * 2, false, NAVY);
        write(s, X(x), Y(y) - px(big) * 0.15, big, HI, "center", true);
        write(sub, X(x), Y(y) + px(big) * 0.65, size * 0.35, HI, "center");
      } else write(s, X(x), Y(y), big, tone === "accent" ? NAVY : TONE[tone], "center", true);
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 40 } = o;
      if (t < at) return;
      arrived(at, X(x), Y(y));
      const r = Math.max(6, R(size * u * 0.7));
      const cx = R(X(x));
      const cy = R(Y(y));
      if (kind === "check") {
        // A ticked checkbox.
        bevel(cx - r, cy - r, r * 2, r * 2, false, HI);
        c.strokeStyle = DK;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(cx - r * 0.5, cy);
        c.lineTo(cx - r * 0.1, cy + r * 0.45);
        c.lineTo(cx + r * 0.55, cy - r * 0.45);
        c.stroke();
      } else {
        c.fillStyle = "#E00000";
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = HI;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(cx - r * 0.4, cy - r * 0.4);
        c.lineTo(cx + r * 0.4, cy + r * 0.4);
        c.moveTo(cx + r * 0.4, cy - r * 0.4);
        c.lineTo(cx - r * 0.4, cy + r * 0.4);
        c.stroke();
      }
    },
    finish() {
      if (pointer) {
        const [px0, py0] = pointer as Pt;
        const arrow: Pt[] = [
          [0, 0],
          [0, 16],
          [4, 12],
          [7, 18],
          [9, 17],
          [6, 11],
          [11, 11],
        ];
        c.beginPath();
        for (const [i, [ax, ay]] of arrow.entries())
          i ? c.lineTo(R(px0) + ax, R(py0) + ay) : c.moveTo(R(px0) + ax, R(py0) + ay);
        c.closePath();
        c.fillStyle = HI;
        c.fill();
        c.strokeStyle = DK;
        c.lineWidth = 1;
        c.stroke();
      }
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(st.buf, 0, 0, full.W, full.H);
      ctx.restore();
    },
  };
}

export default {
  id: "win95",
  name: "Retro desktop",
  category: "Retro UI & Neon",
  make,
} satisfies Style;
