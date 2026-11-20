// A hand-coloured copperplate from a naturalist's folio: foxed rag paper
// with a pressed plate mark, fine engraved line-work with hatching that
// follows each form, italic captions, and loose transparent watercolour
// washes that bleed in a beat after the lines are engraved.
import {
  along,
  type Cue,
  counting,
  curve,
  ellipse,
  expo,
  frame,
  hash,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const LINE = "#2B241C";
const WASH: Record<Tone, string> = {
  ink: "196,160,100",
  accent: "200,100,115",
  good: "120,160,105",
  bad: "200,50,45",
  muted: "150,140,125",
};
const TEXT: Record<Tone, string> = {
  ink: LINE,
  accent: "#6E2F36",
  good: "#3E5A33",
  bad: "#A3302A",
  muted: "#7A6E60",
};
const SERIF = '"Charis SIL", serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__botanical ??= new Map();
  const cache: Map<string, any> = g.__botanical;

  function plate() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      b.fillStyle = "#EEE3CA";
      b.fillRect(0, 0, W, H);
      b.filter = `blur(${3 * u}px)`;
      for (let i = 0; i < 40; i++) {
        b.fillStyle = `rgba(150,100,50,${0.08 + hash(i) * 0.12})`;
        b.beginPath();
        b.arc(hash(i * 1.7) * W, hash(i * 2.9) * H, (1.5 + hash(i * 3.1) * 5) * u, 0, Math.PI * 2);
        b.fill();
      }
      b.filter = `blur(${40 * u}px)`;
      for (let i = 0; i < 10; i++) {
        b.fillStyle = "rgba(170,130,70,0.05)";
        b.beginPath();
        b.arc(hash(i + 50) * W, hash(i + 60) * H, (80 + hash(i + 70) * 120) * u, 0, Math.PI * 2);
        b.fill();
      }
      b.filter = "none";
      for (let i = 0; i < (W * H) / 100; i++) {
        b.fillStyle = `rgba(120,95,60,${hash(i * 1.3) * 0.05})`;
        b.fillRect(hash(i * 0.7) * W, hash(i * 1.9 + 2) * H, u, u);
      }
      // The plate mark: a pressed, slightly darker rectangle with a bevel.
      const f = 18 * u;
      b.fillStyle = "rgba(120,90,50,0.05)";
      b.fillRect(f, f, W - 2 * f, H - 2 * f);
      b.strokeStyle = "rgba(255,250,235,0.7)";
      b.lineWidth = 2 * u;
      b.strokeRect(f + u, f + u, W - 2 * f, H - 2 * f);
      b.strokeStyle = "rgba(110,80,45,0.35)";
      b.lineWidth = 1.2 * u;
      b.strokeRect(f, f, W - 2 * f, H - 2 * f);
      // A double engraved rule inside it.
      const r = f + 14 * u;
      b.strokeStyle = LINE;
      b.lineWidth = 1.6 * u;
      b.strokeRect(r, r, W - 2 * r, H - 2 * r);
      b.lineWidth = 0.7 * u;
      b.strokeRect(r + 5 * u, r + 5 * u, W - 2 * r - 10 * u, H - 2 * r - 10 * u);
      b.font = `italic ${Math.round(13 * u)}px ${SERIF}`;
      b.fillStyle = LINE;
      b.textBaseline = "bottom";
      b.textAlign = "left";
      b.fillText("Vol. III.", r + 4 * u, r - 3 * u);
      b.textAlign = "right";
      b.fillText("Pl. XXV.", W - r - 4 * u, r - 3 * u);
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  /** An engraved line cut from `at` over `dur`. */
  function cut(points: Pt[], { at = 0, dur = 0.5, width = 1.3, color = LINE } = {}) {
    const p = progress(t, at, dur);
    if (p <= 0) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    trace(ctx, along(points, p).points);
    ctx.stroke();
    ctx.restore();
  }

  /** A watercolour wash bleeding into a shape a beat after its lines: soft, uneven, transparent. */
  function wash(path: () => void, at: number, tone: Tone, strength = 0.2) {
    const p = expo(progress(t, at, 0.6));
    if (p <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    for (let k = 0; k < 2; k++) {
      ctx.save();
      ctx.translate((k - 0.5) * 3 * u, (0.5 - k) * 2 * u);
      path();
      ctx.fillStyle = `rgba(${WASH[tone]},${strength * p * (k ? 0.6 : 1)})`;
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /** Engraved hatching across the shaded side of a shape, the strokes following its curve. */
  function hatch(
    clip: () => void,
    x0: number,
    y0: number,
    w: number,
    h: number,
    at: number,
    dense = 4.5,
  ) {
    const p = progress(t, at, 0.5);
    if (p <= 0) return;
    ctx.save();
    clip();
    ctx.clip();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 0.8 * u;
    ctx.globalAlpha = 0.9;
    const step = dense * u;
    const n = Math.ceil(w / step);
    for (let i = 0; i < n * p; i++) {
      const x = x0 + w - i * step;
      const f = i / n;
      // Lines are long on the dark side and shorten towards the light.
      const len = h * Math.max(0, 1 - f * 1.6);
      if (len <= 0) break;
      trace(ctx, curve([x, y0 + h - len], [x - step * 0.6, y0 + h], 0.08, 6));
      ctx.stroke();
    }
    ctx.restore();
  }

  function write(
    s: string,
    x: number,
    y: number,
    o: Cue & { size?: number; align?: string; italic?: boolean } = {},
  ) {
    const { at = 0, size = 28, tone = "ink", align = "left", italic = true } = o;
    const dur = o.dur ?? 0.04 * s.length + 0.15;
    const p = progress(t, at, dur);
    if (p <= 0) return 0;
    ctx.save();
    ctx.font = `${italic ? "italic " : ""}500 ${Math.round(size * u)}px ${SERIF}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.beginPath();
    ctx.rect(left - 4 * u, Y(y) - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = TEXT[tone];
    ctx.fillText(s, left, Y(y));
    ctx.restore();
    return w;
  }

  return {
    surface() {
      plate();
    },
    title(s, o = {}) {
      const { x = 0.07, y = 0.14, size = 58, at = 0 } = o;
      const w = write(s, x, y, { ...o, size, at, align: o.align ?? "left" });
      if (!w) return;
      const done = at + (o.dur ?? 0.04 * s.length + 0.15);
      const yy = Y(y) + size * 0.62 * u;
      cut(
        [
          [X(x) + w * 0.15, yy],
          [X(x) + w * 0.85, yy],
        ],
        { at: done, dur: 0.3, width: 0.9 },
      );
    },
    label(s, x, y, o = {}) {
      write(s, x, y, { size: 32, align: "center", ...o });
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.3, tone = "accent" } = o;
      const [cx, cy, R] = [X(x), Y(y), r * u];
      const ry = R * 1.15;
      const oval = () => {
        ctx.beginPath();
        ctx.ellipse(cx, cy, R, ry, 0, 0, Math.PI * 2);
      };
      wash(oval, at + dur + 0.1, tone);
      cut(ellipse(cx, cy, R, ry, 40), { at, dur, width: 1.4 });
      cut(ellipse(cx, cy, R + 3 * u, ry + 3 * u, 40), { at: at + 0.05, dur, width: 0.6 });
      hatch(oval, cx - R, cy - ry, R * 2, ry * 2, at + dur, 3.5);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "ink" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      wash(
        () => {
          ctx.beginPath();
          ctx.rect(x0, y0, x1 - x0, y1 - y0);
        },
        at + dur,
        tone,
        0.1,
      );
      cut(
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
          [x0, y0],
        ],
        { at, dur, width: 1.5 },
      );
      const d = 5 * u;
      cut(
        [
          [x0 + d, y0 + d],
          [x1 - d, y0 + d],
          [x1 - d, y1 - d],
          [x0 + d, y1 - d],
          [x0 + d, y0 + d],
        ],
        { at: at + 0.1, dur, width: 0.6 },
      );
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true, tone = "ink" } = o;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const color = tone === "bad" ? TEXT.bad : LINE;
      cut(shaft, {
        at,
        dur,
        width: head ? 1.3 : 0.6,
        color: tone === "accent" ? "rgba(43,36,28,0.55)" : color,
      });
      if (!head || t < at + dur) return;
      const end = shaft.at(-1) as Pt;
      const prev = shaft.at(-3) as Pt;
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 14 * u;
      ctx.save();
      ctx.fillStyle = color;
      trace(
        ctx,
        [
          end,
          [end[0] - Math.cos(a - 0.3) * s, end[1] - Math.sin(a - 0.3) * s],
          [end[0] - Math.cos(a) * s * 0.7, end[1] - Math.sin(a) * s * 0.7],
          [end[0] - Math.cos(a + 0.3) * s, end[1] - Math.sin(a + 0.3) * s],
        ],
        true,
      );
      ctx.fill();
      // Fletching at the tail.
      const s0 = shaft[0] as Pt;
      const s1 = shaft[2] as Pt;
      const b = Math.atan2(s1[1] - s0[1], s1[0] - s0[0]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.9 * u;
      for (let k = 0; k < 3; k++) {
        const bx = s0[0] + Math.cos(b) * k * 4 * u;
        const by = s0[1] + Math.sin(b) * k * 4 * u;
        trace(ctx, [
          [bx - Math.cos(b - 0.7) * 8 * u, by - Math.sin(b - 0.7) * 8 * u],
          [bx, by],
          [bx - Math.cos(b + 0.7) * 8 * u, by - Math.sin(b + 0.7) * 8 * u],
        ]);
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      // A specimen jar: lid band, shoulders, straight glass sides.
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const lid = (y1 - y0) * 0.14;
      const sh = (x1 - x0) * 0.15;
      const body: Pt[] = [
        [x0 + sh, y0 + lid],
        [x0, y0 + lid + sh],
        [x0, y1 - sh * 0.5],
        [x0 + sh * 0.5, y1],
        [x1 - sh * 0.5, y1],
        [x1, y1 - sh * 0.5],
        [x1, y0 + lid + sh],
        [x1 - sh, y0 + lid],
        [x0 + sh, y0 + lid],
      ];
      const glass = () => trace(ctx, body, true);
      wash(glass, at + dur, "good", 0.12);
      cut(body, { at, dur: dur * 0.7, width: 1.4 });
      cut(
        [
          [x0 + sh * 0.6, y0],
          [x1 - sh * 0.6, y0],
          [x1 - sh * 0.6, y0 + lid],
          [x0 + sh * 0.6, y0 + lid],
          [x0 + sh * 0.6, y0],
        ],
        { at: at + dur * 0.5, dur: dur * 0.3, width: 1.2 },
      );
      hatch(
        () => {
          ctx.beginPath();
          ctx.rect(x0 + sh * 0.6, y0, x1 - x0 - sh * 1.2, lid);
        },
        x0 + sh * 0.6,
        y0,
        x1 - x0 - sh * 1.2,
        lid,
        at + dur * 0.8,
        3,
      );
      hatch(glass, x0, y0 + lid, x1 - x0, y1 - y0 - lid, at + dur * 0.8, 4);
      // A glint on the glass.
      if (t >= at + dur) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,252,240,0.85)";
        ctx.lineWidth = 3 * u;
        trace(ctx, [
          [x0 + sh * 0.9, y0 + lid + sh * 1.6],
          [x0 + sh * 0.9, y1 - sh * 1.6],
        ]);
        ctx.stroke();
        ctx.restore();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const [cx, cy] = [X(x), Y(y)];
      if (size >= 80) {
        // An engraved cartouche with small curls, then a loose red ring when it lands.
        const rx = size * 1.25 * u;
        const ry = size * 0.95 * u;
        const oval = () => {
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        };
        wash(oval, at + 0.3, "ink", 0.2);
        cut(ellipse(cx, cy, rx, ry, 60), { at, dur: 0.4, width: 1.6 });
        cut(ellipse(cx, cy, rx - 5 * u, ry - 5 * u, 60), { at: at + 0.05, dur: 0.4, width: 0.6 });
        for (const sx of [-1, 1]) {
          if (t < at + 0.4) break;
          ctx.save();
          ctx.strokeStyle = LINE;
          ctx.lineWidth = 1.2 * u;
          ctx.beginPath();
          ctx.arc(cx + sx * (rx + 6 * u), cy - ry * 0.5, 6 * u, 0, Math.PI * 1.6);
          ctx.stroke();
          ctx.restore();
        }
        const rp = progress(t, at + dur, 0.5);
        if (rp > 0) {
          ctx.save();
          ctx.globalCompositeOperation = "multiply";
          ctx.strokeStyle = `rgba(${WASH.bad},0.45)`;
          ctx.lineWidth = 6 * u;
          ctx.lineCap = "round";
          trace(
            ctx,
            along(
              ellipse(cx + 4 * u, cy - 2 * u, rx * 1.12, ry * 1.18, 60, -Math.PI * 0.6, 1.08),
              rp,
            ).points,
          );
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.save();
      ctx.globalAlpha = progress(t, at, 0.25);
      ctx.font = `500 ${Math.round(size * (size >= 80 ? 0.72 : 1) * u)}px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = LINE;
      ctx.fillText(value, cx, cy + (size >= 80 ? size * 0.15 * u : 0));
      ctx.restore();
      if (sub)
        write(sub, x, y - (size * (size >= 80 ? 0.42 : 0.8) * u) / H, {
          at: at + 0.1,
          size: size * 0.27,
          align: "center",
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 30) * u;
      const [cx, cy] = [X(x), Y(y)];
      const at = o.at ?? 0;
      const tone: Tone = kind === "check" ? "good" : "bad";
      wash(
        () => {
          ctx.beginPath();
          ctx.ellipse(cx, cy, s * 0.8, s * 0.6, -0.3, 0, Math.PI * 2);
        },
        at + 0.25,
        tone,
        0.35,
      );
      if (kind === "check")
        cut(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.1, cy + s * 0.4],
            [cx + s * 0.6, cy - s * 0.5],
          ],
          { at, dur: 0.25, width: 2 },
        );
      else {
        cut(
          [
            [cx - s * 0.45, cy - s * 0.45],
            [cx + s * 0.45, cy + s * 0.45],
          ],
          { at, dur: 0.12, width: 2 },
        );
        cut(
          [
            [cx + s * 0.45, cy - s * 0.45],
            [cx - s * 0.45, cy + s * 0.45],
          ],
          { at: at + 0.12, dur: 0.12, width: 2 },
        );
      }
    },
    finish() {},
  };
}

export default {
  id: "botanical-plate",
  name: "Botanical plate",
  category: "Illustration",
  make,
} satisfies Style;
