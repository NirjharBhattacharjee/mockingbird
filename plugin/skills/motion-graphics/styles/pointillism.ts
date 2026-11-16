// Divisionist dabs: everything, lettering included, is filled with small
// dots of unmixed colour that blend from a distance. Dots re-pick their hue
// a few times a second so the scene shimmers, and things dab in sparse first,
// then fill up.
import {
  type Align,
  clamp,
  counting,
  curve,
  frame,
  hash,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

/** The hues each tone is broken into: dominant first, then its neighbours and complement. */
const HUES: Record<Tone | "pad" | "sky" | "water" | "grass" | "path", string[]> = {
  ink: ["#2B2F7A", "#3D3A98", "#1E3F8A", "#6A3A8C", "#C2552E"],
  accent: ["#E3A02A", "#F2C640", "#D9742A", "#F7DD7A", "#5B6FC4"],
  good: ["#3E8E4A", "#6BB04A", "#2F6F8A", "#A8C84A", "#D6533A"],
  bad: ["#D8442E", "#EE6A3A", "#B8304A", "#F29A6A", "#3E8E7A"],
  muted: ["#8A86A8", "#A9A4C0", "#7C9AB0", "#C2B2C8", "#D9C27A"],
  pad: ["#F4E6D2", "#F8EEDD", "#EBD7CE", "#E9E2EE", "#F2D6C0"],
  sky: ["#8FB2E0", "#B8CBEA", "#E8C9D8", "#F3E2C4", "#6E92D0", "#C7D9F0"],
  water: ["#3E6CB8", "#5C8AD0", "#2F4E9A", "#8FB0E0", "#E2B48A", "#6A5AA8"],
  grass: ["#4E9A3E", "#7AB848", "#3A7A4E", "#A8C850", "#E0B24A", "#2E5E8A"],
  path: ["#E8C8A8", "#F2D8C0", "#D8A890", "#C8B8D8", "#F0E0B0"],
};
const FACE = '"Didot", "Bodoni 72", "Playfair Display", "Iowan Old Style", Georgia, serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__pointil ??= new Map();
  const cache: Map<string, any> = g.__pointil;
  const beat = Math.floor(t * 10) % 3;

  /** A tile of dots in one palette at a density (0-1), one of three shimmer variants. */
  function tile(name: keyof typeof HUES, density: number, v: number) {
    const d = Math.max(1, Math.round(density * 3));
    const key = `${name}:${d}:${v}:${Math.round(u * 100)}`;
    let pat = cache.get(key);
    if (!pat) {
      const S = Math.round(56 * u);
      const c0 = new OffscreenCanvas(S, S);
      const c = c0.getContext("2d");
      const pal = HUES[name];
      const step = 4.2 * u;
      let i = 0;
      for (let y = 0; y < S; y += step) {
        for (let x = 0; x < S; x += step) {
          i++;
          if (hash(i * 1.37 + 3) > d / 3) continue;
          const pick = hash(i * 2.11 + v * 31.7);
          const col = pal[
            pick < 0.55 ? 0 : Math.floor(1 + hash(i + v * 7) * (pal.length - 1))
          ] as string;
          c.fillStyle = col;
          c.beginPath();
          c.ellipse(
            (x + hash(i * 3.1) * step * 0.6 + S) % S,
            (y + hash(i * 4.3) * step * 0.6 + S) % S,
            step * 0.55,
            step * 0.42,
            hash(i) * 3,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
      }
      pat = ctx.createPattern(c0, "repeat");
      cache.set(key, pat);
    }
    return pat;
  }

  /** The painted landscape, made once: sky, a far shore, water, a lawn and a path. */
  function scene() {
    const key = `scene:${W}x${H}`;
    let img = cache.get(key);
    if (!img) {
      img = new OffscreenCanvas(W, H);
      const c = img.getContext("2d");
      c.fillStyle = "#EEE4D0";
      c.fillRect(0, 0, W, H);
      const step = 4.6 * u;
      let i = 0;
      for (let y = 0; y < H; y += step * 0.86) {
        for (let x = 0; x < W; x += step) {
          i++;
          const yy = y / H;
          const shore = 0.36 + Math.sin(x / (W * 0.13)) * 0.01;
          const lawn = 0.47 + (x / W) * 0.02;
          const onPath = Math.abs(yy - (0.62 - (x / W) * 0.18)) < 0.025 && x < W * 0.75;
          const name: keyof typeof HUES =
            yy < shore
              ? "sky"
              : yy < shore + 0.02
                ? "muted"
                : yy < lawn
                  ? "water"
                  : onPath
                    ? "path"
                    : "grass";
          const pal = HUES[name];
          c.fillStyle = pal[Math.floor(hash(i * 1.9) * pal.length)] as string;
          c.beginPath();
          c.ellipse(
            x + hash(i * 2.7) * step,
            y + hash(i * 3.3) * step,
            step * 0.6,
            step * 0.45,
            hash(i) * 3,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
      }
      // A dotted painted border.
      c.fillStyle = "#2B2F7A";
      const b = 10 * u;
      for (let k = 0; k < (W + H) * 2; k += 5 * u) {
        const p = k;
        const [x, y] =
          p < W
            ? [p, b / 2]
            : p < W + H
              ? [W - b / 2, p - W]
              : p < W * 2 + H
                ? [W - (p - W - H), H - b / 2]
                : [b / 2, H - (p - W * 2 - H)];
        c.beginPath();
        c.arc(
          x + (hash(k) - 0.5) * 4 * u,
          y + (hash(k + 1) - 0.5) * 4 * u,
          2.6 * u,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
      cache.set(key, img);
    }
    ctx.drawImage(img, 0, 0);
  }

  /** Fill and/or stroke the current path with dabs of `tone`, sparse at the start of the entrance. */
  function dab(name: keyof typeof HUES, p: number, how: "fill" | "stroke" = "fill") {
    const pat = tile(name, clamp(p * 1.4), beat);
    // A thin solid underpainting first, so the form holds against the busy ground.
    ctx.save();
    ctx.globalAlpha *= 0.65 * clamp(p * 1.5);
    if (how === "fill") {
      ctx.fillStyle = HUES[name][0];
      ctx.fill();
    } else {
      ctx.strokeStyle = HUES[name][0];
      ctx.stroke();
    }
    ctx.restore();
    if (how === "fill") {
      ctx.fillStyle = pat;
      ctx.fill();
    } else {
      ctx.strokeStyle = pat;
      ctx.stroke();
    }
  }

  /** Dotted lettering on a pale dabbed pad, so it stays readable over the scene. */
  function letters(
    s: string,
    x: number,
    y: number,
    size: number,
    o: { at?: number; dur?: number; tone?: Tone; align?: Align; pad?: boolean; italic?: boolean },
  ) {
    const { at = 0, tone = "ink", align = "left", pad = true, italic = true } = o;
    const p = progress(t, at, o.dur ?? 0.5);
    if (p <= 0) return 0;
    ctx.save();
    ctx.font = `${italic ? "italic " : ""}700 ${Math.round(size * u)}px ${FACE}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    if (pad) {
      ctx.beginPath();
      ctx.roundRect(
        left - size * 0.35 * u,
        y - size * 0.6 * u,
        w + size * 0.7 * u,
        size * 1.2 * u,
        size * 0.5 * u,
      );
      dab("pad", p);
    }
    // Solid underpainting faintly, then the dabs on top.
    ctx.globalAlpha = 0.8 * p;
    ctx.fillStyle = HUES[tone][0] as string;
    ctx.fillText(s, left, y);
    ctx.globalAlpha = 1;
    ctx.fillStyle = tile(tone, clamp(p * 1.4), beat);
    ctx.fillText(s, left, y);
    ctx.restore();
    return w;
  }

  return {
    surface() {
      scene();
      // The shimmer: a scatter of dots that re-pick their colour each beat.
      ctx.save();
      const f = Math.floor(t * 10);
      for (let i = 0; i < 900; i++) {
        const x = hash(i * 1.3) * W;
        const y = hash(i * 2.7) * H;
        const yy = y / H;
        const pal = HUES[yy < 0.36 ? "sky" : yy < 0.47 ? "water" : "grass"];
        ctx.fillStyle = pal[Math.floor(hash(i + f * 13.1) * pal.length)] as string;
        ctx.beginPath();
        ctx.arc(x, y, 2.4 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.08, size = 60, at = 0, tone = "ink", align = "left" } = o;
      letters(s, X(x), Y(y), size, { at, dur: o.dur ?? 0.8, tone, align });
    },
    label(s, x, y, o = {}) {
      letters(s, X(x), Y(y), o.size ?? 34, {
        at: o.at ?? 0,
        dur: o.dur ?? 0.4,
        tone: o.tone ?? "ink",
        align: o.align ?? "center",
      });
    },
    node(x, y, r, o = {}) {
      // A dotted sphere: lit side warm, shade side cool.
      const { at = 0, dur = 0.4, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const R = r * u * (0.85 + 0.15 * p);
      ctx.save();
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
      dab(tone, p);
      ctx.beginPath();
      ctx.arc(X(x) + R * 0.3, Y(y) + R * 0.3, R * 0.7, 0, Math.PI * 2);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
      ctx.globalAlpha = 0.7;
      dab("ink", p);
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(X(x), Y(y), X(w), Y(h), 10 * u);
      dab("pad", p);
      ctx.lineWidth = 9 * u;
      dab(tone === "good" ? "ink" : tone, p, "stroke");
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = (!head && tone === "accent" ? 4 : 9) * u;
      trace(ctx, shown);
      dab(tone, 1, "stroke");
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 26 * u;
        trace(
          ctx,
          [
            end,
            [end[0] - Math.cos(a - 0.45) * s, end[1] - Math.sin(a - 0.45) * s],
            [end[0] - Math.cos(a + 0.45) * s, end[1] - Math.sin(a + 0.45) * s],
          ],
          true,
        );
        dab(tone, 1);
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      // A dotted drum, banded.
      const { at = 0, dur = 0.7, tone = "muted" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const [x0, x1] = [X(x), X(x + w)];
      const rx = (x1 - x0) / 2;
      const ry = rx * 0.3;
      const top = Y(y) + ry;
      const bottom = Y(y + h) - ry;
      const shown = bottom - (bottom - top) * clamp(p * 1.3);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x0 + rx, bottom, rx, ry, 0, 0, Math.PI);
      ctx.lineTo(x0, shown);
      ctx.ellipse(x0 + rx, shown, rx, ry, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      dab(tone, p);
      for (const f of [0.33, 0.66]) {
        const yy = top + (bottom - top) * f;
        if (yy < shown) continue;
        ctx.beginPath();
        ctx.ellipse(x0 + rx, yy, rx, ry, 0, 0, Math.PI);
        ctx.lineWidth = 5 * u;
        dab("ink", p, "stroke");
      }
      ctx.beginPath();
      ctx.ellipse(x0 + rx, shown, rx, ry, 0, 0, Math.PI * 2);
      dab("pad", p);
      ctx.lineWidth = 4 * u;
      dab("ink", p, "stroke");
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const w = letters(value, X(x), Y(y), size, {
        at,
        dur: 0.3,
        tone,
        align: "center",
        pad: true,
        italic: true,
      });
      if (sub) {
        letters(sub, X(x), Y(y) + size * 0.85 * u, size * 0.36, {
          at: at + 0.3,
          dur: 0.3,
          tone: "ink",
          align: "center",
        });
        const p = progress(t, at + dur, 0.4);
        if (p > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(
            X(x),
            Y(y),
            w / 2 + size * 0.3 * u,
            size * 0.6 * u,
            0,
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * p,
          );
          ctx.lineWidth = 6 * u;
          dab("bad", 1, "stroke");
          ctx.restore();
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 36) * u;
      const [cx, cy] = [X(x), Y(y)];
      const p = progress(t, o.at ?? 0, 0.3);
      if (p <= 0) return;
      ctx.save();
      ctx.lineWidth = 9 * u;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (kind === "check")
        trace(ctx, [
          [cx - s * 0.5, cy],
          [cx - s * 0.12, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5],
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.5, cy - s * 0.5);
        ctx.lineTo(cx + s * 0.5, cy + s * 0.5);
        ctx.moveTo(cx + s * 0.5, cy - s * 0.5);
        ctx.lineTo(cx - s * 0.5, cy + s * 0.5);
      }
      dab(o.tone ?? (kind === "check" ? "good" : "bad"), p, "stroke");
      ctx.restore();
    },
    finish() {},
  };
}

export default {
  id: "pointillism",
  name: "Pointillist",
  category: "Painterly",
  make,
} satisfies Style;
