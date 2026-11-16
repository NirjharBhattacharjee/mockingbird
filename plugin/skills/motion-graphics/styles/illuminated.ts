// A manuscript leaf: mottled vellum with faint ruling, a vine border with
// painted leaves and gold dots, iron-gall brown text with vermilion for
// emphasis, a gilded initial on lapis and rose, gold roundels, and numbers
// in burnished gold. The quill writes each line; pigment floods into the
// pen outlines afterwards, and a glint travels across the gold.
import {
  along,
  type Cue,
  counting,
  curve,
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

const INK: Record<Tone, string> = {
  ink: "#3B2414",
  accent: "#B8321F",
  good: "#2F7A4B",
  bad: "#C2331E",
  muted: "#7A6650",
};
const LAPIS = "#24448F";
const ROSE = "#B0526E";
const VELLUM = "#EADBB4";
const BOOK = '"Luminari", "Palatino", "Book Antiqua", "Georgia", serif';
const INITIAL = '"Palatino", "Book Antiqua", "Georgia", serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__illum ??= new Map();
  const cache: Map<string, any> = g.__illum;
  let quill: Pt | null = null;

  /** Burnished gold across a span, with a glint that travels along it. */
  function gold(x0: number, y0: number, x1: number, y1: number) {
    const gr = ctx.createLinearGradient(x0, y0, x1, y1);
    const s = (t * 0.35) % 1;
    gr.addColorStop(0, "#B8862B");
    gr.addColorStop(Math.max(0, s - 0.15), "#D9AE4E");
    gr.addColorStop(s, "#FFF1B8");
    gr.addColorStop(Math.min(1, s + 0.15), "#D9AE4E");
    gr.addColorStop(1, "#A9771F");
    return gr;
  }

  function leaf() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      b.fillStyle = VELLUM;
      b.fillRect(0, 0, W, H);
      b.filter = `blur(${30 * u}px)`;
      for (let i = 0; i < 30; i++) {
        b.fillStyle = hash(i) > 0.5 ? "rgba(255,248,225,0.22)" : "rgba(170,130,70,0.07)";
        b.beginPath();
        b.ellipse(
          hash(i + 1) * W,
          hash(i + 2) * H,
          (60 + hash(i + 3) * 160) * u,
          (40 + hash(i + 4) * 100) * u,
          hash(i) * 3,
          0,
          Math.PI * 2,
        );
        b.fill();
      }
      b.filter = "none";
      const vg = b.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.35,
        W / 2,
        H / 2,
        Math.hypot(W, H) * 0.6,
      );
      vg.addColorStop(0, "rgba(120,80,30,0)");
      vg.addColorStop(1, "rgba(120,80,30,0.3)");
      b.fillStyle = vg;
      b.fillRect(0, 0, W, H);
      for (let y = H * 0.18; y < H * 0.92; y += 32 * u) {
        b.fillStyle = "rgba(150,90,60,0.08)";
        b.fillRect(W * 0.04, y, W * 0.93, u);
      }
      // The border: a painted bar down the left, a vine along it and the foot.
      const bx = W * 0.012;
      b.fillStyle = ROSE;
      b.fillRect(bx, H * 0.03, 5 * u, H * 0.94);
      b.fillStyle = LAPIS;
      b.fillRect(bx + 5 * u, H * 0.03, 5 * u, H * 0.94);
      const vine = (pts: Pt[]) => {
        b.strokeStyle = "#5A4630";
        b.lineWidth = 1.5 * u;
        trace(b, pts);
        b.stroke();
        pts.forEach(([x, y], i) => {
          if (i % 3) return;
          const col = ["#2F7A4B", "#B8321F", LAPIS, ROSE][i % 4] as string;
          b.fillStyle = col;
          b.beginPath();
          b.ellipse(x + 6 * u, y, 6 * u, 3.5 * u, (i % 2 ? 0.6 : -0.6) + 0.3, 0, Math.PI * 2);
          b.fill();
          b.fillStyle = "#D9AE4E";
          b.beginPath();
          b.arc(x - 5 * u, y + 6 * u, 2.6 * u, 0, Math.PI * 2);
          b.fill();
        });
      };
      vine(
        Array.from(
          { length: 60 },
          (_, i) => [bx + 18 * u + Math.sin(i * 0.7) * 5 * u, H * 0.04 + (i / 59) * H * 0.92] as Pt,
        ),
      );
      vine(
        Array.from(
          { length: 90 },
          (_, i) => [W * 0.04 + (i / 89) * W * 0.92, H * 0.965 + Math.sin(i * 0.7) * 4 * u] as Pt,
        ),
      );
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }

  /** A pen line drawn on by the quill. */
  function pen(points: Pt[], { at = 0, dur = 0.5, tone = "ink" as Tone, width = 2.4 } = {}) {
    const p = progress(t, at, dur);
    if (p <= 0) return;
    const { points: drawn } = along(points, p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK[tone];
    ctx.lineWidth = width * u;
    trace(ctx, drawn);
    ctx.stroke();
    ctx.restore();
    if (p < 1) quill = drawn.at(-1) as Pt;
  }

  /** Text written by the quill, revealed left to right. */
  function write(
    s: string,
    x: number,
    y: number,
    o: Cue & { size?: number; align?: string; px?: number } = {},
  ) {
    const { at = 0, size = 30, tone = "ink", align = "left" } = o;
    const dur = o.dur ?? 0.05 * s.length + 0.1;
    const p = progress(t, at, dur);
    if (p <= 0) return 0;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${BOOK}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const px = o.px ?? X(x);
    const left = align === "center" ? px - w / 2 : align === "right" ? px - w : px;
    ctx.beginPath();
    ctx.rect(left - 4 * u, Y(y) - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = INK[tone];
    ctx.fillText(s, left, Y(y));
    ctx.restore();
    if (p < 1) quill = [left + w * p, Y(y)];
    return w;
  }

  /** White-lead filigree: little dots and curls scattered over a painted field. */
  function filigree(x0: number, y0: number, w: number, h: number, seed: number, a: number) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 0.9 * u;
    for (let i = 0; i < 10; i++) {
      const x = x0 + hash(seed + i) * w;
      const y = y0 + hash(seed + i * 2.3) * h;
      ctx.beginPath();
      ctx.arc(x, y, 1.4 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 4 * u, y, 3 * u, Math.PI, Math.PI * 2.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  return {
    surface() {
      leaf();
    },
    title(s, o = {}) {
      const { x = 0.05, y = 0.13, size = 70, at = 0 } = o;
      const p = expo(progress(t, at, 0.5));
      if (p <= 0) return;
      // The initial: a gilded capital on a lapis and rose square.
      const S = size * 1.7 * u;
      const bx = X(x);
      const by = Y(y) - S * 0.55;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.fillStyle = LAPIS;
      trace(
        ctx,
        [
          [bx, by],
          [bx + S, by],
          [bx, by + S],
        ],
        true,
      );
      ctx.fill();
      ctx.fillStyle = ROSE;
      trace(
        ctx,
        [
          [bx + S, by],
          [bx + S, by + S],
          [bx, by + S],
        ],
        true,
      );
      ctx.fill();
      filigree(bx, by, S, S, 7, p);
      ctx.strokeStyle = gold(bx, by, bx + S, by + S);
      ctx.lineWidth = 4 * u;
      ctx.strokeRect(bx, by, S, S);
      ctx.font = `700 ${Math.round(S * 0.85)}px ${INITIAL}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = gold(bx, by, bx + S, by + S);
      ctx.fillText(s[0] ?? "", bx + S / 2, by + S * 0.55);
      ctx.strokeStyle = "#5A3A10";
      ctx.lineWidth = 1.2 * u;
      ctx.strokeText(s[0] ?? "", bx + S / 2, by + S * 0.55);
      ctx.restore();
      write(s.slice(1), x, y, { ...o, at: at + 0.4, size, px: bx + S + 6 * u, align: "left" });
    },
    label(s, x, y, o = {}) {
      write(s, x, y, { size: 36, align: "center", ...o });
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.4 } = o;
      if (t < at) return;
      const [cx, cy, R] = [X(x), Y(y), r * u * 1.15];
      const ring = progress(t, at, dur * 0.5);
      const flood = expo(progress(t, at + dur * 0.4, dur * 0.6));
      ctx.save();
      if (flood > 0) {
        ctx.fillStyle = LAPIS;
        ctx.beginPath();
        ctx.arc(cx, cy, R * flood, 0, Math.PI * 2);
        ctx.fill();
        filigree(cx - R * 0.6, cy - R * 0.6, R * 1.2, R * 1.2, x * 99 + y * 77, flood);
      }
      ctx.strokeStyle = gold(cx - R, cy - R, cx + R, cy + R);
      ctx.lineWidth = 4.5 * u;
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ring);
      ctx.stroke();
      ctx.strokeStyle = "#5A3A10";
      ctx.lineWidth = 0.8 * u;
      ctx.beginPath();
      ctx.arc(cx, cy, R + 2.5 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ring);
      ctx.stroke();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "accent" } = o;
      if (t < at) return;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const col: Tone = tone === "good" || tone === "ink" ? "accent" : tone;
      const fill = progress(t, at + dur, 0.3);
      if (fill > 0) {
        ctx.save();
        ctx.globalAlpha = fill;
        ctx.fillStyle = "rgba(250,240,212,0.85)";
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.restore();
      }
      pen(
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
          [x0, y0],
        ],
        { at, dur, tone: col, width: 2.6 },
      );
      const d = 5 * u;
      pen(
        [
          [x0 + d, y0 + d],
          [x1 - d, y0 + d],
          [x1 - d, y1 - d],
          [x0 + d, y1 - d],
          [x0 + d, y0 + d],
        ],
        { at: at + 0.1, dur, tone: col, width: 1 },
      );
      if (fill > 0)
        for (const [cx, cy] of [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ] as Pt[]) {
          ctx.fillStyle = gold(cx - 6 * u, cy - 6 * u, cx + 6 * u, cy + 6 * u);
          ctx.beginPath();
          ctx.arc(cx, cy, 5 * u * fill, 0, Math.PI * 2);
          ctx.fill();
        }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true, tone = "ink" } = o;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      pen(shaft, { at, dur, tone: tone === "accent" ? "muted" : tone, width: head ? 2 : 1 });
      if (!head || t < at + dur) return;
      const end = shaft.at(-1) as Pt;
      const prev = shaft.at(-3) as Pt;
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 14 * u;
      ctx.save();
      ctx.fillStyle = INK[tone];
      trace(
        ctx,
        [
          end,
          [end[0] - Math.cos(a - 0.4) * s, end[1] - Math.sin(a - 0.4) * s],
          [end[0] - Math.cos(a) * s * 0.6, end[1] - Math.sin(a) * s * 0.6],
          [end[0] - Math.cos(a + 0.4) * s, end[1] - Math.sin(a + 0.4) * s],
        ],
        true,
      );
      ctx.fill();
      // A penwork curl at the tail.
      const s0 = shaft[0] as Pt;
      ctx.strokeStyle = INK[tone];
      ctx.lineWidth = 1.2 * u;
      ctx.beginPath();
      ctx.arc(s0[0], s0[1] - 4 * u, 4 * u, Math.PI * 0.5, Math.PI * 2.2);
      ctx.stroke();
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      if (t < at) return;
      // A reliquary chest: lapis body, gold bands, a gilded arched lid.
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const lid = bh * 0.22;
      const p = expo(progress(t, at, dur * 0.6));
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 - 10 * u, y0 + bh * (1 - p) - 10 * u, bw + 20 * u, bh * p + 20 * u);
      ctx.clip();
      ctx.fillStyle = LAPIS;
      ctx.fillRect(x0, y0 + lid, bw, bh - lid);
      filigree(x0, y0 + lid, bw, bh - lid, 31, 1);
      ctx.fillStyle = gold(x0, y0, x0 + bw, y0 + bh);
      ctx.beginPath();
      ctx.moveTo(x0 - 3 * u, y0 + lid);
      ctx.quadraticCurveTo(x0 + bw / 2, y0 - lid * 0.6, x0 + bw + 3 * u, y0 + lid);
      ctx.closePath();
      ctx.fill();
      for (const f of [0.45, 0.75]) ctx.fillRect(x0, y0 + lid + (bh - lid) * f, bw, 5 * u);
      ctx.strokeStyle = "#5A3A10";
      ctx.lineWidth = 1.4 * u;
      ctx.strokeRect(x0, y0 + lid, bw, bh - lid);
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      if (size >= 80) {
        // A burst of gold rays once it lands.
        const rp = expo(progress(t, at + dur, 0.5));
        if (rp > 0) {
          ctx.strokeStyle = "#C99A3A";
          ctx.lineWidth = 2 * u;
          for (let i = 0; i < 28; i++) {
            const a = (i / 28) * Math.PI * 2;
            const r0 = size * 0.85 * u;
            const r1 = r0 + (14 + hash(i) * 26) * u * rp;
            trace(ctx, [
              [cx + Math.cos(a) * r0 * 1.4, cy + Math.sin(a) * r0],
              [cx + Math.cos(a) * r1 * 1.4, cy + Math.sin(a) * r1],
            ]);
            ctx.stroke();
          }
        }
      }
      ctx.font = `700 ${Math.round(size * u)}px ${BOOK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = progress(t, at, 0.2);
      ctx.fillStyle = gold(cx - size * u, cy - size * u, cx + size * u, cy + size * u);
      ctx.fillText(value, cx, cy);
      ctx.strokeStyle = "#5A3A10";
      ctx.lineWidth = 1.3 * u;
      ctx.strokeText(value, cx, cy);
      ctx.restore();
      if (sub)
        write(sub, x, y - (size * 0.8 * u) / H, {
          at: at + 0.2,
          size: size * 0.32,
          align: "center",
          tone: "accent",
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 32) * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check")
        pen(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.1, cy + s * 0.4],
            [cx + s * 0.6, cy - s * 0.5],
          ],
          { dur: 0.25, tone: "good", width: 4, ...o },
        );
      else {
        const at = o.at ?? 0;
        pen(
          [
            [cx - s * 0.5, cy - s * 0.5],
            [cx + s * 0.5, cy + s * 0.5],
          ],
          { dur: 0.12, tone: "bad", width: 4, ...o },
        );
        pen(
          [
            [cx + s * 0.5, cy - s * 0.5],
            [cx - s * 0.5, cy + s * 0.5],
          ],
          { dur: 0.12, tone: "bad", width: 4, ...o, at: at + 0.12 },
        );
      }
    },
    finish() {
      const q = quill as Pt | null;
      if (!q) return;
      const [x, y] = q;
      // A goose quill: a feather vane on a long shaft.
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.PI * 0.3);
      ctx.shadowColor = "rgba(60,40,10,0.3)";
      ctx.shadowBlur = 10 * u;
      ctx.shadowOffsetX = 8 * u;
      ctx.shadowOffsetY = 10 * u;
      ctx.fillStyle = "#F4EEDF";
      ctx.beginPath();
      ctx.moveTo(40 * u, 0);
      ctx.quadraticCurveTo(110 * u, -26 * u, 200 * u, -10 * u);
      ctx.quadraticCurveTo(120 * u, 10 * u, 40 * u, 0);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "#B9AC90";
      ctx.lineWidth = 2 * u;
      trace(ctx, [
        [0, 0],
        [200 * u, -10 * u],
      ]);
      ctx.stroke();
      ctx.strokeStyle = "#3B2414";
      trace(ctx, [
        [0, 0],
        [10 * u, -0.5 * u],
      ]);
      ctx.stroke();
      ctx.restore();
    },
  };
}

export default {
  id: "illuminated",
  name: "Illuminated manuscript",
  category: "Illustration",
  make,
} satisfies Style;
