// Keynote product film: a near-black stage under a soft spotlight, one glossy
// slab lit with a rim and a sweeping highlight, huge tight headlines that
// arrive a word at a time out of a blur, gradient key numbers with a glow,
// hairline callouts that draw out to their labels.
import {
  along,
  alpha,
  counting,
  curve,
  expo,
  frame,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
  trace,
} from "./look.ts";

const SANS = '"Montserrat", "Noto Color Emoji", sans-serif';
const GRAD: Record<Tone, [string, string]> = {
  ink: ["#F5F5F7", "#B9B9C2"],
  accent: ["#B36BFF", "#FF7A45"],
  good: ["#3FD8D0", "#3E8BFF"],
  bad: ["#FF4B55", "#FF4B55"],
  muted: ["#8E8E96", "#5E5E66"],
};

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);

  function grad(x0: number, y0: number, x1: number, y1: number, tone: Tone) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, GRAD[tone][0]);
    g.addColorStop(1, GRAD[tone][1]);
    return g;
  }

  /** Text that comes into focus: blurred and low, then sharp and settled. */
  function reveal(
    s: string,
    x: number,
    y: number,
    size: number,
    weight: number,
    fill: any,
    p: number,
    align = "left",
    track = -0.02,
  ) {
    if (p <= 0) return;
    const e = expo(p);
    ctx.save();
    ctx.globalAlpha = e;
    const b = (1 - e) * 14 * u;
    if (b > 0.3) ctx.filter = `blur(${b.toFixed(1)}px)`;
    ctx.font = `${weight} ${Math.round(size * u)}px ${SANS}`;
    ctx.letterSpacing = `${(track * size * u).toFixed(1)}px`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y + (1 - e) * 12 * u);
    ctx.restore();
  }

  /** A hairline drawn on from `at`, ending in nothing (callout) or a small open head. */
  function hairline(
    points: Pt[],
    at: number,
    dur: number,
    color: string,
    head: boolean,
    width = 1.6,
  ) {
    const p = expo(progress(t, at, dur));
    if (p <= 0) return;
    const res = along(points, p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    trace(ctx, res.points);
    ctx.stroke();
    // A small dot where the callout begins.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(points[0]?.[0] ?? 0, points[0]?.[1] ?? 0, 2.6 * u, 0, Math.PI * 2);
    ctx.fill();
    if (head && p >= 0.999) {
      const tip = points.at(-1) as Pt;
      const s = 10 * u;
      trace(ctx, [
        [tip[0] - Math.cos(res.angle - 0.5) * s, tip[1] - Math.sin(res.angle - 0.5) * s],
        tip,
        [tip[0] - Math.cos(res.angle + 0.5) * s, tip[1] - Math.sin(res.angle + 0.5) * s],
      ]);
      ctx.stroke();
    }
    ctx.restore();
  }

  return {
    surface() {
      ctx.fillStyle = "#050506";
      ctx.fillRect(0, 0, W, H);
      const spot = ctx.createRadialGradient(
        W * 0.5,
        H * 0.35,
        0,
        W * 0.5,
        H * 0.35,
        Math.max(W, H) * 0.65,
      );
      spot.addColorStop(0, "rgba(70,70,88,0.55)");
      spot.addColorStop(0.5, "rgba(30,30,40,0.35)");
      spot.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, W, H);
      // The floor: a faint horizon where the stage meets the dark.
      const floor = ctx.createLinearGradient(0, H * 0.6, 0, H);
      floor.addColorStop(0, "rgba(0,0,0,0)");
      floor.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = floor;
      ctx.fillRect(0, H * 0.6, W, H * 0.4);
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.08, size = 60, at = 0, dur = 0.9, align = "left" } = o;
      const words = s.split(" ");
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${SANS}`;
      ctx.letterSpacing = `${(-0.02 * size * u).toFixed(1)}px`;
      const full = ctx.measureText(s).width;
      const space = ctx.measureText(" ").width;
      let cx = align === "center" ? X(x) - full / 2 : align === "right" ? X(x) - full : X(x);
      const widths = words.map((w) => ctx.measureText(w).width);
      ctx.restore();
      words.forEach((w, i) => {
        const p = progress(t, at + (i * dur) / words.length, 0.6);
        reveal(w, cx, Y(y), size, 700, "#F5F5F7", p);
        cx += (widths[i] ?? 0) + space;
      });
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 26, tone = "ink", align = "center" } = o;
      const color = tone === "ink" || tone === "muted" ? "#D7D7DD" : GRAD[tone][0];
      reveal(s, X(x), Y(y), size, 600, color, progress(t, at, 0.5), align, 0);
    },
    node(x, y, r, o = {}) {
      // A small glass bead with a coloured rim light.
      const { at = 0, tone = "accent" } = o;
      const p = expo(progress(t, at, 0.5));
      if (p <= 0) return;
      const cx = X(x);
      const cy = Y(y);
      const R = r * 0.7 * u;
      ctx.save();
      ctx.globalAlpha = p;
      const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, R * 0.1, cx, cy, R);
      body.addColorStop(0, "#5A5A66");
      body.addColorStop(0.6, "#1C1C22");
      body.addColorStop(1, "#0B0B0E");
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = body;
      ctx.fill();
      ctx.shadowColor = GRAD[tone][0];
      ctx.shadowBlur = 12 * u * p;
      ctx.lineWidth = 1.8 * u;
      ctx.strokeStyle = grad(cx - R, cy - R, cx + R, cy + R, tone);
      ctx.stroke();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      // The hero slab: a bevelled metal edge, a dark glass top with a glowing inner ring,
      // a floor reflection, and a highlight that sweeps across once it is lit.
      const { at = 0, tone = "accent" } = o;
      const p = expo(progress(t, at, 0.9));
      if (p <= 0) return;
      const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
      const r = Math.min(ww, hh) * 0.16;
      const depth = 12 * u;
      ctx.save();
      ctx.globalAlpha = p;
      // Reflection on the floor.
      const refl = ctx.createLinearGradient(0, tp + hh + depth, 0, tp + hh + depth + hh * 0.5);
      refl.addColorStop(0, "rgba(160,160,180,0.12)");
      refl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = refl;
      ctx.beginPath();
      ctx.roundRect(l, tp + hh + depth + 2 * u, ww, hh * 0.5, r);
      ctx.fill();
      // Metal edge.
      const metal = ctx.createLinearGradient(l, 0, l + ww, 0);
      metal.addColorStop(0, "#6E6E78");
      metal.addColorStop(0.5, "#E6E6EC");
      metal.addColorStop(1, "#5A5A64");
      ctx.beginPath();
      ctx.roundRect(l, tp + depth, ww, hh, r);
      ctx.fillStyle = metal;
      ctx.fill();
      // Top.
      const top = ctx.createLinearGradient(l, tp, l, tp + hh);
      top.addColorStop(0, "#26262E");
      top.addColorStop(1, "#0C0C10");
      ctx.beginPath();
      ctx.roundRect(l, tp, ww, hh, r);
      ctx.fillStyle = top;
      ctx.fill();
      ctx.lineWidth = 1.2 * u;
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.stroke();
      // Inner screen ring, which ignites after the key light.
      const ig = expo(progress(t, at + 0.5, 0.6));
      const inset = Math.min(ww, hh) * 0.12;
      ctx.beginPath();
      ctx.roundRect(l + inset, tp + inset, ww - inset * 2, hh - inset * 2, r * 0.6);
      ctx.fillStyle = "#07070A";
      ctx.fill();
      ctx.shadowColor = GRAD[tone][0];
      ctx.shadowBlur = 16 * u * ig;
      ctx.lineWidth = 1.8 * u;
      ctx.strokeStyle = grad(l, tp, l + ww, tp + hh, tone);
      ctx.globalAlpha = p * ig;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // The specular sweep.
      const sp = progress(t, at + 0.3, 1.2);
      if (sp > 0 && sp < 1) {
        ctx.globalAlpha = p;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(l, tp, ww, hh, r);
        ctx.clip();
        const sx = l - ww * 0.4 + ww * 1.8 * sp;
        const sg = ctx.createLinearGradient(sx - ww * 0.2, tp, sx + ww * 0.2, tp + hh);
        sg.addColorStop(0, "rgba(255,255,255,0)");
        sg.addColorStop(0.5, "rgba(255,255,255,0.16)");
        sg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = sg;
        ctx.fillRect(l, tp, ww, hh);
        ctx.restore();
      }
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const color =
        tone === "bad" ? "#FF4B55" : !head ? alpha(GRAD[tone][0], 0.6) : "rgba(220,220,228,0.8)";
      hairline(
        curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30),
        at,
        dur,
        color,
        head,
        head ? 1.6 : 1,
      );
    },
    store(x, y, w, h, o = {}) {
      // A soft-gradient card, tilted a touch, sliding in from the left like a photo tile.
      const { at = 0, tone = "accent" } = o;
      const p = expo(progress(t, at, 0.8));
      if (p <= 0) return;
      const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
      ctx.save();
      ctx.globalAlpha = p;
      ctx.translate(l + ww / 2 - (1 - p) * 80 * u, tp + hh / 2);
      ctx.rotate(-0.06 * p);
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 30 * u;
      ctx.shadowOffsetY = 14 * u;
      ctx.beginPath();
      ctx.roundRect(-ww / 2, -hh / 2, ww, hh, ww * 0.18);
      ctx.fillStyle = grad(-ww / 2, -hh / 2, ww / 2, hh / 2, tone);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.roundRect(-ww * 0.3, -hh * 0.28 + i * hh * 0.2, ww * 0.6, hh * 0.1, hh * 0.05);
        ctx.fill();
      }
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "accent" } = o;
      const p = progress(t, at, 0.6);
      if (p <= 0) return;
      const value = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${SANS}`;
      const tw = ctx.measureText(value).width;
      ctx.restore();
      const cy = Y(y);
      ctx.save();
      ctx.shadowColor = alpha(GRAD[tone][0], 0.55);
      ctx.shadowBlur = 30 * u;
      reveal(
        value,
        X(x),
        cy,
        size,
        800,
        grad(X(x) - tw / 2, 0, X(x) + tw / 2, 0, tone),
        p,
        "center",
        -0.03,
      );
      ctx.restore();
      if (sub)
        reveal(
          sub,
          X(x),
          cy - size * 0.75 * u,
          size * 0.28,
          500,
          "#A8A8B2",
          progress(t, at - 0.1, 0.6),
          "center",
          0,
        );
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const s = (o.size ?? 30) * u;
      const cx = X(x);
      const cy = Y(y);
      if (kind === "check")
        hairline(
          [
            [cx - s * 0.5, cy],
            [cx - s * 0.12, cy + s * 0.38],
            [cx + s * 0.55, cy - s * 0.45],
          ],
          at,
          0.45,
          GRAD.good[0],
          false,
          3,
        );
      else {
        // Two diagonals: a cross, not a minus.
        hairline(
          [
            [cx - s * 0.5, cy - s * 0.5],
            [cx + s * 0.5, cy + s * 0.5],
          ],
          at,
          0.3,
          "#FF4B55",
          false,
          3.5,
        );
        hairline(
          [
            [cx + s * 0.5, cy - s * 0.5],
            [cx - s * 0.5, cy + s * 0.5],
          ],
          at + 0.12,
          0.3,
          "#FF4B55",
          false,
          3.5,
        );
      }
    },
    finish() {
      const v = ctx.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.4,
        W / 2,
        H / 2,
        Math.hypot(W, H) * 0.6,
      );
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    },
  };
}

export default {
  id: "product-launch",
  name: "Keynote launch",
  category: "Popular Explainer Looks",
  make,
} satisfies Style;
