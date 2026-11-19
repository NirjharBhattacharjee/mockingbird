// A pocket handheld's reflective LCD: the scene drawn small in four pea-soup
// greens, set into a grey-violet bezel, with each pixel casting a faint shadow
// and a little ghosting. Windows pop up on a dark rim, text prints a letter at
// a time, things step into place a whole pixel at a time.
import {
  clamp,
  counting,
  curve,
  frame,
  type Look,
  leftOf,
  type Pt,
  progress,
  type Style,
  type Tone,
} from "./look.ts";

const SHADE = ["#0F380F", "#306230", "#8BAC0F", "#9BBC0F"];
const [D0, D1, D2, D3] = SHADE as [string, string, string, string];
const RGB = SHADE.map((h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)));
const TONE: Record<Tone, string> = { ink: D0, accent: D0, good: D0, bad: D1, muted: D1 };
const FONT = '"Inter", "Noto Color Emoji", sans-serif';
const step = (p: number, n: number) => Math.floor(clamp(p) * n) / n;

function make(ctx: any, t: number, m: any): Look {
  const full = frame(m);
  const g = globalThis as any;
  g.__gb ??= { text: new Map() };
  const st = g.__gb;
  // The screen: a 16:9 window inside the bezel.
  const sx = full.W * 0.14;
  const sy = full.H * 0.07;
  const sw = full.W * 0.72;
  const sh = full.H * 0.8;
  const h = 160;
  const w = Math.round((h * sw) / sh);
  if (!st.buf || st.buf.width !== w) {
    st.buf = new OffscreenCanvas(w, h);
    st.grid = null;
  }
  const c = st.buf.getContext("2d", { willReadFrequently: true });
  const { u, X, Y } = frame({ width: w, height: h });
  const R = Math.round;

  function crisp(s: string, px: number, color: string) {
    const key = `${s}|${px}|${color}`;
    let img = st.text.get(key);
    if (!img) {
      if (st.text.size > 600) st.text.clear();
      const font = `bold ${px}px ${FONT}`;
      const probe = new OffscreenCanvas(4, 4).getContext("2d");
      probe.font = font;
      img = new OffscreenCanvas(Math.ceil(probe.measureText(s).width) + 2, Math.ceil(px * 1.5));
      const x = img.getContext("2d", { willReadFrequently: true });
      x.font = font;
      x.fillStyle = color;
      x.textBaseline = "middle";
      x.fillText(s, 1, img.height / 2);
      const d = x.getImageData(0, 0, img.width, img.height);
      for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 100 ? 255 : 0;
      x.putImageData(d, 0, 0);
      st.text.set(key, img);
    }
    return img;
  }
  function say(s: string, x: number, y: number, px: number, color: string, align = "left") {
    const img = crisp(s, px, color);
    const ox = align === "center" ? img.width / 2 : align === "right" ? img.width : 0;
    c.drawImage(img, R(x - ox), R(y - img.height / 2));
    return img.width;
  }
  /** A text window: lightest fill, a dark rim with a light gap inside it. */
  function panel(x: number, y: number, ww: number, hh: number, fill = D3) {
    x = R(x);
    y = R(y);
    ww = R(ww);
    hh = R(hh);
    if (ww < 3 || hh < 3) return;
    c.fillStyle = D0;
    c.fillRect(x, y, ww, hh);
    c.fillStyle = fill;
    c.fillRect(x + 1, y + 1, ww - 2, hh - 2);
    c.strokeStyle = D0;
    c.lineWidth = 1;
    if (ww > 6 && hh > 6) c.strokeRect(x + 2.5, y + 2.5, ww - 5, hh - 5);
  }
  const shown = (at = 0) => t >= at;

  return {
    surface() {
      c.imageSmoothingEnabled = false;
      c.fillStyle = D3;
      c.fillRect(0, 0, w, h);
      c.fillStyle = D2;
      for (let y = 0; y < h; y += 2)
        for (let x = (y / 2) % 2 ? 1 : 0; x < w; x += 4) c.fillRect(x, y, 1, 1);
    },
    title(text, o = {}) {
      const { x = 0.035, y = 0.06, size = 54, at = 0, dur = 0.9 } = o;
      if (!shown(at)) return;
      const px = Math.max(9, R(size * u));
      const s = text.toUpperCase();
      const tw = crisp(s, px, D0).width;
      const rise = R((1 - step(progress(t, at, 0.2), 5)) * 20);
      const left = R(leftOf(X(x), tw + 10, o.align));
      panel(left, Y(y) + rise, tw + 10, px + 7);
      const n = Math.ceil(s.length * progress(t, at + 0.2, dur));
      if (n > 0) say(s.slice(0, n), left + 5, Y(y) + rise + (px + 7) / 2, px, D0);
    },
    label(text, x, y, o = {}) {
      const { size = 44, at = 0, dur = 0.3, tone = "ink", align = "center" } = o;
      if (!shown(at)) return;
      const px = Math.max(8, R(size * u));
      const s = text.toUpperCase();
      const n = Math.ceil(s.length * progress(t, at, dur));
      const tw = crisp(s, px, D0).width;
      const bx = align === "center" ? X(x) - tw / 2 : align === "right" ? X(x) - tw : X(x);
      if (tone !== "ink" && tone !== "muted") panel(bx - 3, Y(y) - px / 2 - 3, tw + 6, px + 6);
      say(s.slice(0, n), bx, Y(y), px, TONE[tone]);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.25, tone = "accent" } = o;
      if (!shown(at)) return;
      // Steps in through the four shades, lightest first.
      const p = step(progress(t, at, dur), 3);
      const rr = Math.max(2, R(r * u * 1.4));
      const cx = R(X(x));
      const cy = R(Y(y));
      const body = p < 0.34 ? D2 : p < 0.67 ? D1 : tone === "accent" || tone === "good" ? D1 : D2;
      c.fillStyle = D0;
      c.beginPath();
      c.arc(cx, cy, rr + 1, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = body;
      c.beginPath();
      c.arc(cx, cy, rr, 0, Math.PI * 2);
      c.fill();
      if (p >= 1) {
        c.fillStyle = D3;
        c.fillRect(cx - R(rr / 2), cy - R(rr / 2), Math.max(1, R(rr / 3)), Math.max(1, R(rr / 3)));
      }
    },
    box(x, y, bw, bh, o = {}) {
      const { at = 0, dur = 0.15 } = o;
      if (!shown(at)) return;
      const p = Math.max(0.25, step(progress(t, at, dur), 4));
      panel(X(x), Y(y) + Y(bh) * (1 - p), X(bw), Y(bh) * p);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (!shown(at)) return;
      const p = Math.max(1 / 8, step(progress(t, at, dur), 8));
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const n = Math.max(2, R(pts.length * p));
      c.fillStyle = tone === "bad" || !head ? D1 : D0;
      // Dotted for light links and corrections, arrow tiles for the main path.
      const gap = head && tone !== "bad" ? 5 : 2;
      let carry = 0;
      for (let i = 1; i < n; i++) {
        const a = pts[i - 1] as Pt;
        const b = pts[i] as Pt;
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let d = carry; d < l; d += gap) {
          const f = d / l;
          const qx = R(a[0] + (b[0] - a[0]) * f);
          const qy = R(a[1] + (b[1] - a[1]) * f);
          if (gap === 5) {
            const dir = Math.sign(b[0] - a[0]) || 1;
            c.fillRect(qx, qy - 2, 1, 5);
            c.fillRect(qx + dir, qy - 1, 1, 3);
            c.fillRect(qx + 2 * dir, qy, 1, 1);
          } else c.fillRect(qx, qy, 1, 1);
          carry = d + gap - l;
        }
      }
      if (head && p >= 1) {
        const e = pts.at(-1) as Pt;
        const q = pts.at(-4) as Pt;
        const ang = Math.atan2(e[1] - q[1], e[0] - q[0]);
        c.beginPath();
        c.moveTo(R(e[0]), R(e[1]));
        c.lineTo(R(e[0] - Math.cos(ang - 0.6) * 5), R(e[1] - Math.sin(ang - 0.6) * 5));
        c.lineTo(R(e[0] - Math.cos(ang + 0.6) * 5), R(e[1] - Math.sin(ang + 0.6) * 5));
        c.fill();
      }
    },
    store(x, y, bw, bh, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (!shown(at)) return;
      const n = 4;
      const slab = Y(bh) / n;
      for (let i = 0; i < n; i++) {
        const p = progress(t, at + (i * dur) / n, dur / n);
        if (p <= 0) continue;
        const yy = Y(y) + Y(bh) - slab * (i + 1) - R((1 - step(p, 4)) * 8);
        panel(X(x), yy, X(bw), slab - 1, i % 2 ? D2 : D3);
      }
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "accent" } = o;
      if (!shown(at)) return;
      const px = Math.max(10, R(size * u * 1.35));
      const s = count ? counting(t, at, dur, count) + text : text;
      const done = progress(t, at, dur) >= 1 && (t - at - dur) % 1 < 0.5 && tone === "accent";
      const yy = Y(y) - (sub ? px * 0.3 : 0);
      if (done) {
        const tw = crisp(s, px, D3).width;
        c.fillStyle = D0;
        c.fillRect(R(X(x) - tw / 2 - 3), R(yy - px * 0.7), tw + 6, R(px * 1.4));
        say(s, X(x), yy, px, D3, "center");
      } else say(s, X(x), yy, px, D0, "center");
      if (sub)
        say(sub.toUpperCase(), X(x), Y(y) + px * 0.7, Math.max(8, R(px * 0.45)), D1, "center");
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 40 } = o;
      if (!shown(at)) return;
      const r = Math.max(4, R(size * u));
      const cx = R(X(x));
      const cy = R(Y(y));
      c.strokeStyle = D0;
      c.lineWidth = 2;
      c.beginPath();
      if (kind === "check") {
        c.moveTo(cx - r * 0.6, cy);
        c.lineTo(cx - r * 0.15, cy + r * 0.5);
        c.lineTo(cx + r * 0.7, cy - r * 0.6);
      } else {
        c.moveTo(cx - r * 0.5, cy - r * 0.5);
        c.lineTo(cx + r * 0.5, cy + r * 0.5);
        c.moveTo(cx + r * 0.5, cy - r * 0.5);
        c.lineTo(cx - r * 0.5, cy + r * 0.5);
      }
      c.stroke();
    },
    finish() {
      // Snap every pixel to the nearest of the four shades; a palette fade at the start.
      const d = c.getImageData(0, 0, w, h);
      const lift = 3 - Math.min(3, Math.floor(progress(t, 0, 0.4) * 4));
      for (let i = 0; i < d.data.length; i += 4) {
        const l = d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11;
        let k = l < 60 ? 0 : l < 120 ? 1 : l < 158 ? 2 : 3;
        k = Math.min(3, k + lift);
        const col = RGB[k] as number[];
        d.data[i] = col[0] as number;
        d.data[i + 1] = col[1] as number;
        d.data[i + 2] = col[2] as number;
      }
      c.putImageData(d, 0, 0);
      const { W, H } = full;
      ctx.fillStyle = "#D9D6CF";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#8E8A9E";
      ctx.beginPath();
      ctx.roundRect(W * 0.08, -H * 0.05, W * 0.84, H * 1.0, [0, 0, H * 0.12, H * 0.04]);
      ctx.fill();
      ctx.fillStyle = "#6D6880";
      ctx.fillRect(W * 0.1, H * 0.035, W * 0.8, H * 0.004);
      ctx.fillStyle = "#3F3A55";
      ctx.fillRect(W * 0.1, H * 0.022, W * 0.8, H * 0.003);
      ctx.fillStyle = "#C7344A";
      ctx.beginPath();
      ctx.arc(W * 0.11, H * 0.45, H * 0.008, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 0.25;
      ctx.drawImage(st.buf, sx + 3, sy + 3, sw, sh);
      ctx.globalAlpha = 1;
      ctx.drawImage(st.buf, sx, sy, sw, sh);
      ctx.restore();
      // The LCD's pixel grid.
      if (!st.grid || st.grid.width !== Math.ceil(sw)) {
        st.grid = new OffscreenCanvas(Math.ceil(sw), Math.ceil(sh));
        const gx = st.grid.getContext("2d");
        gx.fillStyle = "rgba(155,188,15,0.35)";
        const cw = sw / w;
        for (let i = 0; i <= w; i++) gx.fillRect(i * cw, 0, Math.max(1, cw * 0.12), sh);
        for (let j = 0; j <= h; j++) gx.fillRect(0, j * cw, sw, Math.max(1, cw * 0.12));
      }
      ctx.drawImage(st.grid, sx, sy);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(sx, sy, sw, sh * 0.3);
    },
  };
}

export default {
  id: "gameboy",
  name: "Pocket handheld",
  category: "Retro Digital",
  make,
} satisfies Style;
