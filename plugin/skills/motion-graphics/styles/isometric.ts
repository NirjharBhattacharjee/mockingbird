// Clean isometric vector scene: a pale floating tile in true 30-degree
// projection, flat three-tone blocks in soft lavenders with one coral accent,
// white pinned tags and dashed curved connectors. Blocks rise up out of the
// floor on a springy overshoot.
import {
  alpha,
  arrowhead,
  clamp,
  counting,
  curve,
  expo,
  frame,
  type Look,
  type Pt,
  progress,
  type Style,
  spring,
  type Tone,
  trace,
} from "./look.ts";

const NAVY = "#33365E";
/** Top, left and right face of a block in each tone. */
const FACES: Record<Tone, [string, string, string]> = {
  ink: ["#D9D8F5", "#A9A7DE", "#8B88C9"],
  accent: ["#FF8A7A", "#F2665A", "#D94F47"],
  good: ["#A6EBD2", "#6CCFAE", "#4FB592"],
  bad: ["#FF9AA6", "#EF5A6E", "#D04458"],
  muted: ["#ECEBF5", "#CFCDE3", "#B8B6D2"],
};
const LINE: Record<Tone, string> = {
  ink: NAVY,
  accent: "#8E8BD0",
  good: "#3FB28C",
  bad: "#F2665A",
  muted: "#B4B2CC",
};
const SANS = '"Inter", "Avenir Next", "Helvetica Neue", Arial, sans-serif';
const C = Math.cos(Math.PI / 6);
const S = 0.5;

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const rise = (at = 0) => spring(t, { start: at, stiffness: 220, damping: 13 });

  /** An isometric block standing on ground point (gx, gy): `a` and `b` half-extents along the two axes, `h` tall. */
  function block(
    gx: number,
    gy: number,
    a: number,
    b: number,
    h: number,
    [top, left, right]: [string, string, string],
  ) {
    const pa: Pt = [C * a, S * a];
    const pb: Pt = [-C * b, S * b];
    const g = (sa: number, sb: number, z = 0): Pt => [
      gx + pa[0] * sa + pb[0] * sb,
      gy + pa[1] * sa + pb[1] * sb - z,
    ];
    ctx.fillStyle = left;
    trace(ctx, [g(-1, 1), g(1, 1), g(1, 1, h), g(-1, 1, h)], true);
    ctx.fill();
    ctx.fillStyle = right;
    trace(ctx, [g(1, 1), g(1, -1), g(1, -1, h), g(1, 1, h)], true);
    ctx.fill();
    ctx.fillStyle = top;
    trace(ctx, [g(-1, -1, h), g(1, -1, h), g(1, 1, h), g(-1, 1, h)], true);
    ctx.fill();
  }

  /** A long soft shadow cast to the lower right. */
  function shadow(gx: number, gy: number, r: number) {
    ctx.save();
    ctx.fillStyle = "rgba(80,70,140,0.12)";
    ctx.beginPath();
    ctx.ellipse(gx + r * 1.1, gy + r * 0.25, r * 1.8, r * 0.6, 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** A white tag with a soft drop shadow; returns nothing, draws at centre (cx, cy). */
  function tag(
    s: string,
    cx: number,
    cy: number,
    size: number,
    tone: Tone,
    align = "center",
    dot = true,
  ) {
    ctx.save();
    ctx.font = `600 ${Math.round(size * u)}px ${SANS}`;
    const tw = ctx.measureText(s).width;
    const pad = size * 0.55 * u;
    const dw = dot ? size * 0.7 * u : 0;
    const w = tw + pad * 2 + dw;
    const h = size * 1.7 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    ctx.shadowColor = "rgba(70,60,130,0.18)";
    ctx.shadowBlur = 14 * u;
    ctx.shadowOffsetY = 4 * u;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.roundRect(left, cy - h / 2, w, h, 6 * u);
    ctx.fill();
    ctx.shadowColor = "transparent";
    if (dot) {
      ctx.fillStyle = (FACES[tone] ?? FACES.ink)[1];
      ctx.beginPath();
      ctx.arc(left + pad + size * 0.2 * u, cy, size * 0.2 * u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = NAVY;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(s, left + pad + dw, cy + u);
    ctx.restore();
  }

  /** Rise what `draw` draws from below, scaled by the spring. */
  function risen(at: number | undefined, draw: (s: number) => void) {
    const s = rise(at);
    if (s <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(s * 2);
    ctx.translate(0, (1 - s) * 30 * u);
    draw(s);
    ctx.restore();
  }

  return {
    surface() {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#F8F6FB");
      g.addColorStop(1, "#E9E7F5");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // The floating floor tile, rising into place.
      const s = spring(t, { stiffness: 90, damping: 14 });
      const gx = W * 0.5;
      const gy = H * 0.5 + (1 - s) * H * 0.2;
      const a = W * 0.5;
      const _b = H * 0.55;
      ctx.save();
      ctx.globalAlpha = clamp(s * 1.5);
      ctx.fillStyle = "rgba(90,80,150,0.08)";
      ctx.beginPath();
      ctx.ellipse(gx + 40 * u, gy + a * 0.45, a * 0.75, a * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      block(gx, gy, a * 0.6, a * 0.6, 22 * u, ["#F3F2FB", "#D8D6EE", "#C3C0E2"]);
      // Pale path stripes on the floor.
      ctx.strokeStyle = "rgba(160,200,180,0.35)";
      ctx.lineWidth = 18 * u;
      ctx.beginPath();
      ctx.moveTo(gx - C * a * 0.5, gy + S * a * 0.25);
      ctx.lineTo(gx + C * a * 0.25, gy + S * a * 0.62);
      ctx.stroke();
      // Two little trees for scale.
      for (const [tx, ty] of [
        [0.18, 0.78],
        [0.9, 0.62],
      ] as Pt[]) {
        ctx.fillStyle = "#B9B5D8";
        ctx.fillRect(X(tx) - 2 * u, Y(ty) - 22 * u, 4 * u, 22 * u);
        ctx.fillStyle = "#8FD3B4";
        ctx.beginPath();
        ctx.arc(X(tx), Y(ty) - 30 * u, 13 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 44, at = 0, align = "left" } = o;
      const p = progress(t, at, o.dur ?? 0.6);
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = `800 ${Math.round(size * u)}px ${SANS}`;
      ctx.fillStyle = NAVY;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.fillText(s, X(x), Y(y) + (1 - expo(p)) * 14 * u);
      const tw = ctx.measureText(s).width;
      const left = align === "center" ? X(x) - tw / 2 : align === "right" ? X(x) - tw : X(x);
      ctx.fillStyle = FACES.accent[1];
      ctx.fillRect(left, Y(y) - size * 0.95 * u, 30 * u * expo(p), 5 * u);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      risen(o.at, () => tag(s, X(x), Y(y), o.size ?? 28, o.tone ?? "ink", o.align ?? "center"));
    },
    node(x, y, r, o = {}) {
      risen(o.at, (s) => {
        const R = r * u;
        shadow(X(x), Y(y) + R * 0.5, R * 0.8);
        block(X(x), Y(y) + R * 0.5, R * 0.75, R * 0.75, R * 1.1 * s, FACES[o.tone ?? "accent"]);
      });
    },
    box(x, y, w, h, o = {}) {
      risen(o.at, () => {
        const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
        const d = Math.min(bw, bh) * 0.28;
        const off: Pt = [C * d, -S * d];
        const [top, , right] = FACES[o.tone === "ink" || !o.tone ? "ink" : o.tone];
        shadow(x0 + bw / 2, y0 + bh, bw * 0.45);
        ctx.fillStyle = right;
        trace(
          ctx,
          [
            [x0 + bw, y0],
            [x0 + bw + off[0], y0 + off[1]],
            [x0 + bw + off[0], y0 + bh + off[1]],
            [x0 + bw, y0 + bh],
          ],
          true,
        );
        ctx.fill();
        ctx.fillStyle = top;
        trace(
          ctx,
          [
            [x0, y0],
            [x0 + off[0], y0 + off[1]],
            [x0 + bw + off[0], y0 + off[1]],
            [x0 + bw, y0],
          ],
          true,
        );
        ctx.fill();
        ctx.fillStyle = "#F7F6FD";
        ctx.fillRect(x0, y0, bw, bh);
        ctx.strokeStyle = alpha(right, 0.6);
        ctx.lineWidth = 2 * u;
        ctx.strokeRect(x0 + 8 * u, y0 + 8 * u, bw - 16 * u, bh - 16 * u);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend === 0 && head ? -0.15 : bend, 30);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * expo(p))));
      ctx.save();
      ctx.strokeStyle = LINE[tone];
      ctx.lineWidth = (head ? 2.2 : 1.4) * u;
      ctx.lineCap = "round";
      if (head) ctx.setLineDash([7 * u, 6 * u]);
      ctx.globalAlpha = head ? 1 : 0.6;
      trace(ctx, shown);
      ctx.stroke();
      ctx.setLineDash([]);
      if (head) {
        ctx.fillStyle = LINE[tone];
        ctx.beginPath();
        ctx.arc(pts[0]?.[0] ?? 0, pts[0]?.[1] ?? 0, 4 * u, 0, Math.PI * 2);
        ctx.fill();
        if (p >= 1) {
          const end = pts.at(-1) as Pt;
          const prev = pts.at(-3) as Pt;
          arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 12 * u);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      // Shelves of stacked data slabs, each rising after the last.
      const gx = X(x + w / 2);
      const a = X(w) / 2 / C / 1.4;
      const n = 5;
      const sh = (Y(h) - a) / n;
      if (t >= at) shadow(gx, Y(y + h) - a * 0.4, a);
      for (let i = 0; i < n; i++) {
        const s = rise(at + (i / n) * dur * 0.8);
        if (s <= 0) continue;
        ctx.save();
        ctx.globalAlpha = clamp(s * 2);
        const gy = Y(y + h) - a * 0.5 - i * sh - (1 - s) * 30 * u;
        block(gx, gy, a, a * 0.8, sh * 0.82, i % 2 ? FACES.muted : FACES.ink);
        ctx.restore();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      risen(at, () => {
        const value = count ? counting(t, at, dur, count) + s : s;
        ctx.save();
        ctx.font = `800 ${Math.round(size * u)}px ${SANS}`;
        const tw = Math.max(ctx.measureText(`${value}0`).width, size * 2 * u);
        const filled = tone === "accent" || tone === "bad";
        const ch = size * (sub ? 1.75 : 1.3) * u;
        const top = Y(y) - ch / 2 - (sub ? size * 0.2 * u : 0);
        if (sub || filled) {
          ctx.shadowColor = "rgba(70,60,130,0.2)";
          ctx.shadowBlur = 18 * u;
          ctx.shadowOffsetY = 6 * u;
          ctx.fillStyle = filled ? FACES[tone][1] : "#FFFFFF";
          ctx.beginPath();
          ctx.roundRect(X(x) - tw / 2, top, tw, ch, 12 * u);
          ctx.fill();
          ctx.shadowColor = "transparent";
        }
        const ink = filled ? "#FFFFFF" : tone === "good" ? "#2E9F7B" : NAVY;
        ctx.fillStyle = ink;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(value, X(x), Y(y) + (sub ? size * 0.12 * u : 0));
        if (sub) {
          ctx.font = `600 ${Math.round(size * 0.24 * u)}px ${SANS}`;
          ctx.fillStyle = filled ? "rgba(255,255,255,0.9)" : "#7A7AA0";
          ctx.fillText(sub[0]?.toUpperCase() + sub.slice(1), X(x), top + size * 0.28 * u);
        }
        ctx.restore();
      });
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 22) * u;
      const s = rise(o.at);
      if (s <= 0) return;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.fillStyle = kind === "check" ? FACES.good[1] : FACES.bad[1];
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = r * 0.22;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (kind === "check")
        trace(ctx, [
          [-r * 0.45, 0],
          [-r * 0.1, r * 0.35],
          [r * 0.5, -r * 0.35],
        ]);
      else
        trace(ctx, [
          [-r * 0.4, -r * 0.4],
          [r * 0.4, r * 0.4],
          [0, 0],
          [r * 0.4, -r * 0.4],
          [-r * 0.4, r * 0.4],
        ]);
      ctx.stroke();
      ctx.restore();
    },
    finish() {},
  };
}

export default {
  id: "isometric",
  name: "Isometric pastel",
  category: "Dimensional",
  make,
} satisfies Style;
