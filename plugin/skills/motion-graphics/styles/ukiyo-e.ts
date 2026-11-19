// Edo woodblock print: warm washi with fibres, a Prussian-blue sky graded
// down from the top, a band of sea with curling foam at the foot. Each thing
// is printed the way a block print is: the dark keyblock outline lands, then
// the colour block presses in a little off register and settles.
import {
  alpha,
  arrowhead,
  clamp,
  counting,
  curve,
  ellipse,
  frame,
  hash,
  type Look,
  leftOf,
  type Pt,
  progress,
  type Style,
  type Tone,
  text,
  trace,
} from "./look.ts";

const SUMI = "#2A2420";
const WASHI = "#EFE2C4";
const CARD = "#F6ECD2";
const GOLD = "#B8913F";
const BLOCK: Record<Tone, string> = {
  ink: "#5B3A26",
  accent: "#1F4C7A",
  good: "#3F6E52",
  bad: "#C2412D",
  muted: "#9A8B70",
};
const SERIF = '"Charis SIL", "Noto Color Emoji", serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const font = (size: number, w = 600) => `${w} ${Math.round(size * u)}px ${SERIF}`;
  const g = globalThis as any;
  g.__ukiyoPaper ??= new Map();
  const cache: Map<string, any> = g.__ukiyoPaper;

  /** The two stages of a print: keyblock outline (0-1) and colour pressed in (0-1). */
  function press(at = 0, dur = 0.6) {
    const p = progress(t, at, dur);
    return {
      key: clamp(p / 0.35),
      color: clamp((p - 0.35) / 0.4),
      shift: (1 - clamp((p - 0.35) / 0.65)) * 6 * u,
      on: p > 0,
    };
  }

  function paper() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const x = c.getContext("2d");
      x.fillStyle = WASHI;
      x.fillRect(0, 0, W, H);
      const sky = x.createLinearGradient(0, 0, 0, H * 0.45);
      sky.addColorStop(0, "rgba(31,76,122,0.55)");
      sky.addColorStop(0.35, "rgba(31,76,122,0.18)");
      sky.addColorStop(1, "rgba(31,76,122,0)");
      x.fillStyle = sky;
      x.fillRect(0, 0, W, H * 0.45);
      // wood grain: long faint wavy lines
      x.strokeStyle = "rgba(90,60,30,0.06)";
      x.lineWidth = 1.2 * u;
      for (let i = 0; i < 60; i++) {
        const y0 = hash(i * 3.3) * H;
        x.beginPath();
        for (let px = 0; px <= W; px += 20 * u)
          x.lineTo(px, y0 + Math.sin(px / (140 * u) + i) * 6 * u);
        x.stroke();
      }
      // washi fibres
      x.strokeStyle = "rgba(120,90,50,0.10)";
      for (let i = 0; i < 500; i++) {
        const fx = hash(i * 1.7) * W;
        const fy = hash(i * 2.9) * H;
        const a = hash(i * 4.1) * Math.PI;
        const l = (4 + hash(i * 5.3) * 14) * u;
        x.beginPath();
        x.moveTo(fx, fy);
        x.quadraticCurveTo(
          fx + Math.cos(a) * l,
          fy + Math.sin(a + 1) * l,
          fx + Math.cos(a) * l * 1.6,
          fy + Math.sin(a) * l * 1.6,
        );
        x.stroke();
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  function sea() {
    const top = H * 0.88;
    const bands = ["#9CB8C9", "#5E86A6", "#2F5B84", "#1D3D61"];
    for (const [i, col] of bands.entries()) {
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let px = 0; px <= W + 10; px += 10 * u)
        ctx.lineTo(px, top + i * 14 * u + Math.sin(px / (60 * u) + t * 1.2 + i) * 4 * u);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
    }
    // foam claws riding the crests
    ctx.strokeStyle = "rgba(246,236,210,0.9)";
    ctx.lineWidth = 2 * u;
    for (let k = 0; k < 18; k++) {
      const cx = ((k / 18) * W + t * 20 * u) % (W + 40 * u);
      const cy = top + Math.sin(cx / (60 * u) + t * 1.2) * 4 * u;
      ctx.beginPath();
      ctx.arc(cx, cy + 6 * u, 7 * u, Math.PI * 1.05, Math.PI * 1.9);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(246,236,210,0.35)";
    ctx.lineWidth = 1.2 * u;
    for (let r = 0; r < 4; r++) {
      ctx.beginPath();
      for (let px = 0; px <= W; px += 12 * u)
        ctx.lineTo(px, top + (22 + r * 14) * u + Math.sin(px / (40 * u) + r + t) * 2 * u);
      ctx.stroke();
    }
  }

  /** A cartouche: cream panel, keyblock border, inner gold rule. */
  function cartouche(
    x: number,
    y: number,
    w: number,
    h: number,
    pr: ReturnType<typeof press>,
    edge = SUMI,
  ) {
    ctx.save();
    if (pr.color > 0) {
      ctx.globalAlpha = pr.color;
      ctx.fillStyle = CARD;
      ctx.fillRect(x + pr.shift, y + pr.shift, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = edge;
    ctx.lineWidth = 3 * u;
    ctx.globalAlpha = pr.key;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.5 * u;
    ctx.strokeRect(x + 5 * u, y + 5 * u, w - 10 * u, h - 10 * u);
    ctx.restore();
  }

  return {
    surface() {
      paper();
      // vermilion sun
      ctx.beginPath();
      ctx.arc(X(0.93), Y(0.16), 52 * u, 0, Math.PI * 2);
      ctx.fillStyle = alpha(BLOCK.bad, 0.92);
      ctx.fill();
      sea();
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.05, size = 50, at = 0, dur = 0.8 } = o;
      const pr = press(at, dur);
      if (!pr.on) return;
      ctx.font = font(size);
      const w = ctx.measureText(s).width + 44 * u;
      const h = size * 1.7 * u;
      // The seal sits 36 units past the cartouche, inside the width that's aligned.
      const left = leftOf(X(x), w + 36 * u, o.align);
      cartouche(left, Y(y), w, h, pr);
      ctx.save();
      ctx.globalAlpha = pr.color;
      text(ctx, s, left + 22 * u, Y(y) + h / 2, font(size), SUMI);
      // seal
      ctx.fillStyle = BLOCK.bad;
      ctx.fillRect(left + w + 10 * u, Y(y) + 4 * u, 26 * u, 26 * u);
      ctx.strokeStyle = CARD;
      ctx.lineWidth = 2 * u;
      ctx.strokeRect(left + w + 14 * u, Y(y) + 8 * u, 18 * u, 18 * u);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { size = 34, align = "center", tone = "ink", at = 0 } = o;
      const pr = press(at, o.dur ?? 0.45);
      if (!pr.on) return;
      ctx.font = font(size);
      const w = ctx.measureText(s).width + 22 * u;
      const h = size * 1.45 * u;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      cartouche(
        left,
        Y(y) - h / 2,
        w,
        h,
        pr,
        tone === "ink" || tone === "muted" ? SUMI : BLOCK[tone],
      );
      ctx.save();
      ctx.globalAlpha = pr.color;
      text(ctx, s, left + w / 2, Y(y), font(size), tone === "ink" ? SUMI : BLOCK[tone], "center");
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const pr = press(o.at, o.dur ?? 0.5);
      if (!pr.on) return;
      const R = r * u;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      if (pr.color > 0) {
        ctx.globalAlpha = pr.color;
        ctx.beginPath();
        ctx.arc(cx + pr.shift, cy + pr.shift, R, 0, Math.PI * 2);
        ctx.fillStyle = BLOCK[o.tone ?? "accent"];
        ctx.fill();
        // the whorl of a wave, carved into the block
        ctx.strokeStyle = alpha(CARD, 0.75);
        ctx.lineWidth = 1.6 * u;
        const sp: Pt[] = Array.from({ length: 40 }, (_, i) => {
          const a = (i / 40) * Math.PI * 5;
          const rr = (i / 40) * R * 0.8;
          return [cx + pr.shift + Math.cos(a) * rr, cy + pr.shift + Math.sin(a) * rr];
        });
        trace(ctx, sp);
        ctx.stroke();
      }
      ctx.globalAlpha = pr.key;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = SUMI;
      ctx.lineWidth = 3 * u;
      ctx.stroke();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const pr = press(o.at, o.dur ?? 0.7);
      if (!pr.on) return;
      cartouche(X(x), Y(y), X(w), Y(h), pr, o.tone ? BLOCK[o.tone] : SUMI);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const col = BLOCK[tone];
      trace(ctx, shown);
      ctx.strokeStyle = head ? SUMI : alpha(SUMI, 0.6);
      ctx.lineWidth = (head ? 9 : 4) * u;
      ctx.stroke();
      trace(ctx, shown);
      ctx.strokeStyle = col;
      ctx.lineWidth = (head ? 6 : 2) * u;
      ctx.stroke();
      if (head) {
        trace(ctx, shown);
        ctx.setLineDash([4 * u, 10 * u]);
        ctx.strokeStyle = alpha(CARD, 0.85);
        ctx.lineWidth = 1.6 * u;
        ctx.stroke();
        ctx.setLineDash([]);
        if (p >= 1) {
          const end = pts.at(-1) as Pt;
          const prev = pts.at(-3) as Pt;
          arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 20 * u, false);
          ctx.fillStyle = col;
          ctx.fill();
          ctx.strokeStyle = SUMI;
          ctx.lineWidth = 2.5 * u;
          ctx.stroke();
        }
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const pr = press(o.at, o.dur ?? 0.8);
      if (!pr.on) return;
      const [bx, by, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      ctx.save();
      if (pr.color > 0) {
        ctx.globalAlpha = pr.color;
        ctx.fillStyle = "#4A2E1E";
        ctx.fillRect(bx + pr.shift, by + pr.shift, bw, bh);
        // gold crests on the chest's drawers
        for (let i = 0; i < 3; i++) {
          const cy = by + pr.shift + (bh / 3) * (i + 0.5);
          ctx.strokeStyle = alpha(SUMI, 0.8);
          ctx.lineWidth = 2 * u;
          ctx.beginPath();
          ctx.moveTo(bx + pr.shift, by + pr.shift + (bh / 3) * i);
          ctx.lineTo(bx + pr.shift + bw, by + pr.shift + (bh / 3) * i);
          ctx.stroke();
          const r = Math.min(bw, bh / 3) * 0.28;
          ctx.fillStyle = "#D7A53F";
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(
              bx + pr.shift + bw / 2 + Math.cos(a) * r * 0.8,
              cy + Math.sin(a) * r * 0.8,
              r * 0.32,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(bx + pr.shift + bw / 2, cy, r * 0.45, 0, Math.PI * 2);
          ctx.fillStyle = "#4A2E1E";
          ctx.fill();
        }
      }
      ctx.globalAlpha = pr.key;
      ctx.strokeStyle = SUMI;
      ctx.lineWidth = 3 * u;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "accent" } = o;
      const pr = press(at, 0.5);
      if (!pr.on) return;
      const str = count ? counting(t, at, dur, count) + s : s;
      ctx.font = font(size, 700);
      const longest = count ? `${count[1]}${s}` : s;
      const w = ctx.measureText(longest).width + 50 * u;
      const h = size * (sub ? 1.9 : 1.4) * u;
      if (sub) cartouche(X(x) - w / 2, Y(y) - h / 2, w, h, pr, BLOCK[tone]);
      ctx.save();
      ctx.globalAlpha = pr.color;
      text(
        ctx,
        str,
        X(x),
        Y(y) - (sub ? size * 0.2 * u : 0),
        font(size, 700),
        BLOCK[tone] === BLOCK.accent ? SUMI : BLOCK[tone],
        "center",
      );
      if (sub) text(ctx, sub, X(x), Y(y) + size * 0.58 * u, font(size * 0.36), SUMI, "center");
      ctx.restore();
      if (sub && progress(t, at + dur, 0.6) > 0) {
        // a vermilion brush ring once the count lands
        const ring = ellipse(
          X(x),
          Y(y),
          w * 0.62,
          h * 0.66,
          48,
          -2.2,
          progress(t, at + dur, 0.6) * 1.05,
        );
        ctx.save();
        trace(ctx, ring);
        ctx.strokeStyle = alpha(BLOCK.bad, 0.85);
        ctx.lineWidth = 3 * u;
        ctx.stroke();
        ctx.restore();
      }
    },
    mark(kind, x, y, o = {}) {
      const pr = press(o.at, o.dur ?? 0.4);
      if (!pr.on) return;
      const r = (o.size ?? 30) * u;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.06);
      ctx.globalAlpha = pr.color;
      ctx.fillStyle = BLOCK.bad;
      ctx.fillRect(-r + pr.shift, -r + pr.shift, r * 2, r * 2);
      ctx.strokeStyle = CARD;
      ctx.lineWidth = 2 * u;
      ctx.strokeRect(-r * 0.78, -r * 0.78, r * 1.56, r * 1.56);
      ctx.lineWidth = 6 * u;
      ctx.lineCap = "square";
      if (kind === "check")
        trace(ctx, [
          [-r * 0.45, 0],
          [-r * 0.1, r * 0.35],
          [r * 0.5, -r * 0.4],
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(-r * 0.4, -r * 0.4);
        ctx.lineTo(r * 0.4, r * 0.4);
        ctx.moveTo(r * 0.4, -r * 0.4);
        ctx.lineTo(-r * 0.4, r * 0.4);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      // a hint of uneven pigment, the same every frame
      ctx.save();
      ctx.globalAlpha = 0.02;
      ctx.fillStyle = "#6B4A2A";
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.arc(hash(i * 7.1) * W, hash(i * 8.3) * H, (40 + hash(i) * 120) * u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  };
}

export default {
  id: "ukiyo-e",
  name: "Woodblock print",
  category: "Art & Design Movements",
  make,
} satisfies Style;
