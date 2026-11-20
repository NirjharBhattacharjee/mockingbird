// Risograph zine: three fluorescent spot inks (yellow, pink, blue) printed
// as separate passes and multiplied on off-white stock. Each element arrives
// as its plates rolling on one after another and sliding toward register,
// never quite landing; grain eats the solids and the print boils at 8 fps.
import {
  along,
  clamp,
  counting,
  curve,
  ellipse,
  frame,
  hash,
  type Look,
  type Pt,
  roughen,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const STOCK = "#F3EEE3";
const YEL = "#FFE33B";
const PINK = "#FF4FA0";
const BLUE = "#3B5BA9";
const SANS = '"Montserrat", "Noto Color Emoji", sans-serif';
const MONO = '"Courier Prime", "Noto Color Emoji", monospace';
const LINE: Record<Tone, string> = { ink: BLUE, accent: BLUE, good: BLUE, bad: PINK, muted: BLUE };
const SOLID: Record<Tone, string> = { ink: YEL, accent: YEL, good: YEL, bad: PINK, muted: YEL };

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const boil = Math.floor(t * 8);
  const g = globalThis as any;
  g.__risoGrain ??= new Map();
  const cache: Map<string, any> = g.__risoGrain;

  /** Where a plate sits: it rolls in offset and slides most of the way into register. */
  function plate(at: number, k: number): { p: number; dx: number; dy: number } {
    const p = clamp((t - at - k * 0.12) / 0.3);
    const settle = 1 - (1 - p) ** 3;
    const miss = [
      [3, -2],
      [-4, -3],
      [3, 3],
    ][k] as number[];
    const jx = (hash(boil * 1.3 + k * 7) - 0.5) * 1.4;
    const jy = (hash(boil * 2.1 + k * 3) - 0.5) * 1.4;
    return {
      p,
      dx: (miss[0] as number) * u + (1 - settle) * 30 * u * (k === 1 ? -1 : 1) + jx * u,
      dy: (miss[1] as number) * u + (1 - settle) * -18 * u + jy * u,
    };
  }

  /** Draw `draw` once per ink plate, multiplied: 0 yellow, 1 pink, 2 blue. */
  function plates(at: number, draw: (k: number, color: string) => void, use = [0, 1, 2]) {
    const colors = [YEL, PINK, BLUE];
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    for (const k of use) {
      const { p, dx, dy } = plate(at, k);
      if (p <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p * 2);
      ctx.translate(dx, dy);
      draw(k, colors[k] as string);
      ctx.restore();
    }
    ctx.restore();
  }

  /** A cached tile of paper-coloured speckles laid over everything: grainy, patchy solids. */
  function grainTile() {
    const key = `${W}x${H}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      for (let i = 0; i < (W * H) / 26; i++) {
        c.fillStyle = `rgba(243,238,227,${0.25 + 0.5 * hash(i * 0.77)})`;
        c.fillRect(hash(i * 1.91) * W, hash(i * 2.73) * H, 1.6, 1.6);
      }
      // Roller streaks.
      for (let i = 0; i < 14; i++) {
        c.fillStyle = "rgba(243,238,227,0.12)";
        c.fillRect(0, hash(i * 9.3) * H, W, (2 + hash(i) * 6) * 1);
      }
      cache.set(key, tile);
    }
    return tile;
  }

  function dots(x: number, y: number, w: number, h: number, color: string, step = 7) {
    ctx.fillStyle = color;
    for (let gy = y + step / 2; gy < y + h; gy += step * u)
      for (let gx = x + step / 2; gx < x + w; gx += step * u) {
        ctx.beginPath();
        ctx.arc(gx, gy, 1.6 * u, 0, Math.PI * 2);
        ctx.fill();
      }
  }

  return {
    surface() {
      ctx.fillStyle = STOCK;
      ctx.fillRect(0, 0, W, H);
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.08, size = 56, at = 0 } = o;
      const font = `800 ${Math.round(size * u)}px ${SANS}`;
      plates(at, (k, color) => {
        ctx.font = font;
        ctx.textAlign = o.align ?? "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = color;
        if (k === 0) {
          // A yellow sun printed behind the second word.
          ctx.beginPath();
          ctx.arc(
            X(x) + ctx.measureText(s.split(" ")[0] ?? "").width + size * 0.9 * u,
            Y(y),
            size * 0.62 * u,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        } else ctx.fillText(s, X(x), Y(y));
        if (k === 1) ctx.fillRect(X(x), Y(y) + size * 0.62 * u, ctx.measureText(s).width, 3 * u);
      });
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 26, tone = "ink", align = "center" } = o;
      plates(
        at,
        (_k, color) => {
          ctx.font = `700 ${Math.round(size * u)}px ${MONO}`;
          ctx.letterSpacing = `${(size * 0.12 * u).toFixed(1)}px`;
          ctx.textAlign = align;
          ctx.textBaseline = "middle";
          ctx.fillStyle = color;
          ctx.fillText(s.toUpperCase(), X(x), Y(y));
        },
        tone === "bad" ? [1] : [2],
      );
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const R = r * u;
      plates(at, (k, color) => {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
        if (k === 2) {
          ctx.lineWidth = 3 * u;
          ctx.strokeStyle = color;
          ctx.stroke();
        } else if (k === 0) {
          ctx.fillStyle = tone === "bad" ? PINK : color;
          ctx.fill();
        } else {
          // Pink tint only on the lower half, like a second pass of shading.
          ctx.save();
          ctx.clip();
          dots(X(x) - R, Y(y), R * 2, R, color, 5);
          ctx.restore();
        }
      });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
      plates(at, (k, color) => {
        if (k === 0) {
          ctx.fillStyle = SOLID[tone];
          ctx.beginPath();
          ctx.roundRect(l, tp, ww, hh, 10 * u);
          ctx.fill();
        } else if (k === 1) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(l, tp, ww, hh, 10 * u);
          ctx.clip();
          dots(l, tp + hh * 0.7, ww, hh * 0.3, color, 6);
          ctx.restore();
        } else {
          ctx.lineWidth = 4 * u;
          ctx.strokeStyle = color;
          ctx.beginPath();
          ctx.roundRect(l, tp, ww, hh, 10 * u);
          ctx.stroke();
        }
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      // Dotted blue flow lines; the correction is a pink dashed swoop.
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = clamp((t - at) / dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const res = along(pts, p);
      const color = LINE[tone];
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.translate(tone === "bad" ? -2 * u : 2 * u, tone === "bad" ? 2 * u : -1 * u);
      ctx.strokeStyle = color;
      ctx.lineCap = "round";
      ctx.lineWidth = (head ? 4 : 1.5) * u;
      if (head) ctx.setLineDash(tone === "bad" ? [12 * u, 8 * u] : [0.1, 9 * u]);
      if (!head) ctx.globalAlpha = 0.55;
      trace(ctx, res.points);
      ctx.stroke();
      ctx.setLineDash([]);
      if (head && p >= 1) {
        const tip = pts.at(-1) as Pt;
        const s = 16 * u;
        trace(
          ctx,
          [
            tip,
            [tip[0] - Math.cos(res.angle - 0.5) * s, tip[1] - Math.sin(res.angle - 0.5) * s],
            [tip[0] - Math.cos(res.angle + 0.5) * s, tip[1] - Math.sin(res.angle + 0.5) * s],
          ],
          true,
        );
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      // A fanned stack of zine cards: yellow face, pink band, blue keyline.
      const { at = 0, dur = 0.8 } = o;
      for (let i = 0; i < 3; i++) {
        const cx = X(x + w / 2) + (i - 1) * 10 * u;
        const cy = Y(y + h / 2) + (1 - i) * 12 * u;
        const cw = X(w) * 0.95;
        const ch = Y(h) * 0.7;
        plates(at + (i * dur) / 4, (k, color) => {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate((i - 1) * 0.14);
          if (k === 0) {
            ctx.fillStyle = color;
            ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
          } else if (k === 1) {
            ctx.fillStyle = color;
            ctx.fillRect(-cw / 2, ch * 0.22, cw, ch * 0.28);
          } else {
            ctx.lineWidth = 3 * u;
            ctx.strokeStyle = color;
            ctx.strokeRect(-cw / 2, -ch / 2, cw, ch);
            // A tiny cat-ish face as the picture on the card.
            ctx.beginPath();
            ctx.arc(0, -ch * 0.08, cw * 0.2, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      const big = size >= 80;
      plates(
        at,
        (k, color) => {
          ctx.font = `800 ${Math.round(size * u)}px ${SANS}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = color;
          if (k === 0) {
            if (big) {
              ctx.beginPath();
              ctx.arc(X(x), Y(y), size * 0.95 * u, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (k === 1) {
            ctx.fillText(value, X(x), Y(y));
            // A bad stat skips plate 2, so its subtitle goes on this one.
            if (sub && tone === "bad") {
              ctx.font = `700 ${Math.round(size * 0.24 * u)}px ${MONO}`;
              ctx.fillText(sub.toUpperCase(), X(x), Y(y) - size * 0.75 * u);
            }
          } else {
            ctx.fillText(value, X(x) + 3 * u, Y(y) + 3 * u);
            if (sub) {
              ctx.font = `700 ${Math.round(size * 0.24 * u)}px ${MONO}`;
              ctx.fillText(sub.toUpperCase(), X(x), Y(y) - size * 0.75 * u);
            }
          }
        },
        tone === "bad" ? [0, 1] : [0, 1, 2],
      );
      // A scribbled pink ring round the big result.
      if (big && count) {
        const p = clamp((t - at - dur) / 0.5);
        if (p > 0) {
          ctx.save();
          ctx.globalCompositeOperation = "multiply";
          ctx.strokeStyle = PINK;
          ctx.lineWidth = 3.5 * u;
          trace(
            ctx,
            along(
              roughen(
                ellipse(X(x), Y(y), size * 1.25 * u, size * 0.7 * u, 40, -2.2, 1.15),
                3 * u,
                4,
              ),
              p,
            ).points,
          );
          ctx.stroke();
          ctx.restore();
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const s = (o.size ?? 30) * u;
      const cx = X(x);
      const cy = Y(y);
      const p = clamp((t - at) / 0.3);
      if (p <= 0) return;
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.lineWidth = 6 * u;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = kind === "check" ? BLUE : PINK;
      if (kind === "check")
        trace(
          ctx,
          along(
            [
              [cx - s * 0.5, cy],
              [cx - s * 0.1, cy + s * 0.4],
              [cx + s * 0.6, cy - s * 0.55],
            ],
            p,
          ).points,
        );
      else {
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.5, cy - s * 0.5);
        ctx.lineTo(cx + s * 0.5 * (2 * p - 1), cy + s * 0.5 * (2 * p - 1));
        if (p > 0.5) {
          ctx.moveTo(cx + s * 0.5, cy - s * 0.5);
          ctx.lineTo(cx - s * 0.5, cy + s * 0.5);
        }
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      ctx.save();
      // The grain boils: the same tile, nudged a pixel or two every 8th of a second.
      ctx.drawImage(grainTile(), (hash(boil) - 0.5) * 4, (hash(boil + 3) - 0.5) * 4);
      ctx.restore();
    },
  };
}

export default { id: "risograph", name: "Risograph zine", category: "Print", make } satisfies Style;
