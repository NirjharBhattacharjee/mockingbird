// Papercraft kit on a cutting mat: printed cardstock pieces with fold lines
// and soft shadows, little paper cubes lit from the top left, tent-card
// labels, folded paper-strip arrows. Pieces fold up and hop into place on
// twos (12 steps a second), the way stop motion moves.
import {
  along,
  clamp,
  counting,
  curve,
  frame,
  hash,
  type Look,
  leftOf,
  type Pt,
  type Style,
  spring,
  type Tone,
  trace,
} from "./look.ts";

const FACE: Record<Tone, [string, string, string]> = {
  // top, front, side: one colour lit three ways.
  ink: ["#F7F2E6", "#E9E1CF", "#CFC5B0"],
  accent: ["#5C93E0", "#3E74C4", "#2C5A9E"],
  good: ["#52B86A", "#3A9A53", "#2A7A40"],
  bad: ["#F06A4A", "#D9502F", "#B23E22"],
  muted: ["#E3B85C", "#CC9C3E", "#A97E2C"],
};
const STRIP: Record<Tone, string> = {
  ink: "#F2C230",
  accent: "#F2C230",
  good: "#4FAE66",
  bad: "#E2463A",
  muted: "#C9BFA8",
};
const CARD = "#FBF8F0";
const INK = "#2A2622";
const ROUND =
  '"Arial Rounded MT Bold", "Nunito", "Varela Round", "Helvetica Neue", Arial, sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  // Stop-motion time: everything that moves steps 12 times a second.
  const tq = Math.floor(t * 12) / 12;
  const jit = (seed: number) => (hash(seed + Math.floor(t * 12) * 0.77) - 0.5) * 1.6 * u;
  const hop = (at = 0) => spring(tq, { start: at, stiffness: 180, damping: 12 });
  const fold = (at = 0, dur = 0.5) => clamp((tq - at) / dur);

  function shadow(blur = 14, dx = 6, dy = 9) {
    ctx.shadowColor = "rgba(10,30,15,0.35)";
    ctx.shadowBlur = blur * u;
    ctx.shadowOffsetX = dx * u;
    ctx.shadowOffsetY = dy * u;
  }

  /** A tent card standing on the mat: a printed face with a coloured header strip; folds up from flat. */
  function tent(
    cx: number,
    cy: number,
    w: number,
    h: number,
    header: string,
    at: number,
    seed: number,
    draw?: () => void,
  ) {
    const f = fold(at, 0.42);
    if (f <= 0) return;
    const e = 1 - (1 - f) ** 2;
    ctx.save();
    ctx.translate(cx + jit(seed), cy + h / 2 + jit(seed + 3));
    ctx.scale(1, 0.12 + 0.88 * e);
    ctx.translate(0, -h / 2);
    // The back flap peeking under it.
    ctx.fillStyle = "#D8D0BE";
    ctx.fillRect(-w / 2 + 4 * u, h / 2 - 2 * u, w - 8 * u, 10 * u);
    shadow();
    ctx.fillStyle = CARD;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.shadowColor = "transparent";
    // Light falls off down the card.
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, "rgba(255,255,255,0.0)");
    g.addColorStop(1, "rgba(120,100,70,0.12)");
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    const hh = Math.min(h * 0.16, 16 * u);
    ctx.fillStyle = header;
    ctx.fillRect(-w / 2, -h / 2, w, hh);
    // Dotted fold line along the bottom edge.
    ctx.setLineDash([5 * u, 5 * u]);
    ctx.strokeStyle = "rgba(60,50,40,0.35)";
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 6 * u, h / 2 - 4 * u);
    ctx.lineTo(w / 2 - 6 * u, h / 2 - 4 * u);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.translate(0, hh / 2);
    draw?.();
    ctx.restore();
  }

  /** A little paper cube in three lit faces, with hairline seams. */
  function cube(cx: number, cy: number, s: number, tone: Tone) {
    const [top, front, side] = FACE[tone];
    const d = s * 0.35;
    ctx.save();
    shadow(10, 5, 7);
    ctx.fillStyle = front;
    ctx.fillRect(cx - s / 2, cy - s / 2 + d / 2, s, s);
    ctx.shadowColor = "transparent";
    ctx.beginPath();
    ctx.moveTo(cx - s / 2, cy - s / 2 + d / 2);
    ctx.lineTo(cx - s / 2 + d, cy - s / 2 - d / 2);
    ctx.lineTo(cx + s / 2 + d, cy - s / 2 - d / 2);
    ctx.lineTo(cx + s / 2, cy - s / 2 + d / 2);
    ctx.closePath();
    ctx.fillStyle = top;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + s / 2, cy - s / 2 + d / 2);
    ctx.lineTo(cx + s / 2 + d, cy - s / 2 - d / 2);
    ctx.lineTo(cx + s / 2 + d, cy + s / 2 - d / 2);
    ctx.lineTo(cx + s / 2, cy + s / 2 + d / 2);
    ctx.closePath();
    ctx.fillStyle = side;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1 * u;
    ctx.strokeRect(cx - s / 2 + 0.5 * u, cy - s / 2 + d / 2 + 0.5 * u, s - u, s - u);
    ctx.restore();
  }

  function words(s: string, x: number, y: number, size: number, color: string, align = "center") {
    ctx.font = `800 ${Math.round(size * u)}px ${ROUND}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s, x, y);
  }

  return {
    surface() {
      ctx.fillStyle = "#2F7A4E";
      ctx.fillRect(0, 0, W, H);
      // Wooden table showing past the mat's top edge.
      const wood = ctx.createLinearGradient(0, 0, 0, H * 0.05);
      wood.addColorStop(0, "#8A5A34");
      wood.addColorStop(1, "#A8703F");
      ctx.fillStyle = wood;
      ctx.fillRect(0, 0, W, H * 0.04);
      ctx.save();
      ctx.lineWidth = 1 * u;
      const step = 36 * u;
      for (let i = 0, x = 0; x < W; i++, x += step) {
        ctx.strokeStyle = i % 5 ? "rgba(200,240,210,0.13)" : "rgba(220,250,225,0.3)";
        ctx.beginPath();
        ctx.moveTo(x, H * 0.04);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let i = 0, y = H * 0.04; y < H; i++, y += step) {
        ctx.strokeStyle = i % 5 ? "rgba(200,240,210,0.13)" : "rgba(220,250,225,0.3)";
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      // Self-healing scuffs and a soft key light from the top left.
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(hash(i * 3.3) * W, hash(i * 5.1) * H, (10 + hash(i) * 30) * u, 1.5 * u);
      }
      const key = ctx.createRadialGradient(
        W * 0.3,
        H * 0.2,
        0,
        W * 0.3,
        H * 0.2,
        Math.max(W, H) * 0.9,
      );
      key.addColorStop(0, "rgba(255,240,200,0.12)");
      key.addColorStop(1, "rgba(0,20,10,0.35)");
      ctx.fillStyle = key;
      ctx.fillRect(0, 0, W, H);
      // A glue stick lying at the edge.
      ctx.save();
      ctx.translate(W * 0.93, H * 0.9);
      ctx.rotate(-0.5);
      shadow(8, 4, 6);
      ctx.fillStyle = "#F4F1EA";
      ctx.fillRect(-60 * u, -11 * u, 90 * u, 22 * u);
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#7D4FB5";
      ctx.fillRect(30 * u, -12 * u, 30 * u, 24 * u);
      ctx.restore();
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.07, size = 44, at = 0 } = o;
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${ROUND}`;
      const w = ctx.measureText(s).width + 50 * u;
      const h = size * 1.9 * u;
      ctx.restore();
      const cx = leftOf(X(x), w, o.align) + w / 2;
      tent(cx, Y(y) + h / 2 - 8 * u, w, h, "#3E74C4", at, 1, () => {
        const parts = s.split(" ");
        const last = parts.pop() ?? "";
        const head = parts.join(" ");
        ctx.font = `800 ${Math.round(size * u)}px ${ROUND}`;
        const hw = ctx.measureText(head ? `${head} ` : "").width;
        const lw = ctx.measureText(last).width;
        const left = -(hw + lw) / 2;
        words(head ? `${head} ` : "", left, 0, size, INK, "left");
        words(last, left + hw, 0, size, "#E8692A", "left");
      });
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 26, tone = "ink", align = "center" } = o;
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${ROUND}`;
      const w = ctx.measureText(s).width + 26 * u;
      ctx.restore();
      const h = size * 1.75 * u;
      const color = tone === "ink" ? INK : FACE[tone][2];
      tent(
        leftOf(X(x), w, align) + w / 2,
        Y(y),
        w,
        h,
        STRIP[tone === "ink" ? "accent" : tone],
        at,
        x * 91 + y * 7,
        () => words(s, 0, 0, size, color),
      );
    },
    node(x, y, r, o = {}) {
      const s = hop(o.at);
      if (s <= 0) return;
      const R = r * 1.3 * u;
      const lift = (1 - clamp(s)) * 30 * u;
      cube(X(x) + jit(x * 13), Y(y) - lift, R * Math.min(1.1, s), o.tone ?? "accent");
    },
    box(x, y, w, h, o = {}) {
      tent(X(x + w / 2), Y(y + h / 2), X(w), Y(h), STRIP[o.tone ?? "accent"], o.at ?? 0, x * 51);
    },
    link(x1, y1, x2, y2, o = {}) {
      // A creased paper strip unrolling along the mat, folds alternating light and dark.
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      const p = fold(at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 24);
      const { points } = along(pts, p);
      const wd = (head ? 12 : 3.5) * u;
      if (!head) {
        ctx.save();
        ctx.strokeStyle = "rgba(250,246,236,0.8)";
        ctx.lineWidth = 2.2 * u;
        ctx.beginPath();
        trace(ctx, points);
        ctx.stroke();
        ctx.restore();
        return;
      }
      ctx.save();
      shadow(6, 3, 5);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1] as Pt;
        const b = points[i] as Pt;
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
        const ox = Math.cos(ang) * wd;
        const oy = Math.sin(ang) * wd;
        ctx.beginPath();
        ctx.moveTo(a[0] + ox, a[1] + oy);
        ctx.lineTo(b[0] + ox, b[1] + oy);
        ctx.lineTo(b[0] - ox, b[1] - oy);
        ctx.lineTo(a[0] - ox, a[1] - oy);
        ctx.closePath();
        ctx.fillStyle = STRIP[tone];
        ctx.fill();
        if (i === 1) ctx.shadowColor = "transparent";
        if (i % 2) {
          ctx.fillStyle = "rgba(0,0,0,0.12)";
          ctx.fill();
        }
      }
      if (p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const L = 26 * u;
        const tip: Pt = [end[0] + Math.cos(a) * L * 0.4, end[1] + Math.sin(a) * L * 0.4];
        ctx.beginPath();
        ctx.moveTo(tip[0], tip[1]);
        ctx.lineTo(tip[0] - Math.cos(a - 0.6) * L, tip[1] - Math.sin(a - 0.6) * L);
        ctx.lineTo(tip[0] - Math.cos(a + 0.6) * L, tip[1] - Math.sin(a + 0.6) * L);
        ctx.closePath();
        ctx.fillStyle = STRIP[tone];
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      // A stack of paper cubes hopping on one by one.
      const { at = 0, dur = 0.8, tone = "muted" } = o;
      const s = Math.min(X(w), Y(h) / 2.4);
      const cx = X(x + w / 2);
      for (let i = 0; i < 3; i++) {
        const k = hop(at + (i * dur) / 4);
        if (k <= 0) continue;
        const cy = Y(y + h) - s * 0.6 - i * s * 0.95 - (1 - clamp(k)) * 40 * u;
        cube(cx + (i % 2 ? 4 : -3) * u, cy, s * 0.9, i === 1 ? "ink" : tone);
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "good" } = o;
      // Counters on printed cards, re-posed on twos.
      const value = count ? counting(tq, at, dur, count) + s : s;
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${ROUND}`;
      const w =
        Math.max(ctx.measureText(`${count ? count[1] : ""}${s}`).width, sub ? size * 2 * u : 0) +
        40 * u;
      ctx.restore();
      const h = size * (sub ? 1.95 : 1.4) * u;
      const color = tone === "ink" ? INK : FACE[tone][1];
      tent(X(x), Y(y), w, h, STRIP[tone === "ink" ? "accent" : tone], at, x * 31, () => {
        if (sub) {
          words(sub, 0, -size * 0.55 * u, size * 0.3, INK);
          words(value, 0, size * 0.18 * u, size, color);
        } else words(value, 0, 0, size, color);
      });
    },
    mark(kind, x, y, o = {}) {
      // A paper flag on a stick, planted on a little block.
      const k = hop(o.at);
      if (k <= 0) return;
      const s = (o.size ?? 34) * u;
      const bx = X(x) - s * 0.6;
      const by = Y(y) + s * 0.9 - (1 - clamp(k)) * 30 * u;
      ctx.save();
      shadow(8, 4, 6);
      ctx.fillStyle = "#E8B72E";
      ctx.fillRect(bx - 6 * u, by - 4 * u, 12 * u, 10 * u);
      ctx.fillStyle = "#EDE6D6";
      ctx.fillRect(bx - 1.5 * u, by - s * 1.9, 3 * u, s * 1.9);
      ctx.fillStyle = kind === "check" ? "#3A9A53" : "#D9402F";
      ctx.fillRect(bx, by - s * 1.9, s * 1.4, s);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = CARD;
      ctx.lineWidth = 4 * u;
      ctx.lineCap = "round";
      const cx = bx + s * 0.7;
      const cy = by - s * 1.4;
      ctx.beginPath();
      if (kind === "check") {
        ctx.moveTo(cx - s * 0.3, cy);
        ctx.lineTo(cx - s * 0.05, cy + s * 0.22);
        ctx.lineTo(cx + s * 0.32, cy - s * 0.25);
      } else {
        ctx.moveTo(cx - s * 0.25, cy - s * 0.25);
        ctx.lineTo(cx + s * 0.25, cy + s * 0.25);
        ctx.moveTo(cx + s * 0.25, cy - s * 0.25);
        ctx.lineTo(cx - s * 0.25, cy + s * 0.25);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {},
  };
}

export default {
  id: "papercraft",
  name: "Papercraft",
  category: "Popular Explainer Looks",
  make,
} satisfies Style;
