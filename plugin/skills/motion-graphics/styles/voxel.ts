// Toy voxel diorama: a chunky grass island floating on a warm peach sweep,
// every object built from three-tone cubes that fall from above and stack
// with a little bounce. Lettering is blocky pixel type on wooden tags.
import {
  clamp,
  counting,
  curve,
  easeIn,
  frame,
  hash,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

/** Top, front and side shade of a cube in each tone. */
const CUBE: Record<Tone, [string, string, string]> = {
  ink: ["#F4EEE2", "#D9CFBE", "#B8AC98"],
  accent: ["#FFA45C", "#F07F2E", "#C9621C"],
  good: ["#8CE0C4", "#45C29C", "#2F9C7C"],
  bad: ["#FF7A7A", "#E04848", "#B03434"],
  muted: ["#CFC6E8", "#A99EDA", "#8679BE"],
};
const BROWN = "#6B3F2A";
const CREAM = "#FFF6E6";
const GRASS: [string, string, string] = ["#97D158", "#6FAE3C", "#55902C"];
const DIRT: [string, string, string] = ["#A9714A", "#8A5636", "#6C4028"];
const MONO = '"Silkscreen", "Press Start 2P", Menlo, "Courier New", monospace';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__voxelText ??= new Map();
  const texts: Map<string, any> = g.__voxelText;

  /** One cube with its front face's top left at (x, y), side `s`. */
  function cube(x: number, y: number, s: number, [top, front, side]: [string, string, string]) {
    const d = s * 0.42;
    ctx.fillStyle = side;
    trace(
      ctx,
      [
        [x + s, y],
        [x + s + d, y - d],
        [x + s + d, y + s - d],
        [x + s, y + s],
      ],
      true,
    );
    ctx.fill();
    ctx.fillStyle = top;
    trace(
      ctx,
      [
        [x, y],
        [x + d, y - d],
        [x + s + d, y - d],
        [x + s, y],
      ],
      true,
    );
    ctx.fill();
    ctx.fillStyle = front;
    ctx.fillRect(x, y, s, s);
    // Ambient occlusion along the crease.
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(x, y + s * 0.82, s, s * 0.18);
  }

  /** How far a cube dropped at `at` has fallen: 0 high above, 1 landed (with a small bounce). */
  function fall(at: number, dur = 0.35) {
    const p = progress(t, at, dur);
    if (p <= 0) return -1;
    if (p < 0.75) return easeIn(p / 0.75);
    return 1 - Math.sin(((p - 0.75) / 0.25) * Math.PI) * 0.06;
  }

  /** Pixel lettering: drawn small, then scaled up without smoothing so the pixels show. */
  function pixels(s: string, x: number, y: number, size: number, color: string, align = "center") {
    const scale = Math.max(2, Math.round((size * u) / 13));
    const key = `${s}|${scale}|${color}|${Math.round(size * u)}`;
    let tex = texts.get(key);
    if (!tex) {
      const fs = Math.max(6, Math.round((size * u) / scale));
      const probe = new OffscreenCanvas(4, 4).getContext("2d") as any;
      probe.font = `700 ${fs}px ${MONO}`;
      const w = Math.ceil(probe.measureText(s).width) + 2;
      tex = new OffscreenCanvas(w, fs + 4);
      const c = tex.getContext("2d");
      c.font = `700 ${fs}px ${MONO}`;
      c.fillStyle = color;
      c.textBaseline = "middle";
      c.fillText(s, 1, (fs + 4) / 2);
      // Snap to hard pixels.
      const img = c.getImageData(0, 0, tex.width, tex.height);
      for (let i = 3; i < img.data.length; i += 4)
        img.data[i] = (img.data[i] as number) > 110 ? 255 : 0;
      c.putImageData(img, 0, 0);
      texts.set(key, tex);
    }
    const w = tex.width * scale;
    const h = tex.height * scale;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tex, Math.round(left), Math.round(y - h / 2), w, h);
    ctx.imageSmoothingEnabled = true;
    return w;
  }

  /** A wooden tag with pixel text: drops in from above. */
  function tag(
    s: string,
    cx: number,
    cy: number,
    size: number,
    fill: string,
    ink: string,
    at: number,
    align = "center",
  ) {
    const f = fall(at, 0.3);
    if (f < 0) return;
    const y = cy - (1 - f) * 60 * u;
    ctx.save();
    ctx.globalAlpha = clamp(f * 3);
    ctx.font = `700 ${Math.round(size * u)}px ${MONO}`;
    const w = ctx.measureText(s).width * 1.15 + size * 1.2 * u;
    const h = size * 1.6 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    ctx.fillStyle = "rgba(60,30,20,0.35)";
    ctx.fillRect(left + 4 * u, y - h / 2 + 4 * u, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(left, y - h / 2, w, h);
    ctx.strokeStyle = BROWN;
    ctx.lineWidth = 2 * u;
    ctx.strokeRect(left, y - h / 2, w, h);
    pixels(s, left + w / 2, y, size, ink);
    ctx.restore();
  }

  return {
    surface() {
      const bg = ctx.createRadialGradient(
        W * 0.5,
        H * 0.35,
        0,
        W * 0.5,
        H * 0.4,
        Math.max(W, H) * 0.75,
      );
      bg.addColorStop(0, "#FBE6D2");
      bg.addColorStop(1, "#E9B99A");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      // The floating island: a grass deck over a stepped dirt underside.
      const s = 34 * u;
      const top = H * 0.84;
      const cols = Math.ceil((W * 0.94) / s);
      const x0 = W * 0.03;
      // The grass deck seen from above, tiled in slightly different greens.
      const back = H * 0.16;
      const skew = (yy: number) => ((top - yy) / (top - back)) * W * 0.04;
      for (let yy = back, r = 0; yy < top - s * 0.4; yy += s * 0.6, r++)
        for (let i = 0; i < cols; i++) {
          ctx.fillStyle = hash(i * 1.3 + r * 7.1) > 0.5 ? "#9AD45E" : "#90CB55";
          ctx.fillRect(x0 + i * s + skew(yy), yy, s + 1, s * 0.6 + 1);
        }
      ctx.fillStyle = "rgba(110,60,40,0.15)";
      ctx.beginPath();
      ctx.ellipse(W * 0.5, H * 0.99, W * 0.4, H * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let row = 2; row >= 0; row--) {
        for (let i = row; i < cols - row; i++) {
          if (row > 0 && hash(i * 3.7 + row) < 0.35) continue;
          cube(x0 + i * s, top + s * (row + 0.6), s, DIRT);
        }
      }
      for (let i = 0; i < cols; i++) cube(x0 + i * s, top - s * 0.4, s, GRASS);
      // Flowers and pebbles dotted on the grass.
      for (let i = 0; i < 26; i++) {
        const fx = x0 + hash(i * 1.9) * cols * s;
        ctx.fillStyle = ["#F35E7A", "#FFD25A", "#FFFFFF", "#C99BFF"][i % 4] as string;
        ctx.fillRect(fx, top - s * 0.4 - hash(i) * s * 0.35, 6 * u, 6 * u);
      }
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 34, at = 0, align = "left" } = o;
      // Letters drop in one block at a time.
      const n = clamp((t - at) / (o.dur ?? 0.9)) * s.length;
      if (n <= 0) return;
      const shown = s.toUpperCase().slice(0, Math.ceil(n));
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${MONO}`;
      const full = ctx.measureText(s.toUpperCase()).width * 1.15 + size * u;
      const left = align === "center" ? X(x) - full / 2 : align === "right" ? X(x) - full : X(x);
      ctx.fillStyle = "rgba(255,246,230,0.85)";
      ctx.fillRect(left, Y(y) - size * 0.85 * u, full, size * 1.7 * u);
      ctx.strokeStyle = "rgba(107,63,42,0.4)";
      ctx.lineWidth = 2 * u;
      ctx.strokeRect(left, Y(y) - size * 0.85 * u, full, size * 1.7 * u);
      ctx.restore();
      pixels(shown, left + size * 0.5 * u, Y(y), size, BROWN, "left");
    },
    label(s, x, y, o = {}) {
      const tone = o.tone ?? "ink";
      const fill = tone === "ink" || tone === "muted" ? BROWN : CUBE[tone][1];
      tag(s.toUpperCase(), X(x), Y(y), o.size ?? 28, fill, CREAM, o.at ?? 0, o.align ?? "center");
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      // Four cubes stacked into one chunky block, landing one by one.
      const s = r * u * 0.85;
      const order: Pt[] = [
        [0, 1],
        [1, 1],
        [0, 0],
        [1, 0],
      ];
      for (const [i, [cx, cy]] of order.entries()) {
        const f = fall(at + i * 0.05, 0.3);
        if (f < 0) continue;
        ctx.save();
        ctx.globalAlpha = clamp(f * 4);
        cube(X(x) - s + cx * s, Y(y) - s + cy * s - (1 - f) * 220 * u, s, CUBE[tone]);
        ctx.restore();
      }
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "ink" } = o;
      // A screen: a frame of cubes falling into place round a cream panel.
      const s = 18 * u;
      const nx = Math.max(2, Math.round(X(w) / s));
      const ny = Math.max(2, Math.round(Y(h) / s));
      const ring: Pt[] = [];
      for (let i = 0; i < nx; i++) ring.push([i, ny - 1]);
      for (let j = ny - 2; j >= 0; j--) ring.push([nx - 1, j]);
      for (let i = nx - 2; i >= 0; i--) ring.push([i, 0]);
      for (let j = 1; j < ny - 1; j++) ring.push([0, j]);
      const done = progress(t, at + dur * 0.8, 0.2);
      if (done > 0) {
        ctx.fillStyle = CREAM;
        ctx.globalAlpha = done;
        ctx.fillRect(X(x) + s, Y(y) + s, (nx - 2) * s, (ny - 2) * s);
        ctx.globalAlpha = 1;
      }
      const colors = tone === "ink" ? CUBE.muted : CUBE[tone];
      for (const [k, [i, j]] of ring.entries()) {
        const f = fall(at + (k / ring.length) * dur * 0.8, 0.25);
        if (f < 0) continue;
        cube(X(x) + i * s, Y(y) + j * s - (1 - f) * 200 * u, s, colors);
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      if (t < at) return;
      // A chain of little cubes popping in along the path.
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 60);
      const len = Math.hypot(X(x2) - X(x1), Y(y2) - Y(y1)) * (1 + Math.abs(bend));
      const s = (head ? 9 : 5) * u;
      const n = Math.max(2, Math.floor(len / (s * 1.8)));
      const colors: [string, string, string] =
        tone === "ink" ? [BROWN, "#4E2C1D", "#3A2015"] : CUBE[tone];
      for (let i = 0; i <= n; i++) {
        if (progress(t, at + (i / n) * dur, 0.05) <= 0) break;
        const [px, py] = pts[Math.round((i / n) * (pts.length - 1))] as Pt;
        ctx.globalAlpha = head ? 1 : 0.55;
        cube(px - s / 2, py - s / 2, s, colors);
      }
      ctx.globalAlpha = 1;
      if (head && t >= at + dur) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-6) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        for (const side of [-1, 1])
          for (let k = 1; k <= 2; k++)
            cube(
              end[0] - Math.cos(a + side * 0.8) * k * s * 1.3 - s / 2,
              end[1] - Math.sin(a + side * 0.8) * k * s * 1.3 - s / 2,
              s,
              colors,
            );
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      // A crate tower built layer by layer from the ground up.
      const s = X(w) / 3;
      const rows = Math.max(1, Math.floor(Y(h) / s));
      let k = 0;
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < 3; col++) {
          const f = fall(at + (k++ / (rows * 3)) * dur, 0.3);
          if (f < 0) continue;
          const shade = (row + col) % 3 === 0 ? CUBE.accent : row % 2 ? CUBE.muted : CUBE.ink;
          cube(X(x) + col * s, Y(y + h) - (row + 1) * s - (1 - f) * 220 * u, s, shade);
        }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      const f = fall(at, 0.3);
      if (f < 0) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const cy = Y(y) - (1 - f) * 80 * u;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${MONO}`;
      const w = Math.max(ctx.measureText(`${value}0`).width * 1.15, size * 2.4 * u);
      const h = size * 1.35 * u;
      const fill = tone === "ink" ? CREAM : CUBE[tone][1];
      const ink = tone === "ink" ? BROWN : CREAM;
      ctx.fillStyle = CUBE[tone === "ink" ? "muted" : tone][2];
      ctx.fillRect(X(x) - w / 2 + 8 * u, cy - h / 2 + 8 * u, w, h);
      ctx.fillStyle = fill;
      ctx.fillRect(X(x) - w / 2, cy - h / 2, w, h);
      ctx.strokeStyle = BROWN;
      ctx.lineWidth = 3 * u;
      ctx.strokeRect(X(x) - w / 2, cy - h / 2, w, h);
      ctx.restore();
      pixels(value, X(x), cy, size * 0.8, ink);
      if (sub)
        tag(
          sub.toUpperCase(),
          X(x),
          cy - h / 2 - size * 0.25 * u,
          size * 0.26,
          BROWN,
          CREAM,
          at + 0.15,
        );
    },
    mark(kind, x, y, o = {}) {
      const s = ((o.size ?? 30) * u) / 3;
      const cells: Pt[] =
        kind === "check"
          ? [
              [0, 1],
              [1, 2],
              [2, 1],
              [3, 0],
            ]
          : [
              [0, 0],
              [2, 0],
              [1, 1],
              [0, 2],
              [2, 2],
            ];
      const colors = kind === "check" ? CUBE.good : CUBE.bad;
      for (const [i, [cx, cy]] of cells.entries()) {
        const f = fall((o.at ?? 0) + i * 0.05, 0.25);
        if (f < 0) continue;
        cube(X(x) - s * 1.5 + cx * s, Y(y) - s * 1.5 + cy * s - (1 - f) * 150 * u, s, colors);
      }
    },
    finish() {},
  };
}

export default {
  id: "voxel",
  name: "Voxel diorama",
  category: "Dimensional",
  make,
} satisfies Style;
