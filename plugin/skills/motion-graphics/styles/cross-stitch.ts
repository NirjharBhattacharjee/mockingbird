// Counted cross-stitch on cream aida in a wooden hoop: every shape is a grid
// of floss Xs, top legs all leaning one way, outlined in backstitch. Things
// fill in cell by cell in chart order with the needle chasing the newest
// stitch, and lettering is worked in a 3x5 sampler alphabet.
import {
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

const FLOSS: Record<Tone, string> = {
  ink: "#2E3A6E",
  accent: "#E6A43A",
  good: "#3E9A8E",
  bad: "#C8323A",
  muted: "#8C8A96",
};
const AIDA = "#EAE1CC";

// A 3x5 sampler alphabet: five rows of three cells each.
const GLYPHS: Record<string, string> = {
  A: "010101111101101",
  B: "110101110101110",
  C: "011100100100011",
  D: "110101101101110",
  E: "111100110100111",
  F: "111100110100100",
  G: "011100101101011",
  H: "101101111101101",
  I: "111010010010111",
  J: "001001001101010",
  K: "101101110101101",
  L: "100100100100111",
  M: "101111111101101",
  N: "110101101101101",
  O: "010101101101010",
  P: "110101110100100",
  Q: "010101101111011",
  R: "110101110101101",
  S: "011100010001110",
  T: "111010010010010",
  U: "101101101101111",
  V: "101101101101010",
  W: "101101111111101",
  X: "101101010101101",
  Y: "101101010010010",
  Z: "111001010100111",
  "0": "111101101101111",
  "1": "010110010010111",
  "2": "110001010100111",
  "3": "110001010001110",
  "4": "101101111001001",
  "5": "111100110001110",
  "6": "011100111101111",
  "7": "111001010010010",
  "8": "111101111101111",
  "9": "111101111001110",
  "%": "101001010100101",
  "?": "110001010000010",
  ",": "000000000010100",
  ".": "000000000000010",
  "!": "010010010000010",
  "-": "000000111000000",
  ":": "000010000010000",
  "'": "010010000000000",
};

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  // The aida grid: every stitch lands on one of these cells.
  const C = Math.max(4, Math.round(9 * u));
  const snap = (v: number) => Math.round(v / C) * C;
  let needle: { x: number; y: number; color: string } | null = null;
  let needleAt = -1;
  const g = globalThis as any;
  g.__crossStitch ??= new Map();
  const cache: Map<string, any> = g.__crossStitch;
  // The hoop's opening.
  const hx = W / 2;
  const hy = H / 2;
  const rx = W * 0.5;
  const ry = H * 0.62;

  /** One X stitch in cell (cx, cy) pixel corner, with a little twist and sheen. */
  function cross(px: number, py: number, color: string) {
    const i = 1.2 * u;
    ctx.strokeStyle = color;
    ctx.lineWidth = C * 0.34;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px + i, py + C - i);
    ctx.lineTo(px + C - i, py + i);
    ctx.moveTo(px + i, py + i);
    ctx.lineTo(px + C - i, py + C - i);
    ctx.stroke();
    // The top leg's sheen, all leaning the same way.
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = C * 0.1;
    ctx.beginPath();
    ctx.moveTo(px + i * 1.5, py + i * 1.5);
    ctx.lineTo(px + C - i * 1.5, py + C - i * 1.5);
    ctx.stroke();
  }

  /** Stitch a list of cells in chart order from `at` over `dur`; the needle follows the newest. */
  function stitch(cells: Pt[], color: string, at: number, dur: number) {
    if (t < at || !cells.length) return;
    const order = [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const p = progress(t, at, dur);
    const n = Math.ceil(order.length * p);
    for (let k = 0; k < n; k++) {
      const [px, py] = order[k] as Pt;
      cross(px, py, color);
    }
    if (p < 1 && at >= needleAt) {
      const last = order[Math.max(0, n - 1)] as Pt;
      needle = { x: last[0] + C, y: last[1], color };
      needleAt = at;
    }
  }

  /** Backstitch: a line along grid holes, laid one hole at a time. */
  function backstitch(points: Pt[], color: string, at: number, dur: number, width = 0.28) {
    const p = progress(t, at, dur);
    if (p <= 0) return null;
    const holes: Pt[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1] as Pt;
      const b = points[i] as Pt;
      const k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / C));
      for (let j = i === 1 ? 0 : 1; j <= k; j++)
        holes.push([snap(a[0] + ((b[0] - a[0]) * j) / k), snap(a[1] + ((b[1] - a[1]) * j) / k)]);
    }
    const n = Math.max(2, Math.ceil(holes.length * p));
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = C * width;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < n && i < holes.length; i++) {
      const [x, y] = holes[i] as Pt;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    const end = holes[Math.min(n, holes.length) - 1] as Pt;
    if (p < 1 && at >= needleAt) {
      needle = { x: end[0], y: end[1], color };
      needleAt = at;
    }
    return { holes, done: p >= 1 };
  }

  /** The cells of a string in the sampler alphabet, `k` stitches per glyph cell, at pixel (x, y) top-left. */
  function textCells(s: string, x: number, y: number, k: number) {
    const cells: Pt[] = [];
    let cx = snap(x);
    const cy = snap(y);
    for (const ch of s.toUpperCase()) {
      const gl = GLYPHS[ch];
      if (gl) {
        for (let r = 0; r < 5; r++)
          for (let c = 0; c < 3; c++)
            if (gl[r * 3 + c] === "1")
              for (let a = 0; a < k; a++)
                for (let b = 0; b < k; b++)
                  cells.push([cx + (c * k + a) * C, cy + (r * k + b) * C]);
      }
      cx += 4 * k * C;
    }
    return { cells, w: cx - snap(x) - k * C, h: 5 * k * C };
  }

  /** Lettering sized near `size` units, aligned at (x, y) centre-left/centre/right, stitched in. */
  function letters(
    s: string,
    x: number,
    y: number,
    size: number,
    tone: Tone,
    align: string,
    at: number,
    dur?: number,
  ) {
    const k = Math.max(1, Math.round((size * u) / (5 * C)));
    const probe = textCells(s, 0, 0, k);
    const left = align === "center" ? x - probe.w / 2 : align === "right" ? x - probe.w : x;
    const { cells } = textCells(s, left, y - probe.h / 2, k);
    stitch(cells, FLOSS[tone], at, dur ?? (0.02 * cells.length) / k + 0.2);
    return probe.w;
  }

  /** Cells inside a circle. */
  function discCells(cx: number, cy: number, r: number) {
    const cells: Pt[] = [];
    const n = Math.ceil(r / C);
    const [ox, oy] = [snap(cx), snap(cy)];
    for (let i = -n; i <= n; i++)
      for (let j = -n; j <= n; j++)
        if (Math.hypot(i + 0.5, j + 0.5) <= r / C + 0.2) cells.push([ox + i * C, oy + j * C]);
    return cells;
  }

  return {
    surface() {
      const key = `${W}x${H}:${C}`;
      let img = cache.get(key);
      if (!img) {
        img = new OffscreenCanvas(W, H);
        const c = img.getContext("2d");
        c.fillStyle = AIDA;
        c.fillRect(0, 0, W, H);
        // The weave: lighter blocks with holes at the corners.
        c.fillStyle = "rgba(255,252,240,0.45)";
        for (let y = 0; y < H; y += C)
          for (let x = 0; x < W; x += C) c.fillRect(x + C * 0.18, y + C * 0.18, C * 0.64, C * 0.64);
        c.fillStyle = "rgba(120,100,70,0.22)";
        for (let y = 0; y < H; y += C)
          for (let x = 0; x < W; x += C) c.fillRect(x - 0.6 * u, y - 0.6 * u, 1.2 * u, 1.2 * u);
        const gr = c.createRadialGradient(hx, hy, 0, hx, hy, Math.max(rx, ry));
        gr.addColorStop(0, "rgba(255,255,255,0.12)");
        gr.addColorStop(1, "rgba(80,60,30,0.12)");
        c.fillStyle = gr;
        c.fillRect(0, 0, W, H);
        cache.set(key, img);
      }
      ctx.drawImage(img, 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.2, y = 0.1, size = 44, at = 0, tone = "bad", align = "left" } = o;
      letters(s, X(x), Y(y), size, tone, align, at, o.dur);
    },
    label(s, x, y, o = {}) {
      letters(
        s,
        X(x),
        Y(y),
        o.size ?? 30,
        o.tone ?? "ink",
        o.align ?? "center",
        o.at ?? 0,
        o.dur ?? 0.35,
      );
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.3, tone = "accent" } = o;
      const cells = discCells(X(x), Y(y), r * u);
      stitch(cells, FLOSS[tone], at, dur);
      if (t >= at + dur) {
        // A backstitch ring round the finished motif.
        const ring = Array.from({ length: 13 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return [
            X(x) + C / 2 + Math.cos(a) * (r * u + C * 0.6),
            Y(y) + C / 2 + Math.sin(a) * (r * u + C * 0.6),
          ] as Pt;
        });
        backstitch(ring, "#5A3A2A", at + dur, 0.15, 0.16);
      }
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      backstitch(
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
          [x0, y0],
        ],
        FLOSS[tone === "good" ? "ink" : tone],
        at,
        dur,
        0.32,
      );
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 12);
      const thin = !head && tone === "accent";
      const r = backstitch(
        pts,
        thin ? "rgba(46,58,110,0.45)" : FLOSS[tone],
        at,
        dur,
        thin ? 0.14 : 0.28,
      );
      if (!r?.done || !head) return;
      const end = pts.at(-1) as Pt;
      const prev = pts.at(-3) as Pt;
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = C * 2.4;
      backstitch(
        [
          [end[0] - Math.cos(a - 0.6) * s, end[1] - Math.sin(a - 0.6) * s],
          end,
          [end[0] - Math.cos(a + 0.6) * s, end[1] - Math.sin(a + 0.6) * s],
        ],
        FLOSS[tone],
        at + dur,
        0.12,
        0.28,
      );
    },
    store(x, y, w, h, o = {}) {
      // A banded drum stitched in rows, outlined in backstitch.
      const { at = 0, dur = 0.9, tone = "muted" } = o;
      const [x0, y0, x1, y1] = [snap(X(x)), snap(Y(y)), snap(X(x + w)), snap(Y(y + h))];
      const cells: Pt[] = [];
      const bands: Pt[] = [];
      const rows = Math.round((y1 - y0) / C);
      for (let r = 0; r < rows; r++) {
        const inset = r === 0 || r === rows - 1 ? 1 : 0;
        for (let xx = x0 + inset * C; xx < x1 - inset * C; xx += C)
          (r % 4 === 3 ? bands : cells).push([xx, y0 + r * C]);
      }
      stitch(cells, FLOSS[tone], at, dur * 0.8);
      stitch(bands, FLOSS.ink, at + dur * 0.1, dur * 0.7);
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      // Re-stitched as it counts: the digits appear at once, the last one still being worked.
      const w = letters(value, X(x), Y(y), size, tone, "center", at, 0.12);
      if (sub)
        letters(sub, X(x), Y(y) + size * 0.8 * u, size * 0.3, "good", "center", at + 0.3, 0.4);
      if (sub && t >= at + dur) {
        const ring = Array.from({ length: 25 }, (_, i) => {
          const a = (i / 24) * Math.PI * 2;
          return [X(x) + Math.cos(a) * (w / 2 + C * 3), Y(y) + Math.sin(a) * size * 0.75 * u] as Pt;
        });
        ctx.save();
        ctx.setLineDash([C * 1.2, C * 0.8]);
        backstitch(ring, FLOSS.bad, at + dur, 0.5, 0.2);
        ctx.restore();
      }
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const [cx, cy] = [X(x), Y(y)];
      const at = o.at ?? 0;
      const color = FLOSS[o.tone ?? (kind === "check" ? "good" : "bad")];
      const cells: Pt[] = [];
      const add = (a: Pt, b: Pt) => {
        const k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / C));
        for (let j = 0; j <= k; j++)
          cells.push([snap(a[0] + ((b[0] - a[0]) * j) / k), snap(a[1] + ((b[1] - a[1]) * j) / k)]);
      };
      if (kind === "check") {
        add([cx - s * 0.5, cy], [cx - s * 0.12, cy + s * 0.4]);
        add([cx - s * 0.12, cy + s * 0.4], [cx + s * 0.6, cy - s * 0.5]);
      } else {
        add([cx - s * 0.5, cy - s * 0.5], [cx + s * 0.5, cy + s * 0.5]);
        add([cx + s * 0.5, cy - s * 0.5], [cx - s * 0.5, cy + s * 0.5]);
      }
      stitch(cells, color, at, 0.3);
    },
    finish() {
      // The needle and its trailing floss.
      if (needle) {
        const { x, y, color } = needle;
        const bob = Math.sin(t * 20) * 3 * u;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6 * u;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 30 * u, y + 40 * u, x + 50 * u, y - 10 * u + bob);
        ctx.stroke();
        ctx.translate(x + 50 * u, y - 10 * u + bob);
        ctx.rotate(-0.9);
        ctx.fillStyle = "#C9CCD2";
        ctx.strokeStyle = "#6E727A";
        ctx.lineWidth = u;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(56 * u, -2.2 * u);
        ctx.lineTo(56 * u, 2.2 * u);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = AIDA;
        ctx.beginPath();
        ctx.ellipse(50 * u, 0, 3 * u, 1 * u, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // Linen outside the hoop, then the wooden hoop itself.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.ellipse(hx, hy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#8C857A";
      ctx.fill("evenodd");
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = "#5E584E";
      ctx.lineWidth = 2 * u;
      for (let i = 0; i < 30; i++) {
        ctx.beginPath();
        const yy = hash(i * 3.1) * H;
        ctx.moveTo(0, yy);
        ctx.bezierCurveTo(
          W * 0.3,
          yy + 40 * u,
          W * 0.7,
          yy - 40 * u,
          W,
          yy + (hash(i) - 0.5) * 60 * u,
        );
        ctx.stroke();
      }
      ctx.restore();
      for (const [w, col] of [
        [26, "#9A6A3A"],
        [20, "#D4A468"],
        [8, "#E9C48C"],
      ] as const) {
        ctx.beginPath();
        ctx.ellipse(hx, hy, rx + 10 * u, ry + 10 * u, 0, 0, Math.PI * 2);
        ctx.lineWidth = w * u;
        ctx.strokeStyle = col;
        ctx.stroke();
      }
    },
  };
}

export default {
  id: "cross-stitch",
  name: "Cross-stitch sampler",
  category: "Paper & Craft",
  make,
} satisfies Style;
