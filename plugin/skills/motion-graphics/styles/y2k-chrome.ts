// Millennium liquid chrome on a pale lilac haze: mercury blobs that wobble
// and drop in with a springy overshoot, inflated chrome lettering, frosted
// glass panels and glossy pill labels, iridescent ribbons for links, soap
// bubbles drifting and star glints twinkling.
import {
  alpha,
  clamp,
  counting,
  curve,
  frame,
  hash,
  type Look,
  leftOf,
  type Pt,
  progress,
  type Style,
  spring,
  type Tone,
} from "./look.ts";

const TONE: Record<Tone, string> = {
  ink: "#3A3F7A",
  accent: "#7A6CFF",
  good: "#22B573",
  bad: "#FF4D7D",
  muted: "#9A95C8",
};
const ROUND = '"Nunito", "Noto Color Emoji", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const pop = (at: number) => spring(t, { start: at, stiffness: 180, damping: 11 });

  /** Polished chrome: bright top, a dark horizon, a cool lilac floor. */
  function metal(y0: number, y1: number) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, "#FFFFFF");
    g.addColorStop(0.3, "#B3BFEF");
    g.addColorStop(0.5, "#3F4592");
    g.addColorStop(0.6, "#7F8CDA");
    g.addColorStop(0.8, "#F2E8FF");
    g.addColorStop(1, "#B7A6F0");
    return g;
  }
  /** Inflated chrome type: soft drop, lilac rim, metal fill, a white gloss line. */
  function bubble(s: string, x: number, y: number, px: number, align = "center") {
    ctx.save();
    ctx.font = `800 ${Math.round(px)}px ${ROUND}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(90,70,170,0.35)";
    ctx.shadowBlur = 14 * u;
    ctx.shadowOffsetY = 6 * u;
    ctx.lineWidth = px * 0.14;
    ctx.strokeStyle = "#6E5FD0";
    ctx.strokeText(s, x, y);
    ctx.shadowColor = "transparent";
    ctx.lineWidth = px * 0.05;
    ctx.strokeStyle = "#FFFFFF";
    ctx.strokeText(s, x, y);
    ctx.fillStyle = metal(y - px * 0.5, y + px * 0.5);
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  /** A frosted, rounded glass shape. */
  function glass(x: number, y: number, w: number, h: number, r: number, tint = "#FFFFFF") {
    ctx.save();
    ctx.shadowColor = "rgba(90,70,170,0.22)";
    ctx.shadowBlur = 24 * u;
    ctx.shadowOffsetY = 8 * u;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, alpha(tint, 0.85));
    g.addColorStop(1, alpha(tint, 0.5));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 1.5 * u;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.stroke();
    ctx.restore();
  }
  function glint(x: number, y: number, s: number, a: number) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? s * 0.18 : s;
      const an = (i / 8) * Math.PI * 2;
      ctx.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
    }
    ctx.fill();
    ctx.restore();
  }
  /** A mercury blob: a wobbling outline filled with environment chrome. */
  function blob(cx: number, cy: number, r: number, seed: number, tone: Tone) {
    const pts: Pt[] = Array.from({ length: 40 }, (_, i) => {
      const a = (i / 40) * Math.PI * 2;
      const k =
        1 + 0.07 * Math.sin(a * 3 + t * 2.2 + seed) + 0.05 * Math.sin(a * 5 - t * 1.7 + seed * 2);
      return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k];
    });
    ctx.save();
    ctx.shadowColor = "rgba(90,70,170,0.35)";
    ctx.shadowBlur = r * 0.6;
    ctx.shadowOffsetY = r * 0.25;
    ctx.beginPath();
    for (const [i, [x, y]] of pts.entries()) i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    ctx.closePath();
    ctx.fillStyle = metal(cy - r, cy + r);
    ctx.fill();
    ctx.shadowColor = "transparent";
    // An iridescent rim tinted by tone.
    const rim = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    rim.addColorStop(0, "#9FF3FF");
    rim.addColorStop(0.5, TONE[tone]);
    rim.addColorStop(1, "#FFB3E6");
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1.5, r * 0.12);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.35, cy - r * 0.45, r * 0.28, r * 0.14, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return {
    surface() {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#E9E4FF");
      g.addColorStop(0.5, "#D9D2FA");
      g.addColorStop(1, "#C9C2F2");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const haze = ctx.createRadialGradient(W * 0.2, H * 0.15, 0, W * 0.2, H * 0.15, W * 0.4);
      haze.addColorStop(0, "rgba(170,240,255,0.45)");
      haze.addColorStop(1, "rgba(170,240,255,0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, W, H);
      // Soap bubbles drifting upward.
      ctx.save();
      for (let i = 0; i < 9; i++) {
        const r = (10 + hash(i * 4.1) * 22) * u;
        const x = hash(i * 2.7) * W + Math.sin(t * 0.7 + i) * 10 * u;
        const y = H - (((t * (12 + hash(i) * 18) * u + hash(i * 5.3) * H) % (H + r * 2)) - r);
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = 1.2 * u;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(160,230,255,0.5)";
        ctx.beginPath();
        ctx.arc(x, y, r * 0.8, Math.PI * 1.1, Math.PI * 1.5);
        ctx.stroke();
      }
      ctx.restore();
    },
    title(text, o = {}) {
      const { x = 0.035, y = 0.06, size = 38, at = 0 } = o;
      if (t < at) return;
      // A glossy pill tag, gliding up.
      const k = pop(at);
      ctx.save();
      ctx.globalAlpha = clamp(k);
      ctx.font = `700 ${Math.round(size * u)}px ${ROUND}`;
      const tw = ctx.measureText(text).width;
      const ph = size * u * 1.7;
      const yy = Y(y) + (1 - k) * 20 * u;
      const left = leftOf(X(x), tw + 36 * u, o.align);
      glass(left, yy, tw + 36 * u, ph, ph / 2);
      ctx.fillStyle = TONE.ink;
      ctx.textBaseline = "middle";
      ctx.fillText(text, left + 18 * u, yy + ph / 2);
      ctx.restore();
    },
    label(text, x, y, o = {}) {
      const { at = 0, size = 36, tone = "ink", align = "center" } = o;
      if (t < at) return;
      const k = pop(at);
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${ROUND}`;
      const tw = ctx.measureText(text).width;
      const ph = size * u * 1.6;
      const cx =
        align === "center"
          ? X(x)
          : align === "right"
            ? X(x) - tw / 2 - 16 * u
            : X(x) + tw / 2 + 16 * u;
      ctx.translate(cx, Y(y));
      ctx.scale(k, k);
      glass(-tw / 2 - 16 * u, -ph / 2, tw + 32 * u, ph, ph / 2);
      ctx.fillStyle = tone === "ink" ? TONE.ink : TONE[tone];
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 0, 0);
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      if (t < at) return;
      // A droplet that falls in, overshoots and settles.
      const k = pop(at);
      if (k <= 0) return;
      blob(X(x), Y(y) - (1 - clamp(k)) * 40 * u, r * u * 1.15 * k, x * 17 + y * 5, tone);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      if (t < at) return;
      const k = pop(at);
      ctx.save();
      ctx.globalAlpha = clamp(k * 1.5);
      ctx.translate(0, (1 - k) * 30 * u);
      glass(X(x), Y(y), X(w), Y(h), 26 * u, tone === "good" ? "#F0FFF8" : "#FFFFFF");
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "accent" } = o;
      if (t < at) return;
      const p = progress(t, at, dur);
      const e1 = 1 - (1 - p) ** 3;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * e1)));
      ctx.save();
      ctx.lineCap = "round";
      const rib = ctx.createLinearGradient(X(x1), Y(y1), X(x2), Y(y2));
      if (tone === "bad") {
        rib.addColorStop(0, "#FF9FC2");
        rib.addColorStop(1, "#FF4D7D");
      } else {
        rib.addColorStop(0, "#46CFFF");
        rib.addColorStop(0.5, "#9A7BFF");
        rib.addColorStop(1, "#FF6FCB");
      }
      ctx.strokeStyle = rib;
      ctx.lineWidth = (head ? 6 : 1.8) * u;
      if (!head) ctx.globalAlpha = 0.75;
      ctx.beginPath();
      for (const [i, [px, py]] of shown.entries()) i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      ctx.stroke();
      if (head) {
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 1.5 * u;
        ctx.stroke();
      }
      if (head && p >= 1) {
        const e = pts.at(-1) as Pt;
        const q = pts.at(-3) as Pt;
        const a = Math.atan2(e[1] - q[1], e[0] - q[0]);
        const s = 16 * u;
        ctx.fillStyle = tone === "bad" ? "#FF4D7D" : "#FF9FE0";
        ctx.beginPath();
        ctx.moveTo(e[0] + Math.cos(a) * 4 * u, e[1] + Math.sin(a) * 4 * u);
        ctx.lineTo(e[0] - Math.cos(a - 0.55) * s, e[1] - Math.sin(a - 0.55) * s);
        ctx.lineTo(e[0] - Math.cos(a + 0.55) * s, e[1] - Math.sin(a + 0.55) * s);
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (t < at) return;
      // A stack of glossy chrome discs, each dropping in on a spring.
      const n = 4;
      const rx = X(w) / 2;
      const ry = rx * 0.32;
      const cx = X(x + w / 2);
      const gap = (Y(h) - ry * 2) / (n - 1);
      for (let i = 0; i < n; i++) {
        const k = pop(at + (i * dur) / n);
        if (k <= 0) continue;
        const cy = Y(y + h) - ry - i * gap - (1 - clamp(k)) * 30 * u;
        const th = gap * 0.7;
        ctx.save();
        ctx.globalAlpha = clamp(k * 2);
        const side = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
        side.addColorStop(0, "#8D93D6");
        side.addColorStop(0.3, "#FFFFFF");
        side.addColorStop(0.6, "#A7B3EE");
        side.addColorStop(1, "#6E73B8");
        ctx.fillStyle = side;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
        ctx.lineTo(cx - rx, cy - th);
        ctx.ellipse(cx, cy - th, rx, ry, 0, Math.PI, 0, true);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = metal(cy - th - ry, cy - th + ry);
        ctx.beginPath();
        ctx.ellipse(cx, cy - th, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1.2 * u;
        ctx.stroke();
        ctx.restore();
      }
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "accent" } = o;
      if (t < at) return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const k = pop(at);
      ctx.save();
      ctx.translate(X(x), Y(y) - (sub ? size * u * 0.2 : 0));
      ctx.scale(k, k);
      bubble(s, 0, 0, size * u * 1.15);
      ctx.restore();
      if (sub) {
        ctx.save();
        ctx.font = `700 ${Math.round(size * u * 0.26)}px ${ROUND}`;
        ctx.fillStyle = TONE[tone === "accent" ? "accent" : tone];
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = clamp((t - at - 0.3) / 0.3);
        ctx.fillText(sub, X(x), Y(y) + size * u * 0.65);
        ctx.restore();
      }
      glint(
        X(x) + size * u * 0.9,
        Y(y) - size * u * 0.6,
        14 * u * (0.6 + 0.4 * Math.sin(t * 4)),
        clamp((t - at - dur) / 0.3),
      );
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 40 } = o;
      if (t < at) return;
      const k = pop(at);
      const r = size * u * 0.7 * k;
      if (r <= 0) return;
      const cx = X(x);
      const cy = Y(y);
      ctx.save();
      const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
      g.addColorStop(0, kind === "check" ? "#9AF5C8" : "#FFB0C8");
      g.addColorStop(1, kind === "check" ? TONE.good : TONE.bad);
      ctx.fillStyle = g;
      ctx.shadowColor = "rgba(90,70,170,0.3)";
      ctx.shadowBlur = 10 * u;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = r * 0.22;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      if (kind === "check") {
        ctx.moveTo(cx - r * 0.45, cy);
        ctx.lineTo(cx - r * 0.1, cy + r * 0.35);
        ctx.lineTo(cx + r * 0.5, cy - r * 0.35);
      } else {
        ctx.moveTo(cx - r * 0.35, cy - r * 0.35);
        ctx.lineTo(cx + r * 0.35, cy + r * 0.35);
        ctx.moveTo(cx + r * 0.35, cy - r * 0.35);
        ctx.lineTo(cx - r * 0.35, cy + r * 0.35);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      for (let i = 0; i < 6; i++) {
        const a = Math.sin(t * 2.5 + i * 1.9);
        glint(hash(i * 6.1) * W, hash(i * 8.3) * H, 10 * u, a > 0.6 ? (a - 0.6) * 2.5 : 0);
      }
    },
  };
}

export default {
  id: "y2k-chrome",
  name: "Liquid chrome",
  category: "Retro UI & Neon",
  make,
} satisfies Style;
