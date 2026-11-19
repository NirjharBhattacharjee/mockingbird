// An old patent sheet: ruling-pen black lines on aged paper, inked one stroke
// at a time, outline first and shading after. Heavier shade lines on the
// lower right, parallel hatching, italic labels on fine leaders, numbers on
// odometer drums, and the examiner's red pencil for corrections.
import {
  along,
  clamp,
  counting,
  curve,
  ellipse,
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

const PAPER = "#EFE5CC";
const INK = "#1D1A16";
const RED = "#B8352B";
const COLOR: Record<Tone, string> = {
  ink: INK,
  accent: INK,
  good: INK,
  bad: RED,
  muted: "#6E665A",
};
const SERIF = '"Charis SIL", serif';
const MONO = '"Courier Prime", monospace';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__patentPaper ??= new Map();
  let seed = 5;

  /** A ruled line inked on from `at` over `dur`. */
  function rule(points: Pt[], at: number, dur: number, width = 2, color = INK, wobble = 0.25) {
    seed++;
    const p = progress(t, at, dur);
    if (p <= 0) return 0;
    const { points: drawn } = along(wobble ? roughen(points, wobble * u, seed * 3.7) : points, p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    trace(ctx, drawn);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
    return p;
  }

  /** Parallel hatching across a box, each line inked in turn. */
  function hatch(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    at: number,
    dur: number,
    gap = 7,
    vertical = true,
  ) {
    const n = Math.floor(((vertical ? x1 - x0 : y1 - y0) / (gap * u)) | 0);
    for (let i = 1; i < n; i++) {
      const a = at + (dur * i) / n;
      if (vertical)
        rule(
          [
            [x0 + i * gap * u, y0],
            [x0 + i * gap * u, y1],
          ],
          a,
          0.05,
          1,
          INK,
          0,
        );
      else
        rule(
          [
            [x0, y0 + i * gap * u],
            [x1, y0 + i * gap * u],
          ],
          a,
          0.05,
          1,
          INK,
          0,
        );
    }
  }

  function typeset(
    s: string,
    x: number,
    y: number,
    font: string,
    color: string,
    align: string,
    p: number,
  ) {
    if (p <= 0) return;
    ctx.save();
    ctx.font = font;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.textAlign = "left";
    ctx.fillStyle = color;
    ctx.fillText(s.slice(0, Math.ceil(s.length * clamp(p))), left, y);
    ctx.restore();
    return { left, w };
  }

  return {
    surface() {
      const key = `${W}x${H}`;
      let tile = g.__patentPaper.get(key);
      if (!tile) {
        tile = new OffscreenCanvas(W, H);
        const c = tile.getContext("2d");
        c.fillStyle = PAPER;
        c.fillRect(0, 0, W, H);
        for (let i = 0; i < 2600; i++) {
          c.fillStyle = hash(i) > 0.5 ? "rgba(120,90,40,0.06)" : "rgba(255,250,235,0.08)";
          const s = (2 + hash(i * 2.3) * 14) * u;
          c.fillRect(hash(i * 3.1) * W, hash(i * 4.7) * H, s, s * 0.6);
        }
        const v = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7);
        v.addColorStop(0, "rgba(140,100,40,0)");
        v.addColorStop(1, "rgba(140,100,40,0.22)");
        c.fillStyle = v;
        c.fillRect(0, 0, W, H);
        c.strokeStyle = "rgba(29,26,22,0.55)";
        c.lineWidth = 1.5 * u;
        c.strokeRect(14 * u, 14 * u, W - 28 * u, H - 28 * u);
        c.fillStyle = INK;
        c.font = `${Math.round(14 * u)}px ${SERIF}`;
        c.textBaseline = "top";
        c.textAlign = "left";
        c.fillText("Mar. 7, 1933.", 28 * u, 24 * u);
        c.textAlign = "right";
        c.fillText("Sheet 1", W - 28 * u, 24 * u);
        c.font = `700 ${Math.round(20 * u)}px ${SERIF}`;
        c.textBaseline = "bottom";
        c.fillText("FIG. 1.", W - 40 * u, H - 30 * u);
        g.__patentPaper.set(key, tile);
      }
      ctx.drawImage(tile, 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.05, y = 0.11, size = 40, at = 0, dur = 0.9 } = o;
      const r = typeset(
        s.toUpperCase(),
        X(x),
        Y(y),
        `500 ${Math.round(size * u)}px ${SERIF}`,
        INK,
        o.align ?? "left",
        progress(t, at, dur * 0.8),
      );
      if (!r) return;
      const ly = Y(y) + size * 0.62 * u;
      rule(
        [
          [r.left, ly],
          [r.left + r.w, ly],
        ],
        at + dur * 0.8,
        0.25,
        1.5,
        INK,
        0,
      );
      rule(
        [
          [r.left, ly + 4 * u],
          [r.left + r.w, ly + 4 * u],
        ],
        at + dur * 0.8 + 0.1,
        0.25,
        0.8,
        INK,
        0,
      );
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, tone = "ink", align = "center" } = o;
      typeset(
        s,
        X(x),
        Y(y),
        `italic 400 ${Math.round(size * u)}px ${SERIF}`,
        COLOR[tone],
        align,
        progress(t, at, o.dur ?? 0.035 * s.length + 0.1),
      );
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.25, tone = "ink" } = o;
      const R = r * u;
      const [cx, cy] = [X(x), Y(y)];
      if (t < at) return;
      if (progress(t, at, dur) > 0.98) {
        ctx.fillStyle = PAPER;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();
      }
      rule(ellipse(cx, cy, R, R, 40), at, dur, 1.8, COLOR[tone], 0);
      // A heavier shade line on the lower right, and a hub.
      rule(
        ellipse(cx, cy, R - 2 * u, R - 2 * u, 20, Math.PI * -0.1, 0.35),
        at + dur,
        0.12,
        3,
        COLOR[tone],
        0,
      );
      rule(ellipse(cx, cy, R * 0.35, R * 0.35, 20), at + dur + 0.08, 0.12, 1.2, COLOR[tone], 0);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "ink" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      if (t < at) return;
      ctx.fillStyle = PAPER;
      ctx.fillRect(x0, y0, (x1 - x0) * clamp(progress(t, at, dur) * 4), y1 - y0);
      const c = COLOR[tone];
      rule(
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
          [x0, y0],
        ],
        at,
        dur * 0.5,
        2,
        c,
        0,
      );
      rule(
        [
          [x1 + 3 * u, y0 + 4 * u],
          [x1 + 3 * u, y1 + 3 * u],
          [x0 + 4 * u, y1 + 3 * u],
        ],
        at + dur * 0.5,
        0.15,
        3.5,
        c,
        0,
      );
      // Shading near the right edge: lines that get closer toward it.
      for (let i = 0; i < 7; i++) {
        const lx = x1 - (x1 - x0) * 0.22 * (1 - i / 7) ** 1.6;
        rule(
          [
            [lx, y0 + 3 * u],
            [lx, y1 - 3 * u],
          ],
          at + dur * 0.6 + i * 0.03,
          0.06,
          0.9,
          c,
          0,
        );
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const c = COLOR[tone];
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      if (tone === "bad") {
        // The examiner's red pencil: a looser, grainy line.
        rule(pts, at, dur, 3, RED, 1.2);
      } else rule(pts, at, dur, head ? 1.6 : 0.9, c, 0);
      if (head && progress(t, at, dur) >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 14 * u;
        ctx.beginPath();
        ctx.moveTo(end[0], end[1]);
        ctx.lineTo(end[0] - Math.cos(a - 0.3) * s, end[1] - Math.sin(a - 0.3) * s);
        ctx.lineTo(end[0] - Math.cos(a + 0.3) * s, end[1] - Math.sin(a + 0.3) * s);
        ctx.closePath();
        ctx.fillStyle = c;
        ctx.fill();
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      if (t < at) return;
      const cx = (x0 + x1) / 2;
      const rx = (x1 - x0) / 2;
      const ry = rx * 0.3;
      ctx.fillStyle = PAPER;
      ctx.fillRect(x0, y0 + ry, x1 - x0, y1 - y0 - 2 * ry);
      const s = dur / 6;
      rule(ellipse(cx, y0 + ry, rx, ry, 40), at, s * 1.5, 1.8, INK, 0);
      rule(
        [
          [x0, y0 + ry],
          [x0, y1 - ry],
        ],
        at + s * 1.5,
        s,
        1.8,
        INK,
        0,
      );
      rule(ellipse(cx, y1 - ry, rx, ry, 24, 0, 0.5), at + s * 2.5, s, 1.8, INK, 0);
      rule(
        [
          [x1, y1 - ry],
          [x1, y0 + ry],
        ],
        at + s * 3.5,
        s,
        3,
        INK,
        0,
      );
      // Cylinder shading: lines closer together toward each side.
      for (let i = 1; i < 12; i++) {
        const f = i / 12;
        const k = Math.sign(f - 0.5) * Math.abs(f - 0.5) ** 0.6 * 2 ** -0.4 * 2;
        const lx = cx + k * rx * 0.97;
        if (Math.abs(f - 0.5) < 0.2) continue;
        const e = ry * Math.sqrt(Math.max(0, 1 - ((lx - cx) / rx) ** 2));
        rule(
          [
            [lx, y0 + ry + e],
            [lx, y1 - ry + e],
          ],
          at + s * 4.5 + i * 0.02,
          0.06,
          0.8,
          INK,
          0,
        );
      }
      void hatch;
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) : s;
      const unit = count ? s : "";
      const digits = value.split("");
      const cw = size * 0.62 * u;
      const ch = size * 1.05 * u;
      const total = digits.length * cw + (unit ? cw * 0.8 : 0);
      let left = X(x) - total / 2;
      const top = Y(y) - ch / 2 + (sub ? -size * 0.05 * u : 0);
      const p = progress(t, at, 0.25);
      ctx.save();
      ctx.globalAlpha = p;
      // Fractional roll: the last drum shows the next digit sliding in.
      const raw = count
        ? count[0] + (count[1] - count[0]) * (1 - 2 ** (-10 * clamp((t - at) / dur)))
        : 0;
      const frac = count && clamp((t - at) / dur) < 1 ? raw % 1 : 0;
      for (const [i, d] of digits.entries()) {
        if (d === ",") {
          left += cw * 0.3;
          continue;
        }
        ctx.fillStyle = "#FBF6E8";
        ctx.fillRect(left, top, cw * 0.9, ch);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2 * u;
        ctx.strokeRect(left, top, cw * 0.9, ch);
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, cw * 0.9, ch);
        ctx.clip();
        ctx.font = `700 ${Math.round(size * 0.8 * u)}px ${SERIF}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = INK;
        const last = i === digits.length - 1;
        const off = last ? frac * ch : 0;
        ctx.fillText(d, left + cw * 0.45, top + ch / 2 - off);
        if (last && frac)
          ctx.fillText(String((Number(d) + 1) % 10), left + cw * 0.45, top + ch * 1.5 - off);
        // Drum shading top and bottom.
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = `rgba(29,26,22,${0.12 - k * 0.025})`;
          ctx.fillRect(left, top + k * 3 * u, cw * 0.9, 3 * u);
          ctx.fillRect(left, top + ch - (k + 1) * 3 * u, cw * 0.9, 3 * u);
        }
        ctx.restore();
        left += cw;
      }
      if (unit) {
        ctx.font = `400 ${Math.round(size * 0.7 * u)}px ${SERIF}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = INK;
        ctx.fillText(unit, left + 2 * u, top + ch / 2);
      }
      ctx.restore();
      if (sub) {
        typeset(
          sub,
          X(x),
          top - size * 0.35 * u,
          `italic 400 ${Math.round(size * 0.38 * u)}px ${SERIF}`,
          INK,
          "center",
          progress(t, at + 0.2, 0.4),
        );
        // The examiner rings it in red pencil once it lands.
        rule(
          ellipse(X(x), top + ch / 2, total * 0.72, ch * 0.85, 48, -Math.PI * 0.7, 1.08),
          at + dur + 0.1,
          0.45,
          2.5,
          RED,
          1.5,
        );
      }
      void MONO;
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 34 } = o;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check")
        rule(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.15, cy + s * 0.4],
            [cx + s * 0.6, cy - s * 0.55],
          ],
          at,
          dur,
          2.5,
        );
      else {
        rule(
          [
            [cx - s * 0.5, cy - s * 0.5],
            [cx + s * 0.5, cy + s * 0.5],
          ],
          at,
          dur / 2,
          2.5,
          RED,
          1,
        );
        rule(
          [
            [cx + s * 0.5, cy - s * 0.5],
            [cx - s * 0.5, cy + s * 0.5],
          ],
          at + dur / 2,
          dur / 2,
          2.5,
          RED,
          1,
        );
      }
    },
    finish() {},
  };
}

export default {
  id: "patent-drawing",
  name: "Patent drawing",
  category: "Illustration",
  make,
} satisfies Style;
