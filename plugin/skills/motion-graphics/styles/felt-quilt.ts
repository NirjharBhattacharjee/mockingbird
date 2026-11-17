// A patchwork quilt: puffy squares of cotton prints joined by stitched seams,
// with fuzzy felt pieces appliquéd on top and edged in stitching. Felt drops
// on with a lifted shadow and a soft squash, thread sews itself stitch by
// stitch, nodes are buttons, labels are woven tags.
import {
  type Align,
  along,
  alpha,
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

const FELT: Record<Tone, string> = {
  ink: "#F4EBDD",
  accent: "#F2A3B0",
  good: "#E9B840",
  bad: "#D9443A",
  muted: "#8FCFC4",
};
const THREAD: Record<Tone, string> = {
  ink: "#3C4A6E",
  accent: "#C84A62",
  good: "#3C7A52",
  bad: "#B8322A",
  muted: "#5A8A86",
};
const ROUND = '"Arial Rounded MT Bold", "Nunito", "Varela Round", "Avenir Next", Arial, sans-serif';
const PRINTS = [
  "#C9786A",
  "#D9B95E",
  "#8FB0C8",
  "#9DB89A",
  "#E2CDB0",
  "#C7A1A8",
  "#7F9BB8",
  "#D8A47A",
];

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__feltQuilt ??= new Map();
  const cache: Map<string, any> = g.__feltQuilt;

  /** Drop on: starts lifted and a touch big, lands with a squash; null before `at`. */
  function drop(at: number) {
    const s = t - at;
    if (s < 0) return null;
    const p = clamp(s / 0.3);
    const land = p < 1 ? 1 - p : 0;
    const squash = p >= 1 ? Math.exp(-(s - 0.3) * 12) * Math.sin((s - 0.3) * 30) * 0.05 : 0;
    return {
      lift: land,
      sx: 1 + land * 0.1 + squash,
      sy: 1 + land * 0.1 - squash,
      a: clamp(p * 2.5),
    };
  }

  /** A felt piece filling `shape`: a lifted shadow, the colour, then fuzz and a soft lit edge. */
  function felt(shape: () => void, color: string, cx: number, cy: number, at: number) {
    const d = drop(at);
    if (!d) return;
    ctx.save();
    ctx.globalAlpha = d.a;
    ctx.translate(cx, cy);
    ctx.scale(d.sx, d.sy);
    ctx.translate(-cx, -cy);
    ctx.save();
    ctx.shadowColor = "rgba(40,25,15,0.4)";
    ctx.shadowBlur = (6 + 14 * d.lift) * u;
    ctx.shadowOffsetY = (3 + 14 * d.lift) * u;
    shape();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    // Fuzz: a soft lighter edge and a speckle of fibres.
    ctx.save();
    shape();
    ctx.clip();
    ctx.fillStyle = fuzz();
    ctx.fillRect(cx - 600 * u, cy - 600 * u, 1200 * u, 1200 * u);
    ctx.restore();
    shape();
    ctx.lineWidth = 2.5 * u;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.stroke();
    ctx.restore();
  }

  /** A fibre speckle pattern for felt. */
  function fuzz() {
    const key = `fuzz:${Math.round(u * 100)}`;
    let pat = cache.get(key);
    if (!pat) {
      const S = Math.round(80 * u);
      const c0 = new OffscreenCanvas(S, S);
      const c = c0.getContext("2d");
      for (let i = 0; i < 500; i++) {
        c.fillStyle = hash(i) > 0.5 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.07)";
        const a = hash(i * 2.2) * Math.PI;
        c.save();
        c.translate(hash(i * 1.3) * S, hash(i * 3.1) * S);
        c.rotate(a);
        c.fillRect(0, 0, (2 + hash(i * 4) * 4) * u, Math.max(0.6, 0.8 * u));
        c.restore();
      }
      pat = ctx.createPattern(c0, "repeat");
      cache.set(key, pat);
    }
    return pat;
  }

  /** Running stitch along a path, sewn on stitch by stitch from `at`. */
  function sew(points: Pt[], at: number, dur: number, color: string, width = 3) {
    const p = progress(t, at, dur);
    if (p <= 0) return null;
    const { points: shown, angle } = along(points, p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.setLineDash([9 * u, 6 * u]);
    trace(ctx, shown);
    ctx.strokeStyle = "rgba(40,25,15,0.3)";
    ctx.lineWidth = width * u;
    ctx.translate(0, 1.2 * u);
    ctx.stroke();
    ctx.translate(0, -1.2 * u);
    trace(ctx, shown);
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
    return { end: shown.at(-1) as Pt, angle, done: p >= 1 };
  }

  /** Felt letters: a thick light edge round the coloured letter, a soft shadow beneath. */
  function feltText(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: Align,
    edge = "#FBF5EA",
  ) {
    ctx.save();
    ctx.font = `800 ${Math.round(size * u)}px ${ROUND}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(40,25,15,0.4)";
    ctx.shadowBlur = 6 * u;
    ctx.shadowOffsetY = 3 * u;
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(3, size * 0.16 * u);
    ctx.strokeText(s, x, y);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  /** A woven tag with a stitched border. */
  function tag(s: string, x: number, y: number, size: number, tone: Tone, align: Align) {
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${ROUND}`;
    const w = ctx.measureText(s).width + size * 0.9 * u;
    const h = size * 1.4 * u;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.shadowColor = "rgba(40,25,15,0.35)";
    ctx.shadowBlur = 4 * u;
    ctx.shadowOffsetY = 2 * u;
    ctx.fillStyle = "#F7F1E4";
    ctx.fillRect(left, y - h / 2, w, h);
    ctx.shadowColor = "transparent";
    ctx.setLineDash([4 * u, 3 * u]);
    ctx.strokeStyle = THREAD.bad;
    ctx.lineWidth = 1.6 * u;
    ctx.strokeRect(left + 3 * u, y - h / 2 + 3 * u, w - 6 * u, h - 6 * u);
    ctx.setLineDash([]);
    ctx.fillStyle = THREAD[tone];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + w / 2, y + size * 0.04 * u);
    ctx.restore();
  }

  return {
    surface() {
      const key = `quilt:${W}x${H}`;
      let img = cache.get(key);
      if (!img) {
        img = new OffscreenCanvas(W, H);
        const c = img.getContext("2d");
        const s = Math.round(H / 4.5);
        let k = 0;
        for (let y = 0; y < H; y += s) {
          for (let x = 0; x < W; x += s) {
            k++;
            const col = PRINTS[Math.floor(hash(k * 1.7) * PRINTS.length)] as string;
            c.fillStyle = col;
            c.fillRect(x, y, s, s);
            const kind = Math.floor(hash(k * 3.3) * 4);
            c.save();
            c.beginPath();
            c.rect(x, y, s, s);
            c.clip();
            if (kind === 0) {
              c.fillStyle = "rgba(255,250,240,0.55)";
              for (let py = y + 6 * u; py < y + s; py += 12 * u)
                for (let px = x + ((py / (12 * u)) % 2 ? 6 : 0) * u; px < x + s; px += 12 * u) {
                  c.beginPath();
                  c.arc(px, py, 2 * u, 0, Math.PI * 2);
                  c.fill();
                }
            } else if (kind === 1) {
              c.fillStyle = "rgba(255,250,240,0.3)";
              for (let p = 0; p < s; p += 14 * u) {
                c.fillRect(x + p, y, 7 * u, s);
                c.fillRect(x, y + p, s, 7 * u);
              }
            } else if (kind === 2) {
              c.fillStyle = "rgba(60,40,30,0.12)";
              for (let p = 0; p < s; p += 10 * u) c.fillRect(x + p, y, 4 * u, s);
            }
            // Puffy quilting: lit centre, sunken seams.
            const gr = c.createRadialGradient(
              x + s * 0.45,
              y + s * 0.4,
              s * 0.1,
              x + s / 2,
              y + s / 2,
              s * 0.75,
            );
            gr.addColorStop(0, "rgba(255,255,255,0.14)");
            gr.addColorStop(1, "rgba(40,25,15,0.28)");
            c.fillStyle = gr;
            c.fillRect(x, y, s, s);
            c.restore();
          }
        }
        // Stitched seams.
        c.strokeStyle = "rgba(250,245,230,0.75)";
        c.lineWidth = 1.6 * u;
        c.setLineDash([6 * u, 5 * u]);
        for (let y = s; y < H; y += s) {
          c.beginPath();
          c.moveTo(0, y - 5 * u);
          c.lineTo(W, y - 5 * u);
          c.stroke();
        }
        for (let x = s; x < W; x += s) {
          c.beginPath();
          c.moveTo(x - 5 * u, 0);
          c.lineTo(x - 5 * u, H);
          c.stroke();
        }
        // Mute it a little so the felt reads on top.
        c.setLineDash([]);
        c.fillStyle = "rgba(60,45,35,0.22)";
        c.fillRect(0, 0, W, H);
        cache.set(key, img);
      }
      ctx.drawImage(img, 0, 0);
    },
    title(s, o = {}) {
      // A felt oval patch with the title in felt letters, the oval's stitching sewn round.
      const { x = 0.04, y = 0.11, size = 64, at = 0, tone = "accent", align = "left" } = o;
      if (t < at) return;
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${ROUND}`;
      const w = ctx.measureText(s).width + size * 1.4 * u;
      ctx.restore();
      const h = size * 1.9 * u;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      const cx = left + w / 2;
      const cy = Y(y);
      felt(
        () => {
          ctx.beginPath();
          ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
        },
        FELT.ink,
        cx,
        cy,
        at,
      );
      const ring = Array.from({ length: 61 }, (_, i) => {
        const a = (i / 60) * Math.PI * 2;
        return [cx + Math.cos(a) * (w / 2 - 8 * u), cy + Math.sin(a) * (h / 2 - 8 * u)] as Pt;
      });
      sew(ring, at + 0.3, 0.7, THREAD.bad, 2);
      const p = progress(t, at + 0.15, 0.3);
      if (p > 0) {
        ctx.save();
        ctx.globalAlpha = p;
        feltText(s, cx, cy, size, THREAD[tone === "ink" ? "accent" : tone], "center");
        ctx.restore();
      }
    },
    label(s, x, y, o = {}) {
      const d = drop(o.at ?? 0);
      if (!d) return;
      ctx.save();
      ctx.globalAlpha = d.a;
      ctx.translate(X(x), Y(y) - d.lift * 10 * u);
      ctx.rotate((hash(x * 7 + y * 3) - 0.5) * 0.06);
      tag(s, 0, 0, o.size ?? 30, o.tone ?? "ink", o.align ?? "center");
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      // A sewn-on button: a rim, four holes and a thread X.
      const { at = 0, tone = "accent" } = o;
      const d = drop(at);
      if (!d) return;
      const R = r * 1.25 * u;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.globalAlpha = d.a;
      ctx.translate(cx, cy);
      ctx.scale(d.sx, d.sy);
      ctx.shadowColor = "rgba(40,25,15,0.45)";
      ctx.shadowBlur = (4 + 10 * d.lift) * u;
      ctx.shadowOffsetY = (3 + 10 * d.lift) * u;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fillStyle = FELT[tone];
      ctx.fill();
      ctx.shadowColor = "transparent";
      const gr = ctx.createRadialGradient(-R * 0.3, -R * 0.4, 0, 0, 0, R);
      gr.addColorStop(0, "rgba(255,255,255,0.55)");
      gr.addColorStop(1, "rgba(0,0,0,0.15)");
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = R * 0.12;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      const hp = R * 0.26;
      ctx.strokeStyle = THREAD.ink;
      ctx.lineWidth = Math.max(1.2, R * 0.1);
      ctx.beginPath();
      ctx.moveTo(-hp, -hp);
      ctx.lineTo(hp, hp);
      ctx.moveTo(hp, -hp);
      ctx.lineTo(-hp, hp);
      ctx.stroke();
      ctx.fillStyle = "rgba(40,25,15,0.6)";
      for (const [hx, hy] of [
        [-hp, -hp],
        [hp, -hp],
        [hp, hp],
        [-hp, hp],
      ] as Pt[]) {
        ctx.beginPath();
        ctx.arc(hx, hy, R * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      felt(
        () => {
          ctx.beginPath();
          ctx.roundRect(x0, y0, bw, bh, 14 * u);
        },
        FELT.ink,
        x0 + bw / 2,
        y0 + bh / 2,
        at,
      );
      const inset = 8 * u;
      sew(
        [
          [x0 + inset, y0 + inset],
          [x0 + bw - inset, y0 + inset],
          [x0 + bw - inset, y0 + bh - inset],
          [x0 + inset, y0 + bh - inset],
          [x0 + inset, y0 + inset],
        ],
        at + 0.25,
        0.6,
        THREAD[tone === "ink" ? "bad" : tone],
        2.4,
      );
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "bad" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const thin = !head && tone === "accent";
      const color = THREAD[tone === "ink" ? "bad" : tone];
      const r = sew(pts, at, dur, thin ? alpha(THREAD.ink, 0.75) : color, thin ? 2.2 : 4.5);
      if (!r?.done || !head) return;
      const s = 18 * u;
      const end = pts.at(-1) as Pt;
      const prev = pts.at(-3) as Pt;
      const angle = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      sew(
        [
          [end[0] - Math.cos(angle - 0.55) * s, end[1] - Math.sin(angle - 0.55) * s],
          end,
          [end[0] - Math.cos(angle + 0.55) * s, end[1] - Math.sin(angle + 0.55) * s],
        ],
        at + dur,
        0.15,
        color,
        4.5,
      );
    },
    store(x, y, w, h, o = {}) {
      // A stack of felt pieces, each dropped on.
      const { at = 0, dur = 0.8, tone = "muted" } = o;
      const n = 4;
      const [x0, bw] = [X(x), X(w)];
      const ph = Y(h) / n;
      const tones: Tone[] = [tone, "good", tone, "accent"];
      for (let i = 0; i < n; i++) {
        const cy = Y(y + h) - ph * (i + 0.5);
        const tn = tones[i] as Tone;
        felt(
          () => {
            ctx.beginPath();
            ctx.roundRect(x0 + (i % 2 ? 4 : -3) * u, cy - ph * 0.45, bw, ph * 0.9, ph * 0.3);
          },
          FELT[tn],
          x0 + bw / 2,
          cy,
          at + (dur / n) * i,
        );
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      const d = drop(at);
      if (!d) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const color = tone === "ink" ? THREAD.ink : tone === "accent" ? "#E06A84" : FELT[tone];
      const edge = tone === "good" ? THREAD.good : "#FBF5EA";
      ctx.save();
      ctx.globalAlpha = d.a;
      feltText(value, X(x), Y(y) - d.lift * 12 * u, size, color, "center", edge);
      ctx.restore();
      if (sub) {
        const sd = drop(at + 0.3);
        if (sd) tag(sub, X(x), Y(y) + size * 0.85 * u, size * 0.28, "ink", "center");
      }
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const [cx, cy] = [X(x), Y(y)];
      const at = o.at ?? 0;
      const color = THREAD[o.tone ?? (kind === "check" ? "good" : "bad")];
      if (kind === "check")
        sew(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.12, cy + s * 0.4],
            [cx + s * 0.6, cy - s * 0.5],
          ],
          at,
          0.3,
          color,
          5,
        );
      else {
        sew(
          [
            [cx - s * 0.5, cy - s * 0.5],
            [cx + s * 0.5, cy + s * 0.5],
          ],
          at,
          0.15,
          color,
          5,
        );
        sew(
          [
            [cx + s * 0.5, cy - s * 0.5],
            [cx - s * 0.5, cy + s * 0.5],
          ],
          at + 0.15,
          0.15,
          color,
          5,
        );
      }
    },
    finish() {
      // The quilt breathes: a slow puff of light across the padding.
      const k = 0.04 + 0.03 * Math.sin(t * 1.2);
      const gr = ctx.createRadialGradient(
        W * 0.5,
        H * 0.45,
        0,
        W * 0.5,
        H * 0.5,
        Math.hypot(W, H) * 0.6,
      );
      gr.addColorStop(0, `rgba(255,248,235,${k})`);
      gr.addColorStop(1, "rgba(40,25,15,0.25)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    },
  };
}

export default {
  id: "felt-quilt",
  name: "Felt patchwork",
  category: "Paper & Craft",
  make,
} satisfies Style;
