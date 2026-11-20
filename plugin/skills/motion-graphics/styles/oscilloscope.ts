// Vector scope: one green phosphor beam draws everything on a dark CRT behind
// a graticule. Strokes are written on by the beam, bright at its head and
// leaving a glowing trace, with bloom round every line. Text is beam-drawn
// capitals; the correction shudders in amber. A moulded bezel frames it.
import {
  along,
  counting,
  curve,
  ellipse,
  frame,
  hash,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const GREEN = "#8CFFA8";
const AMBER = "#FFB547";
const BEAM: Record<Tone, string> = {
  ink: GREEN,
  accent: GREEN,
  good: GREEN,
  bad: AMBER,
  muted: "#4E9A62",
};
const MONO = '"JetBrains Mono", "Noto Color Emoji", monospace';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const heads: { x: number; y: number; c: string }[] = [];
  // The screen inside the bezel.
  const sx = W * 0.012;
  const sy = H * 0.02;
  const sw = W - sx * 2;
  const sh = H - sy * 2;

  /** A shudder for the amber correction: a small horizontal jitter while it is new. */
  const shake = (tone: Tone, at: number) =>
    tone === "bad" && t - at < 1.2 ? (hash(Math.floor(t * 30)) - 0.5) * 4 * u : 0;

  /** Draw a beam stroke written on from `at` over `dur`: bloom, core, and a bright head while moving. */
  function beam(points: Pt[], at: number, dur: number, tone: Tone, width = 2.2) {
    const p = progress(t, at, dur);
    if (p <= 0) return null;
    const res = along(points, p);
    const c = BEAM[tone];
    const dx = shake(tone, at);
    ctx.save();
    ctx.translate(dx, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "lighter";
    trace(ctx, res.points);
    ctx.strokeStyle = c;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = width * 4 * u;
    ctx.shadowColor = c;
    ctx.shadowBlur = 16 * u;
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.shadowBlur = 6 * u;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
    if (p < 1) {
      const end = res.points.at(-1) as Pt;
      heads.push({ x: end[0] + dx, y: end[1], c });
    }
    return res;
  }

  /** Beam-written text: revealed left to right, glowing, with the spot at the writing edge. */
  function write(
    s: string,
    x: number,
    y: number,
    size: number,
    tone: Tone,
    at: number,
    dur: number,
    align = "left",
  ) {
    const p = progress(t, at, dur);
    if (p <= 0) return;
    const c = BEAM[tone];
    const dx = shake(tone, at);
    ctx.save();
    ctx.font = `500 ${Math.round(size * u)}px ${MONO}`;
    ctx.letterSpacing = `${(size * 0.04 * u).toFixed(1)}px`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = (align === "center" ? x - w / 2 : align === "right" ? x - w : x) + dx;
    ctx.beginPath();
    ctx.rect(left - 4 * u, y - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = c;
    ctx.shadowBlur = 14 * u;
    // Hollow single-weight letters: an outline in the beam colour, like vector strokes.
    ctx.lineWidth = Math.max(1.2, size * 0.05) * u;
    ctx.strokeStyle = c;
    ctx.globalAlpha = 0.9;
    ctx.strokeText(s, left, y);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = c;
    ctx.fillText(s, left, y);
    ctx.restore();
    if (p < 1) heads.push({ x: left + w * p, y, c });
  }

  function rectPts(l: number, tp: number, w: number, h: number): Pt[] {
    return [
      [l, tp],
      [l + w, tp],
      [l + w, tp + h],
      [l, tp + h],
      [l, tp],
    ];
  }

  return {
    surface() {
      // The bezel.
      const bz = ctx.createLinearGradient(0, 0, 0, H);
      bz.addColorStop(0, "#3A3B38");
      bz.addColorStop(1, "#1E1F1D");
      ctx.fillStyle = bz;
      ctx.fillRect(0, 0, W, H);
      // The tube face: deep green-black, brighter in the middle.
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(sx, sy, sw, sh, 28 * u);
      ctx.clip();
      const face = ctx.createRadialGradient(
        W / 2,
        H / 2,
        0,
        W / 2,
        H / 2,
        Math.hypot(sw, sh) * 0.55,
      );
      face.addColorStop(0, "#0E1A12");
      face.addColorStop(1, "#040805");
      ctx.fillStyle = face;
      ctx.fillRect(sx, sy, sw, sh);
      // The 10 x 8 graticule, with minor ticks on the centre axes.
      ctx.strokeStyle = "rgba(140,255,168,0.09)";
      ctx.lineWidth = 1 * u;
      for (let i = 1; i < 10; i++) {
        ctx.beginPath();
        ctx.moveTo(sx + (sw * i) / 10, sy);
        ctx.lineTo(sx + (sw * i) / 10, sy + sh);
        ctx.stroke();
      }
      for (let i = 1; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(sx, sy + (sh * i) / 8);
        ctx.lineTo(sx + sw, sy + (sh * i) / 8);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(140,255,168,0.14)";
      for (let i = 0; i < 50; i++) {
        const x = sx + (sw * i) / 50;
        ctx.beginPath();
        ctx.moveTo(x, sy + sh / 2 - 4 * u);
        ctx.lineTo(x, sy + sh / 2 + 4 * u);
        ctx.stroke();
      }
      for (let i = 0; i < 40; i++) {
        const y = sy + (sh * i) / 40;
        ctx.beginPath();
        ctx.moveTo(sx + sw / 2 - 4 * u, y);
        ctx.lineTo(sx + sw / 2 + 4 * u, y);
        ctx.stroke();
      }
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.08, size = 44, at = 0, dur, align = "left" } = o;
      write(s.toUpperCase(), X(x), Y(y), size, "ink", at, dur ?? 0.05 * s.length + 0.2, align);
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 26, tone = "ink", align = "center" } = o;
      write(s.toUpperCase(), X(x), Y(y), size, tone, at, o.dur ?? 0.03 * s.length + 0.15, align);
    },
    node(x, y, r, o = {}) {
      // A small Lissajous-style loop: a circle traced by the beam with a bright centre dot.
      const { at = 0, dur = 0.3, tone = "ink" } = o;
      const R = r * 0.8 * u;
      const res = beam(ellipse(X(x), Y(y), R, R, 36, -Math.PI / 2, 1), at, dur, tone, 2);
      if (res && progress(t, at, dur) >= 1) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = BEAM[tone];
        ctx.shadowColor = BEAM[tone];
        ctx.shadowBlur = 10 * u;
        ctx.beginPath();
        ctx.arc(X(x), Y(y), 2.6 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      beam(rectPts(X(x), Y(y), X(w), Y(h)), at, dur, tone, 2.2);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 32);
      const res = beam(pts, at, dur, tone, head ? 2.2 : 1);
      if (!res || !head || progress(t, at, dur) < 1) return;
      const tip = pts.at(-1) as Pt;
      const s = 14 * u;
      beam(
        [
          [tip[0] - Math.cos(res.angle - 0.5) * s, tip[1] - Math.sin(res.angle - 0.5) * s],
          tip,
          [tip[0] - Math.cos(res.angle + 0.5) * s, tip[1] - Math.sin(res.angle + 0.5) * s],
        ],
        at + dur,
        0.08,
        tone,
        2.2,
      );
    },
    store(x, y, w, h, o = {}) {
      // A drum drawn as stacked ellipses, as an X-Y figure would trace it.
      const { at = 0, dur = 0.8, tone = "ink" } = o;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.3;
      const top = Y(y) + ry;
      const bot = Y(y + h) - ry;
      const n = 4;
      for (let i = 0; i < n; i++) {
        beam(
          ellipse(cx, top + ((bot - top) * i) / (n - 1), rx, ry, 40, -Math.PI / 2, 1),
          at + (i * dur) / (n + 1),
          dur / (n + 1),
          tone,
          2,
        );
      }
      beam(
        [
          [cx - rx, top],
          [cx - rx, bot],
        ],
        at + dur * 0.8,
        0.15,
        tone,
        2,
      );
      beam(
        [
          [cx + rx, top],
          [cx + rx, bot],
        ],
        at + dur * 0.8,
        0.15,
        tone,
        2,
      );
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      // Numerals are redrawn each frame; flicker slightly while counting.
      const flicker = count && t < at + dur ? 0.75 + 0.25 * hash(Math.floor(t * 30)) : 1;
      ctx.save();
      ctx.globalAlpha = flicker;
      write(value, X(x), Y(y), size, tone === "accent" ? "ink" : tone, at, 0.2, "center");
      ctx.restore();
      if (sub)
        write(
          sub.toUpperCase(),
          X(x),
          Y(y) + size * 0.8 * u,
          size * 0.3,
          tone === "accent" ? "ink" : tone,
          at + 0.2,
          0.3,
          "center",
        );
      // A sine trace underlining the result once it lands.
      if (count && size >= 80) {
        const w = size * 1.6 * u;
        const pts: Pt[] = Array.from({ length: 61 }, (_, i) => {
          const f = i / 60;
          return [
            X(x) - w / 2 + w * f,
            Y(y) + size * 1.25 * u + Math.sin(f * Math.PI * 6 + t * 4) * 6 * u * (1 - f * 0.7),
          ];
        });
        beam(pts, at + dur, 0.5, "ink", 1.6);
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const s = (o.size ?? 30) * u;
      const cx = X(x);
      const cy = Y(y);
      if (kind === "check")
        beam(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.12, cy + s * 0.4],
            [cx + s * 0.55, cy - s * 0.5],
          ],
          at,
          0.3,
          "ink",
          2.6,
        );
      else {
        beam(
          [
            [cx - s * 0.45, cy - s * 0.45],
            [cx + s * 0.45, cy + s * 0.45],
          ],
          at,
          0.15,
          "bad",
          2.6,
        );
        beam(
          [
            [cx + s * 0.45, cy - s * 0.45],
            [cx - s * 0.45, cy + s * 0.45],
          ],
          at + 0.15,
          0.15,
          "bad",
          2.6,
        );
      }
    },
    finish() {
      // The beam spot wherever a stroke is still being written.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const h of heads) {
        const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 14 * u);
        g.addColorStop(0, "rgba(240,255,240,1)");
        g.addColorStop(0.25, h.c);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(h.x - 14 * u, h.y - 14 * u, 28 * u, 28 * u);
      }
      ctx.restore();
      // Curved-glass falloff and a faint reflection, then the bezel lip over the tube edge.
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(sx, sy, sw, sh, 28 * u);
      ctx.clip();
      const v = ctx.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(sw, sh) * 0.35,
        W / 2,
        H / 2,
        Math.hypot(sw, sh) * 0.58,
      );
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = v;
      ctx.fillRect(sx, sy, sw, sh);
      const glare = ctx.createLinearGradient(sx, sy, sx + sw * 0.4, sy + sh * 0.5);
      glare.addColorStop(0, "rgba(255,255,255,0.05)");
      glare.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glare;
      ctx.fillRect(sx, sy, sw, sh);
      ctx.restore();
      ctx.save();
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.roundRect(sx, sy, sw, sh, 28 * u);
      ctx.stroke();
      ctx.restore();
    },
  };
}

export default {
  id: "oscilloscope",
  name: "Vector scope",
  category: "Retro Digital",
  make,
} satisfies Style;
