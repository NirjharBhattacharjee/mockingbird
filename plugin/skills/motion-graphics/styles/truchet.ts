// Two-ink Truchet print: navy tiles carrying cream quarter-circle paths
// that join into a maze, an orange third ink printed slightly off register,
// cream paper. Tiles are laid in a diagonal sweep and land with a quarter
// turn; labels are printed blocks with their orange shadow sliding into place.
import {
  along,
  type Cue,
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

const NAVY = "#1C2240";
const ORANGE = "#E5603A";
const CREAM = "#EFE7D6";
const GREY = "#6E7386";
const TILE: Record<Tone, string> = {
  ink: NAVY,
  accent: NAVY,
  good: NAVY,
  bad: ORANGE,
  muted: GREY,
};
const HEAVY = '"Archivo Black", "Noto Color Emoji", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__truchet ??= new Map();
  const cache: Map<string, any> = g.__truchet;

  function paper() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      b.fillStyle = CREAM;
      b.fillRect(0, 0, W, H);
      for (let i = 0; i < (W * H) / 80; i++) {
        b.fillStyle = hash(i * 1.3) > 0.5 ? "rgba(255,255,255,0.25)" : "rgba(90,70,40,0.06)";
        b.fillRect(hash(i * 0.7) * W, hash(i * 1.9 + 2) * H, 1.5 * u, 1.5 * u);
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  /** One tile centred at (cx, cy), `s` wide: two quarter-circle paths, flipped by `flip`, turned by `turn`. */
  function tile(
    cx: number,
    cy: number,
    s: number,
    flip: boolean,
    turn: number,
    ink: string,
    path = CREAM,
  ) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(turn + (flip ? Math.PI / 2 : 0));
    ctx.fillStyle = ink;
    ctx.fillRect(-s / 2 - 0.5, -s / 2 - 0.5, s + 1, s + 1);
    ctx.strokeStyle = path;
    ctx.lineWidth = s / 3;
    ctx.beginPath();
    ctx.arc(-s / 2, -s / 2, s / 2, 0, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2, Math.PI, Math.PI * 1.5);
    ctx.stroke();
    ctx.restore();
  }

  /** How a tile lands: a quick quarter turn into place, and how much of it is there. */
  const land = (at: number) => {
    const p = expo(progress(t, at, 0.35));
    return { p, turn: (1 - p) * (Math.PI / 2) };
  };

  /** A printed block: navy slab, cream capitals, an orange slab off register behind it. */
  function block(s: string, x: number, y: number, o: Cue & { size?: number; align?: string } = {}) {
    const { at = 0, size = 22, align = "center", tone = "ink" } = o;
    const p = expo(progress(t, at, o.dur ?? 0.3));
    if (p <= 0) return;
    ctx.save();
    ctx.font = `400 ${Math.round(size * u)}px ${HEAVY}`;
    ctx.letterSpacing = `${size * 0.12 * u}px`;
    ctx.textBaseline = "middle";
    const text = s.toUpperCase();
    const w = ctx.measureText(text).width + size * 0.9 * u;
    const h = size * 1.6 * u;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    const top = Y(y) - h / 2;
    const off = (3 + (1 - p) * 10) * u;
    const slab = tone === "bad" ? ORANGE : NAVY;
    const shadow = tone === "bad" ? NAVY : ORANGE;
    ctx.fillStyle = shadow;
    ctx.fillRect(left + off, top + off, w * p, h);
    ctx.fillStyle = slab;
    ctx.fillRect(left, top, w * p, h);
    ctx.beginPath();
    ctx.rect(left, top, w * p, h);
    ctx.clip();
    ctx.fillStyle = CREAM;
    ctx.fillText(text, left + size * 0.45 * u, Y(y) + u);
    ctx.restore();
  }

  return {
    surface() {
      paper();
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 42, at = 0 } = o;
      block(s, x, y, { ...o, at, size, align: o.align ?? "left", dur: o.dur ?? 0.4 });
    },
    label(s, x, y, o = {}) {
      block(s, x, y, { size: 26, ...o });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      if (t < at) return;
      const { p, turn } = land(at);
      const s = r * 2.5 * u * (0.6 + 0.4 * p);
      // A tile with an orange registration shadow.
      ctx.save();
      ctx.globalAlpha = p;
      ctx.fillStyle = ORANGE;
      ctx.fillRect(X(x) - s / 2 + 3 * u, Y(y) - s / 2 + 3 * u, s, s);
      ctx.restore();
      tile(X(x), Y(y), s, hash(x * 31 + y * 17) > 0.5, turn, TILE[tone]);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "ink" } = o;
      if (t < at) return;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      // A box with no width or height has nothing to fill, and would divide by zero.
      if (bw <= 0 || bh <= 0) return;
      const n = Math.max(3, Math.round(bh / (34 * u)));
      const s = bh / n;
      const cols = Math.ceil(bw / s);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, bw, bh);
      ctx.clip();
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < n; j++) {
          const a = at + ((i + j) / (cols + n)) * dur;
          if (t < a) continue;
          const { turn } = land(a);
          tile(
            x0 + (i + 0.5) * s,
            y0 + (j + 0.5) * s,
            s,
            hash(i * 7.1 + j * 3.3 + x * 50) > 0.5,
            turn,
            TILE[tone],
          );
        }
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = 3 * u;
      ctx.strokeRect(x0, y0, bw, bh);
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = along(shaft, p).points;
      ctx.save();
      ctx.lineCap = "round";
      if (tone === "bad") {
        // The correction is an orange path laid over the maze, thick as a tile's track.
        ctx.strokeStyle = NAVY;
        ctx.lineWidth = 14 * u;
        trace(ctx, shown);
        ctx.stroke();
        ctx.strokeStyle = ORANGE;
        ctx.lineWidth = 9 * u;
        trace(ctx, shown);
        ctx.stroke();
      } else {
        ctx.strokeStyle = tone === "accent" ? GREY : NAVY;
        ctx.lineWidth = (tone === "accent" ? 1.4 : 2.4) * u;
        trace(ctx, shown);
        ctx.stroke();
      }
      if (head && p >= 1) {
        const end = shaft.at(-1) as Pt;
        const prev = shaft.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = (tone === "bad" ? 26 : 14) * u;
        ctx.fillStyle = tone === "bad" ? ORANGE : NAVY;
        trace(
          ctx,
          [
            end,
            [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
            [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s],
          ],
          true,
        );
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "ink" } = o;
      if (t < at) return;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      // A store with no width or height has nothing to fill, and would divide by zero.
      if (bw <= 0 || bh <= 0) return;
      const s = bw / 2;
      const rows = Math.max(1, Math.floor(bh / s));
      // Tiles stacked from the bottom up.
      for (let j = rows - 1, k = 0; j >= 0; j--)
        for (let i = 0; i < 2; i++, k++) {
          const a = at + (k / (rows * 2)) * dur;
          if (t < a) continue;
          const { turn } = land(a);
          tile(
            x0 + (i + 0.5) * s,
            y0 + bh - (rows - j - 0.5) * s,
            s,
            hash(i * 5 + j * 9) > 0.5,
            turn,
            TILE[tone],
          );
        }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      const p = expo(progress(t, at, 0.4));
      if (p <= 0) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${HEAVY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.letterSpacing = `${size * 0.04 * u}px`;
      const off = (4 + (1 - p) * 14) * (size / 90) * u;
      if (size < 80) {
        // Inside the maze: a cream plate behind the number keeps it legible.
        const w = ctx.measureText(value).width + size * 0.5 * u;
        ctx.fillStyle = CREAM;
        ctx.fillRect(X(x) - w / 2, Y(y) - size * 0.65 * u, w, size * 1.3 * u);
        ctx.strokeStyle = NAVY;
        ctx.lineWidth = 3 * u;
        ctx.strokeRect(X(x) - w / 2, Y(y) - size * 0.65 * u, w, size * 1.3 * u);
      }
      ctx.fillStyle = ORANGE;
      ctx.fillText(value, X(x) + off, Y(y) + off);
      ctx.fillStyle = NAVY;
      ctx.fillText(value, X(x), Y(y));
      ctx.restore();
      if (sub) block(sub, x, y - (size * 1.05 * u) / H, { at: at + 0.2, size: 24 });
      if (size >= 80) {
        const rp = progress(t, at + dur, 0.4);
        if (rp > 0) {
          ctx.save();
          ctx.strokeStyle = ORANGE;
          ctx.lineWidth = 4 * u;
          trace(
            ctx,
            along(ellipse(X(x), Y(y), size * 1.5 * u, size * 0.75 * u, 60, -Math.PI / 2), rp)
              .points,
          );
          ctx.stroke();
          ctx.restore();
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      if (t < at) return;
      const { p, turn } = land(at);
      const s = (o.size ?? 34) * u * (0.6 + 0.4 * p);
      ctx.save();
      ctx.translate(X(x), Y(y));
      ctx.rotate(turn);
      ctx.fillStyle = NAVY;
      ctx.fillRect(-s / 2 + 3 * u, -s / 2 + 3 * u, s, s);
      ctx.fillStyle = ORANGE;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.strokeStyle = CREAM;
      ctx.lineWidth = s * 0.14;
      ctx.lineCap = "square";
      if (kind === "check")
        trace(ctx, [
          [-s * 0.28, 0],
          [-s * 0.06, s * 0.22],
          [s * 0.3, -s * 0.22],
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(-s * 0.25, -s * 0.25);
        ctx.lineTo(s * 0.25, s * 0.25);
        ctx.moveTo(s * 0.25, -s * 0.25);
        ctx.lineTo(-s * 0.25, s * 0.25);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {},
  };
}

export default {
  id: "truchet",
  name: "Truchet print",
  category: "Generative & Type",
  make,
} satisfies Style;
