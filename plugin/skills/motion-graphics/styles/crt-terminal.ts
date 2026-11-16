// A green-phosphor terminal in a plastic case: everything glows one green on
// near-black glass, text types out behind a block cursor, boxes are line
// drawings traced by the beam, a status line sits in inverse video at the
// bottom, and the tube warms up from a single bright line. Scanlines, a slow
// hum bar and a dark curved edge finish it.
import {
  counting,
  curve,
  frame,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
} from "./look.ts";

const GLOW: Record<Tone, string> = {
  ink: "#4DFF7A",
  accent: "#9CFFB4",
  good: "#4DFF7A",
  bad: "#4DFF7A",
  muted: "#1F9A44",
};
const BG = "#031207";
const MONO = '"VT323", "Menlo", "Consolas", "Courier New", monospace';

function make(ctx: any, t: number, m: any): Look {
  const full = frame(m);
  // The glass sits inside a bezel; 0-1 positions map onto the glass.
  const gx = full.W * 0.045;
  const gy = full.H * 0.05;
  const gw = full.W * 0.91;
  const gh = full.H * 0.83;
  const u = full.u * 0.88;
  const X = (x: number) => gx + x * gw;
  const Y = (y: number) => gy + y * gh;
  const W = gw;

  function glow(color: string, blur = 10) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * u;
  }
  function say(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align = "left",
    cursor = false,
  ) {
    ctx.save();
    ctx.font = `${Math.round(size * u)}px ${MONO}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    glow(color);
    ctx.fillText(s, x, y);
    if (cursor && Math.floor(t * 2.5) % 2 === 0) {
      const tw = ctx.measureText(s).width;
      const x0 = align === "center" ? x + tw / 2 : align === "right" ? x : x + tw;
      ctx.fillRect(x0 + 3 * u, y - size * u * 0.42, size * u * 0.55, size * u * 0.84);
    }
    ctx.restore();
    ctx.font = `${Math.round(size * u)}px ${MONO}`;
    return ctx.measureText(s).width;
  }
  function beam(pts: Pt[], color: string, width = 2.4, dash?: number[]) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.lineJoin = "miter";
    if (dash) ctx.setLineDash(dash.map((d) => d * u));
    glow(color, 9);
    ctx.beginPath();
    for (const [i, [x, y]] of pts.entries()) i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    ctx.stroke();
    ctx.restore();
  }
  /** The first `p` of a closed rectangle's outline, as the beam traces it. */
  function rectPath(x: number, y: number, w: number, h: number, p: number): Pt[] {
    const pts: Pt[] = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
      [x, y],
    ];
    const per = 2 * (w + h);
    let left = per * p;
    const out: Pt[] = [pts[0] as Pt];
    for (let i = 1; i < pts.length && left > 0; i++) {
      const a = pts[i - 1] as Pt;
      const b = pts[i] as Pt;
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const f = Math.min(1, left / l);
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      left -= l;
    }
    return out;
  }
  const chars = (s: string, at: number, cps = 28) =>
    s.slice(0, Math.max(0, Math.floor((t - at) * cps)));

  return {
    surface() {
      const { W: FW, H: FH } = full;
      ctx.fillStyle = "#2B2A26";
      ctx.fillRect(0, 0, FW, FH);
      ctx.fillStyle = "#1A1916";
      ctx.beginPath();
      ctx.roundRect(gx - 12 * u, gy - 12 * u, gw + 24 * u, gh + 24 * u, 34 * u);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(gx, gy, gw, gh, 26 * u);
      ctx.clip();
      ctx.fillStyle = BG;
      ctx.fillRect(gx, gy, gw, gh);
      // Leave the clip on: everything after draws on the glass; finish() restores.
      const warm = progress(t, 0, 0.45);
      if (warm < 1) {
        const lh = Math.max(2, gh * warm ** 3);
        ctx.fillStyle = `rgba(160,255,190,${1 - warm * 0.6})`;
        ctx.fillRect(gx + gw * (0.5 - warm), gy + gh / 2 - lh / 2, gw * warm * 2, lh);
      }
      // Status line in inverse video.
      const sy = gy + gh - 34 * u;
      ctx.save();
      glow(GLOW.ink, 8);
      ctx.fillStyle = GLOW.muted;
      ctx.fillRect(gx + 30 * u, sy - 12 * u, gw - 60 * u, 24 * u);
      ctx.restore();
      say(` TTY1  ${String(Math.floor(t * 10)).padStart(4, "0")}  READY`, gx + 34 * u, sy, 24, BG);
    },
    title(text, o = {}) {
      const { x = 0.035, y = 0.06, size = 60, at = 0 } = o;
      if (t < at) return;
      const s = chars(`> ${text}`, at, 22);
      const typing = s.length < text.length + 2;
      say(s, X(x), Y(y) + 20 * u, size, GLOW.ink, "left", typing || t - at < 2.5);
      if (!typing) {
        ctx.save();
        ctx.font = `${Math.round(size * u)}px ${MONO}`;
        const tw = ctx.measureText(s).width;
        ctx.restore();
        say(
          "=".repeat(Math.round(tw / (size * u * 0.6))),
          X(x),
          Y(y) + 20 * u + size * u * 0.75,
          size * 0.6,
          GLOW.muted,
        );
      }
    },
    label(text, x, y, o = {}) {
      const { at = 0, size = 34, tone = "ink", align = "center" } = o;
      if (t < at) return;
      const s = chars(tone === "bad" ? `! ${text}` : text, at);
      say(s, X(x), Y(y), size, GLOW[tone], align, s.length < text.length);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.25, tone = "accent" } = o;
      if (t < at) return;
      const p = progress(t, at, dur);
      const rr = r * u;
      const pts: Pt[] = Array.from({ length: 25 }, (_, i) => {
        const a = -Math.PI / 2 + (i / 24) * Math.PI * 2 * p;
        return [X(x) + Math.cos(a) * rr, Y(y) + Math.sin(a) * rr];
      });
      beam(pts, GLOW[tone], 2.2);
      if (p >= 1) {
        ctx.save();
        glow(GLOW[tone], 12);
        ctx.fillStyle = GLOW[tone];
        ctx.fillRect(X(x) - rr * 0.3, Y(y) - rr * 0.3, rr * 0.6, rr * 0.6);
        ctx.restore();
      }
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.4, tone = "ink" } = o;
      if (t < at) return;
      const p = progress(t, at, dur);
      beam(rectPath(X(x), Y(y), w * W, h * gh, p), GLOW[tone], 2.4);
      if (p >= 1)
        beam(
          rectPath(X(x) + 6 * u, Y(y) + 6 * u, w * W - 12 * u, h * gh - 12 * u, 1),
          GLOW.muted,
          1.4,
        );
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (t < at) return;
      const p = progress(t, at, dur);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      const color = head ? GLOW[tone] : GLOW.muted;
      beam(shown, color, head ? 2.2 : 1.1, tone === "bad" ? [10, 7] : undefined);
      if (head && p >= 1) {
        const e = pts.at(-1) as Pt;
        const q = pts.at(-3) as Pt;
        const a = Math.atan2(e[1] - q[1], e[0] - q[0]);
        const s = 16 * u;
        beam(
          [
            [e[0] - Math.cos(a - 0.5) * s, e[1] - Math.sin(a - 0.5) * s],
            e,
            [e[0] - Math.cos(a + 0.5) * s, e[1] - Math.sin(a + 0.5) * s],
          ],
          color,
          2.2,
        );
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (t < at) return;
      // A log of records streaming in, inside a traced frame.
      beam(rectPath(X(x), Y(y), w * W, h * gh, progress(t, at, 0.3)), GLOW.ink, 2);
      const lines = Math.floor((h * gh - 14 * u) / (20 * u));
      const shown = Math.min(lines, Math.floor(progress(t, at + 0.2, dur) * lines * 1.5));
      for (let i = 0; i < shown; i++) {
        const id = 4800 + Math.floor((t - at) * 40) + i * 7;
        say(`rec${String(id).slice(-3)}`, X(x) + 8 * u, Y(y) + 16 * u + i * 20 * u, 18, GLOW.muted);
      }
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "accent" } = o;
      if (t < at) return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const done = progress(t, at, dur) >= 1;
      const big = size * 1.15;
      const yy = Y(y) - (sub ? big * u * 0.25 : 0);
      if (done && sub) {
        // Inverse video for emphasis once it lands.
        ctx.save();
        ctx.font = `${Math.round(big * u)}px ${MONO}`;
        const tw = ctx.measureText(s).width;
        glow(GLOW.accent, 16);
        ctx.fillStyle = GLOW.accent;
        ctx.fillRect(X(x) - tw / 2 - 10 * u, yy - big * u * 0.48, tw + 20 * u, big * u * 0.92);
        ctx.restore();
        say(s, X(x), yy, big, BG, "center");
      } else say(s, X(x), yy, big, GLOW[tone], "center");
      if (sub) say(sub, X(x), Y(y) + big * u * 0.6, big * 0.32, GLOW.ink, "center");
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.25, size = 40 } = o;
      if (t < at) return;
      const r = size * u * 0.7;
      const p = progress(t, at, dur);
      const cx = X(x);
      const cy = Y(y);
      if (kind === "check") {
        const pts: Pt[] = [
          [cx - r, cy],
          [cx - r * 0.3, cy + r * 0.7],
          [cx + r, cy - r * 0.8],
        ];
        beam(pts.slice(0, p < 0.5 ? 2 : 3), GLOW.good, 3);
      } else {
        beam(
          [
            [cx - r, cy - r],
            [cx + r, cy + r],
          ],
          GLOW.bad,
          3,
        );
        if (p > 0.5)
          beam(
            [
              [cx + r, cy - r],
              [cx - r, cy + r],
            ],
            GLOW.bad,
            3,
          );
      }
    },
    finish() {
      const { W: FW, H: FH } = full;
      // Scanlines, a rolling hum bar, the tube's dark curved edge.
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      for (let y = gy; y < gy + gh; y += 3 * full.u) ctx.fillRect(gx, y, gw, 1.2 * full.u);
      const hy = gy + ((t * 0.18) % 1.2) * gh - gh * 0.1;
      const hb = ctx.createLinearGradient(0, hy - gh * 0.08, 0, hy + gh * 0.08);
      hb.addColorStop(0, "rgba(120,255,160,0)");
      hb.addColorStop(0.5, "rgba(120,255,160,0.05)");
      hb.addColorStop(1, "rgba(120,255,160,0)");
      ctx.fillStyle = hb;
      ctx.fillRect(gx, hy - gh * 0.08, gw, gh * 0.16);
      const v = ctx.createRadialGradient(
        gx + gw / 2,
        gy + gh / 2,
        gh * 0.4,
        gx + gw / 2,
        gy + gh / 2,
        gw * 0.62,
      );
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.7)");
      ctx.fillStyle = v;
      ctx.fillRect(gx, gy, gw, gh);
      const glass = ctx.createLinearGradient(gx, gy, gx + gw * 0.4, gy + gh * 0.5);
      glass.addColorStop(0, "rgba(255,255,255,0.06)");
      glass.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glass;
      ctx.fillRect(gx, gy, gw, gh);
      ctx.restore();
      // Below the glass: a power light and a small badge.
      ctx.fillStyle = "#58FF8A";
      ctx.shadowColor = "#58FF8A";
      ctx.shadowBlur = 8 * full.u;
      ctx.beginPath();
      ctx.arc(FW * 0.94, FH * 0.95, 5 * full.u, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#77746B";
      ctx.font = `${Math.round(14 * full.u)}px ${MONO}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText("MODEL 80  TERMINAL", FW * 0.05, FH * 0.95);
    },
  };
}

export default {
  id: "crt-terminal",
  name: "Phosphor terminal",
  category: "Retro Digital",
  make,
} satisfies Style;
