// A tarot reading on crushed crimson velvet: navy cards with gold-foil
// frames and rays, card backs with a star, gold filigree links and brass
// plaques for words and numbers. Cards are dealt face down and flip over;
// a sheen slides across the gold, and big moments get a burst of light.
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
  vignette,
} from "./look.ts";

const GOLD = "#D8B867";
const NAVY = "#1E2A55";
const DEEP = "#141C3D";
const LINE: Record<Tone, string> = {
  ink: GOLD,
  accent: GOLD,
  good: "#E9D28E",
  bad: "#E0714F",
  muted: "#9C8A5A",
};
const SERIF = '"Cormorant Garamond", "Noto Color Emoji", serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__tarot ??= new Map();
  const cache: Map<string, any> = g.__tarot;

  /** Gold foil over a span, with a sheen that slides across it. */
  function foil(x0: number, y0: number, x1: number, y1: number) {
    const gr = ctx.createLinearGradient(x0, y0, x1, y1);
    const s = clamp(((t * 0.3) % 1.6) - 0.3);
    gr.addColorStop(0, "#A8843E");
    gr.addColorStop(Math.max(0, s - 0.12), GOLD);
    gr.addColorStop(s, "#FFF4C8");
    gr.addColorStop(Math.min(1, s + 0.12), GOLD);
    gr.addColorStop(1, "#A8843E");
    return gr;
  }

  function velvet() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      const gr = b.createRadialGradient(
        W * 0.5,
        H * 0.45,
        0,
        W * 0.5,
        H * 0.5,
        Math.hypot(W, H) * 0.6,
      );
      gr.addColorStop(0, "#5C1430");
      gr.addColorStop(1, "#2A0716");
      b.fillStyle = gr;
      b.fillRect(0, 0, W, H);
      // Folds: soft dark and light bands, then thin bright crush lines.
      b.filter = `blur(${26 * u}px)`;
      for (let i = 0; i < 12; i++) {
        b.strokeStyle = hash(i) > 0.5 ? "rgba(140,40,80,0.35)" : "rgba(15,0,8,0.4)";
        b.lineWidth = (40 + hash(i + 1) * 60) * u;
        b.beginPath();
        const y = hash(i + 2) * H;
        b.moveTo(-50 * u, y);
        b.bezierCurveTo(
          W * 0.3,
          y + (hash(i + 3) - 0.5) * H * 0.6,
          W * 0.7,
          y + (hash(i + 4) - 0.5) * H * 0.6,
          W + 50 * u,
          y + (hash(i + 5) - 0.5) * H * 0.3,
        );
        b.stroke();
      }
      b.filter = `blur(${2 * u}px)`;
      for (let i = 0; i < 8; i++) {
        b.strokeStyle = "rgba(230,120,160,0.22)";
        b.lineWidth = 2 * u;
        b.beginPath();
        const y = hash(i * 7.1) * H;
        b.moveTo(-20 * u, y);
        b.bezierCurveTo(
          W * 0.35,
          y + (hash(i + 13) - 0.5) * H * 0.7,
          W * 0.65,
          y + (hash(i + 17) - 0.5) * H * 0.7,
          W + 20 * u,
          y + (hash(i + 19) - 0.5) * H * 0.4,
        );
        b.stroke();
      }
      b.filter = "none";
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  /** An eight-point star. */
  function star(cx: number, cy: number, r: number, fill: any) {
    const pts: Pt[] = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.32 : i % 4 ? r * 0.6 : r;
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    });
    trace(ctx, pts, true);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  /** A card face down: navy with a gold star and a field of dots. */
  function back(x: number, y: number, w: number, h: number) {
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6 * u);
    ctx.fill();
    ctx.strokeStyle = foil(x, y, x + w, y + h);
    ctx.lineWidth = 2 * u;
    ctx.strokeRect(x + 6 * u, y + 6 * u, w - 12 * u, h - 12 * u);
    ctx.fillStyle = "rgba(216,184,103,0.55)";
    const s = Math.max(10 * u, w / 7);
    for (let yy = y + s; yy < y + h - s * 0.5; yy += s)
      for (let xx = x + s; xx < x + w - s * 0.5; xx += s)
        ctx.fillRect(xx - u, yy - u, 2 * u, 2 * u);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    star(x + w / 2, y + h / 2, Math.min(w, h) * 0.16, foil(x, y, x + w, y + h));
  }

  /** A card face up: gold frame, navy field with rays, a numeral up top. */
  function face(x: number, y: number, w: number, h: number, numeral: string) {
    ctx.fillStyle = "#E9DDB8";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6 * u);
    ctx.fill();
    const i = 7 * u;
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.roundRect(x + i, y + i, w - i * 2, h - i * 2, [w * 0.25, w * 0.25, 4 * u, 4 * u]);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(216,184,103,0.25)";
    ctx.lineWidth = 3 * u;
    const cx = x + w / 2;
    const cy = y + h * 0.55;
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      trace(ctx, [
        [cx, cy],
        [cx + Math.cos(a) * w * 1.5, cy + Math.sin(a) * w * 1.5],
      ]);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = foil(x, y, x + w, y + h);
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.roundRect(x + i, y + i, w - i * 2, h - i * 2, [w * 0.25, w * 0.25, 4 * u, 4 * u]);
    ctx.stroke();
    ctx.lineWidth = u;
    ctx.strokeRect(x + 2.5 * u, y + 2.5 * u, w - 5 * u, h - 5 * u);
    ctx.fillStyle = DEEP;
    ctx.font = `600 ${Math.round(Math.max(10, w * 0.09))}px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(numeral, cx, y + i * 0.55 + 1.5 * u);
  }

  /** Dealt and turned: 0-0.5 face down shrinking to an edge, 0.5-1 face up opening out. */
  function flipCard(
    cx: number,
    cy: number,
    w: number,
    h: number,
    at: number,
    dur: number,
    numeral: string,
  ) {
    const p = progress(t, at, dur);
    if (p <= 0) return 0;
    const dealt = expo(progress(t, at, dur * 0.4));
    const flip = progress(t, at + dur * 0.35, dur * 0.65);
    const sx = Math.abs(Math.cos(flip * Math.PI)) || 0.02;
    ctx.save();
    ctx.translate(cx, cy + (1 - dealt) * 60 * u);
    ctx.globalAlpha = dealt;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 18 * u;
    ctx.shadowOffsetY = 8 * u;
    ctx.scale(sx, 1);
    ctx.fillStyle = "rgba(0,0,0,0.01)";
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.shadowColor = "transparent";
    if (flip < 0.5) back(-w / 2, -h / 2, w, h);
    else face(-w / 2, -h / 2, w, h, numeral);
    ctx.restore();
    return flip;
  }

  /** A navy plaque with a gold rim and gold lettering. */
  function plaque(
    s: string,
    x: number,
    y: number,
    o: Cue & { size?: number; align?: string; minW?: number } = {},
  ) {
    const { at = 0, size = 26, align = "center", tone = "ink" } = o;
    const p = expo(progress(t, at, 0.4));
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.font = `600 ${Math.round(size * u)}px ${SERIF}`;
    ctx.textBaseline = "middle";
    const w = Math.max(o.minW ?? 0, ctx.measureText(s).width + size * 1.2 * u);
    const h = size * 1.5 * u;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    const top = Y(y) - h / 2 + (1 - p) * 8 * u;
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 10 * u;
    ctx.shadowOffsetY = 4 * u;
    ctx.fillStyle = NAVY;
    ctx.fillRect(left, top, w, h);
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = foil(left, top, left + w, top + h);
    ctx.lineWidth = 2 * u;
    ctx.strokeRect(left + 3 * u, top + 3 * u, w - 6 * u, h - 6 * u);
    ctx.fillStyle = LINE[tone];
    ctx.textAlign = "center";
    ctx.fillText(s, left + w / 2, top + h / 2 + u);
    ctx.restore();
  }

  return {
    surface() {
      velvet();
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 44, at = 0 } = o;
      plaque(s, x, y, { ...o, at, size, align: o.align ?? "left" });
    },
    label(s, x, y, o = {}) {
      plaque(s, x, y, { size: 30, ...o });
    },
    node(x, y, r, o = {}) {
      const { at = 0 } = o;
      const p = expo(progress(t, at, 0.35));
      if (p <= 0) return;
      const R = r * u * 1.1;
      const [cx, cy] = [X(x), Y(y)];
      // A gold medallion that spins in edge-on and opens out.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(Math.max(0.05, p), 1);
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 8 * u;
      ctx.fillStyle = NAVY;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = foil(-R, -R, R, R);
      ctx.lineWidth = 3 * u;
      ctx.stroke();
      star(0, 0, R * 0.62, foil(-R, -R, R, R));
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      flipCard(X(x + w / 2), Y(y + h / 2), X(w), Y(h), at, dur, "XVII");
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = along(shaft, p).points;
      ctx.save();
      ctx.strokeStyle = tone === "accent" ? "rgba(216,184,103,0.55)" : LINE[tone];
      ctx.lineWidth = (head ? 2 : 1.1) * u;
      ctx.shadowColor = "rgba(255,220,140,0.5)";
      ctx.shadowBlur = 4 * u;
      trace(ctx, shown);
      ctx.stroke();
      if (head) {
        // Filigree: a bead at the tail and small curls along the way.
        ctx.fillStyle = LINE[tone];
        const s0 = shaft[0] as Pt;
        ctx.beginPath();
        ctx.arc(s0[0], s0[1], 3 * u, 0, Math.PI * 2);
        ctx.fill();
        for (const f of [0.33, 0.66]) {
          if (p < f) continue;
          const q = shaft[Math.round(f * (shaft.length - 1))] as Pt;
          ctx.beginPath();
          ctx.arc(q[0], q[1] - 4 * u, 4 * u, Math.PI * 0.6, Math.PI * 2.4);
          ctx.stroke();
        }
        if (p >= 1) {
          const end = shaft.at(-1) as Pt;
          const prev = shaft.at(-3) as Pt;
          const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
          const s = 13 * u;
          trace(
            ctx,
            [
              end,
              [end[0] - Math.cos(a - 0.45) * s, end[1] - Math.sin(a - 0.45) * s],
              [end[0] - Math.cos(a) * s * 0.55, end[1] - Math.sin(a) * s * 0.55],
              [end[0] - Math.cos(a + 0.45) * s, end[1] - Math.sin(a + 0.45) * s],
            ],
            true,
          );
          ctx.fill();
        }
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      // The deck: card backs dealt into a fanned stack.
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      for (let i = 0; i < 4; i++) {
        const p = expo(progress(t, at + i * (dur / 5), dur / 3));
        if (p <= 0) continue;
        ctx.save();
        ctx.globalAlpha = p;
        ctx.translate(x0 + bw / 2 + (i - 1.5) * 4 * u, y0 + bh / 2 - i * 4 * u + (1 - p) * 40 * u);
        ctx.rotate((i - 1.5) * 0.05);
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 10 * u;
        ctx.fillStyle = NAVY;
        ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
        ctx.shadowColor = "transparent";
        back(-bw / 2, -bh / 2, bw, bh);
        ctx.restore();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const [cx, cy] = [X(x), Y(y)];
      const big = size >= 80;
      if (big) {
        // A burst of gold light once the number lands.
        const b = expo(progress(t, at + dur, 0.6));
        if (b > 0) {
          const R = size * 2.2 * u * b;
          const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
          gl.addColorStop(0, "rgba(255,225,150,0.45)");
          gl.addColorStop(1, "rgba(255,225,150,0)");
          ctx.fillStyle = gl;
          ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
          ctx.save();
          ctx.strokeStyle = "rgba(255,225,150,0.4)";
          ctx.lineWidth = 1.2 * u;
          for (let i = 0; i < 36; i++) {
            const a = (i / 36) * Math.PI * 2;
            trace(ctx, [
              [cx + Math.cos(a) * size * 1.1 * u, cy + Math.sin(a) * size * 0.8 * u],
              [cx + Math.cos(a) * R, cy + Math.sin(a) * R],
            ]);
            ctx.stroke();
          }
          ctx.restore();
        }
        plaque("", x, y + (size * 0.12 * u) / H, { at, size: size * 1.05, minW: size * 2.6 * u });
      }
      const p = expo(progress(t, at, 0.4));
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = `500 ${Math.round(size * (big ? 0.8 : 1) * u)}px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = foil(cx - size * u, cy - size * u, cx + size * u, cy + size * u);
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 6 * u;
      ctx.fillText(value, cx, cy + (big ? size * 0.25 * u : 0));
      if (sub) {
        ctx.font = `500 ${Math.round(size * 0.28 * u)}px ${SERIF}`;
        ctx.fillStyle = GOLD;
        ctx.fillText(sub, cx, cy - size * 0.38 * u);
      }
      ctx.restore();
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const p = expo(progress(t, at, 0.35));
      if (p <= 0) return;
      const r = (o.size ?? 26) * u * (0.5 + 0.5 * p);
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.globalAlpha = p;
      ctx.fillStyle = kind === "check" ? foil(cx - r, cy - r, cx + r, cy + r) : "#B23A2E";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = kind === "check" ? NAVY : "#F4E6C8";
      ctx.lineWidth = r * 0.22;
      ctx.lineCap = "round";
      if (kind === "check")
        trace(ctx, [
          [cx - r * 0.45, cy],
          [cx - r * 0.1, cy + r * 0.35],
          [cx + r * 0.5, cy - r * 0.35],
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.4, cy - r * 0.4);
        ctx.lineTo(cx + r * 0.4, cy + r * 0.4);
        ctx.moveTo(cx + r * 0.4, cy - r * 0.4);
        ctx.lineTo(cx - r * 0.4, cy + r * 0.4);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      vignette(ctx, m, 0.55, "10,0,6");
    },
  };
}

export default {
  id: "tarot-card",
  name: "Tarot reading",
  category: "Illustration",
  make,
} satisfies Style;
