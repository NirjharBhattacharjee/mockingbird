// Brush and ink on rice paper: soft grey washes, single loaded strokes that
// thin and break into bristle tracks as the brush runs dry, open circles for
// things, serif writing that soaks in, and a red seal for emphasis.
import {
  type Align,
  along,
  alpha,
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

const PAPER = "#EEE6D3";
const SEAL = "#B8322A";
const INK: Record<Tone, string> = {
  ink: "#1C1B19",
  accent: "#2C3A4E",
  good: "#2F4A34",
  bad: SEAL,
  muted: "#8A857B",
};
const SERIF = '"Cormorant Garamond", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__sumiPaper ??= new Map();
  const cache: Map<string, any> = g.__sumiPaper;
  let seed = 3;

  /** The paper: warm fibres, faint blotches, and a distant wash of hills. */
  function paper() {
    const key = `${W}x${H}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      c.fillStyle = PAPER;
      c.fillRect(0, 0, W, H);
      for (let i = 0; i < 40; i++) {
        const r = (80 + hash(i * 5.1) * 260) * u;
        const gr = c.createRadialGradient(hash(i) * W, hash(i + 2) * H, 0, hash(i) * W, hash(i + 2) * H, r);
        gr.addColorStop(0, `rgba(160,140,105,${0.05 + hash(i + 4) * 0.05})`);
        gr.addColorStop(1, "rgba(160,140,105,0)");
        c.fillStyle = gr;
        c.fillRect(0, 0, W, H);
      }
      c.lineWidth = Math.max(0.6, 0.8 * u);
      for (let i = 0; i < 900; i++) {
        const x = hash(i * 1.3) * W;
        const y = hash(i * 2.9 + 1) * H;
        const a = hash(i * 3.7) * Math.PI;
        const l = (6 + hash(i * 4.1) * 22) * u;
        c.strokeStyle = `rgba(120,100,70,${0.06 + hash(i) * 0.08})`;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 3 * u, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
        c.stroke();
      }
      // Two ranges of misty hills, darkest at the ridge and fading downward.
      for (const [base, tone, amp, s] of [
        [0.8, 0.13, 0.12, 1],
        [0.88, 0.2, 0.08, 7],
      ] as const) {
        c.save();
        c.filter = `blur(${6 * u}px)`;
        const pts: Pt[] = [];
        for (let i = 0; i <= 40; i++) {
          const x = (i / 40) * W;
          const ridge = Math.sin(i * 0.35 + s) * 0.5 + Math.sin(i * 0.9 + s * 2) * 0.3 + hash(i + s) * 0.2;
          pts.push([x, H * (base - amp * Math.max(0, ridge))]);
        }
        trace(c, [...pts, [W, H], [0, H]], true);
        const gr = c.createLinearGradient(0, H * (base - amp), 0, H);
        gr.addColorStop(0, `rgba(60,58,52,${tone})`);
        gr.addColorStop(1, "rgba(60,58,52,0)");
        c.fillStyle = gr;
        c.fill();
        c.restore();
      }
      cache.set(key, tile);
    }
    ctx.drawImage(tile, 0, 0);
  }

  /**
   * One loaded brush stroke laid down from `at` over `dur`: it presses in, thins,
   * and near its end splits into dry bristle tracks.
   */
  function brush(points: Pt[], { at = 0, dur = 0.5, tone = "ink" as Tone, width = 10, dry = 0.35 } = {}) {
    seed += 1;
    const p = progress(t, at, dur);
    if (p <= 0) return;
    const ease = 1 - (1 - p) ** 2;
    const rough = roughen(points, 0.8 * u, seed * 7.3);
    const { points: drawn } = along(rough, ease);
    const n = rough.length - 1;
    const col = INK[tone];
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < drawn.length; i++) {
      const s = i / n;
      const a = drawn[i - 1] as Pt;
      const b = drawn[i] as Pt;
      const press = Math.min(1, s * 6);
      const w = width * u * (0.55 + 0.45 * press) * (1 - 0.45 * s);
      const nx = -(b[1] - a[1]);
      const ny = b[0] - a[0];
      const nl = Math.hypot(nx, ny) || 1;
      if (s < 1 - dry) {
        ctx.strokeStyle = alpha(col, 0.9);
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      } else {
        // The brush runs dry: separate hairs, each skipping more as it goes.
        const k = (s - (1 - dry)) / dry;
        for (let h = 0; h < 6; h++) {
          if (hash(seed * 3 + h * 11 + i * 1.7) < k * 0.7) continue;
          const off = ((h - 2.5) / 2.5) * w * 0.5;
          ctx.strokeStyle = alpha(col, 0.75 - k * 0.3);
          ctx.lineWidth = Math.max(0.8, (w / 6) * (1.2 - k * 0.6));
          ctx.beginPath();
          ctx.moveTo(a[0] + (nx / nl) * off, a[1] + (ny / nl) * off);
          ctx.lineTo(b[0] + (nx / nl) * off, b[1] + (ny / nl) * off);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  /** A soft grey wash that blooms out from its centre. */
  function wash(cx: number, cy: number, r: number, at: number, tone: Tone = "ink", strength = 0.18) {
    const p = progress(t, at, 0.8);
    if (p <= 0) return;
    const rr = r * (0.4 + 0.6 * (1 - (1 - p) ** 3));
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
    gr.addColorStop(0, alpha(INK[tone], strength * p));
    gr.addColorStop(0.7, alpha(INK[tone], strength * 0.6 * p));
    gr.addColorStop(1, alpha(INK[tone], 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Serif writing that soaks into the paper: revealed left to right, blurred then sharp. */
  function write(s: string, x: number, y: number, size: number, o: { at?: number; dur?: number; tone?: Tone; align?: Align; italic?: boolean } = {}) {
    const { at = 0, tone = "ink", align = "left", italic = true } = o;
    const dur = o.dur ?? 0.04 * s.length + 0.2;
    const p = progress(t, at, dur);
    if (p <= 0) return;
    ctx.save();
    ctx.font = `${italic ? "italic " : ""}500 ${Math.round(size * u)}px ${SERIF}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 6 * u, y - size * u, (w + 12 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = INK[tone];
    // The ink bleeds a little as it lands.
    const bleed = 1 - progress(t, at + dur * 0.6, 0.5);
    if (bleed > 0) {
      ctx.shadowColor = alpha(INK[tone], 0.5 * bleed);
      ctx.shadowBlur = 8 * u * bleed;
    }
    ctx.fillText(s, left, y);
    ctx.restore();
    return { left, w };
  }

  /** A small red seal stamp, pressed on with a bump. */
  function seal(cx: number, cy: number, s: number, at: number) {
    const p = progress(t, at, 0.25);
    if (p <= 0) return;
    const k = 1 + 0.25 * (1 - p);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.rotate(-0.03);
    ctx.globalAlpha = Math.min(1, p * 1.5) * 0.92;
    ctx.fillStyle = SEAL;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.lineCap = "square";
    ctx.beginPath();
    ctx.moveTo(-s * 0.25, -s * 0.2);
    ctx.lineTo(s * 0.25, -s * 0.2);
    ctx.moveTo(0, -s * 0.3);
    ctx.lineTo(0, s * 0.3);
    ctx.moveTo(-s * 0.22, s * 0.05);
    ctx.lineTo(-s * 0.05, s * 0.25);
    ctx.moveTo(s * 0.22, s * 0.05);
    ctx.lineTo(s * 0.05, s * 0.25);
    ctx.stroke();
    ctx.restore();
  }

  return {
    surface() {
      paper();
      // Mist drifting slowly sideways.
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const x = ((t * 18 * u + i * W * 0.45) % (W * 1.4)) - W * 0.2;
        const y = H * (0.55 + i * 0.12);
        const gr = ctx.createRadialGradient(x, y, 0, x, y, 260 * u);
        gr.addColorStop(0, "rgba(250,247,240,0.45)");
        gr.addColorStop(1, "rgba(250,247,240,0)");
        ctx.fillStyle = gr;
        ctx.fillRect(x - 300 * u, y - 300 * u, 600 * u, 600 * u);
      }
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.09, size = 54, at = 0, tone = "ink", align = "left" } = o;
      const dur = o.dur ?? 0.04 * s.length + 0.2;
      const r = write(s, X(x), Y(y), size, { at, dur, tone, align });
      if (r) seal(r.left + r.w + size * 0.5 * u, Y(y) - size * 0.1 * u, size * 0.42 * u, at + dur);
    },
    label(s, x, y, o = {}) {
      write(s, X(x), Y(y), o.size ?? 30, { at: o.at ?? 0, dur: o.dur, tone: o.tone ?? "ink", align: o.align ?? "center" });
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.35, tone = "ink" } = o;
      const R = r * u;
      wash(X(x), Y(y), R * 1.1, at + dur * 0.5, tone, 0.12);
      const start = -Math.PI * 0.6 + hash(x * 9 + y * 7) * 0.8;
      brush(ellipse(X(x), Y(y), R, R * 0.96, 30, start, 0.9), { at, dur, tone, width: Math.max(4, r * 0.32), dry: 0.3 });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "ink" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const p = progress(t, at, 0.4);
      if (p > 0) {
        ctx.fillStyle = `rgba(250,246,236,${0.75 * p})`;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
      const step = dur / 4;
      brush([[x0, y0], [x1, y0 + 2 * u]], { at, dur: step, tone, width: 7 });
      brush([[x1, y0], [x1 - 2 * u, y1]], { at: at + step, dur: step, tone, width: 7 });
      brush([[x1, y1], [x0, y1 - u]], { at: at + step * 2, dur: step, tone, width: 7 });
      brush([[x0, y1], [x0 + u, y0]], { at: at + step * 3, dur: step, tone, width: 7 });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const thin = tone === "accent" && !head;
      brush(pts, { at, dur, tone, width: thin ? 2.6 : 6, dry: thin ? 0.15 : 0.4 });
      if (!head) return;
      const end = pts.at(-1) as Pt;
      const prev = pts.at(-4) as Pt;
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 18 * u;
      brush([[end[0] - Math.cos(a - 0.55) * s, end[1] - Math.sin(a - 0.55) * s], end], { at: at + dur, dur: 0.1, tone, width: 4, dry: 0.2 });
      brush([end, [end[0] - Math.cos(a + 0.55) * s, end[1] - Math.sin(a + 0.55) * s]], { at: at + dur + 0.08, dur: 0.1, tone, width: 4, dry: 0.5 });
    },
    store(x, y, w, h, o = {}) {
      // A tall ink jar: a wash body, then the outline in a few strokes.
      const { at = 0, dur = 0.8, tone = "ink" } = o;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const top = Y(y) + rx * 0.25;
      const bottom = Y(y + h) - rx * 0.25;
      wash(cx, (top + bottom) / 2, Math.max(rx, (bottom - top) / 2) * 1.05, at + dur * 0.3, tone, 0.14);
      const step = dur / 4;
      brush(ellipse(cx, top, rx, rx * 0.25, 28, Math.PI, 1), { at, dur: step, tone, width: 5, dry: 0.2 });
      brush([[cx - rx, top], [cx - rx * 0.96, bottom]], { at: at + step, dur: step, tone, width: 8 });
      brush(ellipse(cx, bottom, rx, rx * 0.25, 20, Math.PI, -0.5), { at: at + step * 2, dur: step, tone, width: 7 });
      brush([[cx + rx, bottom], [cx + rx * 0.98, top]], { at: at + step * 3, dur: step, tone, width: 7, dry: 0.5 });
      for (const f of [0.38, 0.66]) {
        const yy = lerpN(top, bottom, f);
        brush(ellipse(cx, yy, rx, rx * 0.25, 18, Math.PI, -0.5), { at: at + dur * f, dur: step, tone, width: 3, dry: 0.5 });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      write(value, X(x), Y(y), size, { at, dur: 0.15, tone, align: "center", italic: false });
      if (sub) write(sub, X(x), Y(y) + size * 0.72 * u, size * 0.36, { at: at + 0.3, tone: "ink", align: "center" });
      if (count && sub) {
        ctx.save();
        ctx.font = `500 ${Math.round(size * u)}px ${SERIF}`;
        const w = ctx.measureText(value).width;
        ctx.restore();
        seal(X(x) + w / 2 + size * 0.35 * u, Y(y) - size * 0.2 * u, size * 0.3 * u, at + dur);
      }
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const [cx, cy] = [X(x), Y(y)];
      const at = o.at ?? 0;
      if (kind === "check") {
        brush([[cx - s * 0.5, cy - s * 0.05], [cx - s * 0.15, cy + s * 0.35]], { at, dur: 0.12, tone: o.tone ?? "ink", width: 7, dry: 0 });
        brush([[cx - s * 0.15, cy + s * 0.35], [cx + s * 0.25, cy - s * 0.2], [cx + s * 0.6, cy - s * 0.55]], { at: at + 0.12, dur: 0.22, tone: o.tone ?? "ink", width: 6, dry: 0.5 });
      } else {
        brush([[cx - s * 0.5, cy - s * 0.5], [cx + s * 0.5, cy + s * 0.5]], { at, dur: 0.15, tone: o.tone ?? "bad", width: 8 });
        brush([[cx + s * 0.5, cy - s * 0.5], [cx - s * 0.5, cy + s * 0.5]], { at: at + 0.15, dur: 0.15, tone: o.tone ?? "bad", width: 8 });
      }
    },
    finish() {
      // A faint warm edge, like the paper darkening toward the scroll rollers.
      const gr = ctx.createLinearGradient(0, 0, W, 0);
      gr.addColorStop(0, "rgba(120,95,60,0.14)");
      gr.addColorStop(0.06, "rgba(120,95,60,0)");
      gr.addColorStop(0.94, "rgba(120,95,60,0)");
      gr.addColorStop(1, "rgba(120,95,60,0.14)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
      void clamp;
    },
  };
}

const lerpN = (a: number, b: number, f: number) => a + (b - a) * f;

export default { id: "sumi-e", name: "Ink wash", category: "Painterly", make } satisfies Style;
