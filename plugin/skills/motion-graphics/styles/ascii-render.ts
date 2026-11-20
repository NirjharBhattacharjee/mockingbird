// A demo-scene text-mode intro: everything lives on a monospace character
// grid over a dark plasma glow. Shapes are rasterised into characters by
// brightness, boxes are box-drawing lines, links are runs of slashes and
// dashes, and the headline and big numbers are built from solid blocks in hot
// gradients that scan in row by row.
import {
  counting,
  curve,
  frame,
  hash,
  type Look,
  type Pt,
  progress,
  type Style,
  type Tone,
} from "./look.ts";

const TONE: Record<Tone, string> = {
  ink: "#4FE3FF",
  accent: "#FFD84A",
  good: "#4CFF7A",
  bad: "#FF3B5C",
  muted: "#7A5CC8",
};
const MONO = '"JetBrains Mono", "Noto Color Emoji", monospace';
const RAMP = " .:-=+*#%@";

function make(ctx: any, t: number, m: any): Look {
  const { W, H, u, X, Y } = frame(m);
  const cw = 17 * u;
  const rh = 31 * u;
  const font = `bold ${Math.round(rh * 0.78)}px ${MONO}`;
  const col = (x: number) => Math.round(x / cw);
  const row = (y: number) => Math.round(y / rh);
  const g = globalThis as any;
  g.__ascii ??= { bits: new Map() };
  const st = g.__ascii;

  /** Draw characters at grid cells, one colour per call. */
  function cells(list: [number, number, string][], color: string, glow = 0) {
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = glow * u;
    }
    for (const [c, r, ch] of list) ctx.fillText(ch, c * cw, r * rh);
    ctx.restore();
  }
  /** A string laid on the grid, one character per cell. */
  function line(s: string, x: number, y: number, color: string, align = "left", bg?: string) {
    const c0 = col(
      align === "center" ? x - (s.length * cw) / 2 : align === "right" ? x - s.length * cw : x,
    );
    const r = row(y);
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect((c0 - 0.5) * cw - 2 * u, (r - 0.5) * rh, s.length * cw + 4 * u, rh);
    }
    cells(
      [...s].map((ch, i) => [c0 + i, r, ch] as [number, number, string]),
      color,
    );
  }
  /** A small bitmap of `s` (each lit pixel becomes one block), cached. */
  function bitmap(s: string) {
    let b = st.bits.get(s);
    if (!b) {
      if (st.bits.size > 400) st.bits.clear();
      const px = 9;
      const probe = new OffscreenCanvas(4, 4).getContext("2d");
      probe.font = `bold ${px}px "Inter", "Noto Color Emoji", sans-serif`;
      const w = Math.ceil(probe.measureText(s).width) + 2;
      const h = 11;
      const cv = new OffscreenCanvas(w, h);
      const c = cv.getContext("2d", { willReadFrequently: true });
      c.font = probe.font;
      c.fillStyle = "#fff";
      c.textBaseline = "middle";
      c.fillText(s, 1, h / 2 + 0.5);
      const d = c.getImageData(0, 0, w, h).data;
      const on: [number, number][] = [];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) if ((d[(y * w + x) * 4 + 3] as number) > 110) on.push([x, y]);
      b = { w, h, on };
      st.bits.set(s, b);
    }
    return b;
  }
  /** Block lettering in a vertical two-colour gradient, scanning in from the top. */
  function blocks(
    s: string,
    x: number,
    y: number,
    size: number,
    top: string,
    bottom: string,
    at: number,
    dur: number,
    align = "left",
  ) {
    const b = bitmap(s);
    const k = (size * u) / 9;
    const w = b.w * k;
    const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    const y0 = y - (b.h * k) / 2;
    const rows = Math.floor(progress(t, at, dur) * (b.h + 1));
    const gr = ctx.createLinearGradient(0, y0 + k * 2, 0, y0 + b.h * k - k * 2);
    gr.addColorStop(0, top);
    gr.addColorStop(1, bottom);
    ctx.save();
    ctx.fillStyle = gr;
    ctx.shadowColor = bottom;
    ctx.shadowBlur = 10 * u;
    for (const [px, py] of b.on)
      if (py < rows) ctx.fillRect(x0 + px * k, y0 + py * k, k * 0.86, k * 0.86);
    if (rows <= b.h) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(x0, y0 + rows * k, w, k * 0.5);
    }
    ctx.restore();
  }
  function dots() {
    const key = `${W}x${H}`;
    if (st.key === key) return st.dots;
    const cv = new OffscreenCanvas(W, H);
    const c = cv.getContext("2d");
    c.fillStyle = "rgba(150,90,220,0.16)";
    for (let y = rh / 2; y < H; y += rh / 2)
      for (let x = cw / 2; x < W; x += cw) c.fillRect(x, y, 1.4 * u, 1.4 * u);
    st.key = key;
    st.dots = cv;
    return cv;
  }

  return {
    surface() {
      ctx.fillStyle = "#07040C";
      ctx.fillRect(0, 0, W, H);
      // A slow plasma glow under the grid.
      for (let i = 0; i < 3; i++) {
        const px = W * (0.5 + 0.35 * Math.sin(t * 0.4 + i * 2.1));
        const py = H * (0.5 + 0.3 * Math.cos(t * 0.33 + i * 1.7));
        const gr = ctx.createRadialGradient(px, py, 0, px, py, W * 0.4);
        gr.addColorStop(
          0,
          ["rgba(120,30,140,0.22)", "rgba(30,60,160,0.2)", "rgba(160,30,80,0.16)"][i],
        );
        gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.drawImage(dots(), 0, 0);
    },
    title(text, o = {}) {
      const { x = 0.035, y = 0.06, size = 46, at = 0, dur = 0.9 } = o;
      if (t < at) return;
      blocks(
        text.toUpperCase(),
        X(x),
        Y(y) + size * u * 0.6,
        size,
        "#FFE14A",
        "#FF2E4A",
        at,
        dur,
        o.align,
      );
    },
    label(text, x, y, o = {}) {
      const { at = 0, dur = 0.3, tone = "ink", align = "center" } = o;
      if (t < at) return;
      const n = Math.ceil(text.length * progress(t, at, dur));
      const s = text.toLowerCase().slice(0, n) + (n < text.length ? "_" : "");
      if (tone === "ink" || tone === "muted") line(s, X(x), Y(y), TONE[tone], align);
      else line(s, X(x), Y(y), "#07040C", align, TONE[tone]);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.3, tone = "accent" } = o;
      if (t < at) return;
      // A ball shaded by a light from the top left, rastered into characters.
      const rr = r * u * 1.9;
      const c0 = col(X(x));
      const r0 = row(Y(y));
      const rx = Math.ceil(rr / cw);
      const ry = Math.ceil(rr / rh);
      const shown = -ry + Math.floor(progress(t, at, dur) * (ry * 2 + 1));
      const list: [number, number, string][] = [];
      for (let j = -ry; j <= Math.min(ry, shown); j++)
        for (let i = -rx; i <= rx; i++) {
          const dx = (i * cw) / rr;
          const dy = (j * rh) / rr;
          const d = dx * dx + dy * dy;
          if (d > 1.05) continue;
          const z = Math.sqrt(Math.max(0, 1 - d));
          const l = Math.max(0, -dx * 0.5 - dy * 0.5 + z * 0.7);
          list.push([c0 + i, r0 + j, RAMP[Math.min(9, 2 + Math.floor(l * 8))] as string]);
        }
      cells(list, TONE[tone], 6);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.35, tone = "ink" } = o;
      if (t < at) return;
      const [c0, r0, c1, r1] = [col(X(x)), row(Y(y)), col(X(x + w)), row(Y(y + h))];
      const ring: [number, number, string][] = [];
      for (let c = c0; c <= c1; c++) ring.push([c, r0, c === c0 ? "┌" : c === c1 ? "┐" : "─"]);
      for (let r = r0 + 1; r < r1; r++) ring.push([c1, r, "│"]);
      for (let c = c1; c >= c0; c--) ring.push([c, r1, c === c0 ? "└" : c === c1 ? "┘" : "─"]);
      for (let r = r1 - 1; r > r0; r--) ring.push([c0, r, "│"]);
      cells(
        ring.slice(0, Math.ceil(ring.length * progress(t, at, dur))),
        tone === "ink" ? TONE.ink : TONE[tone],
        4,
      );
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (t < at) return;
      const p = progress(t, at, dur);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 60);
      const seen = new Set<string>();
      const list: [number, number, string][] = [];
      const n = Math.max(2, Math.round(pts.length * p));
      for (let i = 1; i < n; i++) {
        const a = pts[i - 1] as Pt;
        const b = pts[i] as Pt;
        const c = col(b[0]);
        const r = row(b[1]);
        const key = `${c},${r}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const an = Math.atan2((b[1] - a[1]) / rh, (b[0] - a[0]) / cw);
        const deg = ((an * 180) / Math.PI + 360) % 180;
        list.push([
          c,
          r,
          head ? (deg < 22 || deg > 158 ? "-" : deg < 68 ? "\\" : deg < 112 ? "|" : "/") : ".",
        ]);
      }
      if (head && p >= 1 && list.length) {
        const e = pts.at(-1) as Pt;
        const q = pts.at(-6) as Pt;
        const dx = e[0] - q[0];
        const dy = e[1] - q[1];
        const last = list.at(-1) as [number, number, string];
        last[2] = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? ">" : "<") : dy > 0 ? "v" : "^";
      }
      cells(list, head ? TONE[tone] : TONE.muted, head ? 5 : 0);
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (t < at) return;
      // A drum of records in characters, printed a row at a time.
      const [c0, r0, c1, r1] = [col(X(x)), row(Y(y)), col(X(x + w)), row(Y(y + h))];
      const span = c1 - c0;
      const rows = r1 - r0;
      const shown = Math.floor(progress(t, at, dur) * (rows + 1));
      const edge: [number, number, string][] = [];
      const fill: [number, number, string][] = [];
      for (let j = 0; j <= Math.min(rows, shown); j++) {
        const r = r0 + j;
        const capped = j === 0 || j === rows;
        edge.push([c0, r, capped ? "(" : "|"], [c1, r, capped ? ")" : "|"]);
        for (let i = 1; i < span; i++) {
          const ch = j === 0 ? "_" : j === rows ? "_" : j % 2 ? ":" : "=";
          (capped ? edge : fill).push([c0 + i, r, ch]);
        }
      }
      cells(edge, TONE.ink, 4);
      cells(fill, "#FF4FD8", 4);
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "ink" } = o;
      if (t < at) return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const big = size * 1.1;
      const [top, bottom] =
        tone === "good"
          ? ["#B8FF5A", "#1FD8A0"]
          : tone === "bad"
            ? ["#FFE14A", "#FF2E4A"]
            : ["#5AF0FF", "#4A5CFF"];
      blocks(s, X(x), Y(y) - (sub ? big * u * 0.25 : 0), big, top, bottom, at, 0.25, "center");
      if (sub) line(`${sub} ^`, X(x), Y(y) + big * u * 0.7, TONE.ink, "center");
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.25, size = 40 } = o;
      if (t < at) return;
      const r = size * u * 0.7;
      const pts: Pt[] =
        kind === "check"
          ? [
              ...curve([X(x) - r, Y(y)], [X(x) - r * 0.3, Y(y) + r * 0.8], 0, 4),
              ...curve([X(x) - r * 0.3, Y(y) + r * 0.8], [X(x) + r * 1.2, Y(y) - r], 0, 8),
            ]
          : [
              ...curve([X(x) - r, Y(y) - r], [X(x) + r, Y(y) + r], 0, 6),
              ...curve([X(x) + r, Y(y) - r], [X(x) - r, Y(y) + r], 0, 6),
            ];
      const n = Math.ceil(pts.length * progress(t, at, dur));
      const seen = new Set<string>();
      const list: [number, number, string][] = [];
      for (const [px, py] of pts.slice(0, n)) {
        const key = `${col(px)},${row(py)}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push([col(px), row(py), "#"]);
        }
      }
      cells(list, kind === "check" ? TONE.good : TONE.bad, 8);
    },
    finish() {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      for (let y = 0; y < H; y += 3 * u) ctx.fillRect(0, y, W, 1.2 * u);
      // A page counter in the corner, like a scrolling document.
      ctx.save();
      ctx.font = `${Math.round(rh * 0.5)}px ${MONO}`;
      ctx.fillStyle = "rgba(79,227,255,0.5)";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `${1 + Math.floor(t / 2.5)}/4  ${String(Math.floor(hash(Math.floor(t * 4)) * 999)).padStart(3, "0")}`,
        W - cw * 2,
        rh,
      );
      ctx.restore();
    },
  };
}

export default {
  id: "ascii-render",
  name: "Text-mode demo",
  category: "Retro Digital",
  make,
} satisfies Style;
