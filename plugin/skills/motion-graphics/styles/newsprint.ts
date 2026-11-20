// Vintage newsprint: a 1950s front page on yellowed pulp. Condensed banner
// type, thin column rules and greeked body text at the foot, coarse halftone
// for anything solid, crisp diagram rules with filled heads, and a reader's
// red grease pencil for the correction. The headline whirls in and slaps
// flat; everything else inks in as if the press just reached it.
import {
  along,
  clamp,
  counting,
  curve,
  ellipse,
  frame,
  hash,
  type Look,
  leftOf,
  type Pt,
  roughen,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const PULP = "#E9DDBF";
const INK = "#1F1C18";
const GREASE = "#C8392E";
const COND = '"Oswald", "Noto Color Emoji", sans-serif';
const SERIF = '"Charis SIL", "Noto Color Emoji", serif';
const TONE: Record<Tone, string> = {
  ink: INK,
  accent: INK,
  good: INK,
  bad: GREASE,
  muted: "#6E6556",
};

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);

  /** Ink coming up: a quick fade with a hair of blur-free spread. */
  const inked = (at = 0, dur = 0.25) => clamp((t - at) / dur);

  /** A halftone fill of a rectangle: dots growing toward the bottom right. */
  function halftone(x: number, y: number, w: number, h: number, dark = 0.6) {
    const s = 6 * u;
    ctx.fillStyle = INK;
    for (let gy = y + s / 2; gy < y + h; gy += s)
      for (let gx = x + s / 2; gx < x + w; gx += s) {
        const f = clamp(0.25 + dark * (((gx - x) / w) * 0.5 + ((gy - y) / h) * 0.5));
        ctx.beginPath();
        ctx.arc(gx, gy, s * 0.5 * f, 0, Math.PI * 2);
        ctx.fill();
      }
  }

  function cond(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align = "left",
    weight = 700,
  ) {
    ctx.font = `${weight} ${Math.round(size * u)}px ${COND}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  function greeked(x: number, y: number, w: number, h: number, seed: number) {
    ctx.fillStyle = "rgba(31,28,24,0.55)";
    for (let ly = y, i = 0; ly < y + h; ly += 9 * u, i++) {
      let lx = x;
      while (lx < x + w - 8 * u) {
        const ww = Math.min((8 + 26 * hash(seed + i * 13.1 + lx)) * u, x + w - lx);
        ctx.fillRect(lx, ly, ww, 3 * u);
        lx += ww + 4 * u;
      }
    }
  }

  return {
    surface() {
      ctx.fillStyle = PULP;
      ctx.fillRect(0, 0, W, H);
      // Show-through from the reverse: faint mirrored columns.
      ctx.fillStyle = "rgba(60,50,30,0.05)";
      for (let i = 0; i < 40; i++)
        ctx.fillRect(hash(i * 2.2) * W, hash(i * 3.3) * H, (60 + 140 * hash(i)) * u, 3 * u);
      // Age: darker edges, a few foxing spots.
      const v = ctx.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.35,
        W / 2,
        H / 2,
        Math.hypot(W, H) * 0.6,
      );
      v.addColorStop(0, "rgba(120,90,40,0)");
      v.addColorStop(1, "rgba(120,90,40,0.28)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = "rgba(150,110,50,0.08)";
        ctx.beginPath();
        ctx.arc(hash(i * 7.7) * W, hash(i * 9.1) * H, (6 + 14 * hash(i)) * u, 0, Math.PI * 2);
        ctx.fill();
      }
      // The page furniture: rules and greeked columns along the foot.
      const m0 = W * 0.03;
      ctx.fillStyle = INK;
      ctx.fillRect(m0, H * 0.18, W - m0 * 2, 1.5 * u);
      ctx.fillRect(m0, H * 0.18 + 4 * u, W - m0 * 2, 0.8 * u);
      const top = H * 0.82;
      ctx.fillRect(m0, top - 8 * u, W - m0 * 2, 1.5 * u);
      const cols = 5;
      const cw = (W - m0 * 2) / cols;
      for (let c = 0; c < cols; c++) {
        greeked(m0 + c * cw + 8 * u, top, cw - 16 * u, H - top - 16 * u, c * 31);
        if (c) ctx.fillRect(m0 + c * cw, top, 0.8 * u, H - top - 16 * u);
      }
    },
    title(s, o = {}) {
      // The headline spins up out of the dark and slaps flat.
      const { x = 0.03, y = 0.1, size = 76, at = 0, dur = 0.9 } = o;
      const p = clamp((t - at) / dur);
      if (p <= 0) return;
      const e = 1 - (1 - p) ** 3;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${COND}`;
      const w = ctx.measureText(s.toUpperCase()).width;
      const cx = leftOf(X(x), w, o.align) + w / 2;
      ctx.translate(cx, Y(y));
      ctx.rotate((1 - e) * Math.PI * 4);
      ctx.scale(0.05 + 0.95 * e, 0.05 + 0.95 * e);
      cond(s.toUpperCase(), 0, 0, size, INK, "center");
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 24, tone = "ink", align = "center" } = o;
      const p = inked(at);
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.letterSpacing = `${(size * 0.06 * u).toFixed(1)}px`;
      if (tone === "bad") {
        ctx.font = `italic 400 ${Math.round(size * 1.1 * u)}px ${SERIF}`;
        ctx.textAlign = align;
        ctx.textBaseline = "middle";
        ctx.fillStyle = INK;
        ctx.fillText(s, X(x), Y(y));
      } else cond(s.toUpperCase(), X(x), Y(y), size, TONE[tone], align, 600);
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const p = inked(at, 0.2);
      if (p <= 0) return;
      const R = r * u;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
      ctx.fillStyle = PULP;
      ctx.fill();
      ctx.save();
      ctx.clip();
      halftone(X(x) - R, Y(y) - R, R * 2, R * 2, tone === "accent" ? 0.35 : 0.2);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0 } = o;
      const p = inked(at, 0.3);
      if (p <= 0) return;
      const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
      ctx.save();
      ctx.globalAlpha = p;
      ctx.fillStyle = "#EFE5CB";
      ctx.fillRect(l, tp, ww, hh);
      ctx.lineWidth = 2.5 * u;
      ctx.strokeStyle = INK;
      ctx.strokeRect(l, tp, ww, hh);
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = clamp((t - at) / dur);
      if (p <= 0) return;
      const grease = tone === "bad";
      const base = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 28);
      const pts = grease ? roughen(base, 1.8 * u, x2 * 41) : base;
      const res = along(pts, p);
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = grease ? GREASE : INK;
      ctx.globalAlpha = grease ? 0.85 : head ? 1 : 0.55;
      ctx.lineWidth = (grease ? 5 : head ? 2.4 : 1) * u;
      trace(ctx, res.points);
      ctx.stroke();
      if (head && p >= 1) {
        const tip = pts.at(-1) as Pt;
        const s = 15 * u;
        trace(
          ctx,
          [
            tip,
            [tip[0] - Math.cos(res.angle - 0.4) * s, tip[1] - Math.sin(res.angle - 0.4) * s],
            [tip[0] - Math.cos(res.angle + 0.4) * s, tip[1] - Math.sin(res.angle + 0.4) * s],
          ],
          true,
        );
        ctx.fillStyle = grease ? GREASE : INK;
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      // A wire photo: a framed halftone block of a cabinet of tape reels, its reels turning.
      const { at = 0 } = o;
      const p = inked(at, 0.5);
      if (p <= 0) return;
      const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
      ctx.save();
      ctx.globalAlpha = p;
      ctx.fillStyle = "#EFE5CB";
      ctx.fillRect(l, tp, ww, hh);
      halftone(l, tp, ww, hh, 0.75);
      for (let i = 0; i < 2; i++) {
        const cx = l + ww / 2;
        const cy = tp + hh * (0.3 + i * 0.4);
        const r = Math.min(ww, hh) * 0.2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = "#EFE5CB";
        ctx.fill();
        ctx.lineWidth = 2 * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
        for (let k = 0; k < 3; k++) {
          const a = t * 2 * (i ? -1 : 1) + (k * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, r * 0.18, 0, Math.PI * 2);
          ctx.fillStyle = INK;
          ctx.fill();
        }
      }
      ctx.lineWidth = 2 * u;
      ctx.strokeStyle = INK;
      ctx.strokeRect(l, tp, ww, hh);
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      const p = inked(at);
      if (p <= 0) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.globalAlpha = p;
      const big = size >= 80;
      if (big) {
        // A ruled stat box, like a by-the-numbers sidebar.
        ctx.font = `600 ${Math.round(size * u)}px ${COND}`;
        const bw =
          Math.max(
            ctx.measureText(`${count ? count[1] : ""}${s}`).width,
            ctx.measureText(value).width,
          ) +
          size * 0.6 * u;
        const bh = size * (sub ? 1.75 : 1.3) * u;
        const top = Y(y) - bh / 2 - (sub ? size * 0.22 * u : 0);
        ctx.fillStyle = "#EFE5CB";
        ctx.fillRect(X(x) - bw / 2, top, bw, bh);
        ctx.lineWidth = 2.5 * u;
        ctx.strokeStyle = INK;
        ctx.strokeRect(X(x) - bw / 2, top, bw, bh);
      }
      cond(value, X(x), Y(y) + (sub ? size * 0.12 * u : 0), size, TONE[tone], "center", 600);
      if (sub) {
        ctx.letterSpacing = `${(size * 0.04 * u).toFixed(1)}px`;
        cond(sub.toUpperCase(), X(x), Y(y) - size * 0.52 * u, size * 0.24, INK, "center", 700);
      }
      ctx.restore();
      // The reader rings the final number in grease pencil.
      if (big && count) {
        const q = clamp((t - at - dur) / 0.5);
        if (q > 0) {
          ctx.save();
          ctx.strokeStyle = GREASE;
          ctx.globalAlpha = 0.85;
          ctx.lineWidth = 4 * u;
          ctx.lineCap = "round";
          trace(
            ctx,
            along(
              roughen(
                ellipse(
                  X(x),
                  Y(y) + size * 0.12 * u,
                  size * 1.25 * u,
                  size * 0.62 * u,
                  36,
                  -2.4,
                  1.1,
                ),
                2.5 * u,
                7,
              ),
              q,
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
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (kind === "check") {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3.5 * u;
        trace(
          ctx,
          along(
            [
              [cx - s * 0.5, cy],
              [cx - s * 0.12, cy + s * 0.4],
              [cx + s * 0.6, cy - s * 0.55],
            ],
            p,
          ).points,
        );
      } else {
        ctx.strokeStyle = GREASE;
        ctx.lineWidth = 5 * u;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.5, cy - s * 0.5);
        ctx.lineTo(cx + s * 0.5, cy + s * 0.5);
        ctx.moveTo(cx + s * 0.5, cy - s * 0.5);
        ctx.lineTo(cx - s * 0.5, cy + s * 0.5);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {},
  };
}

export default {
  id: "newsprint",
  name: "Vintage newsprint",
  category: "Print",
  make,
} satisfies Style;
