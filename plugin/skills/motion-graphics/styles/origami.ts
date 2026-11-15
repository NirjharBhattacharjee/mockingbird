// Folded paper on a seamless studio sweep: flat facets lit from one side,
// crisp creases, two-tone paper and soft table shadows. Pieces fold up from
// flat; labels are printed on little tent cards; links are creased arrows.
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
  spring,
  type Tone,
  trace,
} from "./look.ts";

/** Paper colours per tone: [lit face, shade face]. */
const PAPER: Record<Tone, [string, string]> = {
  ink: ["#EDE6D8", "#CFC6B4"],
  accent: ["#E8806A", "#C45E4C"],
  good: ["#2E8C84", "#1F6A64"],
  bad: ["#D8433A", "#A82E28"],
  muted: ["#D9A440", "#B07F26"],
};
const INK = "#26262B";
const TEXT: Record<Tone, string> = {
  ink: INK,
  accent: "#D2533E",
  good: "#23807A",
  bad: "#C8372E",
  muted: "#9C7A2A",
};
const FACE = '"Avenir Next", "Futura", "Helvetica Neue", Arial, sans-serif';
// Light from the upper left.
const LIGHT: Pt = [-0.6, -0.8];

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__origami ??= new Map();
  const cache: Map<string, any> = g.__origami;

  /** How far a piece has folded up: 0 flat, 1 standing, with a little spring. */
  const fold = (at: number) => (t < at ? 0 : spring(t, { start: at, stiffness: 150, damping: 13 }));

  /** A soft contact shadow on the table under a piece. */
  function shadow(cx: number, cy: number, rx: number, k = 1) {
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    gr.addColorStop(0, `rgba(40,40,50,${0.28 * k})`);
    gr.addColorStop(1, "rgba(40,40,50,0)");
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.22);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Shade a facet by how much it faces the light: mix the lit and shade colours. */
  function facet(pts: Pt[], tone: Tone) {
    const [a, b, c] = pts as [Pt, Pt, Pt];
    // A pseudo-normal from the facet's centroid direction away from the piece centre.
    const nx = (a[0] + b[0] + c[0]) / 3;
    const ny = (a[1] + b[1] + c[1]) / 3;
    return { pts, nx, ny, tone };
  }

  function mix(c1: string, c2: string, f: number) {
    const p = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
    const [r1, g1, b1] = p(c1) as [number, number, number];
    const [r2, g2, b2] = p(c2) as [number, number, number];
    const k = clamp(f);
    return `rgb(${Math.round(r1 + (r2 - r1) * k)},${Math.round(g1 + (g2 - g1) * k)},${Math.round(b1 + (b2 - b1) * k)})`;
  }

  /** A faceted paper ball: a ring of triangles round a centre, each lit by its direction. */
  function ball(cx: number, cy: number, R: number, tone: Tone, f: number, seed: number) {
    const ry = R * (0.2 + 0.8 * f);
    const n = 9;
    const ring = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + seed;
      const rr = 1 + (hash(seed * 10 + i) - 0.5) * 0.12;
      return [cx + Math.cos(a) * R * rr, cy - ry * 0.05 + Math.sin(a) * ry * rr] as Pt;
    });
    const inner = Array.from({ length: n }, (_, i) => {
      const a = ((i + 0.5) / n) * Math.PI * 2 + seed;
      return [cx + Math.cos(a) * R * 0.55, cy - ry * 0.12 + Math.sin(a) * ry * 0.55] as Pt;
    });
    const top: Pt = [cx - R * 0.12, cy - ry * 0.2];
    const faces = [];
    for (let i = 0; i < n; i++) {
      const a = ring[i] as Pt;
      const b = ring[(i + 1) % n] as Pt;
      const c = inner[i] as Pt;
      const d = inner[(i + 1) % n] as Pt;
      faces.push(facet([a, b, c], tone), facet([b, d, c], tone), facet([c, d, top], tone));
    }
    const [lit, shade] = PAPER[tone];
    for (const fc of faces) {
      const dx = (fc.nx - cx) / R;
      const dy = (fc.ny - cy) / Math.max(1, ry);
      const facing = -(dx * LIGHT[0] + dy * LIGHT[1]);
      ctx.fillStyle = mix(shade, lit, 0.5 + facing * 0.6 + (hash(fc.nx + fc.ny) - 0.5) * 0.15);
      trace(ctx, fc.pts, true);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = Math.max(0.5, 0.6 * u);
      ctx.stroke();
    }
  }

  /** A tent card standing on the table: a lit front, a darker top fold, folding up from flat. */
  function tent(x0: number, y0: number, w: number, h: number, tone: Tone, f: number) {
    const hh = h * f;
    const yb = y0 + h;
    shadow(x0 + w / 2 + 10 * u, yb, w * 0.6, f);
    const [lit, shade] = PAPER[tone];
    // The back slope peeking above.
    ctx.fillStyle = shade;
    trace(
      ctx,
      [
        [x0 + 6 * u, yb - hh - 6 * u * f],
        [x0 + w + 8 * u, yb - hh - 4 * u * f],
        [x0 + w, yb - hh],
        [x0, yb - hh],
      ],
      true,
    );
    ctx.fill();
    const gr = ctx.createLinearGradient(x0, yb - hh, x0 + w, yb);
    gr.addColorStop(0, lit);
    gr.addColorStop(1, mix(lit, shade, 0.35));
    ctx.fillStyle = gr;
    trace(
      ctx,
      [
        [x0, yb - hh],
        [x0 + w, yb - hh],
        [x0 + w + 4 * u, yb],
        [x0 - 4 * u, yb],
      ],
      true,
    );
    ctx.fill();
    // The crease along the top.
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.moveTo(x0, yb - hh);
    ctx.lineTo(x0 + w, yb - hh);
    ctx.stroke();
    return { top: yb - hh, bottom: yb };
  }

  function printed(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: Align,
    weight = 700,
  ) {
    ctx.font = `${weight} ${Math.round(size * u)}px ${FACE}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s, x, y);
    return ctx.measureText(s).width;
  }

  return {
    surface() {
      const key = `${W}x${H}`;
      let img = cache.get(key);
      if (!img) {
        img = new OffscreenCanvas(W, H);
        const c = img.getContext("2d");
        const gr = c.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, "#C9CCCB");
        gr.addColorStop(0.55, "#E4E5E2");
        gr.addColorStop(1, "#D5D6D2");
        c.fillStyle = gr;
        c.fillRect(0, 0, W, H);
        const key2 = c.createRadialGradient(
          W * 0.35,
          H * 0.3,
          0,
          W * 0.35,
          H * 0.3,
          Math.max(W, H) * 0.8,
        );
        key2.addColorStop(0, "rgba(255,255,250,0.55)");
        key2.addColorStop(1, "rgba(255,255,250,0)");
        c.fillStyle = key2;
        c.fillRect(0, 0, W, H);
        cache.set(key, img);
      }
      ctx.drawImage(img, 0, 0);
    },
    title(s, o = {}) {
      // Printed on a big tent card that folds up.
      const { x = 0.04, y = 0.06, size = 50, at = 0, tone = "ink", align = "left" } = o;
      const f = fold(at);
      if (f <= 0) return;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${FACE}`;
      const w = ctx.measureText(s).width + size * 1.2 * u;
      ctx.restore();
      const h = size * 1.7 * u;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      const r = tent(left, Y(y), w, h, "ink", f);
      if (f > 0.6) {
        ctx.save();
        ctx.globalAlpha = clamp((f - 0.6) * 2.5);
        printed(
          s,
          left + size * 0.6 * u,
          (r.top + r.bottom) / 2,
          size,
          TEXT[tone === "ink" ? "accent" : tone],
          "left",
        );
        ctx.restore();
      }
    },
    label(s, x, y, o = {}) {
      // A small paper tag lying on the table, slightly turned.
      const size = o.size ?? 26;
      const f = fold(o.at ?? 0);
      if (f <= 0) return;
      const tone = o.tone ?? "ink";
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${FACE}`;
      const w = ctx.measureText(s).width + size * 0.9 * u;
      const h = size * 1.4 * u;
      const align = o.align ?? "center";
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      ctx.translate(left + w / 2, Y(y));
      ctx.rotate((hash(x * 13 + y * 7) - 0.5) * 0.1);
      ctx.scale(1, f);
      ctx.shadowColor = "rgba(40,40,50,0.3)";
      ctx.shadowBlur = 6 * u;
      ctx.shadowOffsetY = 3 * u;
      ctx.fillStyle = PAPER.ink[0];
      trace(
        ctx,
        [
          [-w / 2, -h / 2],
          [w / 2, -h / 2],
          [w / 2 + 6 * u, h / 2],
          [-w / 2 - 2 * u, h / 2],
        ],
        true,
      );
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      trace(
        ctx,
        [
          [0, -h / 2],
          [w / 2, -h / 2],
          [w / 2 + 6 * u, h / 2],
          [0, h / 2],
        ],
        true,
      );
      ctx.fill();
      printed(s, 0, size * 0.04 * u, size, TEXT[tone], "center");
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const f = fold(at);
      if (f <= 0) return;
      const R = r * 1.1 * u;
      shadow(X(x) + R * 0.4, Y(y) + R * 0.9, R * 1.3, f);
      ball(X(x), Y(y), R, tone, f, hash(x * 7 + y * 3) * 2);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const f = fold(at);
      if (f <= 0) return;
      tent(X(x), Y(y), X(w), Y(h), "ink", f);
      if (tone !== "ink") {
        ctx.fillStyle = PAPER[tone][0];
        const hh = Y(h) * f;
        ctx.fillRect(X(x), Y(y + h) - hh, X(w), 6 * u * f);
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      // A creased paper arrow lying flat: two halves of a ribbon, lit and shaded, then a folded head.
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "muted" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * (1 - (1 - p) ** 2))));
      const thin = !head && tone === "accent";
      const t2: Tone = tone === "ink" ? "muted" : tone;
      const [lit, shade] = PAPER[t2];
      const w = (thin ? 2 : 7) * u;
      ctx.save();
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      if (thin) {
        trace(ctx, shown);
        ctx.strokeStyle = "rgba(60,60,70,0.4)";
        ctx.lineWidth = w;
        ctx.stroke();
        ctx.restore();
        return;
      }
      ctx.shadowColor = "rgba(40,40,50,0.3)";
      ctx.shadowBlur = 5 * u;
      ctx.shadowOffsetY = 3 * u;
      trace(ctx, shown);
      ctx.strokeStyle = shade;
      ctx.lineWidth = w * 2;
      ctx.stroke();
      ctx.shadowColor = "transparent";
      ctx.translate(0, -w * 0.5);
      trace(ctx, shown);
      ctx.strokeStyle = lit;
      ctx.lineWidth = w;
      ctx.stroke();
      ctx.translate(0, w * 0.5);
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 26 * u;
        const tip: Pt = [end[0] + Math.cos(a) * s * 0.6, end[1] + Math.sin(a) * s * 0.6];
        const l: Pt = [
          end[0] + Math.cos(a - Math.PI / 2) * s * 0.6,
          end[1] + Math.sin(a - Math.PI / 2) * s * 0.6,
        ];
        const rr: Pt = [
          end[0] + Math.cos(a + Math.PI / 2) * s * 0.6,
          end[1] + Math.sin(a + Math.PI / 2) * s * 0.6,
        ];
        ctx.fillStyle = lit;
        trace(ctx, [tip, l, end], true);
        ctx.fill();
        ctx.fillStyle = shade;
        trace(ctx, [tip, end, rr], true);
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      // A folded hexagonal box standing on the table: three visible faces.
      const { at = 0, tone = "good" } = o;
      const f = fold(at);
      if (f <= 0) return;
      const [x0, bw] = [X(x), X(w)];
      const yb = Y(y + h);
      const hh = Y(h) * f;
      const cx = x0 + bw / 2;
      const d = bw * 0.22;
      shadow(cx + bw * 0.3, yb, bw * 0.9, f);
      const [lit, shade] = PAPER[tone];
      const yt = yb - hh;
      ctx.fillStyle = mix(lit, "#FFFFFF", 0.15);
      trace(
        ctx,
        [
          [x0, yt],
          [x0 + bw * 0.25, yt - d],
          [x0 + bw * 0.75, yt - d],
          [x0 + bw, yt],
          [x0 + bw * 0.75, yt + d * 0.5],
          [x0 + bw * 0.25, yt + d * 0.5],
        ],
        true,
      );
      ctx.fill();
      ctx.fillStyle = lit;
      trace(
        ctx,
        [
          [x0, yt],
          [x0 + bw * 0.25, yt + d * 0.5],
          [x0 + bw * 0.25, yb + d * 0.5],
          [x0, yb],
        ],
        true,
      );
      ctx.fill();
      ctx.fillStyle = mix(lit, shade, 0.45);
      trace(
        ctx,
        [
          [x0 + bw * 0.25, yt + d * 0.5],
          [x0 + bw * 0.75, yt + d * 0.5],
          [x0 + bw * 0.75, yb + d * 0.5],
          [x0 + bw * 0.25, yb + d * 0.5],
        ],
        true,
      );
      ctx.fill();
      ctx.fillStyle = shade;
      trace(
        ctx,
        [
          [x0 + bw * 0.75, yt + d * 0.5],
          [x0 + bw, yt],
          [x0 + bw, yb],
          [x0 + bw * 0.75, yb + d * 0.5],
        ],
        true,
      );
      ctx.fill();
      // Fold lines across the middle face.
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = u;
      for (const k of [0.33, 0.66]) {
        ctx.beginPath();
        ctx.moveTo(x0, yt + hh * k);
        ctx.lineTo(x0 + bw * 0.25, yt + hh * k + d * 0.5);
        ctx.lineTo(x0 + bw * 0.75, yt + hh * k + d * 0.5);
        ctx.lineTo(x0 + bw, yt + hh * k);
        ctx.stroke();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      const f = fold(at);
      if (f <= 0) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      if (sub) {
        // Its own tent card.
        ctx.save();
        ctx.font = `700 ${Math.round(size * u)}px ${FACE}`;
        const w = Math.max(ctx.measureText(value).width, size * 2.2 * u) + size * 0.6 * u;
        ctx.restore();
        const h = size * 1.9 * u;
        const r = tent(X(x) - w / 2, Y(y) - h * 0.45, w, h, "ink", f);
        if (f > 0.6) {
          ctx.save();
          ctx.globalAlpha = clamp((f - 0.6) * 2.5);
          printed(sub, X(x), r.top + size * 0.35 * u, size * 0.3, TEXT.good, "center", 600);
          printed(
            value,
            X(x),
            r.top + size * 1.05 * u,
            size,
            TEXT[tone === "ink" ? "accent" : tone],
            "center",
          );
          ctx.restore();
        }
        return;
      }
      ctx.save();
      ctx.globalAlpha = clamp(f * 1.5);
      printed(value, X(x), Y(y), size, TEXT[tone], "center");
      ctx.restore();
    },
    mark(kind, x, y, o = {}) {
      // A folded paper tick or cross: two creased strips.
      const s = (o.size ?? 34) * u;
      const f = fold(o.at ?? 0);
      if (f <= 0) return;
      const [lit, shade] = PAPER[o.tone ?? (kind === "check" ? "good" : "bad")];
      const [cx, cy] = [X(x), Y(y)];
      const strip = (a: Pt, b: Pt) => {
        ctx.lineCap = "butt";
        ctx.strokeStyle = shade;
        ctx.lineWidth = 11 * u;
        trace(ctx, [a, b]);
        ctx.stroke();
        ctx.strokeStyle = lit;
        ctx.lineWidth = 5 * u;
        trace(ctx, [
          [a[0], a[1] - 2.5 * u],
          [b[0], b[1] - 2.5 * u],
        ]);
        ctx.stroke();
      };
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, f);
      ctx.translate(-cx, -cy);
      ctx.shadowColor = "rgba(40,40,50,0.3)";
      ctx.shadowBlur = 5 * u;
      ctx.shadowOffsetY = 3 * u;
      if (kind === "check") {
        strip([cx - s * 0.5, cy], [cx - s * 0.1, cy + s * 0.4]);
        strip([cx - s * 0.1, cy + s * 0.4], [cx + s * 0.6, cy - s * 0.5]);
      } else {
        strip([cx - s * 0.5, cy - s * 0.5], [cx + s * 0.5, cy + s * 0.5]);
        strip([cx + s * 0.5, cy - s * 0.5], [cx - s * 0.5, cy + s * 0.5]);
      }
      ctx.restore();
    },
    finish() {
      const gr = ctx.createRadialGradient(
        W / 2,
        H * 0.45,
        Math.min(W, H) * 0.4,
        W / 2,
        H / 2,
        Math.hypot(W, H) * 0.6,
      );
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, "rgba(40,40,50,0.18)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    },
  };
}

export default {
  id: "origami",
  name: "Folded paper",
  category: "Paper & Craft",
  make,
} satisfies Style;
