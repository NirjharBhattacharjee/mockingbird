// An early one-bit desktop: pure black and white at a coarse 72-dpi grain,
// greys only as 8x8 dot patterns, a menu bar, a window with a striped title
// bar, drop-shadowed panels, marching ants while a thing is being placed, and
// a pointer that hops to whatever just arrived. Nothing eases; it all snaps.
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

const FONT = '"Inter", "Noto Color Emoji", sans-serif';
/** 8x8 patterns, one row per byte: 1 is a black pixel. */
const PAT: Record<string, number[]> = {
  grey: [0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55],
  light: [0x88, 0x00, 0x22, 0x00, 0x88, 0x00, 0x22, 0x00],
  dark: [0xee, 0xbb, 0xee, 0xbb, 0xee, 0xbb, 0xee, 0xbb],
  weave: [0x81, 0x42, 0x24, 0x18, 0x18, 0x24, 0x42, 0x81],
  desk: [0x88, 0x55, 0x22, 0x55, 0x88, 0x55, 0x22, 0x55],
};
const FILL: Record<Tone, string> = {
  ink: "white",
  accent: "grey",
  good: "weave",
  bad: "dark",
  muted: "light",
};

function make(ctx: any, t: number, m: any): Look {
  const full = frame(m);
  const h = 360;
  const w = Math.round((full.W / full.H) * h);
  const g = globalThis as any;
  g.__mac1 ??= { pats: {} };
  const st = g.__mac1;
  if (!st.buf || st.buf.width !== w) st.buf = new OffscreenCanvas(w, h);
  const c = st.buf.getContext("2d", { willReadFrequently: true });
  const { u, X, Y } = frame({ width: w, height: h });
  const R = Math.round;
  let pointer: Pt | null = null;
  let pointerAt = -1;

  function pattern(name: string) {
    if (name === "white") return "#fff";
    if (!st.pats[name]) {
      const tile = new OffscreenCanvas(8, 8);
      const x = tile.getContext("2d");
      x.fillStyle = "#fff";
      x.fillRect(0, 0, 8, 8);
      x.fillStyle = "#000";
      (PAT[name] as number[]).forEach((row, y) => {
        for (let i = 0; i < 8; i++) if (row & (0x80 >> i)) x.fillRect(i, y, 1, 1);
      });
      st.pats[name] = tile;
    }
    return c.createPattern(st.pats[name], "repeat");
  }
  /** Remember the newest arrival so the pointer can sit on it. */
  const arrived = (at: number, x: number, y: number) => {
    if (t >= at && at >= pointerAt) {
      pointerAt = at;
      pointer = [x, y];
    }
  };
  const font = (size: number, bold = true) =>
    `${bold ? "bold " : ""}${Math.max(10, R(size * u))}px ${FONT}`;
  function write(
    s: string,
    x: number,
    y: number,
    size: number,
    align = "left",
    bold = true,
    color = "#000",
  ) {
    c.font = font(size, bold);
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = "middle";
    c.fillText(s, R(x), R(y));
  }
  /** A panel: fill, one-pixel rim, a hard shadow down and right. */
  function panel(x: number, y: number, ww: number, hh: number, fill = "white") {
    x = R(x);
    y = R(y);
    ww = R(ww);
    hh = R(hh);
    c.fillStyle = "#000";
    c.fillRect(x + 2, y + 2, ww, hh);
    c.fillStyle = pattern(fill);
    c.fillRect(x, y, ww, hh);
    c.strokeStyle = "#000";
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, ww - 1, hh - 1);
  }
  /** Dashed rectangle whose dashes crawl. */
  function ants(x: number, y: number, ww: number, hh: number) {
    c.save();
    c.setLineDash([3, 3]);
    c.lineDashOffset = -Math.floor(t * 12);
    c.strokeStyle = "#000";
    c.lineWidth = 1;
    c.strokeRect(R(x) - 3.5, R(y) - 3.5, R(ww) + 7, R(hh) + 7);
    c.restore();
  }
  const win = { x: 0.02 * w, y: 0.075 * h, w: 0.96 * w, h: 0.9 * h };

  return {
    surface() {
      c.imageSmoothingEnabled = false;
      c.fillStyle = pattern("desk");
      c.fillRect(0, 0, w, h);
      // Menu bar.
      c.fillStyle = "#fff";
      c.fillRect(0, 0, w, 18);
      c.fillStyle = "#000";
      c.fillRect(0, 18, w, 1);
      ["File", "Edit", "View", "Special"].reduce((x, s) => {
        write(s, x, 9, 0, "left");
        return x + c.measureText(s).width + 16;
      }, 30);
      // The window zooms open in a few outlines, then sits there.
      const z = progress(t, 0, 0.35);
      if (z < 1) {
        c.strokeStyle = "#000";
        for (let k = 0; k < 3; k++) {
          const f = Math.min(1, Math.floor(z * 6) / 6 + k * 0.08);
          const ww = win.w * f;
          const hh = win.h * f;
          c.strokeRect(R(w / 2 - ww / 2) + 0.5, R(win.y + win.h / 2 - hh / 2) + 0.5, R(ww), R(hh));
        }
        return;
      }
      panel(win.x, win.y, win.w, win.h);
      c.fillStyle = "#000";
      c.fillRect(R(win.x), R(win.y) + 19, R(win.w), 1);
      for (let y = 4; y < 17; y += 2) c.fillRect(R(win.x) + 2, R(win.y) + y, R(win.w) - 4, 1);
      c.fillStyle = "#fff";
      c.fillRect(R(win.x) + 10, R(win.y) + 4, 13, 12);
      c.strokeStyle = "#000";
      c.strokeRect(R(win.x) + 11.5, R(win.y) + 5.5, 10, 9);
    },
    title(text, o = {}) {
      const { at = 0, dur = 0.6 } = o;
      if (t < at) return;
      const n = Math.ceil(text.length * progress(t, at, dur));
      c.font = font(44);
      const tw = c.measureText(text).width;
      c.fillStyle = "#fff";
      c.fillRect(R(w / 2 - tw / 2 - 8), R(win.y) + 2, R(tw + 16), 16);
      write(text.slice(0, n), w / 2 - tw / 2, win.y + 10, 44);
    },
    label(text, x, y, o = {}) {
      const { at = 0, size = 40, tone = "ink", align = "center" } = o;
      if (t < at) return;
      arrived(at, X(x), Y(y));
      // Selected for a beat (inverted), then plain.
      const sel = t - at < 0.18;
      c.font = font(size, tone !== "muted");
      const tw = c.measureText(text).width;
      const bx = align === "center" ? X(x) - tw / 2 : align === "right" ? X(x) - tw : X(x);
      if (sel) {
        c.fillStyle = "#000";
        c.fillRect(R(bx) - 3, R(Y(y) - size * u * 0.6), R(tw) + 6, R(size * u * 1.2));
      }
      write(text, bx, Y(y), size, "left", tone !== "muted", sel ? "#fff" : "#000");
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      if (t < at) return;
      arrived(at, X(x), Y(y));
      const rr = Math.max(3, R(r * u * 1.1));
      c.beginPath();
      c.arc(R(X(x)) + 2, R(Y(y)) + 2, rr, 0, Math.PI * 2);
      c.fillStyle = "#000";
      c.fill();
      c.beginPath();
      c.arc(R(X(x)), R(Y(y)), rr, 0, Math.PI * 2);
      c.fillStyle = pattern(t - at < 0.1 ? "dark" : FILL[tone]);
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = "#000";
      c.stroke();
    },
    box(x, y, bw, bh, o = {}) {
      const { at = 0, dur = 0.4 } = o;
      if (t < at) return;
      arrived(at, X(x + bw), Y(y + bh));
      panel(X(x), Y(y), X(bw), Y(bh));
      if (t - at < dur) ants(X(x), Y(y), X(bw), Y(bh));
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (t < at) return;
      const p = Math.max(0.25, Math.floor(progress(t, at, dur) * 4) / 4);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, R(pts.length * p)));
      c.save();
      c.strokeStyle = "#000";
      c.lineWidth = head ? 1.5 : 1;
      if (tone === "bad") c.setLineDash([4, 3]);
      if (!head && tone !== "bad") c.globalAlpha = 0.55;
      c.beginPath();
      for (const [i, [px, py]] of shown.entries()) i ? c.lineTo(px, py) : c.moveTo(px, py);
      c.stroke();
      c.restore();
      if (head && p >= 1) {
        const e = pts.at(-1) as Pt;
        const q = pts.at(-3) as Pt;
        const a = Math.atan2(e[1] - q[1], e[0] - q[0]);
        c.fillStyle = "#000";
        c.beginPath();
        c.moveTo(e[0], e[1]);
        c.lineTo(e[0] - Math.cos(a - 0.45) * 8, e[1] - Math.sin(a - 0.45) * 8);
        c.lineTo(e[0] - Math.cos(a + 0.45) * 8, e[1] - Math.sin(a + 0.45) * 8);
        c.fill();
      }
    },
    store(x, y, bw, bh, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (t < at) return;
      arrived(at, X(x + bw / 2), Y(y + bh / 2));
      // A stack of document icons with folded corners, dropped in one by one.
      const n = 3;
      for (let i = 0; i < n; i++) {
        if (t < at + (i * dur) / n) continue;
        const ox = X(x) + i * 5;
        const oy = Y(y) + i * 6;
        const dw = X(bw) - 10;
        const dh = Y(bh) - 12;
        const f = Math.min(dw, dh) * 0.25;
        c.beginPath();
        c.moveTo(R(ox) + 0.5, R(oy) + 0.5);
        c.lineTo(R(ox + dw - f) + 0.5, R(oy) + 0.5);
        c.lineTo(R(ox + dw) + 0.5, R(oy + f) + 0.5);
        c.lineTo(R(ox + dw) + 0.5, R(oy + dh) + 0.5);
        c.lineTo(R(ox) + 0.5, R(oy + dh) + 0.5);
        c.closePath();
        c.fillStyle = "#fff";
        c.fill();
        c.strokeStyle = "#000";
        c.lineWidth = 1;
        c.stroke();
        c.beginPath();
        c.moveTo(R(ox + dw - f) + 0.5, R(oy) + 0.5);
        c.lineTo(R(ox + dw - f) + 0.5, R(oy + f) + 0.5);
        c.lineTo(R(ox + dw) + 0.5, R(oy + f) + 0.5);
        c.stroke();
        c.fillStyle = "#000";
        for (let ly = oy + f + 4; ly < oy + dh - 3; ly += 4)
          c.fillRect(R(ox) + 4, R(ly), R(dw * (0.5 + 0.3 * ((ly / 4) % 2))), 1);
      }
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub } = o;
      if (t < at) return;
      arrived(at, X(x) + 30, Y(y) + 20);
      const s = count ? counting(t, at, dur, count) + text : text;
      write(s, X(x), Y(y) - (sub ? size * u * 0.3 : 0), size * 1.1, "center");
      if (sub) write(sub, X(x), Y(y) + size * u * 0.7, size * 0.4, "center", false);
      if (progress(t, at, dur) >= 1 && count) {
        c.font = font(size * 1.1);
        const tw = c.measureText(s).width;
        ants(X(x) - tw / 2, Y(y) - size * u * (sub ? 1 : 0.65), tw, size * u * (sub ? 2 : 1.3));
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 40 } = o;
      if (t < at) return;
      arrived(at, X(x), Y(y));
      const r = Math.max(5, R(size * u * 0.8));
      const cx = R(X(x));
      const cy = R(Y(y));
      c.strokeStyle = "#000";
      c.lineWidth = 2;
      c.beginPath();
      if (kind === "check") {
        c.moveTo(cx - r * 0.6, cy);
        c.lineTo(cx - r * 0.2, cy + r * 0.6);
        c.lineTo(cx + r * 0.6, cy - r * 0.8);
      } else {
        c.moveTo(cx - r * 0.5, cy - r * 0.5);
        c.lineTo(cx + r * 0.5, cy + r * 0.5);
        c.moveTo(cx + r * 0.5, cy - r * 0.5);
        c.lineTo(cx - r * 0.5, cy + r * 0.5);
      }
      c.stroke();
    },
    finish() {
      if (pointer) {
        const [px, py] = pointer as Pt;
        const arrow: Pt[] = [
          [0, 0],
          [0, 15],
          [4, 11],
          [7, 17],
          [9, 16],
          [6, 10],
          [11, 10],
        ];
        c.beginPath();
        for (const [i, [ax, ay]] of arrow.entries())
          i ? c.lineTo(R(px) + ax, R(py) + ay) : c.moveTo(R(px) + ax, R(py) + ay);
        c.closePath();
        c.fillStyle = "#000";
        c.fill();
        c.strokeStyle = "#fff";
        c.lineWidth = 1;
        c.stroke();
      }
      // Every pixel to pure black or white.
      const d = c.getImageData(0, 0, w, h);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = d.data[i] + d.data[i + 1] + d.data[i + 2] > 382 ? 255 : 0;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
        d.data[i + 3] = 255;
      }
      c.putImageData(d, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(st.buf, 0, 0, full.W, full.H);
      ctx.restore();
    },
  };
}

export default {
  id: "mac-1bit",
  name: "One-bit desktop",
  category: "Retro Digital",
  make,
} satisfies Style;
