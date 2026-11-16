// A vintage survey sheet: warm map paper with a printed collar, soft grey
// hillshade, green woodland tint, brown contour lines with heavier index
// lines every fifth, blue water lines and a red dashed trail. Printed plate
// by plate: shade and woods first, then the contours rise level by level
// like a tide; trails walk themselves on; names land in serif capitals.
import {
  along,
  alpha,
  arrowhead,
  clamp,
  counting,
  curve,
  ellipse,
  expo,
  frame,
  hash,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const PAPER = "#EFE7D2";
const BROWN = "#9A6A44";
const INK = "#2E2A24";
const WATER = "#9CC3DA";
const WATER_LINE = "#3E7DB0";
const TONE: Record<Tone, string> = {
  ink: INK,
  accent: WATER_LINE,
  good: "#2F7A45",
  bad: "#C2352B",
  muted: "#8C8070",
};
const SERIF = '"Iowan Old Style", "Baskerville", "Palatino", Georgia, serif';
const LEVELS = 16;

/** The terrain: a few hills and hollows, 0-1 roughly. */
function height(x: number, y: number) {
  let h = 0.35 + 0.08 * Math.sin(x * 5.1 + 1) * Math.cos(y * 4.3);
  for (let i = 0; i < 7; i++) {
    const cx = hash(i * 3.7 + 1) * 1.2 - 0.1;
    const cy = hash(i * 5.3 + 2) * 1.2 - 0.1;
    const s = 0.08 + hash(i * 7.1) * 0.14;
    const a = (hash(i * 9.9) - 0.35) * 0.9;
    h += a * Math.exp(-((x - cx) ** 2 + ((y - cy) * 0.75) ** 2) / (2 * s * s));
  }
  return h;
}

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const serif = (size: number, style = "600") => `${style} ${Math.round(size * u)}px ${SERIF}`;
  const g = globalThis as any;
  g.__topoPlates ??= new Map();
  const cache: Map<string, any> = g.__topoPlates;

  function plates() {
    const key = `${W}x${H}`;
    let p = cache.get(key);
    if (p) return p;
    // shade and woods, once, at low resolution
    const sw = 256;
    const sh = Math.round((256 * H) / W);
    const shade = new OffscreenCanvas(sw, sh);
    const sc = shade.getContext("2d") as any;
    const img = sc.createImageData(sw, sh);
    let lo = 1e9;
    let hi = -1e9;
    const field: number[] = [];
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++) {
        const v = height(x / sw, (y / sh) * (H / W) * 1.6);
        field.push(v);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    for (let y = 1; y < sh - 1; y++)
      for (let x = 1; x < sw - 1; x++) {
        const i = y * sw + x;
        const dx = (field[i + 1] as number) - (field[i - 1] as number);
        const dy = (field[i + sw] as number) - (field[i - sw] as number);
        const light = clamp(0.5 + (-dx - dy) * 25);
        const v = ((field[i] as number) - lo) / (hi - lo);
        const wood =
          v > 0.32 && v < 0.55 && hash(Math.floor(x / 9) * 7 + Math.floor(y / 9) * 13) > 0.35;
        const k = i * 4;
        const shadeA = (1 - light) * 0.35;
        img.data[k] = wood ? 170 : 90;
        img.data[k + 1] = wood ? 200 : 80;
        img.data[k + 2] = wood ? 140 : 70;
        img.data[k + 3] = Math.round(255 * (wood ? 0.35 + shadeA * 0.5 : shadeA));
      }
    sc.putImageData(img, 0, 0);
    // contours by marching squares, one Path2D per level
    const gw = 160;
    const gh = Math.round((160 * H) / W);
    const hv = (x: number, y: number) =>
      (height(x / gw, (y / gh) * (H / W) * 1.6) - lo) / (hi - lo);
    const grid: number[][] = Array.from({ length: gh + 1 }, (_, y) =>
      Array.from({ length: gw + 1 }, (_, x) => hv(x, y)),
    );
    const cw = W / gw;
    const ch = H / gh;
    const levels: Path2D[] = [];
    for (let l = 1; l <= LEVELS; l++) {
      const iso = l / (LEVELS + 1);
      const path = new Path2D();
      for (let y = 0; y < gh; y++)
        for (let x = 0; x < gw; x++) {
          const a = grid[y]?.[x] as number;
          const b = grid[y]?.[x + 1] as number;
          const c = grid[y + 1]?.[x + 1] as number;
          const d = grid[y + 1]?.[x] as number;
          const pts: Pt[] = [];
          const edge = (v1: number, v2: number, p1: Pt, p2: Pt) => {
            if (v1 < iso !== v2 < iso) {
              const f = (iso - v1) / (v2 - v1);
              pts.push([(p1[0] + (p2[0] - p1[0]) * f) * cw, (p1[1] + (p2[1] - p1[1]) * f) * ch]);
            }
          };
          edge(a, b, [x, y], [x + 1, y]);
          edge(b, c, [x + 1, y], [x + 1, y + 1]);
          edge(c, d, [x + 1, y + 1], [x, y + 1]);
          edge(d, a, [x, y + 1], [x, y]);
          for (let k = 0; k + 1 < pts.length; k += 2) {
            path.moveTo((pts[k] as Pt)[0], (pts[k] as Pt)[1]);
            path.lineTo((pts[k + 1] as Pt)[0], (pts[k + 1] as Pt)[1]);
          }
        }
      levels.push(path);
    }
    p = { shade, levels };
    cache.set(key, p);
    return p;
  }

  function caps(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align = "center",
    style = "600",
  ) {
    ctx.save();
    ctx.font = serif(size, style);
    ctx.letterSpacing = style.includes("italic") ? "0px" : `${Math.round(size * 0.1 * u)}px`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4 * u;
    ctx.strokeStyle = alpha(PAPER, 0.85);
    const str = style.includes("italic") ? s : s.toUpperCase();
    ctx.strokeText(str, x, y);
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  /** A double-ruled cartouche panel. */
  function cartouche(x: number, y: number, w: number, h: number, a: number) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = alpha(PAPER, 0.94);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6 * u;
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 0.8 * u;
    ctx.strokeRect(x + 4 * u, y + 4 * u, w - 8 * u, h - 8 * u);
    ctx.restore();
  }

  return {
    surface() {
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      const { shade, levels } = plates();
      const sp = progress(t, 0, 0.8);
      ctx.save();
      ctx.globalAlpha = sp;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(shade, 0, 0, W, H);
      ctx.restore();
      // contours rising level by level
      const shown = Math.floor(progress(t, 0.4, 2.2) * LEVELS);
      ctx.save();
      for (let l = 0; l < shown; l++) {
        const index = (l + 1) % 5 === 0;
        ctx.strokeStyle = alpha(BROWN, index ? 0.8 : 0.5);
        ctx.lineWidth = (index ? 1.8 : 0.9) * u;
        ctx.stroke(levels[l]);
      }
      ctx.restore();
      // the printed collar: neat line, scale bar, north arrow
      const m0 = 14 * u;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(m0, m0, W - 2 * m0, H - 2 * m0);
      const [sx, sy] = [X(0.04), Y(0.94)];
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = k % 2 ? PAPER : INK;
        ctx.fillRect(sx + k * 30 * u, sy, 30 * u, 5 * u);
      }
      ctx.strokeRect(sx, sy, 120 * u, 5 * u);
      ctx.font = serif(11);
      ctx.fillStyle = INK;
      ctx.textAlign = "left";
      ctx.fillText("SCALE 1:24 000", sx + 130 * u, sy + 5 * u);
      ctx.beginPath();
      ctx.moveTo(X(0.965), Y(0.88));
      ctx.lineTo(X(0.965) - 7 * u, Y(0.88) + 24 * u);
      ctx.lineTo(X(0.965), Y(0.88) + 18 * u);
      ctx.closePath();
      ctx.fill();
      ctx.font = serif(13);
      ctx.textAlign = "center";
      ctx.fillText("N", X(0.965), Y(0.88) - 8 * u);
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.05, size = 36, at = 0 } = o;
      const p = expo(progress(t, at, 0.6));
      if (p <= 0) return;
      ctx.font = serif(size);
      ctx.letterSpacing = `${Math.round(size * 0.1 * u)}px`;
      const w = ctx.measureText(s.toUpperCase()).width + 36 * u;
      ctx.letterSpacing = "0px";
      const h = size * 1.7 * u;
      cartouche(X(x), Y(y), w, h, p);
      ctx.save();
      ctx.globalAlpha = p;
      caps(s, X(x) + 18 * u, Y(y) + h / 2, size, INK, "left");
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { size = 28, align = "center", tone = "ink", at = 0 } = o;
      const p = progress(t, at, 0.4);
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha = p;
      const hand = tone === "bad" || tone === "accent";
      caps(s, X(x), Y(y), hand ? size * 1.1 : size, TONE[tone], align, hand ? "italic 500" : "600");
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      // a survey hill: nested contour rings round a spot height
      const at = o.at ?? 0;
      const col = o.tone === "accent" || !o.tone ? BROWN : TONE[o.tone];
      const [cx, cy] = [X(x), Y(y)];
      const R = r * u;
      for (let k = 0; k < 3; k++) {
        const p = progress(t, at + k * 0.08, 0.3);
        if (p <= 0) continue;
        const rr = R * (1 - k * 0.3);
        const pts = ellipse(cx, cy, rr, rr * 0.85, 32).map(
          ([px, py], i) => [px + (hash(i + k * 40 + x * 99) - 0.5) * 2 * u, py] as Pt,
        );
        ctx.save();
        trace(ctx, pts.slice(0, Math.max(2, Math.round(pts.length * p))));
        if (k === 0 && p >= 1) {
          ctx.fillStyle = alpha(PAPER, 0.9);
          ctx.fill();
        }
        ctx.strokeStyle = col;
        ctx.lineWidth = (k === 0 ? 2.2 : 1.2) * u;
        ctx.stroke();
        ctx.restore();
      }
      if (progress(t, at + 0.2, 0.1) > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5 * u, 0, Math.PI * 2);
        ctx.fillStyle = o.tone === "bad" ? TONE.bad : INK;
        ctx.fill();
      }
    },
    box(x, y, w, h, o = {}) {
      const p = expo(progress(t, o.at, 0.5));
      if (p <= 0) return;
      cartouche(X(x), Y(y), X(w), Y(h), p);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.5, bend = 0, head = true, tone = "bad" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const { points: shown, angle } = along(pts, p);
      ctx.save();
      trace(ctx, shown);
      if (!head) {
        // streams in the net: thin blue water lines
        ctx.strokeStyle = alpha(WATER_LINE, 0.55);
        ctx.lineWidth = 1 * u;
        ctx.stroke();
      } else {
        // a dashed trail walking itself on
        ctx.setLineDash([9 * u, 6 * u]);
        ctx.strokeStyle = tone === "accent" ? WATER_LINE : tone === "ink" ? INK : TONE[tone];
        ctx.lineWidth = 3 * u;
        ctx.stroke();
        ctx.setLineDash([]);
        const tip = shown.at(-1) as Pt;
        if (p < 1) {
          ctx.beginPath();
          ctx.arc(tip[0], tip[1], 5 * u, 0, Math.PI * 2);
          ctx.fillStyle = TONE.bad;
          ctx.fill();
        } else {
          arrowhead(ctx, tip, angle, 13 * u);
          ctx.lineWidth = 2.5 * u;
          ctx.stroke();
        }
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      // a lake, with water lines rippling in from the shore
      const at = o.at ?? 0;
      const p = expo(progress(t, at, o.dur ?? 0.8));
      if (p <= 0) return;
      const [cx, cy] = [X(x + w / 2), Y(y + h / 2)];
      const [rx, ry] = [X(w) * 0.62, Y(h) * 0.55];
      const shore = (k: number) =>
        ellipse(cx, cy, rx * k, ry * k, 48).map(([px, py], i) => {
          const a = (i / 48) * Math.PI * 2;
          const wob = 1 + Math.sin(a * 3 + 1) * 0.08 + Math.sin(a * 5) * 0.05;
          return [cx + (px - cx) * wob, cy + (py - cy) * wob] as Pt;
        });
      ctx.save();
      ctx.globalAlpha = p;
      trace(ctx, shore(1), true);
      ctx.fillStyle = WATER;
      ctx.fill();
      ctx.strokeStyle = WATER_LINE;
      ctx.lineWidth = 1.8 * u;
      ctx.stroke();
      for (let k = 1; k <= 3; k++) {
        if (progress(t, at + k * 0.15, 0.2) <= 0) continue;
        trace(ctx, shore(1 - k * 0.18), true);
        ctx.strokeStyle = alpha(WATER_LINE, 0.5);
        ctx.lineWidth = 0.9 * u;
        ctx.stroke();
      }
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "ink" } = o;
      const p = expo(progress(t, at, 0.4));
      if (p <= 0) return;
      const str = count ? counting(t, at, dur, count) + s : s;
      const [cx, cy] = [X(x), Y(y)];
      if (sub) {
        ctx.font = serif(size, "700");
        const w = ctx.measureText(`${count ? count[1] : ""}${s}`).width + 50 * u;
        const h = size * 1.9 * u;
        cartouche(cx - w / 2, cy - h / 2, w, h, p);
      }
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = serif(size, "700");
      ctx.fillStyle = sub ? TONE.bad : tone === "good" ? TONE.good : INK;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(str, cx, cy - (sub ? size * 0.15 * u : 0));
      if (sub) {
        ctx.font = serif(size * 0.3, "italic 500");
        ctx.fillStyle = INK;
        ctx.fillText(sub, cx, cy + size * 0.58 * u);
      }
      ctx.restore();
    },
    mark(kind, x, y, o = {}) {
      const p = progress(t, o.at, 0.3);
      if (p <= 0) return;
      const r = (o.size ?? 22) * u;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = kind === "check" ? WATER_LINE : TONE.bad;
      ctx.lineWidth = 3.2 * u;
      const pts: Pt[] =
        kind === "check"
          ? [
              [cx - r * 0.6, cy],
              [cx - r * 0.15, cy + r * 0.5],
              [cx + r * 0.7, cy - r * 0.7],
            ]
          : [
              [cx - r * 0.5, cy - r * 0.5],
              [cx + r * 0.5, cy + r * 0.5],
            ];
      trace(ctx, along(pts, p).points);
      ctx.stroke();
      if (kind === "cross" && p > 0.5) {
        trace(ctx, [
          [cx + r * 0.5, cy - r * 0.5],
          [cx - r * 0.5, cy + r * 0.5],
        ]);
        ctx.stroke();
      }
      ctx.restore();
    },
    finish() {},
  };
}

export default {
  id: "topographic",
  name: "Survey map",
  category: "Data & Information",
  make,
} satisfies Style;
