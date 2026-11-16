// Plasticine on a clay set: soft waxy lumps with a lit top and a shaded
// belly, thumbprints, rolled coils for links, pressed-clay letters. Shot on
// twos, so everything boils a hair between frames, and each piece is popped
// on with squash and stretch.
import {
  type Align,
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

const CLAY: Record<Tone, string> = {
  ink: "#F3EEE4",
  accent: "#F2A7C3",
  good: "#E9B83A",
  bad: "#E0483A",
  muted: "#8FC7D6",
};
const LETTER: Record<Tone, string> = {
  ink: "#F7F2E8",
  accent: "#F07FA8",
  good: "#F2B83A",
  bad: "#E8503E",
  muted: "#9AD0DE",
};
const ROUND =
  '"Arial Rounded MT Bold", "Nunito", "Varela Round", "Avenir Next", "Helvetica Neue", sans-serif';

function make(ctx: any, t0: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  // On twos: the clock only advances every other frame at 24 fps.
  const t = Math.floor(t0 * 12) / 12;
  const boil = Math.floor(t0 * 12);
  const g = globalThis as any;
  g.__claySet ??= new Map();
  const cache: Map<string, any> = g.__claySet;

  /** Squash and stretch: x and y scales that overshoot out of step, from `at`. */
  function squash(at: number) {
    const s = t - at;
    if (s < 0) return null;
    const k = clamp(s / 0.35);
    const pop = 1 - Math.exp(-s * 9) * Math.cos(s * 22);
    const sx = pop * (1 + 0.18 * Math.sin(k * Math.PI) * (1 - k));
    const sy = pop * (1 - 0.14 * Math.sin(k * Math.PI) * (1 - k));
    return { sx, sy };
  }

  /** A lump of clay filling `shape`: base colour, lit top, shaded belly, a thumbprint and a hard shadow. */
  function lump(shape: () => void, color: string, cx: number, cy: number, r: number, seed: number) {
    ctx.save();
    ctx.shadowColor = "rgba(30,20,10,0.35)";
    ctx.shadowBlur = 10 * u;
    ctx.shadowOffsetY = 6 * u;
    shape();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    ctx.save();
    shape();
    ctx.clip();
    const gr = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r * 1.3);
    gr.addColorStop(0, "rgba(255,255,255,0.55)");
    gr.addColorStop(0.35, "rgba(255,255,255,0.08)");
    gr.addColorStop(0.75, "rgba(0,0,0,0.05)");
    gr.addColorStop(1, "rgba(40,20,10,0.35)");
    ctx.fillStyle = gr;
    ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
    // A thumbprint: faint concentric arcs.
    ctx.strokeStyle = "rgba(60,30,20,0.09)";
    ctx.lineWidth = Math.max(0.8, 1.2 * u);
    const px = cx + (hash(seed) - 0.5) * r;
    const py = cy + (hash(seed + 1) - 0.5) * r * 0.6;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(px, py, i * r * 0.07, i * r * 0.05, hash(seed + 2) * 3, 0.3, 2.6);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A lumpy outline round an ellipse: the silhouette wobbles a hair every two frames. */
  function blob(cx: number, cy: number, rx: number, ry: number, seed: number) {
    const pts = roughen(
      ellipse(cx, cy, rx, ry, 28),
      Math.min(rx, ry) * 0.05 + u,
      seed * 3.1 + boil * 0.37,
    );
    return () => {
      ctx.beginPath();
      const n = pts.length - 1;
      for (let i = 0; i < n; i++) {
        const a = pts[i] as Pt;
        const b = pts[(i + 1) % n] as Pt;
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        if (i === 0) ctx.moveTo(mx, my);
        else ctx.quadraticCurveTo(a[0], a[1], mx, my);
      }
      ctx.closePath();
    };
  }

  /** A rolled coil of clay along a path, drawn on as it is laid. */
  function coil(points: Pt[], p: number, color: string, width: number) {
    const shown = points.slice(0, Math.max(2, Math.round(points.length * p)));
    const w = width * u;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.translate(0, w * 0.35);
    trace(ctx, shown);
    ctx.strokeStyle = "rgba(30,20,10,0.3)";
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.translate(0, -w * 0.35);
    trace(ctx, shown);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.translate(0, w * 0.18);
    trace(ctx, shown);
    ctx.strokeStyle = "rgba(60,30,20,0.18)";
    ctx.lineWidth = w * 0.45;
    ctx.stroke();
    ctx.translate(-w * 0.05, -w * 0.38);
    trace(ctx, shown);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = w * 0.25;
    ctx.stroke();
    ctx.restore();
    return shown.at(-1) as Pt;
  }

  /** Pressed clay letters, popped on one at a time. */
  function letters(
    s: string,
    x: number,
    y: number,
    size: number,
    o: { at?: number; tone?: Tone; align?: Align; per?: number },
  ) {
    const { at = 0, tone = "ink", align = "left", per = 0.05 } = o;
    if (t < at) return 0;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${ROUND}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const w = ctx.measureText(s).width;
    let cx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    const color = LETTER[tone];
    for (const [i, ch] of [...s].entries()) {
      const cw = ctx.measureText(ch).width;
      const sq = squash(at + i * per);
      if (sq && ch !== " ") {
        const jx = (hash(i * 3 + boil) - 0.5) * 0.8 * u;
        const jy = (hash(i * 5 + boil) - 0.5) * 0.8 * u;
        const rot = (hash(i * 7.1) - 0.5) * 0.12;
        ctx.save();
        ctx.translate(cx + cw / 2 + jx, y + jy);
        ctx.rotate(rot);
        ctx.scale(sq.sx, sq.sy);
        ctx.fillStyle = "rgba(30,20,10,0.35)";
        ctx.fillText(ch, -cw / 2 + size * 0.03 * u, size * 0.07 * u);
        // A fat rolled body round each letter.
        ctx.lineJoin = "round";
        ctx.lineWidth = size * 0.05 * u;
        ctx.strokeStyle = color;
        ctx.strokeText(ch, -cw / 2, 0);
        ctx.fillStyle = color;
        ctx.fillText(ch, -cw / 2, 0);
        ctx.save();
        ctx.globalCompositeOperation = "source-atop";
        const gr = ctx.createLinearGradient(0, -size * 0.5 * u, 0, size * 0.5 * u);
        gr.addColorStop(0, "rgba(255,255,255,0.45)");
        gr.addColorStop(0.5, "rgba(255,255,255,0)");
        gr.addColorStop(1, "rgba(40,20,10,0.3)");
        ctx.fillStyle = gr;
        ctx.fillText(ch, -cw / 2, 0);
        ctx.restore();
        ctx.restore();
      }
      cx += cw;
    }
    ctx.restore();
    return w;
  }

  function popAround(cx: number, cy: number, at: number, draw: () => void) {
    const sq = squash(at);
    if (!sq) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sq.sx, sq.sy);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }

  return {
    surface() {
      const key = `${W}x${H}`;
      let img = cache.get(key);
      if (!img) {
        img = new OffscreenCanvas(W, H);
        const c = img.getContext("2d");
        c.fillStyle = "#4F8E94";
        c.fillRect(0, 0, W, H);
        // Smeared clay: soft blotches lighter and darker.
        for (let i = 0; i < 260; i++) {
          const x = hash(i * 1.3) * W;
          const y = hash(i * 2.1) * H * 0.8;
          const r = (20 + hash(i * 3.7) * 70) * u;
          const gr = c.createRadialGradient(x, y, 0, x, y, r);
          const light = hash(i * 5.3) > 0.5;
          gr.addColorStop(0, light ? "rgba(140,200,205,0.18)" : "rgba(20,60,70,0.16)");
          gr.addColorStop(1, "rgba(0,0,0,0)");
          c.fillStyle = gr;
          c.fillRect(x - r, y - r, r * 2, r * 2);
        }
        // The orange clay table, lumpy along its front edge, with tool marks.
        const top = H * 0.78;
        c.beginPath();
        c.moveTo(0, H);
        for (let i = 0; i <= 40; i++) c.lineTo((i / 40) * W, top + (hash(i * 4.1) - 0.5) * 6 * u);
        c.lineTo(W, H);
        c.closePath();
        const tg = c.createLinearGradient(0, top, 0, H);
        tg.addColorStop(0, "#E47A3A");
        tg.addColorStop(0.15, "#D9692E");
        tg.addColorStop(1, "#A84A1E");
        c.fillStyle = tg;
        c.fill();
        c.fillStyle = "rgba(255,220,180,0.25)";
        c.fillRect(0, top - 2 * u, W, 4 * u);
        c.strokeStyle = "rgba(90,30,10,0.25)";
        c.lineWidth = 1.5 * u;
        for (let i = 0; i < 60; i++) {
          const x = hash(i * 7.7) * W;
          const y = top + 10 * u + hash(i * 8.3) * (H - top - 20 * u);
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + (8 + hash(i) * 14) * u, y - (2 + hash(i * 2) * 4) * u);
          c.stroke();
        }
        // A shallow-focus darkening toward the top.
        const vg = c.createLinearGradient(0, 0, 0, top);
        vg.addColorStop(0, "rgba(10,30,40,0.3)");
        vg.addColorStop(1, "rgba(10,30,40,0)");
        c.fillStyle = vg;
        c.fillRect(0, 0, W, top);
        cache.set(key, img);
      }
      ctx.drawImage(img, 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 72, at = 0, tone = "good", align = "left" } = o;
      letters(s, X(x), Y(y), size, {
        at,
        tone,
        align,
        per: (o.dur ?? 0.8) / Math.max(1, s.length),
      });
    },
    label(s, x, y, o = {}) {
      letters(s, X(x), Y(y), o.size ?? 36, {
        at: o.at ?? 0,
        tone: o.tone ?? "ink",
        align: o.align ?? "center",
        per: 0.03,
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const R = r * 1.2 * u;
      const seed = x * 31 + y * 17;
      popAround(X(x), Y(y), at, () =>
        lump(blob(X(x), Y(y), R, R * 0.92, seed), CLAY[tone], X(x), Y(y), R, seed),
      );
    },
    box(x, y, w, h, o = {}) {
      // A slab of white clay, like a tile pressed flat.
      const { at = 0, tone = "ink" } = o;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const seed = x * 13 + y * 7;
      popAround(x0 + bw / 2, y0 + bh, at, () => {
        const shape = () => {
          ctx.beginPath();
          ctx.roundRect(x0, y0, bw, bh, 18 * u);
        };
        lump(shape, CLAY.ink, x0 + bw / 2, y0 + bh / 2, Math.max(bw, bh) / 2, seed);
        if (tone !== "ink") {
          ctx.save();
          ctx.strokeStyle = CLAY[tone];
          ctx.lineWidth = 7 * u;
          ctx.beginPath();
          ctx.roundRect(x0 + 8 * u, y0 + 8 * u, bw - 16 * u, bh - 16 * u, 12 * u);
          ctx.stroke();
          ctx.restore();
        }
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const thin = !head && tone === "accent";
      coil(pts, p, CLAY[tone], thin ? 5 : 13);
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 20 * u;
        coil(
          [
            [end[0] - Math.cos(a - 0.6) * s, end[1] - Math.sin(a - 0.6) * s],
            end,
            [end[0] - Math.cos(a + 0.6) * s, end[1] - Math.sin(a + 0.6) * s],
          ],
          1,
          CLAY[tone],
          13,
        );
      }
    },
    store(x, y, w, h, o = {}) {
      // Stacked clay pucks, each dropped on with a squash.
      const { at = 0, dur = 0.8, tone = "muted" } = o;
      const n = 4;
      const [x0, bw] = [X(x), X(w)];
      const ph = Y(h) / n;
      const colors = [CLAY[tone], CLAY.good, CLAY[tone], CLAY.accent];
      for (let i = 0; i < n; i++) {
        const a = at + (dur / n) * i;
        const cy = Y(y + h) - ph * (i + 0.5);
        const seed = i * 9 + x * 5;
        popAround(x0 + bw / 2, cy + ph / 2, a, () =>
          lump(
            blob(x0 + bw / 2, cy, bw / 2, ph * 0.48, seed),
            colors[i] as string,
            x0 + bw / 2,
            cy,
            bw / 2,
            seed,
          ),
        );
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      letters(value, X(x), Y(y), size, {
        at,
        tone: tone === "ink" ? "accent" : tone,
        align: "center",
        per: 0,
      });
      if (sub)
        letters(sub, X(x), Y(y) + size * 0.75 * u, size * 0.36, {
          at: at + 0.3,
          tone: "ink",
          align: "center",
          per: 0.03,
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 36) * u;
      const [cx, cy] = [X(x), Y(y)];
      const at = o.at ?? 0;
      const tone = o.tone ?? (kind === "check" ? "good" : "bad");
      popAround(cx, cy, at, () => {
        if (kind === "check")
          coil(
            [
              [cx - s * 0.5, cy],
              [cx - s * 0.12, cy + s * 0.4],
              [cx + s * 0.6, cy - s * 0.5],
            ],
            1,
            CLAY[tone],
            11,
          );
        else {
          coil(
            [
              [cx - s * 0.5, cy - s * 0.5],
              [cx + s * 0.5, cy + s * 0.5],
            ],
            1,
            CLAY[tone],
            11,
          );
          coil(
            [
              [cx + s * 0.5, cy - s * 0.5],
              [cx - s * 0.5, cy + s * 0.5],
            ],
            1,
            CLAY[tone],
            11,
          );
        }
      });
    },
    finish() {
      // Soft lens falloff at the corners.
      const gr = ctx.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.4,
        W / 2,
        H / 2,
        Math.hypot(W, H) * 0.6,
      );
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, alpha("#102028", 0.35));
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    },
  };
}

export default {
  id: "claymation",
  name: "Clay stop-motion",
  category: "Paper & Craft",
  make,
} satisfies Style;
