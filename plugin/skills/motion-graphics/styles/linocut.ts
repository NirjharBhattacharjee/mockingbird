// Linocut relief print: a dense black block on cream rice paper, everything
// cut out of it as tapering white gouge strokes, a red reduction layer for
// the idea and the correction, salty uneven ink, and the printer's pencil
// edition number in the margin. Each element is pulled as a proof: it peels
// on diagonally, and numbers are re-cut on twos.
import {
  along,
  clamp,
  counting,
  curve,
  ellipse,
  frame,
  hash,
  type Look,
  leftOf,
  type Pt,
  roughen,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const PAPER = "#EDE4CF";
const BLOCK = "#1D1A18";
const CUT = "#EFE5CC";
const RED = "#D2483A";
const COL: Record<Tone, string> = { ink: CUT, accent: RED, good: CUT, bad: RED, muted: "#9C9384" };
const CAPS = '"Arvo", serif';
const PENCIL = '"Caveat", cursive';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const tq = Math.floor(t * 12) / 12;
  const g = globalThis as any;
  g.__linoSalt ??= new Map();
  const cache: Map<string, any> = g.__linoSalt;
  // The block's edge, in pixels.
  const bx = W * 0.02;
  const by = H * 0.025;
  const bw = W * 0.96;
  const bh = H * 0.87;

  /** Peel a proof on: a diagonal wipe from the top-left corner over `dur`. */
  function peeled(
    x: number,
    y: number,
    w: number,
    h: number,
    at: number,
    dur: number,
    draw: () => void,
  ) {
    const p = clamp((t - at) / dur);
    if (p <= 0) return;
    ctx.save();
    if (p < 1) {
      const d = (w + h) * p * 1.05;
      ctx.beginPath();
      ctx.moveTo(x - 10 * u, y - 10 * u);
      ctx.lineTo(x + d, y - 10 * u);
      ctx.lineTo(x - 10 * u, y + d);
      ctx.closePath();
      ctx.clip();
    }
    draw();
    ctx.restore();
  }

  /** A gouge stroke: a filled sliver thick in the middle, tapering to points at both ends. */
  function gouge(points: Pt[], width: number, color: string) {
    if (points.length < 2) return;
    const left: Pt[] = [];
    const right: Pt[] = [];
    points.forEach((pt, i) => {
      const a = points[Math.max(0, i - 1)] as Pt;
      const b = points[Math.min(points.length - 1, i + 1)] as Pt;
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
      const f = i / (points.length - 1);
      const w = (width / 2) * Math.sin(Math.PI * Math.min(1, 0.15 + f * 0.85)) + 0.6 * u;
      left.push([pt[0] + Math.cos(ang) * w, pt[1] + Math.sin(ang) * w]);
      right.push([pt[0] - Math.cos(ang) * w, pt[1] - Math.sin(ang) * w]);
    });
    trace(ctx, [...left, ...right.reverse()], true);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function caps(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align = "center",
    spacing = 0.12,
  ) {
    ctx.font = `900 ${Math.round(size * u)}px ${CAPS}`;
    ctx.letterSpacing = `${(size * spacing * u).toFixed(1)}px`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(s.toUpperCase(), x, y);
    ctx.letterSpacing = "0px";
  }

  function saltTile() {
    const key = `${W}x${H}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      // Salty ink: tiny paper flecks showing through the black.
      c.beginPath();
      c.rect(bx, by, bw, bh);
      c.clip();
      for (let i = 0; i < (W * H) / 120; i++) {
        c.fillStyle = `rgba(237,228,207,${0.2 + 0.55 * hash(i * 0.61)})`;
        const s = 1 + hash(i * 4.4) * 2;
        c.fillRect(hash(i * 1.71) * W, hash(i * 2.39) * H, s, s * (0.5 + hash(i)));
      }
      cache.set(key, tile);
    }
    return tile;
  }

  let titleText = "";

  return {
    surface() {
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      // Rice paper fibres.
      ctx.strokeStyle = "rgba(150,130,100,0.12)";
      ctx.lineWidth = 1 * u;
      for (let i = 0; i < 60; i++) {
        const x = hash(i * 3.7) * W;
        const y = hash(i * 5.3) * H;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(
          x + 20 * u,
          y + (hash(i) - 0.5) * 20 * u,
          x + (30 + 40 * hash(i + 1)) * u,
          y + (hash(i + 2) - 0.5) * 10 * u,
        );
        ctx.stroke();
      }
      // The black block, edges a touch uneven.
      const edge: Pt[] = [
        ...Array.from({ length: 21 }, (_, i) => [bx + (bw * i) / 20, by] as Pt),
        ...Array.from({ length: 11 }, (_, i) => [bx + bw, by + (bh * i) / 10] as Pt),
        ...Array.from({ length: 21 }, (_, i) => [bx + bw - (bw * i) / 20, by + bh] as Pt),
        ...Array.from({ length: 11 }, (_, i) => [bx, by + bh - (bh * i) / 10] as Pt),
      ];
      trace(ctx, roughen(edge, 1.6 * u, 3), true);
      ctx.fillStyle = BLOCK;
      ctx.fill();
      // A carved border line just inside the edge.
      ctx.strokeStyle = CUT;
      ctx.lineWidth = 2.5 * u;
      trace(
        ctx,
        roughen(
          edge.map(
            ([x, y]) => [x + (x < W / 2 ? 12 : -12) * u, y + (y < H / 2 ? 12 : -12) * u] as Pt,
          ),
          1.2 * u,
          9,
        ),
        true,
      );
      ctx.stroke();
      // Background carving: a few sparse parallel gouges for texture.
      for (let i = 0; i < 26; i++) {
        const x = bx + 30 * u + hash(i * 7.1) * (bw - 60 * u);
        const y = by + 40 * u + hash(i * 3.9) * (bh - 80 * u);
        const L = (18 + 30 * hash(i)) * u;
        const a = -0.5 + hash(i * 1.3) * 0.3;
        gouge(
          [
            [x, y],
            [x + Math.cos(a) * L * 0.5, y + Math.sin(a) * L * 0.5],
            [x + Math.cos(a) * L, y + Math.sin(a) * L],
          ],
          3 * u,
          "rgba(239,229,204,0.5)",
        );
      }
    },
    title(s, o = {}) {
      titleText = s;
      const { x = 0.035, y = 0.075, size = 38, at = 0, dur = 0.6 } = o;
      ctx.save();
      ctx.font = `900 ${Math.round(size * u)}px ${CAPS}`;
      ctx.letterSpacing = `${(size * 0.12 * u).toFixed(1)}px`;
      const w = ctx.measureText(s.toUpperCase()).width + 40 * u;
      ctx.restore();
      const h = size * 1.5 * u;
      const l = leftOf(X(x), w, o.align);
      const tp = Y(y) - h / 2;
      peeled(l, tp, w, h, at, dur, () => {
        // The red reduction banner with cream letters cut out of it.
        trace(
          ctx,
          roughen(
            [
              [l, tp],
              [l + w, tp],
              [l + w, tp + h],
              [l, tp + h],
            ],
            1.5 * u,
            2,
          ),
          true,
        );
        ctx.fillStyle = RED;
        ctx.fill();
        caps(s, l + 20 * u, Y(y) + 2 * u, size, CUT, "left");
      });
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 22, tone = "ink", align = "center" } = o;
      const w = s.length * size * 0.9 * u;
      peeled(X(x) - w / 2, Y(y) - size * u, w, size * 2 * u, at, 0.3, () =>
        caps(s, X(x), Y(y), size, COL[tone], align),
      );
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const R = r * u;
      const cx = X(x);
      const cy = Y(y);
      peeled(cx - R * 1.5, cy - R * 1.5, R * 3, R * 3, at, 0.25, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = COL[tone];
        ctx.fill();
        // A cut ring and a few short rays, the way a carver shows it glowing.
        gouge(ellipse(cx, cy, R, R, 24, -Math.PI / 2, 0.92), 3.5 * u, CUT);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + hash(x * 9 + i);
          gouge(
            [
              [cx + Math.cos(a) * R * 1.2, cy + Math.sin(a) * R * 1.2],
              [cx + Math.cos(a) * R * 1.55, cy + Math.sin(a) * R * 1.55],
            ],
            2.5 * u,
            CUT,
          );
        }
      });
    },
    box(x, y, w, h, o = {}) {
      // A cream proof card printed into the block, with a ragged edge.
      const { at = 0, tone = "ink" } = o;
      const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
      peeled(l - 6 * u, tp - 6 * u, ww + 12 * u, hh + 12 * u, at, 0.5, () => {
        trace(
          ctx,
          roughen(
            [
              [l, tp],
              [l + ww / 2, tp],
              [l + ww, tp],
              [l + ww, tp + hh / 2],
              [l + ww, tp + hh],
              [l + ww / 2, tp + hh],
              [l, tp + hh],
              [l, tp + hh / 2],
            ],
            2.2 * u,
            x * 13,
          ),
          true,
        );
        ctx.fillStyle = CUT;
        ctx.fill();
        if (tone === "good" || tone === "bad" || tone === "accent") {
          ctx.fillStyle = RED;
          ctx.fillRect(l, tp + hh - 12 * u, ww, 12 * u);
        }
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      // Gouged channels: thick, tapering, cut along the path.
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = clamp((tq - at) / dur);
      if (p <= 0) return;
      const pts = roughen(
        curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 24),
        1 * u,
        x1 * 31 + y2 * 17,
      );
      const res = along(pts, p);
      const color = tone === "bad" ? RED : head ? CUT : "rgba(239,229,204,0.55)";
      gouge(res.points, (head ? 7 : 2.4) * u, color);
      if (head && p >= 1) {
        const tip = pts.at(-1) as Pt;
        const s = 18 * u;
        trace(
          ctx,
          [
            [tip[0] + Math.cos(res.angle) * 4 * u, tip[1] + Math.sin(res.angle) * 4 * u],
            [tip[0] - Math.cos(res.angle - 0.5) * s, tip[1] - Math.sin(res.angle - 0.5) * s],
            [tip[0] - Math.cos(res.angle + 0.5) * s, tip[1] - Math.sin(res.angle + 0.5) * s],
          ],
          true,
        );
        ctx.fillStyle = color;
        ctx.fill();
      }
    },
    store(x, y, w, h, o = {}) {
      // A pile of cream picture cards, each with a red caption strip.
      const { at = 0, dur = 0.8 } = o;
      for (let i = 0; i < 3; i++) {
        const cw = X(w) * 0.9;
        const ch = Y(h) * 0.55;
        const l = X(x) + (i - 1) * 12 * u + (X(w) - cw) / 2;
        const tp = Y(y) + i * Y(h) * 0.22;
        peeled(l - 4 * u, tp - 4 * u, cw + 8 * u, ch + 8 * u, at + (i * dur) / 4, 0.3, () => {
          trace(
            ctx,
            roughen(
              [
                [l, tp],
                [l + cw, tp],
                [l + cw, tp + ch],
                [l, tp + ch],
              ],
              1.6 * u,
              i * 7 + 1,
            ),
            true,
          );
          ctx.fillStyle = CUT;
          ctx.fill();
          ctx.fillStyle = RED;
          ctx.fillRect(l, tp + ch * 0.72, cw, ch * 0.28);
          ctx.strokeStyle = BLOCK;
          ctx.lineWidth = 3 * u;
          ctx.beginPath();
          ctx.arc(l + cw / 2, tp + ch * 0.36, ch * 0.2, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at) return;
      const value = count ? counting(tq, at, dur, count) + s : s;
      // Re-cut each step: a slight wobble from one carving to the next.
      const j = (hash(Math.floor(t * 12) + x * 50) - 0.5) * 2 * u;
      const inBox = size < 80;
      peeled(X(x) - size * 2 * u, Y(y) - size * u, size * 4 * u, size * 2 * u, at, 0.3, () => {
        caps(
          value,
          X(x) + j,
          Y(y) - j,
          size,
          inBox ? BLOCK : tone === "accent" ? CUT : COL[tone],
          "center",
          0.02,
        );
        if (sub) caps(sub, X(x), Y(y) - size * 0.82 * u, size * 0.24, CUT, "center", 0.3);
        if (!inBox && count && t > at + dur) {
          // A red carved underline once it lands.
          ctx.fillStyle = RED;
          ctx.fillRect(X(x) - size * 0.9 * u, Y(y) + size * 0.62 * u, size * 1.8 * u, 7 * u);
        }
      });
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const s = (o.size ?? 30) * u;
      const cx = X(x);
      const cy = Y(y);
      const p = clamp((tq - at) / 0.3);
      if (p <= 0) return;
      if (kind === "check")
        gouge(
          along(
            [
              [cx - s * 0.5, cy],
              [cx - s * 0.1, cy + s * 0.45],
              [cx + s * 0.6, cy - s * 0.55],
            ],
            p,
          ).points,
          9 * u,
          RED,
        );
      else {
        gouge(
          along(
            [
              [cx - s * 0.5, cy - s * 0.5],
              [cx + s * 0.5, cy + s * 0.5],
            ],
            p,
          ).points,
          9 * u,
          RED,
        );
        if (p > 0.5)
          gouge(
            [
              [cx + s * 0.5, cy - s * 0.5],
              [cx - s * 0.5, cy + s * 0.5],
            ],
            9 * u,
            RED,
          );
      }
    },
    finish() {
      ctx.drawImage(saltTile(), 0, 0);
      // Pencil in the margin: the title on the left, the edition on the right.
      ctx.save();
      ctx.font = `italic 400 ${Math.round(20 * u)}px ${PENCIL}`;
      ctx.fillStyle = "rgba(90,84,76,0.75)";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      if (titleText) ctx.fillText(titleText, bx + 8 * u, by + bh + 26 * u);
      ctx.textAlign = "right";
      ctx.fillText(
        `proof ${1 + Math.min(4, Math.floor(t / 2))}/5`,
        bx + bw - 8 * u,
        by + bh + 26 * u,
      );
      ctx.restore();
    },
  };
}

export default { id: "linocut", name: "Linocut print", category: "Print", make } satisfies Style;
