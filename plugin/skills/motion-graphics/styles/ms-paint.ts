// A crude bitmap painting made live in an old paint program: grey window,
// toolbox and colour palette round a white canvas. Shapes are dragged out
// with the ellipse and rectangle tools then flooded with the bucket, lines
// come off the line tool, text is typed into a dotted box, and a fat brush
// does the ticks. Everything aliased, at double pixels.
import {
  clamp,
  counting,
  curve,
  ellipse,
  frame,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
} from "./look.ts";

const INK: Record<Tone, string> = {
  ink: "#000000",
  accent: "#0000C0",
  good: "#008000",
  bad: "#E00000",
  muted: "#808080",
};
const FILL: Record<Tone, string> = {
  ink: "#FFFFFF",
  accent: "#FF80C0",
  good: "#80FF80",
  bad: "#FF8040",
  muted: "#C0C0C0",
};
const HAND = '"Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive';
const UI = "Tahoma, Verdana, Arial, sans-serif";
const SWATCH = [
  "#000000",
  "#808080",
  "#800000",
  "#808000",
  "#008000",
  "#008080",
  "#000080",
  "#800080",
  "#808040",
  "#004040",
  "#0080FF",
  "#004080",
  "#8000FF",
  "#804000",
  "#FFFFFF",
  "#C0C0C0",
  "#FF0000",
  "#FFFF00",
  "#00FF00",
  "#00FFFF",
  "#0000FF",
  "#FF00FF",
  "#FFFF80",
  "#00FF80",
  "#80FFFF",
  "#8080FF",
  "#FF0080",
  "#FF8040",
];

