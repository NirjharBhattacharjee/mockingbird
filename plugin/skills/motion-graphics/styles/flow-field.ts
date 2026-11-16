// Hairline currents on dark paper: thousands of thin streamlines traced
// through a smooth swirling field, added together into glowing braids. Things
// arrive as sparks riding a current or as dark cores whose rim lights up.
import {
  along,
  alpha,
  arrowhead,
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

const BG = "#16121F";
const TONE: Record<Tone, string> = {
  ink: "#ECE6F2",
  accent: "#7FDCD3",
  good: "#B8E68E",
  bad: "#F38C6E",
  muted: "#9089A6",
};
const MONO = '"Space Mono", "SF Mono", Menlo, Consolas, monospace';

/** The field's direction at (x, y), both 0-1: a gentle rightward drift full of slow eddies. */
const angle = (x: number, y: number) =>
  Math.sin(x * 5.1 + Math.cos(y * 4.3) * 1.7) * 0.9 +
  Math.cos(y * 7.3 - x * 2.2) * 0.55 +
  Math.sin((x + y) * 11) * 0.18;

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__flowField ??= new Map();
  const cache: Map<string, any> = g.__flowField;

  /** The streamline texture, traced once per frame size. */
  function field() {
    const key = `${W}x${H}`;
    let tex = cache.get(key);
    if (tex) return tex;
    tex = new OffscreenCanvas(W, H);
    const c = tex.getContext("2d");
    c.fillStyle = BG;
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = "lighter";
    c.lineWidth = Math.max(0.6, 0.9 * u);
    const bands = ["#5FB8C2", "#8C8FC4", "#B87BB0", "#D99A7E"];
    for (let i = 0; i < 3200; i++) {
      let x = hash(i * 1.31) * 1.2 - 0.1;
      let y = hash(i * 2.17 + 5);
      const col = bands[Math.min(3, Math.floor(clamp(y + (hash(i) - 0.5) * 0.25) * 4))] as string;
      c.strokeStyle = alpha(col, 0.1 + hash(i * 3.3) * 0.2);
      c.beginPath();
      c.moveTo(x * W, y * H);
      for (let s = 0; s < 60; s++) {
        const a = angle(x, y) * 0.55;
        x += Math.cos(a) * 0.005;
        y += Math.sin(a) * 0.005 * (W / H) * 0.6;
        c.lineTo(x * W, y * H);
      }
      c.stroke();
    }
    cache.set(key, tex);
    return tex;
  }

  /** Mono caption, faded and lifted in. */
  function caption(
    s: string,
    x: number,
    y: number,
    size: number,
    o: { at?: number; tone?: Tone; align?: string; weight?: number } = {},
  ) {
    const { at = 0, tone = "ink", align = "left", weight = 400 } = o;
    const p = progress(t, at, 0.4);
    if (p <= 0) return 0;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.font = `${weight} ${Math.round(size * u)}px ${MONO}`;
    ctx.letterSpacing = `${size * 0.06 * u}px`;
    ctx.fillStyle = TONE[tone];
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 8 * u;
    ctx.fillText(s, x, y + (1 - expo(p)) * 8 * u);
    const w = ctx.measureText(s).width;
    ctx.restore();
    return w;
  }

  /** A bright spark with a short comet tail along `pts` at fraction `f`. */
  function spark(pts: Pt[], f: number, color: string) {
    const head = along(pts, f).points;
    const tail = head.slice(-6);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    trace(ctx, tail);
    ctx.strokeStyle = alpha(color, 0.5);
    ctx.lineWidth = 1.5 * u;
    ctx.stroke();
    const [hx, hy] = head.at(-1) as Pt;
    const gl = ctx.createRadialGradient(hx, hy, 0, hx, hy, 9 * u);
    gl.addColorStop(0, "rgba(255,255,255,0.95)");
    gl.addColorStop(0.3, alpha(color, 0.7));
    gl.addColorStop(1, alpha(color, 0));
    ctx.fillStyle = gl;
    ctx.fillRect(hx - 9 * u, hy - 9 * u, 18 * u, 18 * u);
    ctx.restore();
  }

  return {
    surface() {
      // The field breathes: the texture sways a few pixels.
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(field(), Math.sin(t * 0.6) * 6 * u, Math.cos(t * 0.45) * 4 * u);
      // Sparks riding the currents.
      for (let i = 0; i < 26; i++) {
        let x = hash(i * 7.1);
        let y = hash(i * 3.9 + 1);
        const pts: Pt[] = [];
        for (let s = 0; s < 40; s++) {
          const a = angle(x, y) * 0.55;
          x += Math.cos(a) * 0.008;
          y += Math.sin(a) * 0.008 * (W / H) * 0.6;
          pts.push([x * W, y * H]);
        }
        spark(pts, (t * 0.18 + hash(i)) % 1, i % 3 ? TONE.accent : TONE.bad);
      }
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.08, size = 34, at = 0, align = "left" } = o;
      const p = progress(t, at, o.dur ?? 0.6);
      if (p <= 0) return;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${MONO}`;
      ctx.letterSpacing = `${size * 0.12 * u}px`;
      const tw = ctx.measureText(s.toUpperCase()).width;
      const left = align === "center" ? X(x) - tw / 2 : align === "right" ? X(x) - tw : X(x);
      ctx.fillStyle = "rgba(10,8,16,0.6)";
      ctx.fillRect(left - 18 * u, Y(y) - size * 0.85 * u, (tw + 36 * u) * expo(p), size * 1.7 * u);
      ctx.restore();
      caption(s.toUpperCase(), left, Y(y), size, { at: at + 0.15, weight: 700 });
    },
    label(s, x, y, o = {}) {
      caption(s.toLowerCase(), X(x), Y(y), o.size ?? 26, {
        at: o.at,
        tone: o.tone,
        align: o.align ?? "center",
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      // A dark core; its rim lights as the current wraps round it.
      const R = r * u * (0.6 + 0.4 * expo(p));
      ctx.save();
      const halo = ctx.createRadialGradient(X(x), Y(y), R * 0.9, X(x), Y(y), R * 1.9);
      halo.addColorStop(0, alpha(TONE[tone], 0.55 * p));
      halo.addColorStop(1, alpha(TONE[tone], 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R * 1.9, 0, Math.PI * 2);
      ctx.fill();
      const core = ctx.createRadialGradient(X(x) - R * 0.3, Y(y) - R * 0.3, 0, X(x), Y(y), R);
      core.addColorStop(0, "#2A2338");
      core.addColorStop(1, "#08060C");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = alpha("#FFFFFF", 0.8 * p);
      ctx.lineWidth = 1.2 * u;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R, Math.PI * 0.1, Math.PI * (0.1 + 1.6 * p));
      ctx.stroke();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha = expo(p);
      ctx.fillStyle = "rgba(10,8,16,0.62)";
      ctx.beginPath();
      ctx.roundRect(X(x), Y(y), X(w), Y(h), 10 * u);
      ctx.fill();
      ctx.strokeStyle = alpha(TONE[tone], 0.7);
      ctx.lineWidth = 1.2 * u;
      ctx.stroke();
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend + 0.06 * Math.sin(x1 * 40), 40);
      const { points, angle: a } = along(pts, expo(p));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = alpha(TONE[tone], head ? 0.85 : 0.35);
      ctx.lineWidth = (head ? 1.4 : 0.9) * u;
      if (tone === "bad") ctx.setLineDash([5 * u, 4 * u]);
      trace(ctx, points);
      ctx.stroke();
      ctx.setLineDash([]);
      if (head && p >= 1) {
        arrowhead(ctx, pts.at(-1) as Pt, a, 9 * u);
        ctx.stroke();
      }
      ctx.restore();
      if (p >= 1 && head) spark(pts, (t * 0.7 + x1) % 1, TONE[tone]);
      else if (p < 1) spark(pts, expo(p), TONE[tone]);
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      // A vortex: rings of hairline current spinning into the data pool.
      const cx = X(x + w / 2);
      const cy = Y(y + h / 2);
      const rx = X(w) * 0.75;
      const ry = Y(h) / 2;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 1 * u;
      for (let i = 0; i < 18; i++) {
        const f = (i + 1) / 18;
        const spin = t * (1.4 - f) + i;
        ctx.strokeStyle = alpha(i % 3 ? TONE[tone] : TONE.bad, 0.35 + 0.5 * (1 - f));
        ctx.lineWidth = (1 + (1 - f)) * u;
        ctx.beginPath();
        ctx.ellipse(
          cx,
          cy,
          rx * f,
          ry * f,
          Math.sin(i) * 0.3,
          spin,
          spin + Math.PI * 1.5 * expo(p),
        );
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = "#08060C";
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.18 * p, ry * 0.18 * p, 0, 0, Math.PI * 2);
      ctx.fill();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const w = caption(value, X(x), Y(y), size, {
        at,
        tone: tone === "accent" ? "ink" : tone,
        align: "center",
        weight: 700,
      });
      if (sub) {
        caption(sub.toLowerCase(), X(x), Y(y) - size * 0.72 * u, size * 0.24, {
          at: at + 0.2,
          align: "center",
          tone: "muted",
        });
        const q = progress(t, at + 0.4, 0.5);
        ctx.strokeStyle = TONE.ink;
        ctx.lineWidth = 1.5 * u;
        ctx.beginPath();
        ctx.moveTo(X(x) - w / 2, Y(y) + size * 0.55 * u);
        ctx.lineTo(X(x) - w / 2 + w * expo(q), Y(y) + size * 0.55 * u);
        ctx.stroke();
      }
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 22) * u;
      const p = progress(t, o.at ?? 0, 0.3);
      if (p <= 0) return;
      const [cx, cy] = [X(x), Y(y)];
      const path: Pt[] =
        kind === "check"
          ? [
              [cx - s * 0.5, cy],
              [cx - s * 0.15, cy + s * 0.4],
              [cx + s * 0.55, cy - s * 0.45],
            ]
          : [
              [cx - s * 0.45, cy - s * 0.45],
              [cx + s * 0.45, cy + s * 0.45],
              [cx, cy],
              [cx + s * 0.45, cy - s * 0.45],
              [cx - s * 0.45, cy + s * 0.45],
            ];
      ctx.save();
      ctx.shadowColor = kind === "check" ? TONE.good : TONE.bad;
      ctx.shadowBlur = 10 * u;
      trace(ctx, along(path, p).points);
      ctx.strokeStyle = kind === "check" ? TONE.good : TONE.bad;
      ctx.lineWidth = 2 * u;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      const v = ctx.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.35,
        W / 2,
        H / 2,
        Math.hypot(W, H) * 0.6,
      );
      v.addColorStop(0, "rgba(8,6,12,0)");
      v.addColorStop(1, "rgba(8,6,12,0.55)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    },
  };
}

export default {
  id: "flow-field",
  name: "Flow field",
  category: "Data & Information",
  make,
} satisfies Style;
