// A metro diagram: fat coloured lines held to horizontals, verticals and
// 45 degree diagonals with rounded bends, white stations ringed in black,
// a pale river, clean sans names, and an amber dot-matrix board for the
// numbers. Lines run out from their start with stations ticking on as the
// line passes, then small chevrons keep travelling along them.
import {
  along,
  clamp,
  counting,
  expo,
  frame,
  type Look,
  leftOf,
  type Pt,
  progress,
  type Style,
  spring,
  type Tone,
  trace,
} from "./look.ts";

const PAPER = "#F4F2EC";
const NAVY = "#1C2340";
const LINE: Record<Tone, string> = {
  ink: NAVY,
  accent: "#1F6FD1",
  good: "#13914A",
  bad: "#DC2B2B",
  muted: "#A3A3A3",
};
const AMBER = "#FFC21A";
const SANS = '"Montserrat", "Noto Color Emoji", sans-serif';
const MONO = '"JetBrains Mono", "Noto Color Emoji", monospace';

/** An octilinear route from a to b: straight runs joined by 45 degree diagonals, or a detour when bent. */
function route(a: Pt, b: Pt, bend: number): Pt[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (bend) {
    const off: Pt = [(a[1] - b[1]) * bend, (b[0] - a[0]) * bend];
    const len = Math.hypot(...off) || 1;
    const dir: Pt = [dx / (Math.hypot(dx, dy) || 1), dy / (Math.hypot(dx, dy) || 1)];
    return [
      a,
      [a[0] + off[0] + dir[0] * len, a[1] + off[1] + dir[1] * len],
      [b[0] + off[0] - dir[0] * len, b[1] + off[1] - dir[1] * len],
      b,
    ];
  }
  const sx = Math.sign(dx) || 1;
  const sy = Math.sign(dy) || 1;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ay < 1 || ax < 1) return [a, b];
  if (ay <= ax * 0.6) {
    const mx = (a[0] + b[0]) / 2;
    return [a, [mx - (sx * ay) / 2, a[1]], [mx + (sx * ay) / 2, b[1]], b];
  }
  const h = ax * 0.2;
  const k = ax * 0.3;
  return [
    a,
    [a[0] + sx * h, a[1]],
    [a[0] + sx * (h + k), a[1] + sy * k],
    [a[0] + sx * (h + k), b[1] - sy * k],
    [b[0] - sx * h, b[1]],
    b,
  ];
}

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const font = (size: number, w = 600) => `${w} ${Math.round(size * u)}px ${SANS}`;
  const pop = (at = 0) => spring(t, { start: at, stiffness: 300, damping: 15 });
  const g = globalThis as any;
  g.__metroDots ??= new Map();
  const cache: Map<string, any> = g.__metroDots;

  function stroke(points: Pt[], color: string, w: number) {
    ctx.save();
    trace(ctx, points);
    ctx.strokeStyle = color;
    ctx.lineWidth = w * u;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  }

  function station(x: number, y: number, r: number, ring = NAVY) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.lineWidth = Math.max(2.5 * u, r * 0.3);
    ctx.strokeStyle = ring;
    ctx.stroke();
  }

  /** An amber dot-matrix board: the text, then a mesh of dark dots over it. */
  function board(s: string, cx: number, cy: number, size: number, sub?: string) {
    ctx.font = `700 ${Math.round(size * u)}px ${MONO}`;
    const w =
      Math.max(
        ctx.measureText(s).width,
        sub ? ctx.measureText(sub.toUpperCase()).width * 0.35 : 0,
      ) +
      size * 0.6 * u;
    const h = size * (sub ? 1.75 : 1.25) * u;
    const [bx, by] = [cx - w / 2, cy - h / 2];
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(bx, by, w, h, 8 * u);
    ctx.fillStyle = "#14130F";
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = AMBER;
    ctx.shadowColor = "rgba(255,194,26,0.6)";
    ctx.shadowBlur = 8 * u;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (sub) {
      ctx.font = `700 ${Math.round(size * 0.3 * u)}px ${MONO}`;
      ctx.fillText(sub.toUpperCase(), cx, by + size * 0.3 * u);
    }
    ctx.font = `700 ${Math.round(size * u)}px ${MONO}`;
    ctx.fillText(s, cx, cy + (sub ? size * 0.18 * u : 0));
    ctx.shadowBlur = 0;
    const step = Math.max(3, Math.round(4 * u));
    const key = `${step}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(step, step);
      const c = tile.getContext("2d");
      c.fillStyle = "#14130F";
      c.fillRect(0, 0, step, step);
      c.globalCompositeOperation = "destination-out";
      c.beginPath();
      c.arc(step / 2, step / 2, step * 0.46, 0, Math.PI * 2);
      c.fill();
      cache.set(key, tile);
    }
    ctx.fillStyle = ctx.createPattern(tile, "repeat");
    ctx.fillRect(bx, by, w, h);
    ctx.restore();
  }

  return {
    surface() {
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      // a pale river crossing the foot of the map, octilinear like the lines
      stroke(
        [
          [0, Y(0.86)],
          [X(0.3), Y(0.86)],
          [X(0.36), Y(0.94)],
          [X(0.7), Y(0.94)],
          [X(0.76), Y(0.86)],
          [W, Y(0.86)],
        ],
        "#BFDCEB",
        26,
      );
    },
    title(s, o = {}) {
      const { x = 0.025, y = 0.04, size = 40, at = 0 } = o;
      const p = expo(progress(t, at, 0.5));
      if (p <= 0) return;
      ctx.font = font(size, 700);
      const w = ctx.measureText(s).width + 90 * u;
      const h = size * 1.9 * u;
      const [bx, by] = [leftOf(X(x), w, o.align), Y(y)];
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, w * p, h);
      ctx.clip();
      ctx.fillStyle = NAVY;
      ctx.fillRect(bx, by, w, h);
      // a small mark made of three line colours meeting at a station
      const [mx, my] = [bx + 30 * u, by + h / 2];
      for (const [i, c] of [LINE.accent, LINE.bad, LINE.good].entries()) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
        stroke(
          [
            [mx, my],
            [mx + Math.cos(a) * 18 * u, my + Math.sin(a) * 18 * u],
          ],
          c,
          6,
        );
      }
      station(mx, my, 6 * u);
      ctx.font = font(size, 700);
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(s, bx + 58 * u, by + h / 2);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { size = 32, align = "center", tone = "ink", at = 0 } = o;
      const p = expo(progress(t, at, 0.3));
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = font(size, 700);
      ctx.fillStyle = tone === "ink" || tone === "muted" ? NAVY : LINE[tone];
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.fillText(s, X(x), Y(y) + (1 - p) * 6 * u);
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const s = pop(o.at);
      if (s <= 0) return;
      station(X(x), Y(y), r * u * 0.6 * s, o.tone === "accent" || !o.tone ? NAVY : LINE[o.tone]);
    },
    box(x, y, w, h, o = {}) {
      const s = expo(progress(t, o.at, 0.4));
      if (s <= 0) return;
      const [bx, by, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      ctx.save();
      ctx.globalAlpha = s;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 14 * u);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.lineWidth = 5 * u;
      ctx.strokeStyle = LINE[o.tone ?? "ink"];
      ctx.stroke();
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.5, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = route([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const { points: shown } = along(pts, expo(p));
      const col = LINE[tone];
      stroke(shown, col, head ? 14 : 5);
      if (head) {
        // trains: chevrons travelling the line
        if (p >= 1) {
          const n = 3;
          for (let i = 0; i < n; i++) {
            const f = (t * 0.35 + i / n) % 1;
            const { points: q, angle } = along(pts, f);
            const tip = q.at(-1) as Pt;
            ctx.save();
            ctx.translate(tip[0], tip[1]);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(-3 * u, -4 * u);
            ctx.lineTo(2 * u, 0);
            ctx.lineTo(-3 * u, 4 * u);
            ctx.strokeStyle = "#FFFFFF";
            ctx.lineWidth = 2.2 * u;
            ctx.stroke();
            ctx.restore();
          }
          // terminus bar
          const end = pts.at(-1) as Pt;
          const prev = pts.at(-2) as Pt;
          const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]) + Math.PI / 2;
          stroke(
            [
              [end[0] + Math.cos(a) * 12 * u, end[1] + Math.sin(a) * 12 * u],
              [end[0] - Math.cos(a) * 12 * u, end[1] - Math.sin(a) * 12 * u],
            ],
            col,
            7,
          );
        }
      }
    },
    store(x, y, w, h, o = {}) {
      // a depot: sidings of three lines fanning into a rounded yard
      const at = o.at ?? 0;
      const p = expo(progress(t, at, o.dur ?? 0.8));
      if (p <= 0) return;
      const [bx, by, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      ctx.save();
      ctx.globalAlpha = clamp(p * 2);
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 12 * u);
      ctx.fillStyle = "#E7E4DA";
      ctx.fill();
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = NAVY;
      ctx.stroke();
      ctx.restore();
      const cols = [LINE.accent, LINE.bad, LINE.good, "#F2A900"];
      for (const [i, c] of cols.entries()) {
        const yy = by + (bh / (cols.length + 1)) * (i + 1);
        const q = progress(t, at + i * 0.1, 0.4);
        if (q > 0)
          stroke(
            [
              [bx + 10 * u, yy],
              [bx + 10 * u + (bw - 20 * u) * expo(q), yy],
            ],
            c,
            7,
          );
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub } = o;
      const p = expo(progress(t, at, 0.3));
      if (p <= 0) return;
      const str = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.translate(X(x), Y(y));
      ctx.scale(1, p);
      board(str, 0, 0, size * 1.05, sub);
      ctx.restore();
    },
    mark(kind, x, y, o = {}) {
      const s = pop(o.at);
      if (s <= 0) return;
      const r = (o.size ?? 24) * u * s;
      const col = kind === "check" ? LINE.good : LINE.bad;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = col;
      ctx.lineWidth = 5 * u;
      if (kind === "check")
        trace(ctx, [
          [cx - r * 0.6, cy],
          [cx - r * 0.15, cy + r * 0.45],
          [cx + r * 0.7, cy - r * 0.6],
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.5, cy - r * 0.5);
        ctx.lineTo(cx + r * 0.5, cy + r * 0.5);
        ctx.moveTo(cx + r * 0.5, cy - r * 0.5);
        ctx.lineTo(cx - r * 0.5, cy + r * 0.5);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {},
  };
}

export default {
  id: "transit-map",
  name: "Metro diagram",
  category: "Data & Information",
  make,
} satisfies Style;
