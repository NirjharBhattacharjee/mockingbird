// A 16-bit console cutscene: the whole frame drawn at 180 lines and blown up
// with hard pixels. Dusk sky in dithered bands over a lit skyline, RPG windows
// with bevelled borders that snap open, dialog text that types, chevron
// conveyors for links, and a stepped fade up from black.
import {
  clamp,
  counting,
  curve,
  frame,
  hash,
  type Look,
  leftOf,
  type Pt,
  progress,
  type Style,
  type Tone,
} from "./look.ts";

const DARK = "#0B0E2A";
const WHITE = "#F4F1FF";
const TONE: Record<Tone, string> = {
  ink: "#7FB2FF",
  accent: "#FFD23F",
  good: "#5CE38A",
  bad: "#FF4F5E",
  muted: "#8A86B8",
};
const SKY = [
  "#140F33",
  "#1E1546",
  "#2C1A5E",
  "#432176",
  "#62288A",
  "#8A3592",
  "#B44A8E",
  "#D86A84",
];
const FONT = '"Inter", sans-serif';

/** Snap a 0-1 entrance to whole steps, the way sprites move. */
const step = (p: number, n: number) => Math.floor(clamp(p) * n) / n;

function make(ctx: any, t: number, m: any): Look {
  const full = frame(m);
  const s = full.H / 180;
  const w = Math.round(full.W / s);
  const h = 180;
  const g = globalThis as any;
  g.__px16 ??= { text: new Map() };
  const store_ = g.__px16;
  if (!store_.buf || store_.buf.width !== w) {
    store_.buf = new OffscreenCanvas(w, h);
    store_.sky = null;
  }
  const c = store_.buf.getContext("2d");
  const { u, X, Y } = frame({ width: w, height: h });
  const R = Math.round;

  /** Text with no anti-aliasing: drawn once, alpha cut to on/off, cached. */
  function crisp(s: string, px: number, color: string) {
    const key = `${s}|${px}|${color}`;
    let img = store_.text.get(key);
    if (!img) {
      if (store_.text.size > 600) store_.text.clear();
      const font = `bold ${px}px ${FONT}`;
      const probe = new OffscreenCanvas(4, 4).getContext("2d");
      probe.font = font;
      const tw = Math.ceil(probe.measureText(s).width) + 2;
      img = new OffscreenCanvas(tw, Math.ceil(px * 1.5));
      const x = img.getContext("2d", { willReadFrequently: true });
      x.font = font;
      x.fillStyle = color;
      x.textBaseline = "middle";
      x.fillText(s, 1, img.height / 2);
      const d = x.getImageData(0, 0, img.width, img.height);
      for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 100 ? 255 : 0;
      x.putImageData(d, 0, 0);
      store_.text.set(key, img);
    }
    return img;
  }

  /** Pixel text with a dark one-pixel outline, aligned at (x, y). */
  function say(
    s: string,
    x: number,
    y: number,
    px: number,
    color: string,
    align = "left",
    outline = true,
  ) {
    const img = crisp(s, px, color);
    const ox = align === "center" ? img.width / 2 : align === "right" ? img.width : 0;
    const x0 = R(x - ox);
    const y0 = R(y - img.height / 2);
    if (outline) {
      const sh = crisp(s, px, DARK);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
      ])
        c.drawImage(sh, x0 + (dx as number), y0 + (dy as number));
    }
    c.drawImage(img, x0, y0);
    return img.width;
  }

  /** An RPG window: dark rim, light bevel, banded blue fill. */
  function windowAt(x: number, y: number, ww: number, hh: number, rim = WHITE) {
    x = R(x);
    y = R(y);
    ww = R(ww);
    hh = R(hh);
    if (ww < 4 || hh < 4) return;
    c.fillStyle = DARK;
    c.fillRect(x - 1, y - 1, ww + 2, hh + 2);
    c.fillStyle = rim;
    c.fillRect(x, y, ww, hh);
    const bands = ["#3448C8", "#2D3DB4", "#2734A0", "#212B8C", "#1C2478"];
    const ih = hh - 4;
    for (let i = 0; i < bands.length; i++) {
      c.fillStyle = bands[i] as string;
      const y0 = y + 2 + Math.floor((ih * i) / bands.length);
      c.fillRect(x + 2, y0, ww - 4, Math.ceil(ih / bands.length) + 1);
    }
    c.fillStyle = DARK;
    c.fillRect(x + 2, y + hh - 2, ww - 4, 1);
  }

  function sky() {
    if (store_.sky) return store_.sky;
    const sc = new OffscreenCanvas(w, h);
    const x = sc.getContext("2d");
    const horizon = R(h * 0.8);
    const band = horizon / SKY.length;
    for (let i = 0; i < SKY.length; i++) {
      const y0 = R(i * band);
      x.fillStyle = SKY[i] as string;
      x.fillRect(0, y0, w, R(band) + 1);
      const next = SKY[i + 1];
      if (next) {
        x.fillStyle = next;
        for (let yy = R((i + 1) * band) - 3; yy < R((i + 1) * band); yy++)
          for (let xx = (yy % 2) * 1; xx < w; xx += 2) x.fillRect(xx, yy, 1, 1);
      }
    }
    for (let i = 0; i < 70; i++) {
      x.fillStyle = hash(i * 5.1) > 0.7 ? "#FFFFFF" : "#B9A8FF";
      x.fillRect(R(hash(i * 3.3) * w), R(hash(i * 7.7) * h * 0.45), 1, 1);
    }
    x.fillStyle = "#FFC56B";
    x.beginPath();
    x.arc(R(w * 0.8), horizon - 4, 16, 0, Math.PI * 2);
    x.fill();
    let bx = 0;
    for (let i = 0; bx < w; i++) {
      const bw = 8 + R(hash(i * 2.1) * 14);
      const bh = 10 + R(hash(i * 4.7) * 26);
      x.fillStyle = i % 2 ? "#1A1238" : "#22184A";
      x.fillRect(bx, horizon - bh, bw, bh);
      x.fillStyle = "#FFD97A";
      for (let wy = horizon - bh + 3; wy < horizon - 2; wy += 4)
        for (let wx = bx + 2; wx < bx + bw - 2; wx += 3)
          if (hash(wx * 1.3 + wy * 7.1) > 0.72) x.fillRect(wx, wy, 1, 2);
      bx += bw + 1;
    }
    x.fillStyle = "#0F0B26";
    x.fillRect(0, horizon, w, h - horizon);
    x.fillStyle = "#3A2A6E";
    for (let xx = 0; xx < w; xx += 6) x.fillRect(xx, horizon + 2, 3, 1);
    store_.sky = sc;
    return sc;
  }

  /** Draw only after `at`; `p` is the entrance so far, stepped. */
  const shown = (at = 0) => t >= at;

  return {
    surface() {
      c.imageSmoothingEnabled = false;
      c.drawImage(sky(), 0, 0);
    },
    title(text, o = {}) {
      const { x = 0.035, y = 0.06, size = 54, at = 0, dur = 0.9 } = o;
      if (!shown(at)) return;
      const px = Math.max(9, R(size * u));
      const s = text.toUpperCase();
      const n = Math.ceil(s.length * progress(t, at + 0.12, dur));
      const full_ = crisp(s, px, WHITE).width;
      const open = step(progress(t, at, 0.12), 3);
      const bh = px + 8;
      const left = leftOf(X(x), full_ + 12, o.align);
      windowAt(left, Y(y) + (bh * (1 - open)) / 2, full_ + 12, bh * open);
      if (open >= 1 && n > 0) say(s.slice(0, n), left + 6, Y(y) + bh / 2, px, WHITE);
    },
    label(text, x, y, o = {}) {
      const { size = 44, at = 0, dur = 0.3, tone = "ink", align = "center" } = o;
      if (!shown(at)) return;
      const px = Math.max(8, R(size * u));
      const s = text.toUpperCase();
      const tw = crisp(s, px, WHITE).width;
      const bx = align === "center" ? X(x) - tw / 2 - 4 : align === "right" ? X(x) - tw - 8 : X(x);
      c.fillStyle = DARK;
      c.fillRect(R(bx) - 1, R(Y(y) - px / 2 - 3) - 1, tw + 10, px + 8);
      c.fillStyle = tone === "ink" ? WHITE : TONE[tone];
      c.fillRect(R(bx), R(Y(y) - px / 2 - 3), tw + 8, px + 6);
      c.fillStyle = "#1C2478";
      c.fillRect(R(bx) + 1, R(Y(y) - px / 2 - 3) + 1, tw + 6, px + 4);
      const n = Math.ceil(s.length * progress(t, at, dur));
      say(s.slice(0, n), bx + 4, Y(y), px, tone === "ink" ? WHITE : TONE[tone], "left", false);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.2, tone = "accent" } = o;
      if (!shown(at)) return;
      const p = progress(t, at, dur);
      const k = p < 0.34 ? 0.5 : p < 0.67 ? 1.25 : 1;
      const rr = Math.max(2, R(r * u * 1.3 * k));
      const cx = R(X(x));
      const cy = R(Y(y));
      c.fillStyle = DARK;
      c.beginPath();
      c.arc(cx, cy, rr + 1, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = TONE[tone];
      c.beginPath();
      c.arc(cx, cy, rr, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "rgba(11,14,42,0.35)";
      c.beginPath();
      c.arc(cx + R(rr * 0.35), cy + R(rr * 0.35), R(rr * 0.75), 0, Math.PI * 2);
      c.fill();
      c.fillStyle = WHITE;
      c.fillRect(
        cx - R(rr * 0.5),
        cy - R(rr * 0.55),
        Math.max(1, R(rr * 0.3)),
        Math.max(1, R(rr * 0.3)),
      );
    },
    box(x, y, bw, bh, o = {}) {
      const { at = 0, dur = 0.15, tone = "ink" } = o;
      if (!shown(at)) return;
      const open = Math.max(0.2, step(progress(t, at, dur), 4));
      const hh = Y(bh) * open;
      windowAt(X(x), Y(y) + (Y(bh) - hh) / 2, X(bw), hh, tone === "ink" ? WHITE : TONE[tone]);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (!shown(at)) return;
      const p = step(progress(t, at, dur), 6);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 48);
      let len = 0;
      const dist: number[] = [0];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1] as Pt;
        const b = pts[i] as Pt;
        len += Math.hypot(b[0] - a[0], b[1] - a[1]);
        dist.push(len);
      }
      const at_ = (d: number) => {
        let i = 1;
        while (i < dist.length - 1 && (dist[i] as number) < d) i++;
        const a = pts[i - 1] as Pt;
        const b = pts[i] as Pt;
        const f =
          (d - (dist[i - 1] as number)) / ((dist[i] as number) - (dist[i - 1] as number) || 1);
        return {
          x: a[0] + (b[0] - a[0]) * f,
          y: a[1] + (b[1] - a[1]) * f,
          ang: Math.atan2(b[1] - a[1], b[0] - a[0]),
        };
      };
      const end = len * (p || 1 / 6);
      if (!head) {
        c.fillStyle = TONE[tone === "accent" ? "muted" : tone];
        for (let d = 0; d < end; d += 2) {
          const q = at_(d);
          c.fillRect(R(q.x), R(q.y), 1, 1);
        }
        return;
      }
      const gap = 6;
      const off = (t * 12) % gap;
      for (let d = off; d < end; d += gap) {
        const q = at_(d);
        const ca = Math.cos(q.ang);
        const sa = Math.sin(q.ang);
        for (const [col, grow] of [
          [DARK, 1],
          [TONE[tone], 0],
        ] as const) {
          c.fillStyle = col;
          c.beginPath();
          c.moveTo(R(q.x + ca * (2 + grow)), R(q.y + sa * (2 + grow)));
          c.lineTo(R(q.x - ca * 2 - sa * (2 + grow)), R(q.y - sa * 2 + ca * (2 + grow)));
          c.lineTo(R(q.x - ca * 2 + sa * (2 + grow)), R(q.y - sa * 2 - ca * (2 + grow)));
          c.closePath();
          c.fill();
        }
      }
    },
    store(x, y, sw, sh, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (!shown(at)) return;
      const n = 4;
      const colors = ["#FF6B8A", "#FFD23F", "#5CE38A", "#7FB2FF"];
      const slab = Y(sh) / n;
      for (let i = 0; i < n; i++) {
        const p = progress(t, at + (i * dur) / n, dur / n);
        if (p <= 0) continue;
        const drop = R((1 - step(p, 4)) * 12);
        const yy = R(Y(y) + Y(sh) - slab * (i + 1) - drop);
        const xx = R(X(x));
        c.fillStyle = DARK;
        c.fillRect(xx - 1, yy - 1, R(X(sw)) + 2, R(slab) + 1);
        c.fillStyle = "#C9C3E6";
        c.fillRect(xx, yy, R(X(sw)), R(slab) - 1);
        c.fillStyle = colors[i] as string;
        c.fillRect(xx + 3, yy + 2, R(X(sw)) - 6, R(slab) - 5);
        c.fillStyle = WHITE;
        c.fillRect(xx, yy, R(X(sw)), 1);
      }
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "accent" } = o;
      if (!shown(at)) return;
      const px = Math.max(10, R(size * u * 1.4));
      const s = count ? counting(t, at, dur, count) + text : text;
      say(s, X(x), Y(y) - (sub ? px * 0.3 : 0), px, TONE[tone], "center");
      if (sub)
        say(sub.toUpperCase(), X(x), Y(y) + px * 0.65, Math.max(8, R(px * 0.42)), WHITE, "center");
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.2, size = 40 } = o;
      if (!shown(at)) return;
      const r = Math.max(4, R(size * u * 0.9 * (progress(t, at, dur) < 0.5 ? 1.4 : 1)));
      const cx = R(X(x));
      const cy = R(Y(y));
      const line = (pts: Pt[], col: string, wid: number) => {
        c.strokeStyle = col;
        c.lineWidth = wid;
        c.lineCap = "square";
        c.beginPath();
        for (const [i, [px, py]] of pts.entries()) i ? c.lineTo(px, py) : c.moveTo(px, py);
        c.stroke();
      };
      const pts: Pt[][] =
        kind === "check"
          ? [
              [
                [cx - r * 0.6, cy],
                [cx - r * 0.15, cy + r * 0.5],
                [cx + r * 0.7, cy - r * 0.55],
              ],
            ]
          : [
              [
                [cx - r * 0.55, cy - r * 0.55],
                [cx + r * 0.55, cy + r * 0.55],
              ],
              [
                [cx + r * 0.55, cy - r * 0.55],
                [cx - r * 0.55, cy + r * 0.55],
              ],
            ];
      for (const pl of pts) line(pl, DARK, 5);
      for (const pl of pts) line(pl, kind === "check" ? TONE.good : TONE.bad, 3);
    },
    finish() {
      const fade = step(progress(t, 0, 0.5), 16);
      if (fade < 1) {
        c.fillStyle = `rgba(0,0,0,${1 - fade})`;
        c.fillRect(0, 0, w, h);
      }
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(store_.buf, 0, 0, full.W, full.H);
      ctx.restore();
    },
  };
}

export default {
  id: "pixel-16bit",
  name: "16-bit cutscene",
  category: "Retro Digital",
  make,
} satisfies Style;
