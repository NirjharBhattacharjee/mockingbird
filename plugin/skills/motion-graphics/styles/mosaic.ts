// A Byzantine wall mosaic: a ground of glinting gold tesserae set in grey
// grout inside a patterned border, and every element laid tile by tile in
// rows that follow its shape. Lines are tiled along their length; key
// moments make the gold flash.
import { clamp, curve, frame, hash, type Look, type Pt, progress, type Style, type Tone } from "./look.ts";

const GROUT = "#5E564A";
const TILE: Record<Tone, string[]> = {
  ink: ["#EDE6D6", "#DCD3BF", "#F5F0E4"],
  accent: ["#A8322C", "#8E2620", "#BF4136"],
  good: ["#3E5FA8", "#33508F", "#5274BD"],
  bad: ["#A8322C", "#C2463A", "#8A241F"],
  muted: ["#9C9488", "#8A8276", "#B0A99C"],
};
const EDGE: Record<Tone, string> = { ink: "#A8322C", accent: "#EDE6D6", good: "#EDE6D6", bad: "#EDE6D6", muted: "#5E564A" };
const SERIF = '"Hoefler Text", "Baskerville", "Palatino", Georgia, serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const S = 13 * u;
  const g = globalThis as any;
  g.__mosaicGround ??= new Map();

  /** One tessera centred at (x, y), turned `a`, a little off-colour and bevelled. */
  function tessera(x: number, y: number, a: number, cols: string[], seed: number, s = S) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + (hash(seed) - 0.5) * 0.15);
    const w = s * (0.82 + hash(seed + 1) * 0.12);
    const h = s * (0.78 + hash(seed + 2) * 0.14);
    ctx.fillStyle = cols[Math.floor(hash(seed + 3) * cols.length)] as string;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(-w / 2, -h / 2, w, h * 0.22);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(-w / 2, h * 0.3, w, h * 0.2);
    ctx.restore();
  }

  /** Lay tiles over a box where `inside` says, in order of `order` (0-1), as far as `p`. */
  function lay(x0: number, y0: number, x1: number, y1: number, p: number, inside: (x: number, y: number) => Tone | null, order: (x: number, y: number) => number) {
    if (p <= 0) return;
    let k = 0;
    for (let row = 0, y = y0 + S / 2; y < y1; row++, y += S) {
      for (let x = x0 + (row % 2 ? S : S / 2); x < x1; x += S) {
        k++;
        const tone = inside(x, y);
        if (!tone) continue;
        if (order(x, y) > p) continue;
        tessera(x, y, 0, TILE[tone], Math.round(x * 3.1 + y * 7.7));
      }
    }
    void k;
  }

  function serif(s: string, x: number, y: number, size: number, fill: string, stroke: string, align = "center", italic = false) {
    ctx.font = `${italic ? "italic " : ""}700 ${Math.round(size * u)}px ${SERIF}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.16 * u;
    ctx.strokeStyle = stroke;
    ctx.strokeText(s, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
  }

  /** Text that sets in word-tile by letter: letters appear left to right. */
  function setText(s: string, x: number, y: number, size: number, p: number, fill: string, stroke: string, align = "center") {
    if (p <= 0) return;
    const n = Math.ceil(s.length * clamp(p));
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${SERIF}`;
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    serif(s.slice(0, n), left, y, size, fill, stroke, "left");
    ctx.restore();
  }

  /** A pale stone plaque behind text, laid as tiles. */
  function plaque(x: number, y: number, w: number, h: number, p: number, tone: Tone = "ink") {
    lay(x, y, x + w, y + h, p, (px, py) => {
      const edge = px < x + S * 1.1 || px > x + w - S * 1.1 || py < y + S * 1.1 || py > y + h - S * 1.1;
      return edge ? (tone === "ink" ? "accent" : tone) : "ink";
    }, (px) => (px - x) / w);
  }

  return {
    surface() {
      const key = `${W}x${H}`;
      let tile = g.__mosaicGround.get(key);
      if (!tile) {
        tile = new OffscreenCanvas(W, H);
        const c = tile.getContext("2d");
        c.fillStyle = GROUT;
        c.fillRect(0, 0, W, H);
        const golds = ["#C9A13B", "#B58D2E", "#D8B24C", "#A98228", "#E1C062", "#BE9535"];
        const s = 12 * u;
        let k = 0;
        for (let row = 0, y = s / 2; y < H + s; row++, y += s * 0.92) {
          const wave = Math.sin(row * 0.4) * s * 0.3;
          for (let x = (row % 2) * s * 0.5 + wave; x < W + s; x += s * (0.9 + hash(k) * 0.25)) {
            k++;
            c.save();
            c.translate(x, y);
            c.rotate((hash(k * 1.3) - 0.5) * 0.25);
            const w = s * (0.7 + hash(k * 2.1) * 0.25);
            const h = s * (0.7 + hash(k * 3.7) * 0.15);
            c.fillStyle = golds[Math.floor(hash(k * 5.3) * golds.length)];
            c.fillRect(-w / 2, -h / 2, w, h);
            c.fillStyle = `rgba(255,240,190,${0.1 + hash(k * 7.1) * 0.25})`;
            c.fillRect(-w / 2, -h / 2, w, h * 0.3);
            c.restore();
          }
        }
        // The border: dark band, a row of white, a row of red diamonds.
        const b = 26 * u;
        c.fillStyle = "#3A332B";
        c.fillRect(0, 0, W, b);
        c.fillRect(0, H - b, W, b);
        c.fillRect(0, 0, b, H);
        c.fillRect(W - b, 0, b, H);
        for (let x = 0; x < W; x += s) {
          for (const y of [b * 0.3, H - b * 0.7]) {
            c.fillStyle = Math.floor(x / s) % 3 === 0 ? "#A8322C" : "#E9E2D2";
            c.fillRect(x + 1, y, s - 2, s - 2);
          }
        }
        for (let y = 0; y < H; y += s) {
          for (const x of [b * 0.3, W - b * 0.7]) {
            c.fillStyle = Math.floor(y / s) % 3 === 0 ? "#A8322C" : "#E9E2D2";
            c.fillRect(x, y + 1, s - 2, s - 2);
          }
        }
        c.strokeStyle = "#A8322C";
        c.lineWidth = 3 * u;
        c.strokeRect(b + 4 * u, b + 4 * u, W - 2 * b - 8 * u, H - 2 * b - 8 * u);
        g.__mosaicGround.set(key, tile);
      }
      ctx.drawImage(tile, 0, 0);
      // Light raking across: a soft band of glint drifting left to right.
      const gx = ((t * 0.12) % 1.4 - 0.2) * W;
      const sh = ctx.createLinearGradient(gx - W * 0.2, 0, gx + W * 0.2, H * 0.3);
      sh.addColorStop(0, "rgba(255,235,170,0)");
      sh.addColorStop(0.5, "rgba(255,235,170,0.16)");
      sh.addColorStop(1, "rgba(255,235,170,0)");
      ctx.fillStyle = sh;
      ctx.fillRect(0, 0, W, H);
    },
    title(s, o = {}) {
      const { x = 0.05, y = 0.1, size = 46, at = 0, dur = 0.9 } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${SERIF}`;
      const w = ctx.measureText(s).width + 40 * u;
      const h = size * 1.6 * u;
      plaque(X(x), Y(y) - h / 2, w, h, p * 1.6);
      setText(s, X(x) + 20 * u, Y(y), size, (p - 0.3) / 0.7, "#7E1F1A", "#F3EEE2", "left");
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, tone = "ink", align = "center" } = o;
      const p = progress(t, at, o.dur ?? 0.04 * s.length + 0.1);
      const fill = tone === "good" ? "#2C4C94" : tone === "accent" || tone === "bad" || tone === "ink" ? "#7E1F1A" : "#4A4238";
      setText(s, X(x), Y(y), size, p, fill, "#F3EEE2", align);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.35, tone = "accent" } = o;
      const R = r * u * 1.15;
      const cx = X(x);
      const cy = Y(y);
      const p = progress(t, at, dur);
      if (p <= 0) return;
      // Rings of tiles laid round the centre outward (andamento).
      tessera(cx, cy, 0, TILE[tone], cx + cy);
      for (let ring = 1; ring * S <= R; ring++) {
        const rr = ring * S;
        const n = Math.max(6, Math.round((Math.PI * 2 * rr) / S));
        const isEdge = (ring + 1) * S > R;
        for (let i = 0; i < n; i++) {
          if ((ring - 1 + i / n) / Math.max(1, R / S) > p * 1.05) continue;
          const a = (i / n) * Math.PI * 2;
          tessera(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, a + Math.PI / 2, isEdge ? TILE.ink : TILE[tone], ring * 31 + i + cx);
        }
      }
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      plaque(X(x), Y(y), X(w), Y(h), progress(t, at, dur), tone);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 64);
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot((pts[i] as Pt)[0] - (pts[i - 1] as Pt)[0], (pts[i] as Pt)[1] - (pts[i - 1] as Pt)[1]);
      const thin = !head;
      const step = thin ? S * 0.75 : S;
      const n = Math.floor((len / step) * p);
      const cols = TILE[tone === "ink" ? "accent" : tone];
      for (let k = 0; k <= n; k++) {
        const f = Math.min(pts.length - 1, Math.round(((k * step) / len) * (pts.length - 1)));
        const a = pts[f] as Pt;
        const b = (pts[Math.min(pts.length - 1, f + 1)] ?? a) as Pt;
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) || Math.atan2(pts.at(-1)![1] - pts[0]![1], pts.at(-1)![0] - pts[0]![0]);
        const nx = -Math.sin(ang);
        const ny = Math.cos(ang);
        if (thin) tessera(a[0], a[1], ang, cols, k * 13 + a[0], S * 0.6);
        else for (const off of [-0.5, 0.5]) tessera(a[0] + nx * off * S, a[1] + ny * off * S, ang, cols, k * 13 + off * 7 + a[0]);
      }
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-4) as Pt;
        const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        for (let r = 0; r < 3; r++) {
          for (let i = -r; i <= r; i++) {
            const back = (2 - r) * S * 0.9;
            const bx = end[0] - Math.cos(ang) * back - Math.sin(ang) * i * S;
            const by = end[1] - Math.sin(ang) * back + Math.cos(ang) * i * S;
            tessera(bx, by, ang, cols, r * 17 + i + end[0]);
          }
        }
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "good" } = o;
      const x0 = X(x);
      const y0 = Y(y);
      const x1 = X(x + w);
      const y1 = Y(y + h);
      const cx = (x0 + x1) / 2;
      const rx = (x1 - x0) / 2;
      const ry = rx * 0.32;
      lay(x0 - S, y0, x1 + S, y1, progress(t, at, dur), (px, py) => {
        const dx = (px - cx) / rx;
        if (Math.abs(dx) > 1) return null;
        const e = ry * Math.sqrt(1 - dx * dx);
        if (py < y0 + ry - e || py > y1 - ry + e) return null;
        const band = [0, 1, 2, 3].some((i) => Math.abs(py - (y0 + ry + ((y1 - y0 - 2 * ry) * i) / 3 + e)) < S * 0.6);
        if (py < y0 + ry + e) return "ink";
        return band ? "ink" : tone;
      }, (_, py) => 1 - (py - y0) / (y1 - y0));
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      const p = progress(t, at, 0.3);
      if (p <= 0) return;
      const value = count ? `${countTo(t, at, dur, count)}${s}` : s;
      const fill = tone === "good" ? "#2C4C94" : tone === "accent" ? "#2F6B3A" : "#7E1F1A";
      ctx.save();
      ctx.globalAlpha = p;
      if (sub) {
        const bw = size * 3.2 * u;
        const bh = size * 2.1 * u;
        plaque(X(x) - bw / 2, Y(y) - bh * 0.55, bw, bh, p * 2, "ink");
        serif(sub, X(x), Y(y) - size * 0.62 * u, size * 0.4, "#7E1F1A", "#F3EEE2");
        serif(value, X(x), Y(y) + size * 0.2 * u, size, fill, "#F3EEE2");
      } else serif(value, X(x), Y(y), size, fill, "#F3EEE2");
      ctx.restore();
      // A gold flash once the count lands.
      const f = clamp(1 - Math.abs(t - (at + dur + 0.1)) / 0.25);
      if (f > 0) {
        const gl = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), size * 2 * u);
        gl.addColorStop(0, `rgba(255,240,180,${0.5 * f})`);
        gl.addColorStop(1, "rgba(255,240,180,0)");
        ctx.fillStyle = gl;
        ctx.fillRect(X(x) - size * 2 * u, Y(y) - size * 2 * u, size * 4 * u, size * 4 * u);
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 36 } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      const path: Pt[] =
        kind === "check"
          ? [
              ...curve([cx - s * 0.6, cy], [cx - s * 0.15, cy + s * 0.45], 0, 3),
              ...curve([cx - s * 0.15, cy + s * 0.45], [cx + s * 0.7, cy - s * 0.6], 0, 6),
            ]
          : [...curve([cx - s * 0.5, cy - s * 0.5], [cx + s * 0.5, cy + s * 0.5], 0, 5), ...curve([cx + s * 0.5, cy - s * 0.5], [cx - s * 0.5, cy + s * 0.5], 0, 5)];
      const n = Math.ceil(path.length * p);
      const cols = kind === "check" ? ["#2F7A44", "#3A8C52", "#276A3A"] : TILE.bad;
      path.slice(0, n).forEach(([px, py], i) => {
        tessera(px, py, 0, ["#F3EEE2"], i + 99, S * 1.5);
        tessera(px, py, 0, cols, i + cx, S * 1.05);
      });
    },
    finish() {
      // Glint: a few tiles catch the light and flash.
      for (let i = 0; i < 14; i++) {
        const ph = (t * 0.7 + hash(i * 9.1)) % 1;
        const a = clamp(1 - Math.abs(ph - 0.5) * 8);
        if (a <= 0) continue;
        const gx = hash(i * 3.3) * W;
        const gy = hash(i * 5.7) * H;
        const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, 14 * u);
        gr.addColorStop(0, `rgba(255,250,220,${0.8 * a})`);
        gr.addColorStop(1, "rgba(255,250,220,0)");
        ctx.fillStyle = gr;
        ctx.fillRect(gx - 14 * u, gy - 14 * u, 28 * u, 28 * u);
      }
    },
  };
}

/** Counting, re-set like tiles: steps a little instead of rolling smoothly. */
function countTo(t: number, at: number, dur: number, [a, b]: [number, number]) {
  const p = clamp((t - at) / (dur || 1e-6));
  const e = p === 1 ? 1 : 1 - 2 ** (-10 * p);
  return Math.round(a + (b - a) * e).toLocaleString("en-US");
}

export default { id: "mosaic", name: "Byzantine mosaic", category: "Illustration", make } satisfies Style;