function make(ctx: any, t: number, m: any): Look {
  const full = frame(m);
  const { W, H } = full;
  const U = full.u;
  // The canvas inside the program window; 0-1 positions land on it.
  const cx0 = Math.round(W * 0.06);
  const cy0 = Math.round(H * 0.1);
  const cw = Math.round(W * 0.915);
  const ch = Math.round(H * 0.72);
  const S = 2;
  const bw = Math.round(cw / S);
  const bh = Math.round(ch / S);
  const g = globalThis as any;
  g.__paint ??= {};
  const st = g.__paint;
  if (!st.buf || st.buf.width !== bw) st.buf = new OffscreenCanvas(bw, bh);
  const c = st.buf.getContext("2d");
  const u = (full.u * 1.15) / S;
  const X = (x: number) => x * bw;
  const Y = (y: number) => y * bh;
  let tip: Pt | null = null;
  let tipAt = -1;
  const pen = (at: number, p: Pt) => {
    if (t >= at && at >= tipAt) {
      tipAt = at;
      tip = p;
    }
  };

  function stroke(pts: Pt[], color: string, width: number) {
    if (pts.length < 2) return;
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    for (const [i, [x, y]] of pts.entries()) i ? c.lineTo(x, y) : c.moveTo(x, y);
    c.stroke();
  }
  const upTo = (pts: Pt[], p: number) =>
    pts.slice(0, Math.max(2, Math.round(pts.length * clamp(p))));
  /** Typed text in a dotted text-tool box with a blinking caret while typing. */
  function typed(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    at: number,
    dur: number,
    align = "left",
    box = true,
  ) {
    const n = Math.ceil(s.length * progress(t, at, dur));
    c.font = `${Math.round(size * u)}px ${HAND}`;
    const tw = c.measureText(s).width;
    const x0 = align === "center" ? x - tw / 2 : align === "right" ? x - tw : x;
    const shown = s.slice(0, n);
    c.fillStyle = color;
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(shown, x0, y);
    const typing = n < s.length;
    if (box && (typing || t - at - dur < 0.4)) {
      c.save();
      c.setLineDash([2, 2]);
      c.strokeStyle = "#000080";
      c.lineWidth = 1;
      c.strokeRect(
        Math.round(x0 - 4) + 0.5,
        Math.round(y - size * u * 0.7) + 0.5,
        Math.round(tw + 10),
        Math.round(size * u * 1.4),
      );
      c.restore();
      if (Math.floor(t * 3) % 2 === 0) {
        c.fillStyle = "#000";
        c.fillRect(
          Math.round(x0 + c.measureText(shown).width + 1),
          Math.round(y - size * u * 0.45),
          1,
          Math.round(size * u * 0.9),
        );
      }
    }
    pen(at, [x0 + c.measureText(shown).width, y]);
  }
  function bevel(x: number, y: number, w: number, h: number, sunken = false) {
    ctx.fillStyle = sunken ? "#808080" : "#FFFFFF";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = sunken ? "#FFFFFF" : "#808080";
    ctx.fillRect(x + U, y + U, w - U, h - U);
    ctx.fillStyle = "#C0C0C0";
    ctx.fillRect(x + U, y + U, w - 2 * U, h - 2 * U);
  }

  return {
    surface() {
      c.imageSmoothingEnabled = false;
      c.fillStyle = "#FFFFFF";
      c.fillRect(0, 0, bw, bh);
    },
    title(text, o = {}) {
      const { x = 0.02, y = 0.07, size = 46, at = 0, dur = 0.9 } = o;
      if (t < at) return;
      typed(text, X(x), Y(y), size, "#000080", at, dur, o.align);
    },
    label(text, x, y, o = {}) {
      const { at = 0, dur = 0.4, size = 36, tone = "ink", align = "center" } = o;
      if (t < at) return;
      typed(text, X(x), Y(y), size, INK[tone], at, dur, align);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.3, tone = "accent" } = o;
      if (t < at) return;
      const p = progress(t, at, dur * 0.7);
      const rr = r * u * 1.3;
      const ring = ellipse(X(x), Y(y), rr, rr * 0.92, 32);
      // Bucket fill drops in once the outline is closed.
      if (progress(t, at, dur) >= 1) {
        c.fillStyle = FILL[tone];
        c.beginPath();
        c.ellipse(X(x), Y(y), rr, rr * 0.92, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = INK[tone === "accent" ? "bad" : tone];
        c.lineWidth = 1;
        c.beginPath();
        for (let i = 0; i < 3; i++)
          c.lineTo(X(x) - rr * 0.55 + i * rr * 0.55, Y(y) + (i % 2 ? -rr * 0.2 : rr * 0.15));
        c.stroke();
      }
      const shown = upTo(ring, p);
      stroke(shown, "#000", 1.6);
      if (p < 1) pen(at, shown.at(-1) as Pt);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.3, tone = "ink" } = o;
      if (t < at) return;
      // Dragged out from the top-left corner, then outlined twice.
      const p = progress(t, at, dur);
      const ww = X(w) * p;
      const hh = Y(h) * p;
      c.fillStyle = tone === "ink" ? "#FFFFFF" : FILL[tone];
      if (p >= 1) c.fillRect(X(x), Y(y), ww, hh);
      c.strokeStyle = "#000";
      c.lineWidth = 1.5;
      c.strokeRect(Math.round(X(x)) + 0.5, Math.round(Y(y)) + 0.5, Math.round(ww), Math.round(hh));
      if (p >= 1)
        c.strokeRect(
          Math.round(X(x)) + 2.5,
          Math.round(Y(y)) + 1.5,
          Math.round(ww) - 3,
          Math.round(hh) - 2,
        );
      pen(at, [X(x) + ww, Y(y) + hh]);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      if (t < at) return;
      const p = progress(t, at, dur);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const color = head ? INK[tone === "accent" ? "ink" : tone] : "#A0A0A0";
      const shown = upTo(pts, p);
      stroke(shown, color, head ? (tone === "bad" ? 2.6 : 1.6) : 0.8);
      if (head && p >= 1) {
        const e = pts.at(-1) as Pt;
        const q = pts.at(-3) as Pt;
        const a = Math.atan2(e[1] - q[1], e[0] - q[0]);
        const s = 9 * u * 1.8;
        stroke(
          [
            [e[0] - Math.cos(a - 0.5) * s, e[1] - Math.sin(a - 0.5) * s],
            e,
            [e[0] - Math.cos(a + 0.5) * s, e[1] - Math.sin(a + 0.5) * s],
          ],
          color,
          1.6,
        );
      }
      if (head && p < 1) pen(at, shown.at(-1) as Pt);
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (t < at) return;
      // A pile of pasted cards, one per paste, each a little further along.
      const n = 4;
      const cw2 = X(w) * 0.8;
      const ch2 = Y(h) * 0.7;
      for (let i = 0; i < n; i++) {
        const ta = at + (i * dur) / n;
        if (t < ta) continue;
        const px = Math.round(X(x) + i * X(w) * 0.07);
        const py = Math.round(Y(y) + i * Y(h) * 0.1);
        c.fillStyle = "#FFFFFF";
        c.fillRect(px, py, cw2, ch2);
        c.strokeStyle = "#000";
        c.lineWidth = 1;
        c.strokeRect(px + 0.5, py + 0.5, Math.round(cw2), Math.round(ch2));
        c.fillStyle = i % 2 ? "#804000" : "#FF8040";
        c.beginPath();
        c.arc(px + cw2 / 2, py + ch2 * 0.45, Math.min(cw2, ch2) * 0.25, 0, Math.PI * 2);
        c.fill();
        if (t - ta < 0.15) {
          c.save();
          c.setLineDash([2, 2]);
          c.strokeStyle = "#000080";
          c.strokeRect(px - 2.5, py - 2.5, Math.round(cw2) + 5, Math.round(ch2) + 5);
          c.restore();
        }
        pen(ta, [px + cw2, py + ch2]);
      }
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "ink" } = o;
      if (t < at) return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const px = size * 0.95;
      const yy = Y(y) - (sub ? px * u * 0.2 : 0);
      typed(s, X(x), yy, px, tone === "good" ? INK.good : "#000", at, 0.01, "center", t - at < dur);
      if (sub)
        typed(sub, X(x), Y(y) + px * u * 0.62, px * 0.3, "#000", at + 0.2, 0.3, "center", false);
      // Circled in red with the ellipse tool once it lands.
      if (sub && t > at + dur) {
        c.font = `${Math.round(px * u)}px ${HAND}`;
        const rx = c.measureText(s).width * 0.7;
        const ring = ellipse(X(x), yy, rx, px * u * 0.75, 40);
        stroke(upTo(ring, progress(t, at + dur, 0.3)), INK.bad, 2.2);
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 40 } = o;
      if (t < at) return;
      const r = size * u * 0.9;
      const p = progress(t, at, dur);
      const cx = X(x);
      const cy = Y(y);
      if (kind === "check") {
        const pts = curve([cx - r, cy - r * 0.1], [cx - r * 0.25, cy + r * 0.7], 0, 6).concat(
          curve([cx - r * 0.25, cy + r * 0.7], [cx + r * 1.1, cy - r * 0.9], 0.08, 10),
        );
        stroke(upTo(pts, p), INK.good, 4);
      } else {
        stroke(
          upTo(
            [
              [cx - r, cy - r],
              [cx + r, cy + r],
            ],
            p * 2,
          ),
          INK.bad,
          4,
        );
        if (p > 0.5)
          stroke(
            upTo(
              [
                [cx + r, cy - r],
                [cx - r, cy + r],
              ],
              p * 2 - 1,
            ),
            INK.bad,
            4,
          );
      }
    },
    finish() {
      // The program around the canvas.
      ctx.fillStyle = "#C0C0C0";
      ctx.fillRect(0, 0, W, H);
      const tb = H * 0.035;
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, "#000080");
      grad.addColorStop(1, "#1084D0");
      ctx.fillStyle = grad;
      ctx.fillRect(2 * U, 2 * U, W - 4 * U, tb);
      ctx.font = `bold ${Math.round(tb * 0.6)}px ${UI}`;
      ctx.fillStyle = "#FFF";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText("drawing.bmp - Paint program", 10 * U, 2 * U + tb / 2);
      for (let i = 0; i < 3; i++)
        bevel(W - (3 - i) * tb * 1.05 - 6 * U, 4 * U, tb * 0.95, tb - 4 * U);
      ctx.font = `${Math.round(tb * 0.55)}px ${UI}`;
      ctx.fillStyle = "#000";
      ["File", "Edit", "View", "Image", "Colors", "Help"].reduce((x, s) => {
        ctx.fillText(s, x, tb * 1.55);
        return x + ctx.measureText(s).width + 18 * U;
      }, 10 * U);
      // Toolbox.
      const bs = Math.min(W * 0.022, H * 0.045);
      for (let i = 0; i < 16; i++) {
        const bx = 6 * U + (i % 2) * bs;
        const by = cy0 + Math.floor(i / 2) * bs;
        bevel(bx, by, bs - U, bs - U, i === 9);
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1.2 * U;
        ctx.beginPath();
        const k = bs * 0.25;
        if (i % 4 === 0) ctx.rect(bx + k, by + k, bs - 2 * k, bs - 2 * k);
        else if (i % 4 === 1)
          ctx.ellipse(bx + bs / 2, by + bs / 2, bs * 0.25, bs * 0.2, 0, 0, Math.PI * 2);
        else if (i % 4 === 2) {
          ctx.moveTo(bx + k, by + bs - k);
          ctx.lineTo(bx + bs - k, by + k);
        } else {
          ctx.moveTo(bx + k, by + k);
          ctx.lineTo(bx + bs - k, by + k);
          ctx.moveTo(bx + bs / 2, by + k);
          ctx.lineTo(bx + bs / 2, by + bs - k);
        }
        ctx.stroke();
      }
      // Canvas well with scrollbars.
      ctx.fillStyle = "#808080";
      ctx.fillRect(cx0 - 3 * U, cy0 - 3 * U, cw + 6 * U, ch + 6 * U);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(st.buf, cx0, cy0, cw, ch);
      ctx.restore();
      // Palette.
      const py = cy0 + ch + 10 * U;
      const sw = Math.min(W * 0.022, H * 0.04);
      bevel(6 * U, py, sw * 2, sw * 2, true);
      ctx.fillStyle = "#FFF";
      ctx.fillRect(6 * U + sw * 0.8, py + sw * 0.8, sw * 0.9, sw * 0.9);
      ctx.fillStyle = "#000";
      ctx.fillRect(6 * U + sw * 0.3, py + sw * 0.3, sw * 0.9, sw * 0.9);
      SWATCH.forEach((col, i) => {
        const x = 10 * U + sw * 2.2 + (i % 14) * sw;
        const y = py + Math.floor(i / 14) * sw;
        bevel(x, y, sw - U, sw - U, true);
        ctx.fillStyle = col;
        ctx.fillRect(x + 2 * U, y + 2 * U, sw - 5 * U, sw - 5 * U);
      });
      // Status bar with the pointer's position.
      const sy = H - tb * 0.95;
      bevel(2 * U, sy, W * 0.7, tb * 0.85, true);
      bevel(W * 0.71, sy, W * 0.28, tb * 0.85, true);
      ctx.fillStyle = "#000";
      ctx.font = `${Math.round(tb * 0.5)}px ${UI}`;
      ctx.fillText("Ready. Pick a tool and draw on the canvas.", 8 * U, sy + tb * 0.42);
      if (tip) {
        const [tx, ty] = tip as Pt;
        ctx.fillText(`${Math.round(tx)},${Math.round(ty)}`, W * 0.72, sy + tb * 0.42);
        // A crosshair pointer on the canvas.
        const px = cx0 + tx * S;
        const pyy = cy0 + ty * S;
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1.5 * U;
        ctx.beginPath();
        ctx.moveTo(px - 10 * U, pyy);
        ctx.lineTo(px - 3 * U, pyy);
        ctx.moveTo(px + 3 * U, pyy);
        ctx.lineTo(px + 10 * U, pyy);
        ctx.moveTo(px, pyy - 10 * U);
        ctx.lineTo(px, pyy - 3 * U);
        ctx.moveTo(px, pyy + 3 * U);
        ctx.lineTo(px, pyy + 10 * U);
        ctx.stroke();
      }
    },
  };
}

export default {
  id: "ms-paint",
  name: "Paint program",
  category: "Retro UI & Neon",
  make,
} satisfies Style;
