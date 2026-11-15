// Eighties Milan pop: a pastel ground split on a slant, terrazzo specks,
// squiggles, zigzags, dot grids and confetti, every shape in a fat black
// outline with a hard offset shadow. Cut-out timing on twos: shapes pop on
// with a springy overshoot, then keep bobbing slightly off the beat.
import {
  arrowhead,
  clamp,
  counting,
  curve,
  frame,
  hash,
  type Look,
  type Pt,
  type Style,
  spring,
  type Tone,
  trace,
} from "./look.ts";

const INK = "#1B1B1F";
const CREAM = "#FFF8EA";
const PINK = "#F7C5D5";
const MINT = "#A9E5D3";
const FILL: Record<Tone, string> = {
  ink: "#B9A6F2",
  accent: "#FF4F9A",
  good: "#2D6BFF",
  bad: "#FF5A36",
  muted: "#FFD23F",
};
const POP = ["#FF4F9A", "#FFD23F", "#2D6BFF", "#14B8A6", "#B9A6F2"];
const ROUND = '"Arial Rounded MT Bold", "Avenir Next", "Futura", "Helvetica Neue", sans-serif';

function make(ctx: any, t0: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const t = Math.floor(t0 * 12) / 12;
  const font = (size: number) => `900 ${Math.round(size * u)}px ${ROUND}`;
  const pop = (at = 0) => spring(t, { start: at, stiffness: 240, damping: 11 });
  const bob = (seed: number) => Math.sin(t * 3 + seed) * 2.5 * u;
  const SH = 6 * u;
  const g = globalThis as any;
  g.__memphisGround ??= new Map();
  const cache: Map<string, any> = g.__memphisGround;

  /** Fill and outline the current path with a hard shadow under it. */
  function solid(color: string, path: () => void, lw = 4) {
    ctx.save();
    ctx.translate(SH, SH);
    path();
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.restore();
    path();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = lw * u;
    ctx.strokeStyle = INK;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  function popped(cx: number, cy: number, at: number | undefined, seed: number, draw: () => void) {
    const s = pop(at);
    if (s <= 0) return;
    ctx.save();
    ctx.translate(cx, cy + bob(seed));
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }

  function words(s: string, x: number, y: number, size: number, color: string, align = "center") {
    ctx.font = font(size);
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineWidth = size * 0.14 * u;
    ctx.strokeStyle = INK;
    ctx.lineJoin = "round";
    ctx.strokeText(s.toUpperCase(), x, y);
    ctx.fillStyle = color;
    ctx.fillText(s.toUpperCase(), x, y);
  }

  function ground() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const x = c.getContext("2d");
      x.fillStyle = PINK;
      x.fillRect(0, 0, W, H);
      x.fillStyle = MINT;
      x.beginPath();
      x.moveTo(W * 0.55, 0);
      x.lineTo(W, 0);
      x.lineTo(W, H);
      x.lineTo(W * 0.38, H);
      x.closePath();
      x.fill();
      // terrazzo specks
      for (let i = 0; i < 700; i++) {
        x.fillStyle = i % 3 ? "rgba(27,27,31,0.35)" : (POP[i % POP.length] as string);
        x.save();
        x.translate(hash(i * 1.9) * W, hash(i * 2.7) * H);
        x.rotate(hash(i * 3.1) * Math.PI);
        x.fillRect(0, 0, (2 + hash(i) * 4) * u, 1.6 * u);
        x.restore();
      }
      // dot grid patch and a terrazzo quarter disc
      x.fillStyle = "#FFE9A8";
      x.fillRect(W * 0.8, H * 0.86, W * 0.15, H * 0.08);
      x.strokeStyle = INK;
      x.lineWidth = 3 * u;
      x.strokeRect(W * 0.8, H * 0.86, W * 0.15, H * 0.08);
      x.fillStyle = INK;
      for (let gx = W * 0.81; gx < W * 0.95; gx += 10 * u)
        for (let gy = H * 0.875; gy < H * 0.935; gy += 10 * u) x.fillRect(gx, gy, 2.5 * u, 2.5 * u);
      x.beginPath();
      x.arc(0, H, 130 * u, -Math.PI / 2, 0);
      x.lineTo(0, H);
      x.fillStyle = CREAM;
      x.fill();
      x.stroke();
      for (let i = 0; i < 40; i++) {
        const a = (-hash(i * 5.5) * Math.PI) / 2;
        const r = hash(i * 6.6) * 120 * u;
        x.fillStyle = POP[i % POP.length] as string;
        x.beginPath();
        x.arc(Math.cos(a) * r, H + Math.sin(a) * r, 3 * u, 0, Math.PI * 2);
        x.fill();
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  function squiggle(x: number, y: number, w: number, color: string, phase: number, zig = false) {
    const pts: Pt[] = Array.from({ length: 41 }, (_, i) => {
      const f = i / 40;
      const wave = zig ? ((i / 4) % 2 ? 1 : -1) : Math.sin(f * Math.PI * 4 + phase);
      return [x + f * w, y + wave * 9 * u];
    });
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = zig ? "miter" : "round";
    trace(ctx, zig ? pts.filter((_, i) => i % 4 === 0) : pts);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 10 * u;
    ctx.stroke();
    trace(ctx, zig ? pts.filter((_, i) => i % 4 === 0) : pts);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5 * u;
    ctx.stroke();
    ctx.restore();
  }

  return {
    surface() {
      ground();
      squiggle(X(0.05), Y(0.9), 150 * u, "#14B8A6", t * 2);
      squiggle(X(0.42), Y(0.94), 120 * u, "#2D6BFF", 0, true);
      // confetti triangles
      for (let i = 0; i < 14; i++) {
        const cx = hash(i * 9.1) * W;
        const cy = hash(i * 7.3) * H;
        ctx.save();
        ctx.translate(cx, cy + Math.sin(t * 2 + i) * 3 * u);
        ctx.rotate(hash(i) * 6 + t * 0.5 * (i % 2 ? 1 : -1));
        ctx.beginPath();
        ctx.moveTo(0, -6 * u);
        ctx.lineTo(6 * u, 5 * u);
        ctx.lineTo(-6 * u, 5 * u);
        ctx.closePath();
        ctx.fillStyle = POP[i % POP.length];
        ctx.fill();
        ctx.restore();
      }
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.05, size = 54, at = 0 } = o;
      ctx.font = font(size);
      const w = ctx.measureText(s.toUpperCase()).width + 48 * u;
      const h = size * 1.7 * u;
      const [bx, by] = [X(x), Y(y)];
      popped(bx + w / 2, by + h / 2, at, 1, () => {
        ctx.save();
        ctx.translate(bx + w / 2, by + h / 2);
        ctx.rotate(-0.04);
        ctx.translate(-bx - w / 2, -by - h / 2);
        solid("#FFD23F", () => {
          ctx.beginPath();
          ctx.roundRect(bx, by, w, h, 14 * u);
          ctx.moveTo(bx + 40 * u, by + h);
          ctx.lineTo(bx + 30 * u, by + h + 22 * u);
          ctx.lineTo(bx + 64 * u, by + h);
        });
        words(s, bx + w / 2, by + h / 2, size, "#FF4F9A");
        ctx.restore();
      });
    },
    label(s, x, y, o = {}) {
      const { size = 32, align = "center", tone = "ink", at = 0 } = o;
      ctx.font = font(size);
      const w = ctx.measureText(s.toUpperCase()).width + 28 * u;
      const h = size * 1.5 * u;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      popped(left + w / 2, Y(y), at, x * 20, () => {
        solid(
          tone === "ink" || tone === "muted" ? CREAM : FILL[tone],
          () => {
            ctx.beginPath();
            ctx.roundRect(left, Y(y) - h / 2, w, h, h / 2);
          },
          3.5,
        );
        ctx.font = font(size);
        ctx.fillStyle = tone === "ink" || tone === "muted" ? INK : CREAM;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s.toUpperCase(), left + w / 2, Y(y) + 1 * u);
      });
    },
    node(x, y, r, o = {}) {
      const R = r * u;
      const i = Math.floor(hash(x * 91 + y * 37) * POP.length);
      const color = o.tone && o.tone !== "accent" ? FILL[o.tone] : (POP[i] as string);
      const shape = Math.floor(hash(x * 13 + y * 71) * 3);
      popped(X(x), Y(y), o.at, x * 30 + y * 10, () => {
        solid(
          color,
          () => {
            ctx.beginPath();
            if (shape === 0) ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
            else if (shape === 1)
              ctx.roundRect(X(x) - R * 0.9, Y(y) - R * 0.9, R * 1.8, R * 1.8, 4 * u);
            else {
              ctx.moveTo(X(x), Y(y) - R * 1.1);
              ctx.lineTo(X(x) + R * 1.05, Y(y) + R * 0.8);
              ctx.lineTo(X(x) - R * 1.05, Y(y) + R * 0.8);
              ctx.closePath();
            }
          },
          3.5,
        );
      });
    },
    box(x, y, w, h, o = {}) {
      popped(X(x + w / 2), Y(y + h / 2), o.at, 3, () => {
        solid(
          CREAM,
          () => {
            ctx.beginPath();
            ctx.roundRect(X(x), Y(y), X(w), Y(h), 16 * u);
          },
          5,
        );
        // a stripe of the tone along the top
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(X(x), Y(y), X(w), Y(h), 16 * u);
        ctx.clip();
        ctx.fillStyle = FILL[o.tone ?? "muted"];
        ctx.fillRect(X(x), Y(y), X(w), 16 * u);
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(X(x), Y(y) + 16 * u);
        ctx.lineTo(X(x + w), Y(y) + 16 * u);
        ctx.lineWidth = 4 * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.3, bend = 0, head = true, tone = "accent" } = o;
      const p = clamp((t - at) / dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 24);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      const col = FILL[tone];
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (head) {
        ctx.save();
        ctx.translate(SH * 0.6, SH * 0.6);
        trace(ctx, shown);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 15 * u;
        ctx.stroke();
        ctx.restore();
      }
      trace(ctx, shown);
      ctx.strokeStyle = INK;
      ctx.lineWidth = (head ? 15 : 6) * u;
      ctx.stroke();
      trace(ctx, shown);
      ctx.strokeStyle = col;
      ctx.lineWidth = (head ? 8 : 2.5) * u;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        solid(
          col,
          () =>
            arrowhead(
              ctx,
              [end[0] + Math.cos(a) * 8 * u, end[1] + Math.sin(a) * 8 * u],
              a,
              28 * u,
              false,
            ),
          3.5,
        );
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      // a totem of stacked shapes, each popping on in turn
      const at = o.at ?? 0;
      const n = 4;
      const sh = Y(h) / n;
      for (let i = n - 1; i >= 0; i--) {
        const cy = Y(y) + sh * (i + 0.5);
        popped(X(x + w / 2), cy, at + (n - 1 - i) * 0.1, i, () => {
          solid(
            POP[i % POP.length] as string,
            () => {
              ctx.beginPath();
              if (i === 0) {
                ctx.moveTo(X(x), cy - sh * 0.45);
                ctx.lineTo(X(x + w), cy - sh * 0.45);
                ctx.lineTo(X(x + w / 2), cy + sh * 0.45);
                ctx.closePath();
              } else if (i % 2) ctx.roundRect(X(x), cy - sh * 0.42, X(w), sh * 0.84, sh * 0.42);
              else ctx.roundRect(X(x) + 6 * u, cy - sh * 0.42, X(w) - 12 * u, sh * 0.84, 4 * u);
            },
            3.5,
          );
          if (i % 2) {
            ctx.fillStyle = INK;
            for (let k = 0; k < 4; k++)
              ctx.fillRect(X(x) + X(w) * (0.2 + k * 0.18), cy - 2 * u, 4 * u, 4 * u);
          }
        });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "accent" } = o;
      const str = count ? counting(t, at, dur, count) + s : s;
      popped(X(x), Y(y), at, 7, () => {
        if (sub) {
          ctx.font = font(size);
          const w = ctx.measureText(`${count ? count[1] : ""}${s}`).width + 60 * u;
          const h = size * 1.9 * u;
          ctx.save();
          ctx.translate(X(x), Y(y));
          ctx.rotate(0.05);
          solid(
            CREAM,
            () => {
              ctx.beginPath();
              ctx.roundRect(-w / 2, -h / 2, w, h, 18 * u);
            },
            5,
          );
          words(str, 0, -size * 0.12 * u, size, FILL[tone]);
          ctx.font = font(size * 0.26);
          ctx.fillStyle = INK;
          ctx.textAlign = "center";
          ctx.fillText(sub.toUpperCase(), 0, size * 0.6 * u);
          ctx.restore();
        } else words(str, X(x), Y(y), size, FILL[tone]);
      });
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 34) * u;
      popped(X(x), Y(y), o.at, 9, () => {
        solid(
          kind === "check" ? "#14B8A6" : "#FF5A36",
          () => {
            if (kind === "check") {
              ctx.beginPath();
              ctx.arc(X(x), Y(y), r, 0, Math.PI * 2);
            } else {
              const pts: Pt[] = Array.from({ length: 20 }, (_, i) => {
                const a = (i / 20) * Math.PI * 2;
                const rr = i % 2 ? r * 0.7 : r * 1.15;
                return [X(x) + Math.cos(a) * rr, Y(y) + Math.sin(a) * rr];
              });
              trace(ctx, pts, true);
            }
          },
          3.5,
        );
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = CREAM;
        ctx.lineWidth = 7 * u;
        const [cx, cy] = [X(x), Y(y)];
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.45, cy],
            [cx - r * 0.1, cy + r * 0.35],
            [cx + r * 0.5, cy - r * 0.35],
          ]);
        else {
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.38, cy - r * 0.38);
          ctx.lineTo(cx + r * 0.38, cy + r * 0.38);
          ctx.moveTo(cx + r * 0.38, cy - r * 0.38);
          ctx.lineTo(cx - r * 0.38, cy + r * 0.38);
        }
        ctx.stroke();
        ctx.restore();
      });
    },
    finish() {},
  };
}

export default {
  id: "memphis",
  name: "Memphis pop",
  category: "Art & Design Movements",
  make,
} satisfies Style;
