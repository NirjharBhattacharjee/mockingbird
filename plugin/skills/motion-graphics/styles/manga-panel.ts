// A black-and-white manga page: brush-weight outlines, dot screentone,
// panels with focus lines that re-draw every other frame, hand-lettered
// caption boxes, outlined arrows and katakana sound effects. Things slam
// into place on twos (12 drawings a second) with a little shake.
import {
  along,
  type Cue,
  counting,
  curve,
  frame,
  hash,
  type Look,
  type Pt,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const INK = "#111111";
const PAPER = "#F4F1E9";
const LETTER = '"Anime Ace", "Comic Sans MS", "Chalkboard SE", "Marker Felt", sans-serif';
const BOLD = '"Helvetica Neue", "Arial Black", Arial, sans-serif';
const SFX = '"Hiragino Kaku Gothic StdN", "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__manga ??= new Map();
  const cache: Map<string, any> = g.__manga;
  // Animation on twos: every entrance steps at 12 drawings a second.
  const tq = Math.floor(t * 12) / 12;
  const boil = Math.floor(t * 12);

  /** How far a slam is: hidden before `at`, oversized then settled with a shake. */
  function slam(at = 0) {
    const s = tq - at;
    if (t < at) return null;
    const k = s < 1 / 12 ? 1.25 : s < 2 / 12 ? 0.94 : s < 3 / 12 ? 1.03 : 1;
    const shake = s < 0.25 ? (hash(boil * 3.1) - 0.5) * 8 * u : 0;
    return { k, dx: shake, dy: (hash(boil * 5.7) - 0.5) * (s < 0.25 ? 6 * u : 0) };
  }

  function slammed(cx: number, cy: number, at: number | undefined, draw: () => void) {
    const s = slam(at);
    if (!s) return;
    ctx.save();
    ctx.translate(cx + s.dx, cy + s.dy);
    ctx.scale(s.k, s.k);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }

  function tone() {
    const key = `tone:${u}`;
    let tile = cache.get(key);
    if (!tile) {
      const n = Math.max(4, Math.round(7 * u));
      tile = new OffscreenCanvas(n, n);
      const c = tile.getContext("2d");
      c.fillStyle = INK;
      for (const [x, y] of [
        [0, 0],
        [n, 0],
        [0, n],
        [n, n],
        [n / 2, n / 2],
      ] as Pt[]) {
        c.beginPath();
        c.arc(x, y, n * 0.2, 0, Math.PI * 2);
        c.fill();
      }
      cache.set(key, tile);
    }
    return ctx.createPattern(tile, "repeat");
  }

  function page() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      b.fillStyle = PAPER;
      b.fillRect(0, 0, W, H);
      // Non-photo blue pencil under-drawing left on the page.
      b.strokeStyle = "rgba(110,160,210,0.4)";
      b.lineWidth = 1.2 * u;
      for (let i = 0; i < 9; i++) {
        b.beginPath();
        b.ellipse(
          hash(i) * W,
          hash(i + 4) * H,
          (30 + hash(i + 2) * 70) * u,
          (20 + hash(i + 3) * 50) * u,
          hash(i) * 3,
          0,
          Math.PI * 2,
        );
        b.stroke();
      }
      for (let i = 0; i < 6; i++) {
        b.beginPath();
        b.moveTo(hash(i * 3) * W, hash(i * 5) * H);
        b.lineTo(hash(i * 7) * W, hash(i * 9) * H);
        b.stroke();
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  /** Focus lines: wedges converging on (cx, cy), redrawn every other frame. */
  function focus(cx: number, cy: number, inner: number, outer: number, n = 70) {
    ctx.save();
    ctx.fillStyle = INK;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash(i + boil * 13.7) * 0.08;
      const r0 = inner * (0.9 + hash(i * 3.3 + boil) * 0.5);
      const w = 0.012 + hash(i * 1.9 + boil * 2.1) * 0.02;
      trace(
        ctx,
        [
          [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0],
          [cx + Math.cos(a - w) * outer, cy + Math.sin(a - w) * outer],
          [cx + Math.cos(a + w) * outer, cy + Math.sin(a + w) * outer],
        ],
        true,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  /** A hand-lettered caption box. */
  function caption(
    s: string,
    x: number,
    y: number,
    size: number,
    align = "center",
    tone0: Tone = "ink",
  ) {
    ctx.font = `700 ${Math.round(size * u)}px ${LETTER}`;
    ctx.textBaseline = "middle";
    const text = s.toUpperCase();
    const w = ctx.measureText(text).width + size * 0.9 * u;
    const h = size * 1.55 * u;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.fillStyle = tone0 === "bad" ? INK : "#FFFFFF";
    ctx.fillRect(left, Y(y) - h / 2, w, h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5 * u;
    ctx.strokeRect(left, Y(y) - h / 2, w, h);
    ctx.fillStyle = tone0 === "bad" ? "#FFFFFF" : INK;
    ctx.textAlign = "left";
    ctx.fillText(text, left + size * 0.45 * u, Y(y) + u);
  }

  /** Katakana sound effect: black glyphs with a white knock-out edge, trembling. */
  function sfx(s: string, cx: number, cy: number, size: number, at: number) {
    if (t < at) return;
    ctx.save();
    ctx.translate(cx + (hash(boil * 1.3) - 0.5) * 4 * u, cy + (hash(boil * 2.9) - 0.5) * 4 * u);
    ctx.rotate(-0.25);
    ctx.font = `900 ${Math.round(size * u)}px ${SFX}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = size * 0.18 * u;
    ctx.strokeText(s, 0, 0);
    ctx.fillStyle = INK;
    ctx.fillText(s, 0, 0);
    ctx.restore();
  }

  return {
    surface() {
      page();
      const f = 12 * u;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 5 * u;
      trace(
        ctx,
        [
          [f, f],
          [W - f, f + 4 * u],
          [W - f, H - f],
          [f, H - f - 4 * u],
        ],
        true,
      );
      ctx.stroke();
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 40, at = 0 } = o;
      slammed(X(x), Y(y), at, () => caption(s, x, y, size, o.align ?? "left"));
    },
    label(s, x, y, o = {}) {
      slammed(X(x), Y(y), o.at, () => caption(s, x, y, o.size ?? 28, o.align ?? "center", o.tone));
    },
    node(x, y, r, o = {}) {
      const R = r * u;
      slammed(X(x), Y(y), o.at, () => {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.fillStyle = o.tone === "muted" ? "#CFCFCF" : tone();
        ctx.fill();
        // A white highlight crescent, then a brush outline.
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(X(x) - R * 0.3, Y(y) - R * 0.3, R * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 4 * u;
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
        ctx.stroke();
      });
    },
    box(x, y, w, h, o = {}) {
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const sk = 8 * u;
      // A panel with slanted sides.
      const corners: Pt[] = [
        [x0 + sk, y0],
        [x1, y0],
        [x1 - sk, y1],
        [x0, y1],
      ];
      slammed((x0 + x1) / 2, (y0 + y1) / 2, o.at, () => {
        trace(ctx, corners, true);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.save();
        trace(ctx, corners, true);
        ctx.clip();
        focus(
          (x0 + x1) / 2,
          (y0 + y1) / 2,
          Math.min(x1 - x0, y1 - y0) * 0.34,
          Math.hypot(x1 - x0, y1 - y0),
        );
        ctx.restore();
        trace(ctx, corners, true);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 5 * u;
        ctx.stroke();
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true, tone: tn = "ink" } = o;
      if (t < at) return;
      const p = Math.min(1, Math.ceil(((tq - at) / dur) * 4) / 4);
      if (p <= 0) return;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = along(shaft, p).points;
      ctx.save();
      ctx.lineCap = "round";
      if (!head) {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.3 * u;
        trace(ctx, shown);
        ctx.stroke();
        ctx.restore();
        return;
      }
      // An outlined arrow: thick black, then a white or toned core.
      const end = shaft.at(-1) as Pt;
      const prev = shaft.at(-3) as Pt;
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 26 * u;
      const tipPts: Pt[] = [
        [end[0] + Math.cos(a) * 4 * u, end[1] + Math.sin(a) * 4 * u],
        [end[0] - Math.cos(a - 0.6) * s, end[1] - Math.sin(a - 0.6) * s],
        [end[0] - Math.cos(a + 0.6) * s, end[1] - Math.sin(a + 0.6) * s],
      ];
      const body =
        p >= 1
          ? along(shaft, 1 - (s * 0.6) / (Math.hypot(end[0] - X(x1), end[1] - Y(y1)) + 1)).points
          : shown;
      trace(ctx, body);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 13 * u;
      ctx.stroke();
      if (p >= 1) {
        trace(ctx, tipPts, true);
        ctx.fillStyle = INK;
        ctx.lineJoin = "round";
        ctx.lineWidth = 6 * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.fillStyle = tn === "bad" ? tone() : "#FFFFFF";
        ctx.fill();
      }
      trace(ctx, body);
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 7 * u;
      ctx.stroke();
      if (tn === "bad") {
        ctx.strokeStyle = tone();
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      slammed(x0 + bw / 2, y0 + bh / 2, o.at, () => {
        // A drum: toned body, white top, brush outlines.
        const ry = bw * 0.16;
        ctx.beginPath();
        ctx.ellipse(x0 + bw / 2, y0 + ry, bw / 2, ry, 0, Math.PI, 0);
        ctx.lineTo(x0 + bw, y0 + bh - ry);
        ctx.ellipse(x0 + bw / 2, y0 + bh - ry, bw / 2, ry, 0, 0, Math.PI);
        ctx.closePath();
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.fillStyle = tone();
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(x0 + bw * 0.15, y0 + ry * 2, bw * 0.12, bh - ry * 4);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 4 * u;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x0 + bw / 2, y0 + ry, bw / 2, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.stroke();
        for (const f of [0.4, 0.7]) {
          ctx.beginPath();
          ctx.ellipse(x0 + bw / 2, y0 + ry + (bh - ry * 2) * f, bw / 2, ry, 0, 0, Math.PI);
          ctx.lineWidth = 2.5 * u;
          ctx.stroke();
        }
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at) return;
      // Counters tick on twos too.
      const value = count ? counting(tq, at, dur, count) + s : s;
      const [cx, cy] = [X(x), Y(y)];
      slammed(cx, cy, at, () => {
        ctx.font = `800 ${Math.round(size * u)}px ${BOLD}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (size >= 80) {
          // A narration box with the label on top.
          const w = ctx.measureText("000%").width + size * 0.6 * u;
          const h = size * 1.75 * u;
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(cx - w / 2, cy - h * 0.6, w, h);
          ctx.strokeStyle = INK;
          ctx.lineWidth = 4 * u;
          ctx.strokeRect(cx - w / 2, cy - h * 0.6, w, h);
          ctx.lineWidth = 1.5 * u;
          trace(ctx, [
            [cx - w / 2 + 10 * u, cy - h * 0.6 + size * 0.45 * u],
            [cx + w / 2 - 10 * u, cy - h * 0.6 + size * 0.45 * u],
          ]);
          ctx.stroke();
          if (sub) {
            ctx.font = `700 ${Math.round(size * 0.24 * u)}px ${LETTER}`;
            ctx.fillStyle = INK;
            ctx.fillText(sub.toUpperCase(), cx, cy - h * 0.6 + size * 0.24 * u);
            ctx.font = `800 ${Math.round(size * u)}px ${BOLD}`;
          }
          ctx.fillStyle = INK;
          ctx.fillText(value, cx, cy + size * 0.12 * u);
        } else {
          ctx.lineJoin = "round";
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = size * 0.2 * u;
          ctx.strokeText(value, cx, cy);
          ctx.fillStyle = INK;
          ctx.fillText(value, cx, cy);
          if (sub) caption(sub, x, y - (size * 0.9 * u) / H, size * 0.3);
        }
      });
      if (size >= 80) sfx("グン", cx - size * 1.3 * u, cy - size * 0.9 * u, size * 0.9, at + 0.1);
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 40) * u;
      const [cx, cy] = [X(x), Y(y)];
      slammed(cx, cy, o.at, () => {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const path = () => {
          if (kind === "check")
            trace(ctx, [
              [cx - s * 0.5, cy],
              [cx - s * 0.1, cy + s * 0.4],
              [cx + s * 0.6, cy - s * 0.55],
            ]);
          else {
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.45, cy - s * 0.45);
            ctx.lineTo(cx + s * 0.45, cy + s * 0.45);
            ctx.moveTo(cx + s * 0.45, cy - s * 0.45);
            ctx.lineTo(cx - s * 0.45, cy + s * 0.45);
          }
        };
        path();
        ctx.strokeStyle = INK;
        ctx.lineWidth = s * 0.32;
        ctx.stroke();
        path();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = s * 0.16;
        ctx.stroke();
        ctx.restore();
      });
    },
    finish() {},
  };
}

void ({} as Cue);

export default {
  id: "manga-panel",
  name: "Manga page",
  category: "Illustration",
  make,
} satisfies Style;
