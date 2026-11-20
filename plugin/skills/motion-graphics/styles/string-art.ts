// String art on a walnut board: brass nails tapped in first, then cotton
// thread wound chord by chord so curves appear as envelopes of straight
// lines. Words are burned in with a travelling ember; labels are kraft tags
// pinned with a nail; numbers are strung as seven-segment digits.
import {
  alpha,
  clamp,
  counting,
  curve,
  expo,
  frame,
  hash,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
} from "./look.ts";

const THREAD: Record<Tone, string> = {
  ink: "#F4EEDC",
  accent: "#F4EEDC",
  good: "#E9BC4C",
  bad: "#C8372D",
  muted: "#B9A27E",
};
const BURN = "#2B160B";
const KRAFT = "#D9B886";
const HAND = '"Caveat", "Noto Color Emoji", cursive';

/** Seven-segment layout: which segments (a-g) each digit lights. */
const SEGMENTS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgedc",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
};

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__stringArt ??= new Map();
  const cache: Map<string, any> = g.__stringArt;
  let ember: Pt | null = null;

  /** The walnut board with its grain, made once per size. */
  function board() {
    const key = `${W}x${H}`;
    let tex = cache.get(key);
    if (tex) return tex;
    tex = new OffscreenCanvas(W, H);
    const c = tex.getContext("2d");
    const base = c.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, "#7A4A2A");
    base.addColorStop(1, "#5E3720");
    c.fillStyle = base;
    c.fillRect(0, 0, W, H);
    // Grain: long wavy lines, darker and lighter, bunched round a few knots.
    for (let i = 0; i < 160; i++) {
      const y0 = hash(i * 1.37) * H;
      c.strokeStyle =
        hash(i * 2.1) > 0.5
          ? `rgba(40,20,8,${0.08 + hash(i) * 0.12})`
          : `rgba(170,110,60,${0.05 + hash(i) * 0.08})`;
      c.lineWidth = (0.6 + hash(i * 3.3) * 2) * u;
      c.beginPath();
      for (let x = 0; x <= W; x += 16 * u) {
        const knot =
          Math.exp(-(((x - W * 0.62) / (W * 0.15)) ** 2)) * Math.sin((y0 / H) * 9) * 40 * u;
        const y = y0 + Math.sin(x / (W * 0.25) + i) * 10 * u + knot;
        x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    }
    // Plank seams.
    c.fillStyle = "rgba(25,12,5,0.45)";
    for (const y of [0.33, 0.66]) c.fillRect(0, H * y, W, 2 * u);
    const v = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.35)");
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
    cache.set(key, tex);
    return tex;
  }

  /** A brass nail head, tapped in: pops from slightly big. */
  function nail(x: number, y: number, at: number, size = 3.2) {
    const p = progress(t, at, 0.12);
    if (p <= 0) return;
    const r = size * u * (1 + (1 - p) * 0.8);
    ctx.fillStyle = "rgba(20,10,4,0.45)";
    ctx.beginPath();
    ctx.arc(x + r * 0.5, y + r * 0.6, r, 0, Math.PI * 2);
    ctx.fill();
    const gr = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    gr.addColorStop(0, "#FFF0B8");
    gr.addColorStop(0.5, "#C9A24A");
    gr.addColorStop(1, "#6E5320");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** One taut thread between two points with a faint cast shadow, drawn out to `p`. */
  function thread(a: Pt, b: Pt, p: number, color: string, width = 1.3) {
    if (p <= 0) return;
    const e: Pt = [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(20,8,2,0.35)";
    ctx.lineWidth = width * u;
    ctx.beginPath();
    ctx.moveTo(a[0] + 2 * u, a[1] + 3 * u);
    ctx.lineTo(e[0] + 2 * u, e[1] + 3 * u);
    ctx.stroke();
    ctx.strokeStyle = alpha(color, 0.92);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(e[0], e[1]);
    ctx.stroke();
  }

  /** Wind a list of chords one after another from `at` over `dur`. */
  function wind(chords: [Pt, Pt][], at: number, dur: number, color: string, width = 1.3) {
    const n = chords.length;
    for (const [i, [a, b]] of chords.entries())
      thread(a, b, clamp(((t - at) / dur) * n - i), color, width);
  }

  /** Pyrography: text burned left to right with an ember at the edge. */
  function burn(
    s: string,
    x: number,
    y: number,
    size: number,
    at: number,
    o: { align?: string; color?: string; dur?: number } = {},
  ) {
    const { align = "left", color = BURN } = o;
    const dur = o.dur ?? 0.04 * s.length + 0.2;
    const p = progress(t, at, dur);
    if (p <= 0) return 0;
    ctx.save();
    ctx.font = `italic 700 ${Math.round(size * u)}px ${HAND}`;
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 4 * u, y - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(255,150,60,0.25)";
    ctx.shadowBlur = 3 * u;
    ctx.fillText(s, left, y);
    ctx.restore();
    if (p < 1) ember = [left + w * p, y];
    return w;
  }

  /** A kraft tag nailed to the board, with burned text. */
  function tag(
    s: string,
    cx: number,
    cy: number,
    size: number,
    tone: Tone,
    at: number,
    align = "center",
  ) {
    const p = progress(t, at, 0.2);
    if (p <= 0) return;
    ctx.save();
    ctx.font = `italic 700 ${Math.round(size * u)}px ${HAND}`;
    const w = ctx.measureText(s).width + size * 1.1 * u;
    const h = size * 1.6 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    ctx.translate(cx, cy - h / 2);
    ctx.rotate((hash(cx + cy) - 0.5) * 0.06 + (1 - expo(p)) * 0.25);
    ctx.translate(-cx, -(cy - h / 2));
    ctx.globalAlpha = clamp(p * 3);
    ctx.fillStyle = "rgba(20,8,2,0.4)";
    ctx.fillRect(left + 3 * u, cy - h / 2 + 4 * u, w, h);
    ctx.fillStyle = tone === "bad" ? "#C0392B" : KRAFT;
    ctx.fillRect(left, cy - h / 2, w, h);
    ctx.fillStyle = tone === "bad" ? "#FBE9D8" : BURN;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + w / 2, cy + 2 * u);
    ctx.restore();
    nail(cx, cy - h / 2 + 4 * u, at, 2.6);
  }

  /** Seven-segment digits strung between nails, centred on (cx, cy). Returns the width. */
  function digits(s: string, cx: number, cy: number, size: number, at: number, color: string) {
    const dw = size * 0.5 * u;
    const dh = size * u;
    const gap = size * 0.16 * u;
    // Digits, % and - are strung in thread; "." and "," are a nail; anything else
    // (a unit, a currency sign) is written as text rather than dropped.
    const font = `600 ${Math.round(size * 0.55 * u)}px ${HAND}`;
    ctx.save();
    ctx.font = font;
    const advance = (ch: string) =>
      ch in SEGMENTS || ch === "%" || ch === "-"
        ? dw + gap
        : ch === "." || ch === "," || ch === " "
          ? gap * 0.8
          : ctx.measureText(ch).width + gap;
    const width = [...s].reduce((sum, ch) => sum + advance(ch), 0);
    ctx.restore();
    let x = cx - width / 2;
    const top = cy - dh / 2;
    for (const [k, ch] of [...s].entries()) {
      const when = at + k * 0.05;
      if (ch in SEGMENTS) {
        const P: Record<string, [Pt, Pt]> = {
          a: [
            [x, top],
            [x + dw, top],
          ],
          b: [
            [x + dw, top],
            [x + dw, top + dh / 2],
          ],
          c: [
            [x + dw, top + dh / 2],
            [x + dw, top + dh],
          ],
          d: [
            [x, top + dh],
            [x + dw, top + dh],
          ],
          e: [
            [x, top + dh / 2],
            [x, top + dh],
          ],
          f: [
            [x, top],
            [x, top + dh / 2],
          ],
          g: [
            [x, top + dh / 2],
            [x + dw, top + dh / 2],
          ],
        };
        for (const seg of SEGMENTS[ch] as string) {
          const [a, b] = P[seg] as [Pt, Pt];
          // Each segment is several wraps of thread.
          for (let w = 0; w < 3; w++)
            thread(
              [a[0], a[1] + (w - 1) * u],
              [b[0], b[1] + (w - 1) * u],
              progress(t, when, 0.2),
              color,
              1.6,
            );
        }
        for (const pt of [
          [x, top],
          [x + dw, top],
          [x, top + dh / 2],
          [x + dw, top + dh / 2],
          [x, top + dh],
          [x + dw, top + dh],
        ] as Pt[])
          nail(pt[0], pt[1], when, 2.4);
        x += dw + gap;
      } else if (ch === "%") {
        thread([x + dw, top], [x, top + dh], progress(t, when, 0.2), color, 2);
        for (const [rx, ry] of [
          [x + dw * 0.2, top + dh * 0.2],
          [x + dw * 0.8, top + dh * 0.8],
        ] as Pt[]) {
          const ring: Pt[] = Array.from({ length: 6 }, (_, i) => [
            rx + Math.cos((i / 6) * Math.PI * 2) * dw * 0.18,
            ry + Math.sin((i / 6) * Math.PI * 2) * dw * 0.18,
          ]);
          wind(
            ring.map((p, i) => [p, ring[(i + 2) % 6] as Pt] as [Pt, Pt]),
            when,
            0.2,
            color,
            1.2,
          );
          for (const p of ring) nail(p[0], p[1], when, 1.8);
        }
        x += dw + gap;
      } else if (ch === "-") {
        thread([x, top + dh / 2], [x + dw, top + dh / 2], progress(t, when, 0.2), color, 2);
        nail(x, top + dh / 2, when, 2.4);
        nail(x + dw, top + dh / 2, when, 2.4);
        x += dw + gap;
      } else if (ch === "." || ch === "," || ch === " ") {
        if (ch !== " ") nail(x, top + dh, when, 2.8);
        x += gap * 0.8;
      } else {
        ctx.save();
        ctx.font = font;
        ctx.globalAlpha = progress(t, when, 0.2);
        ctx.fillStyle = color;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(ch, x, top + dh);
        ctx.restore();
        x += advance(ch);
      }
    }
    return width;
  }

  return {
    surface() {
      ember = null;
      ctx.drawImage(board(), 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 44, at = 0, align = "left" } = o;
      burn(s, X(x), Y(y), size, at, { align, dur: o.dur });
    },
    label(s, x, y, o = {}) {
      tag(s, X(x), Y(y), o.size ?? 26, o.tone ?? "ink", o.at ?? 0, o.align ?? "center");
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      if (t < at) return;
      // A ring of nails strung as a star: an envelope of chords.
      const R = r * u;
      const n = 10;
      const ring: Pt[] = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return [X(x) + Math.cos(a) * R, Y(y) + Math.sin(a) * R];
      });
      wind(
        ring.map((p, i) => [p, ring[(i + 4) % n] as Pt] as [Pt, Pt]),
        at + 0.12,
        dur,
        THREAD[tone === "accent" ? "good" : tone],
        1,
      );
      for (const [i, p] of ring.entries()) nail(p[0], p[1], at + i * 0.012, 2.2);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "ink" } = o;
      if (t < at) return;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const col = THREAD[tone];
      // Nails round the edge, the border strung, and envelope curves in two corners.
      const k = 6;
      const chords: [Pt, Pt][] = [
        [
          [x0, y0],
          [x1, y0],
        ],
        [
          [x1, y0],
          [x1, y1],
        ],
        [
          [x1, y1],
          [x0, y1],
        ],
        [
          [x0, y1],
          [x0, y0],
        ],
      ];
      for (let i = 1; i < k; i++) {
        const f = i / k;
        chords.push([
          [x0, y0 + (y1 - y0) * f * 0.5],
          [x0 + (x1 - x0) * (0.5 - f * 0.5) * 0.9, y0],
        ]);
        chords.push([
          [x1, y1 - (y1 - y0) * f * 0.5],
          [x1 - (x1 - x0) * (0.5 - f * 0.5) * 0.9, y1],
        ]);
      }
      wind(chords, at + 0.15, dur, col, 1.2);
      for (const [i, p] of (
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ] as Pt[]
      ).entries())
        nail(p[0], p[1], at + i * 0.04);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const a: Pt = [X(x1), Y(y1)];
      const b: Pt = [X(x2), Y(y2)];
      const col = THREAD[tone === "accent" ? "ink" : tone];
      if (!head) {
        thread(a, b, expo(p), col, 1);
        return;
      }
      // Bent links run nail to nail along the curve; the barb is a little V of thread.
      const pts = bend ? curve(a, b, bend, 6) : [a, b];
      const segs = pts.length - 1;
      for (let i = 0; i < segs; i++)
        thread(pts[i] as Pt, pts[i + 1] as Pt, clamp(p * segs - i), col, 1.6);
      for (const [i, q] of pts.entries())
        if (i === 0 || bend) nail(q[0], q[1], at + (i / pts.length) * dur, 2.4);
      if (p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-2) as Pt;
        const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 14 * u;
        for (const side of [-1, 1]) {
          const q: Pt = [
            end[0] - Math.cos(ang + side * 0.5) * s,
            end[1] - Math.sin(ang + side * 0.5) * s,
          ];
          thread(q, end, 1, col, 1.6);
          nail(q[0], q[1], at + dur, 2.2);
        }
        nail(end[0], end[1], at + dur, 2.6);
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9, tone = "ink" } = o;
      if (t < at) return;
      // Two rows of nails, threads zigzagged between them into a curved envelope.
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const n = 9;
      const left: Pt[] = Array.from({ length: n }, (_, i) => [x0, y0 + ((y1 - y0) * i) / (n - 1)]);
      const right: Pt[] = Array.from({ length: n }, (_, i) => [x1, y0 + ((y1 - y0) * i) / (n - 1)]);
      const chords: [Pt, Pt][] = [];
      for (let i = 0; i < n; i++) chords.push([left[i] as Pt, right[n - 1 - i] as Pt]);
      for (let i = 0; i < n - 1; i++)
        chords.push([left[i] as Pt, left[i + 1] as Pt], [right[i] as Pt, right[i + 1] as Pt]);
      wind(chords, at + 0.25, dur, THREAD[tone === "accent" ? "good" : tone], 1.2);
      for (const [i, p] of [...left, ...right].entries()) nail(p[0], p[1], at + (i % n) * 0.025);
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const col = tone === "ink" || tone === "accent" ? THREAD.good : THREAD[tone];
      digits(value, X(x), Y(y), size * 0.85, at, col);
      if (sub) tag(sub, X(x), Y(y) - size * 0.85 * u, size * 0.28, "ink", at + 0.1);
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 24) * u;
      const at = o.at ?? 0;
      if (t < at) return;
      const [cx, cy] = [X(x), Y(y)];
      const pts: Pt[] =
        kind === "check"
          ? [
              [cx - s * 0.5, cy],
              [cx - s * 0.12, cy + s * 0.42],
              [cx + s * 0.6, cy - s * 0.5],
            ]
          : [
              [cx - s * 0.45, cy - s * 0.45],
              [cx + s * 0.45, cy + s * 0.45],
              [cx + s * 0.45, cy - s * 0.45],
              [cx - s * 0.45, cy + s * 0.45],
            ];
      const col = kind === "check" ? THREAD.good : THREAD.bad;
      const chords: [Pt, Pt][] =
        kind === "check"
          ? [
              [pts[0] as Pt, pts[1] as Pt],
              [pts[1] as Pt, pts[2] as Pt],
            ]
          : [
              [pts[0] as Pt, pts[1] as Pt],
              [pts[2] as Pt, pts[3] as Pt],
            ];
      for (let w = 0; w < 3; w++)
        wind(
          chords.map(
            ([a, b]) =>
              [
                [a[0], a[1] + (w - 1) * u],
                [b[0], b[1] + (w - 1) * u],
              ] as [Pt, Pt],
          ),
          at + 0.1,
          0.25,
          col,
          1.8,
        );
      for (const p of pts) nail(p[0], p[1], at, 2.6);
    },
    finish() {
      if (!ember) return;
      const [x, y] = ember;
      const gl = ctx.createRadialGradient(x, y, 0, x, y, 18 * u);
      gl.addColorStop(0, "rgba(255,240,180,1)");
      gl.addColorStop(0.25, "rgba(255,140,40,0.85)");
      gl.addColorStop(1, "rgba(255,90,20,0)");
      ctx.fillStyle = gl;
      ctx.fillRect(x - 18 * u, y - 18 * u, 36 * u, 36 * u);
    },
  };
}

export default {
  id: "string-art",
  name: "String art",
  category: "Generative & Type",
  make,
} satisfies Style;
