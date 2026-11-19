// Dry-erase marker on a glossy board: every line drawn on in order with the
// marker following its tip. Black for structure, blue for the idea, green for
// the result, red for the correction.
import {
  along,
  alpha,
  type Cue,
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

const INK: Record<Tone, string> = {
  ink: "#22262B",
  accent: "#2F5BD3",
  good: "#1F9254",
  bad: "#D9343F",
  muted: "#7A8088",
};
const HAND = '"Kalam", cursive';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  let tip: { x: number; y: number; color: string } | null = null;
  let seed = 1;

  /** Ink a path drawn on from `at` over `dur`: a streaky stroke, darker at its edges. */
  function ink(points: Pt[], { at = 0, dur = 0.6, tone = "ink" as Tone, width = 9 } = {}) {
    const p = progress(t, at, dur);
    seed += 1;
    if (p <= 0) return;
    const { points: drawn } = along(roughen(points, 1.2 * u, seed * 13.1), p);
    const col = INK[tone];
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    trace(ctx, drawn);
    ctx.strokeStyle = alpha(col, 0.92);
    ctx.lineWidth = width * u;
    ctx.stroke();
    trace(ctx, drawn);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = width * 0.38 * u;
    ctx.stroke();
    ctx.restore();
    const end = drawn.at(-1) as Pt;
    if (p < 1) tip = { x: end[0], y: end[1], color: col };
  }

  /** Handwriting revealed left to right as the marker moves along it. */
  function write(s: string, x: number, y: number, o: Cue & { size?: number; align?: string } = {}) {
    const { at = 0, size = 40, tone = "ink", align = "left" } = o;
    const dur = o.dur ?? 0.05 * s.length + 0.1;
    const p = progress(t, at, dur);
    if (p <= 0) return;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${HAND}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.beginPath();
    ctx.rect(left - 4 * u, Y(y) - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = INK[tone];
    ctx.fillText(s, left, Y(y));
    ctx.restore();
    if (p < 1) tip = { x: left + w * p, y: Y(y), color: INK[tone] };
  }

  return {
    surface() {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#F7F8F7");
      g.addColorStop(1, "#E8EAE9");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const sheen = ctx.createRadialGradient(
        W * 0.3,
        H * 0.15,
        0,
        W * 0.3,
        H * 0.15,
        Math.max(W, H) * 0.7,
      );
      sheen.addColorStop(0, "rgba(255,255,255,0.7)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, W, H);
      // Ghosts of old erasing.
      ctx.save();
      ctx.strokeStyle = "rgba(60,70,80,0.014)";
      for (let i = 0; i < 9; i++) {
        ctx.lineWidth = (30 + hash(i) * 50) * u;
        ctx.beginPath();
        ctx.ellipse(
          hash(i + 3) * W,
          hash(i + 7) * H,
          (60 + hash(i + 11) * 140) * u,
          (25 + hash(i + 13) * 60) * u,
          hash(i) * 3,
          0,
          5,
        );
        ctx.stroke();
      }
      ctx.restore();
      // The aluminium frame and the pen tray.
      const f = 16 * u;
      const metal = (x: number, y: number, w: number, h: number, vertical: boolean) => {
        const mg = vertical
          ? ctx.createLinearGradient(x, 0, x + w, 0)
          : ctx.createLinearGradient(0, y, 0, y + h);
        mg.addColorStop(0, "#D9DDE1");
        mg.addColorStop(0.5, "#AEB4BA");
        mg.addColorStop(1, "#80878F");
        ctx.fillStyle = mg;
        ctx.fillRect(x, y, w, h);
      };
      metal(0, 0, W, f, false);
      metal(0, 0, f, H, true);
      metal(W - f, 0, f, H, true);
      metal(0, H - f * 2.2, W, f * 2.2, false);
      (["accent", "ink"] as Tone[]).forEach((c, i) => {
        const x = W * (0.72 + i * 0.07);
        const y = H - f * 1.35;
        ctx.fillStyle = "#F4F4F4";
        ctx.beginPath();
        ctx.roundRect(x, y, 90 * u, 14 * u, 7 * u);
        ctx.fill();
        ctx.fillStyle = INK[c];
        ctx.beginPath();
        ctx.roundRect(x + 64 * u, y, 26 * u, 14 * u, 7 * u);
        ctx.fill();
      });
      ctx.fillStyle = "#2E3236";
      ctx.beginPath();
      ctx.roundRect(W * 0.05, H - f * 1.5, 110 * u, 18 * u, 4 * u);
      ctx.fill();
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 64, at = 0 } = o;
      write(s.toUpperCase(), x, y, { ...o, size, at, align: o.align ?? "left" });
      const done = at + (o.dur ?? 0.05 * s.length + 0.1);
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${HAND}`;
      const w = ctx.measureText(s.toUpperCase()).width / W;
      ctx.restore();
      ink(curve([X(x), Y(y) + size * 0.7 * u], [X(x + w), Y(y) + size * 0.75 * u], -0.02, 16), {
        at: done,
        dur: 0.35,
        tone: "accent",
        width: 8,
      });
    },
    label(s, x, y, o = {}) {
      write(s, x, y, { size: 32, align: "center", ...o });
    },
    node(x, y, r, o = {}) {
      ink(ellipse(X(x), Y(y), r * u, r * u, 46, -Math.PI / 2, 1.05), { dur: 0.15, width: 5, ...o });
    },
    box(x, y, w, h, o = {}) {
      const a: Pt = [X(x), Y(y)];
      const b: Pt = [X(x + w), Y(y + h)];
      ink([a, [b[0], a[1]], b, [a[0], b[1]], [a[0], a[1] - 2 * u]], { dur: 0.45, ...o });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true } = o;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      ink(shaft, { ...o, at, dur, width: o.tone === "accent" ? 3 : 7 });
      if (!head) return;
      const end = shaft.at(-1) as Pt;
      const prev = shaft.at(-3) as Pt;
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 22 * u;
      ink(
        [
          [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
          end,
          [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s],
        ],
        { ...o, at: at + dur, dur: 0.12 },
      );
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.28;
      const top = Y(y) + ry;
      const bottom = Y(y + h) - ry;
      const half = (cy: number) => ellipse(cx, cy, rx, ry, 32, 0, 0.5);
      const step = dur / 5;
      ink(ellipse(cx, top, rx, ry, 32, Math.PI, 1), { ...o, at, dur: step * 1.5 });
      ink(
        [
          [cx - rx, top],
          [cx - rx, bottom],
        ],
        { ...o, at: at + step * 1.5, dur: step * 0.7 },
      );
      ink(half(bottom), { ...o, at: at + step * 2.2, dur: step });
      ink(
        [
          [cx + rx, bottom],
          [cx + rx, top],
        ],
        { ...o, at: at + step * 3.2, dur: step * 0.6 },
      );
      ink(half(top + (bottom - top) / 3), { ...o, at: at + step * 3.8, dur: step * 0.6 });
      ink(half(top + ((bottom - top) * 2) / 3), { ...o, at: at + step * 4.4, dur: step * 0.6 });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      write(value, x, y, { ...o, size, align: "center", dur: 0.3 });
      if (sub)
        write(sub, x, y + (size * 0.75 * u) / H, {
          ...o,
          at: at + 0.3,
          size: size * 0.35,
          align: "center",
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check") {
        ink(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.1, cy + s * 0.4],
            [cx + s * 0.6, cy - s * 0.5],
          ],
          { dur: 0.3, tone: "good", ...o },
        );
      } else {
        const at = o.at ?? 0;
        ink(
          [
            [cx - s * 0.5, cy - s * 0.5],
            [cx + s * 0.5, cy + s * 0.5],
          ],
          { dur: 0.15, tone: "bad", ...o },
        );
        ink(
          [
            [cx + s * 0.5, cy - s * 0.5],
            [cx - s * 0.5, cy + s * 0.5],
          ],
          { dur: 0.15, tone: "bad", ...o, at: at + 0.15 },
        );
      }
    },
    finish() {
      if (!tip) return;
      const { x, y, color } = tip;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI * 0.3);
      ctx.shadowColor = "rgba(0,0,0,0.28)";
      ctx.shadowBlur = 18 * u;
      ctx.shadowOffsetX = 10 * u;
      ctx.shadowOffsetY = 14 * u;
      const L = 170 * u;
      const R = 11 * u;
      ctx.fillStyle = "#F2F3F4";
      ctx.beginPath();
      ctx.roundRect(18 * u, -R, L, R * 2, R);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(L - 30 * u, -R - u, 52 * u, R * 2 + 2 * u, R);
      ctx.fill();
      ctx.fillStyle = "#2B2F33";
      trace(
        ctx,
        [
          [0, 0],
          [20 * u, -R * 0.7],
          [20 * u, R * 0.7],
        ],
        true,
      );
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(18 * u, -R, 10 * u, R * 2);
      ctx.restore();
    },
  };
}

export default {
  id: "whiteboard",
  name: "Whiteboard",
  category: "Hand-drawn",
  make,
} satisfies Style;
