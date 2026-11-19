// A photocopied cut-and-paste zine: black toner on off-white, one fluoro pink
// printed slightly off register, ransom-note letters cut from mismatched
// type, torn scraps held down with tape, typed strips, marker scrawls. It
// steps at 8 frames a second and every scrap slams down with a copier flash.
import {
  type Align,
  counting,
  curve,
  frame,
  hash,
  type Look,
  type Pt,
  roughen,
  type Style,
  trace,
} from "./look.ts";

const TONER = "#141414";
const SHEET = "#F1EEE6";
const PINK = "#FF3E8E";
const FACES = [
  '"Playfair Display", serif',
  '"Anton", sans-serif',
  '"Courier Prime", monospace',
  '"Montserrat", sans-serif',
  '"Courier Prime", serif',
  '"Fraunces", serif',
];
const TYPED = '"Courier Prime", monospace';
const SCRAWL = '"Kalam", cursive';

function make(ctx: any, t0: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  // Stop-motion: the clock only ticks 8 times a second.
  const t = Math.floor(t0 * 8) / 8;
  const step = Math.floor(t0 * 8);
  const g = globalThis as any;
  g.__zine ??= new Map();
  const cache: Map<string, any> = g.__zine;
  let lastSlam = -1;

  /** Slam: from `at`, one step oversized and askew, then flat. Null before `at`. */
  function slam(at: number) {
    if (t < at) return null;
    if (at > lastSlam) lastSlam = at;
    const first = t - at < 0.125;
    return { k: first ? 1.12 : 1, rot: first ? 0.05 : 0 };
  }

  function slammed(cx: number, cy: number, at: number, draw: () => void) {
    const s = slam(at);
    if (!s) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(s.rot);
    ctx.scale(s.k, s.k);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }

  /** A strip of masking tape across a point. */
  function tape(x: number, y: number, a: number, len = 46) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = "rgba(190,186,170,0.75)";
    const l = len * u;
    const w = 15 * u;
    trace(
      ctx,
      [
        [-l / 2, -w / 2],
        [l / 2, -w / 2 + u],
        [l / 2 - 2 * u, w / 2],
        [-l / 2 + u, w / 2 - u],
      ],
      true,
    );
    ctx.fill();
    ctx.restore();
  }

  /** A torn scrap: a rectangle whose edges are ragged, in a solid fill. */
  function scrap(x0: number, y0: number, w: number, h: number, fill: string, seed: number) {
    const pts: Pt[] = [];
    const n = 10;
    for (let i = 0; i < n; i++) pts.push([x0 + (w * i) / n, y0]);
    for (let i = 0; i < n; i++) pts.push([x0 + w, y0 + (h * i) / n]);
    for (let i = 0; i < n; i++) pts.push([x0 + w - (w * i) / n, y0 + h]);
    for (let i = 0; i < n; i++) pts.push([x0, y0 + h - (h * i) / n]);
    trace(ctx, roughen(pts, 2.4 * u, seed), true);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 3 * u;
    ctx.shadowOffsetY = 2 * u;
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }

  /** Ransom-note lettering: each character cut from different type, its own scrap, re-cut every few steps. */
  function ransom(
    s: string,
    x: number,
    y: number,
    size: number,
    o: { align?: Align; seed?: number; pinkEvery?: number },
  ) {
    const { align = "left", seed = 0, pinkEvery = 4 } = o;
    const sz = size * u;
    const chars = [...s];
    const widths = chars.map((ch, i) => {
      ctx.font = `700 ${Math.round(sz * (0.85 + hash(seed + i * 3.1) * 0.3))}px ${FACES[Math.floor(hash(seed + i * 1.7) * FACES.length)]}`;
      return ch === " " ? sz * 0.35 : ctx.measureText(ch).width + sz * 0.22;
    });
    const total = widths.reduce((a, b) => a + b, 0);
    let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    for (const [i, ch] of chars.entries()) {
      const w = widths[i] as number;
      if (ch !== " ") {
        const r = hash(seed + i * 5.3);
        const bg =
          r < 0.45 ? SHEET : r < 0.75 ? TONER : r < 0.9 && i % pinkEvery === 1 ? PINK : "#E4DFD2";
        const fg = bg === TONER || bg === PINK ? SHEET : TONER;
        const jx = (hash(seed + i + step * 0.37) - 0.5) * 1.5 * u;
        const jy = (hash(seed + i * 2 + step * 0.61) - 0.5) * 3 * u;
        ctx.save();
        ctx.translate(cx + w / 2 + jx, y + jy);
        ctx.rotate((hash(seed + i * 7.7) - 0.5) * 0.16);
        const bh = sz * 1.05;
        ctx.fillStyle = bg;
        ctx.shadowColor = "rgba(0,0,0,0.2)";
        ctx.shadowBlur = 2 * u;
        ctx.fillRect(-w / 2 + u, -bh / 2, w - 2 * u, bh);
        ctx.shadowColor = "transparent";
        ctx.font = `700 ${Math.round(sz * (0.85 + hash(seed + i * 3.1) * 0.3))}px ${FACES[Math.floor(hash(seed + i * 1.7) * FACES.length)]}`;
        ctx.fillStyle = fg;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          hash(seed + i * 9.9) > 0.5 ? ch.toUpperCase() : ch.toLowerCase(),
          0,
          sz * 0.04,
        );
        ctx.restore();
      }
      cx += w;
    }
    return total;
  }

  /** A typed strip: white tape with a black hairline box and typewriter text. */
  function typed(s: string, x: number, y: number, size: number, align: Align, color = TONER) {
    ctx.font = `400 ${Math.round(size * u)}px ${TYPED}`;
    const w = ctx.measureText(s).width + size * 0.7 * u;
    const h = size * 1.35 * u;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.fillStyle = "#FBFAF5";
    ctx.fillRect(left, y - h / 2, w, h);
    ctx.strokeStyle = TONER;
    ctx.lineWidth = Math.max(1, 1.4 * u);
    ctx.strokeRect(left, y - h / 2, w, h);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + size * 0.35 * u, y + size * 0.05 * u);
  }

  /** A marker scrawl along a path, a little shaky, re-drawn on every step. */
  function scrawl(points: Pt[], p: number, color: string, width: number, seed: number) {
    const pts = roughen(points, 1.6 * u, seed + (step % 3) * 0.13);
    const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    trace(ctx, shown);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
    return shown;
  }

  /** Pink ink printed off register: draw `fn` nudged a few pixels. */
  function offRegister(fn: () => void) {
    ctx.save();
    ctx.translate(3 * u, -2 * u);
    fn();
    ctx.restore();
  }

  return {
    surface() {
      ctx.fillStyle = SHEET;
      ctx.fillRect(0, 0, W, H);
      // Toner noise that boils: three cached speckle sheets, cycled each step.
      const v = step % 3;
      const key = `noise:${W}x${H}:${v}`;
      let img = cache.get(key);
      if (!img) {
        img = new OffscreenCanvas(W, H);
        const c = img.getContext("2d");
        const n = Math.floor((W * H) / (90 * u * u));
        for (let i = 0; i < n; i++) {
          const s = (0.6 + hash(i * 1.1 + v * 91) * 1.4) * u;
          c.fillStyle = `rgba(20,20,20,${0.2 + hash(i * 2.3 + v) * 0.4})`;
          c.fillRect(hash(i * 3.7 + v * 13) * W, hash(i * 5.1 + v * 7) * H, s, s);
        }
        // Copier streaks and a dusty edge.
        c.fillStyle = "rgba(20,20,20,0.05)";
        for (let i = 0; i < 4; i++) c.fillRect(hash(i * 9 + v) * W, 0, (1 + hash(i) * 3) * u, H);
        const gr = c.createRadialGradient(
          W / 2,
          H / 2,
          Math.min(W, H) * 0.45,
          W / 2,
          H / 2,
          Math.hypot(W, H) * 0.62,
        );
        gr.addColorStop(0, "rgba(20,20,20,0)");
        gr.addColorStop(1, "rgba(20,20,20,0.18)");
        c.fillStyle = gr;
        c.fillRect(0, 0, W, H);
        cache.set(key, img);
      }
      ctx.drawImage(img, 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.11, size = 84, at = 0, align = "left" } = o;
      if (t < at) return;
      // A torn pink band slams down, then the cut-out letters pile on two per step.
      const n = Math.min(s.length, Math.floor((t - at) / 0.0625) + 1);
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${FACES[1]}`;
      const est = s.length * size * 0.75 * u;
      ctx.restore();
      const left = align === "center" ? X(x) - est / 2 : align === "right" ? X(x) - est : X(x);
      slammed(left + est / 2, Y(y), at, () => {
        offRegister(() => {
          ctx.save();
          ctx.translate(left + est / 2, Y(y));
          ctx.rotate(-0.025);
          ctx.translate(-(left + est / 2), -Y(y));
          scrap(left - 40 * u, Y(y) - size * 0.95 * u, est + 80 * u, size * 1.9 * u, PINK, 3);
          ctx.restore();
        });
        tape(left - 30 * u, Y(y) - size * 0.6 * u, -0.6);
        tape(left + est + 30 * u, Y(y) + size * 0.5 * u, 0.5);
      });
      ransom(s.slice(0, n), left, Y(y), size, { align: "left", seed: 11 });
    },
    label(s, x, y, o = {}) {
      const size = o.size ?? 30;
      slammed(X(x), Y(y), o.at ?? 0, () => {
        if (o.tone === "bad" || o.tone === "accent") {
          offRegister(() => {
            ctx.save();
            ctx.font = `700 ${Math.round(size * 1.2 * u)}px ${SCRAWL}`;
            ctx.fillStyle = PINK;
            ctx.textAlign = o.align ?? "center";
            ctx.textBaseline = "middle";
            ctx.rotate(0);
            ctx.fillText(s.toUpperCase(), X(x), Y(y));
            ctx.restore();
          });
        } else typed(s, X(x), Y(y), size, o.align ?? "center");
      });
    },
    node(x, y, r, o = {}) {
      // A punched circle of halftone toner with a white rim, or pink when it's the idea.
      const { at = 0, tone = "ink" } = o;
      const R = r * u;
      slammed(X(x), Y(y), at, () => {
        const draw = () => {
          ctx.beginPath();
          ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
          ctx.fillStyle = tone === "accent" || tone === "bad" ? PINK : TONER;
          ctx.fill();
        };
        if (tone === "accent" || tone === "bad") offRegister(draw);
        else draw();
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R * 0.92, 0, Math.PI * 2);
        ctx.strokeStyle = TONER;
        ctx.lineWidth = 2.5 * u;
        ctx.stroke();
        ctx.fillStyle = SHEET;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(
            X(x) + Math.cos(a) * R * 0.45,
            Y(y) + Math.sin(a) * R * 0.45,
            R * 0.11,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      slammed(x0 + bw / 2, y0 + bh / 2, at, () => {
        scrap(
          x0 - 6 * u,
          y0 - 6 * u,
          bw + 12 * u,
          bh + 12 * u,
          tone === "ink" ? TONER : "#FBFAF5",
          21 + x * 9,
        );
        if (tone !== "ink") {
          ctx.strokeStyle = TONER;
          ctx.lineWidth = 3 * u;
          ctx.strokeRect(x0 + 4 * u, y0 + 4 * u, bw - 8 * u, bh - 8 * u);
        }
        tape(x0, y0, -0.7);
        tape(x0 + bw, y0 + bh, -0.7);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      if (t < at) return;
      const p = Math.min(1, (t - at) / (dur || 1e-6) + 0.125);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const color = tone === "bad" ? PINK : TONER;
      const thin = !head && tone === "accent";
      const seed = x1 * 31 + y2 * 17;
      const draw = () => scrawl(pts, p, color, thin ? 1.6 : 4.5, seed);
      if (tone === "bad") offRegister(draw);
      else draw();
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 20 * u;
        scrawl(
          [
            [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
            end,
            [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s],
          ],
          1,
          color,
          4.5,
          seed + 1,
        );
      }
    },
    store(x, y, w, h, o = {}) {
      // A pile of photocopied record sleeves: black and white scraps, each slammed on a step apart.
      const { at = 0, dur = 0.8 } = o;
      const n = 4;
      const [x0, bw] = [X(x), X(w)];
      const ph = Y(h) / n;
      for (let i = 0; i < n; i++) {
        const cy = Y(y + h) - ph * (i + 1);
        slammed(x0 + bw / 2, cy + ph / 2, at + (dur / n) * i, () => {
          ctx.save();
          ctx.translate(x0 + bw / 2, cy + ph / 2);
          ctx.rotate((hash(i * 3.3 + x) - 0.5) * 0.12);
          ctx.translate(-(x0 + bw / 2), -(cy + ph / 2));
          const fill = i === 2 ? PINK : i % 2 ? SHEET : TONER;
          scrap(x0, cy + 2 * u, bw, ph - 4 * u, fill, i * 7 + 40);
          ctx.restore();
        });
      }
      slammed(x0 + bw, Y(y), at + dur, () => tape(x0 + bw, Y(y) + 4 * u, 0.7, 36));
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      // Re-cut from new letters every time the number changes.
      const seed = Number.parseInt(value.replace(/\D/g, ""), 10) || 0;
      const w = ransom(value, X(x), Y(y), size, {
        align: "center",
        seed: seed * 1.37 + 5,
        pinkEvery: 2,
      });
      if (sub)
        slammed(X(x), Y(y), at + 0.25, () =>
          typed(sub, X(x), Y(y) + size * 0.85 * u, size * 0.28, "center"),
        );
      if (sub && t >= at + dur) {
        offRegister(() => {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(X(x), Y(y), w / 2 + 14 * u, size * 0.7 * u, -0.05, 0, Math.PI * 2);
          ctx.strokeStyle = PINK;
          ctx.lineWidth = 4 * u;
          ctx.stroke();
          ctx.restore();
        });
      }
      void tone;
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const [cx, cy] = [X(x), Y(y)];
      const at = o.at ?? 0;
      if (t < at) return;
      const color = kind === "check" ? TONER : PINK;
      const draw = () => {
        if (kind === "check")
          scrawl(
            [
              [cx - s * 0.5, cy],
              [cx - s * 0.12, cy + s * 0.4],
              [cx + s * 0.7, cy - s * 0.6],
            ],
            1,
            color,
            6,
            cx,
          );
        else {
          scrawl(
            [
              [cx - s * 0.6, cy - s * 0.5],
              [cx + s * 0.6, cy + s * 0.5],
            ],
            1,
            color,
            7,
            cx,
          );
          scrawl(
            [
              [cx + s * 0.6, cy - s * 0.5],
              [cx - s * 0.6, cy + s * 0.5],
            ],
            1,
            color,
            7,
            cx + 1,
          );
        }
      };
      if (kind === "cross") offRegister(draw);
      else draw();
    },
    finish() {
      // Copier flash on the step something slams down.
      if (lastSlam >= 0 && t - lastSlam < 0.125) {
        ctx.fillStyle = "rgba(255,255,255,0.28)";
        ctx.fillRect(0, 0, W, H);
      }
    },
  };
}

export default {
  id: "collage-zine",
  name: "Photocopy zine",
  category: "Paper & Craft",
  make,
} satisfies Style;
