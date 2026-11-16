// Banknote lathe work: hairline rosettes traced pass by pass in soft
// rainbow inks on fibred security paper, rope borders, engraved serif
// lettering filled with fine lines, red numbering-machine digits and rubber
// stamps that thump down. A glint of light crosses the note now and then.
import {
  along,
  type Cue,
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
  type Tone,
  trace,
} from "./look.ts";

const INK: Record<Tone, string> = {
  ink: "#2F4F45",
  accent: "#3E6A8A",
  good: "#2E6B4E",
  bad: "#C3303A",
  muted: "#8A9A8E",
};
const IRIS = ["#3F8A64", "#4568B0", "#C05A6C", "#C08F38", "#6A52A8"];
const SERIF = '"Didot", "Bodoni 72", "Georgia", "Times New Roman", serif';
const NUMBERING = '"Courier New", "Menlo", monospace';

/** A hypotrochoid, the curve a lathe's rolling wheel draws: `loops` lobes, radius `R`, depth 0-1. */
function lathe(
  cx: number,
  cy: number,
  R: number,
  loops: number,
  depth: number,
  phase: number,
  n = 360,
): Pt[] {
  const r = R / loops;
  const big = R - r;
  const d = r * (0.6 + depth);
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [
      cx + big * Math.cos(a + phase) + d * Math.cos((big / r) * a + phase),
      cy + big * Math.sin(a + phase) - d * Math.sin((big / r) * a + phase),
    ] as Pt;
  });
}

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__lathe ??= new Map();
  const cache: Map<string, any> = g.__lathe;

  /** A sine-rope band between two points: two waves out of phase, between two rules. */
  function rope(c: any, a: Pt, b: Pt, half: number, color: string, p = 1) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    c.save();
    c.translate(a[0], a[1]);
    c.rotate(ang);
    c.strokeStyle = color;
    c.lineWidth = 0.8 * u;
    const L = len * p;
    for (const ph of [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]) {
      c.beginPath();
      for (let x = 0; x <= L; x += 2 * u) {
        const y = Math.sin(x / (6 * u) + ph) * half * 0.8;
        x ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
    c.lineWidth = 1.2 * u;
    c.beginPath();
    c.moveTo(0, -half);
    c.lineTo(L, -half);
    c.moveTo(0, half);
    c.lineTo(L, half);
    c.stroke();
    c.restore();
  }

  function note() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      const gr = b.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0, "#DCE6D6");
      gr.addColorStop(0.5, "#EEE8DA");
      gr.addColorStop(1, "#ECDCD0");
      b.fillStyle = gr;
      b.fillRect(0, 0, W, H);
      // Underprint: fine waves across the whole note.
      b.strokeStyle = "rgba(90,130,110,0.14)";
      b.lineWidth = 0.8 * u;
      for (let y = 0; y < H; y += 7 * u) {
        b.beginPath();
        for (let x = 0; x <= W; x += 6 * u) {
          const yy = y + Math.sin(x / (40 * u) + y / (30 * u)) * 5 * u;
          x ? b.lineTo(x, yy) : b.moveTo(x, yy);
        }
        b.stroke();
      }
      // Security fibres.
      for (let i = 0; i < 160; i++) {
        b.strokeStyle = hash(i) > 0.5 ? "rgba(200,60,70,0.35)" : "rgba(60,90,170,0.35)";
        b.lineWidth = 0.8 * u;
        const x = hash(i * 1.3) * W;
        const y = hash(i * 2.9) * H;
        const a = hash(i * 4.1) * 6;
        b.beginPath();
        b.moveTo(x, y);
        b.quadraticCurveTo(
          x + 6 * u,
          y + 3 * u,
          x + Math.cos(a) * 12 * u,
          y + Math.sin(a) * 12 * u,
        );
        b.stroke();
      }
      // Rope border all round.
      const f = 22 * u;
      const hb = 7 * u;
      const col = "rgba(60,105,88,0.9)";
      rope(b, [f, f], [W - f, f], hb, col);
      rope(b, [W - f, f], [W - f, H - f], hb, col);
      rope(b, [W - f, H - f], [f, H - f], hb, col);
      rope(b, [f, H - f], [f, f], hb, col);
      b.strokeStyle = "rgba(70,110,95,0.6)";
      b.lineWidth = u;
      b.strokeRect(
        f + hb + 6 * u,
        f + hb + 6 * u,
        W - 2 * (f + hb + 6 * u),
        H - 2 * (f + hb + 6 * u),
      );
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  /** Fine horizontal engraving lines as a fill in one ink. */
  function engraved(tone: Tone) {
    const key = `eng:${tone}:${u}`;
    let tile = cache.get(key);
    if (!tile) {
      const n = Math.max(3, Math.round(4 * u));
      tile = new OffscreenCanvas(8, n);
      const c = tile.getContext("2d");
      c.fillStyle = INK[tone];
      c.fillRect(0, 0, 8, Math.max(1, n * 0.62));
      cache.set(key, tile);
    }
    return ctx.createPattern(tile, "repeat");
  }

  /** A rosette traced pen-pass by pen-pass from `at` over `dur`. */
  function rosette(
    cx: number,
    cy: number,
    R: number,
    at: number,
    dur: number,
    passes = 3,
    loops = 18,
    iris = true,
  ) {
    if (t < at) return;
    ctx.save();
    ctx.lineWidth = 1.25 * u;
    for (let k = 0; k < passes; k++) {
      const p = progress(t, at + (dur / passes) * k * 0.8, (dur / passes) * 1.2);
      if (p <= 0) continue;
      const pts = lathe(
        cx,
        cy,
        R * (1 - k * 0.12),
        loops + k * 4,
        0.3 + k * 0.15,
        k * 0.3 + t * 0.02 * (k % 2 ? -1 : 1),
        Math.round(220 + R / u),
      );
      ctx.strokeStyle = iris ? (IRIS[k % IRIS.length] as string) : INK.ink;
      trace(ctx, along(pts, p).points);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Engraved capitals wiped on from the left. */
  function engrave(
    s: string,
    x: number,
    y: number,
    o: Cue & { size?: number; align?: string; spacing?: number; font?: string } = {},
  ) {
    const { at = 0, size = 30, tone = "ink", align = "left", spacing = 0.06, font = SERIF } = o;
    const p = expo(progress(t, at, o.dur ?? 0.5));
    if (p <= 0) return 0;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${font}`;
    ctx.letterSpacing = `${size * spacing * u}px`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.beginPath();
    ctx.rect(left - 6 * u, Y(y) - size * u, (w + 12 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = size >= 40 ? engraved(tone) : INK[tone];
    ctx.fillText(s, left, Y(y));
    ctx.strokeStyle = INK[tone];
    ctx.lineWidth = 0.8 * u;
    if (size >= 40) ctx.strokeText(s, left, Y(y));
    ctx.restore();
    return w;
  }

  /** A rubber stamp that thumps down: an oval with a word in it, a little crooked. */
  function stamp(word: string, cx: number, cy: number, size: number, at: number, tone: Tone) {
    const p = progress(t, at, 0.18);
    if (p <= 0) return;
    const s = 1 + (1 - p) * 0.6;
    ctx.save();
    ctx.globalAlpha = 0.85 * p;
    ctx.translate(cx, cy);
    ctx.rotate(-0.12);
    ctx.scale(s, s);
    ctx.strokeStyle = INK[tone];
    ctx.fillStyle = INK[tone];
    ctx.lineWidth = 2.5 * u;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.6, size * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = u;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.45, size * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `700 ${Math.round(size * 0.45)}px ${NUMBERING}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(word, 0, 0);
    ctx.restore();
  }

  return {
    surface() {
      note();
    },
    title(s, o = {}) {
      const { x = 0.06, y = 0.15, size = 64, at = 0 } = o;
      if (t < at) return;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${SERIF}`;
      ctx.letterSpacing = `${size * 0.06 * u}px`;
      const w = ctx.measureText(s.toUpperCase()).width;
      ctx.restore();
      // A cartouche with a double rule, then the engraved title inside it.
      const a = expo(progress(t, at, 0.4));
      const bx = X(x) - 18 * u;
      const by = Y(y) - size * 0.85 * u;
      const bw = (w + 36 * u) * a;
      const bh = size * 1.7 * u;
      ctx.save();
      ctx.fillStyle = "rgba(245,240,226,0.85)";
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = INK.ink;
      ctx.lineWidth = 1.6 * u;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.lineWidth = 0.8 * u;
      ctx.strokeRect(bx + 5 * u, by + 5 * u, Math.max(0, bw - 10 * u), bh - 10 * u);
      ctx.restore();
      engrave("CERTIFICATE OF THE EXPLAINER RESERVE · SERIES A", x, y - (size * 1.15 * u) / H, {
        at: at + 0.2,
        size: 14,
        tone: "muted",
        spacing: 0.1,
      });
      engrave(s.toUpperCase(), x, y, { ...o, at: at + 0.25, size, dur: o.dur ?? 0.6 });
    },
    label(s, x, y, o = {}) {
      engrave(s.toUpperCase(), x, y, { size: 28, align: "center", spacing: 0.12, ...o, dur: 0.35 });
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "accent" } = o;
      const [cx, cy, R] = [X(x), Y(y), r * u * 1.9];
      rosette(cx, cy, R, at, dur, 3, 14, tone !== "ink");
      const p = progress(t, at + dur * 0.6, 0.25);
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.fillStyle = "#F2EDE0";
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK[tone];
      ctx.lineWidth = u;
      ctx.stroke();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.7, tone = "ink" } = o;
      if (t < at) return;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      ctx.save();
      ctx.globalAlpha = progress(t, at, 0.3);
      ctx.fillStyle = "rgba(246,242,230,0.9)";
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
      const q = dur / 4;
      const col = INK[tone];
      const hb = 5 * u;
      rope(ctx, [x0, y0], [x1, y0], hb, col, progress(t, at, q));
      rope(ctx, [x1, y0], [x1, y1], hb, col, progress(t, at + q, q));
      rope(ctx, [x1, y1], [x0, y1], hb, col, progress(t, at + 2 * q, q));
      rope(ctx, [x0, y1], [x0, y0], hb, col, progress(t, at + 3 * q, q));
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = along(shaft, p).points;
      ctx.save();
      ctx.strokeStyle = tone === "accent" ? alphaIris(0.55) : INK[tone];
      if (!head) {
        ctx.lineWidth = 0.9 * u;
        trace(ctx, shown);
        ctx.stroke();
        ctx.restore();
        return;
      }
      // A double rule: the same path offset either side.
      ctx.lineWidth = 1.1 * u;
      for (const off of [-2.5 * u, 2.5 * u]) {
        const pts = shown.map((pt, i) => {
          const q = shown[Math.min(i + 1, shown.length - 1)] as Pt;
          const r = shown[Math.max(i - 1, 0)] as Pt;
          const a = Math.atan2(q[1] - r[1], q[0] - r[0]);
          return [pt[0] - Math.sin(a) * off, pt[1] + Math.cos(a) * off] as Pt;
        });
        trace(ctx, pts);
        ctx.stroke();
      }
      if (p >= 1) {
        const end = shaft.at(-1) as Pt;
        const prev = shaft.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 14 * u;
        ctx.fillStyle = INK[tone];
        trace(
          ctx,
          [
            [end[0] + Math.cos(a) * 4 * u, end[1] + Math.sin(a) * 4 * u],
            [end[0] - Math.cos(a - 0.45) * s, end[1] - Math.sin(a - 0.45) * s],
            [end[0] - Math.cos(a + 0.45) * s, end[1] - Math.sin(a + 0.45) * s],
          ],
          true,
        );
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      const [x0, y0, ww, hh] = [X(x), Y(y), X(w), Y(h)];
      // A stack of engraved bands, each a rope across the plate.
      const n = 4;
      for (let i = 0; i < n; i++) {
        const p = progress(t, at + (dur / n) * i, dur / n);
        if (p <= 0) continue;
        const cy = y0 + (hh / n) * (i + 0.5);
        rope(ctx, [x0, cy], [x0 + ww, cy], hh / n / 2 - 3 * u, IRIS[i % IRIS.length] as string, p);
      }
      if (t >= at) {
        ctx.save();
        ctx.strokeStyle = INK.ink;
        ctx.lineWidth = 1.4 * u;
        ctx.globalAlpha = progress(t, at, 0.3);
        ctx.strokeRect(x0 - 4 * u, y0 - 4 * u, ww + 8 * u, hh + 8 * u);
        ctx.restore();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      if (size >= 80) {
        // The headline number: big engraved serif, a lathe rosette behind it, a stamp when it lands.
        rosette(X(x), Y(y), size * 1.9 * u, at, 1.4, 5, 30);
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "#EFE9DA";
        ctx.beginPath();
        ctx.arc(X(x), Y(y), size * 0.82 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        engrave(value, x, y, {
          at,
          dur: 0.01,
          size,
          tone: tone === "accent" ? "ink" : tone,
          align: "center",
          spacing: 0,
        });
        if (sub)
          engrave(sub.toUpperCase(), x, y - (size * 0.85 * u) / H, {
            at: at + 0.3,
            size: 18,
            align: "center",
            spacing: 0.2,
          });
        stamp("CERTIFIED", X(x), Y(y) + size * 1.25 * u, 46 * u, at + dur + 0.1, "bad");
      } else {
        // Smaller numbers come from the numbering machine: red monospace digits.
        engrave(value, x, y, {
          at,
          dur: 0.01,
          size,
          tone: "bad",
          align: "center",
          spacing: 0.1,
          font: NUMBERING,
        });
        if (sub)
          engrave(sub.toUpperCase(), x, y - (size * 0.8 * u) / H, {
            at: at + 0.3,
            size: 16,
            align: "center",
          });
      }
    },
    mark(kind, x, y, o = {}) {
      const size = (o.size ?? 44) * u;
      stamp(
        kind === "check" ? "VERIFIED ✓" : "VOID ✕",
        X(x),
        Y(y),
        size,
        o.at ?? 0,
        kind === "check" ? "good" : "bad",
      );
    },
    finish() {
      // A glint that crosses the note every few seconds.
      const c = (t % 5) / 1.4;
      if (c > 1) return;
      const gx = -W * 0.3 + c * W * 1.6;
      ctx.save();
      const gl = ctx.createLinearGradient(gx - 120 * u, 0, gx + 120 * u, H * 0.3);
      gl.addColorStop(0, "rgba(255,255,255,0)");
      gl.addColorStop(0.5, `rgba(255,255,255,${0.18 * clamp(Math.sin(c * Math.PI))})`);
      gl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gl;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    },
  };
}

const alphaIris = (a: number) => `rgba(99,128,184,${a})`;

export default {
  id: "spirograph",
  name: "Lathe guilloche",
  category: "Generative & Type",
  make,
} satisfies Style;
