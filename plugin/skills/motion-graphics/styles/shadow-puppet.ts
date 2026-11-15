// A shadow play: black cut-out silhouettes with punched holes and coloured
// gels, pressed to a cloth screen lit amber by a lamp that never quite holds
// still. Signs drop in on strings and sway; links are beaded rods.
import {
  type Align,
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
  spring,
  type Tone,
  trace,
} from "./look.ts";

const BLACK = "#140C07";
const GEL: Record<Tone, string> = {
  ink: "#E9B866",
  accent: "#E2683A",
  good: "#6DBA4E",
  bad: "#D8382A",
  muted: "#9C7A4E",
};
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis as any;
  g.__shadowPlay ??= new Map();
  const cache: Map<string, any> = g.__shadowPlay;

  /** Drop from above on a spring and sway on the string; returns the offset and swing, or null before `at`. */
  function hang(at: number) {
    if (t < at) return null;
    const s = spring(t, { start: at, stiffness: 140, damping: 9 });
    const swing =
      Math.sin((t - at) * 4.5) * 0.06 * Math.exp(-(t - at) * 1.6) + Math.sin(t * 1.3 + at) * 0.006;
    return { dy: (1 - s) * -H * 0.25, swing };
  }

  /** Strings from the top of the screen down to two points. */
  function strings(x1: number, x2: number, y: number) {
    ctx.save();
    ctx.strokeStyle = "rgba(20,12,7,0.7)";
    ctx.lineWidth = Math.max(1, 1.4 * u);
    ctx.beginPath();
    ctx.moveTo(x1, 0);
    ctx.lineTo(x1, y);
    ctx.moveTo(x2, 0);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.restore();
  }

  /** A black plaque with scalloped ends and serif text in lamplight colour. */
  function plaque(
    s: string,
    cx: number,
    cy: number,
    size: number,
    o: { at?: number; tone?: Tone; align?: Align; hung?: boolean },
  ) {
    const h = hang(o.at ?? 0);
    if (!h) return;
    ctx.save();
    ctx.font = `italic 500 ${Math.round(size * u)}px ${SERIF}`;
    const w = ctx.measureText(s).width + size * 1.1 * u;
    const ph = size * 1.5 * u;
    const left = o.align === "left" ? cx : o.align === "right" ? cx - w : cx - w / 2;
    const y = cy + h.dy;
    if (o.hung) strings(left + w * 0.15, left + w * 0.85, y - ph / 2);
    ctx.translate(left + w / 2, y - ph);
    ctx.rotate(h.swing);
    ctx.translate(-(left + w / 2), -(y - ph));
    ctx.fillStyle = BLACK;
    ctx.beginPath();
    ctx.roundRect(left, y - ph / 2, w, ph, ph * 0.15);
    ctx.fill();
    for (const ex of [left, left + w]) {
      ctx.beginPath();
      ctx.arc(ex, y, ph * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    // A punched inner border.
    ctx.strokeStyle = alpha(GEL.ink, 0.55);
    ctx.lineWidth = Math.max(1, 1.5 * u);
    ctx.setLineDash([3 * u, 3 * u]);
    ctx.strokeRect(left + ph * 0.14, y - ph / 2 + ph * 0.14, w - ph * 0.28, ph * 0.72);
    ctx.setLineDash([]);
    ctx.font = `italic 500 ${Math.round(size * u)}px ${SERIF}`;
    ctx.fillStyle = o.tone && o.tone !== "ink" ? GEL[o.tone] : "#F2D9A2";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + w / 2, y + size * 0.04 * u);
    ctx.restore();
  }

  /** A cut-work cog: black wheel, teeth, a gel centre and punched holes. */
  function cog(cx: number, cy: number, R: number, tone: Tone, spin: number) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spin);
    ctx.fillStyle = BLACK;
    const n = 10;
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const r = i % 2 ? R : R * 1.18;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = GEL[tone];
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = BLACK;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = R * 0.12;
    ctx.strokeStyle = BLACK;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62);
    }
    ctx.stroke();
    ctx.restore();
  }

  return {
    surface() {
      const key = `${W}x${H}`;
      let img = cache.get(key);
      if (!img) {
        img = new OffscreenCanvas(W, H);
        const c = img.getContext("2d");
        const gr = c.createRadialGradient(
          W * 0.5,
          H * 0.42,
          0,
          W * 0.5,
          H * 0.45,
          Math.hypot(W, H) * 0.6,
        );
        gr.addColorStop(0, "#F7D9A0");
        gr.addColorStop(0.35, "#E6A55A");
        gr.addColorStop(0.7, "#A9562A");
        gr.addColorStop(1, "#3A1A0C");
        c.fillStyle = gr;
        c.fillRect(0, 0, W, H);
        // Cloth weave.
        c.globalAlpha = 0.05;
        c.fillStyle = "#3A1A0C";
        for (let x = 0; x < W; x += 3 * u) c.fillRect(x, 0, Math.max(0.5, 0.6 * u), H);
        for (let y = 0; y < H; y += 3 * u) c.fillRect(0, y, W, Math.max(0.5, 0.6 * u));
        c.globalAlpha = 1;
        // A soft out-of-focus fern leaning in from the side.
        c.save();
        c.filter = `blur(${5 * u}px)`;
        c.fillStyle = "rgba(40,20,10,0.35)";
        for (let i = 0; i < 14; i++) {
          const y = H * (0.55 + i * 0.028);
          c.beginPath();
          c.ellipse(W * 0.11 + i * 4 * u, y, (40 - i * 1.5) * u, 6 * u, -0.5, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();
        // The lace valance at the top and grass along the bottom.
        c.fillStyle = BLACK;
        c.fillRect(0, 0, W, 8 * u);
        for (let x = 0; x < W; x += 22 * u) {
          c.beginPath();
          c.arc(x + 11 * u, 8 * u, 9 * u, 0, Math.PI);
          c.fill();
          c.beginPath();
          c.moveTo(x + 11 * u, 16 * u);
          c.lineTo(x + 7 * u, 22 * u);
          c.lineTo(x + 11 * u, 28 * u);
          c.lineTo(x + 15 * u, 22 * u);
          c.fill();
        }
        const base = H * 0.95;
        c.fillRect(0, base, W, H - base);
        c.strokeStyle = BLACK;
        c.lineCap = "round";
        for (let i = 0; i < 260; i++) {
          const x = hash(i * 1.7) * W;
          const hgt = (8 + hash(i * 2.3) * 22) * u;
          c.lineWidth = (1.5 + hash(i) * 1.5) * u;
          c.beginPath();
          c.moveTo(x, base + 2 * u);
          c.quadraticCurveTo(
            x + (hash(i * 3) - 0.5) * 10 * u,
            base - hgt * 0.6,
            x + (hash(i * 5) - 0.5) * 16 * u,
            base - hgt,
          );
          c.stroke();
        }
        for (let i = 0; i < 12; i++) {
          const x = hash(i * 9.1) * W;
          c.beginPath();
          c.arc(x, base - 34 * u, 4 * u, 0, Math.PI * 2);
          c.fill();
          c.fillRect(x - u, base - 34 * u, 2 * u, 34 * u);
        }
        cache.set(key, img);
      }
      ctx.drawImage(img, 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.13, size = 54, at = 0, align = "left" } = o;
      plaque(s, X(x), Y(y), size, { at, align, hung: true });
    },
    label(s, x, y, o = {}) {
      plaque(s, X(x), Y(y), o.size ?? 32, {
        at: o.at ?? 0,
        tone: o.tone,
        align: o.align ?? "center",
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      if (t < at) return;
      // Slides in from below on its rod, then settles.
      const s = spring(t, { start: at, stiffness: 180, damping: 12 });
      const dy = (1 - s) * 60 * u;
      const R = r * u;
      cog(X(x), Y(y) + dy, R * 0.85, tone, t * 0.4 + hash(x * 7 + y));
    },
    box(x, y, w, h, o = {}) {
      // A hanging picture frame: black lace border, the screen glowing through, a gel wash.
      const { at = 0, tone = "ink" } = o;
      const hg = hang(at);
      if (!hg) return;
      const [x0, y0, bw, bh] = [X(x), Y(y) + hg.dy, X(w), Y(h)];
      strings(x0 + bw * 0.2, x0 + bw * 0.8, y0);
      ctx.save();
      ctx.translate(x0 + bw / 2, y0);
      ctx.rotate(hg.swing);
      ctx.translate(-(x0 + bw / 2), -y0);
      const b = 14 * u;
      ctx.fillStyle = BLACK;
      ctx.beginPath();
      ctx.rect(x0 - b, y0 - b, bw + b * 2, bh + b * 2);
      ctx.rect(x0 + bw, y0, -bw, bh);
      ctx.fill();
      ctx.fillStyle = alpha(GEL[tone], 0.28);
      ctx.fillRect(x0, y0, bw, bh);
      // Punched holes round the frame.
      ctx.fillStyle = "#F2C27A";
      for (let i = 0; i < 12; i++) {
        const f = (i + 0.5) / 12;
        for (const [px, py] of [
          [x0 + bw * f, y0 - b / 2],
          [x0 + bw * f, y0 + bh + b / 2],
        ] as Pt[]) {
          ctx.beginPath();
          ctx.arc(px, py, 2.2 * u, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      // A beaded rod that grows from its start, with a cut-out arrowhead.
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0) return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const n = Math.max(2, Math.round(pts.length * p));
      const shown = pts.slice(0, n);
      const thin = !head && tone === "accent";
      ctx.save();
      ctx.lineCap = "round";
      trace(ctx, shown);
      ctx.strokeStyle = BLACK;
      ctx.lineWidth = (thin ? 1.6 : 4) * u;
      ctx.stroke();
      if (!thin) {
        ctx.fillStyle = BLACK;
        for (let i = 0; i < shown.length; i += 4) {
          const [px, py] = shown[i] as Pt;
          ctx.beginPath();
          ctx.arc(px, py, 4.5 * u, 0, Math.PI * 2);
          ctx.fill();
        }
        if (tone !== "ink") {
          ctx.fillStyle = GEL[tone];
          for (let i = 0; i < shown.length; i += 4) {
            const [px, py] = shown[i] as Pt;
            ctx.beginPath();
            ctx.arc(px, py, 2 * u, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      if (head && p >= 1) {
        const end = pts.at(-1) as Pt;
        const prev = pts.at(-3) as Pt;
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 22 * u;
        trace(
          ctx,
          [
            [end[0] + Math.cos(a) * 4 * u, end[1] + Math.sin(a) * 4 * u],
            [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
            [end[0] - Math.cos(a) * s * 0.6, end[1] - Math.sin(a) * s * 0.6],
            [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s],
          ],
          true,
        );
        ctx.fillStyle = BLACK;
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      // A lantern-jar silhouette on a rod, its lace windows lit by a gel.
      const { at = 0, tone = "accent" } = o;
      if (t < at) return;
      const s = spring(t, { start: at, stiffness: 160, damping: 11 });
      const dy = (1 - s) * Y(h) * 1.2;
      const [x0, y0, bw, bh] = [X(x), Y(y) + dy, X(w), Y(h)];
      const cx = x0 + bw / 2;
      ctx.save();
      ctx.strokeStyle = "rgba(20,12,7,0.6)";
      ctx.lineWidth = Math.max(1, 1.4 * u);
      ctx.beginPath();
      ctx.moveTo(cx, y0 + bh);
      ctx.lineTo(cx - bw * 0.3, H);
      ctx.stroke();
      ctx.fillStyle = BLACK;
      ctx.beginPath();
      ctx.moveTo(cx - bw * 0.3, y0);
      ctx.lineTo(cx + bw * 0.3, y0);
      ctx.lineTo(cx + bw * 0.3, y0 + bh * 0.1);
      ctx.quadraticCurveTo(x0 + bw * 1.08, y0 + bh * 0.2, x0 + bw, y0 + bh * 0.5);
      ctx.lineTo(x0 + bw * 0.95, y0 + bh);
      ctx.lineTo(x0 + bw * 0.05, y0 + bh);
      ctx.lineTo(x0, y0 + bh * 0.5);
      ctx.quadraticCurveTo(x0 - bw * 0.08, y0 + bh * 0.2, cx - bw * 0.3, y0 + bh * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = GEL[tone];
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 2; col++) {
          ctx.beginPath();
          ctx.ellipse(
            x0 + bw * (0.32 + col * 0.36),
            y0 + bh * (0.38 + row * 0.2),
            bw * 0.1,
            bh * 0.065,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const a = progress(t, at, 0.4);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `500 ${Math.round(size * u)}px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = BLACK;
      ctx.fillText(value, X(x), Y(y));
      ctx.restore();
      if (tone !== "ink") {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = GEL[tone];
        ctx.fillRect(X(x) - size * 0.9 * u, Y(y) + size * 0.42 * u, size * 1.8 * u, 4 * u);
        ctx.restore();
      }
      if (sub) plaque(sub, X(x), Y(y) + size * 0.95 * u, size * 0.34, { at: at + 0.3 });
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 30) * u;
      const s = spring(t, { start: o.at ?? 0, stiffness: 240, damping: 13 });
      if (s <= 0) return;
      ctx.save();
      ctx.translate(X(x), Y(y));
      ctx.scale(s, s);
      ctx.fillStyle = BLACK;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = GEL[o.tone ?? (kind === "check" ? "good" : "bad")];
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = BLACK;
      ctx.lineWidth = r * 0.22;
      ctx.lineCap = "round";
      ctx.beginPath();
      if (kind === "check") {
        ctx.moveTo(-r * 0.4, 0);
        ctx.lineTo(-r * 0.1, r * 0.3);
        ctx.lineTo(r * 0.42, -r * 0.32);
      } else {
        ctx.moveTo(-r * 0.35, -r * 0.35);
        ctx.lineTo(r * 0.35, r * 0.35);
        ctx.moveTo(r * 0.35, -r * 0.35);
        ctx.lineTo(-r * 0.35, r * 0.35);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      // The lamp flickers: the whole screen breathes a little darker and lighter.
      const f =
        0.06 +
        0.04 * Math.sin(t * 7.3) +
        0.03 * Math.sin(t * 13.1 + 1) +
        0.02 * (hash(Math.floor(t * 12)) - 0.5);
      ctx.save();
      ctx.fillStyle = `rgba(30,10,0,${clamp(f, 0, 0.2)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    },
  };
}

export default {
  id: "shadow-puppet",
  name: "Shadow play",
  category: "Paper & Craft",
  make,
} satisfies Style;
