// A radiograph on a lightbox: blue-black film under metal clips, a glowing
// white viewer around it, and every element a translucent density, its
// edges brighter than its middle like hollow bone. Things develop out of a
// milky fog; notes and arrows are grease pencil, numbers come from the ID
// flasher's typewriter, and a strip of masking tape holds the heading.
import {
  along,
  alpha,
  clamp,
  counting,
  curve,
  ellipse,
  frame,
  grain,
  hash,
  type Look,
  leftOf,
  type Pt,
  progress,
  roughen,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const FILM = "#0B1119";
const BONE = "#CFE0F0";
const PENCIL: Record<Tone, string> = {
  ink: "#F3D46A",
  accent: "#F3D46A",
  good: "#86E89A",
  bad: "#EE4436",
  muted: "#B9B3A0",
};
const HAND = '"Bradley Hand", "Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive';
const MONO = '"Courier New", Courier, monospace';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const film = { x0: W * 0.025, y0: H * 0.04, x1: W * 0.975, y1: H * 0.93 };
  let seed = 11;

  /** How developed something is: from fog to full density. */
  const develop = (at = 0, dur = 0.6) => clamp((t - at) / dur);

  /** A density: a soft wide pass, then a bright rim, so shapes look hollow and see-through. */
  function shell(draw: () => void, a: number, fill = 0.12) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    draw();
    ctx.fillStyle = alpha(BONE, fill * a);
    ctx.fill();
    ctx.shadowColor = alpha(BONE, 0.8);
    ctx.shadowBlur = 10 * u * (2 - a);
    ctx.strokeStyle = alpha(BONE, 0.75 * a);
    ctx.lineWidth = 3.5 * u;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = alpha("#FFFFFF", 0.35 * a);
    ctx.lineWidth = 1 * u;
    ctx.stroke();
    ctx.restore();
  }

  /** A waxy grease-pencil stroke drawn on. */
  function pencil(points: Pt[], at: number, dur: number, color: string, width = 3.5) {
    seed++;
    const p = progress(t, at, dur);
    if (p <= 0) return 0;
    const { points: drawn } = along(roughen(points, 1.3 * u, seed * 3.3), p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    trace(ctx, drawn);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    // Wax skips: a few gaps of darker grain along the stroke.
    ctx.setLineDash([2 * u, 9 * u]);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = width * 0.5 * u;
    ctx.stroke();
    ctx.restore();
    return p;
  }

  function scrawl(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: string,
    p: number,
  ) {
    if (p <= 0) return;
    ctx.save();
    ctx.font = `italic 700 ${Math.round(size * u)}px ${HAND}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 4 * u, y - size * u, (w + 8 * u) * clamp(p), size * 2 * u);
    ctx.clip();
    ctx.textAlign = "left";
    ctx.fillStyle = color;
    ctx.fillText(s, left, y);
    ctx.restore();
  }

  return {
    surface() {
      // The viewer's tubes stutter on in the first half second.
      const on = t < 0.5 ? (hash(Math.floor(t * 30)) > 0.4 ? 1 : 0.55) : 1;
      const box = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
      box.addColorStop(
        0,
        `rgba(${Math.round(248 * on)},${Math.round(250 * on)},${Math.round(255 * on)},1)`,
      );
      box.addColorStop(
        1,
        `rgba(${Math.round(196 * on)},${Math.round(204 * on)},${Math.round(214 * on)},1)`,
      );
      ctx.fillStyle = box;
      ctx.fillRect(0, 0, W, H);
      const { x0, y0, x1, y1 } = film;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 16 * u;
      ctx.fillStyle = "#7E8C9C";
      ctx.fillRect(x0 - 6 * u, y0 - 6 * u, x1 - x0 + 12 * u, y1 - y0 + 12 * u);
      ctx.restore();
      const fg = ctx.createLinearGradient(x0, y0, x1, y1);
      fg.addColorStop(0, "#142338");
      fg.addColorStop(1, FILM);
      ctx.fillStyle = fg;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      // Scratches and dust on the film.
      ctx.strokeStyle = "rgba(200,220,240,0.06)";
      ctx.lineWidth = 1 * u;
      for (let i = 0; i < 10; i++) {
        const sx = x0 + hash(i * 3.1) * (x1 - x0);
        const sy = y0 + hash(i * 5.3) * (y1 - y0);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + (hash(i) - 0.5) * 60 * u, sy + hash(i * 2) * 120 * u);
        ctx.stroke();
      }
      // Metal clips.
      for (const cx of [0.3, 0.7]) {
        ctx.fillStyle = "#A9B3BE";
        ctx.fillRect(W * cx - 18 * u, y0 - 12 * u, 36 * u, 16 * u);
        ctx.fillStyle = "#6C7682";
        ctx.fillRect(W * cx - 4 * u, y0 - 14 * u, 8 * u, 6 * u);
      }
      // Collimation border and a lead marker.
      ctx.strokeStyle = "rgba(200,220,240,0.12)";
      ctx.strokeRect(x0 + 16 * u, y0 + 16 * u, x1 - x0 - 32 * u, y1 - y0 - 32 * u);
      ctx.fillStyle = "rgba(230,240,250,0.7)";
      ctx.font = `700 ${Math.round(16 * u)}px ${MONO}`;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText("R", x1 - 24 * u, y1 - 22 * u);
      ctx.font = `${Math.round(10 * u)}px ${MONO}`;
      ctx.fillStyle = "rgba(200,215,230,0.4)";
      ctx.fillText("MODEL-01  ·  24 OCT  ·  kVp 70", x1 - 50 * u, y1 - 24 * u);
      // The film develops top-down at the start: a milky fog that clears.
      const d = clamp(t / 1.4);
      if (d < 1) {
        const fog = ctx.createLinearGradient(0, y0, 0, y1);
        fog.addColorStop(0, `rgba(170,185,200,${0.6 * (1 - d) ** 2})`);
        fog.addColorStop(clamp(d), `rgba(170,185,200,${0.6 * (1 - d)})`);
        fog.addColorStop(1, `rgba(170,185,200,${0.75 * (1 - d * 0.5)})`);
        ctx.fillStyle = fog;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.075, size = 34, at = 0, dur = 0.9 } = o;
      const p = progress(t, at, 0.2);
      if (p <= 0) return;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${HAND}`;
      const w = ctx.measureText(s.toUpperCase()).width + 36 * u;
      const h = size * 1.5 * u;
      const left = leftOf(X(x), w, o.align);
      ctx.translate(left, Y(y));
      ctx.rotate(-0.01);
      ctx.globalAlpha = p;
      ctx.fillStyle = "#E7D9A8";
      ctx.beginPath();
      // Torn tape ends.
      ctx.moveTo(0, -h / 2);
      for (let i = 0; i <= 6; i++) ctx.lineTo(w + (i % 2 ? 4 : 0) * u, -h / 2 + (h * i) / 6);
      for (let i = 6; i >= 0; i--) ctx.lineTo((i % 2 ? -4 : 0) * u, -h / 2 + (h * i) / 6);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${HAND}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.beginPath();
      ctx.rect(left, Y(y) - h, w * progress(t, at + 0.15, dur), h * 2);
      ctx.clip();
      ctx.fillStyle = "#2A2620";
      ctx.fillText(s.toUpperCase(), left + 18 * u, Y(y) + 1 * u);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, tone = "ink", align = "center" } = o;
      scrawl(
        s,
        X(x),
        Y(y),
        size,
        PENCIL[tone],
        align,
        progress(t, at, o.dur ?? 0.04 * s.length + 0.15),
      );
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5 } = o;
      const R = r * u;
      const [cx, cy] = [X(x), Y(y)];
      const a = develop(at, dur);
      // A pivot pin: hollow ring with a dense core.
      shell(() => {
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
      }, a);
      shell(
        () => {
          ctx.beginPath();
          ctx.arc(cx, cy, R * 0.3, 0, Math.PI * 2);
        },
        a,
        0.5,
      );
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6 } = o;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const a = develop(at, dur);
      shell(
        () => {
          ctx.beginPath();
          ctx.roundRect(x0, y0, bw, bh, 16 * u);
        },
        a,
        0.08,
      );
      // Screws in the corners.
      for (const [sx, sy] of [
        [x0 + 12 * u, y0 + 12 * u],
        [x0 + bw - 12 * u, y0 + 12 * u],
        [x0 + 12 * u, y0 + bh - 12 * u],
        [x0 + bw - 12 * u, y0 + bh - 12 * u],
      ] as Pt[]) {
        shell(
          () => {
            ctx.beginPath();
            ctx.arc(sx, sy, 4 * u, 0, Math.PI * 2);
          },
          a,
          0.4,
        );
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      if (!head) {
        // Tendons: faint translucent strands that develop in.
        const a = develop(at, dur * 2);
        if (a <= 0) return;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        trace(ctx, pts);
        ctx.strokeStyle = alpha(BONE, 0.28 * a);
        ctx.lineWidth = 2 * u;
        ctx.stroke();
        ctx.restore();
        return;
      }
      const color = PENCIL[tone];
      const p = pencil(pts, at, dur, color);
      if (p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 16 * u;
        pencil(
          [
            [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
            end,
            [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s],
          ],
          at + dur,
          0.1,
          color,
        );
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const a = develop(at, dur);
      // A battery cell: shell, terminal cap, stacked plates inside.
      const cx = (x0 + x1) / 2;
      shell(
        () => {
          ctx.beginPath();
          ctx.roundRect(x0, y0 + 10 * u, x1 - x0, y1 - y0 - 10 * u, 10 * u);
        },
        a,
        0.1,
      );
      shell(
        () => {
          ctx.beginPath();
          ctx.roundRect(cx - (x1 - x0) * 0.2, y0, (x1 - x0) * 0.4, 12 * u, 3 * u);
        },
        a,
        0.5,
      );
      for (let i = 0; i < 5; i++) {
        const py = y0 + 24 * u + i * ((y1 - y0 - 36 * u) / 5);
        shell(
          () => {
            ctx.beginPath();
            ctx.rect(x0 + 8 * u, py, x1 - x0 - 16 * u, (y1 - y0) / 14);
          },
          a * clamp(develop(at, dur) * 5 - i),
          0.25,
        );
      }
      void ellipse;
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      if (sub) {
        // The ID flasher's patch: pale, with typed mono lines.
        ctx.save();
        ctx.font = `700 ${Math.round(size * 0.9 * u)}px ${MONO}`;
        const w = Math.max(ctx.measureText(value).width, size * 2.2 * u) + 30 * u;
        const h = size * 1.7 * u;
        const [px, py] = [X(x) - w / 2, Y(y) - h / 2];
        ctx.fillStyle = "#D7DEE6";
        ctx.fillRect(px, py, w, h);
        ctx.fillStyle = "#1B2027";
        ctx.font = `${Math.round(size * 0.16 * u)}px ${MONO}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`MODEL  ·  ${sub.toUpperCase()}`, px + 12 * u, py + 10 * u);
        ctx.font = `700 ${Math.round(size * 0.9 * u)}px ${MONO}`;
        ctx.textBaseline = "middle";
        ctx.fillText(value, px + 12 * u, py + h * 0.6);
        ctx.restore();
        // A red grease-pencil circle once it settles.
        pencil(
          ellipse(X(x), Y(y) + h * 0.1, w * 0.62, h * 0.7, 40, -Math.PI * 0.7, 1.08),
          at + dur + 0.1,
          0.45,
          PENCIL.bad,
          4,
        );
      } else {
        ctx.save();
        ctx.globalAlpha = develop(at, 0.3);
        ctx.font = `700 ${Math.round(size * u)}px ${MONO}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = BONE;
        ctx.shadowColor = BONE;
        ctx.shadowBlur = 10 * u;
        ctx.fillText(value, X(x), Y(y));
        ctx.restore();
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 34 } = o;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check")
        pencil(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.12, cy + s * 0.4],
            [cx + s * 0.6, cy - s * 0.5],
          ],
          at,
          dur,
          PENCIL.good,
          4,
        );
      else {
        pencil(
          [
            [cx - s * 0.45, cy - s * 0.45],
            [cx + s * 0.45, cy + s * 0.45],
          ],
          at,
          dur / 2,
          PENCIL.bad,
          4,
        );
        pencil(
          [
            [cx + s * 0.45, cy - s * 0.45],
            [cx - s * 0.45, cy + s * 0.45],
          ],
          at + dur / 2,
          dur / 2,
          PENCIL.bad,
          4,
        );
      }
    },
    finish() {
      grain(ctx, m, t, 0.035, 2);
    },
  };
}

export default {
  id: "x-ray",
  name: "X-ray lightbox",
  category: "Light & Imaging",
  make,
} satisfies Style;
