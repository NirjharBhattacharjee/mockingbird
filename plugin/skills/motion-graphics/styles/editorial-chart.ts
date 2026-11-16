// A broadsheet's data graphic: a warm salmon page, a serif headline over a
// short claret rule, hairlines in quiet greys, one claret highlight, and
// notes in a reporter's hand where something needs pointing at. Type sets
// with a short fade, rules and lines draw left to right, notes ink in.
import {
  alpha,
  arrowhead,
  counting,
  curve,
  ellipse,
  expo,
  frame,
  hash,
  type Look,
  type Pt,
  progress,
  roughen,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const PAGE = "#FDEFE3";
const INK = "#33302E";
const CLARET = "#990F3D";
const GREY = "#B8ADA3";
const TONE: Record<Tone, string> = {
  ink: INK,
  accent: CLARET,
  good: "#0D7680",
  bad: "#C8102E",
  muted: "#807973",
};
const SERIF = '"Georgia", "Iowan Old Style", "Times New Roman", serif';
const SANS = '"Helvetica Neue", "Avenir Next", Arial, sans-serif';
const HAND = '"Bradley Hand", "Segoe Print", "Marker Felt", "Comic Sans MS", cursive';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const fade = (at = 0, dur = 0.4) => expo(progress(t, at, dur));
  let seed = 1;

  function write(
    s: string,
    x: number,
    y: number,
    font: string,
    color: string,
    align: string,
    p: number,
    rise = 6,
  ) {
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s, x, y + (1 - p) * rise * u);
    ctx.restore();
  }

  /** Handwriting revealed left to right. */
  function hand(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: string,
    at: number,
  ) {
    const dur = 0.04 * s.length + 0.15;
    const p = progress(t, at, dur);
    if (p <= 0) return;
    ctx.save();
    ctx.font = `600 ${Math.round(size * u)}px ${HAND}`;
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 4 * u, y - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left, y);
    ctx.restore();
  }

  /** A pen line, slightly wobbly, drawn on. */
  function pen(points: Pt[], p: number, color: string, w = 2) {
    seed += 1;
    if (p <= 0) return;
    const pts = roughen(points, 1.2 * u, seed * 7.7);
    ctx.save();
    trace(ctx, pts.slice(0, Math.max(2, Math.round(pts.length * p))));
    ctx.strokeStyle = color;
    ctx.lineWidth = w * u;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }

  return {
    surface() {
      ctx.fillStyle = PAGE;
      ctx.fillRect(0, 0, W, H);
      // running head rule and a source line at the foot
      const p = fade(0, 0.8);
      ctx.fillStyle = INK;
      ctx.fillRect(X(0.035), Y(0.035), (X(0.965) - X(0.035)) * p, 1.2 * u);
      ctx.fillRect(X(0.035), Y(0.93), (X(0.965) - X(0.035)) * p, 0.8 * u);
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = `600 ${Math.round(13 * u)}px ${SANS}`;
      ctx.letterSpacing = `${Math.round(1.5 * u)}px`;
      ctx.fillStyle = TONE.muted;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText("SOURCE: ILLUSTRATIVE", X(0.965), Y(0.955));
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.15, size = 64, at = 0, dur = 0.7, align = "left" } = o;
      const p = fade(at, dur);
      if (p <= 0) return;
      // claret kicker rule above
      ctx.fillStyle = CLARET;
      ctx.fillRect(X(x), Y(y) - size * 0.95 * u, 46 * u * expo(progress(t, at, 0.5)), 4 * u);
      write(s, X(x), Y(y), `400 ${Math.round(size * u)}px ${SERIF}`, INK, align, p);
    },
    label(s, x, y, o = {}) {
      const { size = 30, align = "center", tone = "ink", at = 0 } = o;
      if (tone === "bad" || tone === "accent")
        hand(s, X(x), Y(y), size * 1.15, TONE[tone], align, at);
      else
        write(
          s,
          X(x),
          Y(y),
          `500 ${Math.round(size * u)}px ${SANS}`,
          tone === "ink" ? TONE.muted : TONE[tone],
          align,
          fade(at),
        );
    },
    node(x, y, r, o = {}) {
      const p = fade(o.at, 0.3);
      if (p <= 0) return;
      const R = r * u * 0.45;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R * p, 0, Math.PI * 2);
      ctx.fillStyle = PAGE;
      ctx.fill();
      ctx.lineWidth = 1.6 * u;
      ctx.strokeStyle = o.tone === "accent" || !o.tone ? CLARET : TONE[o.tone];
      ctx.stroke();
    },
    box(x, y, w, h, o = {}) {
      const p = fade(o.at, 0.6);
      if (p <= 0) return;
      const [bx, by, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      ctx.save();
      ctx.globalAlpha = p;
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = o.tone && o.tone !== "ink" ? alpha(TONE[o.tone], 0.8) : INK;
      ctx.lineWidth = 1.2 * u;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const p = expo(progress(t, at, dur));
      if (tone === "bad") {
        // a dashed hand-drawn arrow, the reporter's correction
        if (p <= 0) return;
        ctx.save();
        ctx.setLineDash([7 * u, 6 * u]);
        pen(pts, p, TONE.bad, 2.2);
        ctx.restore();
        if (head && p >= 1) {
          const end = pts.at(-1) as Pt;
          const prev = pts.at(-3) as Pt;
          ctx.save();
          arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 14 * u);
          ctx.strokeStyle = TONE.bad;
          ctx.lineWidth = 2.2 * u;
          ctx.stroke();
          ctx.restore();
        }
        return;
      }
      if (p <= 0) return;
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      trace(ctx, shown);
      ctx.strokeStyle = head ? INK : alpha(tone === "accent" ? CLARET : GREY, 0.75);
      ctx.lineWidth = (head ? 1.4 : 1) * u;
      ctx.stroke();
      if (head && p >= 0.99) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 10 * u);
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      // a waffle of squares, claret ones filling in among the greys
      const at = o.at ?? 0;
      const dur = o.dur ?? 0.8;
      const cols = 5;
      const cell = X(w) / cols;
      const rows = Math.max(3, Math.floor(Y(h) / cell));
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const p = progress(t, at + (i / (rows * cols)) * dur, 0.12);
          if (p <= 0) continue;
          ctx.fillStyle = hash(i * 2.3) > 0.45 ? CLARET : GREY;
          ctx.globalAlpha = p;
          ctx.fillRect(
            X(x) + c * cell + 1.5 * u,
            Y(y) + r * cell + 1.5 * u,
            cell - 3 * u,
            cell - 3 * u,
          );
        }
      ctx.globalAlpha = 1;
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "accent" } = o;
      const p = fade(at, 0.4);
      if (p <= 0) return;
      const str = count ? counting(t, at, dur, count) + s : s;
      const font = `400 ${Math.round(size * 1.05 * u)}px ${SERIF}`;
      write(
        str,
        X(x),
        Y(y) - (sub ? size * 0.12 * u : 0),
        font,
        tone === "accent" ? CLARET : TONE[tone],
        "center",
        p,
        0,
      );
      if (sub) {
        write(
          sub,
          X(x),
          Y(y) + size * 0.6 * u,
          `400 ${Math.round(size * 0.26 * u)}px ${SANS}`,
          TONE.muted,
          "center",
          p,
        );
        // a hand-drawn ring round it once it lands
        const q = progress(t, at + dur, 0.5);
        if (q > 0) {
          ctx.font = font;
          const w = ctx.measureText(`${count ? count[1] : ""}${s}`).width;
          pen(
            ellipse(X(x), Y(y) - size * 0.12 * u, w * 0.72, size * 0.6 * u, 40, -2.6, 1.08),
            q,
            CLARET,
            2.4,
          );
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const at = o.at ?? 0;
      const r = (o.size ?? 22) * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check")
        pen(
          [
            [cx - r * 0.6, cy],
            [cx - r * 0.15, cy + r * 0.5],
            [cx + r * 0.7, cy - r * 0.7],
          ],
          progress(t, at, 0.3),
          TONE.good,
          3,
        );
      else {
        pen(
          [
            [cx - r * 0.5, cy - r * 0.5],
            [cx + r * 0.5, cy + r * 0.5],
          ],
          progress(t, at, 0.15),
          TONE.bad,
          3,
        );
        pen(
          [
            [cx + r * 0.5, cy - r * 0.5],
            [cx - r * 0.5, cy + r * 0.5],
          ],
          progress(t, at + 0.15, 0.15),
          TONE.bad,
          3,
        );
      }
    },
    finish() {},
  };
}

export default {
  id: "editorial-chart",
  name: "Newspaper graphic",
  category: "Data & Information",
  make,
} satisfies Style;
