// Weimar workshop poster: aged cream stock, heavy black rules, primary red,
// yellow and blue in flat circles, squares and triangles, lowercase
// geometric type and black name tags. Parts drop onto the grid and snap
// with a small overshoot; tags fall onto what they name; a red ring is
// drawn round the number that matters.
import {
  alpha,
  arrowhead,
  clamp,
  counting,
  curve,
  ellipse,
  frame,
  hash,
  type Look,
  type Pt,
  progress,
  type Style,
  spring,
  type Tone,
  trace,
} from "./look.ts";

const CREAM = "#ECE3D0";
const BLACK = "#1D1B19";
const RED = "#D23A2C";
const YELLOW = "#E9B02A";
const BLUE = "#24539E";
const TONE: Record<Tone, string> = {
  ink: BLACK,
  accent: BLUE,
  good: YELLOW,
  bad: RED,
  muted: "#9C9384",
};
const PRIMARY = [RED, YELLOW, BLUE];
const GEO = '"Futura", "Avenir Next", "Century Gothic", "Helvetica Neue", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const font = (size: number, w = 600) => `${w} ${Math.round(size * u)}px ${GEO}`;
  const drop = (at = 0) => spring(t, { start: at, stiffness: 220, damping: 13 });
  const g = globalThis as any;
  g.__bauhausStock ??= new Map();
  const cache: Map<string, any> = g.__bauhausStock;

  /** Draw something dropped from above onto its place, snapping in. */
  function dropped(at: number | undefined, draw: () => void) {
    const s = drop(at);
    if (s <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(s * 3);
    ctx.translate(0, (1 - s) * -60 * u);
    draw();
    ctx.restore();
  }

  function tag(s: string, cx: number, cy: number, size: number, bg: string) {
    ctx.font = font(size);
    const w = ctx.measureText(s.toLowerCase()).width + size * 0.6 * u;
    const h = size * 1.35 * u;
    ctx.fillStyle = bg;
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.fillStyle = CREAM;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s.toLowerCase(), cx, cy + 1 * u);
  }

  function stock() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const x = c.getContext("2d");
      x.fillStyle = CREAM;
      x.fillRect(0, 0, W, H);
      for (let i = 0; i < 1800; i++) {
        x.fillStyle = hash(i) > 0.5 ? "rgba(255,255,245,0.10)" : "rgba(110,80,40,0.06)";
        x.beginPath();
        x.arc(hash(i * 1.3) * W, hash(i * 2.7) * H, (1 + hash(i * 3.9) * 6) * u, 0, Math.PI * 2);
        x.fill();
      }
      // faint print grid
      x.strokeStyle = "rgba(29,27,25,0.06)";
      x.lineWidth = 1 * u;
      for (let k = 1; k < 4; k++) {
        x.beginPath();
        x.moveTo((W / 4) * k, 0);
        x.lineTo((W / 4) * k, H);
        x.moveTo(0, (H / 3) * k);
        x.lineTo(W, (H / 3) * k);
        x.stroke();
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  /** Ink mottle inside a flat shape: lighter flecks where the roller missed. */
  function mottle(x: number, y: number, w: number, h: number) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(255,250,235,0.12)";
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      ctx.arc(
        x + hash(i * 3.3 + x) * w,
        y + hash(i * 4.7 + y) * h,
        (2 + hash(i) * 5) * u,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  return {
    surface() {
      stock();
      // heavy rules: a vertical at the left and a floor along the bottom, drawn out
      const p = progress(t, 0, 0.8);
      ctx.fillStyle = BLACK;
      ctx.fillRect(X(0.015), Y(0.04), 10 * u, (Y(0.96) - Y(0.04)) * p);
      ctx.fillRect(X(0.015), Y(0.95), (X(0.985) - X(0.015)) * p, 10 * u);
      // a composition corner: red disc, yellow bar, blue triangle
      const q = drop(0.3);
      if (q > 0) {
        ctx.save();
        ctx.translate(0, (1 - q) * -40 * u);
        ctx.beginPath();
        ctx.arc(X(0.93), Y(0.14), 44 * u, 0, Math.PI * 2);
        ctx.fillStyle = RED;
        ctx.fill();
        ctx.fillStyle = YELLOW;
        ctx.fillRect(X(0.86), Y(0.22), 70 * u, 14 * u);
        ctx.beginPath();
        ctx.moveTo(X(0.84), Y(0.17));
        ctx.lineTo(X(0.84), Y(0.25));
        ctx.lineTo(X(0.84) + 46 * u, Y(0.25));
        ctx.closePath();
        ctx.fillStyle = BLUE;
        ctx.fill();
        ctx.restore();
      }
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.09, size = 62, at = 0 } = o;
      dropped(at, () => {
        ctx.font = font(size, 700);
        ctx.fillStyle = BLACK;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(s.toLowerCase(), X(x), Y(y));
        ctx.fillStyle = RED;
        ctx.fillRect(X(x), Y(y) + size * 0.65 * u, 14 * u, 14 * u);
      });
    },
    label(s, x, y, o = {}) {
      const { size = 34, align = "center", tone = "ink", at = 0 } = o;
      dropped(at, () => {
        ctx.font = font(size);
        const w = ctx.measureText(s.toLowerCase()).width + size * 0.6 * u;
        const cx = align === "center" ? X(x) : align === "right" ? X(x) - w / 2 : X(x) + w / 2;
        tag(s, cx, Y(y), size, tone === "bad" ? RED : tone === "accent" ? BLUE : BLACK);
      });
    },
    node(x, y, r, o = {}) {
      const R = r * u;
      const k = Math.floor(hash(x * 51 + y * 17) * 3);
      const color =
        o.tone && o.tone !== "accent"
          ? TONE[o.tone]
          : (PRIMARY[Math.floor(hash(x * 7 + y * 93) * 3)] as string);
      dropped(o.at, () => {
        ctx.beginPath();
        if (k === 0) ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
        else if (k === 1) ctx.rect(X(x) - R * 0.9, Y(y) - R * 0.9, R * 1.8, R * 1.8);
        else {
          ctx.moveTo(X(x), Y(y) - R * 1.1);
          ctx.lineTo(X(x) + R * 1.05, Y(y) + R * 0.85);
          ctx.lineTo(X(x) - R * 1.05, Y(y) + R * 0.85);
          ctx.closePath();
        }
        ctx.fillStyle = color;
        ctx.fill();
        mottle(X(x) - R, Y(y) - R, R * 2, R * 2);
      });
    },
    box(x, y, w, h, o = {}) {
      const color = TONE[o.tone ?? "accent"];
      dropped(o.at, () => {
        ctx.fillStyle = alpha(color, 0.22);
        ctx.fillRect(X(x), Y(y), X(w), Y(h));
        ctx.fillStyle = color;
        ctx.fillRect(X(x), Y(y), X(w), 12 * u);
        ctx.lineWidth = 5 * u;
        ctx.strokeStyle = BLACK;
        ctx.strokeRect(X(x), Y(y), X(w), Y(h));
        // the half-disc ear of a constructed figure
        ctx.beginPath();
        ctx.arc(X(x), Y(y + h / 2), 16 * u, Math.PI / 2, -Math.PI / 2);
        ctx.fillStyle = RED;
        ctx.fill();
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 24);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      trace(ctx, shown);
      ctx.strokeStyle = head ? TONE[tone] : alpha(BLACK, 0.55);
      ctx.lineWidth = (head ? 7 : 2) * u;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 24 * u, false);
        ctx.fillStyle = TONE[tone];
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const n = 4;
      const sh = Y(h) / n;
      for (let i = n - 1; i >= 0; i--) {
        dropped(at + (n - 1 - i) * 0.12, () => {
          const yy = Y(y) + sh * i;
          ctx.fillStyle = PRIMARY[i % 3] as string;
          ctx.fillRect(X(x), yy + 3 * u, X(w), sh - 6 * u);
          ctx.beginPath();
          ctx.rect(X(x), yy + 3 * u, X(w), sh - 6 * u);
          mottle(X(x), yy, X(w), sh);
          ctx.beginPath();
          ctx.arc(X(x + w) - 12 * u, yy + sh / 2, 5 * u, 0, Math.PI * 2);
          ctx.fillStyle = BLACK;
          ctx.fill();
        });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "ink" } = o;
      const str = count ? counting(t, at, dur, count) + s : s;
      dropped(at, () => {
        ctx.font = font(size, 700);
        ctx.fillStyle = tone === "good" || tone === "accent" || tone === "ink" ? BLACK : TONE[tone];
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(str, X(x), Y(y) - (sub ? size * 0.12 * u : 0));
        if (sub) {
          ctx.font = font(size * 0.36);
          ctx.fillText(sub.toLowerCase(), X(x), Y(y) + size * 0.6 * u);
        }
      });
      if (sub) {
        const p = progress(t, at + dur, 0.5);
        if (p > 0) {
          ctx.font = font(size, 700);
          const w = ctx.measureText(`${count ? count[1] : ""}${s}`).width;
          trace(
            ctx,
            ellipse(X(x), Y(y) - size * 0.12 * u, w * 0.85, size * 0.85 * u, 48, -2.4, p * 1.04),
          );
          ctx.strokeStyle = RED;
          ctx.lineWidth = 5 * u;
          ctx.stroke();
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 30) * u;
      dropped(o.at, () => {
        ctx.save();
        ctx.strokeStyle = kind === "check" ? BLACK : RED;
        ctx.lineWidth = r * 0.32;
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
        const [cx, cy] = [X(x), Y(y)];
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.6, cy],
            [cx - r * 0.15, cy + r * 0.45],
            [cx + r * 0.7, cy - r * 0.55],
          ]);
        else {
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.55, cy - r * 0.55);
          ctx.lineTo(cx + r * 0.55, cy + r * 0.55);
          ctx.moveTo(cx + r * 0.55, cy - r * 0.55);
          ctx.lineTo(cx - r * 0.55, cy + r * 0.55);
        }
        ctx.stroke();
        ctx.restore();
      });
    },
    finish() {},
  };
}

export default {
  id: "bauhaus",
  name: "Workshop poster",
  category: "Art & Design Movements",
  make,
} satisfies Style;
