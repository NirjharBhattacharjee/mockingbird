// Kawaii: strawberry-milk pastels on a polka-dot sky with soft clouds, chunky
// rounded shapes with even plum outlines, little faces with blush on every
// node, dotted candy arrows, outlined bouncy numerals and twinkling sparkles.
// Everything pops in on twos with squash and stretch.
import {
  along,
  clamp,
  counting,
  curve,
  frame,
  hash,
  type Look,
  type Pt,
  type Style,
  spring,
  type Tone,
  trace,
} from "./look.ts";

const PLUM = "#6E4467";
const FILL: Record<Tone, string> = {
  ink: "#FFFFFF",
  accent: "#FFB3CF",
  good: "#A8E6CF",
  bad: "#FF8FA3",
  muted: "#D9CCF2",
};
const DEEP: Record<Tone, string> = {
  ink: PLUM,
  accent: "#F06A9C",
  good: "#3FB38A",
  bad: "#E8506E",
  muted: "#9C86D6",
};
const ROUND = '"Nunito", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const tq = Math.floor(t * 12) / 12;
  const sparkles: Pt[] = [];

  /** Squash and stretch: x and y scales from a bouncy spring. */
  function squash(at = 0): [number, number] {
    const s = spring(tq, { start: at, stiffness: 240, damping: 11 });
    if (s <= 0) return [0, 0];
    const over = s - 1;
    return [s * (1 - over * 0.6), s * (1 + over * 0.6)];
  }

  function popped(
    cx: number,
    cy: number,
    at: number | undefined,
    draw: () => void,
    sparkle = false,
  ) {
    const [sx, sy] = squash(at);
    if (sx <= 0) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sx, sy);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
    if (sparkle) sparkles.push([cx, cy]);
  }

  function outline(width = 5) {
    ctx.lineWidth = width * u;
    ctx.strokeStyle = PLUM;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  /** Sticker lettering: a coloured fill inside a white rim inside a plum rim. */
  function sticker(s: string, x: number, y: number, size: number, fill: string, align = "center") {
    ctx.save();
    ctx.font = `800 ${Math.round(size * u)}px ${ROUND}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.17 * u;
    ctx.strokeStyle = PLUM;
    ctx.strokeText(s, x, y);
    ctx.lineWidth = size * 0.08 * u;
    ctx.strokeStyle = "#FFFFFF";
    ctx.strokeText(s, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  function star(cx: number, cy: number, r: number) {
    const pts: Pt[] = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.3 : r;
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    });
    trace(ctx, pts, true);
  }

  return {
    surface() {
      ctx.fillStyle = "#FFE4EE";
      ctx.fillRect(0, 0, W, H);
      // Polka dots.
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      const s = 34 * u;
      for (let row = 0, y = 0; y < H + s; row++, y += s) {
        for (let x = row % 2 ? s / 2 : 0; x < W + s; x += s) {
          ctx.beginPath();
          ctx.arc(x, y, 3.2 * u, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Soft clouds drifting.
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      for (let i = 0; i < 5; i++) {
        const cx =
          (((hash(i * 4.1) * 1.2 - 0.1) * W + t * 8 * u * (i % 2 ? 1 : -1) + W) % (W * 1.2)) -
          W * 0.1;
        const cy = (0.15 + 0.75 * hash(i * 7.3)) * H;
        const r = (50 + 40 * hash(i)) * u;
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.arc(
            cx + (k - 1.5) * r * 0.8,
            cy + (k % 2 ? -r * 0.3 : 0),
            r * (k % 2 ? 0.8 : 0.65),
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.09, size = 52, at = 0, align = "left" } = o;
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${ROUND}`;
      const w = ctx.measureText(s).width;
      ctx.restore();
      const cx = align === "center" ? X(x) : align === "right" ? X(x) - w / 2 : X(x) + w / 2;
      popped(
        cx,
        Y(y),
        at,
        () => sticker(s, cx, Y(y) + Math.sin(t * 2.5) * 2 * u, size, "#FF7EAD"),
        true,
      );
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 26, tone = "ink", align = "center" } = o;
      popped(X(x), Y(y), at, () => {
        ctx.save();
        ctx.font = `800 ${Math.round(size * u)}px ${ROUND}`;
        const w = ctx.measureText(s).width + size * 1.1 * u;
        const h = size * 1.6 * u;
        const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
        ctx.beginPath();
        ctx.roundRect(left, Y(y) - h / 2, w, h, h / 2);
        ctx.fillStyle = tone === "ink" ? "#FFFFFF" : FILL[tone];
        ctx.fill();
        outline(3.5);
        ctx.fillStyle = tone === "ink" ? PLUM : DEEP[tone];
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s, left + w / 2, Y(y) + 1 * u);
        ctx.restore();
      });
    },
    node(x, y, r, o = {}) {
      // A round little face: pastel body, two glossy eyes, blush.
      const { at = 0, tone = "accent" } = o;
      const cx = X(x);
      const cy = Y(y) + Math.sin(t * 3 + x * 20 + y * 13) * 1.5 * u;
      const R = r * u;
      popped(cx, cy, at, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = FILL[tone];
        ctx.fill();
        // One cel-shadow tone along the lower right.
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        ctx.arc(cx + R * 0.35, cy + R * 0.35, R, 0, Math.PI * 2);
        ctx.arc(cx - R * 0.1, cy - R * 0.1, R * 1.05, 0, Math.PI * 2, true);
        ctx.fillStyle = "rgba(110,68,103,0.12)";
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        outline(3.5);
        const blink = (t * 0.7 + x * 3) % 3 < 0.08;
        for (const side of [-1, 1]) {
          const ex = cx + side * R * 0.36;
          const ey = cy - R * 0.05;
          ctx.fillStyle = PLUM;
          ctx.beginPath();
          if (blink) ctx.ellipse(ex, ey, R * 0.16, R * 0.04, 0, 0, Math.PI * 2);
          else ctx.ellipse(ex, ey, R * 0.13, R * 0.18, 0, 0, Math.PI * 2);
          ctx.fill();
          if (!blink) {
            ctx.fillStyle = "#FFFFFF";
            ctx.beginPath();
            ctx.arc(ex - R * 0.04, ey - R * 0.07, R * 0.055, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "rgba(255,120,150,0.55)";
          ctx.beginPath();
          ctx.ellipse(cx + side * R * 0.6, cy + R * 0.28, R * 0.16, R * 0.09, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      popped(
        X(x + w / 2),
        Y(y + h / 2),
        at,
        () => {
          const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
          const r = Math.min(ww, hh) * 0.2;
          ctx.beginPath();
          ctx.roundRect(l + 6 * u, tp + 8 * u, ww, hh, r);
          ctx.fillStyle = "rgba(110,68,103,0.15)";
          ctx.fill();
          ctx.beginPath();
          ctx.roundRect(l, tp, ww, hh, r);
          ctx.fillStyle = "#FFFFFF";
          ctx.fill();
          outline(5);
          ctx.beginPath();
          ctx.roundRect(l + 8 * u, tp + 8 * u, ww - 16 * u, hh - 16 * u, r * 0.7);
          ctx.fillStyle = tone === "ink" ? "#FFF6FA" : `${FILL[tone]}66`;
          ctx.fill();
        },
        true,
      );
    },
    link(x1, y1, x2, y2, o = {}) {
      // Dotted candy arrows: round dots popping along the path.
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "good" } = o;
      const p = clamp((tq - at) / dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const color = head ? DEEP[tone === "ink" ? "good" : tone] : `${DEEP.muted}88`;
      if (!head) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 * u;
        trace(ctx, along(pts, p).points);
        ctx.stroke();
        ctx.restore();
        return;
      }
      const len = pts
        .slice(1)
        .reduce((s, q, i) => s + Math.hypot(q[0] - (pts[i] as Pt)[0], q[1] - (pts[i] as Pt)[1]), 0);
      const n = Math.max(3, Math.floor(len / (13 * u)));
      ctx.fillStyle = color;
      for (let i = 0; i <= n * p; i++) {
        const [px, py] = along(pts, i / n).points.at(-1) as Pt;
        ctx.beginPath();
        ctx.arc(px, py, 3.6 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-4) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 16 * u;
        trace(
          ctx,
          [
            [end[0] + Math.cos(a) * s * 0.5, end[1] + Math.sin(a) * s * 0.5],
            [end[0] - Math.cos(a - 0.6) * s, end[1] - Math.sin(a - 0.6) * s],
            [end[0] - Math.cos(a + 0.6) * s, end[1] - Math.sin(a + 0.6) * s],
          ],
          true,
        );
        ctx.lineJoin = "round";
        ctx.lineWidth = 4 * u;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.fill();
      }
    },
    store(x, y, w, h, o = {}) {
      // A candy jar with a pastel lid and sweets inside.
      const { at = 0 } = o;
      popped(
        X(x + w / 2),
        Y(y + h),
        at,
        () => {
          const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
          const lid = hh * 0.16;
          ctx.beginPath();
          ctx.roundRect(l, tp + lid, ww, hh - lid, ww * 0.28);
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fill();
          ctx.save();
          ctx.clip();
          const cols = ["#FFB3CF", "#A8E6CF", "#FFE89A", "#C9B8F5", "#9FD8F7"];
          for (let i = 0; i < 9; i++) {
            ctx.beginPath();
            ctx.arc(
              l + ww * (0.22 + 0.56 * hash(i * 3.3)),
              tp + hh * (0.5 + 0.42 * hash(i * 5.9)),
              ww * 0.14,
              0,
              Math.PI * 2,
            );
            ctx.fillStyle = cols[i % cols.length] as string;
            ctx.fill();
            ctx.lineWidth = 2.5 * u;
            ctx.strokeStyle = PLUM;
            ctx.stroke();
          }
          ctx.restore();
          ctx.beginPath();
          ctx.roundRect(l, tp + lid, ww, hh - lid, ww * 0.28);
          outline(4.5);
          ctx.beginPath();
          ctx.roundRect(l - ww * 0.06, tp, ww * 1.12, lid * 1.2, lid * 0.5);
          ctx.fillStyle = "#FFB3CF";
          ctx.fill();
          outline(4.5);
          ctx.fillStyle = "rgba(255,255,255,0.8)";
          ctx.beginPath();
          ctx.roundRect(l + ww * 0.14, tp + lid * 1.6, ww * 0.1, hh * 0.35, ww * 0.05);
          ctx.fill();
        },
        true,
      );
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      const value = count ? counting(tq, at, dur, count) + s : s;
      const bounce = count && tq < at + dur ? Math.abs(Math.sin(tq * 14)) * 5 * u : 0;
      popped(
        X(x),
        Y(y),
        at,
        () => {
          sticker(value, X(x), Y(y) - bounce, size, tone === "ink" ? "#FFFFFF" : DEEP[tone]);
          if (sub) sticker(sub, X(x), Y(y) - size * 0.85 * u, size * 0.32, "#FF7EAD");
        },
        true,
      );
    },
    mark(kind, x, y, o = {}) {
      const R = (o.size ?? 30) * u;
      const cx = X(x);
      const cy = Y(y);
      popped(
        cx,
        cy,
        o.at,
        () => {
          ctx.beginPath();
          ctx.arc(cx, cy, R, 0, Math.PI * 2);
          ctx.fillStyle = kind === "check" ? "#7DDBB4" : "#FF7E98";
          ctx.fill();
          outline(4);
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = 6 * u;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          if (kind === "check")
            trace(ctx, [
              [cx - R * 0.45, cy],
              [cx - R * 0.1, cy + R * 0.35],
              [cx + R * 0.48, cy - R * 0.35],
            ]);
          else {
            ctx.beginPath();
            ctx.moveTo(cx - R * 0.38, cy - R * 0.38);
            ctx.lineTo(cx + R * 0.38, cy + R * 0.38);
            ctx.moveTo(cx + R * 0.38, cy - R * 0.38);
            ctx.lineTo(cx - R * 0.38, cy + R * 0.38);
          }
          ctx.stroke();
        },
        true,
      );
    },
    finish() {
      // Twinkling sparkles round whatever has popped in.
      ctx.save();
      sparkles.forEach(([cx, cy], i) => {
        for (let k = 0; k < 2; k++) {
          const tw = Math.sin(t * 5 + i * 1.7 + k * 2.4);
          if (tw < 0) continue;
          const a = hash(i * 9.1 + k) * Math.PI * 2;
          const d = (48 + 30 * hash(i + k * 3)) * u;
          star(cx + Math.cos(a) * d, cy + Math.sin(a) * d, (5 + 6 * tw) * u);
          ctx.fillStyle = k ? "#FFD84D" : "#FFFFFF";
          ctx.fill();
          ctx.lineWidth = 2 * u;
          ctx.strokeStyle = PLUM;
          ctx.stroke();
        }
      });
      ctx.restore();
    },
  };
}

export default {
  id: "kawaii",
  name: "Kawaii pastel",
  category: "Popular Explainer Looks",
  make,
} satisfies Style;
