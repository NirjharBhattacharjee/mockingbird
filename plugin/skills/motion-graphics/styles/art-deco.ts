// Jazz-age gilt on black lacquer: gold rays fan up from the foot of the
// frame, a stepped double border with fan corners, spaced capitals. Lines
// inscribe themselves, letters are foil-stamped one at a time, and a glint
// runs across the gold once a piece lands.
import {
  alpha,
  arrowhead,
  clamp,
  counting,
  curve,
  easeIn,
  expo,
  frame,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
  text,
  trace,
} from "./look.ts";

const LACQUER = "#0E0C0A";
const GOLD = "#CDA85C";
const CREAM = "#F1E4C3";
const TONE: Record<Tone, string> = {
  ink: GOLD,
  accent: "#E9C979",
  good: "#9CC7A4",
  bad: "#D0645A",
  muted: "#7A6640",
};
const DECO = '"Montserrat", "Noto Color Emoji", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const font = (size: number, w = 500) => `${w} ${Math.round(size * u)}px ${DECO}`;
  const g = globalThis as any;
  g.__decoRays ??= new Map();
  const cache: Map<string, any> = g.__decoRays;
  void easeIn;

  /** Stroke a polyline inscribed from `at` over `dur`. */
  function inscribe(points: Pt[], at: number, dur: number, color = GOLD, width = 2) {
    const p = progress(t, at, dur);
    if (p <= 0) return 0;
    const n = Math.max(2, Math.round(points.length * expo(p)));
    ctx.save();
    trace(ctx, points.slice(0, n));
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
    return p;
  }

  /** Points round a rectangle with clipped (stepped) corners, from the top centre. */
  function stepped(x: number, y: number, w: number, h: number, c: number): Pt[] {
    return [
      [x + w / 2, y],
      [x + w - c, y],
      [x + w - c, y + c * 0.5],
      [x + w - c * 0.5, y + c * 0.5],
      [x + w - c * 0.5, y + c],
      [x + w, y + c],
      [x + w, y + h - c],
      [x + w - c * 0.5, y + h - c],
      [x + w - c * 0.5, y + h - c * 0.5],
      [x + w - c, y + h - c * 0.5],
      [x + w - c, y + h],
      [x + c, y + h],
      [x + c, y + h - c * 0.5],
      [x + c * 0.5, y + h - c * 0.5],
      [x + c * 0.5, y + h - c],
      [x, y + h - c],
      [x, y + c],
      [x + c * 0.5, y + c],
      [x + c * 0.5, y + c * 0.5],
      [x + c, y + c * 0.5],
      [x + c, y],
      [x + w / 2, y],
    ];
  }

  /** Spaced capitals stamped letter by letter, with a glint sweeping after. */
  function stamp(
    s: string,
    x: number,
    y: number,
    size: number,
    at: number,
    color: string,
    align = "center",
    w = 500,
  ) {
    const str = s.toUpperCase();
    ctx.save();
    ctx.font = font(size, w);
    ctx.letterSpacing = `${Math.round(size * 0.12 * u)}px`;
    const full = ctx.measureText(str).width;
    const start = align === "center" ? x - full / 2 : align === "right" ? x - full : x;
    let left = start;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const per = Math.min(0.06, 0.6 / str.length);
    for (const [i, ch] of [...str].entries()) {
      const p = progress(t, at + i * per, 0.14);
      const cw = ctx.measureText(ch).width;
      if (p > 0) {
        ctx.globalAlpha = p;
        ctx.fillStyle = p < 1 ? CREAM : color;
        ctx.fillText(ch, left, y - (1 - p) * 6 * u);
      }
      left += cw;
    }
    const gp = progress(t, at + str.length * per + 0.2, 0.7);
    if (gp > 0 && gp < 1) {
      const gx = start - 30 * u + gp * (full + 60 * u);
      const gr = ctx.createLinearGradient(gx - 30 * u, 0, gx + 30 * u, 0);
      gr.addColorStop(0, "rgba(255,250,230,0)");
      gr.addColorStop(0.5, "rgba(255,250,230,0.95)");
      gr.addColorStop(1, "rgba(255,250,230,0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = gr;
      ctx.fillText(str, start, y);
    }
    ctx.restore();
    return full;
  }

  function rays() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const x = c.getContext("2d");
      const bg = x.createRadialGradient(
        W / 2,
        H * 0.55,
        0,
        W / 2,
        H * 0.55,
        Math.hypot(W, H) * 0.6,
      );
      bg.addColorStop(0, "#2A2118");
      bg.addColorStop(1, LACQUER);
      x.fillStyle = bg;
      x.fillRect(0, 0, W, H);
      const ox = W / 2;
      const oy = H * 1.05;
      for (let i = 0; i < 64; i++) {
        const a = Math.PI + (i / 63) * Math.PI;
        const a2 = a + Math.PI / 63 / 2;
        x.beginPath();
        x.moveTo(ox, oy);
        x.lineTo(ox + Math.cos(a) * W * 1.2, oy + Math.sin(a) * W * 1.2);
        x.lineTo(ox + Math.cos(a2) * W * 1.2, oy + Math.sin(a2) * W * 1.2);
        x.closePath();
        const gr = x.createRadialGradient(ox, oy, 0, ox, oy, H);
        gr.addColorStop(0, "rgba(205,168,92,0.22)");
        gr.addColorStop(1, "rgba(205,168,92,0.02)");
        x.fillStyle = gr;
        x.fill();
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  function corner(cx: number, cy: number, sx: number, sy: number, p: number) {
    ctx.save();
    ctx.strokeStyle = alpha(GOLD, p);
    ctx.lineWidth = 1.5 * u;
    for (let r = 1; r <= 3; r++) {
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        r * 14 * u,
        sx > 0 ? (sy > 0 ? 0 : -Math.PI / 2) : sy > 0 ? Math.PI / 2 : Math.PI,
        (sx > 0 ? (sy > 0 ? 0 : -Math.PI / 2) : sy > 0 ? Math.PI / 2 : Math.PI) + Math.PI / 2,
      );
      ctx.stroke();
    }
    for (let k = 0; k <= 4; k++) {
      const a =
        (sx > 0 ? (sy > 0 ? 0 : -Math.PI / 2) : sy > 0 ? Math.PI / 2 : Math.PI) +
        (k / 4) * (Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * 42 * u, cy + Math.sin(a) * 42 * u);
      ctx.stroke();
    }
    ctx.restore();
  }

  return {
    surface() {
      rays();
      const m1 = 16 * u;
      const m2 = 24 * u;
      inscribe(stepped(m1, m1, W - 2 * m1, H - 2 * m1, 46 * u), 0, 1.2, GOLD, 2);
      inscribe(stepped(m2, m2, W - 2 * m2, H - 2 * m2, 40 * u), 0.15, 1.2, alpha(GOLD, 0.6), 1);
      const p = progress(t, 0.8, 0.6);
      if (p > 0) {
        const r = m2 + 30 * u;
        corner(r - 30 * u + 8 * u, r - 30 * u + 8 * u, 1, 1, p);
        corner(W - r + 30 * u - 8 * u, r - 30 * u + 8 * u, -1, 1, p);
        corner(r - 30 * u + 8 * u, H - r + 30 * u - 8 * u, 1, -1, p);
        corner(W - r + 30 * u - 8 * u, H - r + 30 * u - 8 * u, -1, -1, p);
      }
    },
    title(s, o = {}) {
      const { x = 0.07, y = 0.12, size = 54, at = 0, align = "left" } = o;
      if (t < at) return;
      const w = stamp(s, X(x), Y(y), size, at, CREAM, align, 700);
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      inscribe(
        [
          [left, Y(y) + size * 0.85 * u],
          [left + w, Y(y) + size * 0.85 * u],
        ],
        at + 0.3,
        0.6,
        GOLD,
        1.5,
      );
      inscribe(
        [
          [left + w, Y(y) - size * 0.85 * u],
          [left, Y(y) - size * 0.85 * u],
        ],
        at + 0.3,
        0.6,
        GOLD,
        1.5,
      );
    },
    label(s, x, y, o = {}) {
      const { size = 30, align = "center", tone = "ink", at = 0 } = o;
      if (t < at) return;
      const w = stamp(s, X(x), Y(y), size, at, TONE[tone], align);
      // flanking diamonds
      const p = progress(t, at + 0.2, 0.3);
      if (p <= 0) return;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      ctx.save();
      ctx.fillStyle = alpha(GOLD, p);
      for (const dx of [left - 14 * u, left + w + 10 * u]) {
        ctx.beginPath();
        ctx.moveTo(dx, Y(y) - 5 * u);
        ctx.lineTo(dx + 5 * u, Y(y));
        ctx.lineTo(dx, Y(y) + 5 * u);
        ctx.lineTo(dx - 5 * u, Y(y));
        ctx.fill();
      }
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "accent" } = o;
      if (t < at) return;
      const R = r * u * 1.15;
      const oct = (rr: number): Pt[] =>
        Array.from({ length: 9 }, (_, i) => {
          const a = Math.PI / 8 + (i / 8) * Math.PI * 2;
          return [X(x) + Math.cos(a) * rr, Y(y) + Math.sin(a) * rr];
        });
      const f = progress(t, at + dur * 0.5, dur * 0.5);
      if (f > 0) {
        trace(ctx, oct(R), true);
        ctx.fillStyle = alpha("#1C1710", f);
        ctx.fill();
      }
      inscribe(oct(R), at, dur, TONE[tone], 2.5);
      inscribe(oct(R * 0.62), at + dur * 0.3, dur * 0.7, alpha(TONE[tone], 0.7), 1.2);
      if (f > 0) {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = alpha(TONE[tone], f);
        ctx.fill();
      }
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.7, tone = "ink" } = o;
      if (t < at) return;
      const pts = stepped(X(x), Y(y), X(w), Y(h), 18 * u);
      const f = progress(t, at + dur * 0.6, 0.3);
      if (f > 0) {
        trace(ctx, pts, true);
        ctx.fillStyle = alpha("#16120C", 0.85 * f);
        ctx.fill();
      }
      inscribe(pts, at, dur, TONE[tone], 2);
      inscribe(
        stepped(X(x) + 7 * u, Y(y) + 7 * u, X(w) - 14 * u, Y(h) - 14 * u, 14 * u),
        at + 0.15,
        dur,
        alpha(TONE[tone], 0.45),
        1,
      );
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const p = inscribe(pts, at, dur, head ? TONE[tone] : alpha(TONE[tone], 0.55), head ? 2 : 1);
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        ctx.save();
        ctx.strokeStyle = TONE[tone];
        ctx.lineWidth = 2 * u;
        for (const k of [0, 1]) {
          arrowhead(
            ctx,
            [end[0] - Math.cos(a) * k * 9 * u, end[1] - Math.sin(a) * k * 9 * u],
            a,
            13 * u,
          );
          ctx.stroke();
        }
        ctx.restore();
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "ink" } = o;
      if (t < at) return;
      // a stepped ziggurat of server racks rising tier by tier, with a spire
      const tiers = 5;
      const th = Y(h) / (tiers + 1.2);
      const base = Y(y + h);
      const cx = X(x + w / 2);
      ctx.save();
      for (let i = 0; i < tiers; i++) {
        const p = progress(t, at + (i / tiers) * dur * 0.8, dur / tiers);
        if (p <= 0) break;
        const tw = X(w) * (1 - i * 0.16);
        const ty = base - (i + 1) * th;
        ctx.globalAlpha = p;
        ctx.fillStyle = "#17120B";
        ctx.fillRect(cx - tw / 2, ty, tw, th);
        ctx.strokeStyle = TONE[tone];
        ctx.lineWidth = 1.5 * u;
        ctx.strokeRect(cx - tw / 2, ty, tw, th);
        const cells = Math.max(2, Math.round(tw / (14 * u)));
        for (let k = 1; k < cells; k++) {
          ctx.beginPath();
          ctx.moveTo(cx - tw / 2 + (tw / cells) * k, ty + 3 * u);
          ctx.lineTo(cx - tw / 2 + (tw / cells) * k, ty + th - 3 * u);
          ctx.stroke();
        }
        const lit = (Math.floor(t * 4) + i) % cells;
        ctx.fillStyle = TONE.accent;
        ctx.fillRect(cx - tw / 2 + (tw / cells) * (lit + 0.3), ty + th * 0.4, 3 * u, 3 * u);
      }
      const sp = progress(t, at + dur * 0.8, 0.3);
      if (sp > 0) {
        const top = base - tiers * th;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 6 * u, top);
        ctx.lineTo(cx, top - th * 1.2 * sp);
        ctx.lineTo(cx + 6 * u, top);
        ctx.fillStyle = TONE[tone];
        ctx.fill();
      }
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "accent" } = o;
      if (t < at) return;
      const [cx, cy] = [X(x), Y(y)];
      if (sub) {
        // a sunburst gauge filling behind the number as it counts
        const R = size * 2.1 * u;
        const p = count ? clamp((t - at) / dur) : 1;
        const fill = expo(p) * (count ? (count[1] - 0) / 100 : 1);
        ctx.save();
        const n = 36;
        for (let i = 0; i < n; i++) {
          const a0 = Math.PI + (i / n) * Math.PI;
          const a1 = a0 + (Math.PI / n) * 0.7;
          ctx.beginPath();
          ctx.arc(cx, cy + size * 0.35 * u, R, a0, a1);
          ctx.arc(cx, cy + size * 0.35 * u, R * 0.62, a1, a0, true);
          ctx.closePath();
          ctx.fillStyle =
            i / n < fill ? alpha(TONE[tone], 0.9 - (i / n) * 0.4) : "rgba(120,100,70,0.25)";
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(cx, cy + size * 0.35 * u, R * 1.08, Math.PI, Math.PI * 2);
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 1.5 * u;
        ctx.stroke();
        ctx.restore();
      }
      const str = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.globalAlpha = progress(t, at, 0.25);
      ctx.letterSpacing = `${Math.round(size * 0.04 * u)}px`;
      text(ctx, str, cx, cy, font(size, 700), sub ? CREAM : TONE[tone], "center");
      ctx.restore();
      if (sub) stamp(sub, cx, cy + size * 0.95 * u, size * 0.3, at + 0.3, GOLD);
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 28) * u;
      const at = o.at ?? 0;
      const col = kind === "check" ? TONE.good : TONE.bad;
      const ring = Array.from({ length: 33 }, (_, i) => {
        const a = -Math.PI / 2 + (i / 32) * Math.PI * 2;
        return [X(x) + Math.cos(a) * r, Y(y) + Math.sin(a) * r] as Pt;
      });
      inscribe(ring, at, 0.35, col, 2);
      const tick: Pt[] =
        kind === "check"
          ? [
              [X(x) - r * 0.45, Y(y)],
              [X(x) - r * 0.1, Y(y) + r * 0.35],
              [X(x) + r * 0.5, Y(y) - r * 0.4],
            ]
          : [
              [X(x) - r * 0.4, Y(y) - r * 0.4],
              [X(x) + r * 0.4, Y(y) + r * 0.4],
            ];
      inscribe(tick, at + 0.25, 0.25, col, 3);
      if (kind === "cross")
        inscribe(
          [
            [X(x) + r * 0.4, Y(y) - r * 0.4],
            [X(x) - r * 0.4, Y(y) + r * 0.4],
          ],
          at + 0.4,
          0.2,
          col,
          3,
        );
    },
    finish() {},
  };
}

export default {
  id: "art-deco",
  name: "Gilded deco",
  category: "Art & Design Movements",
  make,
} satisfies Style;
