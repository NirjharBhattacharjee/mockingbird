// The red drawing toy: a silver-grey screen in a glossy red plastic case
// with two white knobs. Everything is one thin dark line that only moves
// sideways or up and down: slants and curves come out as little stairs, and
// letters are a single stroke with travel lines between them. The knobs turn
// with the stylus.
import {
  along,
  type Cue,
  counting,
  curve,
  ellipse,
  frame,
  hash,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const LINE: Record<Tone, number> = { ink: 1, accent: 1, good: 1, bad: 1, muted: 0.55 };

// A single-stroke capital font on a 4 x 6 grid: each glyph is strokes
// separated by "|", each point two digits (x, y, y down).
const GLYPH: Record<string, string> = {
  A: "06 01 10 30 41 46|03 43",
  B: "06 00 30 41 42 33 03|33 44 45 36 06",
  C: "40 00 06 46",
  D: "00 06 36 45 41 30 00",
  E: "40 00 06 46|03 33",
  F: "40 00 06|03 33",
  G: "40 00 06 46 43 23",
  H: "00 06|40 46|03 43",
  I: "00 40|20 26|06 46",
  J: "40 45 36 16 05",
  K: "00 06|40 03 46",
  L: "00 06 46",
  M: "06 00 23 40 46",
  N: "06 00 46 40",
  O: "00 40 46 06 00",
  P: "06 00 40 43 03",
  Q: "00 40 46 06 00|24 46",
  R: "06 00 40 43 03|13 46",
  S: "40 00 03 43 46 06",
  T: "00 40|20 26",
  U: "00 06 46 40",
  V: "00 26 40",
  W: "00 06 23 46 40",
  X: "00 46|40 06",
  Y: "00 23 40|23 26",
  Z: "00 40 06 46",
  "0": "00 40 46 06 00",
  "1": "10 20 26|06 46",
  "2": "00 40 43 03 06 46",
  "3": "00 40 46 06|03 43",
  "4": "00 03 43|40 46",
  "5": "40 00 03 43 46 06",
  "6": "40 00 06 46 43 03",
  "7": "00 40 46",
  "8": "00 40 46 06 00|03 43",
  "9": "43 03 00 40 46 06",
  "%": "00 10 11 01 00|35 45 46 36 35|40 06",
  "?": "01 00 40 43 23 24|25 26",
  ".": "25 26",
  ",": "25 27",
  "!": "20 24|25 26",
  "-": "03 43",
};

/** Turn every slanted step into a sideways move then a vertical one, `step` pixels at a time. */
function stairs(points: Pt[], step: number): Pt[] {
  const out: Pt[] = [points[0] as Pt];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1] as Pt;
    const [x1, y1] = points[i] as Pt;
    const dx = x1 - x0;
    const dy = y1 - y0;
    if (Math.abs(dx) < 0.5 || Math.abs(dy) < 0.5) {
      out.push([x1, y1]);
      continue;
    }
    const n = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / step));
    for (let k = 1; k <= n; k++) {
      out.push([x0 + (dx * k) / n, y0 + (dy * (k - 1)) / n]);
      out.push([x0 + (dx * k) / n, y0 + (dy * k) / n]);
    }
  }
  return out;
}

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__etch ??= new Map();
  const cache: Map<string, any> = g.__etch;
  let stylus: { at: number; pt: Pt } | null = null;
  const side = 0.04 * W;
  const top = 0.05 * H;
  const bottom = 0.12 * H;

  /** Scratch a path through the aluminium powder from `at` over `dur`. */
  function etch(points: Pt[], { at = 0, dur = 0.5, tone = "ink" as Tone } = {}) {
    const p = progress(t, at, dur);
    if (p <= 0) return;
    const { points: drawn } = along(stairs(points, 2.4 * u), p);
    ctx.save();
    ctx.strokeStyle = `rgba(48,50,52,${0.85 * LINE[tone]})`;
    ctx.lineWidth = 1.7 * u;
    ctx.lineJoin = "miter";
    trace(ctx, drawn);
    ctx.stroke();
    ctx.restore();
    if (!stylus || at >= stylus.at) stylus = { at, pt: drawn.at(-1) as Pt };
  }

  /** A string as one continuous line: glyph strokes joined by travel lines. */
  function glyphs(s: string, x: number, y: number, size: number, align = "left") {
    const h = size * 0.75 * u;
    const k = h / 6;
    const adv = k * 5.4;
    const text = s.toUpperCase();
    const w = text.length * adv - k * 1.4;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    const y0 = Y(y) - h / 2;
    const base = y0 + h + k * 0.8;
    const pts: Pt[] = [[left, base]];
    // Between strokes the stylus drops to a line under the text, slides along it and climbs back up.
    const go = (p: Pt) => {
      const last = pts.at(-1) as Pt;
      if (Math.abs(last[0] - p[0]) > 0.5 && Math.abs(last[1] - p[1]) > 0.5)
        pts.push([last[0], base], [p[0], base]);
      pts.push(p);
    };
    for (const [i, ch] of [...text].entries()) {
      const g0 = GLYPH[ch];
      const ox = left + i * adv;
      if (!g0) continue;
      for (const stroke of g0.split("|"))
        for (const [j, pair] of stroke.split(" ").entries()) {
          const p: Pt = [ox + Number(pair[0]) * k, y0 + Number(pair[1]) * k];
          j ? pts.push(p) : go(p);
        }
    }
    go([left + w, base]);
    return { pts, w, left, h };
  }

  function write(s: string, x: number, y: number, o: Cue & { size?: number; align?: string } = {}) {
    const { at = 0, size = 34, tone = "ink", align = "left" } = o;
    const g0 = glyphs(s, x, y, size, align);
    etch(g0.pts, { at, dur: o.dur ?? 0.07 * s.length + 0.15, tone });
    return g0;
  }

  function screen() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      const gr = b.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0, "#D3D4CF");
      gr.addColorStop(1, "#B9BAB5");
      b.fillStyle = gr;
      b.fillRect(0, 0, W, H);
      for (let i = 0; i < (W * H) / 40; i++) {
        b.fillStyle = hash(i * 1.3) > 0.5 ? "rgba(255,255,255,0.10)" : "rgba(60,60,60,0.07)";
        b.fillRect(hash(i * 0.7) * W, hash(i * 1.9 + 2) * H, u, u);
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  return {
    surface() {
      screen();
    },
    title(s, o = {}) {
      const { x = 0.07, y = 0.12, size = 66, at = 0 } = o;
      // The travel line under the letters doubles as the underline.
      write(s, x, y, { ...o, size, at, align: o.align ?? "left" });
    },
    label(s, x, y, o = {}) {
      write(s, x, y, { size: 36, align: "center", ...o });
    },
    node(x, y, r, o = {}) {
      etch(ellipse(X(x), Y(y), r * u, r * u, 16), { dur: 0.25, ...o });
    },
    box(x, y, w, h, o = {}) {
      const a: Pt = [X(x), Y(y)];
      const b: Pt = [X(x + w), Y(y + h)];
      etch([a, [b[0], a[1]], b, [a[0], b[1]], a], { dur: 0.6, ...o });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true } = o;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 12);
      const end = shaft.at(-1) as Pt;
      const prev = shaft.at(-2) as Pt;
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 14 * u;
      // The head is drawn without lifting: out to one barb, back, out to the other.
      const barbs: Pt[] = head
        ? [
            [end[0] - Math.cos(a - 0.6) * s, end[1] - Math.sin(a - 0.6) * s],
            end,
            [end[0] - Math.cos(a + 0.6) * s, end[1] - Math.sin(a + 0.6) * s],
          ]
        : [];
      etch([...shaft, ...barbs], { ...o, at, dur });
    },
    store(x, y, w, h, o = {}) {
      // A drum as a stack of boxy rings, one line all the way.
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const pts: Pt[] = [];
      const n = 3;
      for (let i = 0; i < n; i++) {
        const a = y0 + ((y1 - y0) * i) / n;
        const b = y0 + ((y1 - y0) * (i + 1)) / n;
        pts.push([x0, a], [x1, a], [x1, b], [x0, b], [x0, a]);
      }
      etch(pts, { dur: 0.9, ...o });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      // Numbers are redrawn as they count, so they appear at once; big ones get a frame.
      const gw = write(value, x, y, { at, dur: 0.01, size: size * 0.9, align: "center" });
      if (size >= 80) {
        const pad = 14 * u;
        const bx = X(x) - gw.w / 2 - pad;
        const by = Y(y) - gw.h / 2 - pad;
        etch(
          [
            [bx, by],
            [bx + gw.w + pad * 2, by],
            [bx + gw.w + pad * 2, by + gw.h + pad * 2],
            [bx, by + gw.h + pad * 2],
            [bx, by],
          ],
          { at, dur: 0.5 },
        );
      }
      if (sub)
        write(sub, x, y - (size * 0.75 * u) / H, {
          at: at + 0.3,
          size: size * 0.3,
          align: "center",
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 30) * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check")
        etch(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.1, cy + s * 0.4],
            [cx + s * 0.6, cy - s * 0.5],
          ],
          { dur: 0.3, ...o },
        );
      else
        etch(
          [
            [cx - s * 0.5, cy - s * 0.5],
            [cx + s * 0.5, cy + s * 0.5],
            [cx + s * 0.5, cy - s * 0.5],
            [cx - s * 0.5, cy + s * 0.5],
          ],
          { dur: 0.3, ...o },
        );
    },
    finish() {
      const sp = stylus as { at: number; pt: Pt } | null;
      // The case: glossy red plastic round the screen, drawn over everything.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.roundRect(side, top, W - side * 2, H - top - bottom, 18 * u);
      const red = ctx.createLinearGradient(0, 0, 0, H);
      red.addColorStop(0, "#E8262B");
      red.addColorStop(0.5, "#C8141B");
      red.addColorStop(1, "#A50D13");
      ctx.fillStyle = red;
      ctx.fill("evenodd");
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 3 * u;
      ctx.beginPath();
      ctx.roundRect(side * 0.35, top * 0.3, W - side * 0.7, H - top * 0.3 - bottom * 0.15, 30 * u);
      ctx.stroke();
      // Hard highlights on the plastic.
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(side * 0.6, top * 0.35, W * 0.4, 3 * u);
      ctx.fillRect(side * 0.3, H * 0.2, 3 * u, H * 0.3);
      ctx.strokeStyle = "rgba(90,0,0,0.5)";
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.roundRect(side, top, W - side * 2, H - top - bottom, 18 * u);
      ctx.stroke();
      // Knobs that turn with the stylus.
      const [sx, sy] = sp ? sp.pt : [W / 2, H / 2];
      const R = bottom * 0.36;
      for (const [kx, angle] of [
        [side * 1.6, sx / (8 * u)],
        [W - side * 1.6, sy / (8 * u)],
      ] as const) {
        const ky = H - bottom / 2;
        ctx.shadowColor = "rgba(0,0,0,0.4)";
        ctx.shadowBlur = 8 * u;
        ctx.shadowOffsetY = 4 * u;
        const kg = ctx.createRadialGradient(kx - R * 0.3, ky - R * 0.3, 0, kx, ky, R);
        kg.addColorStop(0, "#FFFFFF");
        kg.addColorStop(1, "#CFCFCF");
        ctx.fillStyle = kg;
        ctx.beginPath();
        ctx.arc(kx, ky, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = u;
        for (let i = 0; i < 24; i++) {
          const a = angle + (i / 24) * Math.PI * 2;
          trace(ctx, [
            [kx + Math.cos(a) * R * 0.82, ky + Math.sin(a) * R * 0.82],
            [kx + Math.cos(a) * R, ky + Math.sin(a) * R],
          ]);
          ctx.stroke();
        }
      }
      ctx.restore();
      if (sp) {
        ctx.fillStyle = "#2A2B2C";
        ctx.fillRect(sp.pt[0] - 1.5 * u, sp.pt[1] - 1.5 * u, 3 * u, 3 * u);
      }
    },
  };
}

export default {
  id: "etch-sketch",
  name: "Line-drawing toy",
  category: "Hand-drawn",
  make,
} satisfies Style;
