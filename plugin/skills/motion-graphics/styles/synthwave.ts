// An 80s night-drive poster: a striped sun sinking behind wireframe
// mountains, a neon grid racing toward camera, stars. Things arrive as neon
// tubes that flicker on, chrome lettering that slams in with a flash, and
// beams that draw themselves with a hot glowing tip.
import {
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
} from "./look.ts";

const NEON: Record<Tone, string> = {
  ink: "#3FE8FF",
  accent: "#FF3FD0",
  good: "#5CFFB8",
  bad: "#FF3B5C",
  muted: "#B38CFF",
};
const SANS = '"Montserrat", "Noto Color Emoji", sans-serif';

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const HZ = H * 0.6;
  const g = globalThis as any;
  g.__synth ??= {};
  const st = g.__synth;

  /** A neon tube flickers on over its first few tenths of a second. */
  const lit = (at: number) => {
    const s = t - at;
    if (s < 0) return 0;
    if (s > 0.35) return 1;
    return hash(Math.floor(s * 40) + at * 13) > 0.4 ? 0.4 + s * 1.7 : 0.1;
  };
  function neon(draw: () => void, color: string, a = 1, blur = 16) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * u;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    draw();
    ctx.restore();
  }
  /** Brushed chrome: a sky-to-ground gradient split at the middle, for type. */
  function chrome(y: number, size: number) {
    const gr = ctx.createLinearGradient(0, y - size * 0.55, 0, y + size * 0.55);
    gr.addColorStop(0, "#E9F4FF");
    gr.addColorStop(0.45, "#6FA8E8");
    gr.addColorStop(0.5, "#4A2F7A");
    gr.addColorStop(0.62, "#C06AA0");
    gr.addColorStop(1, "#FFE3F6");
    return gr;
  }
  function chromeText(
    s: string,
    x: number,
    y: number,
    size: number,
    align = "center",
    outline = NEON.accent,
  ) {
    ctx.save();
    ctx.font = `italic 800 ${Math.round(size)}px ${SANS}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.shadowColor = outline;
    ctx.shadowBlur = 14 * u;
    ctx.lineWidth = Math.max(2, size * 0.06);
    ctx.strokeStyle = outline;
    ctx.strokeText(s, x, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = chrome(y, size);
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  function backdrop() {
    const key = `${W}x${H}`;
    if (st.key === key) return st.bg;
    const bg = new OffscreenCanvas(W, H);
    const c = bg.getContext("2d");
    const sky = c.createLinearGradient(0, 0, 0, HZ);
    sky.addColorStop(0, "#0B0420");
    sky.addColorStop(0.6, "#2A0B4A");
    sky.addColorStop(1, "#6A1A6E");
    c.fillStyle = sky;
    c.fillRect(0, 0, W, HZ);
    for (let i = 0; i < 120; i++) {
      c.fillStyle = `rgba(255,255,255,${0.3 + hash(i * 9.1) * 0.6})`;
      const s = (hash(i * 2.2) > 0.9 ? 2.2 : 1.2) * u;
      c.fillRect(hash(i * 3.3) * W, hash(i * 7.7) * HZ * 0.8, s, s);
    }
    // The sun, banded in its lower half.
    const sr = H * 0.24;
    const sx = W * 0.5;
    const sy = HZ - sr * 0.35;
    const sun = c.createLinearGradient(0, sy - sr, 0, sy + sr);
    sun.addColorStop(0, "#FFE96A");
    sun.addColorStop(0.5, "#FF9A3C");
    sun.addColorStop(1, "#FF2E8A");
    c.save();
    // The stripes are clipped out of the sun as it's drawn: erasing them afterwards
    // would cut through the sky behind it too, which shares this canvas.
    c.beginPath();
    c.rect(0, 0, W, H);
    for (let i = 0; i < 7; i++) {
      const y = sy + sr * (-0.15 + i * 0.17);
      c.rect(sx - sr, y, sr * 2, sr * (0.03 + i * 0.022));
    }
    c.clip("evenodd");
    c.shadowColor = "#FF5AA0";
    c.shadowBlur = 60 * u;
    c.beginPath();
    c.arc(sx, sy, sr, 0, Math.PI * 2);
    c.fillStyle = sun;
    c.fill();
    c.restore();
    // Wireframe mountains either side.
    for (const side of [-1, 1]) {
      const pts: Pt[] = [];
      for (let i = 0; i <= 12; i++) {
        const f = i / 12;
        const x = W / 2 + side * (W * 0.12 + f * W * 0.4);
        const hgt = Math.sin(f * Math.PI) * (0.6 + hash(i * 4.3 + side) * 0.6) * H * 0.17;
        pts.push([x, HZ - hgt]);
      }
      c.beginPath();
      c.moveTo(W / 2 + side * W * 0.12, HZ);
      for (const [x, y] of pts) c.lineTo(x, y);
      c.lineTo(W / 2 + side * W * 0.52, HZ);
      c.closePath();
      c.fillStyle = "#1E0A3A";
      c.fill();
      c.strokeStyle = "#B046FF";
      c.lineWidth = 1.4 * u;
      c.stroke();
      c.strokeStyle = "rgba(176,70,255,0.5)";
      for (const [x, y] of pts) {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(W / 2 + side * W * 0.12 + (x - W / 2 - side * W * 0.12) * 0.6, HZ);
        c.stroke();
      }
    }
    c.fillStyle = "#12041F";
    c.fillRect(0, HZ, W, H - HZ);
    st.key = key;
    st.bg = bg;
    return bg;
  }

  return {
    surface() {
      ctx.drawImage(backdrop(), 0, 0);
      // The grid floor, horizontal lines racing toward camera.
      ctx.save();
      ctx.strokeStyle = "#FF3FD0";
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath();
      for (let i = -14; i <= 14; i++) {
        ctx.moveTo(W / 2 + i * W * 0.02, HZ);
        ctx.lineTo(W / 2 + i * W * 0.16, H);
      }
      const scroll = (t * 0.9) % 1;
      for (let k = 0; k < 14; k++) {
        const z = (k + 1 - scroll) / 14;
        const y = HZ + (H - HZ) * z ** 2.2;
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 6 * u;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#FFB0F0";
      ctx.lineWidth = 2.5 * u;
      ctx.beginPath();
      ctx.moveTo(0, HZ);
      ctx.lineTo(W, HZ);
      ctx.stroke();
      ctx.restore();
    },
    title(text, o = {}) {
      const { x = 0.035, y = 0.06, size = 58, at = 0 } = o;
      if (t < at) return;
      // Slams in from big, with a white flash.
      const s = spring(t, { start: at, from: 1.8, to: 1, stiffness: 320, damping: 22 });
      ctx.save();
      ctx.translate(X(x), Y(y) + size * u * 0.6);
      ctx.scale(s, s);
      ctx.globalAlpha = clamp((t - at) / 0.08);
      chromeText(text.toUpperCase(), 0, 0, size * u, o.align ?? "left");
      ctx.restore();
      const flash = 1 - clamp((t - at - 0.12) / 0.25);
      if (flash > 0 && t - at > 0.1) {
        ctx.fillStyle = `rgba(255,240,255,${flash * 0.35})`;
        ctx.fillRect(0, 0, W, H);
      }
    },
    label(text, x, y, o = {}) {
      const { at = 0, size = 40, tone = "ink", align = "center" } = o;
      const a = lit(at);
      if (!a) return;
      neon(
        () => {
          ctx.font = `italic 700 ${Math.round(size * u)}px ${SANS}`;
          ctx.textAlign = align;
          ctx.textBaseline = "middle";
          ctx.fillText(text.toUpperCase(), X(x), Y(y));
        },
        NEON[tone],
        a,
        12,
      );
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const a = lit(at);
      if (!a) return;
      // A neon wireframe globe.
      const rr = r * u;
      const spin = t * 1.5;
      neon(
        () => {
          ctx.lineWidth = 2 * u;
          ctx.beginPath();
          ctx.arc(X(x), Y(y), rr, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = 1.1 * u;
          ctx.beginPath();
          ctx.ellipse(X(x), Y(y), rr, rr * 0.35, 0, 0, Math.PI * 2);
          ctx.ellipse(X(x), Y(y), Math.abs(Math.cos(spin)) * rr, rr, 0, 0, Math.PI * 2);
          ctx.stroke();
        },
        NEON[tone],
        a,
        12,
      );
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const a = lit(at);
      if (!a) return;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(14,4,32,0.78)";
      ctx.beginPath();
      ctx.roundRect(X(x), Y(y), X(w), Y(h), 10 * u);
      ctx.fill();
      ctx.restore();
      neon(
        () => {
          ctx.lineWidth = 2.5 * u;
          ctx.beginPath();
          ctx.roundRect(X(x), Y(y), X(w), Y(h), 10 * u);
          ctx.stroke();
        },
        NEON[tone],
        a,
      );
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (t < at) return;
      const p = progress(t, at, dur);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      const color = head ? NEON[tone] : alpha(NEON.muted, 0.55);
      neon(
        () => {
          ctx.lineWidth = (head ? 2.6 : 1.2) * u;
          ctx.lineCap = "round";
          ctx.beginPath();
          for (const [i, [px, py]] of shown.entries()) i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          ctx.stroke();
          if (head && p >= 1) {
            const e = pts.at(-1) as Pt;
            const q = pts.at(-3) as Pt;
            const an = Math.atan2(e[1] - q[1], e[0] - q[0]);
            const s = 16 * u;
            ctx.beginPath();
            ctx.moveTo(e[0] - Math.cos(an - 0.5) * s, e[1] - Math.sin(an - 0.5) * s);
            ctx.lineTo(e[0], e[1]);
            ctx.lineTo(e[0] - Math.cos(an + 0.5) * s, e[1] - Math.sin(an + 0.5) * s);
            ctx.stroke();
          }
        },
        color,
        1,
        head ? 14 : 0,
      );
      if (p < 1 && head) {
        const e = shown.at(-1) as Pt;
        neon(() => {
          ctx.beginPath();
          ctx.arc(e[0], e[1], 4 * u, 0, Math.PI * 2);
          ctx.fill();
        }, "#FFFFFF");
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "ink" } = o;
      if (t < at) return;
      // Stacked neon discs that light one after another.
      const n = 4;
      const rx = X(w) / 2;
      const ry = rx * 0.3;
      const cx = X(x + w / 2);
      for (let i = 0; i < n; i++) {
        const a = lit(at + (i * dur) / n);
        if (!a) continue;
        const cy = Y(y + h) - ry - (i * (Y(h) - ry * 2)) / (n - 1);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = "rgba(14,4,32,0.85)";
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        neon(
          () => {
            ctx.lineWidth = 2 * u;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.stroke();
          },
          i % 2 ? NEON.accent : NEON[tone],
          a,
          12,
        );
      }
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "accent" } = o;
      if (t < at) return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const k = spring(t, { start: at, from: 0.6, to: 1, stiffness: 260, damping: 16 });
      ctx.save();
      ctx.translate(X(x), Y(y) - (sub ? size * u * 0.2 : 0));
      ctx.scale(k, k);
      chromeText(s, 0, 0, size * u * 1.1, "center", NEON[tone]);
      ctx.restore();
      if (sub)
        neon(
          () => {
            ctx.font = `italic 700 ${Math.round(size * u * 0.3)}px ${SANS}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(sub.toUpperCase(), X(x), Y(y) + size * u * 0.6);
          },
          NEON.ink,
          lit(at + 0.3),
          10,
        );
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 40 } = o;
      const a = lit(at);
      if (!a) return;
      const r = size * u * 0.6;
      const cx = X(x);
      const cy = Y(y);
      neon(
        () => {
          ctx.lineWidth = 3.5 * u;
          ctx.lineCap = "round";
          ctx.beginPath();
          if (kind === "check") {
            ctx.moveTo(cx - r, cy);
            ctx.lineTo(cx - r * 0.3, cy + r * 0.7);
            ctx.lineTo(cx + r, cy - r * 0.8);
          } else {
            ctx.moveTo(cx - r, cy - r);
            ctx.lineTo(cx + r, cy + r);
            ctx.moveTo(cx + r, cy - r);
            ctx.lineTo(cx - r, cy + r);
          }
          ctx.stroke();
        },
        kind === "check" ? NEON.good : NEON.bad,
        a,
      );
    },
    finish() {
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (let y = 0; y < H; y += 4 * u) ctx.fillRect(0, y, W, 1.5 * u);
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.65);
      v.addColorStop(0, "rgba(10,0,30,0)");
      v.addColorStop(1, "rgba(10,0,30,0.6)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    },
  };
}

export default {
  id: "synthwave",
  name: "Neon night drive",
  category: "Retro UI & Neon",
  make,
} satisfies Style;
