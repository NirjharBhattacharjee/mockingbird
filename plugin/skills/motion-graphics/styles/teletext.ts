// A broadcast text-service page on a CRT: black, eight saturated colours,
// pictures built from chunky 2x3 mosaic blocks, a page-number header with a
// running clock, double-height headlines and coloured links along the bottom.
// Things land in rows from the top; nothing eases, and key numbers flash.
import {
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

const COL = {
  red: "#FF0000",
  green: "#00FF00",
  yellow: "#FFFF00",
  blue: "#0000FF",
  magenta: "#FF00FF",
  cyan: "#00FFFF",
  white: "#FFFFFF",
};
const TONE: Record<Tone, string> = {
  ink: COL.white,
  accent: COL.yellow,
  good: COL.green,
  bad: COL.red,
  muted: COL.cyan,
};
const MONO = '"Courier New", Menlo, Consolas, monospace';
const COLS = 40;

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  // The mosaic: each character cell is 2 blocks wide and 3 tall.
  const rows = 25;
  const bw = COLS * 2;
  const bh = rows * 3;
  const g = globalThis as any;
  g.__ttx ??= {};
  const st = g.__ttx;
  if (!st.buf) st.buf = new OffscreenCanvas(bw, bh);
  const c = st.buf.getContext("2d", { willReadFrequently: true });
  const bx = (x: number) => x * bw;
  const by = (y: number) => y * bh;
  const cw = W / COLS;
  const rh = H / rows;
  const words: (() => void)[] = [];
  const snapX = (x: number) => Math.round(x / cw) * cw;
  const snapY = (y: number) => (Math.floor(y / rh) + 0.5) * rh;

  /** Text in the character grid, `tall` for double height. Drawn after the mosaic. */
  function say(
    s: string,
    x: number,
    y: number,
    color: string,
    tall = false,
    align = "left",
    bg?: string,
    wide = false,
  ) {
    const k = wide ? 2 : 1;
    words.push(() => {
      ctx.save();
      const fs = Math.round(rh * 0.9);
      ctx.font = `bold ${fs}px ${MONO}`;
      const adv = ctx.measureText("M").width;
      const tw = s.length * cw * k;
      let x0 = align === "center" ? x - tw / 2 : align === "right" ? x - tw : x;
      x0 = snapX(x0);
      const y0 = snapY(y);
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(x0 - cw * 0.5, y0 - rh * (tall ? 1 : 0.5), tw + cw, rh * (tall ? 2 : 1));
      }
      ctx.translate(x0, y0);
      ctx.scale((cw * k * 0.96) / adv, tall ? 2 : 1);
      ctx.fillStyle = color;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      // Spread to the grid: one character per cell.
      for (let i = 0; i < s.length; i++)
        ctx.fillText(s[i] as string, (i * cw * k * adv) / (cw * k * 0.96), rh * 0.04);
      ctx.restore();
    });
    return s.length * cw * k;
  }
  /** Reveal a mosaic shape top-down, two rows at a time. */
  function landing(at: number, dur: number, y0: number, y1: number, draw: () => void) {
    if (t < at) return;
    const p = progress(t, at, dur);
    const cut = Math.ceil((y0 + (y1 - y0) * p) / 6) * 6;
    c.save();
    c.beginPath();
    c.rect(0, 0, bw, cut + 1);
    c.clip();
    draw();
    c.restore();
  }

  return {
    surface() {
      c.imageSmoothingEnabled = false;
      c.fillStyle = "#000";
      c.fillRect(0, 0, bw, bh);
      const sec = 12 + Math.floor(t);
      const page = 100 + Math.min(4, Math.floor(t / 2));
      say(`P${page}  INFO ${page}  Mon 01 Jan`, cw * 0.5, rh * 0.5, COL.white);
      say(
        `10:24/${String(sec % 60).padStart(2, "0")}`,
        W - cw * 0.5,
        rh * 0.5,
        COL.yellow,
        false,
        "right",
      );
      const links: [string, string][] = [
        ["Back", COL.red],
        ["Index", COL.green],
        ["Next", COL.yellow],
        ["More", COL.cyan],
      ];
      for (const [i, [s, col]] of links.entries()) say(s, cw * (2 + i * 12), H - rh * 0.5, col);
    },
    title(text, o = {}) {
      const { x = 0.035, y = 0.06, at = 0, dur = 0.6 } = o;
      if (t < at) return;
      c.fillStyle = COL.blue;
      const row = Math.floor(Y(y) / rh) * 3;
      c.fillRect(0, row, bw, 6);
      // Capitals can be longer ("ß" is "SS"), so count those.
      const caps = text.toUpperCase();
      const n = Math.ceil(caps.length * progress(t, at, dur));
      // Anchored by the whole title, so it doesn't slide while it types on.
      const left = leftOf(X(x), caps.length * cw, o.align);
      say(caps.slice(0, n), left, (row / 3 + 1) * rh, COL.yellow, true);
    },
    label(text, x, y, o = {}) {
      const { at = 0, tone = "ink", align = "center" } = o;
      if (t < at) return;
      say(text, X(x), Y(y), TONE[tone === "ink" ? "muted" : tone], false, align);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.2, tone = "accent" } = o;
      const rr = Math.max(1.5, ((r * u) / H) * bh * 1.3);
      landing(at, dur, by(y) - rr, by(y) + rr, () => {
        c.fillStyle = TONE[tone === "accent" ? "accent" : tone];
        c.beginPath();
        c.ellipse(bx(x), by(y), rr * (bw / bh) * (H / W) * 1.0, rr, 0, 0, Math.PI * 2);
        c.fill();
      });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.3, tone = "ink" } = o;
      landing(at, dur, by(y), by(y + h), () => {
        c.fillStyle =
          tone === "good"
            ? COL.green
            : tone === "bad"
              ? COL.red
              : tone === "accent"
                ? COL.yellow
                : COL.white;
        c.fillRect(Math.round(bx(x)), Math.round(by(y)), Math.round(bx(w)), Math.round(by(h)));
        c.fillStyle = tone === "ink" ? COL.blue : "#000";
        c.fillRect(
          Math.round(bx(x)) + 1,
          Math.round(by(y)) + 2,
          Math.round(bx(w)) - 2,
          Math.round(by(h)) - 4,
        );
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (t < at) return;
      const p = Math.max(0.2, Math.floor(progress(t, at, dur) * 5) / 5);
      const pts = curve([bx(x1), by(y1)], [bx(x2), by(y2)], bend, 30);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      c.strokeStyle = head ? (tone === "accent" ? COL.white : TONE[tone]) : COL.blue;
      c.lineWidth = head ? 1.6 : 0.8;
      c.beginPath();
      for (const [i, [px, py]] of shown.entries()) i ? c.lineTo(px, py) : c.moveTo(px, py);
      c.stroke();
      if (head && p >= 1) {
        const e = pts.at(-1) as Pt;
        const q = pts.at(-4) as Pt;
        const a = Math.atan2(e[1] - q[1], e[0] - q[0]);
        c.fillStyle = c.strokeStyle;
        c.beginPath();
        c.moveTo(e[0] + Math.cos(a), e[1] + Math.sin(a));
        c.lineTo(e[0] - Math.cos(a - 0.7) * 4, e[1] - Math.sin(a - 0.7) * 4);
        c.lineTo(e[0] - Math.cos(a + 0.7) * 4, e[1] - Math.sin(a + 0.7) * 4);
        c.fill();
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      // Stacked bars, stepping up a block at a time like a mosaic chart.
      if (t < at) return;
      const n = 4;
      const cols = [COL.cyan, COL.green, COL.yellow, COL.magenta];
      const slab = by(h) / n;
      for (let i = 0; i < n; i++) {
        if (t < at + (i * dur) / n) continue;
        c.fillStyle = cols[i] as string;
        c.fillRect(
          Math.round(bx(x)),
          Math.round(by(y + h) - slab * (i + 1)),
          Math.round(bx(w)),
          Math.max(2, Math.round(slab) - 1),
        );
      }
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, sub, tone = "accent" } = o;
      if (t < at) return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const done = progress(t, at, dur) >= 1;
      // Flash once counted: on and off twice a second.
      if (done && Math.floor((t - at - dur) * 3) % 2 === 1 && t - at - dur < 2) return;
      say(s, X(x), Y(y) - (sub ? rh * 0.5 : 0), TONE[tone], true, "center", undefined, !!sub);
      if (sub) say(sub, X(x), Y(y) + rh * 1.5, COL.white, false, "center");
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 40 } = o;
      if (t < at) return;
      const r = ((size * u) / H) * bh;
      c.strokeStyle = kind === "check" ? COL.green : COL.red;
      c.lineWidth = 1.8;
      c.beginPath();
      const cx = bx(x);
      const cy = by(y);
      const rx = r * 0.8;
      if (kind === "check") {
        c.moveTo(cx - rx, cy);
        c.lineTo(cx - rx * 0.2, cy + r * 0.6);
        c.lineTo(cx + rx, cy - r * 0.7);
      } else {
        c.moveTo(cx - rx, cy - r * 0.6);
        c.lineTo(cx + rx, cy + r * 0.6);
        c.moveTo(cx + rx, cy - r * 0.6);
        c.lineTo(cx - rx, cy + r * 0.6);
      }
      c.stroke();
    },
    finish() {
      // Hard eight-colour blocks: every channel fully on or off.
      const d = c.getImageData(0, 0, bw, bh);
      for (let i = 0; i < d.data.length; i += 4) {
        d.data[i] = d.data[i] > 110 ? 255 : 0;
        d.data[i + 1] = d.data[i + 1] > 110 ? 255 : 0;
        d.data[i + 2] = d.data[i + 2] > 110 ? 255 : 0;
      }
      c.putImageData(d, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(st.buf, 0, 0, W, H);
      // Separated mosaic: a thin black gap round each block.
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      const pw = W / bw;
      const ph = H / bh;
      for (let i = 0; i < bw; i++) ctx.fillRect(i * pw, 0, Math.max(1, pw * 0.12), H);
      for (let j = 0; j < bh; j++) ctx.fillRect(0, j * ph, W, Math.max(1, ph * 0.12));
      ctx.restore();
      for (const f of words) f();
      // The CRT: scanlines and a soft dark edge.
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.65);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    },
  };
}

export default {
  id: "teletext",
  name: "Text-service page",
  category: "Retro UI & Neon",
  make,
} satisfies Style;
