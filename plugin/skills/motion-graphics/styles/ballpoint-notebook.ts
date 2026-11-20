// Blue ballpoint doodles in a college-ruled notebook: pale blue rules, a red
// margin, punched holes. Lines vary with pen pressure and blob where they
// start, shapes get crosshatched shadows a beat after they're drawn,
// headings and numbers are outlined bubble letters with a hatched drop
// shadow, and a red pen marks what's wrong.
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
  roughen,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const INK: Record<Tone, string> = {
  ink: "#27348B",
  accent: "#2F45B5",
  good: "#27348B",
  bad: "#C8283A",
  muted: "#6E7BB5",
};
const HAND = '"Caveat", "Noto Color Emoji", cursive';
const BUBBLE = '"Comic Neue", "Noto Color Emoji", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__ballpoint ??= new Map();
  const cache: Map<string, any> = g.__ballpoint;
  let tip: { pt: Pt; color: string } | null = null;
  let seed = 1;

  function paper() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      b.fillStyle = "#F7F5EE";
      b.fillRect(0, 0, W, H);
      const gap = 30 * u;
      for (let y = gap * 2.5; y < H; y += gap) {
        b.fillStyle = "rgba(90,130,200,0.5)";
        b.fillRect(0, y, W, 1.4 * u);
      }
      b.fillStyle = "rgba(215,70,80,0.55)";
      b.fillRect(W * 0.085, 0, 1.6 * u, H);
      for (const y of [0.18, 0.5, 0.82]) {
        b.fillStyle = "#5A5652";
        b.beginPath();
        b.arc(W * 0.03, H * y, 11 * u, 0, Math.PI * 2);
        b.fill();
      }
      for (let i = 0; i < (W * H) / 120; i++) {
        b.fillStyle = `rgba(120,110,90,${hash(i * 1.7) * 0.05})`;
        b.fillRect(hash(i * 1.1) * W, hash(i * 2.3 + 1) * H, u, u);
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  /** Diagonal hatching, optionally crossed, as a fill pattern in one ink. */
  function hatch(tone: Tone, cross: boolean) {
    const key = `hatch:${tone}:${cross}:${u}`;
    let tile = cache.get(key);
    if (!tile) {
      const n = Math.max(4, Math.round(7 * u));
      tile = new OffscreenCanvas(n, n);
      const c = tile.getContext("2d");
      c.strokeStyle = INK[tone];
      c.lineWidth = Math.max(1, 1.3 * u);
      c.globalAlpha = 0.9;
      c.beginPath();
      c.moveTo(0, n);
      c.lineTo(n, 0);
      c.moveTo(-1, 1);
      c.lineTo(1, -1);
      c.moveTo(n - 1, n + 1);
      c.lineTo(n + 1, n - 1);
      if (cross) {
        c.moveTo(0, 0);
        c.lineTo(n, n);
      }
      c.stroke();
      cache.set(key, tile);
    }
    return ctx.createPattern(tile, "repeat");
  }

  /** A ballpoint line: pressure swells and thins along it, with a blob where it starts. */
  function pen(points: Pt[], { at = 0, dur = 0.5, tone = "ink" as Tone, width = 3 } = {}) {
    const p = progress(t, at, dur);
    seed += 1;
    if (p <= 0) return;
    const { points: drawn } = along(roughen(points, 1.1 * u, seed * 3.9), p);
    const col = INK[tone];
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = col;
    for (let i = 1; i < drawn.length; i++) {
      const a = drawn[i - 1] as Pt;
      const b = drawn[i] as Pt;
      ctx.lineWidth = width * u * (0.6 + 0.6 * Math.abs(Math.sin(i * 0.35 + seed)));
      trace(ctx, [a, b]);
      ctx.stroke();
    }
    const s0 = drawn[0] as Pt;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(s0[0], s0[1], width * 0.9 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (p < 1) tip = { pt: drawn.at(-1) as Pt, color: col };
  }

  /** Handwriting revealed left to right. */
  function write(s: string, x: number, y: number, o: Cue & { size?: number; align?: string } = {}) {
    const { at = 0, size = 32, tone = "ink", align = "left" } = o;
    const dur = o.dur ?? 0.05 * s.length + 0.1;
    const p = progress(t, at, dur);
    if (p <= 0) return;
    ctx.save();
    ctx.font = `600 ${Math.round(size * u)}px ${HAND}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.beginPath();
    ctx.rect(left - 4 * u, Y(y) - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = INK[tone];
    ctx.fillText(s, left, Y(y));
    ctx.restore();
    if (p < 1) tip = { pt: [left + w * p, Y(y)], color: INK[tone] };
  }

  /** Outlined bubble letters with a crosshatched shadow that fills in after the outline. */
  function bubble(
    s: string,
    x: number,
    y: number,
    o: Cue & { size?: number; align?: string; reveal?: boolean } = {},
  ) {
    const { at = 0, size = 60, tone = "ink", align = "left", reveal = true } = o;
    const dur = o.dur ?? 0.06 * s.length + 0.1;
    const p = reveal ? progress(t, at, dur) : t >= at ? 1 : 0;
    if (p <= 0) return 0;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${BUBBLE}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.beginPath();
    ctx.rect(left - 10 * u, Y(y) - size * u, (w + 20 * u) * p, size * 2 * u);
    ctx.clip();
    const sh = progress(t, at + dur * 0.6, 0.4);
    if (sh > 0) {
      ctx.globalAlpha = sh;
      ctx.fillStyle = hatch(tone, true);
      ctx.fillText(s, left + size * 0.07 * u, Y(y) + size * 0.07 * u);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#F7F5EE";
    ctx.fillText(s, left, Y(y));
    ctx.strokeStyle = INK[tone];
    ctx.lineWidth = 2 * u;
    ctx.lineJoin = "round";
    ctx.strokeText(s, left, Y(y));
    ctx.restore();
    if (p < 1) tip = { pt: [left + w * p, Y(y)], color: INK[tone] };
    return w;
  }

  /** A hatched drop shadow offset behind a shape, fading in after it's drawn. */
  function shadow(path: () => void, at: number, tone: Tone, cross = false) {
    const s = progress(t, at, 0.4);
    if (s <= 0) return;
    ctx.save();
    ctx.globalAlpha = s;
    ctx.translate(9 * u, 9 * u);
    path();
    ctx.fillStyle = hatch(tone, cross);
    ctx.fill();
    ctx.restore();
  }

  return {
    surface() {
      paper();
    },
    title(s, o = {}) {
      const { x = 0.11, y = 0.12, size = 78, at = 0 } = o;
      const w = bubble(s, x, y, { ...o, size, at, align: o.align ?? "left" });
      if (!w) return;
      const done = at + (o.dur ?? 0.06 * s.length + 0.1);
      pen(curve([X(x), Y(y) + size * 0.72 * u], [X(x) + w, Y(y) + size * 0.7 * u], -0.01, 16), {
        at: done,
        dur: 0.3,
        width: 2.5,
      });
    },
    label(s, x, y, o = {}) {
      write(s, x, y, { size: 40, align: "center", ...o });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const R = r * u;
      shadow(
        () => {
          ctx.beginPath();
          ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
        },
        at + 0.2,
        tone,
      );
      if (t >= at) {
        ctx.save();
        ctx.fillStyle = "#F7F5EE";
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      pen(ellipse(X(x), Y(y), R, R, 36, -Math.PI / 2, 1.06), { dur: 0.18, width: 2.6, ...o });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      const a: Pt = [X(x), Y(y)];
      const b: Pt = [X(x + w), Y(y + h)];
      shadow(
        () => {
          ctx.beginPath();
          ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
        },
        at + dur,
        tone,
        true,
      );
      if (t >= at + dur) {
        ctx.fillStyle = "#F7F5EE";
        ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      }
      pen([a, [b[0], a[1]], b, [a[0], b[1]], [a[0], a[1] - 3 * u]], { dur, ...o });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true } = o;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      pen(shaft, { ...o, at, dur, width: head ? 2.6 : 1.6 });
      if (!head) return;
      const end = shaft.at(-1) as Pt;
      const prev = shaft.at(-3) as Pt;
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 16 * u;
      pen(
        [
          [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
          end,
          [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s],
        ],
        { ...o, at: at + dur, dur: 0.1, width: 2.6 },
      );
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9, tone = "ink" } = o;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.28;
      const top = Y(y) + ry;
      const bottom = Y(y + h) - ry;
      const body = () => {
        ctx.beginPath();
        ctx.ellipse(cx, top, rx, ry, 0, Math.PI, 0);
        ctx.lineTo(cx + rx, bottom);
        ctx.ellipse(cx, bottom, rx, ry, 0, 0, Math.PI);
        ctx.closePath();
      };
      shadow(body, at + dur, tone, true);
      if (t >= at + dur) {
        body();
        ctx.fillStyle = "#F7F5EE";
        ctx.fill();
      }
      const half = (cy: number) => ellipse(cx, cy, rx, ry, 28, 0, 0.5);
      const step = dur / 5;
      pen(ellipse(cx, top, rx, ry, 28, Math.PI, 1), { ...o, at, dur: step * 1.5 });
      pen(
        [
          [cx - rx, top],
          [cx - rx, bottom],
        ],
        { ...o, at: at + step * 1.5, dur: step * 0.7 },
      );
      pen(half(bottom), { ...o, at: at + step * 2.2, dur: step });
      pen(
        [
          [cx + rx, bottom],
          [cx + rx, top],
        ],
        { ...o, at: at + step * 3.2, dur: step * 0.6 },
      );
      pen(half(top + (bottom - top) / 2), { ...o, at: at + step * 3.8, dur: step });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      bubble(value, x, y, {
        at,
        size,
        align: "center",
        tone: tone === "bad" ? "bad" : "ink",
        reveal: false,
      });
      if (sub)
        write(sub, x, y - (size * 0.8 * u) / H, {
          at: at + 0.2,
          size: size * 0.36,
          align: "center",
        });
      if (size >= 80)
        pen(ellipse(X(x), Y(y), size * 1.4 * u, size * 0.72 * u, 44, -Math.PI * 0.7, 1.08), {
          at: at + dur,
          dur: 0.4,
          tone: "bad",
          width: 2.4,
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 32) * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check") {
        pen(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.1, cy + s * 0.4],
            [cx + s * 0.6, cy - s * 0.5],
          ],
          { dur: 0.25, width: 3, ...o },
        );
      } else {
        const at = o.at ?? 0;
        pen(
          [
            [cx - s * 0.5, cy - s * 0.5],
            [cx + s * 0.5, cy + s * 0.5],
          ],
          { dur: 0.12, tone: "bad", width: 3, ...o },
        );
        pen(
          [
            [cx + s * 0.5, cy - s * 0.5],
            [cx - s * 0.5, cy + s * 0.5],
          ],
          { dur: 0.12, tone: "bad", width: 3, ...o, at: at + 0.12 },
        );
      }
    },
    finish() {
      const tp = tip as { pt: Pt; color: string } | null;
      if (!tp) return;
      const [x, y] = tp.pt;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI * 0.27);
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 10 * u;
      ctx.shadowOffsetX = 8 * u;
      ctx.shadowOffsetY = 10 * u;
      const L = 200 * u;
      const R = 6 * u;
      ctx.fillStyle = "rgba(230,236,245,0.92)";
      ctx.beginPath();
      ctx.roundRect(14 * u, -R, L, R * 2, R * 0.6);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = tp.color;
      ctx.fillRect(18 * u, -R * 0.35, L - 10 * u, R * 0.7);
      ctx.fillRect(L + 4 * u, -R, 14 * u, R * 2);
      ctx.fillStyle = "#C9C9C9";
      trace(
        ctx,
        [
          [0, 0],
          [16 * u, -R * 0.8],
          [16 * u, R * 0.8],
        ],
        true,
      );
      ctx.fill();
      ctx.restore();
    },
  };
}

export default {
  id: "ballpoint-notebook",
  name: "Ballpoint notebook",
  category: "Hand-drawn",
  make,
} satisfies Style;
