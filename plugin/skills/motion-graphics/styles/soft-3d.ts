// Puffy matte clay on a pastel lavender sweep: rounded chunky shapes with a
// soft core shadow, a bright rim, a glossy highlight and a blurry contact
// shadow underneath. Everything drops in with a squash and stretch.
import {
  alpha,
  clamp,
  counting,
  curve,
  expo,
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

/** Light, base and shade of the clay in each tone. */
const CLAY: Record<Tone, [string, string, string]> = {
  ink: ["#B4A6FF", "#8E7CF0", "#6A57D2"],
  accent: ["#FFB3A0", "#FF8D73", "#E0644F"],
  good: ["#A8F0D2", "#73DDB4", "#45B98F"],
  bad: ["#FF9A9A", "#F06A6A", "#CC4545"],
  muted: ["#E5DEFA", "#CFC5F2", "#B1A5E0"],
};
const BUTTER: [string, string, string] = ["#FFE7A0", "#FFD25E", "#E6AE2E"];
const SANS =
  '"Nunito", "Avenir Next Rounded", "Arial Rounded MT Bold", "Avenir Next", "Helvetica Neue", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);

  /** A drop with squash and stretch: returns [y offset in px, scale x, scale y], or null before `at`. */
  function drop(at = 0): [number, number, number] | null {
    const s = t - at;
    if (s < 0) return null;
    const fall = clamp(s / 0.22);
    const y = (1 - fall * fall) * -90 * u;
    if (fall < 1) return [y, 0.9, 1.12];
    const b = spring(t, { start: at + 0.22, stiffness: 300, damping: 9 });
    const sq = (1 - b) * 0.35;
    return [0, 1 + sq, 1 - sq];
  }

  /** Draw `draw` dropped in about its foot (cx, foot). */
  function dropped(
    cx: number,
    foot: number,
    at: number | undefined,
    draw: () => void,
    shadowW = 0,
  ) {
    const d = drop(at);
    if (!d) return;
    const [dy, sx, sy] = d;
    if (shadowW) contact(cx, foot, shadowW, clamp(1 + dy / (90 * u)));
    ctx.save();
    ctx.globalAlpha = clamp((t - (at ?? 0)) / 0.08);
    ctx.translate(cx, foot + dy);
    ctx.scale(sx, sy);
    ctx.translate(-cx, -foot);
    draw();
    ctx.restore();
  }

  /** A blurry shadow on the floor, darker as the object comes down. */
  function contact(cx: number, y: number, w: number, k = 1) {
    const g = ctx.createRadialGradient(cx, y, 0, cx, y, w);
    g.addColorStop(0, `rgba(90,70,170,${0.28 * k})`);
    g.addColorStop(1, "rgba(90,70,170,0)");
    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(1, 0.22);
    ctx.translate(-cx, -y);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, y, w, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** A puffy rounded slab: a darker extrusion, a lit face, a rim and a gloss. */
  function slab(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    [light, base, shade]: [string, string, string],
  ) {
    const depth = Math.min(h * 0.12, 14 * u);
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.roundRect(x, y + depth, w, h, r);
    ctx.fill();
    const g = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
    g.addColorStop(0, light);
    g.addColorStop(0.6, base);
    g.addColorStop(1, shade);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2.5 * u;
    ctx.beginPath();
    ctx.roundRect(x + 3 * u, y + 3 * u, w - 6 * u, h - 6 * u, Math.max(0, r - 3 * u));
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.ellipse(
      x + w * 0.22,
      y + h * 0.18,
      Math.min(w * 0.12, 30 * u),
      Math.min(h * 0.07, 10 * u),
      -0.3,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  /** A clay ball with core shadow, rim light and gloss. */
  function ball(cx: number, cy: number, r: number, [light, base, shade]: [string, string, string]) {
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, light);
    g.addColorStop(0.55, base);
    g.addColorStop(1, shade);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = r * 0.08;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.92, Math.PI * 0.15, Math.PI * 0.75);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.35, cy - r * 0.42, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  /** A squishy pill with white rounded type, centred on (cx, cy). */
  function pill(
    s: string,
    cx: number,
    cy: number,
    size: number,
    clay: [string, string, string],
    ink = "#FFFFFF",
    align = "center",
  ) {
    ctx.font = `800 ${Math.round(size * u)}px ${SANS}`;
    const w = ctx.measureText(s).width + size * 1.3 * u;
    const h = size * 1.6 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    slab(left, cy - h / 2, w, h, h / 2, clay);
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + w / 2, cy + u);
  }

  return {
    surface() {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#F1ECFF");
      g.addColorStop(0.62, "#E6DEFA");
      g.addColorStop(1, "#F3EFFF");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, W * 0.55);
      glow.addColorStop(0, "rgba(255,248,230,0.6)");
      glow.addColorStop(1, "rgba(255,248,230,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      // Little clay beads bobbing at different depths.
      for (let i = 0; i < 9; i++) {
        const r = (6 + hash(i * 3) * 10) * u;
        const cx = X(hash(i * 1.7));
        const cy = Y(0.1 + hash(i * 2.9) * 0.85) + Math.sin(t * 1.3 + i) * 6 * u;
        ball(cx, cy, r, i % 3 === 0 ? BUTTER : i % 3 === 1 ? CLAY.accent : CLAY.ink);
      }
      ball(W * 0.95, H * 0.95, 70 * u, CLAY.muted);
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 42, at = 0, align = "left" } = o;
      ctx.font = `800 ${Math.round(size * u)}px ${SANS}`;
      const w = ctx.measureText(s).width + size * 1.4 * u;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      const h = size * 1.7 * u;
      dropped(left + w / 2, Y(y) + h / 2, at, () => {
        // A puffy speech bubble.
        ctx.fillStyle = CLAY.ink[2];
        trace(
          ctx,
          [
            [left + w * 0.18, Y(y) + h / 2 - 4 * u],
            [left + w * 0.12, Y(y) + h / 2 + 16 * u],
            [left + w * 0.32, Y(y) + h / 2 - 4 * u],
          ],
          true,
        );
        ctx.fill();
        pill(s, left + w / 2, Y(y), size, CLAY.ink);
      });
    },
    label(s, x, y, o = {}) {
      const tone = o.tone ?? "ink";
      const size = o.size ?? 32;
      dropped(X(x), Y(y) + size * 0.8 * u, o.at, () =>
        pill(
          s,
          X(x),
          Y(y),
          size,
          CLAY[tone === "muted" ? "ink" : tone],
          "#FFFFFF",
          o.align ?? "center",
        ),
      );
    },
    node(x, y, r, o = {}) {
      const R = r * u;
      dropped(X(x), Y(y) + R, o.at, () => ball(X(x), Y(y), R, CLAY[o.tone ?? "accent"]), R * 1.2);
    },
    box(x, y, w, h, o = {}) {
      const tone = o.tone ?? "ink";
      dropped(
        X(x + w / 2),
        Y(y + h),
        o.at,
        () => {
          // A clay chip with little pins along its sides.
          const pin = BUTTER;
          for (let i = 0; i < 5; i++) {
            const py = Y(y) + Y(h) * (0.18 + i * 0.16);
            slab(X(x) - 9 * u, py, 18 * u, 9 * u, 4 * u, pin);
            slab(X(x + w) - 9 * u, py, 18 * u, 9 * u, 4 * u, pin);
          }
          slab(X(x), Y(y), X(w), Y(h), 26 * u, tone === "good" ? CLAY.good : CLAY[tone]);
        },
        X(w) * 0.55,
      );
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      // A puffy clay tube with a blobby head.
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * expo(p))));
      const [light, base, shade] = CLAY[tone === "accent" ? "muted" : tone];
      const wd = (head ? 12 : 4) * u;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      trace(
        ctx,
        shown.map(([a, b]) => [a, b + wd * 0.25] as Pt),
      );
      ctx.strokeStyle = shade;
      ctx.lineWidth = wd;
      ctx.stroke();
      trace(ctx, shown);
      ctx.strokeStyle = base;
      ctx.lineWidth = wd * 0.85;
      ctx.stroke();
      trace(
        ctx,
        shown.map(([a, b]) => [a, b - wd * 0.2] as Pt),
      );
      ctx.strokeStyle = alpha(light, 0.9);
      ctx.lineWidth = wd * 0.3;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-4) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 20 * u;
        ctx.fillStyle = base;
        ctx.strokeStyle = shade;
        ctx.lineWidth = 4 * u;
        trace(
          ctx,
          [
            end,
            [end[0] - Math.cos(a - 0.6) * s, end[1] - Math.sin(a - 0.6) * s],
            [end[0] - Math.cos(a + 0.6) * s, end[1] - Math.sin(a + 0.6) * s],
          ],
          true,
        );
        ctx.stroke();
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      // Clay bricks stacked into a little wall.
      const rows = 4;
      const bh = Y(h) / rows;
      const bw = X(w) / 2;
      let k = 0;
      if (t >= at) contact(X(x + w / 2), Y(y + h) + 6 * u, X(w) * 0.8);
      for (let row = 0; row < rows; row++)
        for (let c = 0; c < 2; c++) {
          const off = row % 2 ? bw * 0.25 : 0;
          const bx = X(x) + c * bw + off - bw * 0.12;
          const by = Y(y + h) - (row + 1) * bh;
          const clay =
            (row + c) % 3 === 0 ? CLAY.accent : (row + c) % 3 === 1 ? CLAY.ink : CLAY.muted;
          // A small store leaves no room inside a brick's padding: skip it, since a
          // negative size reaches ctx.ellipse() as a negative radius, which throws.
          const [iw, ih] = [bw - 4 * u, bh - 8 * u];
          if (iw <= 0 || ih <= 0) continue;
          dropped(bx + bw / 2, by + bh, at + (k++ / (rows * 2)) * dur, () =>
            slab(bx + 2 * u, by + 2 * u, iw, ih, Math.min(10 * u, iw / 2, ih / 2), clay),
          );
        }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      const clay = tone === "ink" ? BUTTER : tone === "good" ? BUTTER : CLAY[tone];
      const ink = tone === "ink" || tone === "good" ? "#8A5A12" : "#FFFFFF";
      dropped(X(x), Y(y) + size * 0.7 * u, at, () => {
        ctx.font = `900 ${Math.round(size * u)}px ${SANS}`;
        const w = Math.max(ctx.measureText(`${value}0`).width, size * 2 * u);
        const h = size * 1.25 * u;
        slab(X(x) - w / 2, Y(y) - h / 2, w, h, h / 2.2, clay);
        ctx.fillStyle = ink;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(value, X(x), Y(y) + 2 * u);
      });
      if (sub) {
        const sz = size * 0.26;
        dropped(X(x), Y(y) - size * 0.9 * u, at + 0.15, () =>
          pill(sub[0]?.toUpperCase() + sub.slice(1), X(x), Y(y) - size * 0.95 * u, sz, CLAY.ink),
        );
      }
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 24) * u;
      dropped(X(x), Y(y) + r, o.at, () => {
        ball(X(x), Y(y), r, kind === "check" ? CLAY.good : CLAY.bad);
        const [cx, cy] = [X(x), Y(y)];
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = r * 0.24;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.42, cy],
            [cx - r * 0.1, cy + r * 0.32],
            [cx + r * 0.45, cy - r * 0.3],
          ]);
        else
          trace(ctx, [
            [cx - r * 0.35, cy - r * 0.35],
            [cx + r * 0.35, cy + r * 0.35],
            [cx, cy],
            [cx + r * 0.35, cy - r * 0.35],
            [cx - r * 0.35, cy + r * 0.35],
          ]);
        ctx.stroke();
      });
    },
    finish() {},
  };
}

export default {
  id: "soft-3d",
  name: "Soft 3D clay",
  category: "Dimensional",
  make,
} satisfies Style;
