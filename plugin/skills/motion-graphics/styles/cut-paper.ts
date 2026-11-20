// A cardstock shadow box at night: every piece is its own scissor-cut sheet
// with fibre grain, a lit edge and a soft shadow on the layer behind. Pieces
// slide up into place and settle; text is sticker letters with a white paper
// border; arrows are paper strips that grow.
import {
  type Align,
  clamp,
  counting,
  curve,
  expo,
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

const PAPER: Record<Tone, string> = {
  ink: "#F6F0E2",
  accent: "#F0B93A",
  good: "#5CC2B0",
  bad: "#EE6F4E",
  muted: "#B8B2D6",
};
const TEXT: Record<Tone, string> = {
  ink: "#3A3466",
  accent: "#E9A62A",
  good: "#3BA894",
  bad: "#E25A3C",
  muted: "#7C76A8",
};
const FACE = '"Nunito", "Noto Color Emoji", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__cutPaper ??= new Map();
  const cache: Map<string, any> = g.__cutPaper;

  /** A faint paper fibre texture as a pattern, made once. */
  function fibre() {
    const key = `fibre:${Math.round(u * 100)}`;
    let pat = cache.get(key);
    if (!pat) {
      const S = Math.round(120 * u);
      const c0 = new OffscreenCanvas(S, S);
      const c = c0.getContext("2d");
      c.lineWidth = Math.max(0.5, 0.7 * u);
      for (let i = 0; i < 220; i++) {
        const x = hash(i * 1.3) * S;
        const y = hash(i * 2.9) * S;
        const a = hash(i * 4.1) * Math.PI;
        const l = (3 + hash(i * 5.7) * 8) * u;
        c.strokeStyle = hash(i) > 0.5 ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.08)";
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        c.stroke();
      }
      pat = ctx.createPattern(c0, "repeat");
      cache.set(key, pat);
    }
    return pat;
  }

  /** Slide up from below and settle with a small turn; null before `at`. */
  function place(at: number, dur = 0.45) {
    const p = progress(t, at, dur);
    if (p <= 0) return null;
    const e = expo(p);
    return { dy: (1 - e) * 50 * u, rot: (1 - e) * 0.06, a: clamp(p * 3) };
  }

  /** One cut sheet: soft shadow, fill, fibre grain, and a lit top edge. */
  function sheet(shape: () => void, color: string, lift = 1) {
    ctx.save();
    ctx.shadowColor = "rgba(10,6,30,0.45)";
    ctx.shadowBlur = 12 * u * lift;
    ctx.shadowOffsetY = 6 * u * lift;
    ctx.shadowOffsetX = 2 * u * lift;
    shape();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    ctx.save();
    shape();
    ctx.fillStyle = fibre();
    ctx.fill();
    ctx.clip();
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.translate(0, 1.5 * u);
    shape();
    ctx.stroke();
    ctx.restore();
  }

  function withPlace(cx: number, cy: number, at: number, draw: () => void, dur?: number) {
    const pl = place(at, dur);
    if (!pl) return;
    ctx.save();
    ctx.globalAlpha = pl.a;
    ctx.translate(cx, cy + pl.dy);
    ctx.rotate(pl.rot);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }

  /** Sticker letters: a thick white paper border, the colour inside, a shadow under both. */
  function sticker(s: string, x: number, y: number, size: number, tone: Tone, align: Align) {
    ctx.save();
    ctx.font = `800 ${Math.round(size * u)}px ${FACE}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(10,6,30,0.45)";
    ctx.shadowBlur = 8 * u;
    ctx.shadowOffsetY = 4 * u;
    ctx.strokeStyle = "#FBF7EE";
    ctx.lineWidth = Math.max(4, size * 0.2 * u);
    ctx.strokeText(s, x, y);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = TEXT[tone];
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  return {
    surface() {
      const key = `bg:${W}x${H}`;
      let img = cache.get(key);
      if (!img) {
        img = new OffscreenCanvas(W, H);
        const c = img.getContext("2d");
        const gr = c.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, "#3A3466");
        gr.addColorStop(1, "#5A4E8A");
        c.fillStyle = gr;
        c.fillRect(0, 0, W, H);
        for (let i = 0; i < 160; i++) {
          c.fillStyle = `rgba(255,250,230,${0.4 + hash(i * 3) * 0.5})`;
          c.beginPath();
          c.arc(
            hash(i * 1.1) * W,
            hash(i * 2.2) * H * 0.7,
            (0.8 + hash(i * 5) * 1.6) * u,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
        // Torn paper hill layers, each casting a shadow on the one behind.
        const layers: [number, number, string, number][] = [
          [0.66, 0.1, "#6E66A6", 1],
          [0.76, 0.06, "#4F7E86", 4],
          [0.86, 0.03, "#2F6A62", 8],
        ];
        for (const [base, amp, col, s] of layers) {
          const pts: Pt[] = [];
          for (let i = 0; i <= 60; i++) {
            const x = (i / 60) * W;
            pts.push([
              x,
              H * (base - amp * (0.5 + 0.5 * Math.sin(i * 0.18 + s) * Math.cos(i * 0.07 + s * 2))) +
                (hash(i + s) - 0.5) * 3 * u,
            ]);
          }
          c.save();
          c.shadowColor = "rgba(10,6,30,0.5)";
          c.shadowBlur = 14 * u;
          c.shadowOffsetY = -4 * u;
          trace(c, [...pts, [W, H], [0, H]], true);
          c.fillStyle = col;
          c.fill();
          c.restore();
          // The white core showing along the torn edge.
          c.strokeStyle = "rgba(250,245,235,0.55)";
          c.lineWidth = 2 * u;
          trace(c, roughen(pts, 1.2 * u, s * 7));
          c.stroke();
        }
        cache.set(key, img);
      }
      ctx.drawImage(img, 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 76, at = 0, tone = "bad", align = "left" } = o;
      const dur = o.dur ?? 0.8;
      // Each word is its own sticker, placed one after another.
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${FACE}`;
      const words = s.split(" ");
      const space = ctx.measureText(" ").width;
      const total = ctx.measureText(s).width;
      ctx.restore();
      let cx = align === "center" ? X(x) - total / 2 : align === "right" ? X(x) - total : X(x);
      for (const [i, wd] of words.entries()) {
        ctx.save();
        ctx.font = `800 ${Math.round(size * u)}px ${FACE}`;
        const ww = ctx.measureText(wd).width;
        ctx.restore();
        const tones: Tone[] = [tone, "accent", "good"];
        const left = cx;
        withPlace(left + ww / 2, Y(y), at + (i * dur) / Math.max(1, words.length), () =>
          sticker(wd, left, Y(y), size, tones[i % 3] as Tone, "left"),
        );
        cx += ww + space;
      }
    },
    label(s, x, y, o = {}) {
      // A paper tag with a punched hole, dropped onto what it names.
      const size = o.size ?? 32;
      const tone = o.tone ?? "ink";
      const align = o.align ?? "center";
      withPlace(
        X(x),
        Y(y),
        o.at ?? 0,
        () => {
          ctx.save();
          ctx.font = `800 ${Math.round(size * u)}px ${FACE}`;
          const w = ctx.measureText(s).width + size * 0.9 * u;
          const h = size * 1.35 * u;
          const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
          ctx.restore();
          sheet(
            () => {
              ctx.beginPath();
              ctx.roundRect(left, Y(y) - h / 2, w, h, 4 * u);
            },
            PAPER.ink,
            0.7,
          );
          ctx.fillStyle = "rgba(60,50,100,0.35)";
          ctx.beginPath();
          ctx.arc(left + w - size * 0.25 * u, Y(y), size * 0.08 * u, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = `800 ${Math.round(size * u)}px ${FACE}`;
          ctx.fillStyle = TEXT[tone === "ink" ? "ink" : tone];
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(s, left + size * 0.35 * u, Y(y) + size * 0.04 * u);
        },
        0.35,
      );
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const R = r * u;
      withPlace(
        X(x),
        Y(y),
        at,
        () => {
          sheet(() => {
            ctx.beginPath();
            ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
          }, PAPER[tone]);
          sheet(
            () => {
              ctx.beginPath();
              ctx.arc(X(x) - R * 0.12, Y(y) - R * 0.12, R * 0.55, 0, Math.PI * 2);
            },
            "rgba(255,255,255,0.35)",
            0.3,
          );
        },
        0.35,
      );
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      withPlace(x0 + bw / 2, y0 + bh / 2, at, () => {
        sheet(
          () => {
            ctx.beginPath();
            ctx.roundRect(x0 - 8 * u, y0 - 8 * u, bw + 16 * u, bh + 16 * u, 6 * u);
          },
          PAPER[tone === "ink" ? "muted" : tone],
        );
        sheet(
          () => {
            ctx.beginPath();
            ctx.roundRect(x0, y0, bw, bh, 4 * u);
          },
          PAPER.ink,
          0.6,
        );
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      // A paper strip that grows along its path, with a cut-out arrowhead.
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * expo(p))));
      const thin = !head && tone === "accent";
      const color = PAPER[tone === "ink" ? "accent" : tone];
      ctx.save();
      ctx.lineCap = "butt";
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(10,6,30,0.45)";
      ctx.shadowBlur = 8 * u;
      ctx.shadowOffsetY = 4 * u;
      trace(ctx, shown);
      ctx.strokeStyle = thin ? "rgba(246,240,226,0.75)" : color;
      ctx.lineWidth = (thin ? 2.5 : 10) * u;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 26 * u;
        trace(
          ctx,
          [
            [end[0] + Math.cos(a) * s * 0.5, end[1] + Math.sin(a) * s * 0.5],
            [end[0] + Math.cos(a + 2) * s * 0.7, end[1] + Math.sin(a + 2) * s * 0.7],
            [end[0] + Math.cos(a - 2) * s * 0.7, end[1] + Math.sin(a - 2) * s * 0.7],
          ],
          true,
        );
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      // A stack of paper discs, each sheet placed on the one below.
      const { at = 0, dur = 0.8, tone = "good" } = o;
      const n = 5;
      const [x0, bw] = [X(x), X(w)];
      const ry = bw * 0.18;
      const step = (Y(h) - ry * 2) / (n - 1);
      const colors = [PAPER[tone], PAPER.accent, PAPER[tone], PAPER.bad, PAPER[tone]];
      for (let i = 0; i < n; i++) {
        const cy = Y(y + h) - ry - step * i;
        withPlace(
          x0 + bw / 2,
          cy,
          at + (dur / n) * i,
          () =>
            sheet(
              () => {
                ctx.beginPath();
                ctx.ellipse(x0 + bw / 2, cy, bw / 2, ry * 1.6, 0, 0, Math.PI * 2);
              },
              colors[i] as string,
              0.8,
            ),
          0.3,
        );
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "bad" } = o;
      if (t < at) return;
      if (sub) {
        // A paper sunburst pops up behind the big number.
        withPlace(X(x), Y(y), at, () => {
          const n = 16;
          const r = size * 1.25 * u;
          const pts: Pt[] = Array.from({ length: n * 2 }, (_, i) => {
            const a = (i / (n * 2)) * Math.PI * 2 + t * 0.15;
            const rr = i % 2 ? r * 0.72 : r;
            return [X(x) + Math.cos(a) * rr, Y(y) + Math.sin(a) * rr];
          });
          sheet(() => trace(ctx, pts, true), PAPER.accent);
        });
      }
      const value = count ? counting(t, at, dur, count) + s : s;
      withPlace(
        X(x),
        Y(y),
        at,
        () =>
          sticker(value, X(x), Y(y), size, sub ? "bad" : tone === "ink" ? "ink" : tone, "center"),
        0.3,
      );
      if (sub)
        withPlace(
          X(x),
          Y(y) + size * 0.7 * u,
          at + 0.3,
          () => sticker(sub, X(x), Y(y) + size * 0.7 * u, size * 0.32, "ink", "center"),
          0.3,
        );
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 36) * u;
      const [cx, cy] = [X(x), Y(y)];
      const color = PAPER[o.tone ?? (kind === "check" ? "good" : "bad")];
      withPlace(
        cx,
        cy,
        o.at ?? 0,
        () => {
          ctx.save();
          ctx.shadowColor = "rgba(10,6,30,0.45)";
          ctx.shadowBlur = 8 * u;
          ctx.shadowOffsetY = 4 * u;
          ctx.strokeStyle = color;
          ctx.lineWidth = 11 * u;
          ctx.lineCap = "butt";
          ctx.lineJoin = "miter";
          if (kind === "check")
            trace(ctx, [
              [cx - s * 0.5, cy],
              [cx - s * 0.1, cy + s * 0.4],
              [cx + s * 0.6, cy - s * 0.5],
            ]);
          else {
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.5, cy - s * 0.5);
            ctx.lineTo(cx + s * 0.5, cy + s * 0.5);
            ctx.moveTo(cx + s * 0.5, cy - s * 0.5);
            ctx.lineTo(cx - s * 0.5, cy + s * 0.5);
          }
          ctx.stroke();
          ctx.restore();
        },
        0.3,
      );
    },
    finish() {
      const gr = ctx.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.35,
        W / 2,
        H / 2,
        Math.hypot(W, H) * 0.6,
      );
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, "rgba(10,6,30,0.35)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    },
  };
}

export default {
  id: "cut-paper",
  name: "Cut-paper diorama",
  category: "Paper & Craft",
  make,
} satisfies Style;
