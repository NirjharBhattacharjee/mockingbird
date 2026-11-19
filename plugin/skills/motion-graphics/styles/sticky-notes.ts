// A brainstorm on a cork board: paper notes in bright pads slap on with a
// small bounce and a lifted-corner shadow, push pins hold them, marker
// writing appears stroke by stroke, and red yarn strings pin to pin.
import {
  along,
  arrowhead,
  clamp,
  counting,
  curve,
  frame,
  hash,
  type Look,
  leftOf,
  type Pt,
  progress,
  roughen,
  type Style,
  spring,
  type Tone,
  trace,
} from "./look.ts";

const PAD: Record<Tone, string> = {
  ink: "#FFF27A",
  accent: "#FF9EC4",
  good: "#9BE08A",
  bad: "#FFB15E",
  muted: "#F7F5EE",
};
const PEN: Record<Tone, string> = {
  ink: "#1E1E24",
  accent: "#1E1E24",
  good: "#1F8A3A",
  bad: "#D62828",
  muted: "#5A5A66",
};
const PIN = ["#D62828", "#2B6CD6", "#2EA44F", "#F2B705"];
const HAND = '"Kalam", "Noto Color Emoji", cursive';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__corkBoard ??= new Map();
  let seed = 3;

  /** How a note slaps on: drops from a little larger, overshoots, settles. */
  const slap = (at = 0) => spring(t, { start: at, stiffness: 320, damping: 16, from: 0, to: 1 });

  function pen(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align = "center",
    p = 1,
  ) {
    if (p <= 0) return;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${HAND}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 4 * u, y - size * u, (w + 8 * u) * clamp(p), size * 2 * u);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.fillText(s, left, y);
    ctx.restore();
  }

  /** A marker line drawn on from `at`. */
  function stroke(points: Pt[], at: number, dur: number, color: string, width = 4) {
    seed++;
    const p = progress(t, at, dur);
    if (p <= 0) return null;
    const { points: drawn, angle } = along(roughen(points, 1 * u, seed * 7.3), p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    trace(ctx, drawn);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
    return { p, angle, end: drawn.at(-1) as Pt };
  }

  function pin(x: number, y: number, k: number) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(x + 4 * u, y + 5 * u, 8 * u, 6 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    const c = PIN[Math.floor(hash(k) * PIN.length)] as string;
    const gr = ctx.createRadialGradient(x - 3 * u, y - 3 * u, 1, x, y, 9 * u);
    gr.addColorStop(0, "#FFFFFF");
    gr.addColorStop(0.3, c);
    gr.addColorStop(1, "#000000");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x, y, 8 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** A square note at (cx, cy) pixels, w x h, slapped on from `at`, turned a touch. */
  function note(
    cx: number,
    cy: number,
    w: number,
    h: number,
    color: string,
    at: number,
    k: number,
    pinned = true,
    lined = false,
  ) {
    const s = slap(at);
    if (s <= 0) return 0;
    const sc = 1 + (1 - s) * 0.35;
    ctx.save();
    ctx.globalAlpha = clamp(s * 3);
    ctx.translate(cx, cy);
    ctx.rotate((hash(k) - 0.5) * 0.08);
    ctx.scale(sc, sc);
    ctx.shadowColor = "rgba(40,20,0,0.35)";
    ctx.shadowBlur = 12 * u;
    ctx.shadowOffsetX = 3 * u;
    ctx.shadowOffsetY = (6 + (1 - s) * 20) * u;
    ctx.fillStyle = color;
    ctx.beginPath();
    // The bottom-right corner lifts.
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, -h / 2);
    ctx.lineTo(w / 2, h / 2 - 8 * u);
    ctx.quadraticCurveTo(w / 2 - 2 * u, h / 2 - 2 * u, w / 2 - 12 * u, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = "transparent";
    // Adhesive band darker at the top, a shade on the curl.
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(-w / 2, -h / 2, w, h * 0.18);
    const curl = ctx.createLinearGradient(w / 2 - 20 * u, h / 2 - 20 * u, w / 2, h / 2);
    curl.addColorStop(0, "rgba(0,0,0,0)");
    curl.addColorStop(1, "rgba(0,0,0,0.12)");
    ctx.fillStyle = curl;
    ctx.fillRect(w / 2 - 22 * u, h / 2 - 22 * u, 22 * u, 22 * u);
    if (lined) {
      ctx.strokeStyle = "rgba(80,120,200,0.35)";
      ctx.lineWidth = 1.2 * u;
      for (let ly = -h / 2 + h * 0.28; ly < h / 2; ly += 14 * u) {
        ctx.beginPath();
        ctx.moveTo(-w / 2, ly);
        ctx.lineTo(w / 2, ly);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(220,60,60,0.5)";
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2 + h * 0.22);
      ctx.lineTo(w / 2, -h / 2 + h * 0.22);
      ctx.stroke();
    }
    ctx.restore();
    if (pinned && s > 0.6) pin(cx, cy - h / 2 + 10 * u, k);
    return s;
  }

  return {
    surface() {
      const key = `${W}x${H}`;
      let tile = g.__corkBoard.get(key);
      if (!tile) {
        tile = new OffscreenCanvas(W, H);
        const c = tile.getContext("2d");
        c.fillStyle = "#C79A62";
        c.fillRect(0, 0, W, H);
        const n = Math.floor((W * H) / (5 * u * 5 * u) / 3);
        for (let i = 0; i < n; i++) {
          const v = hash(i * 1.7);
          c.fillStyle =
            v < 0.35
              ? "rgba(110,70,30,0.35)"
              : v < 0.7
                ? "rgba(230,190,130,0.35)"
                : "rgba(80,50,20,0.25)";
          const s = (1 + hash(i * 3.1) * 3) * u;
          c.fillRect(hash(i * 5.3) * W, hash(i * 7.9) * H, s, s);
        }
        const v = c.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.75);
        v.addColorStop(0, "rgba(0,0,0,0)");
        v.addColorStop(1, "rgba(60,30,0,0.35)");
        c.fillStyle = v;
        c.fillRect(0, 0, W, H);
        const f = 14 * u;
        c.fillStyle = "#7A4E26";
        c.fillRect(0, 0, W, f);
        c.fillRect(0, H - f, W, f);
        c.fillRect(0, 0, f, H);
        c.fillRect(W - f, 0, f, H);
        c.strokeStyle = "rgba(0,0,0,0.3)";
        c.lineWidth = 2 * u;
        c.strokeRect(f, f, W - 2 * f, H - 2 * f);
        g.__corkBoard.set(key, tile);
      }
      ctx.drawImage(tile, 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 44, at = 0 } = o;
      if (t < at) return;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${HAND}`;
      const tw = ctx.measureText(s.toUpperCase()).width;
      ctx.restore();
      const w = tw + 60 * u;
      const h = size * 2.4 * u;
      const left = leftOf(X(x), w, o.align);
      const cx = left + w / 2;
      const cy = Y(y) + h * 0.2;
      if (note(cx, cy, w, h, "#FBFBF6", at, 11, false, true) <= 0) return;
      // Two bits of tape.
      ctx.save();
      ctx.fillStyle = "rgba(235,225,190,0.75)";
      for (const sx of [-1, 1]) {
        ctx.save();
        ctx.translate(cx + sx * (w / 2 - 10 * u), cy - h / 2 + 2 * u);
        ctx.rotate(sx * 0.6);
        ctx.fillRect(-26 * u, -9 * u, 52 * u, 18 * u);
        ctx.restore();
      }
      ctx.restore();
      const wd = o.dur ?? 0.05 * s.length + 0.2;
      pen(
        s.toUpperCase(),
        left + 30 * u,
        cy - h * 0.05,
        size,
        PEN.ink,
        "left",
        progress(t, at + 0.2, wd),
      );
      stroke(
        curve([left + 30 * u, cy + h * 0.28], [left + 30 * u + tw, cy + h * 0.26], -0.03, 12),
        at + 0.2 + wd,
        0.3,
        PEN.bad,
        3,
      );
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 32, tone = "ink", align = "center" } = o;
      pen(s, X(x), Y(y), size, PEN[tone], align, progress(t, at, o.dur ?? 0.04 * s.length + 0.15));
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const k = Math.round(x * 997 + y * 131);
      const colors = ["#FFF27A", "#9ED8F5", "#9BE08A", "#FFB15E", "#FF9EC4"];
      const c = tone === "accent" ? (colors[k % colors.length] as string) : PAD[tone];
      const s = r * 1.7 * u;
      if (note(X(x), Y(y), s, s, c, at, k, false) > 0.5) {
        ctx.save();
        ctx.strokeStyle = PEN.ink;
        ctx.lineWidth = 2.5 * u;
        ctx.beginPath();
        ctx.arc(X(x), Y(y) + 2 * u, s * 0.22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      note(X(x + w / 2), Y(y + h / 2), X(w), Y(h), PAD[tone], at, Math.round(x * 311 + y * 71));
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      if (!head) {
        // Red yarn, sagging a little, unspooling from one end.
        const a: Pt = [X(x1), Y(y1)];
        const b: Pt = [X(x2), Y(y2)];
        const sag = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.08;
        const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag];
        const pts: Pt[] = Array.from({ length: 13 }, (_, i) => {
          const s = i / 12;
          return [
            (1 - s) ** 2 * a[0] + 2 * (1 - s) * s * mid[0] + s * s * b[0],
            (1 - s) ** 2 * a[1] + 2 * (1 - s) * s * mid[1] + s * s * b[1],
          ];
        });
        const p = progress(t, at, dur);
        if (p <= 0) return;
        const { points } = along(pts, p);
        ctx.save();
        trace(ctx, points);
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 2.5 * u;
        ctx.translate(2 * u, 3 * u);
        ctx.stroke();
        ctx.restore();
        ctx.save();
        trace(ctx, points);
        ctx.strokeStyle = "#C21F1F";
        ctx.lineWidth = 2 * u;
        ctx.stroke();
        ctx.restore();
        return;
      }
      const color = tone === "bad" ? PEN.bad : PEN.ink;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const r = stroke(shaft, at, dur, color, 4);
      if (r && r.p >= 1) {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const end = shaft.at(-1) as Pt;
        const prev = shaft.at(-3) as Pt;
        arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 18 * u);
        ctx.strokeStyle = color;
        ctx.lineWidth = 4 * u;
        ctx.stroke();
        ctx.restore();
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0 } = o;
      // A pile of little notes, slapped on one after another.
      const cols = ["#FFF27A", "#9ED8F5", "#9BE08A", "#FFB15E", "#FF9EC4", "#9ED8F5"];
      const cw = X(w) / 2;
      const ch = Y(h) / 3;
      for (let i = 0; i < 6; i++) {
        const cx = X(x) + cw * (0.5 + (i % 2)) + (hash(i * 3) - 0.5) * 6 * u;
        const cy = Y(y) + ch * (0.5 + Math.floor(i / 2)) + (hash(i * 5) - 0.5) * 6 * u;
        if (
          note(cx, cy, cw * 0.92, ch * 0.92, cols[i] as string, at + i * 0.1, i * 7 + 1, false) >
          0.6
        ) {
          pen(i % 3 === 1 ? "dog" : "cat", cx, cy + ch * 0.2, 13, "#2B4FB0");
        }
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      const color = tone === "good" ? PEN.good : PEN.ink;
      if (sub) {
        const w = size * 2.6 * u;
        const h = size * 2.3 * u;
        if (note(X(x), Y(y), w, h, PAD.ink, at, 77) <= 0) return;
        pen(
          sub.toUpperCase(),
          X(x),
          Y(y) - size * 0.6 * u,
          size * 0.3,
          PEN.ink,
          "center",
          progress(t, at + 0.2, 0.3),
        );
        pen(value, X(x), Y(y) + size * 0.25 * u, size, color);
        // Red marker circle once it lands.
        const ring = curve([0, 0], [0, 0]);
        void ring;
        const pts: Pt[] = Array.from({ length: 40 }, (_, i) => {
          const a = -Math.PI * 0.6 + (i / 39) * Math.PI * 2.15;
          return [
            X(x) + Math.cos(a) * size * 1.15 * u,
            Y(y) + size * 0.25 * u + Math.sin(a) * size * 0.62 * u,
          ];
        });
        stroke(pts, at + dur + 0.1, 0.4, PEN.bad, 4);
      } else if (t >= at) pen(value, X(x), Y(y), size, color);
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 34 } = o;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check")
        stroke(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.1, cy + s * 0.4],
            [cx + s * 0.6, cy - s * 0.5],
          ],
          at,
          dur,
          PEN.good,
          5,
        );
      else {
        stroke(
          [
            [cx - s * 0.5, cy - s * 0.5],
            [cx + s * 0.5, cy + s * 0.5],
          ],
          at,
          dur / 2,
          PEN.bad,
          5,
        );
        stroke(
          [
            [cx + s * 0.5, cy - s * 0.5],
            [cx - s * 0.5, cy + s * 0.5],
          ],
          at + dur / 2,
          dur / 2,
          PEN.bad,
          5,
        );
      }
    },
    finish() {},
  };
}

export default {
  id: "sticky-notes",
  name: "Sticky-note wall",
  category: "Illustration",
  make,
} satisfies Style;
