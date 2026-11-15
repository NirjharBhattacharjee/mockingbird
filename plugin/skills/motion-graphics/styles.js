// plugin/skills/motion-graphics/kit.ts
var DIR = decodeURIComponent(new URL(".", import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1").replace(/\/$/, "");
var FACES = { display: "system-ui", serif: "Charter", mono: "Menlo" };
var THEMES = {
  night: {
    bg: ["#05060B", "#0C0E1A"],
    glows: ["#6E56CF", "#2563EB", "#DB2777"],
    dark: true,
    glow: 0.5,
    ink: "#F5F5F7",
    mute: "rgba(245,245,247,0.62)",
    accent: "#A78BFA",
    accent2: "#60A5FA",
    onAccent: "#0B0B12",
    ...FACES
  },
  punch: {
    bg: ["#09090B", "#18181B"],
    glows: ["#FACC15", "#F97316", "#E11D48"],
    dark: true,
    glow: 0.3,
    ink: "#FFFFFF",
    mute: "rgba(255,255,255,0.7)",
    accent: "#FACC15",
    accent2: "#FB923C",
    onAccent: "#0A0A0A",
    ...FACES
  },
  studio: {
    bg: ["#F5F5F7", "#DCDDE3"],
    glows: ["#FFFFFF", "#C7D2FE", "#FBCFE8"],
    dark: false,
    glow: 0.75,
    ink: "#1D1D1F",
    mute: "rgba(29,29,31,0.6)",
    accent: "#0071E3",
    accent2: "#7C3AED",
    onAccent: "#FFFFFF",
    ...FACES
  },
  neon: {
    bg: ["#14072E", "#3A0C5C"],
    glows: ["#FF3CAC", "#22D3EE", "#7C3AED"],
    dark: true,
    glow: 0.55,
    ink: "#FFFFFF",
    mute: "rgba(255,255,255,0.7)",
    accent: "#22D3EE",
    accent2: "#FF3CAC",
    onAccent: "#14072E",
    ...FACES
  },
  paper: {
    bg: ["#F4EAD5", "#E6D3AE"],
    glows: ["#FFF7E6", "#F2C27B", "#E9A27A"],
    dark: false,
    glow: 0.6,
    ink: "#2B2118",
    mute: "rgba(43,33,24,0.62)",
    accent: "#C1272D",
    accent2: "#1D3557",
    onAccent: "#FFF7E6",
    ...FACES
  }
};
var clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
var lerp = (a, b, p) => a + (b - a) * p;
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function alpha(hex, a) {
  if (!hex.startsWith("#"))
    return hex;
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}
function spring(t, { from = 0, to = 1, start = 0, stiffness = 100, damping = 10, mass = 1 } = {}) {
  const s = t - start;
  if (s <= 0)
    return from;
  const w = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  let done;
  if (zeta < 1) {
    const wd = w * Math.sqrt(1 - zeta ** 2);
    done = 1 - Math.exp(-zeta * w * s) * (Math.cos(wd * s) + zeta * w / wd * Math.sin(wd * s));
  } else if (zeta === 1) {
    done = 1 - Math.exp(-w * s) * (1 + w * s);
  } else {
    const root = w * Math.sqrt(zeta ** 2 - 1);
    const [r1, r2] = [-zeta * w + root, -zeta * w - root];
    done = 1 - (r2 * Math.exp(r1 * s) - r1 * Math.exp(r2 * s)) / (r2 - r1);
  }
  return from + (to - from) * done;
}
var GRAIN = new URL("assets/grain.png", import.meta.url).href;
var pictures = new Map;

// plugin/skills/motion-graphics/styles/look.ts
function frame(m) {
  const W = m.width;
  const H = m.height;
  const u = Math.min(W, H) / 1080;
  return { W, H, u, X: (x) => x * W, Y: (y) => y * H };
}
var progress = (t, at = 0, dur = 0.5) => clamp((t - at) / (dur || 0.000001));
function along(points, p) {
  const lengths = points.slice(1).map((q, i) => {
    const a = points[i];
    return Math.hypot(q[0] - a[0], q[1] - a[1]);
  });
  let left = lengths.reduce((s, l) => s + l, 0) * clamp(p);
  const out = [points[0]];
  let angle = 0;
  for (let i = 0;i < lengths.length && left > 0; i++) {
    const a = points[i];
    const b = points[i + 1];
    const l = lengths[i];
    const f = Math.min(1, left / (l || 1));
    out.push([lerp(a[0], b[0], f), lerp(a[1], b[1], f)]);
    angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    left -= l;
  }
  return { points: out, angle };
}
function roughen(points, wobble, seed) {
  return points.map(([x, y], i) => [
    x + (hash(seed + i * 1.7) - 0.5) * 2 * wobble,
    y + (hash(seed + i * 2.3 + 9) - 0.5) * 2 * wobble
  ]);
}
function curve(a, b, bend = 0, n = 24) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const c = [
    (a[0] + b[0]) / 2 + (a[1] - b[1]) * bend,
    (a[1] + b[1]) / 2 + (b[0] - a[0]) * bend
  ];
  return Array.from({ length: n + 1 }, (_, i) => {
    const s = i / n;
    return [
      (1 - s) ** 2 * a[0] + 2 * (1 - s) * s * c[0] + s ** 2 * b[0],
      (1 - s) ** 2 * a[1] + 2 * (1 - s) * s * c[1] + s ** 2 * b[1]
    ];
  });
}
function ellipse(cx, cy, rx, ry, n = 48, from = -Math.PI / 2, turn = 1) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = from + i / n * Math.PI * 2 * turn;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
}
function trace(ctx, points, close = false) {
  ctx.beginPath();
  for (const [i, [x, y]] of points.entries())
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  if (close)
    ctx.closePath();
}
function arrowhead(ctx, tip, angle, size, open = true) {
  const a = [tip[0] - Math.cos(angle - 0.45) * size, tip[1] - Math.sin(angle - 0.45) * size];
  const b = [tip[0] - Math.cos(angle + 0.45) * size, tip[1] - Math.sin(angle + 0.45) * size];
  trace(ctx, [a, tip, b], !open);
}
function counting(t, at, dur, [from, to]) {
  const p = clamp((t - at) / (dur || 0.000001));
  const e = p === 1 ? 1 : 1 - 2 ** (-10 * p);
  return Math.round(lerp(from, to, e)).toLocaleString("en-US");
}

