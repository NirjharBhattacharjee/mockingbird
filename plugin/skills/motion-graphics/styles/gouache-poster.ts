// A hand-painted travel poster: a few flat matte colours in stacked bands,
// dry-brush streaks where the paint runs thin, condensed block capitals, and
// every shape painted on in one sweep with a ragged dry edge.
import {
  type Align,
  clamp,
  counting,
  curve,
  frame,
  hash,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const CREAM = "#F1E8D2";
const NAVY = "#1F3446";
const FILL: Record<Tone, string> = {
  ink: NAVY,
  accent: "#E8623A",
  good: "#2F7476",
  bad: "#D9705E",
  muted: "#8FB9B4",
};
const BLOCK = '"Bebas Neue", "Oswald", "League Gothic", "Impact", "Arial Narrow", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__gouache ??= new Map();
  const cache: Map<string, any> = g.__gouache;

  /** Horizontal dry-brush streaks over everything, made once per size. */
  function streaks() {
    const key = `streak:${W}x${H}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      for (let i = 0; i < 1600; i++) {
        const y = hash(i * 1.9) * H;
        const x = hash(i * 3.1) * W;
        c.fillStyle = hash(i * 7.7) > 0.5 ? "rgba(255,250,235,0.07)" : "rgba(30,30,20,0.05)";
        c.fillRect(x, y, (40 + hash(i * 5.3) * 260) * u, Math.max(1, (1 + hash(i) * 2) * u));
      }
      cache.set(key, tile);
    }
    ctx.drawImage(tile, 0, 0);
  }

  /**
   * Paint what `shape` traces, swept left to right from `at`: the leading edge
   * is ragged like a dry brush, then the coat closes up.
   */
  function sweep(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    at: number,
    dur: number,
    shape: () => void,
    color: string,
  ) {
    const p = progress(t, at, dur);
    if (p <= 0) return false;
    const e = 1 - (1 - p) ** 2;
    const edge = x0 + (x1 - x0 + 30 * u) * e;
    ctx.save();
    ctx.beginPath();
    if (p >= 1) {
      shape();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
      return true;
    }
    const rows = 14;
    ctx.moveTo(x0 - 30 * u, y0 - 4 * u);
    for (let i = 0; i <= rows; i++) {
      const yy = y0 - 4 * u + ((y1 - y0 + 8 * u) * i) / rows;
      ctx.lineTo(edge - hash(i * 3.7 + x0) * 28 * u * (1 - p * 0.6), yy);
    }
    ctx.lineTo(x0 - 30 * u, y1 + 4 * u);
    ctx.closePath();
    ctx.clip();
    shape();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    return p >= 1;
  }

  function caps(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: Align = "left",
  ) {
    ctx.font = `400 ${Math.round(size * u)}px ${BLOCK}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s.toUpperCase(), x, y);
    return ctx.measureText(s.toUpperCase()).width;
  }

  /** Capitals painted on letter block by letter block. */
  function painted(
    s: string,
    x: number,
    y: number,
    size: number,
    o: { at?: number; dur?: number; tone?: Tone; align?: Align },
  ) {
    const { at = 0, tone = "ink", align = "left" } = o;
    const dur = o.dur ?? 0.03 * s.length + 0.2;
    if (t < at) return 0;
    ctx.save();
    ctx.font = `400 ${Math.round(size * u)}px ${BLOCK}`;
    const w = ctx.measureText(s.toUpperCase()).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    const h = size * u;
    const p = progress(t, at, dur);
    ctx.beginPath();
    const edge = left + (w + 30 * u) * (1 - (1 - p) ** 2);
    for (let i = 0; i <= 10; i++)
      ctx.lineTo(edge - hash(i * 2.1 + x) * 20 * u * (1 - p), y - h + (h * 2 * i) / 10);
    ctx.lineTo(left - 20 * u, y + h);
    ctx.lineTo(left - 20 * u, y - h);
    ctx.closePath();
    ctx.clip();
    caps(s, left, y, size, FILL[tone], "left");
    ctx.restore();
    return w;
  }

  /** A flat starburst, stamped on. */
  function burst(cx: number, cy: number, r: number, at: number, color: string) {
    const p = progress(t, at, 0.25);
    if (p <= 0) return;
    const k = 1.25 - 0.25 * p;
    const n = 14;
    const pts: Pt[] = Array.from({ length: n * 2 }, (_, i) => {
      const a = (i / (n * 2)) * Math.PI * 2 + 0.1;
      const rr = (i % 2 ? r * 0.74 : r) * k;
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    });
    ctx.save();
    ctx.globalAlpha = clamp(p * 2);
    trace(ctx, pts, true);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  return {
    surface() {
      // Sky bands, a far ridge, a near ridge, water, and the lettering band.
      const bands: [number, string][] = [
        [0, "#A9CDC6"],
        [0.28, "#94C0B9"],
        [0.5, "#86B5AE"],
      ];
      for (const [y, c] of bands) {
        ctx.fillStyle = c;
        ctx.fillRect(0, Y(y), W, H);
      }
      const ridge = (base: number, amp: number, color: string, s: number) => {
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let i = 0; i <= 24; i++) {
          const x = (i / 24) * W;
          ctx.lineTo(
            x,
            Y(base) - amp * H * (0.5 + 0.5 * Math.sin(i * 0.5 + s) * Math.cos(i * 0.21 + s)),
          );
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      };
      ridge(0.68, 0.1, "#6FA39E", 1);
      ridge(0.78, 0.06, "#4E8A88", 3.4);
      ctx.fillStyle = "#3E7A7B";
      ctx.fillRect(0, Y(0.84), W, H);
      ctx.fillStyle = NAVY;
      ctx.fillRect(0, Y(0.9), W, H);
      streaks();
      // The cream border of the printed sheet.
      const b = 12 * u;
      ctx.fillStyle = CREAM;
      ctx.fillRect(0, 0, W, b);
      ctx.fillRect(0, H - b, W, b);
      ctx.fillRect(0, 0, b, H);
      ctx.fillRect(W - b, 0, b, H);
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 70, at = 0, tone = "ink", align = "left" } = o;
      painted(s, X(x), Y(y), size, { at, dur: o.dur, tone, align });
    },
    label(s, x, y, o = {}) {
      const size = o.size ?? 36;
      const at = o.at ?? 0;
      if (t >= at) {
        ctx.save();
        ctx.font = `400 ${Math.round(size * u)}px ${BLOCK}`;
        const w = ctx.measureText(s.toUpperCase()).width + size * 0.6 * u;
        const align = o.align ?? "center";
        const left =
          align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x) - size * 0.3 * u;
        const hh = size * 0.62 * u;
        sweep(
          left,
          left + w,
          Y(y) - hh,
          Y(y) + hh,
          at,
          0.25,
          () => ctx.rect(left, Y(y) - hh, w, hh * 2),
          CREAM,
        );
        ctx.restore();
      }
      painted(s, X(x), Y(y), size, {
        at: o.at ?? 0,
        dur: o.dur,
        tone: o.tone ?? "ink",
        align: o.align ?? "center",
      });
    },
    node(x, y, r, o = {}) {
      // A round gauge: a flat disc with a painted needle.
      const { at = 0, dur = 0.25, tone = "accent" } = o;
      const R = r * u;
      const [cx, cy] = [X(x), Y(y)];
      const done = sweep(
        cx - R,
        cx + R,
        cy - R,
        cy + R,
        at,
        dur,
        () => {
          ctx.beginPath();
          ctx.arc(cx, cy, R, 0, Math.PI * 2);
        },
        FILL[tone],
      );
      if (!done) return;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.68, 0, Math.PI * 2);
      ctx.fillStyle = CREAM;
      ctx.fill();
      const a = -Math.PI / 2 + (hash(x * 13 + y * 7) - 0.5) * 2.4;
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = 4 * u;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55);
      ctx.stroke();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.4, tone = "ink" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      sweep(
        x0,
        x1,
        y0 + 8 * u,
        y1 + 8 * u,
        at,
        dur,
        () => ctx.rect(x0 + 8 * u, y0 + 8 * u, x1 - x0, y1 - y0),
        FILL[tone === "ink" ? "muted" : tone],
      );
      sweep(x0, x1, y0, y1, at + 0.05, dur, () => ctx.rect(x0, y0, x1 - x0, y1 - y0), CREAM);
    },
    link(x1, y1, x2, y2, o = {}) {
      // A flat poster arrow: a fat band with a solid head.
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const thin = !head && tone === "accent";
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * (1 - (1 - p) ** 2))));
      const color = FILL[tone === "ink" ? "accent" : tone];
      ctx.save();
      ctx.lineJoin = "miter";
      ctx.lineCap = "butt";
      trace(ctx, shown);
      ctx.strokeStyle = thin ? "rgba(31,52,70,0.55)" : color;
      ctx.lineWidth = (thin ? 3 : 16) * u;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 30 * u;
        const tip: Pt = [end[0] + Math.cos(a) * s * 0.6, end[1] + Math.sin(a) * s * 0.6];
        trace(
          ctx,
          [
            tip,
            [end[0] + Math.cos(a + 1.9) * s * 0.75, end[1] + Math.sin(a + 1.9) * s * 0.75],
            [end[0] + Math.cos(a - 1.9) * s * 0.75, end[1] + Math.sin(a - 1.9) * s * 0.75],
          ],
          true,
        );
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      // A silo with a domed top and painted bands.
      const { at = 0, dur = 0.6, tone = "good" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const r = (x1 - x0) / 2;
      const done = sweep(
        x0,
        x1,
        y0,
        y1,
        at,
        dur,
        () => {
          ctx.beginPath();
          ctx.moveTo(x0, y1);
          ctx.lineTo(x0, y0 + r);
          ctx.arc(x0 + r, y0 + r, r, Math.PI, 0);
          ctx.lineTo(x1, y1);
          ctx.closePath();
        },
        FILL[tone],
      );
      if (!done) return;
      ctx.fillStyle = "rgba(20,40,50,0.28)";
      ctx.fillRect(x0 + r * 1.3, y0 + r, r * 0.7, y1 - y0 - r);
      ctx.fillStyle = CREAM;
      for (const f of [0.45, 0.62, 0.79]) ctx.fillRect(x0, y0 + (y1 - y0) * f, x1 - x0, 3 * u);
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at) return;
      if (sub) burst(X(x), Y(y), size * 1.15 * u, at, FILL.accent);
      const value = count ? counting(t, at, dur, count) + s : s;
      const color = sub ? NAVY : FILL[tone === "good" ? "ink" : tone];
      ctx.save();
      ctx.globalAlpha = progress(t, at, 0.15);
      caps(value, X(x), Y(y), size, color, "center");
      if (sub) caps(sub, X(x), Y(y) + size * 0.62 * u, size * 0.3, CREAM, "center");
      ctx.restore();
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 36) * u;
      const [cx, cy] = [X(x), Y(y)];
      const p = progress(t, o.at ?? 0, 0.2);
      if (p <= 0) return;
      ctx.save();
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      ctx.lineWidth = 9 * u;
      ctx.strokeStyle = FILL[o.tone ?? (kind === "check" ? "good" : "ink")];
      ctx.beginPath();
      ctx.rect(cx - s, cy - s, s * 2 * p, s * 2);
      ctx.clip();
      if (kind === "check")
        trace(ctx, [
          [cx - s * 0.55, cy],
          [cx - s * 0.12, cy + s * 0.42],
          [cx + s * 0.65, cy - s * 0.55],
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.5, cy - s * 0.5);
        ctx.lineTo(cx + s * 0.5, cy + s * 0.5);
        ctx.moveTo(cx + s * 0.5, cy - s * 0.5);
        ctx.lineTo(cx - s * 0.5, cy + s * 0.5);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      // Matte paper tooth.
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = "#3A2E1E";
      for (let i = 0; i < 1400; i++)
        ctx.fillRect(hash(i * 1.7) * W, hash(i * 2.9) * H, 1.5 * u, 1.5 * u);
      ctx.restore();
    },
  };
}

export default {
  id: "gouache-poster",
  name: "Painted travel poster",
  category: "Painterly",
  make,
} satisfies Style;
