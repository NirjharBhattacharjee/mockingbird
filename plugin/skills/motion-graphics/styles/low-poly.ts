// Faceted low-poly valley at dusk: flat-shaded triangle mountains and pines
// under a lavender sky, fog thickening toward the horizon. Objects are cut
// gems and angular slabs whose facets flip into place one at a time.
import {
  alpha,
  clamp,
  counting,
  curve,
  expo,
  frame,
  hash,
  type Look,
  lerp,
  type Pt,
  progress,
  type Style,
  spring,
  type Tone,
  trace,
} from "./look.ts";

/** Facet shades for each tone, light to dark. */
const FACET: Record<Tone, string[]> = {
  ink: ["#F3EEFA", "#DCD3EE", "#C2B6DE", "#A497C9"],
  accent: ["#F7A8D0", "#A9B8F5", "#D58CE0", "#7F90E6", "#F2C4E8"],
  good: ["#B5F0CF", "#7FDDB0", "#5AC596", "#3EA77C"],
  bad: ["#FF9C8A", "#F2705E", "#D9524A", "#B83E3E"],
  muted: ["#8E86B0", "#776E9E", "#625A8A", "#4E4775"],
};
const PLUM = "#3B2E52";
const SANS = '"Space Grotesk", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__lowPoly ??= new Map();
  const cache: Map<string, any> = g.__lowPoly;
  const flip = (at = 0) => spring(t, { start: at, stiffness: 200, damping: 16 });

  /** The valley, triangulated and flat shaded once per frame size. */
  function valley() {
    const key = `${W}x${H}`;
    let tex = cache.get(key);
    if (tex) return tex;
    tex = new OffscreenCanvas(W, H);
    const c = tex.getContext("2d");
    const sky = c.createLinearGradient(0, 0, 0, H * 0.6);
    sky.addColorStop(0, "#4A3F6E");
    sky.addColorStop(1, "#B9A3CF");
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#F4DE9A";
    c.beginPath();
    c.arc(W * 0.62, H * 0.12, H * 0.06, 0, Math.PI * 2);
    c.fill();
    const tri = (p: Pt[], col: string) => {
      c.fillStyle = col;
      c.strokeStyle = col;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(p[0]?.[0], p[0]?.[1]);
      c.lineTo(p[1]?.[0], p[1]?.[1]);
      c.lineTo(p[2]?.[0], p[2]?.[1]);
      c.closePath();
      c.fill();
      c.stroke();
    };
    // Mountains: big faceted peaks, a lit face and a shadow face each.
    for (let i = 0; i < 11; i++) {
      const far = i < 6;
      const px = far ? W * (i / 5) + (hash(i) - 0.5) * W * 0.15 : W * hash(i * 1.7);
      const py = H * (far ? 0.08 + hash(i + 3) * 0.2 : 0.3 + hash(i + 3) * 0.12);
      const base = H * 0.6;
      const half = W * (0.12 + hash(i + 7) * 0.1);
      const mid: Pt = [px + (hash(i + 9) - 0.5) * half * 0.4, base];
      const k = far ? 0 : 1;
      // Each face broken into facets with a slightly different light.
      const lit = [
        ["#C2B2DF", "#B1A0D4", "#A391C9"],
        ["#9C8CC2", "#8E7EB6", "#8070AA"],
      ][k] as string[];
      const dim = [
        ["#8F7EB6", "#8070A8", "#75659E"],
        ["#6F6198", "#64568C", "#5A4D82"],
      ][k] as string[];
      const l: Pt = [px - half, base];
      const r: Pt = [px + half, base];
      const a1: Pt = [lerp(px, l[0], 0.55), lerp(py, base, 0.55) - H * 0.02];
      const b1: Pt = [lerp(px, r[0], 0.5), lerp(py, base, 0.5) - H * 0.015];
      const pk: Pt = [px, py];
      tri([pk, a1, mid], lit[0] as string);
      tri([a1, l, mid], lit[1] as string);
      tri([pk, a1, [lerp(px, mid[0], 0.5), lerp(py, base, 0.5)]], lit[2] as string);
      tri([pk, mid, b1], dim[0] as string);
      tri([b1, mid, r], dim[1] as string);
      tri([pk, b1, [lerp(px, r[0], 0.2), lerp(py, base, 0.25)]], dim[2] as string);
      if (far)
        tri(
          [
            pk,
            [lerp(px, l[0], 0.28), lerp(py, base, 0.28)],
            [lerp(px, r[0], 0.22), lerp(py, base, 0.3)],
          ],
          "#EEE6F7",
        );
    }
    // The valley floor: a jittered grid split into triangles, fogged toward the horizon.
    const cols = 22;
    const rows = 10;
    const pt = (i: number, j: number): Pt => {
      const f = j / rows;
      return [
        ((i + (hash(i * 7 + j * 13) - 0.5) * 0.8) / cols) * W * 1.1 - W * 0.05,
        H * (0.55 + 0.45 * f ** 1.4) +
          (hash(i + j * 31) - 0.5) * H * 0.02 * (j > 0 && j < rows ? 1 : 0),
      ];
    };
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const a = pt(i, j);
        const b = pt(i + 1, j);
        const cc = pt(i, j + 1);
        const d = pt(i + 1, j + 1);
        const fog = 1 - j / rows;
        const shade = (k: number) => {
          const v = hash(i * 3.1 + j * 5.7 + k);
          const path = Math.abs(i - cols * 0.45 - j * 0.3) < 2.2;
          const [r0, g0, b0] = path ? [205, 170, 190] : [60 + v * 30, 120 + v * 40, 100 + v * 25];
          const mix = (q: number, f: number) => Math.round(lerp(q, f, fog * 0.7));
          return `rgb(${mix(r0, 185)},${mix(g0, 170)},${mix(b0, 210)})`;
        };
        tri([a, b, cc], shade(0));
        tri([b, d, cc], shade(1));
      }
    // Pines: two-tone cones.
    for (let i = 0; i < 70; i++) {
      const x = hash(i * 2.3) * W;
      const y = H * (0.6 + hash(i * 4.1) ** 0.7 * 0.4);
      const s = (8 + (y / H - 0.55) * 60) * (W / 1280);
      if (Math.abs(x / W - 0.45 - (y / H - 0.55) * 0.5) < 0.08) continue;
      tri(
        [
          [x, y - s * 2.4],
          [x - s, y],
          [x, y],
        ],
        "#2F6B55",
      );
      tri(
        [
          [x, y - s * 2.4],
          [x, y],
          [x + s, y],
        ],
        "#1F4D40",
      );
    }
    cache.set(key, tex);
    return tex;
  }

  /** A cut-corner card path. */
  function cut(x: number, y: number, w: number, h: number, c: number) {
    trace(
      ctx,
      [
        [x + c, y],
        [x + w, y],
        [x + w, y + h - c],
        [x + w - c, y + h],
        [x, y + h],
        [x, y + c],
      ],
      true,
    );
  }

  /** A dark cut-corner tag with white type, its top-left at (x, y) unless centred. */
  function tag(
    s: string,
    cx: number,
    cy: number,
    size: number,
    fill: string,
    ink: string,
    align = "center",
  ) {
    ctx.font = `600 ${Math.round(size * u)}px ${SANS}`;
    const w = ctx.measureText(s).width + size * u;
    const h = size * 1.6 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    ctx.fillStyle = "rgba(20,10,40,0.3)";
    cut(left + 3 * u, cy - h / 2 + 4 * u, w, h, 6 * u);
    ctx.fill();
    ctx.fillStyle = fill;
    cut(left, cy - h / 2, w, h, 6 * u);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + size * 0.5 * u, cy + u);
  }

  /** Squash vertically about (cx, cy) as a facet turning to face us. */
  function flipped(cx: number, cy: number, at: number | undefined, draw: () => void) {
    const s = flip(at);
    if (s <= 0) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, s);
    ctx.translate(-cx, -cy);
    ctx.globalAlpha = clamp(s * 2);
    draw();
    ctx.restore();
  }

  return {
    surface() {
      ctx.drawImage(valley(), 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 40, at = 0, align = "left" } = o;
      const p = progress(t, at, o.dur ?? 0.7);
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = `600 ${Math.round(size * u)}px ${SANS}`;
      const tw = ctx.measureText(s).width;
      const left = align === "center" ? X(x) - tw / 2 : align === "right" ? X(x) - tw : X(x);
      ctx.fillStyle = alpha(PLUM, 0.75);
      cut(left - 14 * u, Y(y) - size * 0.8 * u, tw + 28 * u, size * 1.6 * u, 8 * u);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(s, left, Y(y) + (1 - expo(p)) * 10 * u);
      ctx.fillStyle = "#F2705E";
      ctx.fillRect(left, Y(y) + size * 0.62 * u, tw * expo(p) * 0.5, 4 * u);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const tone = o.tone ?? "ink";
      const fill = tone === "bad" ? "#E85A50" : tone === "good" ? "#2F9E73" : PLUM;
      flipped(X(x), Y(y), o.at, () =>
        tag(s, X(x), Y(y), o.size ?? 30, fill, "#FFFFFF", o.align ?? "center"),
      );
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      if (t < at) return;
      // A cut gem: facets round a centre, each flipping in after the last.
      const R = r * u * 1.5;
      const cols = FACET[tone];
      const n = 6;
      const rim: Pt[] = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return [X(x) + Math.cos(a) * R, Y(y) + Math.sin(a) * R * 1.1];
      });
      const core: Pt = [X(x) - R * 0.15, Y(y) - R * 0.2];
      ctx.fillStyle = "rgba(30,15,50,0.35)";
      trace(
        ctx,
        rim.map(([a, b]) => [a + 3 * u, b + 5 * u] as Pt),
        true,
      );
      if (flip(at) > 0.6) ctx.fill();
      for (let i = 0; i < n; i++) {
        const s = flip(at + i * 0.04);
        if (s <= 0) continue;
        const a = rim[i] as Pt;
        const b = rim[(i + 1) % n] as Pt;
        const mid: Pt = [(a[0] + b[0] + core[0]) / 3, (a[1] + b[1] + core[1]) / 3];
        const sc = (q: Pt): Pt => [mid[0] + (q[0] - mid[0]) * s, mid[1] + (q[1] - mid[1]) * s];
        ctx.fillStyle = cols[i % cols.length] as string;
        trace(ctx, [sc(core), sc(a), sc(b)], true);
        ctx.fill();
      }
    },
    box(x, y, w, h, o = {}) {
      const tone = o.tone ?? "ink";
      flipped(X(x + w / 2), Y(y + h / 2), o.at, () => {
        const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
        const c = 18 * u;
        ctx.fillStyle = "rgba(20,10,40,0.3)";
        cut(x0 + 8 * u, y0 + 10 * u, bw, bh, c);
        ctx.fill();
        ctx.fillStyle = "#F5F1FA";
        cut(x0, y0, bw, bh, c);
        ctx.fill();
        // Two facets of shading across the card.
        ctx.fillStyle = "rgba(120,100,170,0.12)";
        trace(
          ctx,
          [
            [x0 + bw, y0],
            [x0 + bw, y0 + bh - c],
            [x0 + bw - c, y0 + bh],
            [x0 + bw * 0.4, y0 + bh],
          ],
          true,
        );
        ctx.fill();
        ctx.fillStyle = (FACET[tone] ?? FACET.ink)[tone === "ink" ? 3 : 2] as string;
        trace(
          ctx,
          [
            [x0, y0 + c],
            [x0 + c, y0],
            [x0 + c * 2.2, y0],
            [x0, y0 + c * 2.2],
          ],
          true,
        );
        ctx.fill();
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      // An angular two-tone ribbon: few segments, a lit top and a shaded underside.
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, head ? 5 : 1);
      const n = Math.max(1, Math.ceil((pts.length - 1) * expo(p)));
      const shown = pts.slice(0, n + 1);
      const light = tone === "bad" ? "#FF8F7E" : tone === "accent" ? "#E6DDF7" : "#FFFFFF";
      const dark = tone === "bad" ? "#C2453D" : tone === "accent" ? PLUM : "#B4A8D4";
      const wd = (head ? 7 : 3.5) * u;
      ctx.save();
      ctx.lineJoin = "miter";
      ctx.globalAlpha = head ? 1 : 0.7;
      trace(
        ctx,
        shown.map(([a, b]) => [a, b + wd * 0.35] as Pt),
      );
      ctx.strokeStyle = dark;
      ctx.lineWidth = wd;
      ctx.stroke();
      trace(
        ctx,
        shown.map(([a, b]) => [a, b - wd * 0.15] as Pt),
      );
      ctx.strokeStyle = light;
      ctx.lineWidth = wd * 0.6;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-2) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 22 * u;
        const l: Pt = [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s];
        const r: Pt = [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s];
        const back: Pt = [end[0] - Math.cos(a) * s * 0.6, end[1] - Math.sin(a) * s * 0.6];
        ctx.fillStyle = light;
        trace(ctx, [end, l, back], true);
        ctx.fill();
        ctx.fillStyle = dark;
        trace(ctx, [end, back, r], true);
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      // Hexagonal slabs stacked from the ground up.
      const n = 6;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.35;
      const sh = (Y(h) - ry * 2) / n;
      for (let i = 0; i < n; i++) {
        const s = flip(at + (i / n) * dur);
        if (s <= 0) continue;
        const cy = Y(y + h) - ry - i * sh - (1 - s) * 25 * u;
        const hex = (yy: number): Pt[] =>
          Array.from({ length: 6 }, (_, k) => {
            const a = (k / 6) * Math.PI * 2;
            return [cx + Math.cos(a) * rx, yy + Math.sin(a) * ry];
          });
        const top = hex(cy - sh * 0.8);
        const bottom = hex(cy);
        ctx.globalAlpha = clamp(s * 2);
        for (const [k, col] of [
          [0, "#5E5287"],
          [1, "#4A4072"],
          [2, "#6E62A0"],
        ] as [number, string][]) {
          const a = bottom[k] as Pt;
          const b = bottom[k + 1] as Pt;
          ctx.fillStyle = col;
          trace(ctx, [a, b, [b[0], b[1] - sh * 0.8], [a[0], a[1] - sh * 0.8]], true);
          ctx.fill();
        }
        ctx.fillStyle = i % 2 ? "#9C8FCB" : "#B4A8DD";
        trace(ctx, top, true);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      flipped(X(x), Y(y), at, () => {
        const value = count ? counting(t, at, dur, count) + s : s;
        ctx.font = `700 ${Math.round(size * u)}px ${SANS}`;
        const tw = Math.max(ctx.measureText(`${value}0`).width, size * 2 * u);
        const h = size * 1.25 * u;
        const filled = tone === "accent" || tone === "bad";
        const [x0, y0] = [X(x) - tw / 2, Y(y) - h / 2];
        ctx.fillStyle = "rgba(20,10,40,0.3)";
        cut(x0 + 6 * u, y0 + 8 * u, tw, h, 14 * u);
        ctx.fill();
        ctx.fillStyle = filled ? "#F2705E" : "#FFFFFF";
        cut(x0, y0, tw, h, 14 * u);
        ctx.fill();
        ctx.fillStyle = filled ? "rgba(140,30,30,0.18)" : "rgba(120,100,170,0.1)";
        trace(
          ctx,
          [
            [x0 + tw * 0.55, y0],
            [x0 + tw, y0],
            [x0 + tw, y0 + h * 0.6],
          ],
          true,
        );
        ctx.fill();
        ctx.fillStyle = filled ? "#FFFFFF" : tone === "good" ? "#21875F" : PLUM;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(value, X(x), Y(y) + 2 * u);
        if (sub)
          tag(
            sub[0]?.toUpperCase() + sub.slice(1),
            X(x),
            y0 - size * 0.12 * u,
            size * 0.26,
            PLUM,
            "#FFFFFF",
          );
      });
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 24) * u;
      flipped(X(x), Y(y), o.at, () => {
        const [cx, cy] = [X(x), Y(y)];
        const cols = kind === "check" ? FACET.good : FACET.bad;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const b = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2;
          ctx.fillStyle = cols[(i % 3) + 1] as string;
          trace(
            ctx,
            [
              [cx, cy],
              [cx + Math.cos(a) * r, cy + Math.sin(a) * r],
              [cx + Math.cos(b) * r, cy + Math.sin(b) * r],
            ],
            true,
          );
          ctx.fill();
        }
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = r * 0.2;
        ctx.lineJoin = "miter";
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.42, cy],
            [cx - r * 0.1, cy + r * 0.32],
            [cx + r * 0.45, cy - r * 0.3],
          ]);
        else
          trace(ctx, [
            [cx - r * 0.35, cy - r * 0.35],
            [cx + r * 0.35, cy + r * 0.35],
            [cx, cy],
            [cx + r * 0.35, cy - r * 0.35],
            [cx - r * 0.35, cy + r * 0.35],
          ]);
        ctx.stroke();
      });
    },
    finish() {
      // A thin band of dusk haze at the horizon.
      const fog = ctx.createLinearGradient(0, H * 0.45, 0, H * 0.7);
      fog.addColorStop(0, "rgba(200,180,225,0)");
      fog.addColorStop(0.5, "rgba(200,180,225,0.12)");
      fog.addColorStop(1, "rgba(200,180,225,0)");
      ctx.fillStyle = fog;
      ctx.fillRect(0, H * 0.45, W, H * 0.25);
    },
  };
}

export default {
  id: "low-poly",
  name: "Low-poly valley",
  category: "Dimensional",
  make,
} satisfies Style;