// plugin/skills/motion-graphics/styles/comic.ts
var INK = "#141414";
var PAPER = "#F2EAD7";
var CREAM = "#FDF9EE";
var FILL = {
  ink: CREAM,
  accent: "#FFE45C",
  good: "#3F72C9",
  bad: "#E63946",
  muted: "#E9DFC6"
};
var LETTER = '"Bangers", "Impact", "Haettenschweiler", "Arial Narrow", sans-serif';
function make(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const letter = (size) => `italic 400 ${Math.round(size * u)}px ${LETTER}`;
  const pop = (at = 0) => spring(t, { start: at, stiffness: 260, damping: 14 });
  const g = globalThis;
  g.__comicDots ??= new Map;
  const cache = g.__comicDots;
  function halftone(x, y, w, h, light, dark) {
    const key = `${Math.round(w)}x${Math.round(h)}:${light}:${dark}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(Math.ceil(w), Math.ceil(h));
      const c = tile.getContext("2d");
      c.fillStyle = light;
      c.fillRect(0, 0, w, h);
      c.fillStyle = dark;
      const s = 18 * u;
      for (let row = 0, py = 0;py < h + s; row++, py += s * 0.87) {
        for (let px = row % 2 ? s / 2 : 0;px < w + s; px += s) {
          const f = clamp(px / w * 0.6 + py / h * 0.4);
          c.beginPath();
          c.arc(px, py, s * (0.12 + 0.46 * f), 0, Math.PI * 2);
          c.fill();
        }
      }
      cache.set(key, tile);
    }
    ctx.drawImage(tile, x, y);
  }
  function letters(s, cx, cy, size, color = INK, align = "center") {
    ctx.font = letter(size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s.toUpperCase(), cx, cy);
  }
  function popped(cx, cy, at, draw) {
    const s = pop(at);
    if (s <= 0)
      return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }
  return {
    surface() {
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      const m0 = 0.02 * H;
      halftone(m0, m0, W - m0 * 2, H - m0 * 2, "#B9CDEB", "#3F72C9");
      ctx.lineWidth = 7 * u;
      ctx.strokeStyle = INK;
      ctx.strokeRect(m0, m0, W - m0 * 2, H - m0 * 2);
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.06, size = 40, at = 0 } = o;
      if (t < at)
        return;
      ctx.save();
      ctx.globalAlpha = clamp((t - at) / 0.2);
      ctx.font = letter(size);
      const tw = ctx.measureText(s.toUpperCase()).width + 34 * u;
      ctx.fillStyle = "#FFE45C";
      ctx.fillRect(X(x), Y(y), tw, size * 1.5 * u);
      ctx.lineWidth = 4 * u;
      ctx.strokeStyle = INK;
      ctx.strokeRect(X(x), Y(y), tw, size * 1.5 * u);
      letters(s, X(x) + 16 * u, Y(y) + size * 0.78 * u, size, INK, "left");
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      popped(X(x), Y(y), o.at, () => letters(s, X(x), Y(y), o.size ?? 34, INK, o.align ?? "center"));
    },
    node(x, y, r, o = {}) {
      popped(X(x), Y(y), o.at, () => {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), r * u, 0, Math.PI * 2);
        ctx.fillStyle = FILL[o.tone ?? "accent"];
        ctx.fill();
        ctx.lineWidth = 5 * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
      });
    },
    box(x, y, w, h, o = {}) {
      popped(X(x + w / 2), Y(y + h / 2), o.at, () => {
        ctx.fillStyle = FILL[o.tone ?? "ink"];
        ctx.fillRect(X(x), Y(y), X(w), Y(h));
        ctx.lineWidth = 6 * u;
        ctx.strokeStyle = INK;
        ctx.strokeRect(X(x), Y(y), X(w), Y(h));
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      const p = clamp((t - at) / dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      trace(ctx, shown);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 20 * u;
      ctx.stroke();
      trace(ctx, shown);
      ctx.strokeStyle = FILL[tone === "ink" ? "accent" : tone];
      ctx.lineWidth = 12 * u;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 38 * u, false);
        ctx.fillStyle = FILL[tone === "ink" ? "accent" : tone];
        ctx.fill();
        ctx.lineWidth = 5 * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      popped(X(x + w / 2), Y(y + h / 2), o.at, () => {
        const n = 4;
        for (let i = n - 1;i >= 0; i--) {
          const cy = Y(y) + Y(h) / n * i;
          ctx.beginPath();
          ctx.roundRect(X(x) + i * 6 * u, cy, X(w), Y(h) / n - 6 * u, 10 * u);
          ctx.fillStyle = i % 2 ? "#FFE45C" : CREAM;
          ctx.fill();
          ctx.lineWidth = 5 * u;
          ctx.strokeStyle = INK;
          ctx.stroke();
        }
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "bad" } = o;
      popped(X(x), Y(y), at, () => {
        const r = size * 2 * u;
        ctx.save();
        ctx.translate(X(x), Y(y));
        ctx.rotate(Math.sin(t * 9) * 0.02);
        const n = 16;
        const pts = Array.from({ length: n * 2 }, (_, i) => {
          const a = i / (n * 2) * Math.PI * 2;
          const rr = i % 2 ? r * 0.7 : r * (0.95 + hash(i) * 0.12);
          return [Math.cos(a) * rr, Math.sin(a) * rr];
        });
        trace(ctx, pts, true);
        ctx.fillStyle = FILL[tone];
        ctx.fill();
        ctx.lineWidth = 6 * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
        const color = tone === "ink" || tone === "accent" ? INK : CREAM;
        letters(count ? counting(t, at, dur, count) + s : s, 0, sub ? -size * 0.15 * u : 0, size, color);
        if (sub)
          letters(sub, 0, size * 0.62 * u, size * 0.36, color);
        ctx.restore();
      });
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 40) * u;
      popped(X(x), Y(y), o.at, () => {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), r, 0, Math.PI * 2);
        ctx.fillStyle = kind === "check" ? "#2563EB" : "#E63946";
        ctx.fill();
        ctx.lineWidth = 5 * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.lineWidth = 9 * u;
        ctx.strokeStyle = CREAM;
        ctx.lineCap = "round";
        const [cx, cy] = [X(x), Y(y)];
        if (kind === "check")
          trace(ctx, [[cx - r * 0.45, cy], [cx - r * 0.1, cy + r * 0.35], [cx + r * 0.5, cy - r * 0.35]]);
        else {
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.4, cy - r * 0.4);
          ctx.lineTo(cx + r * 0.4, cy + r * 0.4);
          ctx.moveTo(cx + r * 0.4, cy - r * 0.4);
          ctx.lineTo(cx - r * 0.4, cy + r * 0.4);
        }
        ctx.stroke();
      });
    },
    finish() {}
  };
}
var comic_default = { id: "comic", name: "Halftone comic", category: "Print", make };

// plugin/skills/motion-graphics/styles/whiteboard.ts
var INK2 = {
  ink: "#22262B",
  accent: "#2F5BD3",
  good: "#1F9254",
  bad: "#D9343F",
  muted: "#7A8088"
};
var HAND = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive';
function make2(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  let tip = null;
  let seed = 1;
  function ink(points, { at = 0, dur = 0.6, tone = "ink", width = 9 } = {}) {
    const p = progress(t, at, dur);
    seed += 1;
    if (p <= 0)
      return;
    const { points: drawn } = along(roughen(points, 1.2 * u, seed * 13.1), p);
    const col = INK2[tone];
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    trace(ctx, drawn);
    ctx.strokeStyle = alpha(col, 0.92);
    ctx.lineWidth = width * u;
    ctx.stroke();
    trace(ctx, drawn);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = width * 0.38 * u;
    ctx.stroke();
    ctx.restore();
    const end = drawn.at(-1);
    if (p < 1)
      tip = { x: end[0], y: end[1], color: col };
  }
  function write(s, x, y, o = {}) {
    const { at = 0, size = 40, tone = "ink", align = "left" } = o;
    const dur = o.dur ?? 0.05 * s.length + 0.1;
    const p = progress(t, at, dur);
    if (p <= 0)
      return;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${HAND}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.beginPath();
    ctx.rect(left - 4 * u, Y(y) - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = INK2[tone];
    ctx.fillText(s, left, Y(y));
    ctx.restore();
    if (p < 1)
      tip = { x: left + w * p, y: Y(y), color: INK2[tone] };
  }
  return {
    surface() {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#F7F8F7");
      g.addColorStop(1, "#E8EAE9");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const sheen = ctx.createRadialGradient(W * 0.3, H * 0.15, 0, W * 0.3, H * 0.15, Math.max(W, H) * 0.7);
      sheen.addColorStop(0, "rgba(255,255,255,0.7)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.strokeStyle = "rgba(60,70,80,0.014)";
      for (let i = 0;i < 9; i++) {
        ctx.lineWidth = (30 + hash(i) * 50) * u;
        ctx.beginPath();
        ctx.ellipse(hash(i + 3) * W, hash(i + 7) * H, (60 + hash(i + 11) * 140) * u, (25 + hash(i + 13) * 60) * u, hash(i) * 3, 0, 5);
        ctx.stroke();
      }
      ctx.restore();
      const f = 16 * u;
      const metal = (x, y, w, h, vertical) => {
        const mg = vertical ? ctx.createLinearGradient(x, 0, x + w, 0) : ctx.createLinearGradient(0, y, 0, y + h);
        mg.addColorStop(0, "#D9DDE1");
        mg.addColorStop(0.5, "#AEB4BA");
        mg.addColorStop(1, "#80878F");
        ctx.fillStyle = mg;
        ctx.fillRect(x, y, w, h);
      };
      metal(0, 0, W, f, false);
      metal(0, 0, f, H, true);
      metal(W - f, 0, f, H, true);
      metal(0, H - f * 2.2, W, f * 2.2, false);
      ["accent", "ink"].forEach((c, i) => {
        const x = W * (0.72 + i * 0.07);
        const y = H - f * 1.35;
        ctx.fillStyle = "#F4F4F4";
        ctx.beginPath();
        ctx.roundRect(x, y, 90 * u, 14 * u, 7 * u);
        ctx.fill();
        ctx.fillStyle = INK2[c];
        ctx.beginPath();
        ctx.roundRect(x + 64 * u, y, 26 * u, 14 * u, 7 * u);
        ctx.fill();
      });
      ctx.fillStyle = "#2E3236";
      ctx.beginPath();
      ctx.roundRect(W * 0.05, H - f * 1.5, 110 * u, 18 * u, 4 * u);
      ctx.fill();
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 64, at = 0 } = o;
      write(s.toUpperCase(), x, y, { ...o, size, at, align: o.align ?? "left" });
      const done = at + (o.dur ?? 0.05 * s.length + 0.1);
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${HAND}`;
      const w = ctx.measureText(s.toUpperCase()).width / W;
      ctx.restore();
      ink(curve([X(x), Y(y) + size * 0.7 * u], [X(x + w), Y(y) + size * 0.75 * u], -0.02, 16), {
        at: done,
        dur: 0.35,
        tone: "accent",
        width: 8
      });
    },
    label(s, x, y, o = {}) {
      write(s, x, y, { size: 32, align: "center", ...o });
    },
    node(x, y, r, o = {}) {
      ink(ellipse(X(x), Y(y), r * u, r * u, 46, -Math.PI / 2, 1.05), { dur: 0.15, width: 5, ...o });
    },
    box(x, y, w, h, o = {}) {
      const a = [X(x), Y(y)];
      const b = [X(x + w), Y(y + h)];
      ink([a, [b[0], a[1]], b, [a[0], b[1]], [a[0], a[1] - 2 * u]], { dur: 0.45, ...o });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true } = o;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      ink(shaft, { ...o, at, dur, width: o.tone === "accent" ? 3 : 7 });
      if (!head)
        return;
      const end = shaft.at(-1);
      const prev = shaft.at(-3);
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 22 * u;
      ink([
        [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
        end,
        [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s]
      ], { ...o, at: at + dur, dur: 0.12 });
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.28;
      const top = Y(y) + ry;
      const bottom = Y(y + h) - ry;
      const half = (cy) => ellipse(cx, cy, rx, ry, 32, 0, 0.5);
      const step = dur / 5;
      ink(ellipse(cx, top, rx, ry, 32, Math.PI, 1), { ...o, at, dur: step * 1.5 });
      ink([[cx - rx, top], [cx - rx, bottom]], { ...o, at: at + step * 1.5, dur: step * 0.7 });
      ink(half(bottom), { ...o, at: at + step * 2.2, dur: step });
      ink([[cx + rx, bottom], [cx + rx, top]], { ...o, at: at + step * 3.2, dur: step * 0.6 });
      ink(half(top + (bottom - top) / 3), { ...o, at: at + step * 3.8, dur: step * 0.6 });
      ink(half(top + (bottom - top) * 2 / 3), { ...o, at: at + step * 4.4, dur: step * 0.6 });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      write(value, x, y, { ...o, size, align: "center", dur: 0.3 });
      if (sub)
        write(sub, x, y + size * 0.75 * u / H, { ...o, at: at + 0.3, size: size * 0.35, align: "center" });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check") {
        ink([[cx - s * 0.5, cy], [cx - s * 0.1, cy + s * 0.4], [cx + s * 0.6, cy - s * 0.5]], { dur: 0.3, tone: "good", ...o });
      } else {
        const at = o.at ?? 0;
        ink([[cx - s * 0.5, cy - s * 0.5], [cx + s * 0.5, cy + s * 0.5]], { dur: 0.15, tone: "bad", ...o });
        ink([[cx + s * 0.5, cy - s * 0.5], [cx - s * 0.5, cy + s * 0.5]], { dur: 0.15, tone: "bad", ...o, at: at + 0.15 });
      }
    },
    finish() {
      if (!tip)
        return;
      const { x, y, color } = tip;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI * 0.3);
      ctx.shadowColor = "rgba(0,0,0,0.28)";
      ctx.shadowBlur = 18 * u;
      ctx.shadowOffsetX = 10 * u;
      ctx.shadowOffsetY = 14 * u;
      const L = 170 * u;
      const R = 11 * u;
      ctx.fillStyle = "#F2F3F4";
      ctx.beginPath();
      ctx.roundRect(18 * u, -R, L, R * 2, R);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(L - 30 * u, -R - u, 52 * u, R * 2 + 2 * u, R);
      ctx.fill();
      ctx.fillStyle = "#2B2F33";
      trace(ctx, [[0, 0], [20 * u, -R * 0.7], [20 * u, R * 0.7]], true);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(18 * u, -R, 10 * u, R * 2);
      ctx.restore();
    }
  };
}
var whiteboard_default = { id: "whiteboard", name: "Whiteboard", category: "Hand-drawn", make: make2 };

// plugin/skills/motion-graphics/styles/index.ts
var STYLES = {
  comic: comic_default,
  whiteboard: whiteboard_default
};
function style(id, ctx, t, m) {
  const s = STYLES[id];
  if (!s)
    throw new Error(`No style "${id}". Styles: ${Object.keys(STYLES).join(", ")}`);
  return s.make(ctx, t, m);
}
export {
  STYLES,
  style
};
