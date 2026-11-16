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
function expo(p) {
  const x = clamp(p);
  return x === 1 ? 1 : 1 - 2 ** (-10 * x);
}
var easeIn = (p) => clamp(p) ** 3;
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
function grain(ctx, m, t, amount = 0.06, size = 2) {
  const { W, H, u } = frame(m);
  const s = Math.max(1, size * u);
  ctx.save();
  const n = Math.floor(W * H / (s * s) * 0.02);
  const f = Math.floor(t * 24);
  for (let i = 0;i < n; i++) {
    const v = hash(i * 3.1 + f * 17.3);
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${amount})` : `rgba(0,0,0,${amount})`;
    ctx.fillRect(hash(i + f * 7.7) * W, hash(i * 1.3 + f * 3.9) * H, s, s);
  }
  ctx.restore();
}
function vignette(ctx, m, strength = 0.45, color = "0,0,0") {
  const { W, H } = frame(m);
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(1, `rgba(${color},${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
function text(ctx, s, x, y, font, color, align = "left") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(s, x, y);
}

// plugin/skills/motion-graphics/styles/art-deco.ts
var LACQUER = "#0E0C0A";
var GOLD = "#CDA85C";
var CREAM = "#F1E4C3";
var TONE = {
  ink: GOLD,
  accent: "#E9C979",
  good: "#9CC7A4",
  bad: "#D0645A",
  muted: "#7A6640"
};
var DECO = '"Futura", "Avenir Next", "Gill Sans", "Century Gothic", sans-serif';
function make(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const font = (size, w = 500) => `${w} ${Math.round(size * u)}px ${DECO}`;
  const g = globalThis;
  g.__decoRays ??= new Map;
  const cache = g.__decoRays;
  function inscribe(points, at, dur, color = GOLD, width = 2) {
    const p = progress(t, at, dur);
    if (p <= 0)
      return 0;
    const n = Math.max(2, Math.round(points.length * expo(p)));
    ctx.save();
    trace(ctx, points.slice(0, n));
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
    return p;
  }
  function stepped(x, y, w, h, c) {
    return [
      [x + w / 2, y],
      [x + w - c, y],
      [x + w - c, y + c * 0.5],
      [x + w - c * 0.5, y + c * 0.5],
      [x + w - c * 0.5, y + c],
      [x + w, y + c],
      [x + w, y + h - c],
      [x + w - c * 0.5, y + h - c],
      [x + w - c * 0.5, y + h - c * 0.5],
      [x + w - c, y + h - c * 0.5],
      [x + w - c, y + h],
      [x + c, y + h],
      [x + c, y + h - c * 0.5],
      [x + c * 0.5, y + h - c * 0.5],
      [x + c * 0.5, y + h - c],
      [x, y + h - c],
      [x, y + c],
      [x + c * 0.5, y + c],
      [x + c * 0.5, y + c * 0.5],
      [x + c, y + c * 0.5],
      [x + c, y],
      [x + w / 2, y]
    ];
  }
  function stamp(s, x, y, size, at, color, align = "center", w = 500) {
    const str = s.toUpperCase();
    ctx.save();
    ctx.font = font(size, w);
    ctx.letterSpacing = `${Math.round(size * 0.12 * u)}px`;
    const full = ctx.measureText(str).width;
    const start = align === "center" ? x - full / 2 : align === "right" ? x - full : x;
    let left = start;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const per = Math.min(0.06, 0.6 / str.length);
    for (const [i, ch] of [...str].entries()) {
      const p = progress(t, at + i * per, 0.14);
      const cw = ctx.measureText(ch).width;
      if (p > 0) {
        ctx.globalAlpha = p;
        ctx.fillStyle = p < 1 ? CREAM : color;
        ctx.fillText(ch, left, y - (1 - p) * 6 * u);
      }
      left += cw;
    }
    const gp = progress(t, at + str.length * per + 0.2, 0.7);
    if (gp > 0 && gp < 1) {
      const gx = start - 30 * u + gp * (full + 60 * u);
      const gr = ctx.createLinearGradient(gx - 30 * u, 0, gx + 30 * u, 0);
      gr.addColorStop(0, "rgba(255,250,230,0)");
      gr.addColorStop(0.5, "rgba(255,250,230,0.95)");
      gr.addColorStop(1, "rgba(255,250,230,0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = gr;
      ctx.fillText(str, start, y);
    }
    ctx.restore();
    return full;
  }
  function rays() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const x = c.getContext("2d");
      const bg = x.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, Math.hypot(W, H) * 0.6);
      bg.addColorStop(0, "#2A2118");
      bg.addColorStop(1, LACQUER);
      x.fillStyle = bg;
      x.fillRect(0, 0, W, H);
      const ox = W / 2;
      const oy = H * 1.05;
      for (let i = 0;i < 64; i++) {
        const a = Math.PI + i / 63 * Math.PI;
        const a2 = a + Math.PI / 63 / 2;
        x.beginPath();
        x.moveTo(ox, oy);
        x.lineTo(ox + Math.cos(a) * W * 1.2, oy + Math.sin(a) * W * 1.2);
        x.lineTo(ox + Math.cos(a2) * W * 1.2, oy + Math.sin(a2) * W * 1.2);
        x.closePath();
        const gr = x.createRadialGradient(ox, oy, 0, ox, oy, H);
        gr.addColorStop(0, "rgba(205,168,92,0.22)");
        gr.addColorStop(1, "rgba(205,168,92,0.02)");
        x.fillStyle = gr;
        x.fill();
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  function corner(cx, cy, sx, sy, p) {
    ctx.save();
    ctx.strokeStyle = alpha(GOLD, p);
    ctx.lineWidth = 1.5 * u;
    for (let r = 1;r <= 3; r++) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 14 * u, sx > 0 ? sy > 0 ? 0 : -Math.PI / 2 : sy > 0 ? Math.PI / 2 : Math.PI, (sx > 0 ? sy > 0 ? 0 : -Math.PI / 2 : sy > 0 ? Math.PI / 2 : Math.PI) + Math.PI / 2);
      ctx.stroke();
    }
    for (let k = 0;k <= 4; k++) {
      const a = (sx > 0 ? sy > 0 ? 0 : -Math.PI / 2 : sy > 0 ? Math.PI / 2 : Math.PI) + k / 4 * (Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * 42 * u, cy + Math.sin(a) * 42 * u);
      ctx.stroke();
    }
    ctx.restore();
  }
  return {
    surface() {
      rays();
      const m1 = 16 * u;
      const m2 = 24 * u;
      inscribe(stepped(m1, m1, W - 2 * m1, H - 2 * m1, 46 * u), 0, 1.2, GOLD, 2);
      inscribe(stepped(m2, m2, W - 2 * m2, H - 2 * m2, 40 * u), 0.15, 1.2, alpha(GOLD, 0.6), 1);
      const p = progress(t, 0.8, 0.6);
      if (p > 0) {
        const r = m2 + 30 * u;
        corner(r - 30 * u + 8 * u, r - 30 * u + 8 * u, 1, 1, p);
        corner(W - r + 30 * u - 8 * u, r - 30 * u + 8 * u, -1, 1, p);
        corner(r - 30 * u + 8 * u, H - r + 30 * u - 8 * u, 1, -1, p);
        corner(W - r + 30 * u - 8 * u, H - r + 30 * u - 8 * u, -1, -1, p);
      }
    },
    title(s, o = {}) {
      const { x = 0.07, y = 0.12, size = 54, at = 0, align = "left" } = o;
      if (t < at)
        return;
      const w = stamp(s, X(x), Y(y), size, at, CREAM, align, 700);
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      inscribe([
        [left, Y(y) + size * 0.85 * u],
        [left + w, Y(y) + size * 0.85 * u]
      ], at + 0.3, 0.6, GOLD, 1.5);
      inscribe([
        [left + w, Y(y) - size * 0.85 * u],
        [left, Y(y) - size * 0.85 * u]
      ], at + 0.3, 0.6, GOLD, 1.5);
    },
    label(s, x, y, o = {}) {
      const { size = 30, align = "center", tone = "ink", at = 0 } = o;
      if (t < at)
        return;
      const w = stamp(s, X(x), Y(y), size, at, TONE[tone], align);
      const p = progress(t, at + 0.2, 0.3);
      if (p <= 0)
        return;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      ctx.save();
      ctx.fillStyle = alpha(GOLD, p);
      for (const dx of [left - 14 * u, left + w + 10 * u]) {
        ctx.beginPath();
        ctx.moveTo(dx, Y(y) - 5 * u);
        ctx.lineTo(dx + 5 * u, Y(y));
        ctx.lineTo(dx, Y(y) + 5 * u);
        ctx.lineTo(dx - 5 * u, Y(y));
        ctx.fill();
      }
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "accent" } = o;
      if (t < at)
        return;
      const R = r * u * 1.15;
      const oct = (rr) => Array.from({ length: 9 }, (_, i) => {
        const a = Math.PI / 8 + i / 8 * Math.PI * 2;
        return [X(x) + Math.cos(a) * rr, Y(y) + Math.sin(a) * rr];
      });
      const f = progress(t, at + dur * 0.5, dur * 0.5);
      if (f > 0) {
        trace(ctx, oct(R), true);
        ctx.fillStyle = alpha("#1C1710", f);
        ctx.fill();
      }
      inscribe(oct(R), at, dur, TONE[tone], 2.5);
      inscribe(oct(R * 0.62), at + dur * 0.3, dur * 0.7, alpha(TONE[tone], 0.7), 1.2);
      if (f > 0) {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = alpha(TONE[tone], f);
        ctx.fill();
      }
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.7, tone = "ink" } = o;
      if (t < at)
        return;
      const pts = stepped(X(x), Y(y), X(w), Y(h), 18 * u);
      const f = progress(t, at + dur * 0.6, 0.3);
      if (f > 0) {
        trace(ctx, pts, true);
        ctx.fillStyle = alpha("#16120C", 0.85 * f);
        ctx.fill();
      }
      inscribe(pts, at, dur, TONE[tone], 2);
      inscribe(stepped(X(x) + 7 * u, Y(y) + 7 * u, X(w) - 14 * u, Y(h) - 14 * u, 14 * u), at + 0.15, dur, alpha(TONE[tone], 0.45), 1);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const p = inscribe(pts, at, dur, head ? TONE[tone] : alpha(TONE[tone], 0.55), head ? 2 : 1);
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        ctx.save();
        ctx.strokeStyle = TONE[tone];
        ctx.lineWidth = 2 * u;
        for (const k of [0, 1]) {
          arrowhead(ctx, [end[0] - Math.cos(a) * k * 9 * u, end[1] - Math.sin(a) * k * 9 * u], a, 13 * u);
          ctx.stroke();
        }
        ctx.restore();
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "ink" } = o;
      if (t < at)
        return;
      const tiers = 5;
      const th = Y(h) / (tiers + 1.2);
      const base = Y(y + h);
      const cx = X(x + w / 2);
      ctx.save();
      for (let i = 0;i < tiers; i++) {
        const p = progress(t, at + i / tiers * dur * 0.8, dur / tiers);
        if (p <= 0)
          break;
        const tw = X(w) * (1 - i * 0.16);
        const ty = base - (i + 1) * th;
        ctx.globalAlpha = p;
        ctx.fillStyle = "#17120B";
        ctx.fillRect(cx - tw / 2, ty, tw, th);
        ctx.strokeStyle = TONE[tone];
        ctx.lineWidth = 1.5 * u;
        ctx.strokeRect(cx - tw / 2, ty, tw, th);
        const cells = Math.max(2, Math.round(tw / (14 * u)));
        for (let k = 1;k < cells; k++) {
          ctx.beginPath();
          ctx.moveTo(cx - tw / 2 + tw / cells * k, ty + 3 * u);
          ctx.lineTo(cx - tw / 2 + tw / cells * k, ty + th - 3 * u);
          ctx.stroke();
        }
        const lit = (Math.floor(t * 4) + i) % cells;
        ctx.fillStyle = TONE.accent;
        ctx.fillRect(cx - tw / 2 + tw / cells * (lit + 0.3), ty + th * 0.4, 3 * u, 3 * u);
      }
      const sp = progress(t, at + dur * 0.8, 0.3);
      if (sp > 0) {
        const top = base - tiers * th;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 6 * u, top);
        ctx.lineTo(cx, top - th * 1.2 * sp);
        ctx.lineTo(cx + 6 * u, top);
        ctx.fillStyle = TONE[tone];
        ctx.fill();
      }
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "accent" } = o;
      if (t < at)
        return;
      const [cx, cy] = [X(x), Y(y)];
      if (sub) {
        const R = size * 2.1 * u;
        const p = count ? clamp((t - at) / dur) : 1;
        const fill = expo(p) * (count ? (count[1] - 0) / 100 : 1);
        ctx.save();
        const n = 36;
        for (let i = 0;i < n; i++) {
          const a0 = Math.PI + i / n * Math.PI;
          const a1 = a0 + Math.PI / n * 0.7;
          ctx.beginPath();
          ctx.arc(cx, cy + size * 0.35 * u, R, a0, a1);
          ctx.arc(cx, cy + size * 0.35 * u, R * 0.62, a1, a0, true);
          ctx.closePath();
          ctx.fillStyle = i / n < fill ? alpha(TONE[tone], 0.9 - i / n * 0.4) : "rgba(120,100,70,0.25)";
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(cx, cy + size * 0.35 * u, R * 1.08, Math.PI, Math.PI * 2);
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 1.5 * u;
        ctx.stroke();
        ctx.restore();
      }
      const str = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.globalAlpha = progress(t, at, 0.25);
      ctx.letterSpacing = `${Math.round(size * 0.04 * u)}px`;
      text(ctx, str, cx, cy, font(size, 700), sub ? CREAM : TONE[tone], "center");
      ctx.restore();
      if (sub)
        stamp(sub, cx, cy + size * 0.95 * u, size * 0.3, at + 0.3, GOLD);
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 28) * u;
      const at = o.at ?? 0;
      const col = kind === "check" ? TONE.good : TONE.bad;
      const ring = Array.from({ length: 33 }, (_, i) => {
        const a = -Math.PI / 2 + i / 32 * Math.PI * 2;
        return [X(x) + Math.cos(a) * r, Y(y) + Math.sin(a) * r];
      });
      inscribe(ring, at, 0.35, col, 2);
      const tick = kind === "check" ? [
        [X(x) - r * 0.45, Y(y)],
        [X(x) - r * 0.1, Y(y) + r * 0.35],
        [X(x) + r * 0.5, Y(y) - r * 0.4]
      ] : [
        [X(x) - r * 0.4, Y(y) - r * 0.4],
        [X(x) + r * 0.4, Y(y) + r * 0.4]
      ];
      inscribe(tick, at + 0.25, 0.25, col, 3);
      if (kind === "cross")
        inscribe([
          [X(x) + r * 0.4, Y(y) - r * 0.4],
          [X(x) - r * 0.4, Y(y) + r * 0.4]
        ], at + 0.4, 0.2, col, 3);
    },
    finish() {}
  };
}
var art_deco_default = {
  id: "art-deco",
  name: "Gilded deco",
  category: "Art & Design Movements",
  make
};

// plugin/skills/motion-graphics/styles/ascii-render.ts
var TONE2 = {
  ink: "#4FE3FF",
  accent: "#FFD84A",
  good: "#4CFF7A",
  bad: "#FF3B5C",
  muted: "#7A5CC8"
};
var MONO = 'Menlo, Monaco, Consolas, "Courier New", monospace';
var RAMP = " .:-=+*#%@";
function make2(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const cw = 17 * u;
  const rh = 31 * u;
  const font = `bold ${Math.round(rh * 0.78)}px ${MONO}`;
  const col = (x) => Math.round(x / cw);
  const row = (y) => Math.round(y / rh);
  const g = globalThis;
  g.__ascii ??= { bits: new Map };
  const st = g.__ascii;
  function cells(list, color, glow = 0) {
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = glow * u;
    }
    for (const [c, r, ch] of list)
      ctx.fillText(ch, c * cw, r * rh);
    ctx.restore();
  }
  function line(s, x, y, color, align = "left", bg) {
    const c0 = col(align === "center" ? x - s.length * cw / 2 : align === "right" ? x - s.length * cw : x);
    const r = row(y);
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect((c0 - 0.5) * cw - 2 * u, (r - 0.5) * rh, s.length * cw + 4 * u, rh);
    }
    cells([...s].map((ch, i) => [c0 + i, r, ch]), color);
  }
  function bitmap(s) {
    let b = st.bits.get(s);
    if (!b) {
      if (st.bits.size > 400)
        st.bits.clear();
      const px = 9;
      const probe = new OffscreenCanvas(4, 4).getContext("2d");
      probe.font = `bold ${px}px Verdana, Arial, sans-serif`;
      const w = Math.ceil(probe.measureText(s).width) + 2;
      const h = 11;
      const cv = new OffscreenCanvas(w, h);
      const c = cv.getContext("2d", { willReadFrequently: true });
      c.font = probe.font;
      c.fillStyle = "#fff";
      c.textBaseline = "middle";
      c.fillText(s, 1, h / 2 + 0.5);
      const d = c.getImageData(0, 0, w, h).data;
      const on = [];
      for (let y = 0;y < h; y++)
        for (let x = 0;x < w; x++)
          if (d[(y * w + x) * 4 + 3] > 110)
            on.push([x, y]);
      b = { w, h, on };
      st.bits.set(s, b);
    }
    return b;
  }
  function blocks(s, x, y, size, top, bottom, at, dur, align = "left") {
    const b = bitmap(s);
    const k = size * u / 9;
    const w = b.w * k;
    const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    const y0 = y - b.h * k / 2;
    const rows = Math.floor(progress(t, at, dur) * (b.h + 1));
    const gr = ctx.createLinearGradient(0, y0 + k * 2, 0, y0 + b.h * k - k * 2);
    gr.addColorStop(0, top);
    gr.addColorStop(1, bottom);
    ctx.save();
    ctx.fillStyle = gr;
    ctx.shadowColor = bottom;
    ctx.shadowBlur = 10 * u;
    for (const [px, py] of b.on)
      if (py < rows)
        ctx.fillRect(x0 + px * k, y0 + py * k, k * 0.86, k * 0.86);
    if (rows <= b.h) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(x0, y0 + rows * k, w, k * 0.5);
    }
    ctx.restore();
  }
  function dots() {
    const key = `${W}x${H}`;
    if (st.key === key)
      return st.dots;
    const cv = new OffscreenCanvas(W, H);
    const c = cv.getContext("2d");
    c.fillStyle = "rgba(150,90,220,0.16)";
    for (let y = rh / 2;y < H; y += rh / 2)
      for (let x = cw / 2;x < W; x += cw)
        c.fillRect(x, y, 1.4 * u, 1.4 * u);
    st.key = key;
    st.dots = cv;
    return cv;
  }
  return {
    surface() {
      ctx.fillStyle = "#07040C";
      ctx.fillRect(0, 0, W, H);
      for (let i = 0;i < 3; i++) {
        const px = W * (0.5 + 0.35 * Math.sin(t * 0.4 + i * 2.1));
        const py = H * (0.5 + 0.3 * Math.cos(t * 0.33 + i * 1.7));
        const gr = ctx.createRadialGradient(px, py, 0, px, py, W * 0.4);
        gr.addColorStop(0, ["rgba(120,30,140,0.22)", "rgba(30,60,160,0.2)", "rgba(160,30,80,0.16)"][i]);
        gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.drawImage(dots(), 0, 0);
    },
    title(text, o = {}) {
      const { x = 0.035, y = 0.06, size = 46, at = 0, dur = 0.9 } = o;
      if (t < at)
        return;
      blocks(text.toUpperCase(), X(x), Y(y) + size * u * 0.6, size, "#FFE14A", "#FF2E4A", at, dur);
    },
    label(text, x, y, o = {}) {
      const { at = 0, dur = 0.3, tone = "ink", align = "center" } = o;
      if (t < at)
        return;
      const n = Math.ceil(text.length * progress(t, at, dur));
      const s = text.toLowerCase().slice(0, n) + (n < text.length ? "_" : "");
      if (tone === "ink" || tone === "muted")
        line(s, X(x), Y(y), TONE2[tone], align);
      else
        line(s, X(x), Y(y), "#07040C", align, TONE2[tone]);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.3, tone = "accent" } = o;
      if (t < at)
        return;
      const rr = r * u * 1.9;
      const c0 = col(X(x));
      const r0 = row(Y(y));
      const rx = Math.ceil(rr / cw);
      const ry = Math.ceil(rr / rh);
      const shown = -ry + Math.floor(progress(t, at, dur) * (ry * 2 + 1));
      const list = [];
      for (let j = -ry;j <= Math.min(ry, shown); j++)
        for (let i = -rx;i <= rx; i++) {
          const dx = i * cw / rr;
          const dy = j * rh / rr;
          const d = dx * dx + dy * dy;
          if (d > 1.05)
            continue;
          const z = Math.sqrt(Math.max(0, 1 - d));
          const l = Math.max(0, -dx * 0.5 - dy * 0.5 + z * 0.7);
          list.push([c0 + i, r0 + j, RAMP[Math.min(9, 2 + Math.floor(l * 8))]]);
        }
      cells(list, TONE2[tone], 6);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.35, tone = "ink" } = o;
      if (t < at)
        return;
      const [c0, r0, c1, r1] = [col(X(x)), row(Y(y)), col(X(x + w)), row(Y(y + h))];
      const ring = [];
      for (let c = c0;c <= c1; c++)
        ring.push([c, r0, c === c0 ? "┌" : c === c1 ? "┐" : "─"]);
      for (let r = r0 + 1;r < r1; r++)
        ring.push([c1, r, "│"]);
      for (let c = c1;c >= c0; c--)
        ring.push([c, r1, c === c0 ? "└" : c === c1 ? "┘" : "─"]);
      for (let r = r1 - 1;r > r0; r--)
        ring.push([c0, r, "│"]);
      cells(ring.slice(0, Math.ceil(ring.length * progress(t, at, dur))), tone === "ink" ? TONE2.ink : TONE2[tone], 4);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (t < at)
        return;
      const p = progress(t, at, dur);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 60);
      const seen = new Set;
      const list = [];
      const n = Math.max(2, Math.round(pts.length * p));
      for (let i = 1;i < n; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const c = col(b[0]);
        const r = row(b[1]);
        const key = `${c},${r}`;
        if (seen.has(key))
          continue;
        seen.add(key);
        const an = Math.atan2((b[1] - a[1]) / rh, (b[0] - a[0]) / cw);
        const deg = (an * 180 / Math.PI + 360) % 180;
        list.push([
          c,
          r,
          head ? deg < 22 || deg > 158 ? "-" : deg < 68 ? "\\" : deg < 112 ? "|" : "/" : "."
        ]);
      }
      if (head && p >= 1 && list.length) {
        const e = pts.at(-1);
        const q = pts.at(-6);
        const dx = e[0] - q[0];
        const dy = e[1] - q[1];
        const last = list.at(-1);
        last[2] = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? ">" : "<" : dy > 0 ? "v" : "^";
      }
      cells(list, head ? TONE2[tone] : TONE2.muted, head ? 5 : 0);
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (t < at)
        return;
      const [c0, r0, c1, r1] = [col(X(x)), row(Y(y)), col(X(x + w)), row(Y(y + h))];
      const span = c1 - c0;
      const rows = r1 - r0;
      const shown = Math.floor(progress(t, at, dur) * (rows + 1));
      const edge = [];
      const fill = [];
      for (let j = 0;j <= Math.min(rows, shown); j++) {
        const r = r0 + j;
        const capped = j === 0 || j === rows;
        edge.push([c0, r, capped ? "(" : "|"], [c1, r, capped ? ")" : "|"]);
        for (let i = 1;i < span; i++) {
          const ch = j === 0 ? "_" : j === rows ? "_" : j % 2 ? ":" : "=";
          (capped ? edge : fill).push([c0 + i, r, ch]);
        }
      }
      cells(edge, TONE2.ink, 4);
      cells(fill, "#FF4FD8", 4);
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const big = size * 1.1;
      const [top, bottom] = tone === "good" ? ["#B8FF5A", "#1FD8A0"] : tone === "bad" ? ["#FFE14A", "#FF2E4A"] : ["#5AF0FF", "#4A5CFF"];
      blocks(s, X(x), Y(y) - (sub ? big * u * 0.25 : 0), big, top, bottom, at, 0.25, "center");
      if (sub)
        line(`${sub} ^`, X(x), Y(y) + big * u * 0.7, TONE2.ink, "center");
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.25, size = 40 } = o;
      if (t < at)
        return;
      const r = size * u * 0.7;
      const pts = kind === "check" ? [
        ...curve([X(x) - r, Y(y)], [X(x) - r * 0.3, Y(y) + r * 0.8], 0, 4),
        ...curve([X(x) - r * 0.3, Y(y) + r * 0.8], [X(x) + r * 1.2, Y(y) - r], 0, 8)
      ] : [
        ...curve([X(x) - r, Y(y) - r], [X(x) + r, Y(y) + r], 0, 6),
        ...curve([X(x) + r, Y(y) - r], [X(x) - r, Y(y) + r], 0, 6)
      ];
      const n = Math.ceil(pts.length * progress(t, at, dur));
      const seen = new Set;
      const list = [];
      for (const [px, py] of pts.slice(0, n)) {
        const key = `${col(px)},${row(py)}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push([col(px), row(py), "#"]);
        }
      }
      cells(list, kind === "check" ? TONE2.good : TONE2.bad, 8);
    },
    finish() {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      for (let y = 0;y < H; y += 3 * u)
        ctx.fillRect(0, y, W, 1.2 * u);
      ctx.save();
      ctx.font = `${Math.round(rh * 0.5)}px ${MONO}`;
      ctx.fillStyle = "rgba(79,227,255,0.5)";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(`${1 + Math.floor(t / 2.5)}/4  ${String(Math.floor(hash(Math.floor(t * 4)) * 999)).padStart(3, "0")}`, W - cw * 2, rh);
      ctx.restore();
    }
  };
}
var ascii_render_default = {
  id: "ascii-render",
  name: "Text-mode demo",
  category: "Retro Digital",
  make: make2
};

// plugin/skills/motion-graphics/styles/ballpoint-notebook.ts
var INK = {
  ink: "#27348B",
  accent: "#2F45B5",
  good: "#27348B",
  bad: "#C8283A",
  muted: "#6E7BB5"
};
var HAND = '"Bradley Hand", "Segoe Print", "Noteworthy", "Comic Sans MS", cursive';
var BUBBLE = '"Chalkboard SE", "Arial Rounded MT Bold", "Comic Sans MS", sans-serif';
function make3(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__ballpoint ??= new Map;
  const cache = g.__ballpoint;
  let tip = null;
  let seed = 1;
  function paper() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      b.fillStyle = "#F7F5EE";
      b.fillRect(0, 0, W, H);
      const gap = 30 * u;
      for (let y = gap * 2.5;y < H; y += gap) {
        b.fillStyle = "rgba(90,130,200,0.5)";
        b.fillRect(0, y, W, 1.4 * u);
      }
      b.fillStyle = "rgba(215,70,80,0.55)";
      b.fillRect(W * 0.085, 0, 1.6 * u, H);
      for (const y of [0.18, 0.5, 0.82]) {
        b.fillStyle = "#5A5652";
        b.beginPath();
        b.arc(W * 0.03, H * y, 11 * u, 0, Math.PI * 2);
        b.fill();
      }
      for (let i = 0;i < W * H / 120; i++) {
        b.fillStyle = `rgba(120,110,90,${hash(i * 1.7) * 0.05})`;
        b.fillRect(hash(i * 1.1) * W, hash(i * 2.3 + 1) * H, u, u);
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  function hatch(tone, cross) {
    const key = `hatch:${tone}:${cross}:${u}`;
    let tile = cache.get(key);
    if (!tile) {
      const n = Math.max(4, Math.round(7 * u));
      tile = new OffscreenCanvas(n, n);
      const c = tile.getContext("2d");
      c.strokeStyle = INK[tone];
      c.lineWidth = Math.max(1, 1.3 * u);
      c.globalAlpha = 0.9;
      c.beginPath();
      c.moveTo(0, n);
      c.lineTo(n, 0);
      c.moveTo(-1, 1);
      c.lineTo(1, -1);
      c.moveTo(n - 1, n + 1);
      c.lineTo(n + 1, n - 1);
      if (cross) {
        c.moveTo(0, 0);
        c.lineTo(n, n);
      }
      c.stroke();
      cache.set(key, tile);
    }
    return ctx.createPattern(tile, "repeat");
  }
  function pen(points, { at = 0, dur = 0.5, tone = "ink", width = 3 } = {}) {
    const p = progress(t, at, dur);
    seed += 1;
    if (p <= 0)
      return;
    const { points: drawn } = along(roughen(points, 1.1 * u, seed * 3.9), p);
    const col = INK[tone];
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = col;
    for (let i = 1;i < drawn.length; i++) {
      const a = drawn[i - 1];
      const b = drawn[i];
      ctx.lineWidth = width * u * (0.6 + 0.6 * Math.abs(Math.sin(i * 0.35 + seed)));
      trace(ctx, [a, b]);
      ctx.stroke();
    }
    const s0 = drawn[0];
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(s0[0], s0[1], width * 0.9 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (p < 1)
      tip = { pt: drawn.at(-1), color: col };
  }
  function write(s, x, y, o = {}) {
    const { at = 0, size = 32, tone = "ink", align = "left" } = o;
    const dur = o.dur ?? 0.05 * s.length + 0.1;
    const p = progress(t, at, dur);
    if (p <= 0)
      return;
    ctx.save();
    ctx.font = `600 ${Math.round(size * u)}px ${HAND}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.beginPath();
    ctx.rect(left - 4 * u, Y(y) - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = INK[tone];
    ctx.fillText(s, left, Y(y));
    ctx.restore();
    if (p < 1)
      tip = { pt: [left + w * p, Y(y)], color: INK[tone] };
  }
  function bubble(s, x, y, o = {}) {
    const { at = 0, size = 60, tone = "ink", align = "left", reveal = true } = o;
    const dur = o.dur ?? 0.06 * s.length + 0.1;
    const p = reveal ? progress(t, at, dur) : t >= at ? 1 : 0;
    if (p <= 0)
      return 0;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${BUBBLE}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.beginPath();
    ctx.rect(left - 10 * u, Y(y) - size * u, (w + 20 * u) * p, size * 2 * u);
    ctx.clip();
    const sh = progress(t, at + dur * 0.6, 0.4);
    if (sh > 0) {
      ctx.globalAlpha = sh;
      ctx.fillStyle = hatch(tone, true);
      ctx.fillText(s, left + size * 0.07 * u, Y(y) + size * 0.07 * u);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#F7F5EE";
    ctx.fillText(s, left, Y(y));
    ctx.strokeStyle = INK[tone];
    ctx.lineWidth = 2 * u;
    ctx.lineJoin = "round";
    ctx.strokeText(s, left, Y(y));
    ctx.restore();
    if (p < 1)
      tip = { pt: [left + w * p, Y(y)], color: INK[tone] };
    return w;
  }
  function shadow(path, at, tone, cross = false) {
    const s = progress(t, at, 0.4);
    if (s <= 0)
      return;
    ctx.save();
    ctx.globalAlpha = s;
    ctx.translate(9 * u, 9 * u);
    path();
    ctx.fillStyle = hatch(tone, cross);
    ctx.fill();
    ctx.restore();
  }
  return {
    surface() {
      paper();
    },
    title(s, o = {}) {
      const { x = 0.11, y = 0.12, size = 78, at = 0 } = o;
      const w = bubble(s, x, y, { ...o, size, at, align: o.align ?? "left" });
      if (!w)
        return;
      const done = at + (o.dur ?? 0.06 * s.length + 0.1);
      pen(curve([X(x), Y(y) + size * 0.72 * u], [X(x) + w, Y(y) + size * 0.7 * u], -0.01, 16), {
        at: done,
        dur: 0.3,
        width: 2.5
      });
    },
    label(s, x, y, o = {}) {
      write(s, x, y, { size: 40, align: "center", ...o });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const R = r * u;
      shadow(() => {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
      }, at + 0.2, tone);
      if (t >= at) {
        ctx.save();
        ctx.fillStyle = "#F7F5EE";
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      pen(ellipse(X(x), Y(y), R, R, 36, -Math.PI / 2, 1.06), { dur: 0.18, width: 2.6, ...o });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      const a = [X(x), Y(y)];
      const b = [X(x + w), Y(y + h)];
      shadow(() => {
        ctx.beginPath();
        ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      }, at + dur, tone, true);
      if (t >= at + dur) {
        ctx.fillStyle = "#F7F5EE";
        ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      }
      pen([a, [b[0], a[1]], b, [a[0], b[1]], [a[0], a[1] - 3 * u]], { dur, ...o });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true } = o;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      pen(shaft, { ...o, at, dur, width: head ? 2.6 : 1.6 });
      if (!head)
        return;
      const end = shaft.at(-1);
      const prev = shaft.at(-3);
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 16 * u;
      pen([
        [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
        end,
        [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s]
      ], { ...o, at: at + dur, dur: 0.1, width: 2.6 });
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9, tone = "ink" } = o;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.28;
      const top = Y(y) + ry;
      const bottom = Y(y + h) - ry;
      const body = () => {
        ctx.beginPath();
        ctx.ellipse(cx, top, rx, ry, 0, Math.PI, 0);
        ctx.lineTo(cx + rx, bottom);
        ctx.ellipse(cx, bottom, rx, ry, 0, 0, Math.PI);
        ctx.closePath();
      };
      shadow(body, at + dur, tone, true);
      if (t >= at + dur) {
        body();
        ctx.fillStyle = "#F7F5EE";
        ctx.fill();
      }
      const half = (cy) => ellipse(cx, cy, rx, ry, 28, 0, 0.5);
      const step = dur / 5;
      pen(ellipse(cx, top, rx, ry, 28, Math.PI, 1), { ...o, at, dur: step * 1.5 });
      pen([
        [cx - rx, top],
        [cx - rx, bottom]
      ], { ...o, at: at + step * 1.5, dur: step * 0.7 });
      pen(half(bottom), { ...o, at: at + step * 2.2, dur: step });
      pen([
        [cx + rx, bottom],
        [cx + rx, top]
      ], { ...o, at: at + step * 3.2, dur: step * 0.6 });
      pen(half(top + (bottom - top) / 2), { ...o, at: at + step * 3.8, dur: step });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      bubble(value, x, y, {
        at,
        size,
        align: "center",
        tone: tone === "bad" ? "bad" : "ink",
        reveal: false
      });
      if (sub)
        write(sub, x, y - size * 0.8 * u / H, {
          at: at + 0.2,
          size: size * 0.36,
          align: "center"
        });
      if (size >= 80)
        pen(ellipse(X(x), Y(y), size * 1.4 * u, size * 0.72 * u, 44, -Math.PI * 0.7, 1.08), {
          at: at + dur,
          dur: 0.4,
          tone: "bad",
          width: 2.4
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 32) * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check") {
        pen([
          [cx - s * 0.5, cy],
          [cx - s * 0.1, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5]
        ], { dur: 0.25, width: 3, ...o });
      } else {
        const at = o.at ?? 0;
        pen([
          [cx - s * 0.5, cy - s * 0.5],
          [cx + s * 0.5, cy + s * 0.5]
        ], { dur: 0.12, tone: "bad", width: 3, ...o });
        pen([
          [cx + s * 0.5, cy - s * 0.5],
          [cx - s * 0.5, cy + s * 0.5]
        ], { dur: 0.12, tone: "bad", width: 3, ...o, at: at + 0.12 });
      }
    },
    finish() {
      const tp = tip;
      if (!tp)
        return;
      const [x, y] = tp.pt;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI * 0.27);
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 10 * u;
      ctx.shadowOffsetX = 8 * u;
      ctx.shadowOffsetY = 10 * u;
      const L = 200 * u;
      const R = 6 * u;
      ctx.fillStyle = "rgba(230,236,245,0.92)";
      ctx.beginPath();
      ctx.roundRect(14 * u, -R, L, R * 2, R * 0.6);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = tp.color;
      ctx.fillRect(18 * u, -R * 0.35, L - 10 * u, R * 0.7);
      ctx.fillRect(L + 4 * u, -R, 14 * u, R * 2);
      ctx.fillStyle = "#C9C9C9";
      trace(ctx, [
        [0, 0],
        [16 * u, -R * 0.8],
        [16 * u, R * 0.8]
      ], true);
      ctx.fill();
      ctx.restore();
    }
  };
}
var ballpoint_notebook_default = {
  id: "ballpoint-notebook",
  name: "Ballpoint notebook",
  category: "Hand-drawn",
  make: make3
};

// plugin/skills/motion-graphics/styles/bauhaus.ts
var CREAM2 = "#ECE3D0";
var BLACK = "#1D1B19";
var RED = "#D23A2C";
var YELLOW = "#E9B02A";
var BLUE = "#24539E";
var TONE3 = {
  ink: BLACK,
  accent: BLUE,
  good: YELLOW,
  bad: RED,
  muted: "#9C9384"
};
var PRIMARY = [RED, YELLOW, BLUE];
var GEO = '"Futura", "Avenir Next", "Century Gothic", "Helvetica Neue", sans-serif';
function make4(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const font = (size, w = 600) => `${w} ${Math.round(size * u)}px ${GEO}`;
  const drop = (at = 0) => spring(t, { start: at, stiffness: 220, damping: 13 });
  const g = globalThis;
  g.__bauhausStock ??= new Map;
  const cache = g.__bauhausStock;
  function dropped(at, draw) {
    const s = drop(at);
    if (s <= 0)
      return;
    ctx.save();
    ctx.globalAlpha = clamp(s * 3);
    ctx.translate(0, (1 - s) * -60 * u);
    draw();
    ctx.restore();
  }
  function tag(s, cx, cy, size, bg) {
    ctx.font = font(size);
    const w = ctx.measureText(s.toLowerCase()).width + size * 0.6 * u;
    const h = size * 1.35 * u;
    ctx.fillStyle = bg;
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.fillStyle = CREAM2;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s.toLowerCase(), cx, cy + 1 * u);
  }
  function stock() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const x = c.getContext("2d");
      x.fillStyle = CREAM2;
      x.fillRect(0, 0, W, H);
      for (let i = 0;i < 1800; i++) {
        x.fillStyle = hash(i) > 0.5 ? "rgba(255,255,245,0.10)" : "rgba(110,80,40,0.06)";
        x.beginPath();
        x.arc(hash(i * 1.3) * W, hash(i * 2.7) * H, (1 + hash(i * 3.9) * 6) * u, 0, Math.PI * 2);
        x.fill();
      }
      x.strokeStyle = "rgba(29,27,25,0.06)";
      x.lineWidth = 1 * u;
      for (let k = 1;k < 4; k++) {
        x.beginPath();
        x.moveTo(W / 4 * k, 0);
        x.lineTo(W / 4 * k, H);
        x.moveTo(0, H / 3 * k);
        x.lineTo(W, H / 3 * k);
        x.stroke();
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  function mottle(x, y, w, h) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(255,250,235,0.12)";
    for (let i = 0;i < 14; i++) {
      ctx.beginPath();
      ctx.arc(x + hash(i * 3.3 + x) * w, y + hash(i * 4.7 + y) * h, (2 + hash(i) * 5) * u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  return {
    surface() {
      stock();
      const p = progress(t, 0, 0.8);
      ctx.fillStyle = BLACK;
      ctx.fillRect(X(0.015), Y(0.04), 10 * u, (Y(0.96) - Y(0.04)) * p);
      ctx.fillRect(X(0.015), Y(0.95), (X(0.985) - X(0.015)) * p, 10 * u);
      const q = drop(0.3);
      if (q > 0) {
        ctx.save();
        ctx.translate(0, (1 - q) * -40 * u);
        ctx.beginPath();
        ctx.arc(X(0.93), Y(0.14), 44 * u, 0, Math.PI * 2);
        ctx.fillStyle = RED;
        ctx.fill();
        ctx.fillStyle = YELLOW;
        ctx.fillRect(X(0.86), Y(0.22), 70 * u, 14 * u);
        ctx.beginPath();
        ctx.moveTo(X(0.84), Y(0.17));
        ctx.lineTo(X(0.84), Y(0.25));
        ctx.lineTo(X(0.84) + 46 * u, Y(0.25));
        ctx.closePath();
        ctx.fillStyle = BLUE;
        ctx.fill();
        ctx.restore();
      }
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.09, size = 62, at = 0 } = o;
      dropped(at, () => {
        ctx.font = font(size, 700);
        ctx.fillStyle = BLACK;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(s.toLowerCase(), X(x), Y(y));
        ctx.fillStyle = RED;
        ctx.fillRect(X(x), Y(y) + size * 0.65 * u, 14 * u, 14 * u);
      });
    },
    label(s, x, y, o = {}) {
      const { size = 34, align = "center", tone = "ink", at = 0 } = o;
      dropped(at, () => {
        ctx.font = font(size);
        const w = ctx.measureText(s.toLowerCase()).width + size * 0.6 * u;
        const cx = align === "center" ? X(x) : align === "right" ? X(x) - w / 2 : X(x) + w / 2;
        tag(s, cx, Y(y), size, tone === "bad" ? RED : tone === "accent" ? BLUE : BLACK);
      });
    },
    node(x, y, r, o = {}) {
      const R = r * u;
      const k = Math.floor(hash(x * 51 + y * 17) * 3);
      const color = o.tone && o.tone !== "accent" ? TONE3[o.tone] : PRIMARY[Math.floor(hash(x * 7 + y * 93) * 3)];
      dropped(o.at, () => {
        ctx.beginPath();
        if (k === 0)
          ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
        else if (k === 1)
          ctx.rect(X(x) - R * 0.9, Y(y) - R * 0.9, R * 1.8, R * 1.8);
        else {
          ctx.moveTo(X(x), Y(y) - R * 1.1);
          ctx.lineTo(X(x) + R * 1.05, Y(y) + R * 0.85);
          ctx.lineTo(X(x) - R * 1.05, Y(y) + R * 0.85);
          ctx.closePath();
        }
        ctx.fillStyle = color;
        ctx.fill();
        mottle(X(x) - R, Y(y) - R, R * 2, R * 2);
      });
    },
    box(x, y, w, h, o = {}) {
      const color = TONE3[o.tone ?? "accent"];
      dropped(o.at, () => {
        ctx.fillStyle = alpha(color, 0.22);
        ctx.fillRect(X(x), Y(y), X(w), Y(h));
        ctx.fillStyle = color;
        ctx.fillRect(X(x), Y(y), X(w), 12 * u);
        ctx.lineWidth = 5 * u;
        ctx.strokeStyle = BLACK;
        ctx.strokeRect(X(x), Y(y), X(w), Y(h));
        ctx.beginPath();
        ctx.arc(X(x), Y(y + h / 2), 16 * u, Math.PI / 2, -Math.PI / 2);
        ctx.fillStyle = RED;
        ctx.fill();
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 24);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      trace(ctx, shown);
      ctx.strokeStyle = head ? TONE3[tone] : alpha(BLACK, 0.55);
      ctx.lineWidth = (head ? 7 : 2) * u;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 24 * u, false);
        ctx.fillStyle = TONE3[tone];
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const n = 4;
      const sh = Y(h) / n;
      for (let i = n - 1;i >= 0; i--) {
        dropped(at + (n - 1 - i) * 0.12, () => {
          const yy = Y(y) + sh * i;
          ctx.fillStyle = PRIMARY[i % 3];
          ctx.fillRect(X(x), yy + 3 * u, X(w), sh - 6 * u);
          ctx.beginPath();
          ctx.rect(X(x), yy + 3 * u, X(w), sh - 6 * u);
          mottle(X(x), yy, X(w), sh);
          ctx.beginPath();
          ctx.arc(X(x + w) - 12 * u, yy + sh / 2, 5 * u, 0, Math.PI * 2);
          ctx.fillStyle = BLACK;
          ctx.fill();
        });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "ink" } = o;
      const str = count ? counting(t, at, dur, count) + s : s;
      dropped(at, () => {
        ctx.font = font(size, 700);
        ctx.fillStyle = tone === "good" || tone === "accent" || tone === "ink" ? BLACK : TONE3[tone];
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(str, X(x), Y(y) - (sub ? size * 0.12 * u : 0));
        if (sub) {
          ctx.font = font(size * 0.36);
          ctx.fillText(sub.toLowerCase(), X(x), Y(y) + size * 0.6 * u);
        }
      });
      if (sub) {
        const p = progress(t, at + dur, 0.5);
        if (p > 0) {
          ctx.font = font(size, 700);
          const w = ctx.measureText(`${count ? count[1] : ""}${s}`).width;
          trace(ctx, ellipse(X(x), Y(y) - size * 0.12 * u, w * 0.85, size * 0.85 * u, 48, -2.4, p * 1.04));
          ctx.strokeStyle = RED;
          ctx.lineWidth = 5 * u;
          ctx.stroke();
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 30) * u;
      dropped(o.at, () => {
        ctx.save();
        ctx.strokeStyle = kind === "check" ? BLACK : RED;
        ctx.lineWidth = r * 0.32;
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
        const [cx, cy] = [X(x), Y(y)];
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.6, cy],
            [cx - r * 0.15, cy + r * 0.45],
            [cx + r * 0.7, cy - r * 0.55]
          ]);
        else {
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.55, cy - r * 0.55);
          ctx.lineTo(cx + r * 0.55, cy + r * 0.55);
          ctx.moveTo(cx + r * 0.55, cy - r * 0.55);
          ctx.lineTo(cx - r * 0.55, cy + r * 0.55);
        }
        ctx.stroke();
        ctx.restore();
      });
    },
    finish() {}
  };
}
var bauhaus_default = {
  id: "bauhaus",
  name: "Workshop poster",
  category: "Art & Design Movements",
  make: make4
};

// plugin/skills/motion-graphics/styles/blueprint.ts
var LINE = {
  ink: "#F2F7FF",
  accent: "#D4E8FF",
  good: "#C4F2D8",
  bad: "#FFC9BE",
  muted: "#93B4DD"
};
var MONO2 = '"Courier New", "Menlo", "Consolas", monospace';
function make5(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__blueprint ??= new Map;
  const cache = g.__blueprint;
  let tip = null;
  function sheet() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      const gr = b.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.6);
      gr.addColorStop(0, "#1E4E9C");
      gr.addColorStop(1, "#123476");
      b.fillStyle = gr;
      b.fillRect(0, 0, W, H);
      b.filter = `blur(${30 * u}px)`;
      for (let i = 0;i < 24; i++) {
        b.fillStyle = hash(i) > 0.5 ? "rgba(90,140,210,0.10)" : "rgba(8,24,70,0.14)";
        b.beginPath();
        b.ellipse(hash(i + 1) * W, hash(i + 2) * H, (80 + hash(i + 3) * 200) * u, (60 + hash(i + 4) * 120) * u, hash(i + 5) * 3, 0, Math.PI * 2);
        b.fill();
      }
      b.filter = "none";
      const s = 24 * u;
      for (let i = 0, x = 0;x < W; i++, x += s) {
        b.fillStyle = `rgba(200,225,255,${i % 5 ? 0.08 : 0.16})`;
        b.fillRect(x, 0, 1, H);
      }
      for (let i = 0, y = 0;y < H; i++, y += s) {
        b.fillStyle = `rgba(200,225,255,${i % 5 ? 0.08 : 0.16})`;
        b.fillRect(0, y, W, 1);
      }
      for (const [x, y, w, h] of [
        [W / 3, 0, 2 * u, H],
        [W * 2 / 3, 0, 2 * u, H],
        [0, H / 2, W, 2 * u]
      ]) {
        b.fillStyle = "rgba(0,10,40,0.25)";
        b.fillRect(x, y, w, h);
        b.fillStyle = "rgba(180,210,255,0.08)";
        b.fillRect(x + (w < h ? 2 * u : 0), y + (w < h ? 0 : 2 * u), w, h);
      }
      for (let i = 0;i < W * H / 250; i++) {
        b.fillStyle = `rgba(255,255,255,${hash(i * 1.7) * 0.04})`;
        b.fillRect(hash(i * 1.1) * W, hash(i * 2.3 + 1) * H, 1.5 * u, 1.5 * u);
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  function draft(points, { at = 0, dur = 0.5, tone = "ink", width = 2.6, dash = false, guide = true } = {}) {
    if (t < at)
      return;
    const col = LINE[tone];
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (guide) {
      const g0 = progress(t, at - 0.15, 0.25);
      const a = points[0];
      const b = points.at(-1);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const ex = (b[0] - a[0]) / len * 60 * u;
      const ey = (b[1] - a[1]) / len * 60 * u;
      ctx.strokeStyle = `rgba(200,225,255,${0.08 + 0.2 * (1 - g0)})`;
      ctx.lineWidth = u;
      trace(ctx, [
        [a[0] - ex, a[1] - ey],
        [b[0] + ex, b[1] + ey]
      ]);
      ctx.stroke();
    }
    const p = progress(t, at, dur);
    const { points: drawn } = along(points, p);
    ctx.strokeStyle = col;
    ctx.shadowColor = "rgba(220,235,255,0.6)";
    ctx.shadowBlur = 5 * u;
    ctx.lineWidth = width * u;
    if (dash || tone === "bad")
      ctx.setLineDash([10 * u, 6 * u]);
    trace(ctx, drawn);
    ctx.stroke();
    ctx.restore();
    if (p < 1)
      tip = drawn.at(-1);
  }
  function letter(s, x, y, o = {}) {
    const { at = 0, size = 30, tone = "ink", align = "left", weight = 700 } = o;
    if (t < at)
      return 0;
    const dur = o.dur ?? 0.04 * s.length + 0.1;
    const text = s.toUpperCase();
    const n = Math.ceil(text.length * progress(t, at, dur));
    ctx.save();
    ctx.font = `${weight} ${Math.round(size * u)}px ${MONO2}`;
    ctx.textBaseline = "middle";
    ctx.letterSpacing = `${size * 0.08 * u}px`;
    const w = ctx.measureText(text).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.textAlign = "left";
    ctx.fillStyle = LINE[tone];
    ctx.shadowColor = "rgba(220,235,255,0.55)";
    ctx.shadowBlur = 4 * u;
    const shown = text.slice(0, n);
    ctx.fillText(shown, left, Y(y));
    if (n < text.length)
      tip = [left + ctx.measureText(shown).width, Y(y)];
    ctx.restore();
    return w;
  }
  return {
    surface() {
      sheet();
      const f = 26 * u;
      ctx.save();
      ctx.strokeStyle = "rgba(235,244,255,0.75)";
      ctx.lineWidth = 2.5 * u;
      ctx.strokeRect(f, f, W - 2 * f, H - 2 * f);
      ctx.lineWidth = u;
      ctx.strokeRect(f + 8 * u, f + 8 * u, W - 2 * f - 16 * u, H - 2 * f - 16 * u);
      ctx.font = `600 ${Math.round(11 * u)}px ${MONO2}`;
      ctx.fillStyle = "rgba(235,244,255,0.6)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 1;i < 8; i++) {
        const x = f + (W - 2 * f) * i / 8;
        ctx.fillRect(x, f, u, 8 * u);
        ctx.fillText(String(i), x - (W - 2 * f) / 16, f - 10 * u);
      }
      const bw = 300 * u;
      const bh = 70 * u;
      const bx = W - f - 8 * u - bw;
      const by = H - f - 8 * u - bh;
      ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh * 0.5);
      ctx.strokeRect(bx, by + bh * 0.5, bw * 0.5, bh * 0.5);
      ctx.textAlign = "left";
      ctx.font = `700 ${Math.round(16 * u)}px ${MONO2}`;
      ctx.fillText("SHEET 1 OF 1", bx + 10 * u, by + bh * 0.25);
      ctx.font = `600 ${Math.round(11 * u)}px ${MONO2}`;
      ctx.fillText("DWG NO. EX-01", bx + 10 * u, by + bh * 0.75);
      ctx.fillText("SCALE NTS", bx + bw * 0.5 + 10 * u, by + bh * 0.75);
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.06, y = 0.13, size = 52, at = 0 } = o;
      const w = letter(s, x, y, { ...o, size, at, align: o.align ?? "left", weight: 700 });
      if (!w)
        return;
      const done = at + (o.dur ?? 0.04 * s.length + 0.1);
      const yy = Y(y) + size * 0.7 * u;
      draft([
        [X(x), yy],
        [X(x) + w, yy]
      ], { at: done, dur: 0.3, width: 2 });
    },
    label(s, x, y, o = {}) {
      letter(s, x, y, { size: 28, align: "center", ...o });
    },
    node(x, y, r, o = {}) {
      const at = o.at ?? 0;
      const [cx, cy, R] = [X(x), Y(y), r * u];
      draft([
        [cx - R * 1.4, cy],
        [cx + R * 1.4, cy]
      ], { at, dur: 0.08, width: 1, tone: "muted", guide: false });
      draft([
        [cx, cy - R * 1.4],
        [cx, cy + R * 1.4]
      ], { at, dur: 0.08, width: 1, tone: "muted", guide: false });
      draft(ellipse(cx, cy, R, R, 48), { ...o, at: at + 0.06, dur: o.dur ?? 0.2, guide: false });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6 } = o;
      const a = [X(x), Y(y)];
      const b = [X(x + w), Y(y + h)];
      const q = dur / 4;
      draft([a, [b[0], a[1]]], { ...o, at, dur: q });
      draft([[b[0], a[1]], b], { ...o, at: at + q, dur: q });
      draft([b, [a[0], b[1]]], { ...o, at: at + 2 * q, dur: q });
      draft([[a[0], b[1]], a], { ...o, at: at + 3 * q, dur: q });
      const dy = b[1] + 16 * u;
      draft([
        [a[0], dy],
        [b[0], dy]
      ], { at: at + dur, dur: 0.2, tone: "muted", width: 1, guide: false });
      if (t >= at + dur + 0.2) {
        ctx.save();
        ctx.fillStyle = LINE.muted;
        for (const ex of [a[0], b[0]])
          ctx.fillRect(ex - u / 2, dy - 6 * u, u, 12 * u);
        ctx.restore();
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true } = o;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      draft(shaft, { ...o, at, dur, width: head ? 2.4 : 1.4, guide: bend === 0 && head });
      if (!head || t < at + dur)
        return;
      const end = shaft.at(-1);
      const prev = shaft.at(-3);
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 16 * u;
      ctx.save();
      ctx.fillStyle = LINE[o.tone ?? "ink"];
      trace(ctx, [
        end,
        [end[0] - Math.cos(a - 0.3) * s, end[1] - Math.sin(a - 0.3) * s],
        [end[0] - Math.cos(a + 0.3) * s, end[1] - Math.sin(a + 0.3) * s]
      ], true);
      ctx.fill();
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.3;
      const top = Y(y) + ry;
      const bottom = Y(y + h) - ry;
      const step = dur / 4;
      draft(ellipse(cx, top, rx, ry, 40), { ...o, at, dur: step, guide: false });
      draft([
        [cx - rx, top],
        [cx - rx, bottom]
      ], { ...o, at: at + step, dur: step });
      draft([
        [cx + rx, top],
        [cx + rx, bottom]
      ], { ...o, at: at + step, dur: step });
      draft(ellipse(cx, bottom, rx, ry, 24, 0, 0.5), {
        ...o,
        at: at + step * 2,
        dur: step,
        guide: false
      });
      if (t >= at + step * 3) {
        const p = progress(t, at + step * 3, step);
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - rx, top, rx * 2, (bottom - top) * p);
        ctx.clip();
        ctx.strokeStyle = "rgba(220,235,255,0.35)";
        ctx.lineWidth = u;
        ctx.beginPath();
        for (let d = -rx * 2;d < bottom - top + rx * 2; d += 12 * u) {
          ctx.moveTo(cx - rx, top + d);
          ctx.lineTo(cx + rx, top + d - rx * 2);
        }
        ctx.stroke();
        ctx.restore();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${MONO2}`;
      const w = ctx.measureText(value).width;
      ctx.restore();
      const pad = size * 0.25 * u;
      const bx = X(x) - w / 2 - pad;
      const by = Y(y) - size * 0.6 * u;
      const bw = w + pad * 2;
      const bh = size * 1.2 * u;
      if (size >= 80)
        draft([
          [bx, by],
          [bx + bw, by],
          [bx + bw, by + bh],
          [bx, by + bh],
          [bx, by]
        ], { at, dur: 0.4, tone: "muted", width: 1.4, guide: false });
      letter(value, x, y, { at, dur: 0.01, size, tone, align: "center" });
      if (sub)
        letter(sub, x, y - size * 0.95 * u / H, {
          at: at + 0.3,
          size: size * 0.26,
          align: "center",
          tone: "ink"
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 32) * u;
      const [cx, cy] = [X(x), Y(y)];
      const at = o.at ?? 0;
      if (kind === "check") {
        draft([
          [cx - s * 0.5, cy],
          [cx - s * 0.1, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5]
        ], { dur: 0.3, tone: "good", ...o, guide: false });
      } else {
        draft([
          [cx - s * 0.5, cy - s * 0.5],
          [cx + s * 0.5, cy + s * 0.5]
        ], { dur: 0.15, tone: "bad", ...o, guide: false });
        draft([
          [cx + s * 0.5, cy - s * 0.5],
          [cx - s * 0.5, cy + s * 0.5]
        ], { dur: 0.15, tone: "bad", ...o, at: at + 0.15, guide: false });
      }
    },
    finish() {
      if (!tip)
        return;
      const [x, y] = tip;
      ctx.save();
      const gl = ctx.createRadialGradient(x, y, 0, x, y, 26 * u);
      gl.addColorStop(0, "rgba(255,255,255,0.95)");
      gl.addColorStop(0.2, "rgba(220,235,255,0.6)");
      gl.addColorStop(1, "rgba(200,225,255,0)");
      ctx.fillStyle = gl;
      ctx.fillRect(x - 26 * u, y - 26 * u, 52 * u, 52 * u);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = u;
      trace(ctx, [
        [x - 14 * u, y],
        [x + 14 * u, y]
      ]);
      ctx.stroke();
      trace(ctx, [
        [x, y - 14 * u],
        [x, y + 14 * u]
      ]);
      ctx.stroke();
      ctx.restore();
    }
  };
}
var blueprint_default = { id: "blueprint", name: "Blueprint", category: "Hand-drawn", make: make5 };

// plugin/skills/motion-graphics/styles/botanical-plate.ts
var LINE2 = "#2B241C";
var WASH = {
  ink: "196,160,100",
  accent: "200,100,115",
  good: "120,160,105",
  bad: "200,50,45",
  muted: "150,140,125"
};
var TEXT = {
  ink: LINE2,
  accent: "#6E2F36",
  good: "#3E5A33",
  bad: "#A3302A",
  muted: "#7A6E60"
};
var SERIF = '"Iowan Old Style", "Palatino", "Book Antiqua", "Georgia", serif';
function make6(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__botanical ??= new Map;
  const cache = g.__botanical;
  function plate() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      b.fillStyle = "#EEE3CA";
      b.fillRect(0, 0, W, H);
      b.filter = `blur(${3 * u}px)`;
      for (let i = 0;i < 40; i++) {
        b.fillStyle = `rgba(150,100,50,${0.08 + hash(i) * 0.12})`;
        b.beginPath();
        b.arc(hash(i * 1.7) * W, hash(i * 2.9) * H, (1.5 + hash(i * 3.1) * 5) * u, 0, Math.PI * 2);
        b.fill();
      }
      b.filter = `blur(${40 * u}px)`;
      for (let i = 0;i < 10; i++) {
        b.fillStyle = "rgba(170,130,70,0.05)";
        b.beginPath();
        b.arc(hash(i + 50) * W, hash(i + 60) * H, (80 + hash(i + 70) * 120) * u, 0, Math.PI * 2);
        b.fill();
      }
      b.filter = "none";
      for (let i = 0;i < W * H / 100; i++) {
        b.fillStyle = `rgba(120,95,60,${hash(i * 1.3) * 0.05})`;
        b.fillRect(hash(i * 0.7) * W, hash(i * 1.9 + 2) * H, u, u);
      }
      const f = 18 * u;
      b.fillStyle = "rgba(120,90,50,0.05)";
      b.fillRect(f, f, W - 2 * f, H - 2 * f);
      b.strokeStyle = "rgba(255,250,235,0.7)";
      b.lineWidth = 2 * u;
      b.strokeRect(f + u, f + u, W - 2 * f, H - 2 * f);
      b.strokeStyle = "rgba(110,80,45,0.35)";
      b.lineWidth = 1.2 * u;
      b.strokeRect(f, f, W - 2 * f, H - 2 * f);
      const r = f + 14 * u;
      b.strokeStyle = LINE2;
      b.lineWidth = 1.6 * u;
      b.strokeRect(r, r, W - 2 * r, H - 2 * r);
      b.lineWidth = 0.7 * u;
      b.strokeRect(r + 5 * u, r + 5 * u, W - 2 * r - 10 * u, H - 2 * r - 10 * u);
      b.font = `italic ${Math.round(13 * u)}px ${SERIF}`;
      b.fillStyle = LINE2;
      b.textBaseline = "bottom";
      b.textAlign = "left";
      b.fillText("Vol. III.", r + 4 * u, r - 3 * u);
      b.textAlign = "right";
      b.fillText("Pl. XXV.", W - r - 4 * u, r - 3 * u);
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  function cut(points, { at = 0, dur = 0.5, width = 1.3, color = LINE2 } = {}) {
    const p = progress(t, at, dur);
    if (p <= 0)
      return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    trace(ctx, along(points, p).points);
    ctx.stroke();
    ctx.restore();
  }
  function wash(path, at, tone, strength = 0.2) {
    const p = expo(progress(t, at, 0.6));
    if (p <= 0)
      return;
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    for (let k = 0;k < 2; k++) {
      ctx.save();
      ctx.translate((k - 0.5) * 3 * u, (0.5 - k) * 2 * u);
      path();
      ctx.fillStyle = `rgba(${WASH[tone]},${strength * p * (k ? 0.6 : 1)})`;
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  function hatch(clip, x0, y0, w, h, at, dense = 4.5) {
    const p = progress(t, at, 0.5);
    if (p <= 0)
      return;
    ctx.save();
    clip();
    ctx.clip();
    ctx.strokeStyle = LINE2;
    ctx.lineWidth = 0.8 * u;
    ctx.globalAlpha = 0.9;
    const step = dense * u;
    const n = Math.ceil(w / step);
    for (let i = 0;i < n * p; i++) {
      const x = x0 + w - i * step;
      const f = i / n;
      const len = h * Math.max(0, 1 - f * 1.6);
      if (len <= 0)
        break;
      trace(ctx, curve([x, y0 + h - len], [x - step * 0.6, y0 + h], 0.08, 6));
      ctx.stroke();
    }
    ctx.restore();
  }
  function write(s, x, y, o = {}) {
    const { at = 0, size = 28, tone = "ink", align = "left", italic = true } = o;
    const dur = o.dur ?? 0.04 * s.length + 0.15;
    const p = progress(t, at, dur);
    if (p <= 0)
      return 0;
    ctx.save();
    ctx.font = `${italic ? "italic " : ""}500 ${Math.round(size * u)}px ${SERIF}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.beginPath();
    ctx.rect(left - 4 * u, Y(y) - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = TEXT[tone];
    ctx.fillText(s, left, Y(y));
    ctx.restore();
    return w;
  }
  return {
    surface() {
      plate();
    },
    title(s, o = {}) {
      const { x = 0.07, y = 0.14, size = 58, at = 0 } = o;
      const w = write(s, x, y, { ...o, size, at, align: o.align ?? "left" });
      if (!w)
        return;
      const done = at + (o.dur ?? 0.04 * s.length + 0.15);
      const yy = Y(y) + size * 0.62 * u;
      cut([
        [X(x) + w * 0.15, yy],
        [X(x) + w * 0.85, yy]
      ], { at: done, dur: 0.3, width: 0.9 });
    },
    label(s, x, y, o = {}) {
      write(s, x, y, { size: 32, align: "center", ...o });
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.3, tone = "accent" } = o;
      const [cx, cy, R] = [X(x), Y(y), r * u];
      const ry = R * 1.15;
      const oval = () => {
        ctx.beginPath();
        ctx.ellipse(cx, cy, R, ry, 0, 0, Math.PI * 2);
      };
      wash(oval, at + dur + 0.1, tone);
      cut(ellipse(cx, cy, R, ry, 40), { at, dur, width: 1.4 });
      cut(ellipse(cx, cy, R + 3 * u, ry + 3 * u, 40), { at: at + 0.05, dur, width: 0.6 });
      hatch(oval, cx - R, cy - ry, R * 2, ry * 2, at + dur, 3.5);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "ink" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      wash(() => {
        ctx.beginPath();
        ctx.rect(x0, y0, x1 - x0, y1 - y0);
      }, at + dur, tone, 0.1);
      cut([
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0]
      ], { at, dur, width: 1.5 });
      const d = 5 * u;
      cut([
        [x0 + d, y0 + d],
        [x1 - d, y0 + d],
        [x1 - d, y1 - d],
        [x0 + d, y1 - d],
        [x0 + d, y0 + d]
      ], { at: at + 0.1, dur, width: 0.6 });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true, tone = "ink" } = o;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const color = tone === "bad" ? TEXT.bad : LINE2;
      cut(shaft, {
        at,
        dur,
        width: head ? 1.3 : 0.6,
        color: tone === "accent" ? "rgba(43,36,28,0.55)" : color
      });
      if (!head || t < at + dur)
        return;
      const end = shaft.at(-1);
      const prev = shaft.at(-3);
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 14 * u;
      ctx.save();
      ctx.fillStyle = color;
      trace(ctx, [
        end,
        [end[0] - Math.cos(a - 0.3) * s, end[1] - Math.sin(a - 0.3) * s],
        [end[0] - Math.cos(a) * s * 0.7, end[1] - Math.sin(a) * s * 0.7],
        [end[0] - Math.cos(a + 0.3) * s, end[1] - Math.sin(a + 0.3) * s]
      ], true);
      ctx.fill();
      const s0 = shaft[0];
      const s1 = shaft[2];
      const b = Math.atan2(s1[1] - s0[1], s1[0] - s0[0]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.9 * u;
      for (let k = 0;k < 3; k++) {
        const bx = s0[0] + Math.cos(b) * k * 4 * u;
        const by = s0[1] + Math.sin(b) * k * 4 * u;
        trace(ctx, [
          [bx - Math.cos(b - 0.7) * 8 * u, by - Math.sin(b - 0.7) * 8 * u],
          [bx, by],
          [bx - Math.cos(b + 0.7) * 8 * u, by - Math.sin(b + 0.7) * 8 * u]
        ]);
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const lid = (y1 - y0) * 0.14;
      const sh = (x1 - x0) * 0.15;
      const body = [
        [x0 + sh, y0 + lid],
        [x0, y0 + lid + sh],
        [x0, y1 - sh * 0.5],
        [x0 + sh * 0.5, y1],
        [x1 - sh * 0.5, y1],
        [x1, y1 - sh * 0.5],
        [x1, y0 + lid + sh],
        [x1 - sh, y0 + lid],
        [x0 + sh, y0 + lid]
      ];
      const glass = () => trace(ctx, body, true);
      wash(glass, at + dur, "good", 0.12);
      cut(body, { at, dur: dur * 0.7, width: 1.4 });
      cut([
        [x0 + sh * 0.6, y0],
        [x1 - sh * 0.6, y0],
        [x1 - sh * 0.6, y0 + lid],
        [x0 + sh * 0.6, y0 + lid],
        [x0 + sh * 0.6, y0]
      ], { at: at + dur * 0.5, dur: dur * 0.3, width: 1.2 });
      hatch(() => {
        ctx.beginPath();
        ctx.rect(x0 + sh * 0.6, y0, x1 - x0 - sh * 1.2, lid);
      }, x0 + sh * 0.6, y0, x1 - x0 - sh * 1.2, lid, at + dur * 0.8, 3);
      hatch(glass, x0, y0 + lid, x1 - x0, y1 - y0 - lid, at + dur * 0.8, 4);
      if (t >= at + dur) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,252,240,0.85)";
        ctx.lineWidth = 3 * u;
        trace(ctx, [
          [x0 + sh * 0.9, y0 + lid + sh * 1.6],
          [x0 + sh * 0.9, y1 - sh * 1.6]
        ]);
        ctx.stroke();
        ctx.restore();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const [cx, cy] = [X(x), Y(y)];
      if (size >= 80) {
        const rx = size * 1.25 * u;
        const ry = size * 0.95 * u;
        const oval = () => {
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        };
        wash(oval, at + 0.3, "ink", 0.2);
        cut(ellipse(cx, cy, rx, ry, 60), { at, dur: 0.4, width: 1.6 });
        cut(ellipse(cx, cy, rx - 5 * u, ry - 5 * u, 60), { at: at + 0.05, dur: 0.4, width: 0.6 });
        for (const sx of [-1, 1]) {
          if (t < at + 0.4)
            break;
          ctx.save();
          ctx.strokeStyle = LINE2;
          ctx.lineWidth = 1.2 * u;
          ctx.beginPath();
          ctx.arc(cx + sx * (rx + 6 * u), cy - ry * 0.5, 6 * u, 0, Math.PI * 1.6);
          ctx.stroke();
          ctx.restore();
        }
        const rp = progress(t, at + dur, 0.5);
        if (rp > 0) {
          ctx.save();
          ctx.globalCompositeOperation = "multiply";
          ctx.strokeStyle = `rgba(${WASH.bad},0.45)`;
          ctx.lineWidth = 6 * u;
          ctx.lineCap = "round";
          trace(ctx, along(ellipse(cx + 4 * u, cy - 2 * u, rx * 1.12, ry * 1.18, 60, -Math.PI * 0.6, 1.08), rp).points);
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.save();
      ctx.globalAlpha = progress(t, at, 0.25);
      ctx.font = `500 ${Math.round(size * (size >= 80 ? 0.72 : 1) * u)}px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = LINE2;
      ctx.fillText(value, cx, cy + (size >= 80 ? size * 0.15 * u : 0));
      ctx.restore();
      if (sub)
        write(sub, x, y - size * (size >= 80 ? 0.42 : 0.8) * u / H, {
          at: at + 0.1,
          size: size * 0.27,
          align: "center"
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 30) * u;
      const [cx, cy] = [X(x), Y(y)];
      const at = o.at ?? 0;
      const tone = kind === "check" ? "good" : "bad";
      wash(() => {
        ctx.beginPath();
        ctx.ellipse(cx, cy, s * 0.8, s * 0.6, -0.3, 0, Math.PI * 2);
      }, at + 0.25, tone, 0.35);
      if (kind === "check")
        cut([
          [cx - s * 0.5, cy],
          [cx - s * 0.1, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5]
        ], { at, dur: 0.25, width: 2 });
      else {
        cut([
          [cx - s * 0.45, cy - s * 0.45],
          [cx + s * 0.45, cy + s * 0.45]
        ], { at, dur: 0.12, width: 2 });
        cut([
          [cx + s * 0.45, cy - s * 0.45],
          [cx - s * 0.45, cy + s * 0.45]
        ], { at: at + 0.12, dur: 0.12, width: 2 });
      }
    },
    finish() {}
  };
}
var botanical_plate_default = {
  id: "botanical-plate",
  name: "Botanical plate",
  category: "Illustration",
  make: make6
};

// plugin/skills/motion-graphics/styles/chalkboard.ts
var CHALK = {
  ink: "#F1F0E8",
  accent: "#F2D86B",
  good: "#A6E8BE",
  bad: "#F4A3BF",
  muted: "#AFC2B6"
};
var HAND2 = '"Chalkboard SE", "Chalkboard", "Marker Felt", "Comic Sans MS", cursive';
function make7(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__chalk ??= new Map;
  const cache = g.__chalk;
  let tip = null;
  let seed = 1;
  function chalk(tone) {
    const key = `tile:${tone}`;
    let tile = cache.get(key);
    if (!tile) {
      const n = 128;
      tile = new OffscreenCanvas(n, n);
      const c = tile.getContext("2d");
      const img = c.createImageData(n, n);
      const hex = Number.parseInt(CHALK[tone].slice(1), 16);
      for (let i = 0;i < n * n; i++) {
        img.data[i * 4] = hex >> 16 & 255;
        img.data[i * 4 + 1] = hex >> 8 & 255;
        img.data[i * 4 + 2] = hex & 255;
        img.data[i * 4 + 3] = hash(i * 0.731 + 3.3) < 0.24 ? 0 : Math.round(255 * (0.5 + 0.5 * hash(i * 1.37)));
      }
      c.putImageData(img, 0, 0);
      cache.set(key, tile);
    }
    return ctx.createPattern(tile, "repeat");
  }
  function board() {
    const key = `board:${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      const gr = b.createRadialGradient(W * 0.45, H * 0.4, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.6);
      gr.addColorStop(0, "#2F5A47");
      gr.addColorStop(1, "#1C382D");
      b.fillStyle = gr;
      b.fillRect(0, 0, W, H);
      b.filter = `blur(${24 * u}px)`;
      for (let i = 0;i < 16; i++) {
        b.fillStyle = `rgba(215,235,222,${0.03 + hash(i) * 0.035})`;
        b.beginPath();
        b.ellipse(hash(i + 3) * W, hash(i + 7) * H, (90 + hash(i + 11) * 220) * u, (30 + hash(i + 13) * 70) * u, hash(i) * 3, 0, Math.PI * 2);
        b.fill();
      }
      b.filter = "none";
      for (let i = 0;i < W * H / 300; i++) {
        b.fillStyle = `rgba(255,255,255,${0.02 + hash(i * 2.1) * 0.05})`;
        b.fillRect(hash(i * 1.1) * W, hash(i * 1.9 + 4) * H, 1.4 * u, 1.4 * u);
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  const dashes = (s) => Array.from({ length: 8 }, (_, i) => (i % 2 ? 1 + hash(s + i) * 3.5 : 8 + hash(s + i) * 34) * u);
  function line(points, { at = 0, dur = 0.6, tone = "ink", width = 7.5 } = {}) {
    const p = progress(t, at, dur);
    seed += 1;
    if (p <= 0)
      return;
    const { points: drawn } = along(roughen(points, 1.5 * u, seed * 7.3), p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = chalk(tone);
    ctx.setLineDash(dashes(seed));
    ctx.lineWidth = width * u;
    trace(ctx, drawn);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = width * 0.45 * u;
    ctx.translate(0.9 * u, -0.7 * u);
    trace(ctx, drawn);
    ctx.stroke();
    ctx.restore();
    if (p < 1)
      tip = drawn.at(-1);
  }
  function write(s, x, y, o = {}) {
    const { at = 0, size = 40, tone = "ink", align = "left" } = o;
    const dur = o.dur ?? 0.05 * s.length + 0.1;
    const p = progress(t, at, dur);
    if (p <= 0)
      return 0;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${HAND2}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.beginPath();
    ctx.rect(left - 4 * u, Y(y) - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = chalk(tone);
    ctx.shadowColor = "rgba(255,255,255,0.12)";
    ctx.shadowBlur = 6 * u;
    ctx.fillText(s, left, Y(y));
    ctx.restore();
    if (p < 1)
      tip = [left + w * p, Y(y) + size * 0.2 * u];
    return w;
  }
  return {
    surface() {
      board();
      const f = 18 * u;
      const wood = (x, y, w, h) => {
        const wg = ctx.createLinearGradient(x, y, x + (w < h ? w : 0), y + (w < h ? 0 : h));
        wg.addColorStop(0, "#9A6B3F");
        wg.addColorStop(0.5, "#7A512D");
        wg.addColorStop(1, "#5A3A1F");
        ctx.fillStyle = wg;
        ctx.fillRect(x, y, w, h);
      };
      wood(0, 0, W, f);
      wood(0, 0, f, H);
      wood(W - f, 0, f, H);
      wood(0, H - f * 2, W, f * 2);
      ctx.fillStyle = "rgba(240,240,232,0.35)";
      for (let i = 0;i < 40; i++)
        ctx.fillRect(hash(i) * W, H - f * 1.4 + hash(i + 2) * f * 0.5, (2 + hash(i + 5) * 6) * u, 2 * u);
      ["ink", "bad", "accent"].forEach((c, i) => {
        ctx.fillStyle = CHALK[c];
        ctx.beginPath();
        ctx.roundRect(W * (0.62 + i * 0.06), H - f * 1.55, 54 * u, 11 * u, 5 * u);
        ctx.fill();
      });
      ctx.fillStyle = "#3B3631";
      ctx.fillRect(W * 0.08, H - f * 1.7, 120 * u, 22 * u);
      ctx.fillStyle = "#CFC6B6";
      ctx.fillRect(W * 0.08, H - f * 1.7 + 14 * u, 120 * u, 8 * u);
    },
    title(s, o = {}) {
      const { x = 0.05, y = 0.11, size = 74, at = 0 } = o;
      const w = write(s, x, y, { ...o, size, at, align: o.align ?? "left" }) || 0;
      if (!w)
        return;
      const done = at + (o.dur ?? 0.05 * s.length + 0.1);
      line(curve([X(x), Y(y) + size * 0.75 * u], [X(x) + w, Y(y) + size * 0.7 * u], -0.02, 16), {
        at: done,
        dur: 0.35,
        tone: "accent",
        width: 5
      });
    },
    label(s, x, y, o = {}) {
      write(s, x, y, { size: 38, align: "center", ...o });
    },
    node(x, y, r, o = {}) {
      line(ellipse(X(x), Y(y), r * u, r * u, 40, -Math.PI / 2, 1.08), {
        dur: 0.18,
        width: 5,
        ...o
      });
    },
    box(x, y, w, h, o = {}) {
      const a = [X(x), Y(y)];
      const b = [X(x + w), Y(y + h)];
      line([a, [b[0], a[1]], b, [a[0], b[1]], [a[0], a[1] - 3 * u]], { dur: 0.5, ...o });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true } = o;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      line(shaft, { ...o, at, dur, width: head ? 5 : 3 });
      if (!head)
        return;
      const end = shaft.at(-1);
      const prev = shaft.at(-3);
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 20 * u;
      line([
        [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
        end,
        [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s]
      ], { ...o, at: at + dur, dur: 0.12, width: 5 });
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.28;
      const top = Y(y) + ry;
      const bottom = Y(y + h) - ry;
      const half = (cy) => ellipse(cx, cy, rx, ry, 28, 0, 0.5);
      const step = dur / 5;
      line(ellipse(cx, top, rx, ry, 28, Math.PI, 1), { ...o, at, dur: step * 1.5 });
      line([
        [cx - rx, top],
        [cx - rx, bottom]
      ], { ...o, at: at + step * 1.5, dur: step * 0.7 });
      line(half(bottom), { ...o, at: at + step * 2.2, dur: step });
      line([
        [cx + rx, bottom],
        [cx + rx, top]
      ], { ...o, at: at + step * 3.2, dur: step * 0.6 });
      line(half(top + (bottom - top) / 2), { ...o, at: at + step * 3.8, dur: step });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      write(value, x, y, { ...o, size, align: "center", dur: 0.3 });
      if (sub)
        write(sub, x, y - size * 0.8 * u / H, {
          at: at + 0.2,
          size: size * 0.32,
          align: "center",
          tone: "muted"
        });
      if (size >= 80)
        line(ellipse(X(x), Y(y), size * 1.25 * u, size * 0.75 * u, 44, -Math.PI * 0.7, 1.08), {
          at: at + dur,
          dur: 0.4,
          tone: tone === "accent" ? "bad" : tone,
          width: 5
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check") {
        line([
          [cx - s * 0.5, cy],
          [cx - s * 0.1, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5]
        ], { dur: 0.3, tone: "good", ...o });
      } else {
        const at = o.at ?? 0;
        line([
          [cx - s * 0.5, cy - s * 0.5],
          [cx + s * 0.5, cy + s * 0.5]
        ], { dur: 0.15, tone: "bad", ...o });
        line([
          [cx + s * 0.5, cy - s * 0.5],
          [cx - s * 0.5, cy + s * 0.5]
        ], { dur: 0.15, tone: "bad", ...o, at: at + 0.15 });
      }
    },
    finish() {
      if (!tip)
        return;
      const [x, y] = tip;
      ctx.save();
      for (let i = 0;i < 6; i++) {
        ctx.fillStyle = `rgba(240,240,232,${0.25 * hash(i + t * 30)})`;
        ctx.fillRect(x + (hash(i * 3 + t * 20) - 0.5) * 14 * u, y + hash(i * 5 + t * 25) * 26 * u, 2 * u, 2 * u);
      }
      ctx.translate(x, y);
      ctx.rotate(-Math.PI * 0.78);
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 12 * u;
      ctx.shadowOffsetX = 8 * u;
      ctx.shadowOffsetY = 10 * u;
      ctx.fillStyle = "#F4F2EA";
      ctx.beginPath();
      ctx.roundRect(-4 * u, -8 * u, 80 * u, 16 * u, 4 * u);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(-4 * u, 3 * u, 80 * u, 5 * u);
      ctx.restore();
    }
  };
}
var chalkboard_default = {
  id: "chalkboard",
  name: "Chalkboard",
  category: "Hand-drawn",
  make: make7
};

// plugin/skills/motion-graphics/styles/claymation.ts
var CLAY = {
  ink: "#F3EEE4",
  accent: "#F2A7C3",
  good: "#E9B83A",
  bad: "#E0483A",
  muted: "#8FC7D6"
};
var LETTER = {
  ink: "#F7F2E8",
  accent: "#F07FA8",
  good: "#F2B83A",
  bad: "#E8503E",
  muted: "#9AD0DE"
};
var ROUND = '"Arial Rounded MT Bold", "Nunito", "Varela Round", "Avenir Next", "Helvetica Neue", sans-serif';
function make8(ctx, t0, m) {
  const { W, H, u, X, Y } = frame(m);
  const t = Math.floor(t0 * 12) / 12;
  const boil = Math.floor(t0 * 12);
  const g = globalThis;
  g.__claySet ??= new Map;
  const cache = g.__claySet;
  function squash(at) {
    const s = t - at;
    if (s < 0)
      return null;
    const k = clamp(s / 0.35);
    const pop = 1 - Math.exp(-s * 9) * Math.cos(s * 22);
    const sx = pop * (1 + 0.18 * Math.sin(k * Math.PI) * (1 - k));
    const sy = pop * (1 - 0.14 * Math.sin(k * Math.PI) * (1 - k));
    return { sx, sy };
  }
  function lump(shape, color, cx, cy, r, seed) {
    ctx.save();
    ctx.shadowColor = "rgba(30,20,10,0.35)";
    ctx.shadowBlur = 10 * u;
    ctx.shadowOffsetY = 6 * u;
    shape();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    ctx.save();
    shape();
    ctx.clip();
    const gr = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r * 1.3);
    gr.addColorStop(0, "rgba(255,255,255,0.55)");
    gr.addColorStop(0.35, "rgba(255,255,255,0.08)");
    gr.addColorStop(0.75, "rgba(0,0,0,0.05)");
    gr.addColorStop(1, "rgba(40,20,10,0.35)");
    ctx.fillStyle = gr;
    ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
    ctx.strokeStyle = "rgba(60,30,20,0.09)";
    ctx.lineWidth = Math.max(0.8, 1.2 * u);
    const px = cx + (hash(seed) - 0.5) * r;
    const py = cy + (hash(seed + 1) - 0.5) * r * 0.6;
    for (let i = 1;i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(px, py, i * r * 0.07, i * r * 0.05, hash(seed + 2) * 3, 0.3, 2.6);
      ctx.stroke();
    }
    ctx.restore();
  }
  function blob(cx, cy, rx, ry, seed) {
    const pts = roughen(ellipse(cx, cy, rx, ry, 28), Math.min(rx, ry) * 0.05 + u, seed * 3.1 + boil * 0.37);
    return () => {
      ctx.beginPath();
      const n = pts.length - 1;
      for (let i = 0;i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        if (i === 0)
          ctx.moveTo(mx, my);
        else
          ctx.quadraticCurveTo(a[0], a[1], mx, my);
      }
      ctx.closePath();
    };
  }
  function coil(points, p, color, width) {
    const shown = points.slice(0, Math.max(2, Math.round(points.length * p)));
    const w = width * u;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.translate(0, w * 0.35);
    trace(ctx, shown);
    ctx.strokeStyle = "rgba(30,20,10,0.3)";
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.translate(0, -w * 0.35);
    trace(ctx, shown);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.translate(0, w * 0.18);
    trace(ctx, shown);
    ctx.strokeStyle = "rgba(60,30,20,0.18)";
    ctx.lineWidth = w * 0.45;
    ctx.stroke();
    ctx.translate(-w * 0.05, -w * 0.38);
    trace(ctx, shown);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = w * 0.25;
    ctx.stroke();
    ctx.restore();
    return shown.at(-1);
  }
  function letters(s, x, y, size, o) {
    const { at = 0, tone = "ink", align = "left", per = 0.05 } = o;
    if (t < at)
      return 0;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${ROUND}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const w = ctx.measureText(s).width;
    let cx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    const color = LETTER[tone];
    for (const [i, ch] of [...s].entries()) {
      const cw = ctx.measureText(ch).width;
      const sq = squash(at + i * per);
      if (sq && ch !== " ") {
        const jx = (hash(i * 3 + boil) - 0.5) * 0.8 * u;
        const jy = (hash(i * 5 + boil) - 0.5) * 0.8 * u;
        const rot = (hash(i * 7.1) - 0.5) * 0.12;
        ctx.save();
        ctx.translate(cx + cw / 2 + jx, y + jy);
        ctx.rotate(rot);
        ctx.scale(sq.sx, sq.sy);
        ctx.fillStyle = "rgba(30,20,10,0.35)";
        ctx.fillText(ch, -cw / 2 + size * 0.03 * u, size * 0.07 * u);
        ctx.lineJoin = "round";
        ctx.lineWidth = size * 0.05 * u;
        ctx.strokeStyle = color;
        ctx.strokeText(ch, -cw / 2, 0);
        ctx.fillStyle = color;
        ctx.fillText(ch, -cw / 2, 0);
        ctx.save();
        ctx.globalCompositeOperation = "source-atop";
        const gr = ctx.createLinearGradient(0, -size * 0.5 * u, 0, size * 0.5 * u);
        gr.addColorStop(0, "rgba(255,255,255,0.45)");
        gr.addColorStop(0.5, "rgba(255,255,255,0)");
        gr.addColorStop(1, "rgba(40,20,10,0.3)");
        ctx.fillStyle = gr;
        ctx.fillText(ch, -cw / 2, 0);
        ctx.restore();
        ctx.restore();
      }
      cx += cw;
    }
    ctx.restore();
    return w;
  }
  function popAround(cx, cy, at, draw) {
    const sq = squash(at);
    if (!sq)
      return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sq.sx, sq.sy);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }
  return {
    surface() {
      const key = `${W}x${H}`;
      let img = cache.get(key);
      if (!img) {
        img = new OffscreenCanvas(W, H);
        const c = img.getContext("2d");
        c.fillStyle = "#4F8E94";
        c.fillRect(0, 0, W, H);
        for (let i = 0;i < 260; i++) {
          const x = hash(i * 1.3) * W;
          const y = hash(i * 2.1) * H * 0.8;
          const r = (20 + hash(i * 3.7) * 70) * u;
          const gr = c.createRadialGradient(x, y, 0, x, y, r);
          const light = hash(i * 5.3) > 0.5;
          gr.addColorStop(0, light ? "rgba(140,200,205,0.18)" : "rgba(20,60,70,0.16)");
          gr.addColorStop(1, "rgba(0,0,0,0)");
          c.fillStyle = gr;
          c.fillRect(x - r, y - r, r * 2, r * 2);
        }
        const top = H * 0.78;
        c.beginPath();
        c.moveTo(0, H);
        for (let i = 0;i <= 40; i++)
          c.lineTo(i / 40 * W, top + (hash(i * 4.1) - 0.5) * 6 * u);
        c.lineTo(W, H);
        c.closePath();
        const tg = c.createLinearGradient(0, top, 0, H);
        tg.addColorStop(0, "#E47A3A");
        tg.addColorStop(0.15, "#D9692E");
        tg.addColorStop(1, "#A84A1E");
        c.fillStyle = tg;
        c.fill();
        c.fillStyle = "rgba(255,220,180,0.25)";
        c.fillRect(0, top - 2 * u, W, 4 * u);
        c.strokeStyle = "rgba(90,30,10,0.25)";
        c.lineWidth = 1.5 * u;
        for (let i = 0;i < 60; i++) {
          const x = hash(i * 7.7) * W;
          const y = top + 10 * u + hash(i * 8.3) * (H - top - 20 * u);
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + (8 + hash(i) * 14) * u, y - (2 + hash(i * 2) * 4) * u);
          c.stroke();
        }
        const vg = c.createLinearGradient(0, 0, 0, top);
        vg.addColorStop(0, "rgba(10,30,40,0.3)");
        vg.addColorStop(1, "rgba(10,30,40,0)");
        c.fillStyle = vg;
        c.fillRect(0, 0, W, top);
        cache.set(key, img);
      }
      ctx.drawImage(img, 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 72, at = 0, tone = "good", align = "left" } = o;
      letters(s, X(x), Y(y), size, {
        at,
        tone,
        align,
        per: (o.dur ?? 0.8) / Math.max(1, s.length)
      });
    },
    label(s, x, y, o = {}) {
      letters(s, X(x), Y(y), o.size ?? 36, {
        at: o.at ?? 0,
        tone: o.tone ?? "ink",
        align: o.align ?? "center",
        per: 0.03
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const R = r * 1.2 * u;
      const seed = x * 31 + y * 17;
      popAround(X(x), Y(y), at, () => lump(blob(X(x), Y(y), R, R * 0.92, seed), CLAY[tone], X(x), Y(y), R, seed));
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const seed = x * 13 + y * 7;
      popAround(x0 + bw / 2, y0 + bh, at, () => {
        const shape = () => {
          ctx.beginPath();
          ctx.roundRect(x0, y0, bw, bh, 18 * u);
        };
        lump(shape, CLAY.ink, x0 + bw / 2, y0 + bh / 2, Math.max(bw, bh) / 2, seed);
        if (tone !== "ink") {
          ctx.save();
          ctx.strokeStyle = CLAY[tone];
          ctx.lineWidth = 7 * u;
          ctx.beginPath();
          ctx.roundRect(x0 + 8 * u, y0 + 8 * u, bw - 16 * u, bh - 16 * u, 12 * u);
          ctx.stroke();
          ctx.restore();
        }
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const thin = !head && tone === "accent";
      coil(pts, p, CLAY[tone], thin ? 5 : 13);
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 20 * u;
        coil([
          [end[0] - Math.cos(a - 0.6) * s, end[1] - Math.sin(a - 0.6) * s],
          end,
          [end[0] - Math.cos(a + 0.6) * s, end[1] - Math.sin(a + 0.6) * s]
        ], 1, CLAY[tone], 13);
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "muted" } = o;
      const n = 4;
      const [x0, bw] = [X(x), X(w)];
      const ph = Y(h) / n;
      const colors = [CLAY[tone], CLAY.good, CLAY[tone], CLAY.accent];
      for (let i = 0;i < n; i++) {
        const a = at + dur / n * i;
        const cy = Y(y + h) - ph * (i + 0.5);
        const seed = i * 9 + x * 5;
        popAround(x0 + bw / 2, cy + ph / 2, a, () => lump(blob(x0 + bw / 2, cy, bw / 2, ph * 0.48, seed), colors[i], x0 + bw / 2, cy, bw / 2, seed));
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      letters(value, X(x), Y(y), size, {
        at,
        tone: tone === "ink" ? "accent" : tone,
        align: "center",
        per: 0
      });
      if (sub)
        letters(sub, X(x), Y(y) + size * 0.75 * u, size * 0.36, {
          at: at + 0.3,
          tone: "ink",
          align: "center",
          per: 0.03
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 36) * u;
      const [cx, cy] = [X(x), Y(y)];
      const at = o.at ?? 0;
      const tone = o.tone ?? (kind === "check" ? "good" : "bad");
      popAround(cx, cy, at, () => {
        if (kind === "check")
          coil([
            [cx - s * 0.5, cy],
            [cx - s * 0.12, cy + s * 0.4],
            [cx + s * 0.6, cy - s * 0.5]
          ], 1, CLAY[tone], 11);
        else {
          coil([
            [cx - s * 0.5, cy - s * 0.5],
            [cx + s * 0.5, cy + s * 0.5]
          ], 1, CLAY[tone], 11);
          coil([
            [cx + s * 0.5, cy - s * 0.5],
            [cx - s * 0.5, cy + s * 0.5]
          ], 1, CLAY[tone], 11);
        }
      });
    },
    finish() {
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, alpha("#102028", 0.35));
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }
  };
}
var claymation_default = {
  id: "claymation",
  name: "Clay stop-motion",
  category: "Paper & Craft",
  make: make8
};

// plugin/skills/motion-graphics/styles/collage-zine.ts
var TONER = "#141414";
var SHEET = "#F1EEE6";
var PINK = "#FF3E8E";
var FACES2 = [
  '"Didot", "Bodoni 72", Georgia, serif',
  '"Impact", "Haettenschweiler", "Arial Narrow", sans-serif',
  '"Courier New", Courier, monospace',
  '"Futura", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
  '"American Typewriter", "Rockwell", Georgia, serif',
  '"Cooper Black", "Bookman Old Style", Georgia, serif'
];
var TYPED = '"American Typewriter", "Courier New", Courier, monospace';
var SCRAWL = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive';
function make9(ctx, t0, m) {
  const { W, H, u, X, Y } = frame(m);
  const t = Math.floor(t0 * 8) / 8;
  const step = Math.floor(t0 * 8);
  const g = globalThis;
  g.__zine ??= new Map;
  const cache = g.__zine;
  let lastSlam = -1;
  function slam(at) {
    if (t < at)
      return null;
    if (at > lastSlam)
      lastSlam = at;
    const first = t - at < 0.125;
    return { k: first ? 1.12 : 1, rot: first ? 0.05 : 0 };
  }
  function slammed(cx, cy, at, draw) {
    const s = slam(at);
    if (!s)
      return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(s.rot);
    ctx.scale(s.k, s.k);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }
  function tape(x, y, a, len = 46) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = "rgba(190,186,170,0.75)";
    const l = len * u;
    const w = 15 * u;
    trace(ctx, [
      [-l / 2, -w / 2],
      [l / 2, -w / 2 + u],
      [l / 2 - 2 * u, w / 2],
      [-l / 2 + u, w / 2 - u]
    ], true);
    ctx.fill();
    ctx.restore();
  }
  function scrap(x0, y0, w, h, fill, seed) {
    const pts = [];
    const n = 10;
    for (let i = 0;i < n; i++)
      pts.push([x0 + w * i / n, y0]);
    for (let i = 0;i < n; i++)
      pts.push([x0 + w, y0 + h * i / n]);
    for (let i = 0;i < n; i++)
      pts.push([x0 + w - w * i / n, y0 + h]);
    for (let i = 0;i < n; i++)
      pts.push([x0, y0 + h - h * i / n]);
    trace(ctx, roughen(pts, 2.4 * u, seed), true);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 3 * u;
    ctx.shadowOffsetY = 2 * u;
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }
  function ransom(s, x, y, size, o) {
    const { align = "left", seed = 0, pinkEvery = 4 } = o;
    const sz = size * u;
    const chars = [...s];
    const widths = chars.map((ch, i) => {
      ctx.font = `700 ${Math.round(sz * (0.85 + hash(seed + i * 3.1) * 0.3))}px ${FACES2[Math.floor(hash(seed + i * 1.7) * FACES2.length)]}`;
      return ch === " " ? sz * 0.35 : ctx.measureText(ch).width + sz * 0.22;
    });
    const total = widths.reduce((a, b) => a + b, 0);
    let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    for (const [i, ch] of chars.entries()) {
      const w = widths[i];
      if (ch !== " ") {
        const r = hash(seed + i * 5.3);
        const bg = r < 0.45 ? SHEET : r < 0.75 ? TONER : r < 0.9 && i % pinkEvery === 1 ? PINK : "#E4DFD2";
        const fg = bg === TONER || bg === PINK ? SHEET : TONER;
        const jx = (hash(seed + i + step * 0.37) - 0.5) * 1.5 * u;
        const jy = (hash(seed + i * 2 + step * 0.61) - 0.5) * 3 * u;
        ctx.save();
        ctx.translate(cx + w / 2 + jx, y + jy);
        ctx.rotate((hash(seed + i * 7.7) - 0.5) * 0.16);
        const bh = sz * 1.05;
        ctx.fillStyle = bg;
        ctx.shadowColor = "rgba(0,0,0,0.2)";
        ctx.shadowBlur = 2 * u;
        ctx.fillRect(-w / 2 + u, -bh / 2, w - 2 * u, bh);
        ctx.shadowColor = "transparent";
        ctx.font = `700 ${Math.round(sz * (0.85 + hash(seed + i * 3.1) * 0.3))}px ${FACES2[Math.floor(hash(seed + i * 1.7) * FACES2.length)]}`;
        ctx.fillStyle = fg;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(hash(seed + i * 9.9) > 0.5 ? ch.toUpperCase() : ch.toLowerCase(), 0, sz * 0.04);
        ctx.restore();
      }
      cx += w;
    }
    return total;
  }
  function typed(s, x, y, size, align, color = TONER) {
    ctx.font = `400 ${Math.round(size * u)}px ${TYPED}`;
    const w = ctx.measureText(s).width + size * 0.7 * u;
    const h = size * 1.35 * u;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.fillStyle = "#FBFAF5";
    ctx.fillRect(left, y - h / 2, w, h);
    ctx.strokeStyle = TONER;
    ctx.lineWidth = Math.max(1, 1.4 * u);
    ctx.strokeRect(left, y - h / 2, w, h);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + size * 0.35 * u, y + size * 0.05 * u);
  }
  function scrawl(points, p, color, width, seed) {
    const pts = roughen(points, 1.6 * u, seed + step % 3 * 0.13);
    const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    trace(ctx, shown);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
    return shown;
  }
  function offRegister(fn) {
    ctx.save();
    ctx.translate(3 * u, -2 * u);
    fn();
    ctx.restore();
  }
  return {
    surface() {
      ctx.fillStyle = SHEET;
      ctx.fillRect(0, 0, W, H);
      const v = step % 3;
      const key = `noise:${W}x${H}:${v}`;
      let img = cache.get(key);
      if (!img) {
        img = new OffscreenCanvas(W, H);
        const c = img.getContext("2d");
        const n = Math.floor(W * H / (90 * u * u));
        for (let i = 0;i < n; i++) {
          const s = (0.6 + hash(i * 1.1 + v * 91) * 1.4) * u;
          c.fillStyle = `rgba(20,20,20,${0.2 + hash(i * 2.3 + v) * 0.4})`;
          c.fillRect(hash(i * 3.7 + v * 13) * W, hash(i * 5.1 + v * 7) * H, s, s);
        }
        c.fillStyle = "rgba(20,20,20,0.05)";
        for (let i = 0;i < 4; i++)
          c.fillRect(hash(i * 9 + v) * W, 0, (1 + hash(i) * 3) * u, H);
        const gr = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.62);
        gr.addColorStop(0, "rgba(20,20,20,0)");
        gr.addColorStop(1, "rgba(20,20,20,0.18)");
        c.fillStyle = gr;
        c.fillRect(0, 0, W, H);
        cache.set(key, img);
      }
      ctx.drawImage(img, 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.11, size = 84, at = 0, align = "left" } = o;
      if (t < at)
        return;
      const n = Math.min(s.length, Math.floor((t - at) / 0.0625) + 1);
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${FACES2[1]}`;
      const est = s.length * size * 0.75 * u;
      ctx.restore();
      const left = align === "center" ? X(x) - est / 2 : align === "right" ? X(x) - est : X(x);
      slammed(left + est / 2, Y(y), at, () => {
        offRegister(() => {
          ctx.save();
          ctx.translate(left + est / 2, Y(y));
          ctx.rotate(-0.025);
          ctx.translate(-(left + est / 2), -Y(y));
          scrap(left - 40 * u, Y(y) - size * 0.95 * u, est + 80 * u, size * 1.9 * u, PINK, 3);
          ctx.restore();
        });
        tape(left - 30 * u, Y(y) - size * 0.6 * u, -0.6);
        tape(left + est + 30 * u, Y(y) + size * 0.5 * u, 0.5);
      });
      ransom(s.slice(0, n), left, Y(y), size, { align: "left", seed: 11 });
    },
    label(s, x, y, o = {}) {
      const size = o.size ?? 30;
      slammed(X(x), Y(y), o.at ?? 0, () => {
        if (o.tone === "bad" || o.tone === "accent") {
          offRegister(() => {
            ctx.save();
            ctx.font = `700 ${Math.round(size * 1.2 * u)}px ${SCRAWL}`;
            ctx.fillStyle = PINK;
            ctx.textAlign = o.align ?? "center";
            ctx.textBaseline = "middle";
            ctx.rotate(0);
            ctx.fillText(s.toUpperCase(), X(x), Y(y));
            ctx.restore();
          });
        } else
          typed(s, X(x), Y(y), size, o.align ?? "center");
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const R = r * u;
      slammed(X(x), Y(y), at, () => {
        const draw = () => {
          ctx.beginPath();
          ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
          ctx.fillStyle = tone === "accent" || tone === "bad" ? PINK : TONER;
          ctx.fill();
        };
        if (tone === "accent" || tone === "bad")
          offRegister(draw);
        else
          draw();
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R * 0.92, 0, Math.PI * 2);
        ctx.strokeStyle = TONER;
        ctx.lineWidth = 2.5 * u;
        ctx.stroke();
        ctx.fillStyle = SHEET;
        for (let i = 0;i < 5; i++) {
          const a = i / 5 * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(X(x) + Math.cos(a) * R * 0.45, Y(y) + Math.sin(a) * R * 0.45, R * 0.11, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      slammed(x0 + bw / 2, y0 + bh / 2, at, () => {
        scrap(x0 - 6 * u, y0 - 6 * u, bw + 12 * u, bh + 12 * u, tone === "ink" ? TONER : "#FBFAF5", 21 + x * 9);
        if (tone !== "ink") {
          ctx.strokeStyle = TONER;
          ctx.lineWidth = 3 * u;
          ctx.strokeRect(x0 + 4 * u, y0 + 4 * u, bw - 8 * u, bh - 8 * u);
        }
        tape(x0, y0, -0.7);
        tape(x0 + bw, y0 + bh, -0.7);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      if (t < at)
        return;
      const p = Math.min(1, (t - at) / (dur || 0.000001) + 0.125);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const color = tone === "bad" ? PINK : TONER;
      const thin = !head && tone === "accent";
      const seed = x1 * 31 + y2 * 17;
      const draw = () => scrawl(pts, p, color, thin ? 1.6 : 4.5, seed);
      if (tone === "bad")
        offRegister(draw);
      else
        draw();
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 20 * u;
        scrawl([
          [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
          end,
          [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s]
        ], 1, color, 4.5, seed + 1);
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const n = 4;
      const [x0, bw] = [X(x), X(w)];
      const ph = Y(h) / n;
      for (let i = 0;i < n; i++) {
        const cy = Y(y + h) - ph * (i + 1);
        slammed(x0 + bw / 2, cy + ph / 2, at + dur / n * i, () => {
          ctx.save();
          ctx.translate(x0 + bw / 2, cy + ph / 2);
          ctx.rotate((hash(i * 3.3 + x) - 0.5) * 0.12);
          ctx.translate(-(x0 + bw / 2), -(cy + ph / 2));
          const fill = i === 2 ? PINK : i % 2 ? SHEET : TONER;
          scrap(x0, cy + 2 * u, bw, ph - 4 * u, fill, i * 7 + 40);
          ctx.restore();
        });
      }
      slammed(x0 + bw, Y(y), at + dur, () => tape(x0 + bw, Y(y) + 4 * u, 0.7, 36));
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const seed = Number.parseInt(value.replace(/\D/g, ""), 10) || 0;
      const w = ransom(value, X(x), Y(y), size, {
        align: "center",
        seed: seed * 1.37 + 5,
        pinkEvery: 2
      });
      if (sub)
        slammed(X(x), Y(y), at + 0.25, () => typed(sub, X(x), Y(y) + size * 0.85 * u, size * 0.28, "center"));
      if (sub && t >= at + dur) {
        offRegister(() => {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(X(x), Y(y), w / 2 + 14 * u, size * 0.7 * u, -0.05, 0, Math.PI * 2);
          ctx.strokeStyle = PINK;
          ctx.lineWidth = 4 * u;
          ctx.stroke();
          ctx.restore();
        });
      }
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const [cx, cy] = [X(x), Y(y)];
      const at = o.at ?? 0;
      if (t < at)
        return;
      const color = kind === "check" ? TONER : PINK;
      const draw = () => {
        if (kind === "check")
          scrawl([
            [cx - s * 0.5, cy],
            [cx - s * 0.12, cy + s * 0.4],
            [cx + s * 0.7, cy - s * 0.6]
          ], 1, color, 6, cx);
        else {
          scrawl([
            [cx - s * 0.6, cy - s * 0.5],
            [cx + s * 0.6, cy + s * 0.5]
          ], 1, color, 7, cx);
          scrawl([
            [cx + s * 0.6, cy - s * 0.5],
            [cx - s * 0.6, cy + s * 0.5]
          ], 1, color, 7, cx + 1);
        }
      };
      if (kind === "cross")
        offRegister(draw);
      else
        draw();
    },
    finish() {
      if (lastSlam >= 0 && t - lastSlam < 0.125) {
        ctx.fillStyle = "rgba(255,255,255,0.28)";
        ctx.fillRect(0, 0, W, H);
      }
    }
  };
}
var collage_zine_default = {
  id: "collage-zine",
  name: "Photocopy zine",
  category: "Paper & Craft",
  make: make9
};

// plugin/skills/motion-graphics/styles/comic.ts
var INK2 = "#141414";
var PAPER = "#F2EAD7";
var CREAM3 = "#FDF9EE";
var FILL = {
  ink: CREAM3,
  accent: "#FFE45C",
  good: "#3F72C9",
  bad: "#E63946",
  muted: "#E9DFC6"
};
var LETTER2 = '"Bangers", "Impact", "Haettenschweiler", "Arial Narrow", sans-serif';
function make10(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const letter = (size) => `italic 400 ${Math.round(size * u)}px ${LETTER2}`;
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
  function letters(s, cx, cy, size, color = INK2, align = "center") {
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
      ctx.strokeStyle = INK2;
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
      ctx.strokeStyle = INK2;
      ctx.strokeRect(X(x), Y(y), tw, size * 1.5 * u);
      letters(s, X(x) + 16 * u, Y(y) + size * 0.78 * u, size, INK2, "left");
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      popped(X(x), Y(y), o.at, () => letters(s, X(x), Y(y), o.size ?? 34, INK2, o.align ?? "center"));
    },
    node(x, y, r, o = {}) {
      popped(X(x), Y(y), o.at, () => {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), r * u, 0, Math.PI * 2);
        ctx.fillStyle = FILL[o.tone ?? "accent"];
        ctx.fill();
        ctx.lineWidth = 5 * u;
        ctx.strokeStyle = INK2;
        ctx.stroke();
      });
    },
    box(x, y, w, h, o = {}) {
      popped(X(x + w / 2), Y(y + h / 2), o.at, () => {
        ctx.fillStyle = FILL[o.tone ?? "ink"];
        ctx.fillRect(X(x), Y(y), X(w), Y(h));
        ctx.lineWidth = 6 * u;
        ctx.strokeStyle = INK2;
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
      ctx.strokeStyle = INK2;
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
        ctx.strokeStyle = INK2;
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
          ctx.fillStyle = i % 2 ? "#FFE45C" : CREAM3;
          ctx.fill();
          ctx.lineWidth = 5 * u;
          ctx.strokeStyle = INK2;
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
        ctx.strokeStyle = INK2;
        ctx.stroke();
        const color = tone === "ink" || tone === "accent" ? INK2 : CREAM3;
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
        ctx.strokeStyle = INK2;
        ctx.stroke();
        ctx.lineWidth = 9 * u;
        ctx.strokeStyle = CREAM3;
        ctx.lineCap = "round";
        const [cx, cy] = [X(x), Y(y)];
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.45, cy],
            [cx - r * 0.1, cy + r * 0.35],
            [cx + r * 0.5, cy - r * 0.35]
          ]);
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
var comic_default = { id: "comic", name: "Halftone comic", category: "Print", make: make10 };

// plugin/skills/motion-graphics/styles/constructivist.ts
var RED2 = "#C8261E";
var BLACK2 = "#1B1714";
var CREAM4 = "#EADFC6";
var TONE4 = {
  ink: BLACK2,
  accent: RED2,
  good: BLACK2,
  bad: RED2,
  muted: "#8A7F6C"
};
var HEAVY = '"Anton", "Impact", "Haettenschweiler", "Arial Narrow", "Helvetica Neue", sans-serif';
var SLANT = -0.09;
function make11(ctx, t0, m) {
  const { W, H, u, X, Y } = frame(m);
  const t = Math.floor(t0 * 12) / 12;
  const font = (size) => `400 ${Math.round(size * u)}px ${HEAVY}`;
  const g = globalThis;
  g.__agitMottle ??= new Map;
  const cache = g.__agitMottle;
  const prog = (at = 0, dur = 0.3) => clamp((t - at) / (dur || 0.000001));
  const slam = (at = 0) => {
    const p = prog(at, 0.25);
    return p <= 0 ? 0 : 1 + (1 - p) ** 2 * 0.7;
  };
  function slanted(cx, cy, s, draw) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(SLANT);
    ctx.scale(s, s);
    draw();
    ctx.restore();
  }
  function caps(s, x, y, size, color, align = "center") {
    ctx.font = font(size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s.toUpperCase(), x, y);
  }
  function slab(s, cx, cy, size, bg, fg, at, align = "center") {
    const k = slam(at);
    if (k <= 0)
      return;
    ctx.font = font(size);
    const w = ctx.measureText(s.toUpperCase()).width + size * 0.5 * u;
    const h = size * 1.2 * u;
    const ox = align === "center" ? -w / 2 : align === "right" ? -w : 0;
    slanted(cx, cy, k, () => {
      ctx.fillStyle = bg;
      ctx.fillRect(ox, -h / 2, w, h);
      caps(s, ox + w / 2, h * 0.04, size, fg);
    });
  }
  function mottle() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const x = c.getContext("2d");
      for (let i = 0;i < 2600; i++) {
        const v = hash(i * 1.37);
        x.fillStyle = v > 0.5 ? "rgba(255,250,235,0.08)" : "rgba(60,40,20,0.07)";
        x.beginPath();
        x.arc(hash(i * 2.11) * W, hash(i * 3.17) * H, (1 + hash(i * 4.3) * 5) * u, 0, Math.PI * 2);
        x.fill();
      }
      const vg = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      vg.addColorStop(0, "rgba(90,60,30,0)");
      vg.addColorStop(1, "rgba(90,60,30,0.28)");
      x.fillStyle = vg;
      x.fillRect(0, 0, W, H);
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  function halftone(x, y, w, h, color) {
    ctx.fillStyle = color;
    const s = 7 * u;
    for (let py = y;py < y + h; py += s)
      for (let px = x;px < x + w; px += s) {
        const f = clamp(0.25 + (px - x) / w * 0.6);
        ctx.beginPath();
        ctx.arc(px, py, s * 0.5 * f, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  return {
    surface() {
      ctx.fillStyle = CREAM4;
      ctx.fillRect(0, 0, W, H);
      const p = prog(0, 0.6);
      const ease = 1 - (1 - p) ** 3;
      ctx.beginPath();
      ctx.arc(X(1) + (1 - ease) * 500 * u, Y(1), 340 * u, 0, Math.PI * 2);
      ctx.fillStyle = RED2;
      ctx.fill();
      ctx.save();
      ctx.translate(X(0.5), Y(0.93));
      ctx.rotate(SLANT * 1.6);
      ctx.fillStyle = BLACK2;
      ctx.fillRect(-W * 0.8 * ease, -14 * u, W * 0.8 * ease * 2, 28 * u);
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.09, size = 66, at = 0 } = o;
      slab(s, X(x), Y(y), size, BLACK2, CREAM4, at, "left");
    },
    label(s, x, y, o = {}) {
      const { size = 36, align = "center", tone = "ink", at = 0 } = o;
      const bg = tone === "bad" || tone === "accent" ? RED2 : BLACK2;
      slab(s, X(x), Y(y), size, bg, CREAM4, at, align);
    },
    node(x, y, r, o = {}) {
      const k = slam(o.at);
      if (k <= 0)
        return;
      const R = r * u;
      const tone = o.tone ?? "accent";
      ctx.save();
      ctx.translate(X(x), Y(y));
      ctx.scale(k, k);
      ctx.beginPath();
      ctx.arc(3 * u, 3 * u, R, 0, Math.PI * 2);
      ctx.fillStyle = BLACK2;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fillStyle = tone === "accent" || tone === "bad" ? RED2 : CREAM4;
      ctx.fill();
      ctx.save();
      ctx.clip();
      halftone(-R, -R, R * 2, R * 2, "rgba(27,23,20,0.55)");
      ctx.restore();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const p = prog(o.at, 0.25);
      if (p <= 0)
        return;
      const off = (1 - p) * 120 * u;
      const [bx, by, bw, bh] = [X(x) - off, Y(y) + off * 0.3, X(w), Y(h)];
      ctx.save();
      ctx.fillStyle = BLACK2;
      ctx.fillRect(bx + 8 * u, by + 8 * u, bw, bh);
      ctx.fillStyle = CREAM4;
      ctx.fillRect(bx, by, bw, bh);
      ctx.lineWidth = 6 * u;
      ctx.strokeStyle = BLACK2;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + bw * 0.35, by);
      ctx.lineTo(bx, by + bh * 0.35);
      ctx.closePath();
      ctx.fillStyle = o.tone === "bad" ? BLACK2 : RED2;
      ctx.fill();
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.3, bend = 0, head = true, tone = "accent" } = o;
      const p = prog(at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 24);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      trace(ctx, shown);
      ctx.strokeStyle = head ? TONE4[tone] : tone === "accent" ? "rgba(200,38,30,0.7)" : TONE4[tone];
      ctx.lineWidth = (head ? 9 : 3) * u;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 30 * u, false);
        ctx.fillStyle = TONE4[tone];
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const n = 5;
      for (let i = 0;i < n; i++) {
        const p = prog(at + i * 0.08, 0.2);
        if (p <= 0)
          continue;
        const bh = Y(h) / n;
        const off = (1 - p) * -200 * u;
        ctx.save();
        ctx.translate(X(x + w / 2) + off, Y(y) + bh * (i + 0.5));
        ctx.rotate(SLANT);
        ctx.fillStyle = i % 2 ? RED2 : BLACK2;
        ctx.fillRect(-X(w) / 2 - i % 2 * 6 * u, -bh * 0.38, X(w) + i % 2 * 12 * u, bh * 0.76);
        ctx.restore();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "accent" } = o;
      const k = slam(at);
      if (k <= 0)
        return;
      const [cx, cy] = [X(x), Y(y)];
      if (sub) {
        const n = 14;
        const reach = prog(at, 0.4);
        ctx.save();
        ctx.translate(cx, cy);
        for (let i = 0;i < n; i++) {
          const a = i / n * Math.PI * 2 + 0.2;
          const l = size * (2.8 + hash(i) * 1.2) * u * reach * (1 + 0.05 * Math.sin(t * 12 + i));
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - 0.16) * size * 0.6 * u, Math.sin(a - 0.16) * size * 0.6 * u);
          ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l);
          ctx.lineTo(Math.cos(a + 0.16) * size * 0.6 * u, Math.sin(a + 0.16) * size * 0.6 * u);
          ctx.closePath();
          ctx.fillStyle = i % 2 ? RED2 : BLACK2;
          ctx.fill();
        }
        ctx.restore();
      }
      const str = count ? counting(t, at, dur, count) + s : s;
      slanted(cx, cy, k, () => {
        if (sub) {
          ctx.font = font(size);
          const w = ctx.measureText(`${count ? count[1] : ""}${s}`).width + size * 0.4 * u;
          ctx.fillStyle = BLACK2;
          ctx.fillRect(-w / 2, -size * 0.62 * u, w, size * 1.2 * u);
          caps(str, 0, size * 0.03 * u, size, tone === "accent" || tone === "bad" ? RED2 : CREAM4);
          ctx.fillStyle = RED2;
          ctx.font = font(size * 0.3);
          const sw = ctx.measureText(sub.toUpperCase()).width + 16 * u;
          ctx.fillRect(-sw / 2, -size * 0.95 * u, sw, size * 0.38 * u);
          caps(sub, 0, -size * 0.76 * u, size * 0.3, CREAM4);
        } else
          caps(str, 0, 0, size, TONE4[tone]);
      });
    },
    mark(kind, x, y, o = {}) {
      const k = slam(o.at);
      if (k <= 0)
        return;
      const r = (o.size ?? 34) * u;
      ctx.save();
      ctx.translate(X(x), Y(y));
      ctx.scale(k, k);
      ctx.rotate(SLANT);
      ctx.strokeStyle = kind === "check" ? BLACK2 : RED2;
      ctx.lineWidth = r * 0.38;
      ctx.lineCap = "butt";
      if (kind === "check")
        trace(ctx, [
          [-r * 0.7, 0],
          [-r * 0.15, r * 0.55],
          [r * 0.8, -r * 0.6]
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, -r * 0.7);
        ctx.lineTo(r * 0.7, r * 0.7);
        ctx.moveTo(r * 0.7, -r * 0.7);
        ctx.lineTo(-r * 0.7, r * 0.7);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      mottle();
    }
  };
}
var constructivist_default = {
  id: "constructivist",
  name: "Agitprop poster",
  category: "Art & Design Movements",
  make: make11
};

// plugin/skills/motion-graphics/styles/cosmic.ts
var SPACE = "#070818";
var GOLD2 = "#DDBF7A";
var CYAN = "#A8DDE6";
var STAR = "#F4F1E8";
var TONE5 = {
  ink: GOLD2,
  accent: CYAN,
  good: "#9BE3B0",
  bad: "#F07A7A",
  muted: "#8A86A8"
};
var BODY = {
  ink: ["#F2D9A0", "#5A4220"],
  accent: ["#BFEFF5", "#1D4E66"],
  good: ["#C8F2C9", "#1E5634"],
  bad: ["#F6B39A", "#6A2320"],
  muted: ["#C9C3E0", "#34304F"]
};
var SANS = '"Avenir Next", "Futura", "Century Gothic", "Helvetica Neue", sans-serif';
var SERIF2 = '"Cormorant Garamond", "Iowan Old Style", "Palatino", Georgia, serif';
function make12(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const sans = (size) => `700 ${Math.round(size * u)}px ${SANS}`;
  const serif = (size, style = "500") => `${style} ${Math.round(size * u)}px ${SERIF2}`;
  const g = globalThis;
  g.__cosmicSky ??= new Map;
  const cache = g.__cosmicSky;
  function sky() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      const cw = Math.round(W * 1.1);
      const chh = Math.round(H * 1.1);
      c = new OffscreenCanvas(cw, chh);
      const x = c.getContext("2d");
      x.fillStyle = SPACE;
      x.fillRect(0, 0, cw, chh);
      const clouds = ["58,190,200", "130,70,200", "220,90,170", "80,60,170", "230,180,110"];
      for (let i = 0;i < 46; i++) {
        const px = (0.15 + hash(i * 1.3) * 0.8) * cw;
        const py = (0.2 + hash(i * 2.1) * 0.7) * chh;
        const r = (80 + hash(i * 3.7) * 260) * u;
        const gr = x.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, `rgba(${clouds[i % clouds.length]},${0.1 + hash(i) * 0.12})`);
        gr.addColorStop(1, `rgba(${clouds[i % clouds.length]},0)`);
        x.fillStyle = gr;
        x.fillRect(px - r, py - r, r * 2, r * 2);
      }
      for (let i = 0;i < 900; i++) {
        const b = hash(i * 4.4);
        x.fillStyle = `rgba(244,241,232,${0.25 + b * 0.7})`;
        x.beginPath();
        x.arc(hash(i * 5.1) * cw, hash(i * 6.3) * chh, (0.4 + b ** 4 * 1.8) * u, 0, Math.PI * 2);
        x.fill();
      }
      cache.set(key, c);
    }
    const d = clamp(t / 20);
    ctx.drawImage(c, -W * 0.05 * d, -H * 0.04 * d);
  }
  function caps(s, x, y, size, color, align = "left", at = 0) {
    const p = progress(t, at, 0.5);
    if (p <= 0)
      return;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.font = serif(size, "600");
    ctx.letterSpacing = `${Math.round(size * 0.18 * u)}px`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s.toUpperCase(), x, y);
    ctx.restore();
  }
  function flare(x, y, size, p) {
    if (p <= 0 || p >= 1)
      return;
    const k = Math.sin(p * Math.PI);
    ctx.save();
    ctx.globalAlpha = k;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, size);
    gr.addColorStop(0, "rgba(255,250,235,0.9)");
    gr.addColorStop(1, "rgba(255,250,235,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(x - size, y - size, size * 2, size * 2);
    ctx.strokeStyle = "rgba(255,250,235,0.8)";
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(x - size * 1.6, y);
    ctx.lineTo(x + size * 1.6, y);
    ctx.moveTo(x, y - size * 1.6);
    ctx.lineTo(x, y + size * 1.6);
    ctx.stroke();
    ctx.restore();
  }
  function dotted(points, color, w = 1.2, gap = 6) {
    ctx.save();
    trace(ctx, points);
    ctx.setLineDash([1.5 * u, gap * u]);
    ctx.lineCap = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = w * u;
    ctx.stroke();
    ctx.restore();
  }
  return {
    surface() {
      sky();
      const p = progress(t, 0.2, 1.5);
      if (p <= 0)
        return;
      const [cx, cy, R] = [X(0.9), Y(0.86), 105 * u];
      ctx.save();
      ctx.globalAlpha = p;
      ctx.translate(cx, cy);
      ctx.rotate(-0.35);
      const ring = (front) => {
        for (let k = 0;k < 5; k++) {
          ctx.beginPath();
          ctx.ellipse(0, 0, R * (1.45 + k * 0.08), R * (0.32 + k * 0.02), 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
          ctx.strokeStyle = `rgba(221,191,122,${0.55 - k * 0.08})`;
          ctx.lineWidth = 5 * u;
          ctx.stroke();
        }
      };
      ring(false);
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.clip();
      const bands = ["#E9C9A0", "#C98E6A", "#F1DDBE", "#B67A63", "#E6C7A6", "#9C6B5E"];
      for (let i = 0;i < 12; i++) {
        ctx.fillStyle = bands[i % bands.length];
        ctx.fillRect(-R, -R + i / 12 * R * 2, R * 2, R * 2 / 12 + 1);
      }
      const sh = ctx.createRadialGradient(-R * 0.4, -R * 0.4, R * 0.2, 0, 0, R * 1.05);
      sh.addColorStop(0, "rgba(0,0,0,0)");
      sh.addColorStop(1, "rgba(7,8,24,0.85)");
      ctx.fillStyle = sh;
      ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.restore();
      ring(true);
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.08, size = 50, at = 0, dur = 0.9, align = "left" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = sans(size);
      ctx.letterSpacing = `${Math.round((0.02 + (1 - expo(p)) * 0.2) * size * u)}px`;
      ctx.fillStyle = STAR;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(168,221,230,0.5)";
      ctx.shadowBlur = 12 * u;
      ctx.fillText(s, X(x), Y(y));
      const w = ctx.measureText(s).width;
      ctx.restore();
      const q = expo(progress(t, at + 0.3, 0.7));
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      ctx.fillStyle = alpha(GOLD2, 0.8);
      ctx.fillRect(left, Y(y) + size * 0.7 * u, w * q, 1.2 * u);
      for (let k = 0;k <= 20 * q; k++)
        ctx.fillRect(left + w / 20 * k, Y(y) + size * 0.7 * u, 1 * u, (k % 5 ? 4 : 8) * u);
    },
    label(s, x, y, o = {}) {
      const { size = 30, align = "center", tone = "ink", at = 0 } = o;
      caps(s, X(x), Y(y), size, TONE5[tone], align, at);
    },
    node(x, y, r, o = {}) {
      const at = o.at ?? 0;
      const tone = o.tone ?? "accent";
      const [cx, cy] = [X(x), Y(y)];
      const R = r * u * 0.8;
      flare(cx, cy, R * 1.6, progress(t, at, 0.5));
      const p = progress(t, at + 0.2, 0.5);
      if (p <= 0)
        return;
      dotted(ellipse(cx, cy, R * 1.9, R * 0.75, 40, Math.PI, p), alpha(GOLD2, 0.6), 1.2, 4);
      const [lit, dark] = BODY[tone];
      const gr = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.1, cx, cy, R);
      gr.addColorStop(0, lit);
      gr.addColorStop(1, dark);
      ctx.save();
      ctx.globalAlpha = p;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.restore();
      const a = t * 0.8 + hash(x * 9 + y * 3) * 6;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * R * 1.9, cy + Math.sin(a) * R * 0.75, 2 * u, 0, Math.PI * 2);
      ctx.fillStyle = alpha(STAR, p);
      ctx.fill();
    },
    box(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const p = expo(progress(t, at, o.dur ?? 0.7));
      if (p <= 0)
        return;
      const col = TONE5[o.tone ?? "ink"];
      const [bx, by, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      ctx.save();
      ctx.fillStyle = `rgba(7,8,24,${0.55 * p})`;
      ctx.fillRect(bx, by, bw, bh);
      const outline = [
        [bx, by],
        [bx + bw, by],
        [bx + bw, by + bh],
        [bx, by + bh],
        [bx, by]
      ];
      trace(ctx, outline.slice(0, 2 + Math.floor(p * 3)));
      ctx.strokeStyle = alpha(col, 0.85);
      ctx.lineWidth = 1.2 * u;
      ctx.stroke();
      ctx.fillStyle = alpha(col, 0.8);
      for (let k = 0;k <= 24 * p; k++)
        ctx.fillRect(bx + bw / 24 * k, by, 1 * u, (k % 6 ? 4 : 9) * u);
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const p = expo(progress(t, at, dur));
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      if (head) {
        ctx.save();
        trace(ctx, shown);
        ctx.strokeStyle = alpha(TONE5[tone], 0.9);
        ctx.lineWidth = 1.6 * u;
        ctx.shadowColor = TONE5[tone];
        ctx.shadowBlur = 6 * u;
        ctx.stroke();
        ctx.restore();
        if (p >= 0.99) {
          const end = pts.at(-1);
          const prev = pts.at(-3);
          ctx.save();
          arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 12 * u);
          ctx.strokeStyle = TONE5[tone];
          ctx.lineWidth = 1.6 * u;
          ctx.stroke();
          ctx.restore();
        }
      } else
        dotted(shown, alpha(TONE5[tone], 0.6), 1.3, 4);
    },
    store(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const [cx, cy] = [X(x + w / 2), Y(y + h / 2)];
      const R = Math.max(X(w), Y(h)) * 0.55;
      const p = expo(progress(t, at, o.dur ?? 0.8));
      if (p <= 0)
        return;
      ctx.save();
      trace(ctx, ellipse(cx, cy, R, R, 60, -Math.PI / 2, p));
      ctx.strokeStyle = alpha(GOLD2, 0.85);
      ctx.lineWidth = 1.2 * u;
      ctx.stroke();
      ctx.fillStyle = alpha(GOLD2, 0.8);
      for (let k = 0;k < 36 * p; k++) {
        const a = -Math.PI / 2 + k / 36 * Math.PI * 2;
        const l = (k % 9 ? 4 : 9) * u;
        ctx.fillRect(cx + Math.cos(a) * R - 0.5 * u, cy + Math.sin(a) * R - 0.5 * u, 1 * u, 1 * u);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.lineTo(cx + Math.cos(a) * (R + l), cy + Math.sin(a) * (R + l));
        ctx.strokeStyle = alpha(GOLD2, 0.7);
        ctx.stroke();
      }
      ctx.restore();
      for (let i = 0;i < 26; i++) {
        const q = progress(t, at + 0.2 + i * 0.025, 0.3);
        if (q <= 0)
          continue;
        const a = hash(i * 3.1) * Math.PI * 2;
        const rr = Math.sqrt(hash(i * 5.7)) * R * 0.85;
        const sx = cx + Math.cos(a) * rr;
        const sy = cy + Math.sin(a) * rr;
        const tw = 0.6 + 0.4 * Math.sin(t * 3 + i);
        ctx.beginPath();
        ctx.arc(sx, sy, (1 + hash(i) * 2.2) * u, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(244,241,232,${q * tw})`;
        ctx.fill();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "ink" } = o;
      const p = progress(t, at, 0.4);
      if (p <= 0)
        return;
      const [cx, cy] = [X(x), Y(y)];
      const str = count ? counting(t, at, dur, count) + s : s;
      if (sub) {
        const R = size * 1.25 * u;
        const q = expo(progress(t, at, 1.2));
        ctx.save();
        trace(ctx, ellipse(cx, cy, R, R, 72, -Math.PI / 2, q));
        ctx.strokeStyle = alpha(GOLD2, 0.7);
        ctx.lineWidth = 1.2 * u;
        ctx.stroke();
        ctx.strokeStyle = alpha(GOLD2, 0.6);
        for (let k = 0;k < 72 * q; k++) {
          const a = -Math.PI / 2 + k / 72 * Math.PI * 2;
          const l = (k % 6 ? 4 : 10) * u;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
          ctx.lineTo(cx + Math.cos(a) * (R - l), cy + Math.sin(a) * (R - l));
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = sans(size);
      ctx.letterSpacing = `${Math.round(size * 0.04 * u)}px`;
      ctx.fillStyle = sub ? STAR : TONE5[tone];
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = alpha(TONE5[tone], 0.6);
      ctx.shadowBlur = 14 * u;
      ctx.fillText(str, cx, cy - (sub ? size * 0.1 * u : 0));
      ctx.restore();
      if (sub) {
        ctx.save();
        ctx.globalAlpha = p;
        ctx.font = serif(size * 0.32, "italic 500");
        ctx.fillStyle = CYAN;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(sub, cx, cy + size * 0.55 * u);
        ctx.restore();
      }
    },
    mark(kind, x, y, o = {}) {
      const at = o.at ?? 0;
      const p = expo(progress(t, at, 0.4));
      if (p <= 0)
        return;
      const r = (o.size ?? 22) * u;
      const col = kind === "check" ? TONE5.good : TONE5.bad;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      trace(ctx, ellipse(cx, cy, r, r, 40, -Math.PI / 2, p));
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.4 * u;
      ctx.stroke();
      ctx.beginPath();
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]) {
        ctx.moveTo(cx + dx * r * 0.8, cy + dy * r * 0.8);
        ctx.lineTo(cx + dx * r * 1.3, cy + dy * r * 1.3);
      }
      ctx.stroke();
      ctx.lineWidth = 2.2 * u;
      if (kind === "check")
        trace(ctx, [
          [cx - r * 0.4, cy],
          [cx - r * 0.1, cy + r * 0.3],
          [cx + r * 0.45, cy - r * 0.35]
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.35, cy - r * 0.35);
        ctx.lineTo(cx + r * 0.35, cy + r * 0.35);
        ctx.moveTo(cx + r * 0.35, cy - r * 0.35);
        ctx.lineTo(cx - r * 0.35, cy + r * 0.35);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      const p = progress(t, 1, 1.6);
      if (p > 0 && p < 1) {
        const hx = X(1.05 - p * 0.7);
        const hy = Y(0.05 + p * 0.25);
        const gr = ctx.createLinearGradient(hx, hy, hx + 160 * u, hy - 60 * u);
        gr.addColorStop(0, "rgba(244,241,232,0.9)");
        gr.addColorStop(1, "rgba(244,241,232,0)");
        ctx.save();
        ctx.strokeStyle = gr;
        ctx.lineWidth = 2.5 * u;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + 160 * u, hy - 60 * u);
        ctx.stroke();
        ctx.restore();
      }
      vignette(ctx, m, 0.5);
    }
  };
}
var cosmic_default = {
  id: "cosmic",
  name: "Celestial atlas",
  category: "Cosmic & Psychedelic",
  make: make12
};

// plugin/skills/motion-graphics/styles/cross-stitch.ts
var FLOSS = {
  ink: "#2E3A6E",
  accent: "#E6A43A",
  good: "#3E9A8E",
  bad: "#C8323A",
  muted: "#8C8A96"
};
var AIDA = "#EAE1CC";
var GLYPHS = {
  A: "010101111101101",
  B: "110101110101110",
  C: "011100100100011",
  D: "110101101101110",
  E: "111100110100111",
  F: "111100110100100",
  G: "011100101101011",
  H: "101101111101101",
  I: "111010010010111",
  J: "001001001101010",
  K: "101101110101101",
  L: "100100100100111",
  M: "101111111101101",
  N: "110101101101101",
  O: "010101101101010",
  P: "110101110100100",
  Q: "010101101111011",
  R: "110101110101101",
  S: "011100010001110",
  T: "111010010010010",
  U: "101101101101111",
  V: "101101101101010",
  W: "101101111111101",
  X: "101101010101101",
  Y: "101101010010010",
  Z: "111001010100111",
  "0": "111101101101111",
  "1": "010110010010111",
  "2": "110001010100111",
  "3": "110001010001110",
  "4": "101101111001001",
  "5": "111100110001110",
  "6": "011100111101111",
  "7": "111001010010010",
  "8": "111101111101111",
  "9": "111101111001110",
  "%": "101001010100101",
  "?": "110001010000010",
  ",": "000000000010100",
  ".": "000000000000010",
  "!": "010010010000010",
  "-": "000000111000000",
  ":": "000010000010000",
  "'": "010010000000000"
};
function make13(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const C = Math.max(4, Math.round(9 * u));
  const snap = (v) => Math.round(v / C) * C;
  let needle = null;
  let needleAt = -1;
  const g = globalThis;
  g.__crossStitch ??= new Map;
  const cache = g.__crossStitch;
  const hx = W / 2;
  const hy = H / 2;
  const rx = W * 0.5;
  const ry = H * 0.62;
  function cross(px, py, color) {
    const i = 1.2 * u;
    ctx.strokeStyle = color;
    ctx.lineWidth = C * 0.34;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px + i, py + C - i);
    ctx.lineTo(px + C - i, py + i);
    ctx.moveTo(px + i, py + i);
    ctx.lineTo(px + C - i, py + C - i);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = C * 0.1;
    ctx.beginPath();
    ctx.moveTo(px + i * 1.5, py + i * 1.5);
    ctx.lineTo(px + C - i * 1.5, py + C - i * 1.5);
    ctx.stroke();
  }
  function stitch(cells, color, at, dur) {
    if (t < at || !cells.length)
      return;
    const order = [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const p = progress(t, at, dur);
    const n = Math.ceil(order.length * p);
    for (let k = 0;k < n; k++) {
      const [px, py] = order[k];
      cross(px, py, color);
    }
    if (p < 1 && at >= needleAt) {
      const last = order[Math.max(0, n - 1)];
      needle = { x: last[0] + C, y: last[1], color };
      needleAt = at;
    }
  }
  function backstitch(points, color, at, dur, width = 0.28) {
    const p = progress(t, at, dur);
    if (p <= 0)
      return null;
    const holes = [];
    for (let i = 1;i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / C));
      for (let j = i === 1 ? 0 : 1;j <= k; j++)
        holes.push([snap(a[0] + (b[0] - a[0]) * j / k), snap(a[1] + (b[1] - a[1]) * j / k)]);
    }
    const n = Math.max(2, Math.ceil(holes.length * p));
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = C * width;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0;i < n && i < holes.length; i++) {
      const [x, y] = holes[i];
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    const end = holes[Math.min(n, holes.length) - 1];
    if (p < 1 && at >= needleAt) {
      needle = { x: end[0], y: end[1], color };
      needleAt = at;
    }
    return { holes, done: p >= 1 };
  }
  function textCells(s, x, y, k) {
    const cells = [];
    let cx = snap(x);
    const cy = snap(y);
    for (const ch of s.toUpperCase()) {
      const gl = GLYPHS[ch];
      if (gl) {
        for (let r = 0;r < 5; r++)
          for (let c = 0;c < 3; c++)
            if (gl[r * 3 + c] === "1")
              for (let a = 0;a < k; a++)
                for (let b = 0;b < k; b++)
                  cells.push([cx + (c * k + a) * C, cy + (r * k + b) * C]);
      }
      cx += 4 * k * C;
    }
    return { cells, w: cx - snap(x) - k * C, h: 5 * k * C };
  }
  function letters(s, x, y, size, tone, align, at, dur) {
    const k = Math.max(1, Math.round(size * u / (5 * C)));
    const probe = textCells(s, 0, 0, k);
    const left = align === "center" ? x - probe.w / 2 : align === "right" ? x - probe.w : x;
    const { cells } = textCells(s, left, y - probe.h / 2, k);
    stitch(cells, FLOSS[tone], at, dur ?? 0.02 * cells.length / k + 0.2);
    return probe.w;
  }
  function discCells(cx, cy, r) {
    const cells = [];
    const n = Math.ceil(r / C);
    const [ox, oy] = [snap(cx), snap(cy)];
    for (let i = -n;i <= n; i++)
      for (let j = -n;j <= n; j++)
        if (Math.hypot(i + 0.5, j + 0.5) <= r / C + 0.2)
          cells.push([ox + i * C, oy + j * C]);
    return cells;
  }
  return {
    surface() {
      const key = `${W}x${H}:${C}`;
      let img = cache.get(key);
      if (!img) {
        img = new OffscreenCanvas(W, H);
        const c = img.getContext("2d");
        c.fillStyle = AIDA;
        c.fillRect(0, 0, W, H);
        c.fillStyle = "rgba(255,252,240,0.45)";
        for (let y = 0;y < H; y += C)
          for (let x = 0;x < W; x += C)
            c.fillRect(x + C * 0.18, y + C * 0.18, C * 0.64, C * 0.64);
        c.fillStyle = "rgba(120,100,70,0.22)";
        for (let y = 0;y < H; y += C)
          for (let x = 0;x < W; x += C)
            c.fillRect(x - 0.6 * u, y - 0.6 * u, 1.2 * u, 1.2 * u);
        const gr = c.createRadialGradient(hx, hy, 0, hx, hy, Math.max(rx, ry));
        gr.addColorStop(0, "rgba(255,255,255,0.12)");
        gr.addColorStop(1, "rgba(80,60,30,0.12)");
        c.fillStyle = gr;
        c.fillRect(0, 0, W, H);
        cache.set(key, img);
      }
      ctx.drawImage(img, 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.2, y = 0.1, size = 44, at = 0, tone = "bad", align = "left" } = o;
      letters(s, X(x), Y(y), size, tone, align, at, o.dur);
    },
    label(s, x, y, o = {}) {
      letters(s, X(x), Y(y), o.size ?? 30, o.tone ?? "ink", o.align ?? "center", o.at ?? 0, o.dur ?? 0.35);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.3, tone = "accent" } = o;
      const cells = discCells(X(x), Y(y), r * u);
      stitch(cells, FLOSS[tone], at, dur);
      if (t >= at + dur) {
        const ring = Array.from({ length: 13 }, (_, i) => {
          const a = i / 12 * Math.PI * 2;
          return [
            X(x) + C / 2 + Math.cos(a) * (r * u + C * 0.6),
            Y(y) + C / 2 + Math.sin(a) * (r * u + C * 0.6)
          ];
        });
        backstitch(ring, "#5A3A2A", at + dur, 0.15, 0.16);
      }
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      backstitch([
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0]
      ], FLOSS[tone === "good" ? "ink" : tone], at, dur, 0.32);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 12);
      const thin = !head && tone === "accent";
      const r = backstitch(pts, thin ? "rgba(46,58,110,0.45)" : FLOSS[tone], at, dur, thin ? 0.14 : 0.28);
      if (!r?.done || !head)
        return;
      const end = pts.at(-1);
      const prev = pts.at(-3);
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = C * 2.4;
      backstitch([
        [end[0] - Math.cos(a - 0.6) * s, end[1] - Math.sin(a - 0.6) * s],
        end,
        [end[0] - Math.cos(a + 0.6) * s, end[1] - Math.sin(a + 0.6) * s]
      ], FLOSS[tone], at + dur, 0.12, 0.28);
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9, tone = "muted" } = o;
      const [x0, y0, x1, y1] = [snap(X(x)), snap(Y(y)), snap(X(x + w)), snap(Y(y + h))];
      const cells = [];
      const bands = [];
      const rows = Math.round((y1 - y0) / C);
      for (let r = 0;r < rows; r++) {
        const inset = r === 0 || r === rows - 1 ? 1 : 0;
        for (let xx = x0 + inset * C;xx < x1 - inset * C; xx += C)
          (r % 4 === 3 ? bands : cells).push([xx, y0 + r * C]);
      }
      stitch(cells, FLOSS[tone], at, dur * 0.8);
      stitch(bands, FLOSS.ink, at + dur * 0.1, dur * 0.7);
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const w = letters(value, X(x), Y(y), size, tone, "center", at, 0.12);
      if (sub)
        letters(sub, X(x), Y(y) + size * 0.8 * u, size * 0.3, "good", "center", at + 0.3, 0.4);
      if (sub && t >= at + dur) {
        const ring = Array.from({ length: 25 }, (_, i) => {
          const a = i / 24 * Math.PI * 2;
          return [X(x) + Math.cos(a) * (w / 2 + C * 3), Y(y) + Math.sin(a) * size * 0.75 * u];
        });
        ctx.save();
        ctx.setLineDash([C * 1.2, C * 0.8]);
        backstitch(ring, FLOSS.bad, at + dur, 0.5, 0.2);
        ctx.restore();
      }
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const [cx, cy] = [X(x), Y(y)];
      const at = o.at ?? 0;
      const color = FLOSS[o.tone ?? (kind === "check" ? "good" : "bad")];
      const cells = [];
      const add = (a, b) => {
        const k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / C));
        for (let j = 0;j <= k; j++)
          cells.push([snap(a[0] + (b[0] - a[0]) * j / k), snap(a[1] + (b[1] - a[1]) * j / k)]);
      };
      if (kind === "check") {
        add([cx - s * 0.5, cy], [cx - s * 0.12, cy + s * 0.4]);
        add([cx - s * 0.12, cy + s * 0.4], [cx + s * 0.6, cy - s * 0.5]);
      } else {
        add([cx - s * 0.5, cy - s * 0.5], [cx + s * 0.5, cy + s * 0.5]);
        add([cx + s * 0.5, cy - s * 0.5], [cx - s * 0.5, cy + s * 0.5]);
      }
      stitch(cells, color, at, 0.3);
    },
    finish() {
      if (needle) {
        const { x, y, color } = needle;
        const bob = Math.sin(t * 20) * 3 * u;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6 * u;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 30 * u, y + 40 * u, x + 50 * u, y - 10 * u + bob);
        ctx.stroke();
        ctx.translate(x + 50 * u, y - 10 * u + bob);
        ctx.rotate(-0.9);
        ctx.fillStyle = "#C9CCD2";
        ctx.strokeStyle = "#6E727A";
        ctx.lineWidth = u;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(56 * u, -2.2 * u);
        ctx.lineTo(56 * u, 2.2 * u);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = AIDA;
        ctx.beginPath();
        ctx.ellipse(50 * u, 0, 3 * u, 1 * u, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.ellipse(hx, hy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#8C857A";
      ctx.fill("evenodd");
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = "#5E584E";
      ctx.lineWidth = 2 * u;
      for (let i = 0;i < 30; i++) {
        ctx.beginPath();
        const yy = hash(i * 3.1) * H;
        ctx.moveTo(0, yy);
        ctx.bezierCurveTo(W * 0.3, yy + 40 * u, W * 0.7, yy - 40 * u, W, yy + (hash(i) - 0.5) * 60 * u);
        ctx.stroke();
      }
      ctx.restore();
      for (const [w, col] of [
        [26, "#9A6A3A"],
        [20, "#D4A468"],
        [8, "#E9C48C"]
      ]) {
        ctx.beginPath();
        ctx.ellipse(hx, hy, rx + 10 * u, ry + 10 * u, 0, 0, Math.PI * 2);
        ctx.lineWidth = w * u;
        ctx.strokeStyle = col;
        ctx.stroke();
      }
    }
  };
}
var cross_stitch_default = {
  id: "cross-stitch",
  name: "Cross-stitch sampler",
  category: "Paper & Craft",
  make: make13
};

// plugin/skills/motion-graphics/styles/crt-terminal.ts
var GLOW = {
  ink: "#4DFF7A",
  accent: "#9CFFB4",
  good: "#4DFF7A",
  bad: "#4DFF7A",
  muted: "#1F9A44"
};
var BG = "#031207";
var MONO3 = '"VT323", "Menlo", "Consolas", "Courier New", monospace';
function make14(ctx, t, m) {
  const full = frame(m);
  const gx = full.W * 0.045;
  const gy = full.H * 0.05;
  const gw = full.W * 0.91;
  const gh = full.H * 0.83;
  const u = full.u * 0.88;
  const X = (x) => gx + x * gw;
  const Y = (y) => gy + y * gh;
  const W = gw;
  function glow(color, blur = 10) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * u;
  }
  function say(s, x, y, size, color, align = "left", cursor = false) {
    ctx.save();
    ctx.font = `${Math.round(size * u)}px ${MONO3}`;
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
    ctx.font = `${Math.round(size * u)}px ${MONO3}`;
    return ctx.measureText(s).width;
  }
  function beam(pts, color, width = 2.4, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.lineJoin = "miter";
    if (dash)
      ctx.setLineDash(dash.map((d) => d * u));
    glow(color, 9);
    ctx.beginPath();
    for (const [i, [x, y]] of pts.entries())
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    ctx.stroke();
    ctx.restore();
  }
  function rectPath(x, y, w, h, p) {
    const pts = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
      [x, y]
    ];
    const per = 2 * (w + h);
    let left = per * p;
    const out = [pts[0]];
    for (let i = 1;i < pts.length && left > 0; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const f = Math.min(1, left / l);
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      left -= l;
    }
    return out;
  }
  const chars = (s, at, cps = 28) => s.slice(0, Math.max(0, Math.floor((t - at) * cps)));
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
      const warm = progress(t, 0, 0.45);
      if (warm < 1) {
        const lh = Math.max(2, gh * warm ** 3);
        ctx.fillStyle = `rgba(160,255,190,${1 - warm * 0.6})`;
        ctx.fillRect(gx + gw * (0.5 - warm), gy + gh / 2 - lh / 2, gw * warm * 2, lh);
      }
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
      if (t < at)
        return;
      const s = chars(`> ${text}`, at, 22);
      const typing = s.length < text.length + 2;
      say(s, X(x), Y(y) + 20 * u, size, GLOW.ink, "left", typing || t - at < 2.5);
      if (!typing) {
        ctx.save();
        ctx.font = `${Math.round(size * u)}px ${MONO3}`;
        const tw = ctx.measureText(s).width;
        ctx.restore();
        say("=".repeat(Math.round(tw / (size * u * 0.6))), X(x), Y(y) + 20 * u + size * u * 0.75, size * 0.6, GLOW.muted);
      }
    },
    label(text, x, y, o = {}) {
      const { at = 0, size = 34, tone = "ink", align = "center" } = o;
      if (t < at)
        return;
      const s = chars(tone === "bad" ? `! ${text}` : text, at);
      say(s, X(x), Y(y), size, GLOW[tone], align, s.length < text.length);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.25, tone = "accent" } = o;
      if (t < at)
        return;
      const p = progress(t, at, dur);
      const rr = r * u;
      const pts = Array.from({ length: 25 }, (_, i) => {
        const a = -Math.PI / 2 + i / 24 * Math.PI * 2 * p;
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
      if (t < at)
        return;
      const p = progress(t, at, dur);
      beam(rectPath(X(x), Y(y), w * W, h * gh, p), GLOW[tone], 2.4);
      if (p >= 1)
        beam(rectPath(X(x) + 6 * u, Y(y) + 6 * u, w * W - 12 * u, h * gh - 12 * u, 1), GLOW.muted, 1.4);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (t < at)
        return;
      const p = progress(t, at, dur);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      const color = head ? GLOW[tone] : GLOW.muted;
      beam(shown, color, head ? 2.2 : 1.1, tone === "bad" ? [10, 7] : undefined);
      if (head && p >= 1) {
        const e = pts.at(-1);
        const q = pts.at(-3);
        const a = Math.atan2(e[1] - q[1], e[0] - q[0]);
        const s = 16 * u;
        beam([
          [e[0] - Math.cos(a - 0.5) * s, e[1] - Math.sin(a - 0.5) * s],
          e,
          [e[0] - Math.cos(a + 0.5) * s, e[1] - Math.sin(a + 0.5) * s]
        ], color, 2.2);
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (t < at)
        return;
      beam(rectPath(X(x), Y(y), w * W, h * gh, progress(t, at, 0.3)), GLOW.ink, 2);
      const lines = Math.floor((h * gh - 14 * u) / (20 * u));
      const shown = Math.min(lines, Math.floor(progress(t, at + 0.2, dur) * lines * 1.5));
      for (let i = 0;i < shown; i++) {
        const id = 4800 + Math.floor((t - at) * 40) + i * 7;
        say(`rec${String(id).slice(-3)}`, X(x) + 8 * u, Y(y) + 16 * u + i * 20 * u, 18, GLOW.muted);
      }
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "accent" } = o;
      if (t < at)
        return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const done = progress(t, at, dur) >= 1;
      const big = size * 1.15;
      const yy = Y(y) - (sub ? big * u * 0.25 : 0);
      if (done && sub) {
        ctx.save();
        ctx.font = `${Math.round(big * u)}px ${MONO3}`;
        const tw = ctx.measureText(s).width;
        glow(GLOW.accent, 16);
        ctx.fillStyle = GLOW.accent;
        ctx.fillRect(X(x) - tw / 2 - 10 * u, yy - big * u * 0.48, tw + 20 * u, big * u * 0.92);
        ctx.restore();
        say(s, X(x), yy, big, BG, "center");
      } else
        say(s, X(x), yy, big, GLOW[tone], "center");
      if (sub)
        say(sub, X(x), Y(y) + big * u * 0.6, big * 0.32, GLOW.ink, "center");
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.25, size = 40 } = o;
      if (t < at)
        return;
      const r = size * u * 0.7;
      const p = progress(t, at, dur);
      const cx = X(x);
      const cy = Y(y);
      if (kind === "check") {
        const pts = [
          [cx - r, cy],
          [cx - r * 0.3, cy + r * 0.7],
          [cx + r, cy - r * 0.8]
        ];
        beam(pts.slice(0, p < 0.5 ? 2 : 3), GLOW.good, 3);
      } else {
        beam([
          [cx - r, cy - r],
          [cx + r, cy + r]
        ], GLOW.bad, 3);
        if (p > 0.5)
          beam([
            [cx + r, cy - r],
            [cx - r, cy + r]
          ], GLOW.bad, 3);
      }
    },
    finish() {
      const { W: FW, H: FH } = full;
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      for (let y = gy;y < gy + gh; y += 3 * full.u)
        ctx.fillRect(gx, y, gw, 1.2 * full.u);
      const hy = gy + t * 0.18 % 1.2 * gh - gh * 0.1;
      const hb = ctx.createLinearGradient(0, hy - gh * 0.08, 0, hy + gh * 0.08);
      hb.addColorStop(0, "rgba(120,255,160,0)");
      hb.addColorStop(0.5, "rgba(120,255,160,0.05)");
      hb.addColorStop(1, "rgba(120,255,160,0)");
      ctx.fillStyle = hb;
      ctx.fillRect(gx, hy - gh * 0.08, gw, gh * 0.16);
      const v = ctx.createRadialGradient(gx + gw / 2, gy + gh / 2, gh * 0.4, gx + gw / 2, gy + gh / 2, gw * 0.62);
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
      ctx.fillStyle = "#58FF8A";
      ctx.shadowColor = "#58FF8A";
      ctx.shadowBlur = 8 * full.u;
      ctx.beginPath();
      ctx.arc(FW * 0.94, FH * 0.95, 5 * full.u, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#77746B";
      ctx.font = `${Math.round(14 * full.u)}px ${MONO3}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText("MODEL 80  TERMINAL", FW * 0.05, FH * 0.95);
    }
  };
}
var crt_terminal_default = {
  id: "crt-terminal",
  name: "Phosphor terminal",
  category: "Retro Digital",
  make: make14
};

// plugin/skills/motion-graphics/styles/cut-paper.ts
var PAPER2 = {
  ink: "#F6F0E2",
  accent: "#F0B93A",
  good: "#5CC2B0",
  bad: "#EE6F4E",
  muted: "#B8B2D6"
};
var TEXT2 = {
  ink: "#3A3466",
  accent: "#E9A62A",
  good: "#3BA894",
  bad: "#E25A3C",
  muted: "#7C76A8"
};
var FACE = '"Arial Rounded MT Bold", "Nunito", "Avenir Next", "Helvetica Neue", Arial, sans-serif';
function make15(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__cutPaper ??= new Map;
  const cache = g.__cutPaper;
  function fibre() {
    const key = `fibre:${Math.round(u * 100)}`;
    let pat = cache.get(key);
    if (!pat) {
      const S = Math.round(120 * u);
      const c0 = new OffscreenCanvas(S, S);
      const c = c0.getContext("2d");
      c.lineWidth = Math.max(0.5, 0.7 * u);
      for (let i = 0;i < 220; i++) {
        const x = hash(i * 1.3) * S;
        const y = hash(i * 2.9) * S;
        const a = hash(i * 4.1) * Math.PI;
        const l = (3 + hash(i * 5.7) * 8) * u;
        c.strokeStyle = hash(i) > 0.5 ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.08)";
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        c.stroke();
      }
      pat = ctx.createPattern(c0, "repeat");
      cache.set(key, pat);
    }
    return pat;
  }
  function place(at, dur = 0.45) {
    const p = progress(t, at, dur);
    if (p <= 0)
      return null;
    const e = expo(p);
    return { dy: (1 - e) * 50 * u, rot: (1 - e) * 0.06, a: clamp(p * 3) };
  }
  function sheet(shape, color, lift = 1) {
    ctx.save();
    ctx.shadowColor = "rgba(10,6,30,0.45)";
    ctx.shadowBlur = 12 * u * lift;
    ctx.shadowOffsetY = 6 * u * lift;
    ctx.shadowOffsetX = 2 * u * lift;
    shape();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    ctx.save();
    shape();
    ctx.fillStyle = fibre();
    ctx.fill();
    ctx.clip();
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.translate(0, 1.5 * u);
    shape();
    ctx.stroke();
    ctx.restore();
  }
  function withPlace(cx, cy, at, draw, dur) {
    const pl = place(at, dur);
    if (!pl)
      return;
    ctx.save();
    ctx.globalAlpha = pl.a;
    ctx.translate(cx, cy + pl.dy);
    ctx.rotate(pl.rot);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }
  function sticker(s, x, y, size, tone, align) {
    ctx.save();
    ctx.font = `800 ${Math.round(size * u)}px ${FACE}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(10,6,30,0.45)";
    ctx.shadowBlur = 8 * u;
    ctx.shadowOffsetY = 4 * u;
    ctx.strokeStyle = "#FBF7EE";
    ctx.lineWidth = Math.max(4, size * 0.2 * u);
    ctx.strokeText(s, x, y);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = TEXT2[tone];
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  return {
    surface() {
      const key = `bg:${W}x${H}`;
      let img = cache.get(key);
      if (!img) {
        img = new OffscreenCanvas(W, H);
        const c = img.getContext("2d");
        const gr = c.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, "#3A3466");
        gr.addColorStop(1, "#5A4E8A");
        c.fillStyle = gr;
        c.fillRect(0, 0, W, H);
        for (let i = 0;i < 160; i++) {
          c.fillStyle = `rgba(255,250,230,${0.4 + hash(i * 3) * 0.5})`;
          c.beginPath();
          c.arc(hash(i * 1.1) * W, hash(i * 2.2) * H * 0.7, (0.8 + hash(i * 5) * 1.6) * u, 0, Math.PI * 2);
          c.fill();
        }
        const layers = [
          [0.66, 0.1, "#6E66A6", 1],
          [0.76, 0.06, "#4F7E86", 4],
          [0.86, 0.03, "#2F6A62", 8]
        ];
        for (const [base, amp, col, s] of layers) {
          const pts = [];
          for (let i = 0;i <= 60; i++) {
            const x = i / 60 * W;
            pts.push([
              x,
              H * (base - amp * (0.5 + 0.5 * Math.sin(i * 0.18 + s) * Math.cos(i * 0.07 + s * 2))) + (hash(i + s) - 0.5) * 3 * u
            ]);
          }
          c.save();
          c.shadowColor = "rgba(10,6,30,0.5)";
          c.shadowBlur = 14 * u;
          c.shadowOffsetY = -4 * u;
          trace(c, [...pts, [W, H], [0, H]], true);
          c.fillStyle = col;
          c.fill();
          c.restore();
          c.strokeStyle = "rgba(250,245,235,0.55)";
          c.lineWidth = 2 * u;
          trace(c, roughen(pts, 1.2 * u, s * 7));
          c.stroke();
        }
        cache.set(key, img);
      }
      ctx.drawImage(img, 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 76, at = 0, tone = "bad", align = "left" } = o;
      const dur = o.dur ?? 0.8;
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${FACE}`;
      const words = s.split(" ");
      const space = ctx.measureText(" ").width;
      const total = ctx.measureText(s).width;
      ctx.restore();
      let cx = align === "center" ? X(x) - total / 2 : align === "right" ? X(x) - total : X(x);
      for (const [i, wd] of words.entries()) {
        ctx.save();
        ctx.font = `800 ${Math.round(size * u)}px ${FACE}`;
        const ww = ctx.measureText(wd).width;
        ctx.restore();
        const tones = [tone, "accent", "good"];
        const left = cx;
        withPlace(left + ww / 2, Y(y), at + i * dur / Math.max(1, words.length), () => sticker(wd, left, Y(y), size, tones[i % 3], "left"));
        cx += ww + space;
      }
    },
    label(s, x, y, o = {}) {
      const size = o.size ?? 32;
      const tone = o.tone ?? "ink";
      const align = o.align ?? "center";
      withPlace(X(x), Y(y), o.at ?? 0, () => {
        ctx.save();
        ctx.font = `800 ${Math.round(size * u)}px ${FACE}`;
        const w = ctx.measureText(s).width + size * 0.9 * u;
        const h = size * 1.35 * u;
        const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
        ctx.restore();
        sheet(() => {
          ctx.beginPath();
          ctx.roundRect(left, Y(y) - h / 2, w, h, 4 * u);
        }, PAPER2.ink, 0.7);
        ctx.fillStyle = "rgba(60,50,100,0.35)";
        ctx.beginPath();
        ctx.arc(left + w - size * 0.25 * u, Y(y), size * 0.08 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `800 ${Math.round(size * u)}px ${FACE}`;
        ctx.fillStyle = TEXT2[tone === "ink" ? "ink" : tone];
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(s, left + size * 0.35 * u, Y(y) + size * 0.04 * u);
      }, 0.35);
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const R = r * u;
      withPlace(X(x), Y(y), at, () => {
        sheet(() => {
          ctx.beginPath();
          ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
        }, PAPER2[tone]);
        sheet(() => {
          ctx.beginPath();
          ctx.arc(X(x) - R * 0.12, Y(y) - R * 0.12, R * 0.55, 0, Math.PI * 2);
        }, "rgba(255,255,255,0.35)", 0.3);
      }, 0.35);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      withPlace(x0 + bw / 2, y0 + bh / 2, at, () => {
        sheet(() => {
          ctx.beginPath();
          ctx.roundRect(x0 - 8 * u, y0 - 8 * u, bw + 16 * u, bh + 16 * u, 6 * u);
        }, PAPER2[tone === "ink" ? "muted" : tone]);
        sheet(() => {
          ctx.beginPath();
          ctx.roundRect(x0, y0, bw, bh, 4 * u);
        }, PAPER2.ink, 0.6);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * expo(p))));
      const thin = !head && tone === "accent";
      const color = PAPER2[tone === "ink" ? "accent" : tone];
      ctx.save();
      ctx.lineCap = "butt";
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(10,6,30,0.45)";
      ctx.shadowBlur = 8 * u;
      ctx.shadowOffsetY = 4 * u;
      trace(ctx, shown);
      ctx.strokeStyle = thin ? "rgba(246,240,226,0.75)" : color;
      ctx.lineWidth = (thin ? 2.5 : 10) * u;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 26 * u;
        trace(ctx, [
          [end[0] + Math.cos(a) * s * 0.5, end[1] + Math.sin(a) * s * 0.5],
          [end[0] + Math.cos(a + 2) * s * 0.7, end[1] + Math.sin(a + 2) * s * 0.7],
          [end[0] + Math.cos(a - 2) * s * 0.7, end[1] + Math.sin(a - 2) * s * 0.7]
        ], true);
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "good" } = o;
      const n = 5;
      const [x0, bw] = [X(x), X(w)];
      const ry = bw * 0.18;
      const step = (Y(h) - ry * 2) / (n - 1);
      const colors = [PAPER2[tone], PAPER2.accent, PAPER2[tone], PAPER2.bad, PAPER2[tone]];
      for (let i = 0;i < n; i++) {
        const cy = Y(y + h) - ry - step * i;
        withPlace(x0 + bw / 2, cy, at + dur / n * i, () => sheet(() => {
          ctx.beginPath();
          ctx.ellipse(x0 + bw / 2, cy, bw / 2, ry * 1.6, 0, 0, Math.PI * 2);
        }, colors[i], 0.8), 0.3);
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "bad" } = o;
      if (t < at)
        return;
      if (sub) {
        withPlace(X(x), Y(y), at, () => {
          const n = 16;
          const r = size * 1.25 * u;
          const pts = Array.from({ length: n * 2 }, (_, i) => {
            const a = i / (n * 2) * Math.PI * 2 + t * 0.15;
            const rr = i % 2 ? r * 0.72 : r;
            return [X(x) + Math.cos(a) * rr, Y(y) + Math.sin(a) * rr];
          });
          sheet(() => trace(ctx, pts, true), PAPER2.accent);
        });
      }
      const value = count ? counting(t, at, dur, count) + s : s;
      withPlace(X(x), Y(y), at, () => sticker(value, X(x), Y(y), size, sub ? "bad" : tone === "ink" ? "ink" : tone, "center"), 0.3);
      if (sub)
        withPlace(X(x), Y(y) + size * 0.7 * u, at + 0.3, () => sticker(sub, X(x), Y(y) + size * 0.7 * u, size * 0.32, "ink", "center"), 0.3);
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 36) * u;
      const [cx, cy] = [X(x), Y(y)];
      const color = PAPER2[o.tone ?? (kind === "check" ? "good" : "bad")];
      withPlace(cx, cy, o.at ?? 0, () => {
        ctx.save();
        ctx.shadowColor = "rgba(10,6,30,0.45)";
        ctx.shadowBlur = 8 * u;
        ctx.shadowOffsetY = 4 * u;
        ctx.strokeStyle = color;
        ctx.lineWidth = 11 * u;
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
        if (kind === "check")
          trace(ctx, [
            [cx - s * 0.5, cy],
            [cx - s * 0.1, cy + s * 0.4],
            [cx + s * 0.6, cy - s * 0.5]
          ]);
        else {
          ctx.beginPath();
          ctx.moveTo(cx - s * 0.5, cy - s * 0.5);
          ctx.lineTo(cx + s * 0.5, cy + s * 0.5);
          ctx.moveTo(cx + s * 0.5, cy - s * 0.5);
          ctx.lineTo(cx - s * 0.5, cy + s * 0.5);
        }
        ctx.stroke();
        ctx.restore();
      }, 0.3);
    },
    finish() {
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, "rgba(10,6,30,0.35)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }
  };
}
var cut_paper_default = {
  id: "cut-paper",
  name: "Cut-paper diorama",
  category: "Paper & Craft",
  make: make15
};

// plugin/skills/motion-graphics/styles/deep-sea.ts
var GLOW2 = {
  ink: "#9BEFFF",
  accent: "#3FD8FF",
  good: "#7DFFC0",
  bad: "#FF5FCB",
  muted: "#3E7F9C"
};
var SERIF3 = '"Iowan Old Style", "Palatino", "Book Antiqua", Georgia, serif';
var MONO4 = '"SF Mono", Menlo, Consolas, monospace';
function make16(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  function lit(at = 0, dur = 0.5, k = 0) {
    const p = progress(t, at, dur);
    if (p <= 0)
      return 0;
    const stutter = p < 1 ? hash(Math.floor(t * 30) + k) > 0.35 ? p : p * 0.3 : 1;
    return stutter * (0.85 + 0.15 * Math.sin(t * 2.4 + k));
  }
  function glow(color, blur) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * u;
  }
  function words(s, x, y, size, color, align, at, dur) {
    const p = progress(t, at, dur);
    if (p <= 0)
      return;
    ctx.save();
    ctx.font = `600 ${Math.round(size * u)}px ${SERIF3}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    if (p < 1) {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0;i < 26; i++) {
        const tx = left + hash(i * 3.1 + x) * w;
        const ty = y + (hash(i * 4.3 + y) - 0.5) * size * 0.6 * u;
        const a = hash(i * 7.7) * Math.PI * 2;
        const d = (1 - expo(p)) * (60 + hash(i) * 80) * u;
        ctx.fillStyle = alpha(color, 0.8);
        ctx.beginPath();
        ctx.arc(tx + Math.cos(a) * d, ty + Math.sin(a) * d, 1.8 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = clamp((p - 0.35) / 0.65);
    ctx.textAlign = "left";
    glow(color, 18);
    ctx.fillStyle = color;
    ctx.fillText(s, left, y);
    ctx.shadowBlur = 4 * u;
    ctx.fillStyle = "#EFFFFF";
    ctx.globalAlpha *= 0.55;
    ctx.fillText(s, left, y);
    ctx.restore();
  }
  function strand(points, color, width, a) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    glow(color, 14);
    trace(ctx, points);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(235,255,255,0.7)";
    ctx.lineWidth = width * 0.35 * u;
    ctx.stroke();
    ctx.restore();
  }
  return {
    surface() {
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#06223A");
      bg.addColorStop(0.5, "#03121F");
      bg.addColorStop(1, "#010609");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0;i < 5; i++) {
        const x = (0.1 + i * 0.2 + Math.sin(t * 0.2 + i) * 0.02) * W;
        const g = ctx.createLinearGradient(0, 0, 0, H * 0.7);
        g.addColorStop(0, "rgba(60,140,190,0.07)");
        g.addColorStop(1, "rgba(60,140,190,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - 20 * u, 0);
        ctx.lineTo(x + 20 * u, 0);
        ctx.lineTo(x + 120 * u, H * 0.7);
        ctx.lineTo(x - 60 * u, H * 0.7);
        ctx.fill();
      }
      for (let i = 0;i < 220; i++) {
        const depth = 0.3 + hash(i * 1.9) * 0.7;
        const x = (hash(i * 2.3) * W + Math.sin(t * 0.6 + i) * 6 * u) % W;
        const y = ((hash(i * 3.7) - t * 0.04 * depth) % 1 + 1) % 1;
        ctx.fillStyle = `rgba(170,220,235,${0.12 + depth * 0.25})`;
        ctx.beginPath();
        ctx.arc(x, y * H, depth * 1.8 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.09, size = 50, at = 0, dur = 0.9 } = o;
      words(s, X(x), Y(y), size, GLOW2.ink, o.align ?? "left", at, dur);
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, tone = "ink", align = "center" } = o;
      words(s, X(x), Y(y), size, GLOW2[tone], align, at, o.dur ?? 0.45);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.4, tone = "accent" } = o;
      const k = x * 91 + y * 37;
      const a = lit(at, dur, k);
      if (a <= 0)
        return;
      const R = r * u * 0.75;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 3);
      halo.addColorStop(0, alpha(GLOW2[tone], 0.55 * a));
      halo.addColorStop(1, alpha(GLOW2[tone], 0));
      ctx.fillStyle = halo;
      ctx.fillRect(cx - R * 3, cy - R * 3, R * 6, R * 6);
      ctx.fillStyle = alpha("#E8FFFF", a);
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = alpha(GLOW2[tone], 0.8 * a);
      ctx.lineWidth = 1.5 * u;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "accent" } = o;
      const a = lit(at, dur, x * 7);
      if (a <= 0)
        return;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const cx = x0 + bw / 2;
      const rim = y0 + bh * 0.78;
      const pulse = 1 + Math.sin(t * 2.2) * 0.03;
      ctx.save();
      const bell = ellipse(cx, rim, bw / 2 * pulse, bh * 0.78, 40, Math.PI, 0.5);
      trace(ctx, bell, true);
      const fill = ctx.createLinearGradient(0, y0, 0, rim);
      fill.addColorStop(0, alpha(GLOW2[tone], 0.22 * a));
      fill.addColorStop(1, alpha(GLOW2[tone], 0.06 * a));
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
      strand(bell, GLOW2[tone], 2.5, a);
      for (let i = 0;i < 9; i++) {
        const tx = x0 + bw * (0.1 + i / 8 * 0.8);
        const pts = Array.from({ length: 12 }, (_, j) => [
          tx + Math.sin(t * 1.6 + i + j * 0.5) * 5 * u * (j / 11),
          rim + j / 11 * bh * (0.5 + hash(i) * 0.4)
        ]);
        strand(pts, GLOW2[tone], 1, a * 0.45);
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      const color = GLOW2[tone];
      if (!head) {
        strand(shown, color, 0.9, 0.5);
        return;
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.setLineDash([3 * u, 7 * u]);
      ctx.lineDashOffset = -t * 30 * u;
      glow(color, 10);
      trace(ctx, shown);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5 * u;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.setLineDash([]);
      if (p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        trace(ctx, [
          [end[0] - Math.cos(ang - 0.5) * 14 * u, end[1] - Math.sin(ang - 0.5) * 14 * u],
          end,
          [end[0] - Math.cos(ang + 0.5) * 14 * u, end[1] - Math.sin(ang + 0.5) * 14 * u]
        ]);
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "accent" } = o;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const cx = x0 + bw / 2;
      const cy = y0 + bh / 2;
      const a = lit(at, dur, 3);
      if (a <= 0)
        return;
      const body = ellipse(cx, cy, bw / 2, bh / 2, 48);
      ctx.save();
      trace(ctx, body, true);
      ctx.fillStyle = alpha(GLOW2[tone], 0.1 * a);
      ctx.fill();
      ctx.restore();
      strand(body, GLOW2[tone], 1.8, a);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const side of [-0.55, -0.2, 0.2, 0.55]) {
        for (let j = 0;j < 9; j++) {
          const f = j / 8;
          const yy = y0 + bh * (0.12 + f * 0.76);
          const xx = cx + side * (bw / 2) * Math.sqrt(1 - ((yy - cy) / (bh / 2)) ** 2);
          const hue = (t * 120 + j * 40 + side * 200) % 360;
          ctx.fillStyle = `hsla(${hue},100%,65%,${0.8 * a})`;
          ctx.beginPath();
          ctx.arc(xx, yy, 2.4 * u, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const color = GLOW2[tone];
      const p = expo(progress(t, at, 0.4));
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = `600 ${Math.round(size * u)}px ${SERIF3}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      glow(color, 26);
      ctx.fillStyle = color;
      ctx.fillText(value, X(x), Y(y));
      ctx.shadowBlur = 6 * u;
      ctx.fillStyle = "rgba(240,255,255,0.6)";
      ctx.fillText(value, X(x), Y(y));
      ctx.restore();
      if (sub)
        words(sub, X(x), Y(y) - size * 0.85 * u, size * 0.36, GLOW2.ink, "center", at + 0.2, 0.5);
      const rp = progress(t, at + dur, 1.2);
      if (rp > 0 && rp < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - rp;
        glow(color, 12);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.arc(X(x), Y(y), size * (0.8 + rp * 1.4) * u, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 34 } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      const pts = kind === "check" ? [
        [cx - s * 0.5, cy],
        [cx - s * 0.12, cy + s * 0.4],
        [cx + s * 0.6, cy - s * 0.5]
      ] : [
        [cx - s * 0.45, cy - s * 0.45],
        [cx + s * 0.45, cy + s * 0.45],
        [cx, cy],
        [cx + s * 0.45, cy - s * 0.45],
        [cx - s * 0.45, cy + s * 0.45]
      ];
      const n = Math.max(2, Math.ceil(pts.length * p));
      strand(pts.slice(0, n), kind === "check" ? GLOW2.good : GLOW2.bad, 4, 1);
    },
    finish() {
      vignette(ctx, m, 0.7, "0,3,8");
      ctx.save();
      ctx.font = `${Math.round(12 * u)}px ${MONO4}`;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(150,210,230,0.55)";
      ctx.fillText(`DEPTH ${Math.round(1000 + t * 6)} m`, W - 30 * u, 22 * u);
      ctx.fillText("TEMP 3.4 °C", W - 30 * u, 38 * u);
      ctx.fillStyle = Math.floor(t * 2) % 2 ? "rgba(255,70,90,0.9)" : "rgba(255,70,90,0.3)";
      ctx.beginPath();
      ctx.arc(W - 150 * u, 28 * u, 3.5 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };
}
var deep_sea_default = {
  id: "deep-sea",
  name: "Deep sea glow",
  category: "Light & Imaging",
  make: make16
};

// plugin/skills/motion-graphics/styles/editorial-chart.ts
var PAGE = "#FDEFE3";
var INK3 = "#33302E";
var CLARET = "#990F3D";
var GREY = "#B8ADA3";
var TONE6 = {
  ink: INK3,
  accent: CLARET,
  good: "#0D7680",
  bad: "#C8102E",
  muted: "#807973"
};
var SERIF4 = '"Georgia", "Iowan Old Style", "Times New Roman", serif';
var SANS2 = '"Helvetica Neue", "Avenir Next", Arial, sans-serif';
var HAND3 = '"Bradley Hand", "Segoe Print", "Marker Felt", "Comic Sans MS", cursive';
function make17(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const fade = (at = 0, dur = 0.4) => expo(progress(t, at, dur));
  let seed = 1;
  function write(s, x, y, font, color, align, p, rise = 6) {
    if (p <= 0)
      return;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s, x, y + (1 - p) * rise * u);
    ctx.restore();
  }
  function hand(s, x, y, size, color, align, at) {
    const dur = 0.04 * s.length + 0.15;
    const p = progress(t, at, dur);
    if (p <= 0)
      return;
    ctx.save();
    ctx.font = `600 ${Math.round(size * u)}px ${HAND3}`;
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 4 * u, y - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left, y);
    ctx.restore();
  }
  function pen(points, p, color, w = 2) {
    seed += 1;
    if (p <= 0)
      return;
    const pts = roughen(points, 1.2 * u, seed * 7.7);
    ctx.save();
    trace(ctx, pts.slice(0, Math.max(2, Math.round(pts.length * p))));
    ctx.strokeStyle = color;
    ctx.lineWidth = w * u;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }
  return {
    surface() {
      ctx.fillStyle = PAGE;
      ctx.fillRect(0, 0, W, H);
      const p = fade(0, 0.8);
      ctx.fillStyle = INK3;
      ctx.fillRect(X(0.035), Y(0.035), (X(0.965) - X(0.035)) * p, 1.2 * u);
      ctx.fillRect(X(0.035), Y(0.93), (X(0.965) - X(0.035)) * p, 0.8 * u);
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = `600 ${Math.round(13 * u)}px ${SANS2}`;
      ctx.letterSpacing = `${Math.round(1.5 * u)}px`;
      ctx.fillStyle = TONE6.muted;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText("SOURCE: ILLUSTRATIVE", X(0.965), Y(0.955));
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.15, size = 64, at = 0, dur = 0.7, align = "left" } = o;
      const p = fade(at, dur);
      if (p <= 0)
        return;
      ctx.fillStyle = CLARET;
      ctx.fillRect(X(x), Y(y) - size * 0.95 * u, 46 * u * expo(progress(t, at, 0.5)), 4 * u);
      write(s, X(x), Y(y), `400 ${Math.round(size * u)}px ${SERIF4}`, INK3, align, p);
    },
    label(s, x, y, o = {}) {
      const { size = 30, align = "center", tone = "ink", at = 0 } = o;
      if (tone === "bad" || tone === "accent")
        hand(s, X(x), Y(y), size * 1.15, TONE6[tone], align, at);
      else
        write(s, X(x), Y(y), `500 ${Math.round(size * u)}px ${SANS2}`, tone === "ink" ? TONE6.muted : TONE6[tone], align, fade(at));
    },
    node(x, y, r, o = {}) {
      const p = fade(o.at, 0.3);
      if (p <= 0)
        return;
      const R = r * u * 0.45;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R * p, 0, Math.PI * 2);
      ctx.fillStyle = PAGE;
      ctx.fill();
      ctx.lineWidth = 1.6 * u;
      ctx.strokeStyle = o.tone === "accent" || !o.tone ? CLARET : TONE6[o.tone];
      ctx.stroke();
    },
    box(x, y, w, h, o = {}) {
      const p = fade(o.at, 0.6);
      if (p <= 0)
        return;
      const [bx, by, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      ctx.save();
      ctx.globalAlpha = p;
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = o.tone && o.tone !== "ink" ? alpha(TONE6[o.tone], 0.8) : INK3;
      ctx.lineWidth = 1.2 * u;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const p = expo(progress(t, at, dur));
      if (tone === "bad") {
        if (p <= 0)
          return;
        ctx.save();
        ctx.setLineDash([7 * u, 6 * u]);
        pen(pts, p, TONE6.bad, 2.2);
        ctx.restore();
        if (head && p >= 1) {
          const end = pts.at(-1);
          const prev = pts.at(-3);
          ctx.save();
          arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 14 * u);
          ctx.strokeStyle = TONE6.bad;
          ctx.lineWidth = 2.2 * u;
          ctx.stroke();
          ctx.restore();
        }
        return;
      }
      if (p <= 0)
        return;
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      trace(ctx, shown);
      ctx.strokeStyle = head ? INK3 : alpha(tone === "accent" ? CLARET : GREY, 0.75);
      ctx.lineWidth = (head ? 1.4 : 1) * u;
      ctx.stroke();
      if (head && p >= 0.99) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 10 * u);
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const dur = o.dur ?? 0.8;
      const cols = 5;
      const cell = X(w) / cols;
      const rows = Math.max(3, Math.floor(Y(h) / cell));
      for (let r = 0;r < rows; r++)
        for (let c = 0;c < cols; c++) {
          const i = r * cols + c;
          const p = progress(t, at + i / (rows * cols) * dur, 0.12);
          if (p <= 0)
            continue;
          ctx.fillStyle = hash(i * 2.3) > 0.45 ? CLARET : GREY;
          ctx.globalAlpha = p;
          ctx.fillRect(X(x) + c * cell + 1.5 * u, Y(y) + r * cell + 1.5 * u, cell - 3 * u, cell - 3 * u);
        }
      ctx.globalAlpha = 1;
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "accent" } = o;
      const p = fade(at, 0.4);
      if (p <= 0)
        return;
      const str = count ? counting(t, at, dur, count) + s : s;
      const font = `400 ${Math.round(size * 1.05 * u)}px ${SERIF4}`;
      write(str, X(x), Y(y) - (sub ? size * 0.12 * u : 0), font, tone === "accent" ? CLARET : TONE6[tone], "center", p, 0);
      if (sub) {
        write(sub, X(x), Y(y) + size * 0.6 * u, `400 ${Math.round(size * 0.26 * u)}px ${SANS2}`, TONE6.muted, "center", p);
        const q = progress(t, at + dur, 0.5);
        if (q > 0) {
          ctx.font = font;
          const w = ctx.measureText(`${count ? count[1] : ""}${s}`).width;
          pen(ellipse(X(x), Y(y) - size * 0.12 * u, w * 0.72, size * 0.6 * u, 40, -2.6, 1.08), q, CLARET, 2.4);
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const at = o.at ?? 0;
      const r = (o.size ?? 22) * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check")
        pen([
          [cx - r * 0.6, cy],
          [cx - r * 0.15, cy + r * 0.5],
          [cx + r * 0.7, cy - r * 0.7]
        ], progress(t, at, 0.3), TONE6.good, 3);
      else {
        pen([
          [cx - r * 0.5, cy - r * 0.5],
          [cx + r * 0.5, cy + r * 0.5]
        ], progress(t, at, 0.15), TONE6.bad, 3);
        pen([
          [cx + r * 0.5, cy - r * 0.5],
          [cx - r * 0.5, cy + r * 0.5]
        ], progress(t, at + 0.15, 0.15), TONE6.bad, 3);
      }
    },
    finish() {}
  };
}
var editorial_chart_default = {
  id: "editorial-chart",
  name: "Newspaper graphic",
  category: "Data & Information",
  make: make17
};

// plugin/skills/motion-graphics/styles/editorial-collage.ts
var PAPER3 = "#EFE6D3";
var BLACK3 = "#151413";
var RED3 = "#D23B2E";
var HILITE = "rgba(255,214,0,0.78)";
var COND = '"Anton", "Bebas Neue", "Oswald", Impact, "Arial Narrow", sans-serif';
var SERIF5 = '"Georgia", "Times New Roman", serif';
function make18(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const tq = Math.floor(t * 12) / 12;
  const g = globalThis;
  g.__collageGrain ??= new Map;
  const cache = g.__collageGrain;
  const land = (at = 0) => clamp((tq - at) / 0.25);
  function torn(x, y, w, h, seed, rag = 4) {
    const pts = [];
    const n = Math.max(6, Math.round(w / (14 * u)));
    const k = Math.max(4, Math.round(h / (14 * u)));
    for (let i = 0;i <= n; i++)
      pts.push([x + w * i / n, y + (hash(seed + i) - 0.5) * rag * u]);
    for (let i = 0;i <= k; i++)
      pts.push([x + w + (hash(seed + 50 + i) - 0.5) * rag * u, y + h * i / k]);
    for (let i = n;i >= 0; i--)
      pts.push([x + w * i / n, y + h + (hash(seed + 90 + i) - 0.5) * rag * u]);
    for (let i = k;i >= 0; i--)
      pts.push([x + (hash(seed + 140 + i) - 0.5) * rag * u, y + h * i / k]);
    trace(ctx, pts, true);
  }
  function softShadow() {
    ctx.shadowColor = "rgba(40,25,10,0.3)";
    ctx.shadowBlur = 12 * u;
    ctx.shadowOffsetX = 3 * u;
    ctx.shadowOffsetY = 6 * u;
  }
  function tape(cx, cy, w, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.fillStyle = "rgba(226,214,180,0.82)";
    ctx.fillRect(-w / 2, -9 * u, w, 18 * u);
    ctx.restore();
  }
  function dropped(cx, cy, at, seed, draw) {
    const p = land(at);
    if (p <= 0)
      return;
    const e = 1 - (1 - p) ** 3;
    ctx.save();
    ctx.translate(cx, cy - (1 - e) * 40 * u);
    ctx.rotate((hash(seed) - 0.5) * 0.05 + (1 - e) * 0.08);
    ctx.scale(1 + (1 - e) * 0.08, 1 + (1 - e) * 0.08);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }
  function strip(s, x, y, size, ink, paper, seed) {
    ctx.font = `400 ${Math.round(size * u)}px ${COND}`;
    const w = ctx.measureText(s).width + size * 0.5 * u;
    const h = size * 1.28 * u;
    ctx.save();
    softShadow();
    ctx.fillStyle = paper;
    torn(x, y - h / 2, w, h, seed, 3);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(s, x + size * 0.25 * u, y + size * 0.04 * u);
    return w;
  }
  function grainTile() {
    const key = `${W}x${H}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      for (let i = 0;i < W * H / 60; i++) {
        const v = hash(i * 1.37);
        c.fillStyle = v > 0.5 ? "rgba(255,250,235,0.18)" : "rgba(60,40,20,0.12)";
        c.fillRect(hash(i * 2.11) * W, hash(i * 3.07) * H, 1.5, 1.5);
      }
      cache.set(key, tile);
    }
    return tile;
  }
  return {
    surface() {
      ctx.fillStyle = PAPER3;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.fillStyle = RED3;
      torn(W * 0.74, -10 * u, W * 0.3, H * 0.34, 7, 10);
      ctx.fill();
      ctx.fillStyle = "#C9A878";
      torn(-10 * u, H * 0.24, W * 0.2, H * 0.52, 19, 6);
      ctx.fill();
      ctx.translate(W * 0.8, H * 0.78);
      ctx.rotate(0.04);
      ctx.fillStyle = "#E4DAC3";
      torn(0, 0, W * 0.18, H * 0.2, 31, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(40,30,20,0.55)";
      ctx.font = `700 ${Math.round(18 * u)}px ${SERIF5}`;
      ctx.fillText("Can a machine", 10 * u, 24 * u);
      ctx.fillText("think?", 10 * u, 44 * u);
      for (let i = 0;i < 6; i++)
        ctx.fillRect(10 * u, (60 + i * 11) * u, W * 0.18 - 20 * u - hash(i) * 30 * u, 3 * u);
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.09, size = 54, at = 0, dur = 0.9 } = o;
      const words = s.toUpperCase().split(" ");
      const half = Math.ceil(words.length / 2);
      const lines = [words.slice(0, half).join(" "), words.slice(half).join(" ")].filter(Boolean);
      lines.forEach((line, i) => {
        const ly = Y(y) + i * size * 1.25 * u;
        const lx = X(x) + i * 26 * u;
        dropped(lx, ly, at + i * dur / 2, i + 3, () => {
          const w = strip(line, lx, ly, size, BLACK3, "#FAF7EF", 11 + i);
          if (i === lines.length - 1) {
            const p = clamp((t - at - dur) / 0.4);
            if (p > 0) {
              ctx.save();
              ctx.globalCompositeOperation = "multiply";
              ctx.fillStyle = HILITE;
              ctx.fillRect(lx + 4 * u, ly - size * 0.5 * u, (w - 8 * u) * p, size * u);
              ctx.restore();
            }
          }
        });
      });
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 26, tone = "ink" } = o;
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${COND}`;
      const w = ctx.measureText(s.toUpperCase()).width + size * 0.5 * u;
      ctx.restore();
      dropped(X(x), Y(y), at, x * 7 + y, () => {
        const bg = tone === "bad" ? RED3 : BLACK3;
        strip(s.toUpperCase(), X(x) - w / 2, Y(y), size, "#F7F2E6", bg, x * 99);
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const R = r * 0.85 * u;
      dropped(X(x), Y(y), at, x * 3 + y, () => {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
        ctx.fillStyle = "#FBF8F1";
        ctx.fill();
        ctx.lineWidth = 3 * u;
        ctx.strokeStyle = BLACK3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = tone === "accent" ? RED3 : BLACK3;
        ctx.fill();
      });
    },
    box(x, y, w, h, o = {}) {
      dropped(X(x + w / 2), Y(y + h / 2), o.at, x * 17, () => {
        const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
        ctx.save();
        softShadow();
        ctx.fillStyle = "#F9F7F0";
        ctx.fillRect(l, tp, ww, hh);
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = "rgba(90,110,120,0.16)";
        ctx.lineWidth = 1 * u;
        for (let gx = l + 14 * u;gx < l + ww; gx += 14 * u) {
          ctx.beginPath();
          ctx.moveTo(gx, tp);
          ctx.lineTo(gx, tp + hh);
          ctx.stroke();
        }
        for (let gy = tp + 14 * u;gy < tp + hh; gy += 14 * u) {
          ctx.beginPath();
          ctx.moveTo(l, gy);
          ctx.lineTo(l + ww, gy);
          ctx.stroke();
        }
        ctx.restore();
        tape(l + ww / 2, tp, Math.min(90 * u, ww * 0.5), -0.03);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = clamp((t - at) / dur);
      if (p <= 0)
        return;
      const marker = tone === "bad";
      const base = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 28);
      const pts = marker ? roughen(base, 2 * u, x1 * 41) : base;
      const res = along(pts, p);
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = marker ? RED3 : BLACK3;
      ctx.lineWidth = (marker ? 6 : head ? 2.6 : 1.3) * u;
      if (head && !marker)
        ctx.setLineDash([9 * u, 7 * u]);
      if (!head)
        ctx.globalAlpha = 0.6;
      trace(ctx, res.points);
      ctx.stroke();
      ctx.setLineDash([]);
      if (head && p >= 1) {
        const tip = pts.at(-1);
        const s = (marker ? 22 : 16) * u;
        ctx.beginPath();
        ctx.moveTo(tip[0] - Math.cos(res.angle - 0.5) * s, tip[1] - Math.sin(res.angle - 0.5) * s);
        ctx.lineTo(tip[0], tip[1]);
        ctx.lineTo(tip[0] - Math.cos(res.angle + 0.5) * s, tip[1] - Math.sin(res.angle + 0.5) * s);
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      for (let i = 0;i < 3; i++) {
        const cx = X(x + w / 2) + (i - 1) * 8 * u;
        const cy = Y(y + h / 2) + (i - 1) * 10 * u;
        dropped(cx, cy, at + i * dur / 4, i * 5 + 2, () => {
          const pw = X(w) * 1.15;
          const ph = Y(h) * 0.55;
          const l = cx - pw / 2;
          const tp = cy - ph / 2;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate((i - 1) * 0.08);
          ctx.translate(-cx, -cy);
          softShadow();
          ctx.fillStyle = "#FBFAF5";
          ctx.fillRect(l, tp, pw, ph);
          ctx.shadowColor = "transparent";
          const b = 6 * u;
          ctx.fillStyle = "#3B3833";
          ctx.fillRect(l + b, tp + b, pw - b * 2, ph - b * 2);
          ctx.fillStyle = "#9A948A";
          for (let gy = tp + b + 3 * u;gy < tp + ph - b; gy += 6 * u)
            for (let gx = l + b + 3 * u;gx < l + pw - b; gx += 6 * u) {
              const f = 0.5 + 0.5 * Math.sin((gx - l) / (pw * 0.18) + i) * Math.cos((gy - tp) / (ph * 0.3));
              ctx.beginPath();
              ctx.arc(gx, gy, 2.6 * u * f, 0, Math.PI * 2);
              ctx.fill();
            }
          ctx.restore();
        });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      const value = count ? counting(tq, at, dur, count) + s : s;
      dropped(X(x), Y(y), at, x * 11, () => {
        ctx.save();
        ctx.font = `400 ${Math.round(size * u)}px ${COND}`;
        const w = ctx.measureText(value).width + size * 0.5 * u;
        strip(value, X(x) - w / 2, Y(y), size, tone === "bad" ? RED3 : BLACK3, "#FAF7EF", x * 77);
        ctx.restore();
        if (sub) {
          ctx.save();
          ctx.font = `400 ${Math.round(size * 0.3 * u)}px ${COND}`;
          const sw = ctx.measureText(sub.toUpperCase()).width + size * 0.15 * u;
          strip(sub.toUpperCase(), X(x) - sw / 2, Y(y) - size * 0.95 * u, size * 0.3, "#F7F2E6", BLACK3, x * 51);
          ctx.restore();
        }
      });
      if (count && size >= 80) {
        const p = clamp((t - at - dur) / 0.4);
        if (p > 0) {
          ctx.save();
          ctx.font = `400 ${Math.round(size * u)}px ${COND}`;
          const w = ctx.measureText(value).width;
          ctx.globalCompositeOperation = "multiply";
          ctx.fillStyle = HILITE;
          ctx.fillRect(X(x) - w / 2, Y(y) + size * 0.12 * u, w * p, size * 0.36 * u);
          ctx.restore();
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const s = (o.size ?? 34) * u;
      const cx = X(x);
      const cy = Y(y);
      const p = clamp((t - at) / 0.35);
      if (p <= 0)
        return;
      ctx.save();
      ctx.strokeStyle = RED3;
      ctx.lineWidth = 6 * u;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (kind === "check") {
        trace(ctx, along(roughen([
          [cx - s * 0.5, cy],
          [cx - s * 0.1, cy + s * 0.45],
          [cx + s * 0.6, cy - s * 0.55]
        ], 1.5 * u, 3), p).points);
        ctx.stroke();
      } else {
        trace(ctx, along(roughen(ellipse(cx, cy, s * 1.2, s * 0.9, 30, -2, 1.1), 2 * u, 5), p).points);
        ctx.stroke();
        trace(ctx, along([
          [cx - s * 0.5, cy - s * 0.5],
          [cx + s * 0.5, cy + s * 0.5]
        ], p).points);
        ctx.stroke();
      }
      ctx.restore();
    },
    finish() {
      ctx.drawImage(grainTile(), 0, 0);
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      v.addColorStop(0, "rgba(60,35,10,0)");
      v.addColorStop(1, "rgba(60,35,10,0.22)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }
  };
}
var editorial_collage_default = {
  id: "editorial-collage",
  name: "Editorial collage",
  category: "Popular Explainer Looks",
  make: make18
};

// plugin/skills/motion-graphics/styles/etch-sketch.ts
var LINE3 = { ink: 1, accent: 1, good: 1, bad: 1, muted: 0.55 };
var GLYPH = {
  A: "06 01 10 30 41 46|03 43",
  B: "06 00 30 41 42 33 03|33 44 45 36 06",
  C: "40 00 06 46",
  D: "00 06 36 45 41 30 00",
  E: "40 00 06 46|03 33",
  F: "40 00 06|03 33",
  G: "40 00 06 46 43 23",
  H: "00 06|40 46|03 43",
  I: "00 40|20 26|06 46",
  J: "40 45 36 16 05",
  K: "00 06|40 03 46",
  L: "00 06 46",
  M: "06 00 23 40 46",
  N: "06 00 46 40",
  O: "00 40 46 06 00",
  P: "06 00 40 43 03",
  Q: "00 40 46 06 00|24 46",
  R: "06 00 40 43 03|13 46",
  S: "40 00 03 43 46 06",
  T: "00 40|20 26",
  U: "00 06 46 40",
  V: "00 26 40",
  W: "00 06 23 46 40",
  X: "00 46|40 06",
  Y: "00 23 40|23 26",
  Z: "00 40 06 46",
  "0": "00 40 46 06 00",
  "1": "10 20 26|06 46",
  "2": "00 40 43 03 06 46",
  "3": "00 40 46 06|03 43",
  "4": "00 03 43|40 46",
  "5": "40 00 03 43 46 06",
  "6": "40 00 06 46 43 03",
  "7": "00 40 46",
  "8": "00 40 46 06 00|03 43",
  "9": "43 03 00 40 46 06",
  "%": "00 10 11 01 00|35 45 46 36 35|40 06",
  "?": "01 00 40 43 23 24|25 26",
  ".": "25 26",
  ",": "25 27",
  "!": "20 24|25 26",
  "-": "03 43"
};
function stairs(points, step) {
  const out = [points[0]];
  for (let i = 1;i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const dx = x1 - x0;
    const dy = y1 - y0;
    if (Math.abs(dx) < 0.5 || Math.abs(dy) < 0.5) {
      out.push([x1, y1]);
      continue;
    }
    const n = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / step));
    for (let k = 1;k <= n; k++) {
      out.push([x0 + dx * k / n, y0 + dy * (k - 1) / n]);
      out.push([x0 + dx * k / n, y0 + dy * k / n]);
    }
  }
  return out;
}
function make19(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__etch ??= new Map;
  const cache = g.__etch;
  let stylus = null;
  const side = 0.04 * W;
  const top = 0.05 * H;
  const bottom = 0.12 * H;
  function etch(points, { at = 0, dur = 0.5, tone = "ink" } = {}) {
    const p = progress(t, at, dur);
    if (p <= 0)
      return;
    const { points: drawn } = along(stairs(points, 2.4 * u), p);
    ctx.save();
    ctx.strokeStyle = `rgba(48,50,52,${0.85 * LINE3[tone]})`;
    ctx.lineWidth = 1.7 * u;
    ctx.lineJoin = "miter";
    trace(ctx, drawn);
    ctx.stroke();
    ctx.restore();
    if (!stylus || at >= stylus.at)
      stylus = { at, pt: drawn.at(-1) };
  }
  function glyphs(s, x, y, size, align = "left") {
    const h = size * 0.75 * u;
    const k = h / 6;
    const adv = k * 5.4;
    const text = s.toUpperCase();
    const w = text.length * adv - k * 1.4;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    const y0 = Y(y) - h / 2;
    const base = y0 + h + k * 0.8;
    const pts = [[left, base]];
    const go = (p) => {
      const last = pts.at(-1);
      if (Math.abs(last[0] - p[0]) > 0.5 && Math.abs(last[1] - p[1]) > 0.5)
        pts.push([last[0], base], [p[0], base]);
      pts.push(p);
    };
    for (const [i, ch] of [...text].entries()) {
      const g0 = GLYPH[ch];
      const ox = left + i * adv;
      if (!g0)
        continue;
      for (const stroke of g0.split("|"))
        for (const [j, pair] of stroke.split(" ").entries()) {
          const p = [ox + Number(pair[0]) * k, y0 + Number(pair[1]) * k];
          j ? pts.push(p) : go(p);
        }
    }
    go([left + w, base]);
    return { pts, w, left, h };
  }
  function write(s, x, y, o = {}) {
    const { at = 0, size = 34, tone = "ink", align = "left" } = o;
    const g0 = glyphs(s, x, y, size, align);
    etch(g0.pts, { at, dur: o.dur ?? 0.07 * s.length + 0.15, tone });
    return g0;
  }
  function screen() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      const gr = b.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0, "#D3D4CF");
      gr.addColorStop(1, "#B9BAB5");
      b.fillStyle = gr;
      b.fillRect(0, 0, W, H);
      for (let i = 0;i < W * H / 40; i++) {
        b.fillStyle = hash(i * 1.3) > 0.5 ? "rgba(255,255,255,0.10)" : "rgba(60,60,60,0.07)";
        b.fillRect(hash(i * 0.7) * W, hash(i * 1.9 + 2) * H, u, u);
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  return {
    surface() {
      screen();
    },
    title(s, o = {}) {
      const { x = 0.07, y = 0.12, size = 66, at = 0 } = o;
      write(s, x, y, { ...o, size, at, align: o.align ?? "left" });
    },
    label(s, x, y, o = {}) {
      write(s, x, y, { size: 36, align: "center", ...o });
    },
    node(x, y, r, o = {}) {
      etch(ellipse(X(x), Y(y), r * u, r * u, 16), { dur: 0.25, ...o });
    },
    box(x, y, w, h, o = {}) {
      const a = [X(x), Y(y)];
      const b = [X(x + w), Y(y + h)];
      etch([a, [b[0], a[1]], b, [a[0], b[1]], a], { dur: 0.6, ...o });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true } = o;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 12);
      const end = shaft.at(-1);
      const prev = shaft.at(-2);
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 14 * u;
      const barbs = head ? [
        [end[0] - Math.cos(a - 0.6) * s, end[1] - Math.sin(a - 0.6) * s],
        end,
        [end[0] - Math.cos(a + 0.6) * s, end[1] - Math.sin(a + 0.6) * s]
      ] : [];
      etch([...shaft, ...barbs], { ...o, at, dur });
    },
    store(x, y, w, h, o = {}) {
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const pts = [];
      const n = 3;
      for (let i = 0;i < n; i++) {
        const a = y0 + (y1 - y0) * i / n;
        const b = y0 + (y1 - y0) * (i + 1) / n;
        pts.push([x0, a], [x1, a], [x1, b], [x0, b], [x0, a]);
      }
      etch(pts, { dur: 0.9, ...o });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const gw = write(value, x, y, { at, dur: 0.01, size: size * 0.9, align: "center" });
      if (size >= 80) {
        const pad = 14 * u;
        const bx = X(x) - gw.w / 2 - pad;
        const by = Y(y) - gw.h / 2 - pad;
        etch([
          [bx, by],
          [bx + gw.w + pad * 2, by],
          [bx + gw.w + pad * 2, by + gw.h + pad * 2],
          [bx, by + gw.h + pad * 2],
          [bx, by]
        ], { at, dur: 0.5 });
      }
      if (sub)
        write(sub, x, y - size * 0.75 * u / H, {
          at: at + 0.3,
          size: size * 0.3,
          align: "center"
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 30) * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check")
        etch([
          [cx - s * 0.5, cy],
          [cx - s * 0.1, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5]
        ], { dur: 0.3, ...o });
      else
        etch([
          [cx - s * 0.5, cy - s * 0.5],
          [cx + s * 0.5, cy + s * 0.5],
          [cx + s * 0.5, cy - s * 0.5],
          [cx - s * 0.5, cy + s * 0.5]
        ], { dur: 0.3, ...o });
    },
    finish() {
      const sp = stylus;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.roundRect(side, top, W - side * 2, H - top - bottom, 18 * u);
      const red = ctx.createLinearGradient(0, 0, 0, H);
      red.addColorStop(0, "#E8262B");
      red.addColorStop(0.5, "#C8141B");
      red.addColorStop(1, "#A50D13");
      ctx.fillStyle = red;
      ctx.fill("evenodd");
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 3 * u;
      ctx.beginPath();
      ctx.roundRect(side * 0.35, top * 0.3, W - side * 0.7, H - top * 0.3 - bottom * 0.15, 30 * u);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(side * 0.6, top * 0.35, W * 0.4, 3 * u);
      ctx.fillRect(side * 0.3, H * 0.2, 3 * u, H * 0.3);
      ctx.strokeStyle = "rgba(90,0,0,0.5)";
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.roundRect(side, top, W - side * 2, H - top - bottom, 18 * u);
      ctx.stroke();
      const [sx, sy] = sp ? sp.pt : [W / 2, H / 2];
      const R = bottom * 0.36;
      for (const [kx, angle] of [
        [side * 1.6, sx / (8 * u)],
        [W - side * 1.6, sy / (8 * u)]
      ]) {
        const ky = H - bottom / 2;
        ctx.shadowColor = "rgba(0,0,0,0.4)";
        ctx.shadowBlur = 8 * u;
        ctx.shadowOffsetY = 4 * u;
        const kg = ctx.createRadialGradient(kx - R * 0.3, ky - R * 0.3, 0, kx, ky, R);
        kg.addColorStop(0, "#FFFFFF");
        kg.addColorStop(1, "#CFCFCF");
        ctx.fillStyle = kg;
        ctx.beginPath();
        ctx.arc(kx, ky, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = u;
        for (let i = 0;i < 24; i++) {
          const a = angle + i / 24 * Math.PI * 2;
          trace(ctx, [
            [kx + Math.cos(a) * R * 0.82, ky + Math.sin(a) * R * 0.82],
            [kx + Math.cos(a) * R, ky + Math.sin(a) * R]
          ]);
          ctx.stroke();
        }
      }
      ctx.restore();
      if (sp) {
        ctx.fillStyle = "#2A2B2C";
        ctx.fillRect(sp.pt[0] - 1.5 * u, sp.pt[1] - 1.5 * u, 3 * u, 3 * u);
      }
    }
  };
}
var etch_sketch_default = {
  id: "etch-sketch",
  name: "Line-drawing toy",
  category: "Hand-drawn",
  make: make19
};

// plugin/skills/motion-graphics/styles/felt-quilt.ts
var FELT = {
  ink: "#F4EBDD",
  accent: "#F2A3B0",
  good: "#E9B840",
  bad: "#D9443A",
  muted: "#8FCFC4"
};
var THREAD = {
  ink: "#3C4A6E",
  accent: "#C84A62",
  good: "#3C7A52",
  bad: "#B8322A",
  muted: "#5A8A86"
};
var ROUND2 = '"Arial Rounded MT Bold", "Nunito", "Varela Round", "Avenir Next", Arial, sans-serif';
var PRINTS = [
  "#C9786A",
  "#D9B95E",
  "#8FB0C8",
  "#9DB89A",
  "#E2CDB0",
  "#C7A1A8",
  "#7F9BB8",
  "#D8A47A"
];
function make20(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__feltQuilt ??= new Map;
  const cache = g.__feltQuilt;
  function drop(at) {
    const s = t - at;
    if (s < 0)
      return null;
    const p = clamp(s / 0.3);
    const land = p < 1 ? 1 - p : 0;
    const squash = p >= 1 ? Math.exp(-(s - 0.3) * 12) * Math.sin((s - 0.3) * 30) * 0.05 : 0;
    return {
      lift: land,
      sx: 1 + land * 0.1 + squash,
      sy: 1 + land * 0.1 - squash,
      a: clamp(p * 2.5)
    };
  }
  function felt(shape, color, cx, cy, at) {
    const d = drop(at);
    if (!d)
      return;
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
  function fuzz() {
    const key = `fuzz:${Math.round(u * 100)}`;
    let pat = cache.get(key);
    if (!pat) {
      const S = Math.round(80 * u);
      const c0 = new OffscreenCanvas(S, S);
      const c = c0.getContext("2d");
      for (let i = 0;i < 500; i++) {
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
  function sew(points, at, dur, color, width = 3) {
    const p = progress(t, at, dur);
    if (p <= 0)
      return null;
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
    return { end: shown.at(-1), angle, done: p >= 1 };
  }
  function feltText(s, x, y, size, color, align, edge = "#FBF5EA") {
    ctx.save();
    ctx.font = `800 ${Math.round(size * u)}px ${ROUND2}`;
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
  function tag(s, x, y, size, tone, align) {
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${ROUND2}`;
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
        for (let y = 0;y < H; y += s) {
          for (let x = 0;x < W; x += s) {
            k++;
            const col = PRINTS[Math.floor(hash(k * 1.7) * PRINTS.length)];
            c.fillStyle = col;
            c.fillRect(x, y, s, s);
            const kind = Math.floor(hash(k * 3.3) * 4);
            c.save();
            c.beginPath();
            c.rect(x, y, s, s);
            c.clip();
            if (kind === 0) {
              c.fillStyle = "rgba(255,250,240,0.55)";
              for (let py = y + 6 * u;py < y + s; py += 12 * u)
                for (let px = x + (py / (12 * u) % 2 ? 6 : 0) * u;px < x + s; px += 12 * u) {
                  c.beginPath();
                  c.arc(px, py, 2 * u, 0, Math.PI * 2);
                  c.fill();
                }
            } else if (kind === 1) {
              c.fillStyle = "rgba(255,250,240,0.3)";
              for (let p = 0;p < s; p += 14 * u) {
                c.fillRect(x + p, y, 7 * u, s);
                c.fillRect(x, y + p, s, 7 * u);
              }
            } else if (kind === 2) {
              c.fillStyle = "rgba(60,40,30,0.12)";
              for (let p = 0;p < s; p += 10 * u)
                c.fillRect(x + p, y, 4 * u, s);
            }
            const gr = c.createRadialGradient(x + s * 0.45, y + s * 0.4, s * 0.1, x + s / 2, y + s / 2, s * 0.75);
            gr.addColorStop(0, "rgba(255,255,255,0.14)");
            gr.addColorStop(1, "rgba(40,25,15,0.28)");
            c.fillStyle = gr;
            c.fillRect(x, y, s, s);
            c.restore();
          }
        }
        c.strokeStyle = "rgba(250,245,230,0.75)";
        c.lineWidth = 1.6 * u;
        c.setLineDash([6 * u, 5 * u]);
        for (let y = s;y < H; y += s) {
          c.beginPath();
          c.moveTo(0, y - 5 * u);
          c.lineTo(W, y - 5 * u);
          c.stroke();
        }
        for (let x = s;x < W; x += s) {
          c.beginPath();
          c.moveTo(x - 5 * u, 0);
          c.lineTo(x - 5 * u, H);
          c.stroke();
        }
        c.setLineDash([]);
        c.fillStyle = "rgba(60,45,35,0.22)";
        c.fillRect(0, 0, W, H);
        cache.set(key, img);
      }
      ctx.drawImage(img, 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.11, size = 64, at = 0, tone = "accent", align = "left" } = o;
      if (t < at)
        return;
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${ROUND2}`;
      const w = ctx.measureText(s).width + size * 1.4 * u;
      ctx.restore();
      const h = size * 1.9 * u;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      const cx = left + w / 2;
      const cy = Y(y);
      felt(() => {
        ctx.beginPath();
        ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      }, FELT.ink, cx, cy, at);
      const ring = Array.from({ length: 61 }, (_, i) => {
        const a = i / 60 * Math.PI * 2;
        return [cx + Math.cos(a) * (w / 2 - 8 * u), cy + Math.sin(a) * (h / 2 - 8 * u)];
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
      if (!d)
        return;
      ctx.save();
      ctx.globalAlpha = d.a;
      ctx.translate(X(x), Y(y) - d.lift * 10 * u);
      ctx.rotate((hash(x * 7 + y * 3) - 0.5) * 0.06);
      tag(s, 0, 0, o.size ?? 30, o.tone ?? "ink", o.align ?? "center");
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const d = drop(at);
      if (!d)
        return;
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
        [-hp, hp]
      ]) {
        ctx.beginPath();
        ctx.arc(hx, hy, R * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      felt(() => {
        ctx.beginPath();
        ctx.roundRect(x0, y0, bw, bh, 14 * u);
      }, FELT.ink, x0 + bw / 2, y0 + bh / 2, at);
      const inset = 8 * u;
      sew([
        [x0 + inset, y0 + inset],
        [x0 + bw - inset, y0 + inset],
        [x0 + bw - inset, y0 + bh - inset],
        [x0 + inset, y0 + bh - inset],
        [x0 + inset, y0 + inset]
      ], at + 0.25, 0.6, THREAD[tone === "ink" ? "bad" : tone], 2.4);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "bad" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const thin = !head && tone === "accent";
      const color = THREAD[tone === "ink" ? "bad" : tone];
      const r = sew(pts, at, dur, thin ? alpha(THREAD.ink, 0.75) : color, thin ? 2.2 : 4.5);
      if (!r?.done || !head)
        return;
      const s = 18 * u;
      const end = pts.at(-1);
      const prev = pts.at(-3);
      const angle = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      sew([
        [end[0] - Math.cos(angle - 0.55) * s, end[1] - Math.sin(angle - 0.55) * s],
        end,
        [end[0] - Math.cos(angle + 0.55) * s, end[1] - Math.sin(angle + 0.55) * s]
      ], at + dur, 0.15, color, 4.5);
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "muted" } = o;
      const n = 4;
      const [x0, bw] = [X(x), X(w)];
      const ph = Y(h) / n;
      const tones = [tone, "good", tone, "accent"];
      for (let i = 0;i < n; i++) {
        const cy = Y(y + h) - ph * (i + 0.5);
        const tn = tones[i];
        felt(() => {
          ctx.beginPath();
          ctx.roundRect(x0 + (i % 2 ? 4 : -3) * u, cy - ph * 0.45, bw, ph * 0.9, ph * 0.3);
        }, FELT[tn], x0 + bw / 2, cy, at + dur / n * i);
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      const d = drop(at);
      if (!d)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const color = tone === "ink" ? THREAD.ink : tone === "accent" ? "#E06A84" : FELT[tone];
      const edge = tone === "good" ? THREAD.good : "#FBF5EA";
      ctx.save();
      ctx.globalAlpha = d.a;
      feltText(value, X(x), Y(y) - d.lift * 12 * u, size, color, "center", edge);
      ctx.restore();
      if (sub) {
        const sd = drop(at + 0.3);
        if (sd)
          tag(sub, X(x), Y(y) + size * 0.85 * u, size * 0.28, "ink", "center");
      }
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const [cx, cy] = [X(x), Y(y)];
      const at = o.at ?? 0;
      const color = THREAD[o.tone ?? (kind === "check" ? "good" : "bad")];
      if (kind === "check")
        sew([
          [cx - s * 0.5, cy],
          [cx - s * 0.12, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5]
        ], at, 0.3, color, 5);
      else {
        sew([
          [cx - s * 0.5, cy - s * 0.5],
          [cx + s * 0.5, cy + s * 0.5]
        ], at, 0.15, color, 5);
        sew([
          [cx + s * 0.5, cy - s * 0.5],
          [cx - s * 0.5, cy + s * 0.5]
        ], at + 0.15, 0.15, color, 5);
      }
    },
    finish() {
      const k = 0.04 + 0.03 * Math.sin(t * 1.2);
      const gr = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.6);
      gr.addColorStop(0, `rgba(255,248,235,${k})`);
      gr.addColorStop(1, "rgba(40,25,15,0.25)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }
  };
}
var felt_quilt_default = {
  id: "felt-quilt",
  name: "Felt patchwork",
  category: "Paper & Craft",
  make: make20
};

// plugin/skills/motion-graphics/styles/film-noir.ts
var GREY2 = {
  ink: "#EDEDED",
  accent: "#FFFFFF",
  good: "#F4F4F4",
  bad: "#D8D8D8",
  muted: "#8A8A8A"
};
var BOLD = '"Futura Condensed ExtraBold", "Impact", "Haettenschweiler", "Arial Narrow", sans-serif';
var BLACK4 = '"Didot", "Bodoni 72", "Times New Roman", serif';
function make21(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__noirWall ??= new Map;
  const flicker = 0.93 + hash(Math.floor(t * 24) * 1.7) * 0.07;
  function caps(s, x, y, size, color, align = "center") {
    ctx.font = `400 ${Math.round(size * u)}px ${BOLD}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(s.toUpperCase(), x, y);
  }
  const lamp = (at = 0, dur = 0.4) => expo(progress(t, at, dur));
  return {
    surface() {
      const key = `${W}x${H}`;
      let tile = g.__noirWall.get(key);
      if (!tile) {
        tile = new OffscreenCanvas(W, H);
        const c = tile.getContext("2d");
        c.fillStyle = "#2A2A2A";
        c.fillRect(0, 0, W, H);
        c.save();
        c.translate(W * 0.5, H * 0.5);
        c.rotate(-0.42);
        for (let i = -30;i < 30; i++) {
          const y = i * 30 * u;
          const gr = c.createLinearGradient(-W, 0, W, 0);
          gr.addColorStop(0, "rgba(200,200,200,0)");
          gr.addColorStop(0.55, "rgba(200,200,200,0.13)");
          gr.addColorStop(1, "rgba(200,200,200,0.02)");
          c.fillStyle = gr;
          c.fillRect(-W, y, W * 2, 13 * u);
        }
        c.restore();
        c.fillStyle = "#1A1A1A";
        c.fillRect(0, H * 0.86, W, H * 0.14);
        c.fillStyle = "rgba(255,255,255,0.12)";
        c.fillRect(0, H * 0.86, W, 2 * u);
        g.__noirWall.set(key, tile);
      }
      ctx.save();
      ctx.translate((hash(Math.floor(t * 12)) - 0.5) * 3 * u, (hash(Math.floor(t * 12) + 5) - 0.5) * 3 * u);
      ctx.fillStyle = "#000";
      ctx.fillRect(-10, -10, W + 20, H + 20);
      ctx.globalAlpha = flicker;
      ctx.drawImage(tile, 0, 0);
      ctx.globalAlpha = 1;
      const sx = W * 0.47;
      const cone = ctx.createRadialGradient(sx, H * 0.1, 0, sx, H * 0.5, H * 0.75);
      cone.addColorStop(0, `rgba(255,255,255,${0.2 * flicker})`);
      cone.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(sx - 40 * u, 0);
      ctx.lineTo(sx + 40 * u, 0);
      ctx.lineTo(sx + W * 0.28, H * 0.86);
      ctx.lineTo(sx - W * 0.28, H * 0.86);
      ctx.closePath();
      ctx.fill();
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.06, size = 46, at = 0, dur = 0.9 } = o;
      if (t < at)
        return;
      const p = expo(progress(t, at, dur));
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${BOLD}`;
      const tw = ctx.measureText(s.toUpperCase()).width;
      const w = tw + 50 * u;
      const h = size * 2.3 * u;
      const cx = X(x) + w / 2;
      const cy = Y(y) + h / 2;
      ctx.translate(cx, cy);
      ctx.rotate((1 - p) * Math.PI * 4 - 0.025);
      ctx.scale(0.1 + 0.9 * p, 0.1 + 0.9 * p);
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 20 * u;
      ctx.shadowOffsetY = 8 * u;
      ctx.fillStyle = "#E9E6DE";
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.shadowColor = "transparent";
      ctx.font = `700 ${Math.round(size * 0.32 * u)}px ${BLACK4}`;
      ctx.fillStyle = "#222";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("The Evening Wire", 0, -h * 0.33);
      ctx.fillRect(-w / 2 + 10 * u, -h * 0.2, w - 20 * u, 1.5 * u);
      caps(s, 0, h * 0.1, size, "#151515");
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      for (let i = 0;i < 3; i++)
        ctx.fillRect(-w / 2 + 12 * u, h * 0.33 + i * 5 * u, w - 24 * u, 2 * u);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, tone = "ink", align = "center" } = o;
      const a = lamp(at, 0.25);
      if (a <= 0)
        return;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 6 * u;
      caps(s, X(x), Y(y), size, GREY2[tone], align);
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const { at = 0 } = o;
      const a = lamp(at, 0.3);
      if (a <= 0)
        return;
      const R = r * u;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
      ctx.fill();
      const face = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R);
      face.addColorStop(0, "#FAFAFA");
      face.addColorStop(1, "#B5B5B5");
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.92, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 1.2 * u;
      for (let i = 0;i < 9; i++) {
        const ang = Math.PI * 0.75 + i / 8 * Math.PI * 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * R * 0.7, cy + Math.sin(ang) * R * 0.7);
        ctx.lineTo(cx + Math.cos(ang) * R * 0.85, cy + Math.sin(ang) * R * 0.85);
        ctx.stroke();
      }
      const swing = spring(t, { start: at, stiffness: 120, damping: 7 });
      const ang = Math.PI * 0.75 + swing * Math.PI * (0.6 + hash(cx + cy) * 0.8);
      ctx.lineWidth = 2.2 * u;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * R * 0.78, cy + Math.sin(ang) * R * 0.78);
      ctx.stroke();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0 } = o;
      const a = lamp(at, 0.35);
      if (a <= 0)
        return;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 24 * u;
      ctx.shadowOffsetY = 10 * u;
      ctx.fillStyle = "#1B1B1B";
      ctx.fillRect(x0, y0, bw, bh);
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "#6B6B6B";
      ctx.lineWidth = 5 * u;
      ctx.strokeRect(x0, y0, bw, bh);
      ctx.strokeStyle = "#BDBDBD";
      ctx.lineWidth = 1.2 * u;
      ctx.strokeRect(x0 + 8 * u, y0 + 8 * u, bw - 16 * u, bh - 16 * u);
      ctx.fillStyle = "#E4E4E4";
      ctx.fillRect(x0 + bw * 0.2, y0 + bh - 26 * u, bw * 0.6, 16 * u);
      ctx.fillStyle = "#111";
      ctx.font = `400 ${Math.round(11 * u)}px ${BOLD}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("EXHIBIT A", x0 + bw / 2, y0 + bh - 18 * u);
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = expo(progress(t, at, dur));
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      trace(ctx, shown);
      ctx.strokeStyle = head ? GREY2[tone] : "rgba(230,230,230,0.55)";
      ctx.lineWidth = (head ? 5 : 1.2) * u;
      if (tone === "bad")
        ctx.setLineDash([14 * u, 9 * u]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (head && p > 0.98) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 20 * u, false);
        ctx.fillStyle = GREY2[tone];
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0 } = o;
      const n = 5;
      for (let i = 0;i < n; i++) {
        const s = spring(t, { start: at + i * 0.1, stiffness: 300, damping: 18 });
        if (s <= 0)
          continue;
        const fh = Y(h) / n;
        const fy = Y(y + h) - (i + 1) * fh - (1 - s) * 60 * u;
        ctx.save();
        ctx.globalAlpha = clamp(s * 2);
        ctx.translate(X(x + w / 2), fy + fh / 2);
        ctx.rotate((hash(i * 3.3) - 0.5) * 0.12);
        ctx.fillStyle = i % 2 ? "#C9C4B8" : "#B4AFA3";
        ctx.fillRect(-X(w) / 2, -fh / 2, X(w), fh - 3 * u);
        ctx.fillRect(-X(w) / 2 + 6 * u, -fh / 2 - 5 * u, X(w) * 0.35, 6 * u);
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1 * u;
        ctx.strokeRect(-X(w) / 2, -fh / 2, X(w), fh - 3 * u);
        ctx.restore();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      const a = lamp(at, 0.3);
      if (a <= 0)
        return;
      const value = count ? counting(t, at, dur, count) : s;
      const unit = count ? s : "";
      const chars = value.replace(/,/g, "").split("");
      const cw = size * 0.66 * u;
      const ch = size * 1 * u;
      const total = chars.length * cw + (unit ? size * 0.7 * u : 0);
      let left = X(x) - total / 2;
      const top = Y(y) - ch / 2 + (sub ? size * 0.12 * u : 0);
      ctx.save();
      ctx.globalAlpha = a;
      if (sub)
        caps(sub, X(x), top - size * 0.4 * u, size * 0.38, "#EDEDED");
      for (const d of chars) {
        const wg = ctx.createLinearGradient(0, top, 0, top + ch);
        wg.addColorStop(0, "#080808");
        wg.addColorStop(0.5, "#2C2C2C");
        wg.addColorStop(1, "#080808");
        ctx.fillStyle = "#9A9A9A";
        ctx.fillRect(left - 2 * u, top - 2 * u, cw * 0.92 + 4 * u, ch + 4 * u);
        ctx.fillStyle = wg;
        ctx.fillRect(left, top, cw * 0.92, ch);
        caps(d, left + cw * 0.46, top + ch / 2, size * 0.82, "#F2F2F2");
        left += cw;
      }
      if (unit)
        caps(unit, left + size * 0.3 * u, top + ch / 2, size * 0.75, "#F2F2F2");
      ctx.restore();
      if (sub)
        stamp(X(x) + total * 0.35, top + ch * 1.15, "CONFIRMED", at + dur + 0.15, size * 0.25);
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 34 } = o;
      const s = spring(t, { start: at, stiffness: 400, damping: 20 });
      if (s <= 0)
        return;
      const r = size * u;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(2 - s, 2 - s);
      ctx.globalAlpha = clamp(s * 2);
      ctx.strokeStyle = "#F0F0F0";
      ctx.lineWidth = 6 * u;
      ctx.lineCap = "round";
      if (kind === "check")
        trace(ctx, [
          [-r * 0.5, 0],
          [-r * 0.12, r * 0.4],
          [r * 0.6, -r * 0.5]
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, -r * 0.5);
        ctx.lineTo(r * 0.5, r * 0.5);
        ctx.moveTo(r * 0.5, -r * 0.5);
        ctx.lineTo(-r * 0.5, r * 0.5);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      ctx.restore();
      vignette(ctx, m, 0.75);
      grain(ctx, m, t, 0.1, 2);
      const f = Math.floor(t * 8);
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1 * u;
      if (hash(f * 1.3) > 0.4) {
        const sx = hash(f * 2.7) * W;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx + (hash(f) - 0.5) * 20 * u, H);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.arc(hash(f * 5.1) * W, hash(f * 6.3) * H, (1 + hash(f * 7) * 3) * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H * 0.025);
      ctx.fillRect(0, H * 0.975, W, H * 0.025);
    }
  };
  function stamp(cx, cy, s, at, size) {
    const k = spring(t, { start: at, stiffness: 500, damping: 22 });
    if (k <= 0)
      return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.18);
    ctx.scale(2.2 - 1.2 * k, 2.2 - 1.2 * k);
    ctx.globalAlpha = clamp(k * 1.5) * 0.92;
    ctx.font = `400 ${Math.round(size * u)}px ${BOLD}`;
    const w = ctx.measureText(s).width + 24 * u;
    const h = size * 1.6 * u;
    ctx.strokeStyle = "#F2F2F2";
    ctx.lineWidth = 3 * u;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    caps(s, 0, 0, size, "#F2F2F2");
    ctx.restore();
  }
}
var film_noir_default = {
  id: "film-noir",
  name: "Film noir newsreel",
  category: "Light & Imaging",
  make: make21
};

// plugin/skills/motion-graphics/styles/flat-space.ts
var WHITE = "#FFFFFF";
var NAVY = "#1B1550";
var BODY2 = {
  ink: ["#E8E4FF", "#A99CF0", "#5A4BB0"],
  accent: ["#8FF0FF", "#38C2E8", "#1A6FB0"],
  good: ["#B9F7C8", "#45D58A", "#1C8A5C"],
  bad: ["#FFB3C2", "#FF5C7A", "#B8244A"],
  muted: ["#D6D2EE", "#9590C0", "#5B5690"]
};
var ROUND3 = '"Nunito", "Avenir Next Rounded", "Arial Rounded MT Bold", "Avenir Next", "Helvetica Neue", sans-serif';
function make22(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const font = (size, weight = 800) => `${weight} ${Math.round(size * u)}px ${ROUND3}`;
  const pop = (at) => spring(t, { start: at, stiffness: 170, damping: 12 });
  const bob = (seed) => Math.sin(t * 1.6 + seed * 7) * 3 * u;
  const g = globalThis;
  g.__flatSpaceSky ??= new Map;
  const cache = g.__flatSpaceSky;
  function sky() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const x = c.getContext("2d");
      const gr = x.createLinearGradient(0, 0, W * 0.4, H);
      gr.addColorStop(0, "#14123F");
      gr.addColorStop(0.55, "#2C1B6B");
      gr.addColorStop(1, "#5A2A8C");
      x.fillStyle = gr;
      x.fillRect(0, 0, W, H);
      const glow = x.createRadialGradient(W * 0.75, H * 0.35, 0, W * 0.75, H * 0.35, W * 0.55);
      glow.addColorStop(0, "rgba(140,90,230,0.28)");
      glow.addColorStop(1, "rgba(140,90,230,0)");
      x.fillStyle = glow;
      x.fillRect(0, 0, W, H);
      for (let i = 0;i < 260; i++) {
        const b = hash(i * 4.4);
        x.fillStyle = `rgba(255,255,255,${0.2 + b * 0.6})`;
        x.beginPath();
        x.arc(hash(i * 5.1) * W, hash(i * 6.3) * H, (0.6 + b ** 3 * 1.6) * u, 0, Math.PI * 2);
        x.fill();
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  function sparkle(x, y, r, a) {
    if (a <= 0)
      return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
    ctx.restore();
  }
  function planet(cx, cy, R, tone, bands = 0) {
    const [light, mid, dark] = BODY2[tone];
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    const gr = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    gr.addColorStop(0, light);
    gr.addColorStop(0.5, mid);
    gr.addColorStop(1, dark);
    ctx.fillStyle = gr;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    for (let i = 0;i < bands; i++) {
      ctx.fillStyle = i % 2 ? alpha(light, 0.25) : alpha(dark, 0.22);
      ctx.fillRect(cx - R, cy - R + (i + 0.5) / bands * R * 2, R * 2, R * 2 / bands / 2);
    }
    ctx.fillStyle = alpha(dark, 0.55);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.arc(cx - R * 0.28, cy - R * 0.22, R * 0.98, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.86, Math.PI * 1.05, Math.PI * 1.45);
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = Math.max(2, R * 0.09);
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  }
  function glow(cx, cy, r, color, a) {
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, alpha(color, a));
    gr.addColorStop(1, alpha(color, 0));
    ctx.fillStyle = gr;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  function rounded(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2));
  }
  function scaled(cx, cy, s, draw) {
    if (s <= 0.001)
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
      sky();
      const pm = pop(0.3);
      scaled(X(0.88), Y(0.12), pm, () => planet(X(0.88), Y(0.12) + bob(1), 18 * u, "ink"));
      const p = expo(progress(t, 0.1, 1.4));
      if (p <= 0)
        return;
      const cx = X(0.93);
      const cy = Y(0.98) + (1 - p) * 220 * u;
      const R = 150 * u;
      const ring = (front) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.28);
        for (const [k, c] of ["#F2B37A", "#D98A6A", "#F7CF9C"].entries()) {
          ctx.beginPath();
          ctx.ellipse(0, 0, R * (1.55 + k * 0.1), R * (0.3 + k * 0.03), 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
          ctx.strokeStyle = c;
          ctx.lineWidth = 9 * u;
          ctx.stroke();
        }
        ctx.restore();
      };
      ring(false);
      planet(cx, cy, R, "bad", 6);
      ring(true);
    },
    title(s, o = {}) {
      const { x = 0.05, y = 0.11, size = 76, at = 0, align = "left" } = o;
      const p = pop(at);
      if (p <= 0)
        return;
      ctx.save();
      ctx.font = font(size, 900);
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      const tx = X(x);
      const ty = Y(y) + (1 - clamp(p)) * 30 * u;
      ctx.globalAlpha = clamp(p * 1.5);
      ctx.shadowColor = "rgba(10,6,40,0.5)";
      ctx.shadowOffsetY = 4 * u;
      ctx.fillStyle = WHITE;
      ctx.fillText(s, tx, ty);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { size = 34, align = "center", tone = "ink", at = 0 } = o;
      const p = pop(at);
      if (p <= 0)
        return;
      ctx.font = font(size);
      const w = ctx.measureText(s).width + size * 1.1 * u;
      const h = size * 1.55 * u;
      const cx = align === "left" ? X(x) + w / 2 : align === "right" ? X(x) - w / 2 : X(x);
      const cy = Y(y) + bob(x + y);
      const filled = tone !== "ink" && tone !== "muted";
      scaled(cx, cy, p, () => {
        ctx.save();
        ctx.shadowColor = "rgba(10,6,40,0.45)";
        ctx.shadowOffsetY = 4 * u;
        rounded(cx - w / 2, cy - h / 2, w, h, h / 2);
        ctx.fillStyle = filled ? BODY2[tone][1] : WHITE;
        ctx.fill();
        ctx.restore();
        ctx.font = font(size);
        ctx.fillStyle = filled ? WHITE : NAVY;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s, cx, cy + size * 0.04 * u);
      });
    },
    node(x, y, r, o = {}) {
      const at = o.at ?? 0;
      const tone = o.tone ?? "accent";
      const p = pop(at);
      if (p <= 0)
        return;
      const cx = X(x);
      const cy = Y(y) + bob(x * 3 + y);
      const R = r * u;
      scaled(cx, cy, p, () => {
        glow(cx, cy, R * 2.2, BODY2[tone][1], 0.35 + 0.1 * Math.sin(t * 3 + x * 9));
        planet(cx, cy, R, tone);
      });
    },
    box(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const tone = o.tone ?? "ink";
      const p = pop(at);
      if (p <= 0)
        return;
      const [bx, by, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const [light, mid] = BODY2[tone];
      scaled(bx + bw / 2, by + bh / 2, p, () => {
        ctx.save();
        ctx.shadowColor = "rgba(10,6,40,0.5)";
        ctx.shadowOffsetY = 8 * u;
        rounded(bx, by, bw, bh, 28 * u);
        const gr = ctx.createLinearGradient(bx, by, bx, by + bh);
        gr.addColorStop(0, "#3A2C8A");
        gr.addColorStop(1, "#24196A");
        ctx.fillStyle = gr;
        ctx.fill();
        ctx.restore();
        rounded(bx, by, bw, bh, 28 * u);
        ctx.strokeStyle = mid;
        ctx.lineWidth = 5 * u;
        ctx.stroke();
        rounded(bx + 14 * u, by + 10 * u, bw - 28 * u, 7 * u, 4 * u);
        ctx.fillStyle = alpha(light, 0.35);
        ctx.fill();
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const p = expo(progress(t, at, dur));
      if (p <= 0)
        return;
      const color = tone === "ink" ? "#8FD8FF" : BODY2[tone][1];
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      trace(ctx, shown);
      ctx.lineCap = "round";
      ctx.strokeStyle = head ? color : alpha(color, 0.4);
      ctx.lineWidth = (head ? 5 : 2) * u;
      ctx.setLineDash(head ? [0.1, 11 * u] : []);
      ctx.stroke();
      ctx.restore();
      if (head && p >= 0.99) {
        const end = pts.at(-1);
        const prev = pts.at(-4);
        ctx.save();
        arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 16 * u, false);
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineJoin = "round";
        ctx.lineWidth = 4 * u;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    },
    store(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const p = pop(at);
      if (p <= 0)
        return;
      const cx = X(x + w / 2);
      const cy = Y(y + h / 2) + bob(2);
      const R = Math.min(X(w), Y(h)) * 0.48;
      scaled(cx, cy, p, () => {
        glow(cx, cy, R * 1.8, "#5AB8FF", 0.3);
        const ring = (front) => {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(-0.3);
          ctx.beginPath();
          ctx.ellipse(0, 0, R * 1.6, R * 0.38, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
          ctx.strokeStyle = "#F5B85A";
          ctx.lineWidth = 7 * u;
          ctx.stroke();
          ctx.restore();
        };
        ring(false);
        planet(cx, cy, R, "accent", 8);
        ring(true);
        for (let i = 0;i < 6; i++) {
          const a = t * 1.2 + i / 6 * Math.PI * 2;
          const k = clamp((t - at - 0.3 - i * 0.08) * 3);
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * R * 1.6, cy + Math.sin(a) * R * 0.38 - Math.cos(a) * R * 0.4, 4 * u * k, 0, Math.PI * 2);
          ctx.fillStyle = WHITE;
          ctx.fill();
        }
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "ink" } = o;
      const p = pop(at);
      if (p <= 0)
        return;
      const str = count ? counting(t, at, dur, count) + s : s;
      const cx = X(x);
      const cy = Y(y);
      const done = !count || t >= at + dur;
      const gold = tone === "accent";
      scaled(cx, cy, p, () => {
        if (gold && done) {
          const b = progress(t, at + dur, 0.8);
          glow(cx, cy, size * 2 * u, "#FFD15A", 0.45 * (1 - b * 0.5));
        }
        ctx.save();
        ctx.font = font(size, 900);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(10,6,40,0.5)";
        ctx.shadowOffsetY = 5 * u;
        if (gold) {
          const gr = ctx.createLinearGradient(0, cy - size * 0.5 * u, 0, cy + size * 0.5 * u);
          gr.addColorStop(0, "#FFE58A");
          gr.addColorStop(1, "#E8A53A");
          ctx.fillStyle = gr;
        } else
          ctx.fillStyle = tone === "ink" || tone === "muted" ? WHITE : BODY2[tone][0];
        ctx.fillText(str, cx, cy);
        ctx.restore();
        if (sub) {
          ctx.font = font(size * 0.34, 800);
          ctx.fillStyle = "#CFC8FF";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(sub, cx, cy + size * 0.72 * u);
        }
      });
    },
    mark(kind, x, y, o = {}) {
      const at = o.at ?? 0;
      const p = pop(at);
      if (p <= 0)
        return;
      const r = (o.size ?? 24) * u;
      const cx = X(x);
      const cy = Y(y) + bob(x + 5);
      const tone = kind === "check" ? "good" : "bad";
      scaled(cx, cy, p, () => {
        ctx.save();
        ctx.shadowColor = "rgba(10,6,40,0.45)";
        ctx.shadowOffsetY = 4 * u;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = BODY2[tone][1];
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = WHITE;
        ctx.lineWidth = r * 0.24;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.45, cy + r * 0.02],
            [cx - r * 0.1, cy + r * 0.35],
            [cx + r * 0.45, cy - r * 0.3]
          ]);
        else {
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.35, cy - r * 0.35);
          ctx.lineTo(cx + r * 0.35, cy + r * 0.35);
          ctx.moveTo(cx + r * 0.35, cy - r * 0.35);
          ctx.lineTo(cx - r * 0.35, cy + r * 0.35);
        }
        ctx.stroke();
      });
    },
    finish() {
      for (let i = 0;i < 14; i++) {
        const a = Math.max(0, Math.sin(t * 2.2 + i * 1.9)) ** 3;
        sparkle(hash(i * 7.3) * W, hash(i * 3.9) * H, (5 + hash(i * 2.2) * 6) * u, a * 0.9);
      }
      vignette(ctx, m, 0.3, "12,8,40");
    }
  };
}
var flat_space_default = {
  id: "flat-space",
  name: "Flat vector space",
  category: "Popular Explainer Looks",
  make: make22
};

// plugin/skills/motion-graphics/styles/flow-field.ts
var BG2 = "#16121F";
var TONE7 = {
  ink: "#ECE6F2",
  accent: "#7FDCD3",
  good: "#B8E68E",
  bad: "#F38C6E",
  muted: "#9089A6"
};
var MONO5 = '"Space Mono", "SF Mono", Menlo, Consolas, monospace';
var angle = (x, y) => Math.sin(x * 5.1 + Math.cos(y * 4.3) * 1.7) * 0.9 + Math.cos(y * 7.3 - x * 2.2) * 0.55 + Math.sin((x + y) * 11) * 0.18;
function make23(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__flowField ??= new Map;
  const cache = g.__flowField;
  function field() {
    const key = `${W}x${H}`;
    let tex = cache.get(key);
    if (tex)
      return tex;
    tex = new OffscreenCanvas(W, H);
    const c = tex.getContext("2d");
    c.fillStyle = BG2;
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = "lighter";
    c.lineWidth = Math.max(0.6, 0.9 * u);
    const bands = ["#5FB8C2", "#8C8FC4", "#B87BB0", "#D99A7E"];
    for (let i = 0;i < 3200; i++) {
      let x = hash(i * 1.31) * 1.2 - 0.1;
      let y = hash(i * 2.17 + 5);
      const col = bands[Math.min(3, Math.floor(clamp(y + (hash(i) - 0.5) * 0.25) * 4))];
      c.strokeStyle = alpha(col, 0.1 + hash(i * 3.3) * 0.2);
      c.beginPath();
      c.moveTo(x * W, y * H);
      for (let s = 0;s < 60; s++) {
        const a = angle(x, y) * 0.55;
        x += Math.cos(a) * 0.005;
        y += Math.sin(a) * 0.005 * (W / H) * 0.6;
        c.lineTo(x * W, y * H);
      }
      c.stroke();
    }
    cache.set(key, tex);
    return tex;
  }
  function caption(s, x, y, size, o = {}) {
    const { at = 0, tone = "ink", align = "left", weight = 400 } = o;
    const p = progress(t, at, 0.4);
    if (p <= 0)
      return 0;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.font = `${weight} ${Math.round(size * u)}px ${MONO5}`;
    ctx.letterSpacing = `${size * 0.06 * u}px`;
    ctx.fillStyle = TONE7[tone];
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 8 * u;
    ctx.fillText(s, x, y + (1 - expo(p)) * 8 * u);
    const w = ctx.measureText(s).width;
    ctx.restore();
    return w;
  }
  function spark(pts, f, color) {
    const head = along(pts, f).points;
    const tail = head.slice(-6);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    trace(ctx, tail);
    ctx.strokeStyle = alpha(color, 0.5);
    ctx.lineWidth = 1.5 * u;
    ctx.stroke();
    const [hx, hy] = head.at(-1);
    const gl = ctx.createRadialGradient(hx, hy, 0, hx, hy, 9 * u);
    gl.addColorStop(0, "rgba(255,255,255,0.95)");
    gl.addColorStop(0.3, alpha(color, 0.7));
    gl.addColorStop(1, alpha(color, 0));
    ctx.fillStyle = gl;
    ctx.fillRect(hx - 9 * u, hy - 9 * u, 18 * u, 18 * u);
    ctx.restore();
  }
  return {
    surface() {
      ctx.fillStyle = BG2;
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(field(), Math.sin(t * 0.6) * 6 * u, Math.cos(t * 0.45) * 4 * u);
      for (let i = 0;i < 26; i++) {
        let x = hash(i * 7.1);
        let y = hash(i * 3.9 + 1);
        const pts = [];
        for (let s = 0;s < 40; s++) {
          const a = angle(x, y) * 0.55;
          x += Math.cos(a) * 0.008;
          y += Math.sin(a) * 0.008 * (W / H) * 0.6;
          pts.push([x * W, y * H]);
        }
        spark(pts, (t * 0.18 + hash(i)) % 1, i % 3 ? TONE7.accent : TONE7.bad);
      }
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.08, size = 34, at = 0, align = "left" } = o;
      const p = progress(t, at, o.dur ?? 0.6);
      if (p <= 0)
        return;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${MONO5}`;
      ctx.letterSpacing = `${size * 0.12 * u}px`;
      const tw = ctx.measureText(s.toUpperCase()).width;
      const left = align === "center" ? X(x) - tw / 2 : align === "right" ? X(x) - tw : X(x);
      ctx.fillStyle = "rgba(10,8,16,0.6)";
      ctx.fillRect(left - 18 * u, Y(y) - size * 0.85 * u, (tw + 36 * u) * expo(p), size * 1.7 * u);
      ctx.restore();
      caption(s.toUpperCase(), left, Y(y), size, { at: at + 0.15, weight: 700 });
    },
    label(s, x, y, o = {}) {
      caption(s.toLowerCase(), X(x), Y(y), o.size ?? 26, {
        at: o.at,
        tone: o.tone,
        align: o.align ?? "center"
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const R = r * u * (0.6 + 0.4 * expo(p));
      ctx.save();
      const halo = ctx.createRadialGradient(X(x), Y(y), R * 0.9, X(x), Y(y), R * 1.9);
      halo.addColorStop(0, alpha(TONE7[tone], 0.55 * p));
      halo.addColorStop(1, alpha(TONE7[tone], 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R * 1.9, 0, Math.PI * 2);
      ctx.fill();
      const core = ctx.createRadialGradient(X(x) - R * 0.3, Y(y) - R * 0.3, 0, X(x), Y(y), R);
      core.addColorStop(0, "#2A2338");
      core.addColorStop(1, "#08060C");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = alpha("#FFFFFF", 0.8 * p);
      ctx.lineWidth = 1.2 * u;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R, Math.PI * 0.1, Math.PI * (0.1 + 1.6 * p));
      ctx.stroke();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      ctx.save();
      ctx.globalAlpha = expo(p);
      ctx.fillStyle = "rgba(10,8,16,0.62)";
      ctx.beginPath();
      ctx.roundRect(X(x), Y(y), X(w), Y(h), 10 * u);
      ctx.fill();
      ctx.strokeStyle = alpha(TONE7[tone], 0.7);
      ctx.lineWidth = 1.2 * u;
      ctx.stroke();
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend + 0.06 * Math.sin(x1 * 40), 40);
      const { points, angle: a } = along(pts, expo(p));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = alpha(TONE7[tone], head ? 0.85 : 0.35);
      ctx.lineWidth = (head ? 1.4 : 0.9) * u;
      if (tone === "bad")
        ctx.setLineDash([5 * u, 4 * u]);
      trace(ctx, points);
      ctx.stroke();
      ctx.setLineDash([]);
      if (head && p >= 1) {
        arrowhead(ctx, pts.at(-1), a, 9 * u);
        ctx.stroke();
      }
      ctx.restore();
      if (p >= 1 && head)
        spark(pts, (t * 0.7 + x1) % 1, TONE7[tone]);
      else if (p < 1)
        spark(pts, expo(p), TONE7[tone]);
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const cx = X(x + w / 2);
      const cy = Y(y + h / 2);
      const rx = X(w) * 0.75;
      const ry = Y(h) / 2;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 1 * u;
      for (let i = 0;i < 18; i++) {
        const f = (i + 1) / 18;
        const spin = t * (1.4 - f) + i;
        ctx.strokeStyle = alpha(i % 3 ? TONE7[tone] : TONE7.bad, 0.35 + 0.5 * (1 - f));
        ctx.lineWidth = (1 + (1 - f)) * u;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * f, ry * f, Math.sin(i) * 0.3, spin, spin + Math.PI * 1.5 * expo(p));
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = "#08060C";
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.18 * p, ry * 0.18 * p, 0, 0, Math.PI * 2);
      ctx.fill();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const w = caption(value, X(x), Y(y), size, {
        at,
        tone: tone === "accent" ? "ink" : tone,
        align: "center",
        weight: 700
      });
      if (sub) {
        caption(sub.toLowerCase(), X(x), Y(y) - size * 0.72 * u, size * 0.24, {
          at: at + 0.2,
          align: "center",
          tone: "muted"
        });
        const q = progress(t, at + 0.4, 0.5);
        ctx.strokeStyle = TONE7.ink;
        ctx.lineWidth = 1.5 * u;
        ctx.beginPath();
        ctx.moveTo(X(x) - w / 2, Y(y) + size * 0.55 * u);
        ctx.lineTo(X(x) - w / 2 + w * expo(q), Y(y) + size * 0.55 * u);
        ctx.stroke();
      }
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 22) * u;
      const p = progress(t, o.at ?? 0, 0.3);
      if (p <= 0)
        return;
      const [cx, cy] = [X(x), Y(y)];
      const path = kind === "check" ? [
        [cx - s * 0.5, cy],
        [cx - s * 0.15, cy + s * 0.4],
        [cx + s * 0.55, cy - s * 0.45]
      ] : [
        [cx - s * 0.45, cy - s * 0.45],
        [cx + s * 0.45, cy + s * 0.45],
        [cx, cy],
        [cx + s * 0.45, cy - s * 0.45],
        [cx - s * 0.45, cy + s * 0.45]
      ];
      ctx.save();
      ctx.shadowColor = kind === "check" ? TONE7.good : TONE7.bad;
      ctx.shadowBlur = 10 * u;
      trace(ctx, along(path, p).points);
      ctx.strokeStyle = kind === "check" ? TONE7.good : TONE7.bad;
      ctx.lineWidth = 2 * u;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      v.addColorStop(0, "rgba(8,6,12,0)");
      v.addColorStop(1, "rgba(8,6,12,0.55)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }
  };
}
var flow_field_default = {
  id: "flow-field",
  name: "Flow field",
  category: "Data & Information",
  make: make23
};

// plugin/skills/motion-graphics/styles/gameboy.ts
var SHADE = ["#0F380F", "#306230", "#8BAC0F", "#9BBC0F"];
var [D0, D1, D2, D3] = SHADE;
var RGB = SHADE.map((h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)));
var TONE8 = { ink: D0, accent: D0, good: D0, bad: D1, muted: D1 };
var FONT = 'Verdana, "DejaVu Sans", Tahoma, Arial, sans-serif';
var step = (p, n) => Math.floor(clamp(p) * n) / n;
function make24(ctx, t, m) {
  const full = frame(m);
  const g = globalThis;
  g.__gb ??= { text: new Map };
  const st = g.__gb;
  const sx = full.W * 0.14;
  const sy = full.H * 0.07;
  const sw = full.W * 0.72;
  const sh = full.H * 0.8;
  const h = 160;
  const w = Math.round(h * sw / sh);
  if (!st.buf || st.buf.width !== w) {
    st.buf = new OffscreenCanvas(w, h);
    st.grid = null;
  }
  const c = st.buf.getContext("2d", { willReadFrequently: true });
  const { u, X, Y } = frame({ width: w, height: h });
  const R = Math.round;
  function crisp(s, px, color) {
    const key = `${s}|${px}|${color}`;
    let img = st.text.get(key);
    if (!img) {
      if (st.text.size > 600)
        st.text.clear();
      const font = `bold ${px}px ${FONT}`;
      const probe = new OffscreenCanvas(4, 4).getContext("2d");
      probe.font = font;
      img = new OffscreenCanvas(Math.ceil(probe.measureText(s).width) + 2, Math.ceil(px * 1.5));
      const x = img.getContext("2d", { willReadFrequently: true });
      x.font = font;
      x.fillStyle = color;
      x.textBaseline = "middle";
      x.fillText(s, 1, img.height / 2);
      const d = x.getImageData(0, 0, img.width, img.height);
      for (let i = 3;i < d.data.length; i += 4)
        d.data[i] = d.data[i] > 100 ? 255 : 0;
      x.putImageData(d, 0, 0);
      st.text.set(key, img);
    }
    return img;
  }
  function say(s, x, y, px, color, align = "left") {
    const img = crisp(s, px, color);
    const ox = align === "center" ? img.width / 2 : align === "right" ? img.width : 0;
    c.drawImage(img, R(x - ox), R(y - img.height / 2));
    return img.width;
  }
  function panel(x, y, ww, hh, fill = D3) {
    x = R(x);
    y = R(y);
    ww = R(ww);
    hh = R(hh);
    if (ww < 3 || hh < 3)
      return;
    c.fillStyle = D0;
    c.fillRect(x, y, ww, hh);
    c.fillStyle = fill;
    c.fillRect(x + 1, y + 1, ww - 2, hh - 2);
    c.strokeStyle = D0;
    c.lineWidth = 1;
    if (ww > 6 && hh > 6)
      c.strokeRect(x + 2.5, y + 2.5, ww - 5, hh - 5);
  }
  const shown = (at = 0) => t >= at;
  return {
    surface() {
      c.imageSmoothingEnabled = false;
      c.fillStyle = D3;
      c.fillRect(0, 0, w, h);
      c.fillStyle = D2;
      for (let y = 0;y < h; y += 2)
        for (let x = y / 2 % 2 ? 1 : 0;x < w; x += 4)
          c.fillRect(x, y, 1, 1);
    },
    title(text, o = {}) {
      const { x = 0.035, y = 0.06, size = 54, at = 0, dur = 0.9 } = o;
      if (!shown(at))
        return;
      const px = Math.max(9, R(size * u));
      const s = text.toUpperCase();
      const tw = crisp(s, px, D0).width;
      const rise = R((1 - step(progress(t, at, 0.2), 5)) * 20);
      panel(X(x), Y(y) + rise, tw + 10, px + 7);
      const n = Math.ceil(s.length * progress(t, at + 0.2, dur));
      if (n > 0)
        say(s.slice(0, n), X(x) + 5, Y(y) + rise + (px + 7) / 2, px, D0);
    },
    label(text, x, y, o = {}) {
      const { size = 44, at = 0, dur = 0.3, tone = "ink", align = "center" } = o;
      if (!shown(at))
        return;
      const px = Math.max(8, R(size * u));
      const s = text.toUpperCase();
      const n = Math.ceil(s.length * progress(t, at, dur));
      const tw = crisp(s, px, D0).width;
      const bx = align === "center" ? X(x) - tw / 2 : align === "right" ? X(x) - tw : X(x);
      if (tone !== "ink" && tone !== "muted")
        panel(bx - 3, Y(y) - px / 2 - 3, tw + 6, px + 6);
      say(s.slice(0, n), bx, Y(y), px, TONE8[tone]);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.25, tone = "accent" } = o;
      if (!shown(at))
        return;
      const p = step(progress(t, at, dur), 3);
      const rr = Math.max(2, R(r * u * 1.4));
      const cx = R(X(x));
      const cy = R(Y(y));
      const body = p < 0.34 ? D2 : p < 0.67 ? D1 : tone === "accent" || tone === "good" ? D1 : D2;
      c.fillStyle = D0;
      c.beginPath();
      c.arc(cx, cy, rr + 1, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = body;
      c.beginPath();
      c.arc(cx, cy, rr, 0, Math.PI * 2);
      c.fill();
      if (p >= 1) {
        c.fillStyle = D3;
        c.fillRect(cx - R(rr / 2), cy - R(rr / 2), Math.max(1, R(rr / 3)), Math.max(1, R(rr / 3)));
      }
    },
    box(x, y, bw, bh, o = {}) {
      const { at = 0, dur = 0.15 } = o;
      if (!shown(at))
        return;
      const p = Math.max(0.25, step(progress(t, at, dur), 4));
      panel(X(x), Y(y) + Y(bh) * (1 - p), X(bw), Y(bh) * p);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (!shown(at))
        return;
      const p = Math.max(1 / 8, step(progress(t, at, dur), 8));
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const n = Math.max(2, R(pts.length * p));
      c.fillStyle = tone === "bad" || !head ? D1 : D0;
      const gap = head && tone !== "bad" ? 5 : 2;
      let carry = 0;
      for (let i = 1;i < n; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let d = carry;d < l; d += gap) {
          const f = d / l;
          const qx = R(a[0] + (b[0] - a[0]) * f);
          const qy = R(a[1] + (b[1] - a[1]) * f);
          if (gap === 5) {
            const dir = Math.sign(b[0] - a[0]) || 1;
            c.fillRect(qx, qy - 2, 1, 5);
            c.fillRect(qx + dir, qy - 1, 1, 3);
            c.fillRect(qx + 2 * dir, qy, 1, 1);
          } else
            c.fillRect(qx, qy, 1, 1);
          carry = d + gap - l;
        }
      }
      if (head && p >= 1) {
        const e = pts.at(-1);
        const q = pts.at(-4);
        const ang = Math.atan2(e[1] - q[1], e[0] - q[0]);
        c.beginPath();
        c.moveTo(R(e[0]), R(e[1]));
        c.lineTo(R(e[0] - Math.cos(ang - 0.6) * 5), R(e[1] - Math.sin(ang - 0.6) * 5));
        c.lineTo(R(e[0] - Math.cos(ang + 0.6) * 5), R(e[1] - Math.sin(ang + 0.6) * 5));
        c.fill();
      }
    },
    store(x, y, bw, bh, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (!shown(at))
        return;
      const n = 4;
      const slab = Y(bh) / n;
      for (let i = 0;i < n; i++) {
        const p = progress(t, at + i * dur / n, dur / n);
        if (p <= 0)
          continue;
        const yy = Y(y) + Y(bh) - slab * (i + 1) - R((1 - step(p, 4)) * 8);
        panel(X(x), yy, X(bw), slab - 1, i % 2 ? D2 : D3);
      }
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "accent" } = o;
      if (!shown(at))
        return;
      const px = Math.max(10, R(size * u * 1.35));
      const s = count ? counting(t, at, dur, count) + text : text;
      const done = progress(t, at, dur) >= 1 && (t - at - dur) % 1 < 0.5 && tone === "accent";
      const yy = Y(y) - (sub ? px * 0.3 : 0);
      if (done) {
        const tw = crisp(s, px, D3).width;
        c.fillStyle = D0;
        c.fillRect(R(X(x) - tw / 2 - 3), R(yy - px * 0.7), tw + 6, R(px * 1.4));
        say(s, X(x), yy, px, D3, "center");
      } else
        say(s, X(x), yy, px, D0, "center");
      if (sub)
        say(sub.toUpperCase(), X(x), Y(y) + px * 0.7, Math.max(8, R(px * 0.45)), D1, "center");
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 40 } = o;
      if (!shown(at))
        return;
      const r = Math.max(4, R(size * u));
      const cx = R(X(x));
      const cy = R(Y(y));
      c.strokeStyle = D0;
      c.lineWidth = 2;
      c.beginPath();
      if (kind === "check") {
        c.moveTo(cx - r * 0.6, cy);
        c.lineTo(cx - r * 0.15, cy + r * 0.5);
        c.lineTo(cx + r * 0.7, cy - r * 0.6);
      } else {
        c.moveTo(cx - r * 0.5, cy - r * 0.5);
        c.lineTo(cx + r * 0.5, cy + r * 0.5);
        c.moveTo(cx + r * 0.5, cy - r * 0.5);
        c.lineTo(cx - r * 0.5, cy + r * 0.5);
      }
      c.stroke();
    },
    finish() {
      const d = c.getImageData(0, 0, w, h);
      const lift = 3 - Math.min(3, Math.floor(progress(t, 0, 0.4) * 4));
      for (let i = 0;i < d.data.length; i += 4) {
        const l = d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11;
        let k = l < 60 ? 0 : l < 120 ? 1 : l < 158 ? 2 : 3;
        k = Math.min(3, k + lift);
        const col = RGB[k];
        d.data[i] = col[0];
        d.data[i + 1] = col[1];
        d.data[i + 2] = col[2];
      }
      c.putImageData(d, 0, 0);
      const { W, H } = full;
      ctx.fillStyle = "#D9D6CF";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#8E8A9E";
      ctx.beginPath();
      ctx.roundRect(W * 0.08, -H * 0.05, W * 0.84, H * 1, [0, 0, H * 0.12, H * 0.04]);
      ctx.fill();
      ctx.fillStyle = "#6D6880";
      ctx.fillRect(W * 0.1, H * 0.035, W * 0.8, H * 0.004);
      ctx.fillStyle = "#3F3A55";
      ctx.fillRect(W * 0.1, H * 0.022, W * 0.8, H * 0.003);
      ctx.fillStyle = "#C7344A";
      ctx.beginPath();
      ctx.arc(W * 0.11, H * 0.45, H * 0.008, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 0.25;
      ctx.drawImage(st.buf, sx + 3, sy + 3, sw, sh);
      ctx.globalAlpha = 1;
      ctx.drawImage(st.buf, sx, sy, sw, sh);
      ctx.restore();
      if (!st.grid || st.grid.width !== Math.ceil(sw)) {
        st.grid = new OffscreenCanvas(Math.ceil(sw), Math.ceil(sh));
        const gx = st.grid.getContext("2d");
        gx.fillStyle = "rgba(155,188,15,0.35)";
        const cw = sw / w;
        for (let i = 0;i <= w; i++)
          gx.fillRect(i * cw, 0, Math.max(1, cw * 0.12), sh);
        for (let j = 0;j <= h; j++)
          gx.fillRect(0, j * cw, sw, Math.max(1, cw * 0.12));
      }
      ctx.drawImage(st.grid, sx, sy);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(sx, sy, sw, sh * 0.3);
    }
  };
}
var gameboy_default = {
  id: "gameboy",
  name: "Pocket handheld",
  category: "Retro Digital",
  make: make24
};

// plugin/skills/motion-graphics/styles/glassmorphism.ts
var TONE9 = {
  ink: "#FFFFFF",
  accent: "#FF6FD8",
  good: "#5CF2B0",
  bad: "#FF5A6E",
  muted: "#C9B8FF"
};
var SANS3 = '"Inter", "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
var BLOBS = [
  [0.2, 0.3, 0.38, "#E03BE0"],
  [0.75, 0.25, 0.32, "#7B3BFF"],
  [0.55, 0.75, 0.4, "#2E7BFF"],
  [0.9, 0.8, 0.3, "#FF7A2E"],
  [0.1, 0.85, 0.3, "#23C4FF"],
  [0.45, 0.4, 0.25, "#B03BFF"]
];
function make25(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__glass ??= new Map;
  const cache = g.__glass;
  const rise = (at = 0) => spring(t, { start: at, stiffness: 170, damping: 18 });
  let frosted = null;
  function blobs(div) {
    const key = `${W}x${H}/${div}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(Math.ceil(W / div), Math.ceil(H / div));
      cache.set(key, c);
    }
    const x = c.getContext("2d");
    const [w, h] = [c.width, c.height];
    x.fillStyle = "#2A0F5C";
    x.fillRect(0, 0, w, h);
    for (const [i, [bx, by, br, col]] of BLOBS.entries()) {
      const cx = (bx + Math.sin(t * 0.35 + i * 1.7) * 0.06) * w;
      const cy = (by + Math.cos(t * 0.3 + i * 2.3) * 0.06) * h;
      const r = br * Math.max(w, h);
      const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, alpha(col, 0.95));
      gr.addColorStop(1, alpha(col, 0));
      x.fillStyle = gr;
      x.fillRect(0, 0, w, h);
    }
    return c;
  }
  function glass(x, y, w, h, r, tint = "#FFFFFF") {
    frosted ??= blobs(48);
    ctx.save();
    ctx.shadowColor = "rgba(20,0,60,0.35)";
    ctx.shadowBlur = 30 * u;
    ctx.shadowOffsetY = 12 * u;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = "rgba(255,255,255,0.01)";
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.clip();
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(frosted, 0, 0, W, H);
    ctx.fillStyle = alpha(tint, 0.14);
    ctx.fillRect(x, y, w, h);
    const sheen = ctx.createLinearGradient(x, y, x + w, y + h);
    sheen.addColorStop(0, "rgba(255,255,255,0.22)");
    sheen.addColorStop(0.45, "rgba(255,255,255,0.04)");
    sheen.addColorStop(1, "rgba(255,255,255,0.0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.stroke();
  }
  function risen(at, draw) {
    const s = rise(at);
    if (s <= 0)
      return;
    ctx.save();
    ctx.globalAlpha = clamp(s * 1.5);
    ctx.translate(0, (1 - s) * 40 * u);
    draw();
    ctx.restore();
  }
  function pill(s, cx, cy, size, tone, align = "center") {
    ctx.font = `600 ${Math.round(size * u)}px ${SANS3}`;
    const w = ctx.measureText(s).width + size * 1.4 * u;
    const h = size * 1.7 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    glass(left, cy - h / 2, w, h, h / 2, tone === "ink" || tone === "muted" ? "#FFFFFF" : TONE9[tone]);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + size * 0.7 * u, cy + u);
  }
  return {
    surface() {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(blobs(10), 0, 0, W, H);
      for (const [i, [ox, oy, or, col]] of [
        [0.88, 0.16, 46, "#FF6FD8"],
        [0.14, 0.82, 38, "#FF8A3D"]
      ].entries()) {
        const cx = X(ox) + Math.sin(t * 0.8 + i) * 10 * u;
        const cy = Y(oy) + Math.cos(t * 0.6 + i) * 10 * u;
        const r = or * u;
        const gr = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
        gr.addColorStop(0, "#FFFFFF");
        gr.addColorStop(0.25, col);
        gr.addColorStop(1, alpha(col, 0.6));
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 38, at = 0, align = "left" } = o;
      risen(at, () => {
        ctx.font = `700 ${Math.round(size * u)}px ${SANS3}`;
        const w = ctx.measureText(s).width + size * 1.4 * u;
        const h = size * 1.8 * u;
        const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
        glass(left, Y(y) - h / 2, w, h, 14 * u);
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(s, left + size * 0.7 * u, Y(y) + u);
      });
    },
    label(s, x, y, o = {}) {
      risen(o.at, () => pill(s, X(x), Y(y), o.size ?? 30, o.tone ?? "ink", o.align ?? "center"));
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const R = r * u * (0.5 + 0.5 * spring(t, { start: at, stiffness: 240, damping: 12 })) * 0.95;
      const col = TONE9[tone];
      ctx.save();
      const halo = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), R * 2.6);
      halo.addColorStop(0, alpha(col, 0.55 * p));
      halo.addColorStop(1, alpha(col, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(X(x) - R * 3, Y(y) - R * 3, R * 6, R * 6);
      ctx.fillStyle = "#FFFFFF";
      ctx.globalAlpha = p;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = alpha(col, 0.9);
      ctx.lineWidth = R * 0.3;
      ctx.stroke();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const tone = o.tone ?? "ink";
      risen(o.at, () => glass(X(x), Y(y), X(w), Y(h), 18 * u, tone === "good" ? "#5CF2B0" : "#FFFFFF"));
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 36);
      const { points, angle } = along(pts, expo(p));
      const col = tone === "ink" ? "#FFFFFF" : TONE9[tone];
      ctx.save();
      ctx.lineCap = "round";
      ctx.shadowColor = col;
      ctx.shadowBlur = (head ? 12 : 6) * u;
      ctx.strokeStyle = alpha(col, head ? 0.95 : 0.55);
      ctx.lineWidth = (head ? 3 : 1.4) * u;
      trace(ctx, points);
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1);
        ctx.beginPath();
        ctx.moveTo(end[0] - Math.cos(angle - 0.5) * 12 * u, end[1] - Math.sin(angle - 0.5) * 12 * u);
        ctx.lineTo(end[0], end[1]);
        ctx.lineTo(end[0] - Math.cos(angle + 0.5) * 12 * u, end[1] - Math.sin(angle + 0.5) * 12 * u);
        ctx.stroke();
        const [dx, dy] = along(pts, (t * 0.8 + x1 * 3) % 1).points.at(-1);
        ctx.fillStyle = "#FFFFFF";
        ctx.shadowBlur = 16 * u;
        ctx.beginPath();
        ctx.arc(dx, dy, 4 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      risen(at, () => {
        glass(X(x), Y(y), X(w), Y(h), 16 * u);
        const pad = 10 * u;
        const rows = 4;
        const th = (Y(h) - pad * (rows + 1)) / rows;
        for (let i = 0;i < rows; i++) {
          const q = progress(t, at + 0.2 + i / rows * dur * 0.7, 0.3);
          if (q <= 0)
            continue;
          ctx.globalAlpha = q;
          ctx.fillStyle = "rgba(255,255,255,0.18)";
          ctx.strokeStyle = "rgba(255,255,255,0.4)";
          ctx.lineWidth = 1 * u;
          ctx.beginPath();
          ctx.roundRect(X(x) + pad, Y(y) + pad + i * (th + pad), X(w) - pad * 2, th, 8 * u);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = i % 2 ? TONE9.accent : "#5CD8FF";
          ctx.beginPath();
          ctx.arc(X(x) + pad * 2.2, Y(y) + pad + i * (th + pad) + th / 2, 4 * u, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      risen(at, () => {
        const value = count ? counting(t, at, dur, count) + s : s;
        if (sub) {
          const w = size * 2.9 * u;
          const h = size * 1.9 * u;
          glass(X(x) - w / 2, Y(y) - h / 2, w, h, 20 * u);
          ctx.font = `600 ${Math.round(size * 0.2 * u)}px ${SANS3}`;
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(sub.toUpperCase(), X(x) - w / 2 + size * 0.3 * u, Y(y) - h / 2 + size * 0.32 * u);
        }
        ctx.font = `800 ${Math.round(size * u)}px ${SANS3}`;
        const col = tone === "good" ? TONE9.good : "#FFFFFF";
        ctx.fillStyle = col;
        ctx.shadowColor = alpha(tone === "ink" ? "#FFFFFF" : TONE9[tone], 0.6);
        ctx.shadowBlur = 20 * u;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(value, X(x), Y(y) + (sub ? size * 0.15 * u : 0));
      });
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 22) * u;
      const s = spring(t, { start: o.at ?? 0, stiffness: 260, damping: 13 });
      if (s <= 0)
        return;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
      const col = kind === "check" ? TONE9.good : TONE9.bad;
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 16 * u;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = r * 0.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (kind === "check")
        trace(ctx, [
          [cx - r * 0.42, cy],
          [cx - r * 0.1, cy + r * 0.32],
          [cx + r * 0.45, cy - r * 0.3]
        ]);
      else
        trace(ctx, [
          [cx - r * 0.35, cy - r * 0.35],
          [cx + r * 0.35, cy + r * 0.35],
          [cx, cy],
          [cx + r * 0.35, cy - r * 0.35],
          [cx - r * 0.35, cy + r * 0.35]
        ]);
      ctx.stroke();
      ctx.restore();
    },
    finish() {}
  };
}
var glassmorphism_default = {
  id: "glassmorphism",
  name: "Frosted glass",
  category: "Dimensional",
  make: make25
};

// plugin/skills/motion-graphics/styles/gouache-poster.ts
var CREAM5 = "#F1E8D2";
var NAVY2 = "#1F3446";
var FILL2 = {
  ink: NAVY2,
  accent: "#E8623A",
  good: "#2F7476",
  bad: "#D9705E",
  muted: "#8FB9B4"
};
var BLOCK = '"Bebas Neue", "Oswald", "League Gothic", "Impact", "Arial Narrow", sans-serif';
function make26(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__gouache ??= new Map;
  const cache = g.__gouache;
  function streaks() {
    const key = `streak:${W}x${H}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      for (let i = 0;i < 1600; i++) {
        const y = hash(i * 1.9) * H;
        const x = hash(i * 3.1) * W;
        c.fillStyle = hash(i * 7.7) > 0.5 ? "rgba(255,250,235,0.07)" : "rgba(30,30,20,0.05)";
        c.fillRect(x, y, (40 + hash(i * 5.3) * 260) * u, Math.max(1, (1 + hash(i) * 2) * u));
      }
      cache.set(key, tile);
    }
    ctx.drawImage(tile, 0, 0);
  }
  function sweep(x0, x1, y0, y1, at, dur, shape, color) {
    const p = progress(t, at, dur);
    if (p <= 0)
      return false;
    const e = 1 - (1 - p) ** 2;
    const edge = x0 + (x1 - x0 + 30 * u) * e;
    ctx.save();
    ctx.beginPath();
    if (p >= 1) {
      shape();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
      return true;
    }
    const rows = 14;
    ctx.moveTo(x0 - 30 * u, y0 - 4 * u);
    for (let i = 0;i <= rows; i++) {
      const yy = y0 - 4 * u + (y1 - y0 + 8 * u) * i / rows;
      ctx.lineTo(edge - hash(i * 3.7 + x0) * 28 * u * (1 - p * 0.6), yy);
    }
    ctx.lineTo(x0 - 30 * u, y1 + 4 * u);
    ctx.closePath();
    ctx.clip();
    shape();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    return p >= 1;
  }
  function caps(s, x, y, size, color, align = "left") {
    ctx.font = `400 ${Math.round(size * u)}px ${BLOCK}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s.toUpperCase(), x, y);
    return ctx.measureText(s.toUpperCase()).width;
  }
  function painted(s, x, y, size, o) {
    const { at = 0, tone = "ink", align = "left" } = o;
    const dur = o.dur ?? 0.03 * s.length + 0.2;
    if (t < at)
      return 0;
    ctx.save();
    ctx.font = `400 ${Math.round(size * u)}px ${BLOCK}`;
    const w = ctx.measureText(s.toUpperCase()).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    const h = size * u;
    const p = progress(t, at, dur);
    ctx.beginPath();
    const edge = left + (w + 30 * u) * (1 - (1 - p) ** 2);
    for (let i = 0;i <= 10; i++)
      ctx.lineTo(edge - hash(i * 2.1 + x) * 20 * u * (1 - p), y - h + h * 2 * i / 10);
    ctx.lineTo(left - 20 * u, y + h);
    ctx.lineTo(left - 20 * u, y - h);
    ctx.closePath();
    ctx.clip();
    caps(s, left, y, size, FILL2[tone], "left");
    ctx.restore();
    return w;
  }
  function burst(cx, cy, r, at, color) {
    const p = progress(t, at, 0.25);
    if (p <= 0)
      return;
    const k = 1.25 - 0.25 * p;
    const n = 14;
    const pts = Array.from({ length: n * 2 }, (_, i) => {
      const a = i / (n * 2) * Math.PI * 2 + 0.1;
      const rr = (i % 2 ? r * 0.74 : r) * k;
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    });
    ctx.save();
    ctx.globalAlpha = clamp(p * 2);
    trace(ctx, pts, true);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }
  return {
    surface() {
      const bands = [
        [0, "#A9CDC6"],
        [0.28, "#94C0B9"],
        [0.5, "#86B5AE"]
      ];
      for (const [y, c] of bands) {
        ctx.fillStyle = c;
        ctx.fillRect(0, Y(y), W, H);
      }
      const ridge = (base, amp, color, s) => {
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let i = 0;i <= 24; i++) {
          const x = i / 24 * W;
          ctx.lineTo(x, Y(base) - amp * H * (0.5 + 0.5 * Math.sin(i * 0.5 + s) * Math.cos(i * 0.21 + s)));
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      };
      ridge(0.68, 0.1, "#6FA39E", 1);
      ridge(0.78, 0.06, "#4E8A88", 3.4);
      ctx.fillStyle = "#3E7A7B";
      ctx.fillRect(0, Y(0.84), W, H);
      ctx.fillStyle = NAVY2;
      ctx.fillRect(0, Y(0.9), W, H);
      streaks();
      const b = 12 * u;
      ctx.fillStyle = CREAM5;
      ctx.fillRect(0, 0, W, b);
      ctx.fillRect(0, H - b, W, b);
      ctx.fillRect(0, 0, b, H);
      ctx.fillRect(W - b, 0, b, H);
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 70, at = 0, tone = "ink", align = "left" } = o;
      painted(s, X(x), Y(y), size, { at, dur: o.dur, tone, align });
    },
    label(s, x, y, o = {}) {
      const size = o.size ?? 36;
      const at = o.at ?? 0;
      if (t >= at) {
        ctx.save();
        ctx.font = `400 ${Math.round(size * u)}px ${BLOCK}`;
        const w = ctx.measureText(s.toUpperCase()).width + size * 0.6 * u;
        const align = o.align ?? "center";
        const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x) - size * 0.3 * u;
        const hh = size * 0.62 * u;
        sweep(left, left + w, Y(y) - hh, Y(y) + hh, at, 0.25, () => ctx.rect(left, Y(y) - hh, w, hh * 2), CREAM5);
        ctx.restore();
      }
      painted(s, X(x), Y(y), size, {
        at: o.at ?? 0,
        dur: o.dur,
        tone: o.tone ?? "ink",
        align: o.align ?? "center"
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.25, tone = "accent" } = o;
      const R = r * u;
      const [cx, cy] = [X(x), Y(y)];
      const done = sweep(cx - R, cx + R, cy - R, cy + R, at, dur, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
      }, FILL2[tone]);
      if (!done)
        return;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.68, 0, Math.PI * 2);
      ctx.fillStyle = CREAM5;
      ctx.fill();
      const a = -Math.PI / 2 + (hash(x * 13 + y * 7) - 0.5) * 2.4;
      ctx.strokeStyle = NAVY2;
      ctx.lineWidth = 4 * u;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55);
      ctx.stroke();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.4, tone = "ink" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      sweep(x0, x1, y0 + 8 * u, y1 + 8 * u, at, dur, () => ctx.rect(x0 + 8 * u, y0 + 8 * u, x1 - x0, y1 - y0), FILL2[tone === "ink" ? "muted" : tone]);
      sweep(x0, x1, y0, y1, at + 0.05, dur, () => ctx.rect(x0, y0, x1 - x0, y1 - y0), CREAM5);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const thin = !head && tone === "accent";
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * (1 - (1 - p) ** 2))));
      const color = FILL2[tone === "ink" ? "accent" : tone];
      ctx.save();
      ctx.lineJoin = "miter";
      ctx.lineCap = "butt";
      trace(ctx, shown);
      ctx.strokeStyle = thin ? "rgba(31,52,70,0.55)" : color;
      ctx.lineWidth = (thin ? 3 : 16) * u;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 30 * u;
        const tip = [end[0] + Math.cos(a) * s * 0.6, end[1] + Math.sin(a) * s * 0.6];
        trace(ctx, [
          tip,
          [end[0] + Math.cos(a + 1.9) * s * 0.75, end[1] + Math.sin(a + 1.9) * s * 0.75],
          [end[0] + Math.cos(a - 1.9) * s * 0.75, end[1] + Math.sin(a - 1.9) * s * 0.75]
        ], true);
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "good" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const r = (x1 - x0) / 2;
      const done = sweep(x0, x1, y0, y1, at, dur, () => {
        ctx.beginPath();
        ctx.moveTo(x0, y1);
        ctx.lineTo(x0, y0 + r);
        ctx.arc(x0 + r, y0 + r, r, Math.PI, 0);
        ctx.lineTo(x1, y1);
        ctx.closePath();
      }, FILL2[tone]);
      if (!done)
        return;
      ctx.fillStyle = "rgba(20,40,50,0.28)";
      ctx.fillRect(x0 + r * 1.3, y0 + r, r * 0.7, y1 - y0 - r);
      ctx.fillStyle = CREAM5;
      for (const f of [0.45, 0.62, 0.79])
        ctx.fillRect(x0, y0 + (y1 - y0) * f, x1 - x0, 3 * u);
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at)
        return;
      if (sub)
        burst(X(x), Y(y), size * 1.15 * u, at, FILL2.accent);
      const value = count ? counting(t, at, dur, count) + s : s;
      const color = sub ? NAVY2 : FILL2[tone === "good" ? "ink" : tone];
      ctx.save();
      ctx.globalAlpha = progress(t, at, 0.15);
      caps(value, X(x), Y(y), size, color, "center");
      if (sub)
        caps(sub, X(x), Y(y) + size * 0.62 * u, size * 0.3, CREAM5, "center");
      ctx.restore();
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 36) * u;
      const [cx, cy] = [X(x), Y(y)];
      const p = progress(t, o.at ?? 0, 0.2);
      if (p <= 0)
        return;
      ctx.save();
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      ctx.lineWidth = 9 * u;
      ctx.strokeStyle = FILL2[o.tone ?? (kind === "check" ? "good" : "ink")];
      ctx.beginPath();
      ctx.rect(cx - s, cy - s, s * 2 * p, s * 2);
      ctx.clip();
      if (kind === "check")
        trace(ctx, [
          [cx - s * 0.55, cy],
          [cx - s * 0.12, cy + s * 0.42],
          [cx + s * 0.65, cy - s * 0.55]
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.5, cy - s * 0.5);
        ctx.lineTo(cx + s * 0.5, cy + s * 0.5);
        ctx.moveTo(cx + s * 0.5, cy - s * 0.5);
        ctx.lineTo(cx - s * 0.5, cy + s * 0.5);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = "#3A2E1E";
      for (let i = 0;i < 1400; i++)
        ctx.fillRect(hash(i * 1.7) * W, hash(i * 2.9) * H, 1.5 * u, 1.5 * u);
      ctx.restore();
    }
  };
}
var gouache_poster_default = {
  id: "gouache-poster",
  name: "Painted travel poster",
  category: "Painterly",
  make: make26
};

// plugin/skills/motion-graphics/styles/holographic-foil.ts
var NAVY3 = "#1A1C33";
var TINT = { ink: 200, accent: 280, good: 140, bad: 350, muted: 230 };
var HEAVY2 = '"Avenir Next", "Futura", "Helvetica Neue", Arial, sans-serif';
function make27(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__holoIce ??= new Map;
  function ice() {
    const key = `${W}x${H}`;
    let tile = g.__holoIce.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      const s = 26 * u;
      for (let gy = -1;gy < H / s + 1; gy++) {
        for (let gx = -1;gx < W / s + 1; gx++) {
          const k = gx * 71 + gy * 131;
          const cx = (gx + hash(k)) * s;
          const cy = (gy + hash(k + 1)) * s;
          c.beginPath();
          for (let i = 0;i < 5; i++) {
            const a = i / 5 * Math.PI * 2 + hash(k + i) * 0.9;
            const r = s * (0.5 + hash(k + i * 3) * 0.5);
            i ? c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          }
          c.closePath();
          const v = Math.floor(hash(k + 9) * 255);
          c.fillStyle = `rgba(${v},${v},${v},0.55)`;
          c.fill();
        }
      }
      g.__holoIce.set(key, tile);
    }
    return tile;
  }
  function foil(x0, y0, x1, y1, hue = 260) {
    ctx.save();
    ctx.clip();
    const shift = t * 0.25;
    const gr = ctx.createLinearGradient(x0, y0, x1, y1);
    for (let i = 0;i <= 6; i++) {
      const h = hue + (i / 6 + shift) % 1 * 300;
      gr.addColorStop(i / 6, `hsl(${h % 360},85%,68%)`);
    }
    ctx.fillStyle = gr;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.globalCompositeOperation = "overlay";
    ctx.drawImage(ice(), 0, 0);
    ctx.globalCompositeOperation = "source-over";
    const sx = x0 + ((t * 0.4 + x0 / W * 0.3) % 1.6 - 0.3) * (x1 - x0);
    const sp = ctx.createLinearGradient(sx - 40 * u, y0, sx + 40 * u, y1);
    sp.addColorStop(0, "rgba(255,255,255,0)");
    sp.addColorStop(0.5, "rgba(255,255,255,0.55)");
    sp.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sp;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }
  function rounded(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }
  function foilText(s, x, y, size, align = "center", hue = 260, plain = false) {
    ctx.save();
    ctx.font = `800 ${Math.round(size * u)}px ${HEAVY2}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.14 * u;
    ctx.strokeStyle = plain ? "#F4F4FA" : "#15162A";
    ctx.strokeText(s, x, y);
    if (plain) {
      ctx.fillStyle = "#15162A";
      ctx.fillText(s, x, y);
    } else {
      const gr = ctx.createLinearGradient(left, y - size * 0.5 * u, left + w, y + size * 0.5 * u);
      for (let i = 0;i <= 6; i++)
        gr.addColorStop(i / 6, `hsl(${(hue + (i / 6 + t * 0.3) % 1 * 300) % 360},90%,70%)`);
      ctx.fillStyle = gr;
      ctx.fillText(s, x, y);
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, y - size * u, w, size * 0.45 * u);
      ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillText(s, x, y);
      ctx.restore();
    }
    ctx.restore();
  }
  function dealt(cx, cy, at, k, draw) {
    const p = expo(progress(t, at, 0.5));
    if (p <= 0)
      return;
    ctx.save();
    ctx.translate(cx - (1 - p) * W * 0.35, cy + (1 - p) * H * 0.25);
    ctx.rotate((1 - p) * -0.9 + (hash(k) - 0.5) * 0.05);
    ctx.translate(-cx, -cy);
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 18 * u;
    ctx.shadowOffsetY = 8 * u;
    draw();
    ctx.restore();
  }
  function slapped(cx, cy, at, draw) {
    const s = spring(t, { start: at, stiffness: 380, damping: 15 });
    if (s <= 0)
      return;
    ctx.save();
    ctx.translate(cx, cy);
    const k = 1.6 - 0.6 * s;
    ctx.scale(k, k);
    ctx.globalAlpha = clamp(s * 3);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }
  return {
    surface() {
      ctx.fillStyle = "#17171C";
      ctx.fillRect(0, 0, W, H);
      const lamp = ctx.createRadialGradient(W * 0.35, H * 0.3, 0, W * 0.35, H * 0.3, W * 0.8);
      lamp.addColorStop(0, "rgba(90,90,110,0.45)");
      lamp.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = lamp;
      ctx.fillRect(0, 0, W, H);
      const sx = W * (0.5 + Math.sin(t * 0.4) * 0.2);
      const sp = ctx.createRadialGradient(sx, H * 0.85, 0, sx, H * 0.85, W * 0.4);
      sp.addColorStop(0, `hsla(${t * 40 % 360},80%,60%,0.08)`);
      sp.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sp;
      ctx.fillRect(0, 0, W, H);
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.05, size = 40, at = 0 } = o;
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${HEAVY2}`;
      const w = ctx.measureText(s).width + 40 * u;
      ctx.restore();
      const h = size * 1.6 * u;
      const [x0, y0] = [X(x), Y(y)];
      slapped(x0 + w / 2, y0 + h / 2, at, () => {
        rounded(x0 - 4 * u, y0 - 4 * u, w + 8 * u, h + 8 * u, 14 * u);
        ctx.fillStyle = "#F4F4FA";
        ctx.fill();
        rounded(x0, y0, w, h, 11 * u);
        foil(x0, y0, x0 + w, y0 + h, 180);
        foilText(s, x0 + 20 * u, y0 + h / 2, size, "left", 0, true);
      });
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, align = "center", tone = "ink" } = o;
      slapped(X(x), Y(y), at, () => {
        ctx.save();
        ctx.font = `800 ${Math.round(size * u)}px ${HEAVY2}`;
        const w = ctx.measureText(s).width + 26 * u;
        ctx.restore();
        const h = size * 1.45 * u;
        const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
        rounded(left - 3 * u, Y(y) - h / 2 - 3 * u, w + 6 * u, h + 6 * u, 10 * u);
        ctx.fillStyle = "#F4F4FA";
        ctx.fill();
        rounded(left, Y(y) - h / 2, w, h, 8 * u);
        foil(left, Y(y) - h / 2, left + w, Y(y) + h / 2, TINT[tone]);
        foilText(s, left + w / 2, Y(y), size, "center", 0, true);
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const R = r * u;
      const [cx, cy] = [X(x), Y(y)];
      slapped(cx, cy, at, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, R + 3 * u, 0, Math.PI * 2);
        ctx.fillStyle = "#F4F4FA";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        foil(cx - R, cy - R, cx + R, cy + R, TINT[tone]);
      });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      dealt(x0 + bw / 2, y0 + bh / 2, at, x * 9, () => {
        rounded(x0, y0, bw, bh, 12 * u);
        foil(x0, y0, x0 + bw, y0 + bh, TINT[tone]);
        ctx.shadowColor = "transparent";
        rounded(x0 + 9 * u, y0 + 9 * u, bw - 18 * u, bh - 18 * u, 8 * u);
        ctx.fillStyle = NAVY3;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1 * u;
        ctx.stroke();
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      if (!head) {
        const p = progress(t, at, dur);
        if (p <= 0)
          return;
        const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
        ctx.save();
        trace(ctx, pts.slice(0, Math.max(2, Math.round(pts.length * p))));
        ctx.strokeStyle = `hsla(${(TINT[tone] + x1 * 400 + t * 60) % 360},80%,75%,0.6)`;
        ctx.lineWidth = 1.5 * u;
        ctx.stroke();
        ctx.restore();
        return;
      }
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 24);
      const mid = pts[12];
      slapped(mid[0], mid[1], at, () => {
        const end = pts.at(-1);
        const prev = pts.at(-4);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const hs = 22 * u;
        const base = [end[0] - Math.cos(a) * hs, end[1] - Math.sin(a) * hs];
        const shaft = pts.filter((p) => Math.hypot(p[0] - end[0], p[1] - end[1]) > hs);
        const outline = () => {
          trace(ctx, [...shaft, base]);
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
        };
        const head = () => {
          ctx.beginPath();
          ctx.moveTo(end[0], end[1]);
          ctx.lineTo(base[0] + Math.cos(a + Math.PI / 2) * hs * 0.8, base[1] + Math.sin(a + Math.PI / 2) * hs * 0.8);
          ctx.lineTo(base[0] - Math.cos(a + Math.PI / 2) * hs * 0.8, base[1] - Math.sin(a + Math.PI / 2) * hs * 0.8);
          ctx.closePath();
        };
        outline();
        ctx.strokeStyle = "#F4F4FA";
        ctx.lineWidth = 18 * u;
        ctx.stroke();
        head();
        ctx.lineWidth = 6 * u;
        ctx.stroke();
        ctx.fillStyle = "#F4F4FA";
        ctx.fill();
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const bx0 = Math.min(...xs) - hs;
        const by0 = Math.min(...ys) - hs;
        const bx1 = Math.max(...xs) + hs;
        const by1 = Math.max(...ys) + hs;
        outline();
        ctx.save();
        ctx.lineWidth = 10 * u;
        const gr = ctx.createLinearGradient(bx0, by0, bx1, by1);
        for (let i = 0;i <= 6; i++)
          gr.addColorStop(i / 6, `hsl(${(TINT[tone] + (i / 6 + t * 0.3) % 1 * 300) % 360},85%,66%)`);
        ctx.strokeStyle = gr;
        ctx.stroke();
        ctx.restore();
        head();
        foil(bx0, by0, bx1, by1, TINT[tone]);
      });
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      for (let i = 0;i < 4; i++) {
        const ox = (hash(i * 3) - 0.5) * 10 * u - i * 3 * u;
        const oy = -i * 4 * u;
        dealt(x0 + bw / 2 + ox, y0 + bh / 2 + oy, at + i * 0.12, i + 4, () => {
          rounded(x0 + ox, y0 + oy, bw, bh, 9 * u);
          foil(x0 + ox, y0 + oy, x0 + ox + bw, y0 + oy + bh, TINT[tone] + i * 30);
          ctx.shadowColor = "transparent";
          rounded(x0 + ox + 6 * u, y0 + oy + bh * 0.62, bw - 12 * u, bh * 0.3, 4 * u);
          ctx.fillStyle = "#EDEDF4";
          ctx.fill();
        });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      if (sub) {
        const bw = size * 3 * u;
        const bh = size * 2.1 * u;
        const [x0, y0] = [X(x) - bw / 2, Y(y) - bh * 0.6];
        dealt(X(x), Y(y), at, 3, () => {
          rounded(x0, y0, bw, bh, 12 * u);
          foil(x0, y0, x0 + bw, y0 + bh, TINT[tone]);
          ctx.shadowColor = "transparent";
          rounded(x0 + 8 * u, y0 + 8 * u, bw - 16 * u, bh - 16 * u, 8 * u);
          ctx.fillStyle = NAVY3;
          ctx.fill();
          foilText(sub.toUpperCase(), X(x), y0 + bh * 0.22, size * 0.3, "center", TINT[tone]);
          foilText(value, X(x), Y(y) + size * 0.12 * u, size, "center", TINT[tone]);
        });
      } else if (t >= at) {
        ctx.save();
        ctx.globalAlpha = expo(progress(t, at, 0.3));
        foilText(value, X(x), Y(y), size, "center", TINT[tone]);
        ctx.restore();
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 34 } = o;
      const r = size * u;
      const [cx, cy] = [X(x), Y(y)];
      slapped(cx, cy, at, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4 * u, 0, Math.PI * 2);
        ctx.fillStyle = "#F4F4FA";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = kind === "check" ? "#1FA463" : "#E5304A";
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 6 * u;
        ctx.lineCap = "round";
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.45, cy],
            [cx - r * 0.1, cy + r * 0.35],
            [cx + r * 0.5, cy - r * 0.35]
          ]);
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
    finish() {
      for (let i = 0;i < 30; i++) {
        const a = clamp(Math.sin(t * 3 + i * 1.7) * 2 - 1);
        if (a <= 0)
          continue;
        ctx.fillStyle = `hsla(${i * 47 % 360},90%,85%,${a * 0.8})`;
        ctx.fillRect(hash(i * 2.1) * W, hash(i * 3.3) * H, 2.5 * u, 2.5 * u);
      }
    }
  };
}
var holographic_foil_default = {
  id: "holographic-foil",
  name: "Holo foil cards",
  category: "Light & Imaging",
  make: make27
};

// plugin/skills/motion-graphics/styles/illuminated.ts
var INK4 = {
  ink: "#3B2414",
  accent: "#B8321F",
  good: "#2F7A4B",
  bad: "#C2331E",
  muted: "#7A6650"
};
var LAPIS = "#24448F";
var ROSE = "#B0526E";
var VELLUM = "#EADBB4";
var BOOK = '"Luminari", "Palatino", "Book Antiqua", "Georgia", serif';
var INITIAL = '"Palatino", "Book Antiqua", "Georgia", serif';
function make28(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__illum ??= new Map;
  const cache = g.__illum;
  let quill = null;
  function gold(x0, y0, x1, y1) {
    const gr = ctx.createLinearGradient(x0, y0, x1, y1);
    const s = t * 0.35 % 1;
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
      for (let i = 0;i < 30; i++) {
        b.fillStyle = hash(i) > 0.5 ? "rgba(255,248,225,0.22)" : "rgba(170,130,70,0.07)";
        b.beginPath();
        b.ellipse(hash(i + 1) * W, hash(i + 2) * H, (60 + hash(i + 3) * 160) * u, (40 + hash(i + 4) * 100) * u, hash(i) * 3, 0, Math.PI * 2);
        b.fill();
      }
      b.filter = "none";
      const vg = b.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      vg.addColorStop(0, "rgba(120,80,30,0)");
      vg.addColorStop(1, "rgba(120,80,30,0.3)");
      b.fillStyle = vg;
      b.fillRect(0, 0, W, H);
      for (let y = H * 0.18;y < H * 0.92; y += 32 * u) {
        b.fillStyle = "rgba(150,90,60,0.08)";
        b.fillRect(W * 0.04, y, W * 0.93, u);
      }
      const bx = W * 0.012;
      b.fillStyle = ROSE;
      b.fillRect(bx, H * 0.03, 5 * u, H * 0.94);
      b.fillStyle = LAPIS;
      b.fillRect(bx + 5 * u, H * 0.03, 5 * u, H * 0.94);
      const vine = (pts) => {
        b.strokeStyle = "#5A4630";
        b.lineWidth = 1.5 * u;
        trace(b, pts);
        b.stroke();
        pts.forEach(([x, y], i) => {
          if (i % 3)
            return;
          const col = ["#2F7A4B", "#B8321F", LAPIS, ROSE][i % 4];
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
      vine(Array.from({ length: 60 }, (_, i) => [bx + 18 * u + Math.sin(i * 0.7) * 5 * u, H * 0.04 + i / 59 * H * 0.92]));
      vine(Array.from({ length: 90 }, (_, i) => [W * 0.04 + i / 89 * W * 0.92, H * 0.965 + Math.sin(i * 0.7) * 4 * u]));
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  function pen(points, { at = 0, dur = 0.5, tone = "ink", width = 2.4 } = {}) {
    const p = progress(t, at, dur);
    if (p <= 0)
      return;
    const { points: drawn } = along(points, p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK4[tone];
    ctx.lineWidth = width * u;
    trace(ctx, drawn);
    ctx.stroke();
    ctx.restore();
    if (p < 1)
      quill = drawn.at(-1);
  }
  function write(s, x, y, o = {}) {
    const { at = 0, size = 30, tone = "ink", align = "left" } = o;
    const dur = o.dur ?? 0.05 * s.length + 0.1;
    const p = progress(t, at, dur);
    if (p <= 0)
      return 0;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${BOOK}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const px = o.px ?? X(x);
    const left = align === "center" ? px - w / 2 : align === "right" ? px - w : px;
    ctx.beginPath();
    ctx.rect(left - 4 * u, Y(y) - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = INK4[tone];
    ctx.fillText(s, left, Y(y));
    ctx.restore();
    if (p < 1)
      quill = [left + w * p, Y(y)];
    return w;
  }
  function filigree(x0, y0, w, h, seed, a) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 0.9 * u;
    for (let i = 0;i < 10; i++) {
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
      if (p <= 0)
        return;
      const S = size * 1.7 * u;
      const bx = X(x);
      const by = Y(y) - S * 0.55;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.fillStyle = LAPIS;
      trace(ctx, [
        [bx, by],
        [bx + S, by],
        [bx, by + S]
      ], true);
      ctx.fill();
      ctx.fillStyle = ROSE;
      trace(ctx, [
        [bx + S, by],
        [bx + S, by + S],
        [bx, by + S]
      ], true);
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
      if (t < at)
        return;
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
      if (t < at)
        return;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const col = tone === "good" || tone === "ink" ? "accent" : tone;
      const fill = progress(t, at + dur, 0.3);
      if (fill > 0) {
        ctx.save();
        ctx.globalAlpha = fill;
        ctx.fillStyle = "rgba(250,240,212,0.85)";
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.restore();
      }
      pen([
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0]
      ], { at, dur, tone: col, width: 2.6 });
      const d = 5 * u;
      pen([
        [x0 + d, y0 + d],
        [x1 - d, y0 + d],
        [x1 - d, y1 - d],
        [x0 + d, y1 - d],
        [x0 + d, y0 + d]
      ], { at: at + 0.1, dur, tone: col, width: 1 });
      if (fill > 0)
        for (const [cx, cy] of [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1]
        ]) {
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
      if (!head || t < at + dur)
        return;
      const end = shaft.at(-1);
      const prev = shaft.at(-3);
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 14 * u;
      ctx.save();
      ctx.fillStyle = INK4[tone];
      trace(ctx, [
        end,
        [end[0] - Math.cos(a - 0.4) * s, end[1] - Math.sin(a - 0.4) * s],
        [end[0] - Math.cos(a) * s * 0.6, end[1] - Math.sin(a) * s * 0.6],
        [end[0] - Math.cos(a + 0.4) * s, end[1] - Math.sin(a + 0.4) * s]
      ], true);
      ctx.fill();
      const s0 = shaft[0];
      ctx.strokeStyle = INK4[tone];
      ctx.lineWidth = 1.2 * u;
      ctx.beginPath();
      ctx.arc(s0[0], s0[1] - 4 * u, 4 * u, Math.PI * 0.5, Math.PI * 2.2);
      ctx.stroke();
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      if (t < at)
        return;
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
      for (const f of [0.45, 0.75])
        ctx.fillRect(x0, y0 + lid + (bh - lid) * f, bw, 5 * u);
      ctx.strokeStyle = "#5A3A10";
      ctx.lineWidth = 1.4 * u;
      ctx.strokeRect(x0, y0 + lid, bw, bh - lid);
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      if (size >= 80) {
        const rp = expo(progress(t, at + dur, 0.5));
        if (rp > 0) {
          ctx.strokeStyle = "#C99A3A";
          ctx.lineWidth = 2 * u;
          for (let i = 0;i < 28; i++) {
            const a = i / 28 * Math.PI * 2;
            const r0 = size * 0.85 * u;
            const r1 = r0 + (14 + hash(i) * 26) * u * rp;
            trace(ctx, [
              [cx + Math.cos(a) * r0 * 1.4, cy + Math.sin(a) * r0],
              [cx + Math.cos(a) * r1 * 1.4, cy + Math.sin(a) * r1]
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
        write(sub, x, y - size * 0.8 * u / H, {
          at: at + 0.2,
          size: size * 0.32,
          align: "center",
          tone: "accent"
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 32) * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check")
        pen([
          [cx - s * 0.5, cy],
          [cx - s * 0.1, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5]
        ], { dur: 0.25, tone: "good", width: 4, ...o });
      else {
        const at = o.at ?? 0;
        pen([
          [cx - s * 0.5, cy - s * 0.5],
          [cx + s * 0.5, cy + s * 0.5]
        ], { dur: 0.12, tone: "bad", width: 4, ...o });
        pen([
          [cx + s * 0.5, cy - s * 0.5],
          [cx - s * 0.5, cy + s * 0.5]
        ], { dur: 0.12, tone: "bad", width: 4, ...o, at: at + 0.12 });
      }
    },
    finish() {
      const q = quill;
      if (!q)
        return;
      const [x, y] = q;
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
        [200 * u, -10 * u]
      ]);
      ctx.stroke();
      ctx.strokeStyle = "#3B2414";
      trace(ctx, [
        [0, 0],
        [10 * u, -0.5 * u]
      ]);
      ctx.stroke();
      ctx.restore();
    }
  };
}
var illuminated_default = {
  id: "illuminated",
  name: "Illuminated manuscript",
  category: "Illustration",
  make: make28
};

// plugin/skills/motion-graphics/styles/impasto-oil.ts
var PAINT = {
  ink: ["#2A2E44", "#EDE3C4", "#FFFBEA"],
  accent: ["#6B4A0E", "#F2C230", "#FFF0A0"],
  good: ["#1E4A2A", "#7CC36A", "#D6F5B8"],
  bad: ["#5A140E", "#E0432B", "#FFB08E"],
  muted: ["#232B4A", "#8FA3C8", "#D5E0F2"]
};
var FACE2 = '"Cooper Black", "Rockwell Extra Bold", "Bookman Old Style", Georgia, serif';
function make29(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__impastoSky ??= new Map;
  const cache = g.__impastoSky;
  let seed = 5;
  function flow(x, y) {
    let a = Math.sin(y / (H * 0.08) + x / (W * 0.3)) * 0.35;
    for (const [cx, cy, r] of [
      [0.3, 0.15, 0.16],
      [0.82, 0.22, 0.12],
      [0.55, 0.45, 0.1]
    ]) {
      const dx = x - cx * W;
      const dy = y - cy * H;
      const d = Math.hypot(dx, dy) / (r * Math.min(W, H) * 2.2);
      if (d < 1.4)
        a = lerpA(a, Math.atan2(dy, dx) + Math.PI / 2, clamp(1.4 - d));
    }
    return a;
  }
  function sky() {
    const key = `${W}x${H}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      c.fillStyle = "#1E3A7A";
      c.fillRect(0, 0, W, H);
      c.lineCap = "round";
      const blues = ["#14265A", "#1D3A80", "#2A55A6", "#3A6CBE", "#6F9AD8", "#A9C8EC", "#E2EEFA"];
      const greens = ["#1E4A2C", "#2F6B3A", "#4C8A44", "#173A26", "#6FA455"];
      const n = Math.floor(W * H / (150 * u * u));
      for (let i = 0;i < n; i++) {
        const x = hash(i * 1.1) * W;
        const y = hash(i * 2.3 + 7) * H;
        const hill = H * (0.83 + Math.sin(x / (W * 0.18)) * 0.04 + Math.sin(x / (W * 0.07)) * 0.015);
        const inHill = y > hill;
        const a = inHill ? Math.sin(x / (W * 0.1)) * 0.25 : flow(x, y);
        const l = (18 + hash(i * 3.3) * 22) * u;
        const w = (6 + hash(i * 5.1) * 4) * u;
        const pal = inHill ? greens : blues;
        const band = Math.sin(y / (H * 0.035) + Math.sin(x / (W * 0.12)) * 2 + a * 2) * 0.5 + 0.5;
        const pick = inHill ? hash(i * 4.7) * pal.length : clamp(band * 0.75 + hash(i * 4.7) * 0.35) * 5.99 + (hash(i * 9.1) > 0.95 ? 1 : 0);
        const col = pal[Math.floor(pick)] ?? pal[0];
        const [dx, dy] = [Math.cos(a) * l / 2, Math.sin(a) * l / 2];
        c.lineWidth = w;
        c.strokeStyle = "rgba(10,18,40,0.45)";
        c.beginPath();
        c.moveTo(x - dx + w * 0.25, y - dy + w * 0.3);
        c.lineTo(x + dx + w * 0.25, y + dy + w * 0.3);
        c.stroke();
        c.strokeStyle = col;
        c.beginPath();
        c.moveTo(x - dx, y - dy);
        c.lineTo(x + dx, y + dy);
        c.stroke();
        c.lineWidth = w * 0.3;
        c.strokeStyle = "rgba(255,255,255,0.22)";
        c.beginPath();
        c.moveTo(x - dx - w * 0.2, y - dy - w * 0.25);
        c.lineTo(x + dx - w * 0.2, y + dy - w * 0.25);
        c.stroke();
      }
      cache.set(key, tile);
    }
    ctx.drawImage(tile, 0, 0);
  }
  function daub(points, { at = 0, dur = 0.5, tone = "accent", width = 14 } = {}) {
    seed += 1;
    const p = progress(t, at, dur);
    if (p <= 0)
      return null;
    const { points: drawn, angle } = along(roughen(points, 1.4 * u, seed * 5.7), 1 - (1 - p) ** 2);
    const [dark, body, hi] = PAINT[tone];
    const w = width * u;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.translate(w * 0.14, w * 0.18);
    trace(ctx, drawn);
    ctx.strokeStyle = dark;
    ctx.lineWidth = w * 1.15;
    ctx.stroke();
    ctx.translate(-w * 0.14, -w * 0.18);
    trace(ctx, drawn);
    ctx.strokeStyle = body;
    ctx.lineWidth = w;
    ctx.stroke();
    for (const [off, col, lw] of [
      [0.22, "rgba(0,0,0,0.16)", 0.12],
      [-0.2, hi, 0.22],
      [-0.32, "rgba(255,255,255,0.5)", 0.08]
    ]) {
      ctx.save();
      ctx.translate(off * w * 0.6, off * w);
      trace(ctx, drawn);
      ctx.strokeStyle = col;
      ctx.lineWidth = w * lw;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    return { end: drawn.at(-1), angle, done: p >= 1 };
  }
  function letters(s, x, y, size, o = {}) {
    const { at = 0, tone = "accent", align = "left" } = o;
    const dur = o.dur ?? 0.03 * s.length + 0.2;
    const p = progress(t, at, dur);
    if (p <= 0)
      return 0;
    const [dark, body, hi] = PAINT[tone];
    ctx.save();
    ctx.font = `italic 900 ${Math.round(size * u)}px ${FACE2}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 10 * u, y - size * u, (w + 20 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, size * 0.14 * u);
    ctx.strokeStyle = dark;
    ctx.strokeText(s, left + size * 0.04 * u, y + size * 0.05 * u);
    ctx.fillStyle = dark;
    ctx.fillText(s, left + size * 0.04 * u, y + size * 0.05 * u);
    const gr = ctx.createLinearGradient(0, y - size * 0.5 * u, 0, y + size * 0.5 * u);
    gr.addColorStop(0, hi);
    gr.addColorStop(0.45, body);
    gr.addColorStop(1, body);
    ctx.fillStyle = gr;
    ctx.fillText(s, left, y);
    ctx.restore();
    return w;
  }
  function rings(cx, cy, R, at, tone, k) {
    for (let i = 0;i < k; i++) {
      const r = R * (1 - i * 0.3);
      if (r <= 2 * u)
        break;
      daub(ellipse(cx, cy, r, r, 30, -Math.PI / 2 + i, 0.95), {
        at: at + i * 0.08,
        dur: 0.3,
        tone: i === 1 ? "bad" : tone,
        width: Math.max(4, R / u / 6)
      });
    }
  }
  return {
    surface() {
      sky();
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.08, size = 56, at = 0, tone = "accent", align = "left" } = o;
      letters(s, X(x), Y(y), size, { at, dur: o.dur, tone, align });
    },
    label(s, x, y, o = {}) {
      letters(s, X(x), Y(y), o.size ?? 34, {
        at: o.at ?? 0,
        dur: o.dur,
        tone: o.tone === "accent" ? "accent" : o.tone ?? "ink",
        align: o.align ?? "center"
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const R = r * u;
      const p = progress(t, at, 0.4);
      if (p <= 0)
        return;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + x * 10);
      const gr = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), R * 2.2);
      gr.addColorStop(0, `rgba(255,236,150,${0.35 * p})`);
      gr.addColorStop(0.6, `rgba(255,236,150,${0.1 * p * (0.6 + 0.4 * pulse)})`);
      gr.addColorStop(1, "rgba(255,236,150,0)");
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R * 2.2, 0, Math.PI * 2);
      ctx.fill();
      rings(X(x), Y(y), R, at, tone, 2);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "ink" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const p = progress(t, at, 0.3);
      if (p <= 0)
        return;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.fillStyle = "rgba(20,30,70,0.55)";
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
      const frameTone = tone === "good" ? "accent" : tone;
      daub([
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0 - 2 * u]
      ], { at, dur, tone: frameTone, width: 12 });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const light = !head && tone === "accent";
      const r = daub(pts, { at, dur, tone, width: light ? 4 : 11 });
      if (!r || !head || !r.done)
        return;
      const s = 24 * u;
      daub([
        [r.end[0] - Math.cos(r.angle - 0.5) * s, r.end[1] - Math.sin(r.angle - 0.5) * s],
        r.end,
        [r.end[0] - Math.cos(r.angle + 0.5) * s, r.end[1] - Math.sin(r.angle + 0.5) * s]
      ], { at: at + dur, dur: 0.12, tone, width: 10 });
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "accent" } = o;
      const n = 4;
      for (let i = 0;i < n; i++) {
        const a = at + dur / n * i;
        const p = progress(t, a, 0.25);
        if (p <= 0)
          continue;
        const cy = Y(y + h) - Y(h) / n * (i + 1) - (1 - p) * 30 * u;
        const cx = X(x) + (i % 2 ? 6 : -4) * u;
        const ch = Y(h) / n - 8 * u;
        ctx.save();
        ctx.fillStyle = "#3B2A1A";
        ctx.fillRect(cx + 4 * u, cy + 5 * u, X(w), ch);
        ctx.fillStyle = "#E9D9A8";
        ctx.fillRect(cx, cy, X(w), ch);
        ctx.fillStyle = i % 2 ? "#E08A3C" : "#C79A55";
        ctx.fillRect(cx + 6 * u, cy + 6 * u, X(w) - 12 * u, ch - 12 * u);
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillRect(cx + 6 * u, cy + 6 * u, X(w) - 12 * u, 3 * u);
        ctx.restore();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const w = letters(value, X(x), Y(y), size, { at, dur: 0.15, tone, align: "center" });
      if (sub)
        letters(sub, X(x), Y(y) + size * 0.95 * u, size * 0.36, {
          at: at + 0.3,
          tone: "ink",
          align: "center"
        });
      if (sub && count) {
        const rx = w / 2 + size * 0.35 * u;
        daub(ellipse(X(x), Y(y), rx, size * 0.6 * u, 40, -Math.PI * 0.8, 1.02), {
          at: at + dur,
          dur: 0.45,
          tone: "accent",
          width: 9
        });
      }
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const [cx, cy] = [X(x), Y(y)];
      const at = o.at ?? 0;
      if (kind === "check") {
        daub([
          [cx - s * 0.5, cy],
          [cx - s * 0.12, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5]
        ], { at, dur: 0.3, tone: o.tone ?? "good", width: 11 });
      } else {
        daub([
          [cx - s * 0.5, cy - s * 0.5],
          [cx + s * 0.5, cy + s * 0.5]
        ], { at, dur: 0.15, tone: o.tone ?? "bad", width: 11 });
        daub([
          [cx + s * 0.5, cy - s * 0.5],
          [cx - s * 0.5, cy + s * 0.5]
        ], { at: at + 0.15, dur: 0.15, tone: o.tone ?? "bad", width: 11 });
      }
    },
    finish() {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = "#FFFFFF";
      const s = 6 * u;
      for (let y = 0;y < H; y += s * 2)
        ctx.fillRect(0, y, W, Math.max(1, u));
      ctx.restore();
    }
  };
}
function lerpA(a, b, f) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * f;
}
var impasto_oil_default = {
  id: "impasto-oil",
  name: "Swirling oil",
  category: "Painterly",
  make: make29
};

// plugin/skills/motion-graphics/styles/isometric.ts
var NAVY4 = "#33365E";
var FACES3 = {
  ink: ["#D9D8F5", "#A9A7DE", "#8B88C9"],
  accent: ["#FF8A7A", "#F2665A", "#D94F47"],
  good: ["#A6EBD2", "#6CCFAE", "#4FB592"],
  bad: ["#FF9AA6", "#EF5A6E", "#D04458"],
  muted: ["#ECEBF5", "#CFCDE3", "#B8B6D2"]
};
var LINE4 = {
  ink: NAVY4,
  accent: "#8E8BD0",
  good: "#3FB28C",
  bad: "#F2665A",
  muted: "#B4B2CC"
};
var SANS4 = '"Inter", "Avenir Next", "Helvetica Neue", Arial, sans-serif';
var C = Math.cos(Math.PI / 6);
var S = 0.5;
function make30(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const rise = (at = 0) => spring(t, { start: at, stiffness: 220, damping: 13 });
  function block(gx, gy, a, b, h, [top, left, right]) {
    const pa = [C * a, S * a];
    const pb = [-C * b, S * b];
    const g = (sa, sb, z = 0) => [
      gx + pa[0] * sa + pb[0] * sb,
      gy + pa[1] * sa + pb[1] * sb - z
    ];
    ctx.fillStyle = left;
    trace(ctx, [g(-1, 1), g(1, 1), g(1, 1, h), g(-1, 1, h)], true);
    ctx.fill();
    ctx.fillStyle = right;
    trace(ctx, [g(1, 1), g(1, -1), g(1, -1, h), g(1, 1, h)], true);
    ctx.fill();
    ctx.fillStyle = top;
    trace(ctx, [g(-1, -1, h), g(1, -1, h), g(1, 1, h), g(-1, 1, h)], true);
    ctx.fill();
  }
  function shadow(gx, gy, r) {
    ctx.save();
    ctx.fillStyle = "rgba(80,70,140,0.12)";
    ctx.beginPath();
    ctx.ellipse(gx + r * 1.1, gy + r * 0.25, r * 1.8, r * 0.6, 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function tag(s, cx, cy, size, tone, align = "center", dot = true) {
    ctx.save();
    ctx.font = `600 ${Math.round(size * u)}px ${SANS4}`;
    const tw = ctx.measureText(s).width;
    const pad = size * 0.55 * u;
    const dw = dot ? size * 0.7 * u : 0;
    const w = tw + pad * 2 + dw;
    const h = size * 1.7 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    ctx.shadowColor = "rgba(70,60,130,0.18)";
    ctx.shadowBlur = 14 * u;
    ctx.shadowOffsetY = 4 * u;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.roundRect(left, cy - h / 2, w, h, 6 * u);
    ctx.fill();
    ctx.shadowColor = "transparent";
    if (dot) {
      ctx.fillStyle = (FACES3[tone] ?? FACES3.ink)[1];
      ctx.beginPath();
      ctx.arc(left + pad + size * 0.2 * u, cy, size * 0.2 * u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = NAVY4;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(s, left + pad + dw, cy + u);
    ctx.restore();
  }
  function risen(at, draw) {
    const s = rise(at);
    if (s <= 0)
      return;
    ctx.save();
    ctx.globalAlpha = clamp(s * 2);
    ctx.translate(0, (1 - s) * 30 * u);
    draw(s);
    ctx.restore();
  }
  return {
    surface() {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#F8F6FB");
      g.addColorStop(1, "#E9E7F5");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const s = spring(t, { stiffness: 90, damping: 14 });
      const gx = W * 0.5;
      const gy = H * 0.5 + (1 - s) * H * 0.2;
      const a = W * 0.5;
      const _b = H * 0.55;
      ctx.save();
      ctx.globalAlpha = clamp(s * 1.5);
      ctx.fillStyle = "rgba(90,80,150,0.08)";
      ctx.beginPath();
      ctx.ellipse(gx + 40 * u, gy + a * 0.45, a * 0.75, a * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      block(gx, gy, a * 0.6, a * 0.6, 22 * u, ["#F3F2FB", "#D8D6EE", "#C3C0E2"]);
      ctx.strokeStyle = "rgba(160,200,180,0.35)";
      ctx.lineWidth = 18 * u;
      ctx.beginPath();
      ctx.moveTo(gx - C * a * 0.5, gy + S * a * 0.25);
      ctx.lineTo(gx + C * a * 0.25, gy + S * a * 0.62);
      ctx.stroke();
      for (const [tx, ty] of [
        [0.18, 0.78],
        [0.9, 0.62]
      ]) {
        ctx.fillStyle = "#B9B5D8";
        ctx.fillRect(X(tx) - 2 * u, Y(ty) - 22 * u, 4 * u, 22 * u);
        ctx.fillStyle = "#8FD3B4";
        ctx.beginPath();
        ctx.arc(X(tx), Y(ty) - 30 * u, 13 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 44, at = 0, align = "left" } = o;
      const p = progress(t, at, o.dur ?? 0.6);
      if (p <= 0)
        return;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = `800 ${Math.round(size * u)}px ${SANS4}`;
      ctx.fillStyle = NAVY4;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.fillText(s, X(x), Y(y) + (1 - expo(p)) * 14 * u);
      const tw = ctx.measureText(s).width;
      const left = align === "center" ? X(x) - tw / 2 : align === "right" ? X(x) - tw : X(x);
      ctx.fillStyle = FACES3.accent[1];
      ctx.fillRect(left, Y(y) - size * 0.95 * u, 30 * u * expo(p), 5 * u);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      risen(o.at, () => tag(s, X(x), Y(y), o.size ?? 28, o.tone ?? "ink", o.align ?? "center"));
    },
    node(x, y, r, o = {}) {
      risen(o.at, (s) => {
        const R = r * u;
        shadow(X(x), Y(y) + R * 0.5, R * 0.8);
        block(X(x), Y(y) + R * 0.5, R * 0.75, R * 0.75, R * 1.1 * s, FACES3[o.tone ?? "accent"]);
      });
    },
    box(x, y, w, h, o = {}) {
      risen(o.at, () => {
        const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
        const d = Math.min(bw, bh) * 0.28;
        const off = [C * d, -S * d];
        const [top, , right] = FACES3[o.tone === "ink" || !o.tone ? "ink" : o.tone];
        shadow(x0 + bw / 2, y0 + bh, bw * 0.45);
        ctx.fillStyle = right;
        trace(ctx, [
          [x0 + bw, y0],
          [x0 + bw + off[0], y0 + off[1]],
          [x0 + bw + off[0], y0 + bh + off[1]],
          [x0 + bw, y0 + bh]
        ], true);
        ctx.fill();
        ctx.fillStyle = top;
        trace(ctx, [
          [x0, y0],
          [x0 + off[0], y0 + off[1]],
          [x0 + bw + off[0], y0 + off[1]],
          [x0 + bw, y0]
        ], true);
        ctx.fill();
        ctx.fillStyle = "#F7F6FD";
        ctx.fillRect(x0, y0, bw, bh);
        ctx.strokeStyle = alpha(right, 0.6);
        ctx.lineWidth = 2 * u;
        ctx.strokeRect(x0 + 8 * u, y0 + 8 * u, bw - 16 * u, bh - 16 * u);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend === 0 && head ? -0.15 : bend, 30);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * expo(p))));
      ctx.save();
      ctx.strokeStyle = LINE4[tone];
      ctx.lineWidth = (head ? 2.2 : 1.4) * u;
      ctx.lineCap = "round";
      if (head)
        ctx.setLineDash([7 * u, 6 * u]);
      ctx.globalAlpha = head ? 1 : 0.6;
      trace(ctx, shown);
      ctx.stroke();
      ctx.setLineDash([]);
      if (head) {
        ctx.fillStyle = LINE4[tone];
        ctx.beginPath();
        ctx.arc(pts[0]?.[0] ?? 0, pts[0]?.[1] ?? 0, 4 * u, 0, Math.PI * 2);
        ctx.fill();
        if (p >= 1) {
          const end = pts.at(-1);
          const prev = pts.at(-3);
          arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 12 * u);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const gx = X(x + w / 2);
      const a = X(w) / 2 / C / 1.4;
      const n = 5;
      const sh = (Y(h) - a) / n;
      if (t >= at)
        shadow(gx, Y(y + h) - a * 0.4, a);
      for (let i = 0;i < n; i++) {
        const s = rise(at + i / n * dur * 0.8);
        if (s <= 0)
          continue;
        ctx.save();
        ctx.globalAlpha = clamp(s * 2);
        const gy = Y(y + h) - a * 0.5 - i * sh - (1 - s) * 30 * u;
        block(gx, gy, a, a * 0.8, sh * 0.82, i % 2 ? FACES3.muted : FACES3.ink);
        ctx.restore();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      risen(at, () => {
        const value = count ? counting(t, at, dur, count) + s : s;
        ctx.save();
        ctx.font = `800 ${Math.round(size * u)}px ${SANS4}`;
        const tw = Math.max(ctx.measureText(`${value}0`).width, size * 2 * u);
        const filled = tone === "accent" || tone === "bad";
        const ch = size * (sub ? 1.75 : 1.3) * u;
        const top = Y(y) - ch / 2 - (sub ? size * 0.2 * u : 0);
        if (sub || filled) {
          ctx.shadowColor = "rgba(70,60,130,0.2)";
          ctx.shadowBlur = 18 * u;
          ctx.shadowOffsetY = 6 * u;
          ctx.fillStyle = filled ? FACES3[tone][1] : "#FFFFFF";
          ctx.beginPath();
          ctx.roundRect(X(x) - tw / 2, top, tw, ch, 12 * u);
          ctx.fill();
          ctx.shadowColor = "transparent";
        }
        const ink = filled ? "#FFFFFF" : tone === "good" ? "#2E9F7B" : NAVY4;
        ctx.fillStyle = ink;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(value, X(x), Y(y) + (sub ? size * 0.12 * u : 0));
        if (sub) {
          ctx.font = `600 ${Math.round(size * 0.24 * u)}px ${SANS4}`;
          ctx.fillStyle = filled ? "rgba(255,255,255,0.9)" : "#7A7AA0";
          ctx.fillText(sub[0]?.toUpperCase() + sub.slice(1), X(x), top + size * 0.28 * u);
        }
        ctx.restore();
      });
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 22) * u;
      const s = rise(o.at);
      if (s <= 0)
        return;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.fillStyle = kind === "check" ? FACES3.good[1] : FACES3.bad[1];
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = r * 0.22;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (kind === "check")
        trace(ctx, [
          [-r * 0.45, 0],
          [-r * 0.1, r * 0.35],
          [r * 0.5, -r * 0.35]
        ]);
      else
        trace(ctx, [
          [-r * 0.4, -r * 0.4],
          [r * 0.4, r * 0.4],
          [0, 0],
          [r * 0.4, -r * 0.4],
          [-r * 0.4, r * 0.4]
        ]);
      ctx.stroke();
      ctx.restore();
    },
    finish() {}
  };
}
var isometric_default = {
  id: "isometric",
  name: "Isometric pastel",
  category: "Dimensional",
  make: make30
};

// plugin/skills/motion-graphics/styles/isotype.ts
var PAPER4 = "#EEE7D6";
var INK5 = "#2A2522";
var TONE10 = {
  ink: INK5,
  accent: "#2F5375",
  good: "#2F5375",
  bad: "#C8402F",
  muted: "#D7A23B"
};
var SANS5 = '"Futura", "Gill Sans", "Avenir Next", "Century Gothic", sans-serif';
function make31(ctx, t0, m) {
  const { W, H, u, X, Y } = frame(m);
  const t = Math.floor(t0 * 12) / 12;
  const font = (size, w = 700) => `${w} ${Math.round(size * u)}px ${SANS5}`;
  const g = globalThis;
  g.__isotypePaper ??= new Map;
  const cache = g.__isotypePaper;
  const stamp = (at = 0) => t < at ? 0 : t < at + 2 / 12 ? 1.12 : 1;
  function stamped(cx, cy, at, draw) {
    const s = stamp(at);
    if (!s)
      return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }
  function caps(s, x, y, size, color, align = "left", w = 700) {
    ctx.save();
    ctx.font = font(size, w);
    ctx.letterSpacing = `${Math.round(size * 0.14 * u)}px`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s.toUpperCase(), x, y);
    ctx.restore();
  }
  function figure(cx, base, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, base - h * 0.83, h * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - h * 0.2, base - h * 0.64);
    ctx.lineTo(cx + h * 0.2, base - h * 0.64);
    ctx.lineTo(cx + h * 0.24, base - h * 0.28);
    ctx.lineTo(cx + h * 0.12, base - h * 0.28);
    ctx.lineTo(cx + h * 0.12, base);
    ctx.lineTo(cx - h * 0.12, base);
    ctx.lineTo(cx - h * 0.12, base - h * 0.28);
    ctx.lineTo(cx - h * 0.24, base - h * 0.28);
    ctx.closePath();
    ctx.fill();
  }
  function paper() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const x = c.getContext("2d");
      x.fillStyle = PAPER4;
      x.fillRect(0, 0, W, H);
      for (let i = 0;i < 3000; i++) {
        x.fillStyle = hash(i) > 0.5 ? "rgba(255,255,250,0.10)" : "rgba(90,70,40,0.06)";
        x.fillRect(hash(i * 1.7) * W, hash(i * 2.3) * H, (1 + hash(i * 3.1) * 2) * u, (1 + hash(i * 4.9) * 2) * u);
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  return {
    surface() {
      paper();
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.08, size = 46, at = 0 } = o;
      if (!stamp(at))
        return;
      caps(s, X(x), Y(y), size, INK5);
      ctx.font = font(size);
      ctx.letterSpacing = `${Math.round(size * 0.14 * u)}px`;
      const w = ctx.measureText(s.toUpperCase()).width;
      ctx.letterSpacing = "0px";
      const steps = clamp(Math.floor((t - at) * 12) / 6);
      ctx.fillStyle = INK5;
      ctx.fillRect(X(x), Y(y) + size * 0.75 * u, w * steps, 3 * u);
    },
    label(s, x, y, o = {}) {
      const { size = 28, align = "center", tone = "ink", at = 0 } = o;
      stamped(X(x), Y(y), at, () => caps(s, X(x), Y(y), size, TONE10[tone], align));
    },
    node(x, y, r, o = {}) {
      const h = r * u * 2.6;
      stamped(X(x), Y(y), o.at, () => figure(X(x), Y(y) + h / 2, h, TONE10[o.tone ?? "accent"]));
    },
    box(x, y, w, h, o = {}) {
      const tone = o.tone ?? "ink";
      stamped(X(x + w / 2), Y(y + h / 2), o.at, () => {
        ctx.fillStyle = "rgba(42,37,34,0.10)";
        ctx.fillRect(X(x), Y(y), X(w), Y(h));
        ctx.fillStyle = TONE10[tone];
        ctx.fillRect(X(x), Y(y), X(w), 10 * u);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.3, bend = 0, head = true, tone = "ink" } = o;
      if (t < at)
        return;
      const p = clamp(Math.ceil((t - at) / (dur || 0.000001) * 3) / 3);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 24);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      trace(ctx, shown);
      ctx.strokeStyle = head ? TONE10[tone] : "rgba(47,83,117,0.45)";
      ctx.lineWidth = (head ? 10 : 2) * u;
      ctx.lineCap = "butt";
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 22 * u;
        const tip = [end[0] + Math.cos(a) * s * 0.4, end[1] + Math.sin(a) * s * 0.4];
        ctx.beginPath();
        ctx.moveTo(tip[0], tip[1]);
        ctx.lineTo(tip[0] - Math.cos(a) * s + Math.cos(a + Math.PI / 2) * s * 0.7, tip[1] - Math.sin(a) * s + Math.sin(a + Math.PI / 2) * s * 0.7);
        ctx.lineTo(tip[0] - Math.cos(a) * s - Math.cos(a + Math.PI / 2) * s * 0.7, tip[1] - Math.sin(a) * s - Math.sin(a + Math.PI / 2) * s * 0.7);
        ctx.closePath();
        ctx.fillStyle = TONE10[tone];
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const dur = o.dur ?? 0.8;
      const cols = 3;
      const cw = X(w) / cols;
      const rows = Math.max(2, Math.floor(Y(h) / (cw * 1.3)));
      const rh = Y(h) / rows;
      const total = rows * cols;
      for (let i = 0;i < total; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        if (t < at + i / total * dur)
          continue;
        const fh = Math.min(rh * 0.9, cw * 1.3);
        const cx = X(x) + cw * (c + 0.5);
        const base = Y(y) + rh * (r + 1) - rh * 0.05;
        if (i === total - 1) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(cx - cw / 2, base - fh, cw * 0.55, fh);
          ctx.clip();
          figure(cx, base, fh, r % 2 ? TONE10.muted : TONE10.accent);
          ctx.restore();
        } else
          figure(cx, base, fh, r % 2 ? TONE10.muted : TONE10.accent);
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const str = count ? counting(t, at, dur, count) + s : s;
      stamped(X(x), Y(y), at, () => {
        ctx.font = font(size);
        ctx.fillStyle = tone === "good" || tone === "accent" ? INK5 : TONE10[tone];
        if (sub)
          ctx.fillStyle = TONE10.bad;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(str, X(x), Y(y) - (sub ? size * 0.1 * u : 0));
        if (sub)
          caps(sub, X(x), Y(y) - size * 0.85 * u, size * 0.26, TONE10.bad, "center");
      });
      if (sub && count) {
        const n = Math.round(Number(counting(t, at, dur, count).replace(/,/g, "")) / 100 * 10);
        const step = size * 0.4 * u;
        for (let i = 0;i < 10; i++) {
          const cx = X(x) + (i - 4.5) * step;
          const cy = Y(y) + size * 0.8 * u;
          ctx.save();
          ctx.strokeStyle = i < n ? TONE10.accent : "rgba(42,37,34,0.18)";
          ctx.lineWidth = step * 0.22;
          ctx.lineCap = "butt";
          trace(ctx, [
            [cx - step * 0.32, cy],
            [cx - step * 0.08, cy + step * 0.25],
            [cx + step * 0.35, cy - step * 0.3]
          ]);
          ctx.stroke();
          ctx.restore();
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 28) * u;
      stamped(X(x), Y(y), o.at, () => {
        ctx.save();
        ctx.strokeStyle = kind === "check" ? TONE10.accent : TONE10.bad;
        ctx.lineWidth = r * 0.36;
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
        const [cx, cy] = [X(x), Y(y)];
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.65, cy],
            [cx - r * 0.15, cy + r * 0.5],
            [cx + r * 0.75, cy - r * 0.6]
          ]);
        else {
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.55, cy - r * 0.55);
          ctx.lineTo(cx + r * 0.55, cy + r * 0.55);
          ctx.moveTo(cx + r * 0.55, cy - r * 0.55);
          ctx.lineTo(cx - r * 0.55, cy + r * 0.55);
        }
        ctx.stroke();
        ctx.restore();
      });
    },
    finish() {}
  };
}
var isotype_default = {
  id: "isotype",
  name: "Picture statistics",
  category: "Data & Information",
  make: make31
};

// plugin/skills/motion-graphics/styles/kawaii.ts
var PLUM = "#6E4467";
var FILL3 = {
  ink: "#FFFFFF",
  accent: "#FFB3CF",
  good: "#A8E6CF",
  bad: "#FF8FA3",
  muted: "#D9CCF2"
};
var DEEP = {
  ink: PLUM,
  accent: "#F06A9C",
  good: "#3FB38A",
  bad: "#E8506E",
  muted: "#9C86D6"
};
var ROUND4 = '"Hiragino Maru Gothic ProN", "Arial Rounded MT Bold", "Nunito", "Varela Round", sans-serif';
function make32(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const tq = Math.floor(t * 12) / 12;
  const sparkles = [];
  function squash(at = 0) {
    const s = spring(tq, { start: at, stiffness: 240, damping: 11 });
    if (s <= 0)
      return [0, 0];
    const over = s - 1;
    return [s * (1 - over * 0.6), s * (1 + over * 0.6)];
  }
  function popped(cx, cy, at, draw, sparkle = false) {
    const [sx, sy] = squash(at);
    if (sx <= 0)
      return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sx, sy);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
    if (sparkle)
      sparkles.push([cx, cy]);
  }
  function outline(width = 5) {
    ctx.lineWidth = width * u;
    ctx.strokeStyle = PLUM;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  function sticker(s, x, y, size, fill, align = "center") {
    ctx.save();
    ctx.font = `800 ${Math.round(size * u)}px ${ROUND4}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.17 * u;
    ctx.strokeStyle = PLUM;
    ctx.strokeText(s, x, y);
    ctx.lineWidth = size * 0.08 * u;
    ctx.strokeStyle = "#FFFFFF";
    ctx.strokeText(s, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  function star(cx, cy, r) {
    const pts = Array.from({ length: 8 }, (_, i) => {
      const a = i / 8 * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.3 : r;
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    });
    trace(ctx, pts, true);
  }
  return {
    surface() {
      ctx.fillStyle = "#FFE4EE";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      const s = 34 * u;
      for (let row = 0, y = 0;y < H + s; row++, y += s) {
        for (let x = row % 2 ? s / 2 : 0;x < W + s; x += s) {
          ctx.beginPath();
          ctx.arc(x, y, 3.2 * u, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      for (let i = 0;i < 5; i++) {
        const cx = ((hash(i * 4.1) * 1.2 - 0.1) * W + t * 8 * u * (i % 2 ? 1 : -1) + W) % (W * 1.2) - W * 0.1;
        const cy = (0.15 + 0.75 * hash(i * 7.3)) * H;
        const r = (50 + 40 * hash(i)) * u;
        for (let k = 0;k < 4; k++) {
          ctx.beginPath();
          ctx.arc(cx + (k - 1.5) * r * 0.8, cy + (k % 2 ? -r * 0.3 : 0), r * (k % 2 ? 0.8 : 0.65), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.09, size = 52, at = 0, align = "left" } = o;
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${ROUND4}`;
      const w = ctx.measureText(s).width;
      ctx.restore();
      const cx = align === "center" ? X(x) : align === "right" ? X(x) - w / 2 : X(x) + w / 2;
      popped(cx, Y(y), at, () => sticker(s, cx, Y(y) + Math.sin(t * 2.5) * 2 * u, size, "#FF7EAD"), true);
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 26, tone = "ink", align = "center" } = o;
      popped(X(x), Y(y), at, () => {
        ctx.save();
        ctx.font = `800 ${Math.round(size * u)}px ${ROUND4}`;
        const w = ctx.measureText(s).width + size * 1.1 * u;
        const h = size * 1.6 * u;
        const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
        ctx.beginPath();
        ctx.roundRect(left, Y(y) - h / 2, w, h, h / 2);
        ctx.fillStyle = tone === "ink" ? "#FFFFFF" : FILL3[tone];
        ctx.fill();
        outline(3.5);
        ctx.fillStyle = tone === "ink" ? PLUM : DEEP[tone];
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s, left + w / 2, Y(y) + 1 * u);
        ctx.restore();
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const cx = X(x);
      const cy = Y(y) + Math.sin(t * 3 + x * 20 + y * 13) * 1.5 * u;
      const R = r * u;
      popped(cx, cy, at, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = FILL3[tone];
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        ctx.arc(cx + R * 0.35, cy + R * 0.35, R, 0, Math.PI * 2);
        ctx.arc(cx - R * 0.1, cy - R * 0.1, R * 1.05, 0, Math.PI * 2, true);
        ctx.fillStyle = "rgba(110,68,103,0.12)";
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        outline(3.5);
        const blink = (t * 0.7 + x * 3) % 3 < 0.08;
        for (const side of [-1, 1]) {
          const ex = cx + side * R * 0.36;
          const ey = cy - R * 0.05;
          ctx.fillStyle = PLUM;
          ctx.beginPath();
          if (blink)
            ctx.ellipse(ex, ey, R * 0.16, R * 0.04, 0, 0, Math.PI * 2);
          else
            ctx.ellipse(ex, ey, R * 0.13, R * 0.18, 0, 0, Math.PI * 2);
          ctx.fill();
          if (!blink) {
            ctx.fillStyle = "#FFFFFF";
            ctx.beginPath();
            ctx.arc(ex - R * 0.04, ey - R * 0.07, R * 0.055, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "rgba(255,120,150,0.55)";
          ctx.beginPath();
          ctx.ellipse(cx + side * R * 0.6, cy + R * 0.28, R * 0.16, R * 0.09, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      popped(X(x + w / 2), Y(y + h / 2), at, () => {
        const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
        const r = Math.min(ww, hh) * 0.2;
        ctx.beginPath();
        ctx.roundRect(l + 6 * u, tp + 8 * u, ww, hh, r);
        ctx.fillStyle = "rgba(110,68,103,0.15)";
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(l, tp, ww, hh, r);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        outline(5);
        ctx.beginPath();
        ctx.roundRect(l + 8 * u, tp + 8 * u, ww - 16 * u, hh - 16 * u, r * 0.7);
        ctx.fillStyle = tone === "ink" ? "#FFF6FA" : `${FILL3[tone]}66`;
        ctx.fill();
      }, true);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "good" } = o;
      const p = clamp((tq - at) / dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const color = head ? DEEP[tone === "ink" ? "good" : tone] : `${DEEP.muted}88`;
      if (!head) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 * u;
        trace(ctx, along(pts, p).points);
        ctx.stroke();
        ctx.restore();
        return;
      }
      const len = pts.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
      const n = Math.max(3, Math.floor(len / (13 * u)));
      ctx.fillStyle = color;
      for (let i = 0;i <= n * p; i++) {
        const [px, py] = along(pts, i / n).points.at(-1);
        ctx.beginPath();
        ctx.arc(px, py, 3.6 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-4);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 16 * u;
        trace(ctx, [
          [end[0] + Math.cos(a) * s * 0.5, end[1] + Math.sin(a) * s * 0.5],
          [end[0] - Math.cos(a - 0.6) * s, end[1] - Math.sin(a - 0.6) * s],
          [end[0] - Math.cos(a + 0.6) * s, end[1] - Math.sin(a + 0.6) * s]
        ], true);
        ctx.lineJoin = "round";
        ctx.lineWidth = 4 * u;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.fill();
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0 } = o;
      popped(X(x + w / 2), Y(y + h), at, () => {
        const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
        const lid = hh * 0.16;
        ctx.beginPath();
        ctx.roundRect(l, tp + lid, ww, hh - lid, ww * 0.28);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fill();
        ctx.save();
        ctx.clip();
        const cols = ["#FFB3CF", "#A8E6CF", "#FFE89A", "#C9B8F5", "#9FD8F7"];
        for (let i = 0;i < 9; i++) {
          ctx.beginPath();
          ctx.arc(l + ww * (0.22 + 0.56 * hash(i * 3.3)), tp + hh * (0.5 + 0.42 * hash(i * 5.9)), ww * 0.14, 0, Math.PI * 2);
          ctx.fillStyle = cols[i % cols.length];
          ctx.fill();
          ctx.lineWidth = 2.5 * u;
          ctx.strokeStyle = PLUM;
          ctx.stroke();
        }
        ctx.restore();
        ctx.beginPath();
        ctx.roundRect(l, tp + lid, ww, hh - lid, ww * 0.28);
        outline(4.5);
        ctx.beginPath();
        ctx.roundRect(l - ww * 0.06, tp, ww * 1.12, lid * 1.2, lid * 0.5);
        ctx.fillStyle = "#FFB3CF";
        ctx.fill();
        outline(4.5);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath();
        ctx.roundRect(l + ww * 0.14, tp + lid * 1.6, ww * 0.1, hh * 0.35, ww * 0.05);
        ctx.fill();
      }, true);
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      const value = count ? counting(tq, at, dur, count) + s : s;
      const bounce = count && tq < at + dur ? Math.abs(Math.sin(tq * 14)) * 5 * u : 0;
      popped(X(x), Y(y), at, () => {
        sticker(value, X(x), Y(y) - bounce, size, tone === "ink" ? "#FFFFFF" : DEEP[tone]);
        if (sub)
          sticker(sub, X(x), Y(y) - size * 0.85 * u, size * 0.32, "#FF7EAD");
      }, true);
    },
    mark(kind, x, y, o = {}) {
      const R = (o.size ?? 30) * u;
      const cx = X(x);
      const cy = Y(y);
      popped(cx, cy, o.at, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = kind === "check" ? "#7DDBB4" : "#FF7E98";
        ctx.fill();
        outline(4);
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 6 * u;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (kind === "check")
          trace(ctx, [
            [cx - R * 0.45, cy],
            [cx - R * 0.1, cy + R * 0.35],
            [cx + R * 0.48, cy - R * 0.35]
          ]);
        else {
          ctx.beginPath();
          ctx.moveTo(cx - R * 0.38, cy - R * 0.38);
          ctx.lineTo(cx + R * 0.38, cy + R * 0.38);
          ctx.moveTo(cx + R * 0.38, cy - R * 0.38);
          ctx.lineTo(cx - R * 0.38, cy + R * 0.38);
        }
        ctx.stroke();
      }, true);
    },
    finish() {
      ctx.save();
      sparkles.forEach(([cx, cy], i) => {
        for (let k = 0;k < 2; k++) {
          const tw = Math.sin(t * 5 + i * 1.7 + k * 2.4);
          if (tw < 0)
            continue;
          const a = hash(i * 9.1 + k) * Math.PI * 2;
          const d = (48 + 30 * hash(i + k * 3)) * u;
          star(cx + Math.cos(a) * d, cy + Math.sin(a) * d, (5 + 6 * tw) * u);
          ctx.fillStyle = k ? "#FFD84D" : "#FFFFFF";
          ctx.fill();
          ctx.lineWidth = 2 * u;
          ctx.strokeStyle = PLUM;
          ctx.stroke();
        }
      });
      ctx.restore();
    }
  };
}
var kawaii_default = {
  id: "kawaii",
  name: "Kawaii pastel",
  category: "Popular Explainer Looks",
  make: make32
};

// plugin/skills/motion-graphics/styles/kinetic-type.ts
var BLACK5 = "#0B0B0B";
var ACID = "#E2FF3D";
var BLOCK2 = '"Anton", "Bebas Neue", "Impact", "Haettenschweiler", "Arial Narrow", sans-serif';
var MONO6 = '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';
function make33(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__kineticDots ??= new Map;
  const cache = g.__kineticDots;
  function dots() {
    const s = Math.max(3, Math.round(7 * u));
    let pat = cache.get(s);
    if (!pat) {
      const c = new OffscreenCanvas(s, s);
      const x = c.getContext("2d");
      x.fillStyle = ACID;
      x.beginPath();
      x.arc(s / 2, s / 2, s * 0.28, 0, Math.PI * 2);
      x.fill();
      pat = ctx.createPattern(c, "repeat");
      cache.set(s, pat);
    }
    return pat;
  }
  function slam(s, x, y, size, at, align = "left", outline = false) {
    const p = progress(t, at, 0.22);
    if (p <= 0)
      return 0;
    const scale = 1 + (1 - expo(p)) * 0.7;
    ctx.save();
    ctx.font = `400 ${Math.round(size * u)}px ${BLOCK2}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const echo = clamp(1 - (t - at) / 0.8);
    if (echo > 0) {
      ctx.strokeStyle = alpha(ACID, 0.6 * echo);
      ctx.lineWidth = 1.5 * u;
      for (let k = 1;k <= 3; k++)
        ctx.strokeText(s, x - k * 10 * u * echo, y + k * 4 * u * echo);
    }
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (outline) {
      ctx.strokeStyle = ACID;
      ctx.lineWidth = 2.5 * u;
      ctx.strokeText(s, 0, 0);
    } else {
      ctx.fillStyle = ACID;
      ctx.fillText(s, 0, 0);
    }
    ctx.restore();
    if (t - at > 0.2 && t - at < 0.24) {
      ctx.save();
      ctx.globalCompositeOperation = "difference";
      ctx.fillStyle = ACID;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    return w;
  }
  function tag(s, cx, cy, size, at, align = "center", invert = true) {
    const p = progress(t, at, 0.18);
    if (p <= 0)
      return;
    const y = cy - (1 - easeIn(1 - (1 - p))) * 0 - (1 - p) * 40 * u;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${MONO6}`;
    const w = ctx.measureText(s).width + size * 0.8 * u;
    const h = size * 1.5 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    ctx.fillStyle = invert ? ACID : BLACK5;
    ctx.fillRect(left, y - h / 2, w, h);
    ctx.strokeStyle = ACID;
    ctx.lineWidth = 1.5 * u;
    ctx.strokeRect(left, y - h / 2, w, h);
    ctx.fillStyle = invert ? BLACK5 : ACID;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + w / 2, y + u);
    ctx.restore();
  }
  return {
    surface() {
      ctx.fillStyle = BLACK5;
      ctx.fillRect(0, 0, W, H);
    },
    title(s, o = {}) {
      const { x = 0.025, y = 0.12, size = 140, at = 0, align = "left" } = o;
      const words = s.toUpperCase().split(" ");
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${BLOCK2}`;
      const gap = size * 0.22 * u;
      const widths = words.map((w) => ctx.measureText(w).width);
      ctx.restore();
      const total = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
      let left = align === "center" ? X(x) - total / 2 : align === "right" ? X(x) - total : X(x);
      const beat = (o.dur ?? 0.9) / Math.max(1, words.length);
      for (const [i, w] of words.entries()) {
        slam(w, left, Y(y), size, at + i * beat, "left", i % 2 === 1);
        left += widths[i] + gap;
      }
    },
    label(s, x, y, o = {}) {
      tag(s.toUpperCase(), X(x), Y(y), o.size ?? 28, o.at ?? 0, o.align ?? "center", o.tone !== "muted");
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const p = progress(t, at, 0.15);
      if (p <= 0)
        return;
      const R = r * u * (1 + (1 - expo(p)) * 0.8);
      ctx.save();
      ctx.fillStyle = BLACK5;
      ctx.fillRect(X(x) - R, Y(y) - R, R * 2, R * 2);
      ctx.fillStyle = tone === "muted" ? alpha(ACID, 0.4) : dots();
      ctx.fillRect(X(x) - R * 0.7, Y(y) - R * 0.7, R * 1.4, R * 1.4);
      ctx.strokeStyle = ACID;
      ctx.lineWidth = 3 * u;
      ctx.strokeRect(X(x) - R, Y(y) - R, R * 2, R * 2);
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.25 } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const e = expo(p);
      ctx.save();
      ctx.strokeStyle = ACID;
      ctx.lineWidth = 2 * u;
      ctx.strokeRect(x0 + 8 * u, y0 + 8 * u + bh * (1 - e), bw, bh * e);
      ctx.fillStyle = BLACK5;
      ctx.fillRect(x0, y0 + bh * (1 - e), bw, bh * e);
      ctx.lineWidth = 5 * u;
      ctx.strokeRect(x0, y0 + bh * (1 - e), bw, bh * e);
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.25, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * expo(p))));
      ctx.save();
      ctx.strokeStyle = head ? ACID : alpha(ACID, 0.45);
      ctx.lineWidth = (head ? 5 : 1.5) * u;
      ctx.lineCap = "butt";
      if (tone === "bad")
        ctx.setLineDash([12 * u, 8 * u]);
      trace(ctx, shown);
      ctx.stroke();
      ctx.setLineDash([]);
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 22 * u;
        ctx.fillStyle = ACID;
        trace(ctx, [
          end,
          [end[0] - Math.cos(a - 0.6) * s, end[1] - Math.sin(a - 0.6) * s],
          [end[0] - Math.cos(a) * s * 0.55, end[1] - Math.sin(a) * s * 0.55],
          [end[0] - Math.cos(a + 0.6) * s, end[1] - Math.sin(a + 0.6) * s]
        ], true);
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6 } = o;
      const n = 4;
      for (let i = 0;i < n; i++) {
        const p = progress(t, at + i / n * dur, 0.15);
        if (p <= 0)
          continue;
        const off = (n - 1 - i) * 8 * u;
        const s = 1 + (1 - expo(p)) * 0.4;
        const cx = X(x + w / 2) + off;
        const cy = Y(y + h / 2) - off;
        const bw = (X(w) - 24 * u) * s;
        const bh = (Y(h) - 24 * u) * s;
        ctx.fillStyle = BLACK5;
        ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
        ctx.strokeStyle = ACID;
        ctx.lineWidth = 3 * u;
        ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
        if (i === n - 1) {
          for (let k = 0;k < 4; k++) {
            const bhk = bh * (0.2 + hash(k * 3.3) * 0.5);
            ctx.fillStyle = ACID;
            ctx.fillRect(cx - bw * 0.35 + k * bw * 0.19, cy + bh * 0.38 - bhk, bw * 0.12, bhk);
          }
        }
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const big = size * 1.25;
      ctx.save();
      ctx.font = `400 ${Math.round(big * u)}px ${BLOCK2}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const w = ctx.measureText(value).width;
      const h = big * u;
      const glitch = clamp(1 - (t - at) / (dur + 0.2));
      const bands = 6;
      for (let b = 0;b < bands; b++) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(X(x) - w, Y(y) - h / 2 + b * h / bands, w * 2, h / bands + 1);
        ctx.clip();
        const shove = (hash(b * 7.1 + Math.floor(t * 20)) - 0.5) * 40 * u * glitch;
        ctx.fillStyle = ACID;
        ctx.fillText(value, X(x) + shove, Y(y));
        ctx.restore();
      }
      ctx.restore();
      if (sub)
        tag(sub.toUpperCase(), X(x), Y(y) - h * 0.72, size * 0.22, at + 0.1, "center", true);
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 30) * u;
      const p = progress(t, o.at ?? 0, 0.15);
      if (p <= 0)
        return;
      const k = 1 + (1 - expo(p)) * 0.8;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(k, k);
      ctx.strokeStyle = ACID;
      ctx.lineWidth = 6 * u;
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      if (kind === "check")
        trace(ctx, [
          [-s * 0.5, 0],
          [-s * 0.15, s * 0.4],
          [s * 0.6, -s * 0.5]
        ]);
      else
        trace(ctx, [
          [-s * 0.5, -s * 0.5],
          [s * 0.5, s * 0.5],
          [0, 0],
          [s * 0.5, -s * 0.5],
          [-s * 0.5, s * 0.5]
        ]);
      ctx.stroke();
      ctx.restore();
    },
    finish() {}
  };
}
var kinetic_type_default = {
  id: "kinetic-type",
  name: "Kinetic type",
  category: "Generative & Type",
  make: make33
};

// plugin/skills/motion-graphics/styles/letterpress.ts
var STOCK = "#EFE4CA";
var BLACK6 = "#1E1B18";
var RED4 = "#C3352B";
var INK6 = {
  ink: BLACK6,
  accent: RED4,
  good: BLACK6,
  bad: RED4,
  muted: "#7B7265"
};
var WOOD = '"Impact", "Haettenschweiler", "Oswald", "Arial Narrow", sans-serif';
var SLAB = '"Rockwell", "Clarendon", "Georgia", serif';
function make34(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__pressWear ??= new Map;
  const cache = g.__pressWear;
  function kissed(cx, cy, at, draw) {
    if (t < at)
      return;
    const p = clamp((t - at) / 0.12);
    const s = 1 + (1 - p) * 0.14;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    ctx.globalAlpha = 0.35 + 0.65 * p;
    draw();
    ctx.restore();
  }
  function wood(s, x, y, size, color, align = "left", font = WOOD) {
    ctx.font = `400 ${Math.round(size * u)}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
    ctx.lineWidth = Math.max(1, size * 0.02 * u);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.strokeText(s, x, y);
  }
  function gear(cx, cy, r, teeth, rot, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0;i < teeth * 2; i++) {
      const a0 = i / (teeth * 2) * Math.PI * 2;
      const a1 = (i + 1) / (teeth * 2) * Math.PI * 2;
      const rr = i % 2 ? r * 0.78 : r;
      ctx.arc(0, 0, rr, a0, a1);
    }
    ctx.closePath();
    ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2, true);
    ctx.fillStyle = color;
    ctx.fill("evenodd");
    ctx.restore();
  }
  function rule(x1, x2, y, weight, color = BLACK6) {
    ctx.fillStyle = color;
    ctx.fillRect(x1, y - weight / 2, x2 - x1, weight);
  }
  function wearTile() {
    const key = `${W}x${H}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      for (let i = 0;i < W * H / 90; i++) {
        c.fillStyle = `rgba(239,228,202,${0.25 + 0.5 * hash(i * 0.53)})`;
        const len = 1 + hash(i * 6.1) * 6;
        c.fillRect(hash(i * 1.37) * W, hash(i * 2.91) * H, len, 1.2);
      }
      cache.set(key, tile);
    }
    return tile;
  }
  return {
    surface() {
      ctx.fillStyle = STOCK;
      ctx.fillRect(0, 0, W, H);
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      v.addColorStop(0, "rgba(255,250,235,0.3)");
      v.addColorStop(1, "rgba(140,110,60,0.2)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      const m0 = W * 0.03;
      rule(m0, W - m0, H * 0.025, 4 * u);
      rule(m0, W - m0, H * 0.025 + 9 * u, 1.5 * u);
      rule(m0, W - m0, H * 0.965, 4 * u);
      rule(m0, W - m0, H * 0.965 - 9 * u, 1.5 * u);
      ctx.fillStyle = RED4;
      for (let i = 0;i < 24; i++) {
        ctx.beginPath();
        ctx.arc(W * 0.38 + i * W * 0.01, H * 0.93, 2 * u, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.1, size = 76, at = 0, dur = 0.9 } = o;
      const text = s.toUpperCase();
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${WOOD}`;
      let cx = X(x);
      const step = dur / text.length;
      for (const [i, ch] of [...text].entries()) {
        const w = ctx.measureText(ch).width;
        const tone = 0.82 + 0.18 * hash(i * 3.7);
        kissed(cx + w / 2, Y(y), at + i * step, () => {
          ctx.globalAlpha *= tone;
          wood(ch, cx, Y(y), size, i >= text.lastIndexOf(" ") + 1 ? RED4 : BLACK6);
        });
        cx += w + size * 0.02 * u;
      }
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 26, tone = "ink", align = "center" } = o;
      kissed(X(x), Y(y), at, () => {
        ctx.letterSpacing = `${(size * 0.08 * u).toFixed(1)}px`;
        wood(s.toUpperCase(), X(x), Y(y), size, INK6[tone], align);
        ctx.letterSpacing = "0px";
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const R = r * 1.05 * u;
      kissed(X(x), Y(y), at, () => gear(X(x), Y(y), R, 8, (t - at) * 0.6 * (hash(x * 9 + y) > 0.5 ? 1 : -1), INK6[tone === "accent" ? "ink" : tone]));
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
      kissed(l + ww / 2, tp + hh / 2, at, () => {
        ctx.lineWidth = 5 * u;
        ctx.strokeStyle = INK6[tone === "good" ? "ink" : tone];
        ctx.strokeRect(l, tp, ww, hh);
        ctx.lineWidth = 1.5 * u;
        ctx.strokeRect(l + 8 * u, tp + 8 * u, ww - 16 * u, hh - 16 * u);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      if (t < at)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const color = INK6[tone === "accent" ? "ink" : tone];
      if (!head) {
        const p = clamp((t - at) / dur);
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2 * u;
        trace(ctx, pts.slice(0, Math.max(2, Math.round(pts.length * p))));
        ctx.stroke();
        ctx.restore();
        return;
      }
      const n = pts.length - 1;
      const shown = Math.floor(clamp((t - at) / dur) * n);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.5 * u;
      for (let i = 0;i < shown; i += 2) {
        const a = pts[i];
        const b = pts[i + 1];
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      if (shown >= n) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 16 * u;
        trace(ctx, [
          [end[0] + Math.cos(a) * 4 * u, end[1] + Math.sin(a) * 4 * u],
          [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
          [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s]
        ], true);
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const s = Math.min(X(w) / 2.1, Y(h) / 2.1);
      const l = X(x + w / 2) - s * 1.05;
      const tp = Y(y + h / 2) - s * 1.05;
      for (let i = 0;i < 4; i++) {
        const bx = l + i % 2 * s * 1.1;
        const by = tp + Math.floor(i / 2) * s * 1.1;
        kissed(bx + s / 2, by + s / 2, at + i * dur / 5, () => {
          ctx.lineWidth = 3.5 * u;
          ctx.strokeStyle = BLACK6;
          ctx.strokeRect(bx, by, s, s);
          ctx.fillStyle = i === 1 || i === 2 ? RED4 : BLACK6;
          ctx.fillRect(bx + 6 * u, by + 6 * u, s - 12 * u, s - 12 * u);
          ctx.fillStyle = STOCK;
          ctx.beginPath();
          ctx.arc(bx + s / 2, by + s * 0.55, s * 0.22, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const tq = Math.floor(t * 6) / 6;
      const value = count ? counting(tq, at, dur, count) + s : s;
      const stamp = Math.floor(Math.max(0, t - at) * 6) / 6 + at;
      const color = tone === "accent" || tone === "ink" ? BLACK6 : INK6[tone];
      kissed(X(x), Y(y), count && t < at + dur ? stamp : at, () => {
        wood(value, X(x), Y(y), size * 1.15, color, "center");
      });
      if (sub) {
        kissed(X(x), Y(y) - size * 0.85 * u, at, () => {
          ctx.letterSpacing = `${(size * 0.05 * u).toFixed(1)}px`;
          wood(sub.toUpperCase(), X(x), Y(y) - size * 0.85 * u, size * 0.3, RED4, "center", SLAB);
          ctx.letterSpacing = "0px";
          ctx.fillStyle = RED4;
          for (const side of [-1, 1]) {
            const cx = X(x) + side * size * 0.95 * u;
            const cy = Y(y) - size * 0.55 * u;
            ctx.beginPath();
            for (let k = 0;k < 10; k++) {
              const a = k / 10 * Math.PI * 2 - Math.PI / 2;
              const rr = (k % 2 ? 0.4 : 1) * size * 0.1 * u;
              ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            }
            ctx.fill();
          }
          rule(X(x) - size * 0.8 * u, X(x) + size * 0.8 * u, Y(y) + size * 0.72 * u, 4 * u, RED4);
          rule(X(x) - size * 0.8 * u, X(x) + size * 0.8 * u, Y(y) + size * 0.72 * u + 7 * u, 1.5 * u, RED4);
        });
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const s = (o.size ?? 34) * u;
      const cx = X(x);
      const cy = Y(y);
      if (kind === "check") {
        kissed(cx, cy, at, () => {
          ctx.strokeStyle = RED4;
          ctx.lineWidth = 7 * u;
          ctx.lineJoin = "miter";
          trace(ctx, [
            [cx - s * 0.5, cy],
            [cx - s * 0.1, cy + s * 0.45],
            [cx + s * 0.6, cy - s * 0.6]
          ]);
          ctx.stroke();
        });
      } else {
        kissed(cx, cy, at, () => {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(-0.15);
          ctx.globalAlpha *= 0.88;
          ctx.strokeStyle = RED4;
          ctx.lineWidth = 4 * u;
          ctx.strokeRect(-s * 1.7, -s * 0.55, s * 3.4, s * 1.1);
          wood("WRONG", 0, 2 * u, s * 0.9 / u, RED4, "center", SLAB);
          ctx.restore();
        });
      }
    },
    finish() {
      ctx.drawImage(wearTile(), 0, 0);
    }
  };
}
var letterpress_default = {
  id: "letterpress",
  name: "Wood type press",
  category: "Print",
  make: make34
};

// plugin/skills/motion-graphics/styles/light-painting.ts
var LIGHT = {
  ink: "#5FF0FF",
  accent: "#FF5FE6",
  good: "#FFD24A",
  bad: "#FF4A5C",
  muted: "#8F8CFF"
};
var HAND4 = '"Bradley Hand", "Snell Roundhand", "Segoe Script", "Comic Sans MS", cursive';
var LED = {
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  "%": [24, 25, 2, 4, 8, 19, 3],
  ",": [0, 0, 0, 0, 6, 2, 4]
};
function make35(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const tips = [];
  let seed = 7;
  function trail(points, at, dur, color, width = 3.5, close = false) {
    seed++;
    const p = progress(t, at, dur);
    if (p <= 0)
      return 0;
    const shaky = roughen(points, 1.6 * u, seed * 5.1);
    const { points: drawn } = along(close ? [...shaky, shaky[0]] : shaky, p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "lighter";
    trace(ctx, drawn);
    ctx.shadowColor = color;
    ctx.shadowBlur = 18 * u;
    ctx.strokeStyle = alpha(color, 0.55);
    ctx.lineWidth = width * 2.2 * u;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = width * 0.35 * u;
    ctx.stroke();
    ctx.restore();
    if (p < 1) {
      const e = drawn.at(-1);
      tips.push({ x: e[0], y: e[1], color });
    }
    return p;
  }
  function script(s, x, y, size, color, align, at, dur) {
    const p = progress(t, at, dur);
    if (p <= 0)
      return;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${HAND4}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 6 * u, y - size * u, (w + 12 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.textAlign = "left";
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = color;
    ctx.shadowBlur = 16 * u;
    ctx.fillStyle = color;
    ctx.fillText(s, left, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(s, left, y);
    ctx.restore();
    if (p < 1)
      tips.push({ x: left + w * p, y: y + Math.sin(t * 40) * size * 0.2 * u, color });
  }
  return {
    surface() {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#03040C");
      sky.addColorStop(0.75, "#0B1028");
      sky.addColorStop(1, "#05060A");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      for (let i = 0;i < 160; i++) {
        const x = hash(i * 1.3) * W;
        const y = hash(i * 2.9) * H * 0.75;
        const b = 0.3 + hash(i * 4.1) * 0.7;
        ctx.strokeStyle = `rgba(220,230,255,${b * 0.8})`;
        ctx.lineWidth = (0.6 + b) * u;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 2 * u + t * 0.3 * u, y - 0.6 * u);
        ctx.stroke();
      }
      const hz = H * 0.8;
      ctx.fillStyle = "#020205";
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0;x <= W; x += 40 * u)
        ctx.lineTo(x, hz - (hash(x * 0.37) * 14 + Math.sin(x / W * 6) * 10) * u);
      ctx.lineTo(W, H);
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0;i < 26; i++) {
        const x = hash(i * 7.7) * W;
        const y = hz - 6 * u + hash(i * 3.3) * 10 * u;
        const r = (5 + hash(i * 5.5) * 9) * u;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const warm = hash(i) > 0.4;
        g.addColorStop(0, warm ? "rgba(255,200,140,0.35)" : "rgba(150,190,255,0.3)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 56, at = 0, dur = 0.9 } = o;
      script(s, X(x), Y(y), size, LIGHT.ink, o.align ?? "left", at, dur);
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${HAND4}`;
      const w = ctx.measureText(s).width;
      ctx.restore();
      const lx = (o.align ?? "left") === "left" ? X(x) : X(x) - w / 2;
      trail(curve([lx, Y(y) + size * 0.65 * u], [lx + w, Y(y) + size * 0.6 * u], -0.04, 16), at + dur, 0.35, LIGHT.good, 2.5);
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, tone = "ink", align = "center" } = o;
      script(s, X(x), Y(y), size, LIGHT[tone], align, at, o.dur ?? 0.04 * s.length + 0.15);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.2, tone = "accent" } = o;
      const R = r * u * 0.8;
      trail(ellipse(X(x), Y(y), R, R, 30), at, dur, LIGHT[tone], 3);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.5, tone = "good" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      trail([
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0 - 2 * u]
      ], at, dur, LIGHT[tone], 3);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const color = head ? LIGHT[tone === "accent" ? "ink" : tone] : LIGHT[tone];
      const p = trail(pts, at, dur, color, head ? 3 : 1.2);
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 16 * u;
        trail([
          [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
          end,
          [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s]
        ], at + dur, 0.12, color, 3);
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const cx = (x0 + x1) / 2;
      const rx = (x1 - x0) / 2;
      const turns = 3;
      const n = 90;
      const pts = Array.from({ length: n + 1 }, (_, i) => {
        const f = i / n;
        return [cx + Math.sin(f * turns * Math.PI * 2) * rx, y0 + f * (y1 - y0)];
      });
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (let i = 1;i < shown.length; i++) {
        const a = shown[i - 1];
        const b = shown[i];
        const hue = (i * 6 + t * 40) % 360;
        const front = Math.cos(i / n * turns * Math.PI * 2) > 0;
        ctx.strokeStyle = `hsla(${hue},100%,${front ? 65 : 45}%,${front ? 0.9 : 0.4})`;
        ctx.lineWidth = (front ? 7 : 4) * u;
        ctx.shadowColor = `hsl(${hue},100%,60%)`;
        ctx.shadowBlur = 12 * u;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      ctx.restore();
      if (p < 1) {
        const e = shown.at(-1);
        tips.push({ x: e[0], y: e[1], color: "#FFFFFF" });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const dot = size * 0.13 * u;
      const cw = dot * 6;
      const chars = value.split("").filter((c) => LED[c]);
      const total = chars.length * cw;
      const left = X(x) - total / 2;
      const top = Y(y) - dot * 3.5;
      const sweep = clamp((t - at) / 0.4);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "#FFC23A";
      ctx.shadowColor = "#FF9A1A";
      ctx.shadowBlur = 8 * u;
      chars.forEach((c, i) => {
        const rows = LED[c];
        for (let r = 0;r < 7; r++) {
          for (let k = 0;k < 5; k++) {
            if (!(rows[r] & 1 << 4 - k))
              continue;
            const px = left + i * cw + k * dot;
            if ((px - left) / total > sweep)
              continue;
            ctx.beginPath();
            ctx.arc(px + dot / 2, top + r * dot + dot / 2, dot * 0.38, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
      ctx.restore();
      if (sub)
        script(sub, X(x), top - size * 0.35 * u, size * 0.4, LIGHT.ink, "center", at + 0.2, 0.45);
      if (sub) {
        const ring = ellipse(X(x), Y(y), total * 0.7, size * 0.75 * u, 40, -Math.PI * 0.6, 1.05);
        const p = trail(ring, at + dur + 0.1, 0.5, LIGHT.accent, 2.5);
        if (p >= 1) {
          const b = clamp((t - (at + dur + 0.6)) / 0.6);
          if (b > 0 && b < 1) {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            for (let i = 0;i < 18; i++) {
              const a = i / 18 * Math.PI * 2;
              const d = total * 0.7 + b * 50 * u;
              ctx.fillStyle = `rgba(255,220,150,${1 - b})`;
              ctx.beginPath();
              ctx.arc(X(x) + Math.cos(a) * d, Y(y) + Math.sin(a) * d * 0.6, 2 * u, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 34 } = o;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check")
        trail([
          [cx - s * 0.5, cy],
          [cx - s * 0.12, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5]
        ], at, dur, LIGHT.good, 3.5);
      else {
        trail([
          [cx - s * 0.45, cy - s * 0.45],
          [cx + s * 0.45, cy + s * 0.45]
        ], at, dur / 2, LIGHT.bad, 3.5);
        trail([
          [cx + s * 0.45, cy - s * 0.45],
          [cx - s * 0.45, cy + s * 0.45]
        ], at + dur / 2, dur / 2, LIGHT.bad, 3.5);
      }
    },
    finish() {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const { x, y, color } of tips) {
        const r = 22 * u;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.2, alpha(color, 0.9));
        g.addColorStop(1, alpha(color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    }
  };
}
var light_painting_default = {
  id: "light-painting",
  name: "Light painting",
  category: "Light & Imaging",
  make: make35
};

// plugin/skills/motion-graphics/styles/linocut.ts
var PAPER5 = "#EDE4CF";
var BLOCK3 = "#1D1A18";
var CUT = "#EFE5CC";
var RED5 = "#D2483A";
var COL = { ink: CUT, accent: RED5, good: CUT, bad: RED5, muted: "#9C9384" };
var CAPS = '"Rockwell", "Futura", "Avenir Next Condensed", "Arial Black", sans-serif';
var PENCIL = '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';
function make36(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const tq = Math.floor(t * 12) / 12;
  const g = globalThis;
  g.__linoSalt ??= new Map;
  const cache = g.__linoSalt;
  const bx = W * 0.02;
  const by = H * 0.025;
  const bw = W * 0.96;
  const bh = H * 0.87;
  function peeled(x, y, w, h, at, dur, draw) {
    const p = clamp((t - at) / dur);
    if (p <= 0)
      return;
    ctx.save();
    if (p < 1) {
      const d = (w + h) * p * 1.05;
      ctx.beginPath();
      ctx.moveTo(x - 10 * u, y - 10 * u);
      ctx.lineTo(x + d, y - 10 * u);
      ctx.lineTo(x - 10 * u, y + d);
      ctx.closePath();
      ctx.clip();
    }
    draw();
    ctx.restore();
  }
  function gouge(points, width, color) {
    if (points.length < 2)
      return;
    const left = [];
    const right = [];
    points.forEach((pt, i) => {
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(points.length - 1, i + 1)];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
      const f = i / (points.length - 1);
      const w = width / 2 * Math.sin(Math.PI * Math.min(1, 0.15 + f * 0.85)) + 0.6 * u;
      left.push([pt[0] + Math.cos(ang) * w, pt[1] + Math.sin(ang) * w]);
      right.push([pt[0] - Math.cos(ang) * w, pt[1] - Math.sin(ang) * w]);
    });
    trace(ctx, [...left, ...right.reverse()], true);
    ctx.fillStyle = color;
    ctx.fill();
  }
  function caps(s, x, y, size, color, align = "center", spacing = 0.12) {
    ctx.font = `900 ${Math.round(size * u)}px ${CAPS}`;
    ctx.letterSpacing = `${(size * spacing * u).toFixed(1)}px`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(s.toUpperCase(), x, y);
    ctx.letterSpacing = "0px";
  }
  function saltTile() {
    const key = `${W}x${H}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      c.beginPath();
      c.rect(bx, by, bw, bh);
      c.clip();
      for (let i = 0;i < W * H / 120; i++) {
        c.fillStyle = `rgba(237,228,207,${0.2 + 0.55 * hash(i * 0.61)})`;
        const s = 1 + hash(i * 4.4) * 2;
        c.fillRect(hash(i * 1.71) * W, hash(i * 2.39) * H, s, s * (0.5 + hash(i)));
      }
      cache.set(key, tile);
    }
    return tile;
  }
  let titleText = "";
  return {
    surface() {
      ctx.fillStyle = PAPER5;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(150,130,100,0.12)";
      ctx.lineWidth = 1 * u;
      for (let i = 0;i < 60; i++) {
        const x = hash(i * 3.7) * W;
        const y = hash(i * 5.3) * H;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 20 * u, y + (hash(i) - 0.5) * 20 * u, x + (30 + 40 * hash(i + 1)) * u, y + (hash(i + 2) - 0.5) * 10 * u);
        ctx.stroke();
      }
      const edge = [
        ...Array.from({ length: 21 }, (_, i) => [bx + bw * i / 20, by]),
        ...Array.from({ length: 11 }, (_, i) => [bx + bw, by + bh * i / 10]),
        ...Array.from({ length: 21 }, (_, i) => [bx + bw - bw * i / 20, by + bh]),
        ...Array.from({ length: 11 }, (_, i) => [bx, by + bh - bh * i / 10])
      ];
      trace(ctx, roughen(edge, 1.6 * u, 3), true);
      ctx.fillStyle = BLOCK3;
      ctx.fill();
      ctx.strokeStyle = CUT;
      ctx.lineWidth = 2.5 * u;
      trace(ctx, roughen(edge.map(([x, y]) => [x + (x < W / 2 ? 12 : -12) * u, y + (y < H / 2 ? 12 : -12) * u]), 1.2 * u, 9), true);
      ctx.stroke();
      for (let i = 0;i < 26; i++) {
        const x = bx + 30 * u + hash(i * 7.1) * (bw - 60 * u);
        const y = by + 40 * u + hash(i * 3.9) * (bh - 80 * u);
        const L = (18 + 30 * hash(i)) * u;
        const a = -0.5 + hash(i * 1.3) * 0.3;
        gouge([
          [x, y],
          [x + Math.cos(a) * L * 0.5, y + Math.sin(a) * L * 0.5],
          [x + Math.cos(a) * L, y + Math.sin(a) * L]
        ], 3 * u, "rgba(239,229,204,0.5)");
      }
    },
    title(s, o = {}) {
      titleText = s;
      const { x = 0.035, y = 0.075, size = 38, at = 0, dur = 0.6 } = o;
      ctx.save();
      ctx.font = `900 ${Math.round(size * u)}px ${CAPS}`;
      ctx.letterSpacing = `${(size * 0.12 * u).toFixed(1)}px`;
      const w = ctx.measureText(s.toUpperCase()).width + 40 * u;
      ctx.restore();
      const h = size * 1.5 * u;
      const l = X(x);
      const tp = Y(y) - h / 2;
      peeled(l, tp, w, h, at, dur, () => {
        trace(ctx, roughen([
          [l, tp],
          [l + w, tp],
          [l + w, tp + h],
          [l, tp + h]
        ], 1.5 * u, 2), true);
        ctx.fillStyle = RED5;
        ctx.fill();
        caps(s, l + 20 * u, Y(y) + 2 * u, size, CUT, "left");
      });
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 22, tone = "ink", align = "center" } = o;
      const w = s.length * size * 0.9 * u;
      peeled(X(x) - w / 2, Y(y) - size * u, w, size * 2 * u, at, 0.3, () => caps(s, X(x), Y(y), size, COL[tone], align));
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const R = r * u;
      const cx = X(x);
      const cy = Y(y);
      peeled(cx - R * 1.5, cy - R * 1.5, R * 3, R * 3, at, 0.25, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = COL[tone];
        ctx.fill();
        gouge(ellipse(cx, cy, R, R, 24, -Math.PI / 2, 0.92), 3.5 * u, CUT);
        for (let i = 0;i < 6; i++) {
          const a = i / 6 * Math.PI * 2 + hash(x * 9 + i);
          gouge([
            [cx + Math.cos(a) * R * 1.2, cy + Math.sin(a) * R * 1.2],
            [cx + Math.cos(a) * R * 1.55, cy + Math.sin(a) * R * 1.55]
          ], 2.5 * u, CUT);
        }
      });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
      peeled(l - 6 * u, tp - 6 * u, ww + 12 * u, hh + 12 * u, at, 0.5, () => {
        trace(ctx, roughen([
          [l, tp],
          [l + ww / 2, tp],
          [l + ww, tp],
          [l + ww, tp + hh / 2],
          [l + ww, tp + hh],
          [l + ww / 2, tp + hh],
          [l, tp + hh],
          [l, tp + hh / 2]
        ], 2.2 * u, x * 13), true);
        ctx.fillStyle = CUT;
        ctx.fill();
        if (tone === "good" || tone === "bad" || tone === "accent") {
          ctx.fillStyle = RED5;
          ctx.fillRect(l, tp + hh - 12 * u, ww, 12 * u);
        }
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = clamp((tq - at) / dur);
      if (p <= 0)
        return;
      const pts = roughen(curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 24), 1 * u, x1 * 31 + y2 * 17);
      const res = along(pts, p);
      const color = tone === "bad" ? RED5 : head ? CUT : "rgba(239,229,204,0.55)";
      gouge(res.points, (head ? 7 : 2.4) * u, color);
      if (head && p >= 1) {
        const tip = pts.at(-1);
        const s = 18 * u;
        trace(ctx, [
          [tip[0] + Math.cos(res.angle) * 4 * u, tip[1] + Math.sin(res.angle) * 4 * u],
          [tip[0] - Math.cos(res.angle - 0.5) * s, tip[1] - Math.sin(res.angle - 0.5) * s],
          [tip[0] - Math.cos(res.angle + 0.5) * s, tip[1] - Math.sin(res.angle + 0.5) * s]
        ], true);
        ctx.fillStyle = color;
        ctx.fill();
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      for (let i = 0;i < 3; i++) {
        const cw = X(w) * 0.9;
        const ch = Y(h) * 0.55;
        const l = X(x) + (i - 1) * 12 * u + (X(w) - cw) / 2;
        const tp = Y(y) + i * Y(h) * 0.22;
        peeled(l - 4 * u, tp - 4 * u, cw + 8 * u, ch + 8 * u, at + i * dur / 4, 0.3, () => {
          trace(ctx, roughen([
            [l, tp],
            [l + cw, tp],
            [l + cw, tp + ch],
            [l, tp + ch]
          ], 1.6 * u, i * 7 + 1), true);
          ctx.fillStyle = CUT;
          ctx.fill();
          ctx.fillStyle = RED5;
          ctx.fillRect(l, tp + ch * 0.72, cw, ch * 0.28);
          ctx.strokeStyle = BLOCK3;
          ctx.lineWidth = 3 * u;
          ctx.beginPath();
          ctx.arc(l + cw / 2, tp + ch * 0.36, ch * 0.2, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const value = count ? counting(tq, at, dur, count) + s : s;
      const j = (hash(Math.floor(t * 12) + x * 50) - 0.5) * 2 * u;
      const inBox = size < 80;
      peeled(X(x) - size * 2 * u, Y(y) - size * u, size * 4 * u, size * 2 * u, at, 0.3, () => {
        caps(value, X(x) + j, Y(y) - j, size, inBox ? BLOCK3 : tone === "accent" ? CUT : COL[tone], "center", 0.02);
        if (sub)
          caps(sub, X(x), Y(y) - size * 0.82 * u, size * 0.24, CUT, "center", 0.3);
        if (!inBox && count && t > at + dur) {
          ctx.fillStyle = RED5;
          ctx.fillRect(X(x) - size * 0.9 * u, Y(y) + size * 0.62 * u, size * 1.8 * u, 7 * u);
        }
      });
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const s = (o.size ?? 30) * u;
      const cx = X(x);
      const cy = Y(y);
      const p = clamp((tq - at) / 0.3);
      if (p <= 0)
        return;
      if (kind === "check")
        gouge(along([
          [cx - s * 0.5, cy],
          [cx - s * 0.1, cy + s * 0.45],
          [cx + s * 0.6, cy - s * 0.55]
        ], p).points, 9 * u, RED5);
      else {
        gouge(along([
          [cx - s * 0.5, cy - s * 0.5],
          [cx + s * 0.5, cy + s * 0.5]
        ], p).points, 9 * u, RED5);
        if (p > 0.5)
          gouge([
            [cx + s * 0.5, cy - s * 0.5],
            [cx - s * 0.5, cy + s * 0.5]
          ], 9 * u, RED5);
      }
    },
    finish() {
      ctx.drawImage(saltTile(), 0, 0);
      ctx.save();
      ctx.font = `italic 400 ${Math.round(20 * u)}px ${PENCIL}`;
      ctx.fillStyle = "rgba(90,84,76,0.75)";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      if (titleText)
        ctx.fillText(titleText, bx + 8 * u, by + bh + 26 * u);
      ctx.textAlign = "right";
      ctx.fillText(`proof ${1 + Math.min(4, Math.floor(t / 2))}/5`, bx + bw - 8 * u, by + bh + 26 * u);
      ctx.restore();
    }
  };
}
var linocut_default = { id: "linocut", name: "Linocut print", category: "Print", make: make36 };

// plugin/skills/motion-graphics/styles/low-poly.ts
var FACET = {
  ink: ["#F3EEFA", "#DCD3EE", "#C2B6DE", "#A497C9"],
  accent: ["#F7A8D0", "#A9B8F5", "#D58CE0", "#7F90E6", "#F2C4E8"],
  good: ["#B5F0CF", "#7FDDB0", "#5AC596", "#3EA77C"],
  bad: ["#FF9C8A", "#F2705E", "#D9524A", "#B83E3E"],
  muted: ["#8E86B0", "#776E9E", "#625A8A", "#4E4775"]
};
var PLUM2 = "#3B2E52";
var SANS6 = '"Space Grotesk", "Avenir Next", "Helvetica Neue", Arial, sans-serif';
function make37(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__lowPoly ??= new Map;
  const cache = g.__lowPoly;
  const flip = (at = 0) => spring(t, { start: at, stiffness: 200, damping: 16 });
  function valley() {
    const key = `${W}x${H}`;
    let tex = cache.get(key);
    if (tex)
      return tex;
    tex = new OffscreenCanvas(W, H);
    const c = tex.getContext("2d");
    const sky = c.createLinearGradient(0, 0, 0, H * 0.6);
    sky.addColorStop(0, "#4A3F6E");
    sky.addColorStop(1, "#B9A3CF");
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#F4DE9A";
    c.beginPath();
    c.arc(W * 0.62, H * 0.12, H * 0.06, 0, Math.PI * 2);
    c.fill();
    const tri = (p, col) => {
      c.fillStyle = col;
      c.strokeStyle = col;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(p[0]?.[0], p[0]?.[1]);
      c.lineTo(p[1]?.[0], p[1]?.[1]);
      c.lineTo(p[2]?.[0], p[2]?.[1]);
      c.closePath();
      c.fill();
      c.stroke();
    };
    for (let i = 0;i < 11; i++) {
      const far = i < 6;
      const px = far ? W * (i / 5) + (hash(i) - 0.5) * W * 0.15 : W * hash(i * 1.7);
      const py = H * (far ? 0.08 + hash(i + 3) * 0.2 : 0.3 + hash(i + 3) * 0.12);
      const base = H * 0.6;
      const half = W * (0.12 + hash(i + 7) * 0.1);
      const mid = [px + (hash(i + 9) - 0.5) * half * 0.4, base];
      const k = far ? 0 : 1;
      const lit = [
        ["#C2B2DF", "#B1A0D4", "#A391C9"],
        ["#9C8CC2", "#8E7EB6", "#8070AA"]
      ][k];
      const dim = [
        ["#8F7EB6", "#8070A8", "#75659E"],
        ["#6F6198", "#64568C", "#5A4D82"]
      ][k];
      const l = [px - half, base];
      const r = [px + half, base];
      const a1 = [lerp(px, l[0], 0.55), lerp(py, base, 0.55) - H * 0.02];
      const b1 = [lerp(px, r[0], 0.5), lerp(py, base, 0.5) - H * 0.015];
      const pk = [px, py];
      tri([pk, a1, mid], lit[0]);
      tri([a1, l, mid], lit[1]);
      tri([pk, a1, [lerp(px, mid[0], 0.5), lerp(py, base, 0.5)]], lit[2]);
      tri([pk, mid, b1], dim[0]);
      tri([b1, mid, r], dim[1]);
      tri([pk, b1, [lerp(px, r[0], 0.2), lerp(py, base, 0.25)]], dim[2]);
      if (far)
        tri([
          pk,
          [lerp(px, l[0], 0.28), lerp(py, base, 0.28)],
          [lerp(px, r[0], 0.22), lerp(py, base, 0.3)]
        ], "#EEE6F7");
    }
    const cols = 22;
    const rows = 10;
    const pt = (i, j) => {
      const f = j / rows;
      return [
        (i + (hash(i * 7 + j * 13) - 0.5) * 0.8) / cols * W * 1.1 - W * 0.05,
        H * (0.55 + 0.45 * f ** 1.4) + (hash(i + j * 31) - 0.5) * H * 0.02 * (j > 0 && j < rows ? 1 : 0)
      ];
    };
    for (let j = 0;j < rows; j++)
      for (let i = 0;i < cols; i++) {
        const a = pt(i, j);
        const b = pt(i + 1, j);
        const cc = pt(i, j + 1);
        const d = pt(i + 1, j + 1);
        const fog = 1 - j / rows;
        const shade = (k) => {
          const v = hash(i * 3.1 + j * 5.7 + k);
          const path = Math.abs(i - cols * 0.45 - j * 0.3) < 2.2;
          const [r0, g0, b0] = path ? [205, 170, 190] : [60 + v * 30, 120 + v * 40, 100 + v * 25];
          const mix = (q, f) => Math.round(lerp(q, f, fog * 0.7));
          return `rgb(${mix(r0, 185)},${mix(g0, 170)},${mix(b0, 210)})`;
        };
        tri([a, b, cc], shade(0));
        tri([b, d, cc], shade(1));
      }
    for (let i = 0;i < 70; i++) {
      const x = hash(i * 2.3) * W;
      const y = H * (0.6 + hash(i * 4.1) ** 0.7 * 0.4);
      const s = (8 + (y / H - 0.55) * 60) * (W / 1280);
      if (Math.abs(x / W - 0.45 - (y / H - 0.55) * 0.5) < 0.08)
        continue;
      tri([
        [x, y - s * 2.4],
        [x - s, y],
        [x, y]
      ], "#2F6B55");
      tri([
        [x, y - s * 2.4],
        [x, y],
        [x + s, y]
      ], "#1F4D40");
    }
    cache.set(key, tex);
    return tex;
  }
  function cut(x, y, w, h, c) {
    trace(ctx, [
      [x + c, y],
      [x + w, y],
      [x + w, y + h - c],
      [x + w - c, y + h],
      [x, y + h],
      [x, y + c]
    ], true);
  }
  function tag(s, cx, cy, size, fill, ink, align = "center") {
    ctx.font = `600 ${Math.round(size * u)}px ${SANS6}`;
    const w = ctx.measureText(s).width + size * u;
    const h = size * 1.6 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    ctx.fillStyle = "rgba(20,10,40,0.3)";
    cut(left + 3 * u, cy - h / 2 + 4 * u, w, h, 6 * u);
    ctx.fill();
    ctx.fillStyle = fill;
    cut(left, cy - h / 2, w, h, 6 * u);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + size * 0.5 * u, cy + u);
  }
  function flipped(cx, cy, at, draw) {
    const s = flip(at);
    if (s <= 0)
      return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, s);
    ctx.translate(-cx, -cy);
    ctx.globalAlpha = clamp(s * 2);
    draw();
    ctx.restore();
  }
  return {
    surface() {
      ctx.drawImage(valley(), 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 40, at = 0, align = "left" } = o;
      const p = progress(t, at, o.dur ?? 0.7);
      if (p <= 0)
        return;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = `600 ${Math.round(size * u)}px ${SANS6}`;
      const tw = ctx.measureText(s).width;
      const left = align === "center" ? X(x) - tw / 2 : align === "right" ? X(x) - tw : X(x);
      ctx.fillStyle = alpha(PLUM2, 0.75);
      cut(left - 14 * u, Y(y) - size * 0.8 * u, tw + 28 * u, size * 1.6 * u, 8 * u);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(s, left, Y(y) + (1 - expo(p)) * 10 * u);
      ctx.fillStyle = "#F2705E";
      ctx.fillRect(left, Y(y) + size * 0.62 * u, tw * expo(p) * 0.5, 4 * u);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const tone = o.tone ?? "ink";
      const fill = tone === "bad" ? "#E85A50" : tone === "good" ? "#2F9E73" : PLUM2;
      flipped(X(x), Y(y), o.at, () => tag(s, X(x), Y(y), o.size ?? 30, fill, "#FFFFFF", o.align ?? "center"));
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      if (t < at)
        return;
      const R = r * u * 1.5;
      const cols = FACET[tone];
      const n = 6;
      const rim = Array.from({ length: n }, (_, i) => {
        const a = i / n * Math.PI * 2 - Math.PI / 2;
        return [X(x) + Math.cos(a) * R, Y(y) + Math.sin(a) * R * 1.1];
      });
      const core = [X(x) - R * 0.15, Y(y) - R * 0.2];
      ctx.fillStyle = "rgba(30,15,50,0.35)";
      trace(ctx, rim.map(([a, b]) => [a + 3 * u, b + 5 * u]), true);
      if (flip(at) > 0.6)
        ctx.fill();
      for (let i = 0;i < n; i++) {
        const s = flip(at + i * 0.04);
        if (s <= 0)
          continue;
        const a = rim[i];
        const b = rim[(i + 1) % n];
        const mid = [(a[0] + b[0] + core[0]) / 3, (a[1] + b[1] + core[1]) / 3];
        const sc = (q) => [mid[0] + (q[0] - mid[0]) * s, mid[1] + (q[1] - mid[1]) * s];
        ctx.fillStyle = cols[i % cols.length];
        trace(ctx, [sc(core), sc(a), sc(b)], true);
        ctx.fill();
      }
    },
    box(x, y, w, h, o = {}) {
      const tone = o.tone ?? "ink";
      flipped(X(x + w / 2), Y(y + h / 2), o.at, () => {
        const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
        const c = 18 * u;
        ctx.fillStyle = "rgba(20,10,40,0.3)";
        cut(x0 + 8 * u, y0 + 10 * u, bw, bh, c);
        ctx.fill();
        ctx.fillStyle = "#F5F1FA";
        cut(x0, y0, bw, bh, c);
        ctx.fill();
        ctx.fillStyle = "rgba(120,100,170,0.12)";
        trace(ctx, [
          [x0 + bw, y0],
          [x0 + bw, y0 + bh - c],
          [x0 + bw - c, y0 + bh],
          [x0 + bw * 0.4, y0 + bh]
        ], true);
        ctx.fill();
        ctx.fillStyle = (FACET[tone] ?? FACET.ink)[tone === "ink" ? 3 : 2];
        trace(ctx, [
          [x0, y0 + c],
          [x0 + c, y0],
          [x0 + c * 2.2, y0],
          [x0, y0 + c * 2.2]
        ], true);
        ctx.fill();
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, head ? 5 : 1);
      const n = Math.max(1, Math.ceil((pts.length - 1) * expo(p)));
      const shown = pts.slice(0, n + 1);
      const light = tone === "bad" ? "#FF8F7E" : tone === "accent" ? "#E6DDF7" : "#FFFFFF";
      const dark = tone === "bad" ? "#C2453D" : tone === "accent" ? PLUM2 : "#B4A8D4";
      const wd = (head ? 7 : 3.5) * u;
      ctx.save();
      ctx.lineJoin = "miter";
      ctx.globalAlpha = head ? 1 : 0.7;
      trace(ctx, shown.map(([a, b]) => [a, b + wd * 0.35]));
      ctx.strokeStyle = dark;
      ctx.lineWidth = wd;
      ctx.stroke();
      trace(ctx, shown.map(([a, b]) => [a, b - wd * 0.15]));
      ctx.strokeStyle = light;
      ctx.lineWidth = wd * 0.6;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-2);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 22 * u;
        const l = [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s];
        const r = [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s];
        const back = [end[0] - Math.cos(a) * s * 0.6, end[1] - Math.sin(a) * s * 0.6];
        ctx.fillStyle = light;
        trace(ctx, [end, l, back], true);
        ctx.fill();
        ctx.fillStyle = dark;
        trace(ctx, [end, back, r], true);
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const n = 6;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.35;
      const sh = (Y(h) - ry * 2) / n;
      for (let i = 0;i < n; i++) {
        const s = flip(at + i / n * dur);
        if (s <= 0)
          continue;
        const cy = Y(y + h) - ry - i * sh - (1 - s) * 25 * u;
        const hex = (yy) => Array.from({ length: 6 }, (_, k) => {
          const a = k / 6 * Math.PI * 2;
          return [cx + Math.cos(a) * rx, yy + Math.sin(a) * ry];
        });
        const top = hex(cy - sh * 0.8);
        const bottom = hex(cy);
        ctx.globalAlpha = clamp(s * 2);
        for (const [k, col] of [
          [0, "#5E5287"],
          [1, "#4A4072"],
          [2, "#6E62A0"]
        ]) {
          const a = bottom[k];
          const b = bottom[k + 1];
          ctx.fillStyle = col;
          trace(ctx, [a, b, [b[0], b[1] - sh * 0.8], [a[0], a[1] - sh * 0.8]], true);
          ctx.fill();
        }
        ctx.fillStyle = i % 2 ? "#9C8FCB" : "#B4A8DD";
        trace(ctx, top, true);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      flipped(X(x), Y(y), at, () => {
        const value = count ? counting(t, at, dur, count) + s : s;
        ctx.font = `700 ${Math.round(size * u)}px ${SANS6}`;
        const tw = Math.max(ctx.measureText(`${value}0`).width, size * 2 * u);
        const h = size * 1.25 * u;
        const filled = tone === "accent" || tone === "bad";
        const [x0, y0] = [X(x) - tw / 2, Y(y) - h / 2];
        ctx.fillStyle = "rgba(20,10,40,0.3)";
        cut(x0 + 6 * u, y0 + 8 * u, tw, h, 14 * u);
        ctx.fill();
        ctx.fillStyle = filled ? "#F2705E" : "#FFFFFF";
        cut(x0, y0, tw, h, 14 * u);
        ctx.fill();
        ctx.fillStyle = filled ? "rgba(140,30,30,0.18)" : "rgba(120,100,170,0.1)";
        trace(ctx, [
          [x0 + tw * 0.55, y0],
          [x0 + tw, y0],
          [x0 + tw, y0 + h * 0.6]
        ], true);
        ctx.fill();
        ctx.fillStyle = filled ? "#FFFFFF" : tone === "good" ? "#21875F" : PLUM2;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(value, X(x), Y(y) + 2 * u);
        if (sub)
          tag(sub[0]?.toUpperCase() + sub.slice(1), X(x), y0 - size * 0.12 * u, size * 0.26, PLUM2, "#FFFFFF");
      });
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 24) * u;
      flipped(X(x), Y(y), o.at, () => {
        const [cx, cy] = [X(x), Y(y)];
        const cols = kind === "check" ? FACET.good : FACET.bad;
        for (let i = 0;i < 6; i++) {
          const a = i / 6 * Math.PI * 2 - Math.PI / 2;
          const b = (i + 1) / 6 * Math.PI * 2 - Math.PI / 2;
          ctx.fillStyle = cols[i % 3 + 1];
          trace(ctx, [
            [cx, cy],
            [cx + Math.cos(a) * r, cy + Math.sin(a) * r],
            [cx + Math.cos(b) * r, cy + Math.sin(b) * r]
          ], true);
          ctx.fill();
        }
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = r * 0.2;
        ctx.lineJoin = "miter";
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.42, cy],
            [cx - r * 0.1, cy + r * 0.32],
            [cx + r * 0.45, cy - r * 0.3]
          ]);
        else
          trace(ctx, [
            [cx - r * 0.35, cy - r * 0.35],
            [cx + r * 0.35, cy + r * 0.35],
            [cx, cy],
            [cx + r * 0.35, cy - r * 0.35],
            [cx - r * 0.35, cy + r * 0.35]
          ]);
        ctx.stroke();
      });
    },
    finish() {
      const fog = ctx.createLinearGradient(0, H * 0.45, 0, H * 0.7);
      fog.addColorStop(0, "rgba(200,180,225,0)");
      fog.addColorStop(0.5, "rgba(200,180,225,0.12)");
      fog.addColorStop(1, "rgba(200,180,225,0)");
      ctx.fillStyle = fog;
      ctx.fillRect(0, H * 0.45, W, H * 0.25);
    }
  };
}
var low_poly_default = {
  id: "low-poly",
  name: "Low-poly valley",
  category: "Dimensional",
  make: make37
};

// plugin/skills/motion-graphics/styles/mac-1bit.ts
var FONT2 = '"Geneva", "Chicago", "Helvetica Neue", Arial, sans-serif';
var PAT = {
  grey: [170, 85, 170, 85, 170, 85, 170, 85],
  light: [136, 0, 34, 0, 136, 0, 34, 0],
  dark: [238, 187, 238, 187, 238, 187, 238, 187],
  weave: [129, 66, 36, 24, 24, 36, 66, 129],
  desk: [136, 85, 34, 85, 136, 85, 34, 85]
};
var FILL4 = {
  ink: "white",
  accent: "grey",
  good: "weave",
  bad: "dark",
  muted: "light"
};
function make38(ctx, t, m) {
  const full = frame(m);
  const h = 360;
  const w = Math.round(full.W / full.H * h);
  const g = globalThis;
  g.__mac1 ??= { pats: {} };
  const st = g.__mac1;
  if (!st.buf || st.buf.width !== w)
    st.buf = new OffscreenCanvas(w, h);
  const c = st.buf.getContext("2d", { willReadFrequently: true });
  const { u, X, Y } = frame({ width: w, height: h });
  const R = Math.round;
  let pointer = null;
  let pointerAt = -1;
  function pattern(name) {
    if (name === "white")
      return "#fff";
    if (!st.pats[name]) {
      const tile = new OffscreenCanvas(8, 8);
      const x = tile.getContext("2d");
      x.fillStyle = "#fff";
      x.fillRect(0, 0, 8, 8);
      x.fillStyle = "#000";
      PAT[name].forEach((row, y) => {
        for (let i = 0;i < 8; i++)
          if (row & 128 >> i)
            x.fillRect(i, y, 1, 1);
      });
      st.pats[name] = tile;
    }
    return c.createPattern(st.pats[name], "repeat");
  }
  const arrived = (at, x, y) => {
    if (t >= at && at >= pointerAt) {
      pointerAt = at;
      pointer = [x, y];
    }
  };
  const font = (size, bold = true) => `${bold ? "bold " : ""}${Math.max(10, R(size * u))}px ${FONT2}`;
  function write(s, x, y, size, align = "left", bold = true, color = "#000") {
    c.font = font(size, bold);
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = "middle";
    c.fillText(s, R(x), R(y));
  }
  function panel(x, y, ww, hh, fill = "white") {
    x = R(x);
    y = R(y);
    ww = R(ww);
    hh = R(hh);
    c.fillStyle = "#000";
    c.fillRect(x + 2, y + 2, ww, hh);
    c.fillStyle = pattern(fill);
    c.fillRect(x, y, ww, hh);
    c.strokeStyle = "#000";
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, ww - 1, hh - 1);
  }
  function ants(x, y, ww, hh) {
    c.save();
    c.setLineDash([3, 3]);
    c.lineDashOffset = -Math.floor(t * 12);
    c.strokeStyle = "#000";
    c.lineWidth = 1;
    c.strokeRect(R(x) - 3.5, R(y) - 3.5, R(ww) + 7, R(hh) + 7);
    c.restore();
  }
  const win = { x: 0.02 * w, y: 0.075 * h, w: 0.96 * w, h: 0.9 * h };
  return {
    surface() {
      c.imageSmoothingEnabled = false;
      c.fillStyle = pattern("desk");
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#fff";
      c.fillRect(0, 0, w, 18);
      c.fillStyle = "#000";
      c.fillRect(0, 18, w, 1);
      ["File", "Edit", "View", "Special"].reduce((x, s) => {
        write(s, x, 9, 0, "left");
        return x + c.measureText(s).width + 16;
      }, 30);
      const z = progress(t, 0, 0.35);
      if (z < 1) {
        c.strokeStyle = "#000";
        for (let k = 0;k < 3; k++) {
          const f = Math.min(1, Math.floor(z * 6) / 6 + k * 0.08);
          const ww = win.w * f;
          const hh = win.h * f;
          c.strokeRect(R(w / 2 - ww / 2) + 0.5, R(win.y + win.h / 2 - hh / 2) + 0.5, R(ww), R(hh));
        }
        return;
      }
      panel(win.x, win.y, win.w, win.h);
      c.fillStyle = "#000";
      c.fillRect(R(win.x), R(win.y) + 19, R(win.w), 1);
      for (let y = 4;y < 17; y += 2)
        c.fillRect(R(win.x) + 2, R(win.y) + y, R(win.w) - 4, 1);
      c.fillStyle = "#fff";
      c.fillRect(R(win.x) + 10, R(win.y) + 4, 13, 12);
      c.strokeStyle = "#000";
      c.strokeRect(R(win.x) + 11.5, R(win.y) + 5.5, 10, 9);
    },
    title(text, o = {}) {
      const { at = 0, dur = 0.6 } = o;
      if (t < at)
        return;
      const n = Math.ceil(text.length * progress(t, at, dur));
      c.font = font(44);
      const tw = c.measureText(text).width;
      c.fillStyle = "#fff";
      c.fillRect(R(w / 2 - tw / 2 - 8), R(win.y) + 2, R(tw + 16), 16);
      write(text.slice(0, n), w / 2 - tw / 2, win.y + 10, 44);
    },
    label(text, x, y, o = {}) {
      const { at = 0, size = 40, tone = "ink", align = "center" } = o;
      if (t < at)
        return;
      arrived(at, X(x), Y(y));
      const sel = t - at < 0.18;
      c.font = font(size, tone !== "muted");
      const tw = c.measureText(text).width;
      const bx = align === "center" ? X(x) - tw / 2 : align === "right" ? X(x) - tw : X(x);
      if (sel) {
        c.fillStyle = "#000";
        c.fillRect(R(bx) - 3, R(Y(y) - size * u * 0.6), R(tw) + 6, R(size * u * 1.2));
      }
      write(text, bx, Y(y), size, "left", tone !== "muted", sel ? "#fff" : "#000");
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      if (t < at)
        return;
      arrived(at, X(x), Y(y));
      const rr = Math.max(3, R(r * u * 1.1));
      c.beginPath();
      c.arc(R(X(x)) + 2, R(Y(y)) + 2, rr, 0, Math.PI * 2);
      c.fillStyle = "#000";
      c.fill();
      c.beginPath();
      c.arc(R(X(x)), R(Y(y)), rr, 0, Math.PI * 2);
      c.fillStyle = pattern(t - at < 0.1 ? "dark" : FILL4[tone]);
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = "#000";
      c.stroke();
    },
    box(x, y, bw, bh, o = {}) {
      const { at = 0, dur = 0.4 } = o;
      if (t < at)
        return;
      arrived(at, X(x + bw), Y(y + bh));
      panel(X(x), Y(y), X(bw), Y(bh));
      if (t - at < dur)
        ants(X(x), Y(y), X(bw), Y(bh));
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (t < at)
        return;
      const p = Math.max(0.25, Math.floor(progress(t, at, dur) * 4) / 4);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, R(pts.length * p)));
      c.save();
      c.strokeStyle = "#000";
      c.lineWidth = head ? 1.5 : 1;
      if (tone === "bad")
        c.setLineDash([4, 3]);
      if (!head && tone !== "bad")
        c.globalAlpha = 0.55;
      c.beginPath();
      for (const [i, [px, py]] of shown.entries())
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      c.stroke();
      c.restore();
      if (head && p >= 1) {
        const e = pts.at(-1);
        const q = pts.at(-3);
        const a = Math.atan2(e[1] - q[1], e[0] - q[0]);
        c.fillStyle = "#000";
        c.beginPath();
        c.moveTo(e[0], e[1]);
        c.lineTo(e[0] - Math.cos(a - 0.45) * 8, e[1] - Math.sin(a - 0.45) * 8);
        c.lineTo(e[0] - Math.cos(a + 0.45) * 8, e[1] - Math.sin(a + 0.45) * 8);
        c.fill();
      }
    },
    store(x, y, bw, bh, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (t < at)
        return;
      arrived(at, X(x + bw / 2), Y(y + bh / 2));
      const n = 3;
      for (let i = 0;i < n; i++) {
        if (t < at + i * dur / n)
          continue;
        const ox = X(x) + i * 5;
        const oy = Y(y) + i * 6;
        const dw = X(bw) - 10;
        const dh = Y(bh) - 12;
        const f = Math.min(dw, dh) * 0.25;
        c.beginPath();
        c.moveTo(R(ox) + 0.5, R(oy) + 0.5);
        c.lineTo(R(ox + dw - f) + 0.5, R(oy) + 0.5);
        c.lineTo(R(ox + dw) + 0.5, R(oy + f) + 0.5);
        c.lineTo(R(ox + dw) + 0.5, R(oy + dh) + 0.5);
        c.lineTo(R(ox) + 0.5, R(oy + dh) + 0.5);
        c.closePath();
        c.fillStyle = "#fff";
        c.fill();
        c.strokeStyle = "#000";
        c.lineWidth = 1;
        c.stroke();
        c.beginPath();
        c.moveTo(R(ox + dw - f) + 0.5, R(oy) + 0.5);
        c.lineTo(R(ox + dw - f) + 0.5, R(oy + f) + 0.5);
        c.lineTo(R(ox + dw) + 0.5, R(oy + f) + 0.5);
        c.stroke();
        c.fillStyle = "#000";
        for (let ly = oy + f + 4;ly < oy + dh - 3; ly += 4)
          c.fillRect(R(ox) + 4, R(ly), R(dw * (0.5 + 0.3 * (ly / 4 % 2))), 1);
      }
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub } = o;
      if (t < at)
        return;
      arrived(at, X(x) + 30, Y(y) + 20);
      const s = count ? counting(t, at, dur, count) + text : text;
      write(s, X(x), Y(y) - (sub ? size * u * 0.3 : 0), size * 1.1, "center");
      if (sub)
        write(sub, X(x), Y(y) + size * u * 0.7, size * 0.4, "center", false);
      if (progress(t, at, dur) >= 1 && count) {
        c.font = font(size * 1.1);
        const tw = c.measureText(s).width;
        ants(X(x) - tw / 2, Y(y) - size * u * (sub ? 1 : 0.65), tw, size * u * (sub ? 2 : 1.3));
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 40 } = o;
      if (t < at)
        return;
      arrived(at, X(x), Y(y));
      const r = Math.max(5, R(size * u * 0.8));
      const cx = R(X(x));
      const cy = R(Y(y));
      c.strokeStyle = "#000";
      c.lineWidth = 2;
      c.beginPath();
      if (kind === "check") {
        c.moveTo(cx - r * 0.6, cy);
        c.lineTo(cx - r * 0.2, cy + r * 0.6);
        c.lineTo(cx + r * 0.6, cy - r * 0.8);
      } else {
        c.moveTo(cx - r * 0.5, cy - r * 0.5);
        c.lineTo(cx + r * 0.5, cy + r * 0.5);
        c.moveTo(cx + r * 0.5, cy - r * 0.5);
        c.lineTo(cx - r * 0.5, cy + r * 0.5);
      }
      c.stroke();
    },
    finish() {
      if (pointer) {
        const [px, py] = pointer;
        const arrow = [
          [0, 0],
          [0, 15],
          [4, 11],
          [7, 17],
          [9, 16],
          [6, 10],
          [11, 10]
        ];
        c.beginPath();
        for (const [i, [ax, ay]] of arrow.entries())
          i ? c.lineTo(R(px) + ax, R(py) + ay) : c.moveTo(R(px) + ax, R(py) + ay);
        c.closePath();
        c.fillStyle = "#000";
        c.fill();
        c.strokeStyle = "#fff";
        c.lineWidth = 1;
        c.stroke();
      }
      const d = c.getImageData(0, 0, w, h);
      for (let i = 0;i < d.data.length; i += 4) {
        const v = d.data[i] + d.data[i + 1] + d.data[i + 2] > 382 ? 255 : 0;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
        d.data[i + 3] = 255;
      }
      c.putImageData(d, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(st.buf, 0, 0, full.W, full.H);
      ctx.restore();
    }
  };
}
var mac_1bit_default = {
  id: "mac-1bit",
  name: "One-bit desktop",
  category: "Retro Digital",
  make: make38
};

// plugin/skills/motion-graphics/styles/manga-panel.ts
var INK7 = "#111111";
var PAPER6 = "#F4F1E9";
var LETTER3 = '"Anime Ace", "Comic Sans MS", "Chalkboard SE", "Marker Felt", sans-serif';
var BOLD2 = '"Helvetica Neue", "Arial Black", Arial, sans-serif';
var SFX = '"Hiragino Kaku Gothic StdN", "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif';
function make39(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__manga ??= new Map;
  const cache = g.__manga;
  const tq = Math.floor(t * 12) / 12;
  const boil = Math.floor(t * 12);
  function slam(at = 0) {
    const s = tq - at;
    if (t < at)
      return null;
    const k = s < 1 / 12 ? 1.25 : s < 2 / 12 ? 0.94 : s < 3 / 12 ? 1.03 : 1;
    const shake = s < 0.25 ? (hash(boil * 3.1) - 0.5) * 8 * u : 0;
    return { k, dx: shake, dy: (hash(boil * 5.7) - 0.5) * (s < 0.25 ? 6 * u : 0) };
  }
  function slammed(cx, cy, at, draw) {
    const s = slam(at);
    if (!s)
      return;
    ctx.save();
    ctx.translate(cx + s.dx, cy + s.dy);
    ctx.scale(s.k, s.k);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }
  function tone() {
    const key = `tone:${u}`;
    let tile = cache.get(key);
    if (!tile) {
      const n = Math.max(4, Math.round(7 * u));
      tile = new OffscreenCanvas(n, n);
      const c = tile.getContext("2d");
      c.fillStyle = INK7;
      for (const [x, y] of [
        [0, 0],
        [n, 0],
        [0, n],
        [n, n],
        [n / 2, n / 2]
      ]) {
        c.beginPath();
        c.arc(x, y, n * 0.2, 0, Math.PI * 2);
        c.fill();
      }
      cache.set(key, tile);
    }
    return ctx.createPattern(tile, "repeat");
  }
  function page() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      b.fillStyle = PAPER6;
      b.fillRect(0, 0, W, H);
      b.strokeStyle = "rgba(110,160,210,0.4)";
      b.lineWidth = 1.2 * u;
      for (let i = 0;i < 9; i++) {
        b.beginPath();
        b.ellipse(hash(i) * W, hash(i + 4) * H, (30 + hash(i + 2) * 70) * u, (20 + hash(i + 3) * 50) * u, hash(i) * 3, 0, Math.PI * 2);
        b.stroke();
      }
      for (let i = 0;i < 6; i++) {
        b.beginPath();
        b.moveTo(hash(i * 3) * W, hash(i * 5) * H);
        b.lineTo(hash(i * 7) * W, hash(i * 9) * H);
        b.stroke();
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  function focus(cx, cy, inner, outer, n = 70) {
    ctx.save();
    ctx.fillStyle = INK7;
    for (let i = 0;i < n; i++) {
      const a = i / n * Math.PI * 2 + hash(i + boil * 13.7) * 0.08;
      const r0 = inner * (0.9 + hash(i * 3.3 + boil) * 0.5);
      const w = 0.012 + hash(i * 1.9 + boil * 2.1) * 0.02;
      trace(ctx, [
        [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0],
        [cx + Math.cos(a - w) * outer, cy + Math.sin(a - w) * outer],
        [cx + Math.cos(a + w) * outer, cy + Math.sin(a + w) * outer]
      ], true);
      ctx.fill();
    }
    ctx.restore();
  }
  function caption(s, x, y, size, align = "center", tone0 = "ink") {
    ctx.font = `700 ${Math.round(size * u)}px ${LETTER3}`;
    ctx.textBaseline = "middle";
    const text = s.toUpperCase();
    const w = ctx.measureText(text).width + size * 0.9 * u;
    const h = size * 1.55 * u;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.fillStyle = tone0 === "bad" ? INK7 : "#FFFFFF";
    ctx.fillRect(left, Y(y) - h / 2, w, h);
    ctx.strokeStyle = INK7;
    ctx.lineWidth = 2.5 * u;
    ctx.strokeRect(left, Y(y) - h / 2, w, h);
    ctx.fillStyle = tone0 === "bad" ? "#FFFFFF" : INK7;
    ctx.textAlign = "left";
    ctx.fillText(text, left + size * 0.45 * u, Y(y) + u);
  }
  function sfx(s, cx, cy, size, at) {
    if (t < at)
      return;
    ctx.save();
    ctx.translate(cx + (hash(boil * 1.3) - 0.5) * 4 * u, cy + (hash(boil * 2.9) - 0.5) * 4 * u);
    ctx.rotate(-0.25);
    ctx.font = `900 ${Math.round(size * u)}px ${SFX}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = size * 0.18 * u;
    ctx.strokeText(s, 0, 0);
    ctx.fillStyle = INK7;
    ctx.fillText(s, 0, 0);
    ctx.restore();
  }
  return {
    surface() {
      page();
      const f = 12 * u;
      ctx.strokeStyle = INK7;
      ctx.lineWidth = 5 * u;
      trace(ctx, [
        [f, f],
        [W - f, f + 4 * u],
        [W - f, H - f],
        [f, H - f - 4 * u]
      ], true);
      ctx.stroke();
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 40, at = 0 } = o;
      slammed(X(x), Y(y), at, () => caption(s, x, y, size, o.align ?? "left"));
    },
    label(s, x, y, o = {}) {
      slammed(X(x), Y(y), o.at, () => caption(s, x, y, o.size ?? 28, o.align ?? "center", o.tone));
    },
    node(x, y, r, o = {}) {
      const R = r * u;
      slammed(X(x), Y(y), o.at, () => {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.fillStyle = o.tone === "muted" ? "#CFCFCF" : tone();
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(X(x) - R * 0.3, Y(y) - R * 0.3, R * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = INK7;
        ctx.lineWidth = 4 * u;
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
        ctx.stroke();
      });
    },
    box(x, y, w, h, o = {}) {
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const sk = 8 * u;
      const corners = [
        [x0 + sk, y0],
        [x1, y0],
        [x1 - sk, y1],
        [x0, y1]
      ];
      slammed((x0 + x1) / 2, (y0 + y1) / 2, o.at, () => {
        trace(ctx, corners, true);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.save();
        trace(ctx, corners, true);
        ctx.clip();
        focus((x0 + x1) / 2, (y0 + y1) / 2, Math.min(x1 - x0, y1 - y0) * 0.34, Math.hypot(x1 - x0, y1 - y0));
        ctx.restore();
        trace(ctx, corners, true);
        ctx.strokeStyle = INK7;
        ctx.lineWidth = 5 * u;
        ctx.stroke();
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true, tone: tn = "ink" } = o;
      if (t < at)
        return;
      const p = Math.min(1, Math.ceil((tq - at) / dur * 4) / 4);
      if (p <= 0)
        return;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = along(shaft, p).points;
      ctx.save();
      ctx.lineCap = "round";
      if (!head) {
        ctx.strokeStyle = INK7;
        ctx.lineWidth = 1.3 * u;
        trace(ctx, shown);
        ctx.stroke();
        ctx.restore();
        return;
      }
      const end = shaft.at(-1);
      const prev = shaft.at(-3);
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 26 * u;
      const tipPts = [
        [end[0] + Math.cos(a) * 4 * u, end[1] + Math.sin(a) * 4 * u],
        [end[0] - Math.cos(a - 0.6) * s, end[1] - Math.sin(a - 0.6) * s],
        [end[0] - Math.cos(a + 0.6) * s, end[1] - Math.sin(a + 0.6) * s]
      ];
      const body = p >= 1 ? along(shaft, 1 - s * 0.6 / (Math.hypot(end[0] - X(x1), end[1] - Y(y1)) + 1)).points : shown;
      trace(ctx, body);
      ctx.strokeStyle = INK7;
      ctx.lineWidth = 13 * u;
      ctx.stroke();
      if (p >= 1) {
        trace(ctx, tipPts, true);
        ctx.fillStyle = INK7;
        ctx.lineJoin = "round";
        ctx.lineWidth = 6 * u;
        ctx.strokeStyle = INK7;
        ctx.stroke();
        ctx.fillStyle = tn === "bad" ? tone() : "#FFFFFF";
        ctx.fill();
      }
      trace(ctx, body);
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 7 * u;
      ctx.stroke();
      if (tn === "bad") {
        ctx.strokeStyle = tone();
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      slammed(x0 + bw / 2, y0 + bh / 2, o.at, () => {
        const ry = bw * 0.16;
        ctx.beginPath();
        ctx.ellipse(x0 + bw / 2, y0 + ry, bw / 2, ry, 0, Math.PI, 0);
        ctx.lineTo(x0 + bw, y0 + bh - ry);
        ctx.ellipse(x0 + bw / 2, y0 + bh - ry, bw / 2, ry, 0, 0, Math.PI);
        ctx.closePath();
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.fillStyle = tone();
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(x0 + bw * 0.15, y0 + ry * 2, bw * 0.12, bh - ry * 4);
        ctx.strokeStyle = INK7;
        ctx.lineWidth = 4 * u;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x0 + bw / 2, y0 + ry, bw / 2, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.stroke();
        for (const f of [0.4, 0.7]) {
          ctx.beginPath();
          ctx.ellipse(x0 + bw / 2, y0 + ry + (bh - ry * 2) * f, bw / 2, ry, 0, 0, Math.PI);
          ctx.lineWidth = 2.5 * u;
          ctx.stroke();
        }
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at)
        return;
      const value = count ? counting(tq, at, dur, count) + s : s;
      const [cx, cy] = [X(x), Y(y)];
      slammed(cx, cy, at, () => {
        ctx.font = `800 ${Math.round(size * u)}px ${BOLD2}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (size >= 80) {
          const w = ctx.measureText("000%").width + size * 0.6 * u;
          const h = size * 1.75 * u;
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(cx - w / 2, cy - h * 0.6, w, h);
          ctx.strokeStyle = INK7;
          ctx.lineWidth = 4 * u;
          ctx.strokeRect(cx - w / 2, cy - h * 0.6, w, h);
          ctx.lineWidth = 1.5 * u;
          trace(ctx, [
            [cx - w / 2 + 10 * u, cy - h * 0.6 + size * 0.45 * u],
            [cx + w / 2 - 10 * u, cy - h * 0.6 + size * 0.45 * u]
          ]);
          ctx.stroke();
          if (sub) {
            ctx.font = `700 ${Math.round(size * 0.24 * u)}px ${LETTER3}`;
            ctx.fillStyle = INK7;
            ctx.fillText(sub.toUpperCase(), cx, cy - h * 0.6 + size * 0.24 * u);
            ctx.font = `800 ${Math.round(size * u)}px ${BOLD2}`;
          }
          ctx.fillStyle = INK7;
          ctx.fillText(value, cx, cy + size * 0.12 * u);
        } else {
          ctx.lineJoin = "round";
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = size * 0.2 * u;
          ctx.strokeText(value, cx, cy);
          ctx.fillStyle = INK7;
          ctx.fillText(value, cx, cy);
          if (sub)
            caption(sub, x, y - size * 0.9 * u / H, size * 0.3);
        }
      });
      if (size >= 80)
        sfx("グン", cx - size * 1.3 * u, cy - size * 0.9 * u, size * 0.9, at + 0.1);
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 40) * u;
      const [cx, cy] = [X(x), Y(y)];
      slammed(cx, cy, o.at, () => {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const path = () => {
          if (kind === "check")
            trace(ctx, [
              [cx - s * 0.5, cy],
              [cx - s * 0.1, cy + s * 0.4],
              [cx + s * 0.6, cy - s * 0.55]
            ]);
          else {
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.45, cy - s * 0.45);
            ctx.lineTo(cx + s * 0.45, cy + s * 0.45);
            ctx.moveTo(cx + s * 0.45, cy - s * 0.45);
            ctx.lineTo(cx - s * 0.45, cy + s * 0.45);
          }
        };
        path();
        ctx.strokeStyle = INK7;
        ctx.lineWidth = s * 0.32;
        ctx.stroke();
        path();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = s * 0.16;
        ctx.stroke();
        ctx.restore();
      });
    },
    finish() {}
  };
}
var manga_panel_default = {
  id: "manga-panel",
  name: "Manga page",
  category: "Illustration",
  make: make39
};

// plugin/skills/motion-graphics/styles/math-anim.ts
var COL2 = {
  ink: "#FFFFFF",
  accent: "#58C4DD",
  good: "#83C167",
  bad: "#FC6255",
  muted: "#888888"
};
var YELLOW2 = "#FFFF00";
var SERIF6 = '"CMU Serif", "Latin Modern Roman", "Times New Roman", Times, Georgia, serif';
var smooth = (p) => {
  const x = clamp(p);
  return x * x * (3 - 2 * x);
};
function make40(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  function create(points, at, dur, color, width = 3) {
    const p = smooth(progress(t, at, dur));
    if (p <= 0)
      return null;
    const res = along(points, p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    trace(ctx, res.points);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
    return res;
  }
  function write(s, x, y, size, color, at, dur, align = "left", italic = false) {
    const p = progress(t, at, dur);
    if (p <= 0)
      return;
    ctx.save();
    ctx.font = `${italic ? "italic " : ""}400 ${Math.round(size * u)}px ${SERIF6}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 4 * u, y - size * u, (w + 8 * u) * smooth(clamp(p * 1.4)), size * 2 * u);
    ctx.clip();
    ctx.lineWidth = 1.2 * u;
    ctx.strokeStyle = color;
    ctx.strokeText(s, left, y);
    ctx.globalAlpha = smooth(clamp((p - 0.45) / 0.55));
    ctx.fillStyle = color;
    ctx.fillText(s, left, y);
    ctx.restore();
  }
  function indicate(at) {
    const k = clamp((t - at) / 0.5);
    const bump = k > 0 && k < 1 ? Math.sin(k * Math.PI) : 0;
    return { scale: 1 + 0.18 * bump, tint: bump };
  }
  function mix(color, tint) {
    return tint > 0.35 ? YELLOW2 : color;
  }
  return {
    surface() {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, W, H);
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.07, size = 44, at = 0, dur = 0.9, align = "left" } = o;
      const words = s.split(" ");
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${SERIF6}`;
      const full = ctx.measureText(s).width;
      let cx = align === "center" ? X(x) - full / 2 : align === "right" ? X(x) - full : X(x);
      const space = ctx.measureText(" ").width;
      words.forEach((w, i) => {
        const ww = ctx.measureText(w).width;
        const color = i === words.length - 1 ? COL2.accent : i === 1 ? YELLOW2 : COL2.ink;
        write(w, cx, Y(y), size, color, at + i * dur / words.length, dur / words.length + 0.25);
        cx += ww + space;
      });
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, tone = "ink", align = "center" } = o;
      write(s, X(x), Y(y), size, COL2[tone], at, o.dur ?? 0.04 * s.length + 0.3, align);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      const cx = X(x);
      const cy = Y(y);
      const R = r * 0.8 * u;
      const ring = create(ellipse(cx, cy, R, R, 40, -Math.PI / 2, 1), at, dur, COL2.ink, 2.5);
      if (!ring)
        return;
      const f = smooth(progress(t, at + dur, 0.4));
      if (f > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, R - 1.5 * u, 0, Math.PI * 2);
        ctx.fillStyle = tone === "accent" ? `rgba(255,255,255,${0.55 * f})` : `rgba(88,196,221,${0.5 * f})`;
        ctx.fill();
      }
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "ink" } = o;
      const a = [X(x), Y(y)];
      const b = [X(x + w), Y(y + h)];
      const ind = indicate(at + dur);
      create([a, [b[0], a[1]], b, [a[0], b[1]], a], at, dur, mix(tone === "ink" ? COL2.ink : COL2[tone], ind.tint), 3);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const a = [X(x1), Y(y1)];
      const b = [X(x2), Y(y2)];
      const color = !head && tone === "accent" ? (x1 * 31 + y1 * 17 + y2 * 13) % 1 > 0.5 ? "#58C4DDAA" : "#FC6255AA" : COL2[tone];
      const res = create(curve(a, b, bend, 32), at, dur, color, head ? 3 : 1.6);
      if (!res || !head || progress(t, at, dur) < 1)
        return;
      const tip = res.points.at(-1);
      const s = 16 * u;
      ctx.beginPath();
      ctx.moveTo(tip[0], tip[1]);
      ctx.lineTo(tip[0] - Math.cos(res.angle - 0.42) * s, tip[1] - Math.sin(res.angle - 0.42) * s);
      ctx.lineTo(tip[0] - Math.cos(res.angle + 0.42) * s, tip[1] - Math.sin(res.angle + 0.42) * s);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "ink" } = o;
      const l = X(x);
      const r = X(x + w);
      const top = Y(y);
      const bot = Y(y + h);
      const lip = X(w) * 0.18;
      create([
        [l + lip, top],
        [l, top],
        [l, bot],
        [l + lip, bot]
      ], at, dur * 0.5, COL2[tone], 3);
      create([
        [r - lip, top],
        [r, top],
        [r, bot],
        [r - lip, bot]
      ], at, dur * 0.5, COL2[tone], 3);
      const rows = ["x₁", "x₂", "⋮", "xₙ"];
      rows.forEach((s, i) => {
        write(s, (l + r) / 2, top + (bot - top) * (i + 0.5) / rows.length, 30, COL2.accent, at + dur * 0.4 + i * 0.08, 0.3, "center", true);
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      const p = progress(t, at, 0.4);
      if (p <= 0)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const done = count ? at + dur : at + 0.4;
      const ind = indicate(done);
      const color = tone === "accent" ? YELLOW2 : COL2[tone];
      ctx.save();
      ctx.translate(X(x), Y(y));
      ctx.scale(ind.scale, ind.scale);
      ctx.globalAlpha = smooth(p);
      ctx.font = `700 ${Math.round(size * u)}px ${SERIF6}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.fillText(value, 0, 0);
      ctx.restore();
      if (sub)
        write(sub, X(x), Y(y) - size * 0.85 * u, size * 0.32, COL2.ink, at + 0.2, 0.5, "center");
      if (count && size >= 80) {
        ctx.save();
        ctx.font = `700 ${Math.round(size * u)}px ${SERIF6}`;
        const tw = ctx.measureText(value).width;
        ctx.restore();
        const pad = 16 * u;
        const a = [X(x) - tw / 2 - pad, Y(y) - size * 0.55 * u];
        const b = [X(x) + tw / 2 + pad, Y(y) + size * 0.55 * u];
        create([a, [b[0], a[1]], b, [a[0], b[1]], a], done + 0.2, 0.6, YELLOW2, 3);
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const s = (o.size ?? 30) * u;
      const cx = X(x);
      const cy = Y(y);
      if (kind === "check")
        create([
          [cx - s * 0.5, cy],
          [cx - s * 0.12, cy + s * 0.4],
          [cx + s * 0.55, cy - s * 0.5]
        ], at, 0.35, COL2.good, 4);
      else {
        create([
          [cx - s * 0.45, cy - s * 0.45],
          [cx + s * 0.45, cy + s * 0.45]
        ], at, 0.2, COL2.bad, 4);
        create([
          [cx + s * 0.45, cy - s * 0.45],
          [cx - s * 0.45, cy + s * 0.45]
        ], at + 0.2, 0.2, COL2.bad, 4);
      }
    },
    finish() {}
  };
}
var math_anim_default = {
  id: "math-anim",
  name: "Math animation",
  category: "Popular Explainer Looks",
  make: make40
};

// plugin/skills/motion-graphics/styles/memphis.ts
var INK8 = "#1B1B1F";
var CREAM6 = "#FFF8EA";
var PINK2 = "#F7C5D5";
var MINT = "#A9E5D3";
var FILL5 = {
  ink: "#B9A6F2",
  accent: "#FF4F9A",
  good: "#2D6BFF",
  bad: "#FF5A36",
  muted: "#FFD23F"
};
var POP = ["#FF4F9A", "#FFD23F", "#2D6BFF", "#14B8A6", "#B9A6F2"];
var ROUND5 = '"Arial Rounded MT Bold", "Avenir Next", "Futura", "Helvetica Neue", sans-serif';
function make41(ctx, t0, m) {
  const { W, H, u, X, Y } = frame(m);
  const t = Math.floor(t0 * 12) / 12;
  const font = (size) => `900 ${Math.round(size * u)}px ${ROUND5}`;
  const pop = (at = 0) => spring(t, { start: at, stiffness: 240, damping: 11 });
  const bob = (seed) => Math.sin(t * 3 + seed) * 2.5 * u;
  const SH = 6 * u;
  const g = globalThis;
  g.__memphisGround ??= new Map;
  const cache = g.__memphisGround;
  function solid(color, path, lw = 4) {
    ctx.save();
    ctx.translate(SH, SH);
    path();
    ctx.fillStyle = INK8;
    ctx.fill();
    ctx.restore();
    path();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = lw * u;
    ctx.strokeStyle = INK8;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  function popped(cx, cy, at, seed, draw) {
    const s = pop(at);
    if (s <= 0)
      return;
    ctx.save();
    ctx.translate(cx, cy + bob(seed));
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }
  function words(s, x, y, size, color, align = "center") {
    ctx.font = font(size);
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineWidth = size * 0.14 * u;
    ctx.strokeStyle = INK8;
    ctx.lineJoin = "round";
    ctx.strokeText(s.toUpperCase(), x, y);
    ctx.fillStyle = color;
    ctx.fillText(s.toUpperCase(), x, y);
  }
  function ground() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const x = c.getContext("2d");
      x.fillStyle = PINK2;
      x.fillRect(0, 0, W, H);
      x.fillStyle = MINT;
      x.beginPath();
      x.moveTo(W * 0.55, 0);
      x.lineTo(W, 0);
      x.lineTo(W, H);
      x.lineTo(W * 0.38, H);
      x.closePath();
      x.fill();
      for (let i = 0;i < 700; i++) {
        x.fillStyle = i % 3 ? "rgba(27,27,31,0.35)" : POP[i % POP.length];
        x.save();
        x.translate(hash(i * 1.9) * W, hash(i * 2.7) * H);
        x.rotate(hash(i * 3.1) * Math.PI);
        x.fillRect(0, 0, (2 + hash(i) * 4) * u, 1.6 * u);
        x.restore();
      }
      x.fillStyle = "#FFE9A8";
      x.fillRect(W * 0.8, H * 0.86, W * 0.15, H * 0.08);
      x.strokeStyle = INK8;
      x.lineWidth = 3 * u;
      x.strokeRect(W * 0.8, H * 0.86, W * 0.15, H * 0.08);
      x.fillStyle = INK8;
      for (let gx = W * 0.81;gx < W * 0.95; gx += 10 * u)
        for (let gy = H * 0.875;gy < H * 0.935; gy += 10 * u)
          x.fillRect(gx, gy, 2.5 * u, 2.5 * u);
      x.beginPath();
      x.arc(0, H, 130 * u, -Math.PI / 2, 0);
      x.lineTo(0, H);
      x.fillStyle = CREAM6;
      x.fill();
      x.stroke();
      for (let i = 0;i < 40; i++) {
        const a = -hash(i * 5.5) * Math.PI / 2;
        const r = hash(i * 6.6) * 120 * u;
        x.fillStyle = POP[i % POP.length];
        x.beginPath();
        x.arc(Math.cos(a) * r, H + Math.sin(a) * r, 3 * u, 0, Math.PI * 2);
        x.fill();
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  function squiggle(x, y, w, color, phase, zig = false) {
    const pts = Array.from({ length: 41 }, (_, i) => {
      const f = i / 40;
      const wave = zig ? i / 4 % 2 ? 1 : -1 : Math.sin(f * Math.PI * 4 + phase);
      return [x + f * w, y + wave * 9 * u];
    });
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = zig ? "miter" : "round";
    trace(ctx, zig ? pts.filter((_, i) => i % 4 === 0) : pts);
    ctx.strokeStyle = INK8;
    ctx.lineWidth = 10 * u;
    ctx.stroke();
    trace(ctx, zig ? pts.filter((_, i) => i % 4 === 0) : pts);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5 * u;
    ctx.stroke();
    ctx.restore();
  }
  return {
    surface() {
      ground();
      squiggle(X(0.05), Y(0.9), 150 * u, "#14B8A6", t * 2);
      squiggle(X(0.42), Y(0.94), 120 * u, "#2D6BFF", 0, true);
      for (let i = 0;i < 14; i++) {
        const cx = hash(i * 9.1) * W;
        const cy = hash(i * 7.3) * H;
        ctx.save();
        ctx.translate(cx, cy + Math.sin(t * 2 + i) * 3 * u);
        ctx.rotate(hash(i) * 6 + t * 0.5 * (i % 2 ? 1 : -1));
        ctx.beginPath();
        ctx.moveTo(0, -6 * u);
        ctx.lineTo(6 * u, 5 * u);
        ctx.lineTo(-6 * u, 5 * u);
        ctx.closePath();
        ctx.fillStyle = POP[i % POP.length];
        ctx.fill();
        ctx.restore();
      }
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.05, size = 54, at = 0 } = o;
      ctx.font = font(size);
      const w = ctx.measureText(s.toUpperCase()).width + 48 * u;
      const h = size * 1.7 * u;
      const [bx, by] = [X(x), Y(y)];
      popped(bx + w / 2, by + h / 2, at, 1, () => {
        ctx.save();
        ctx.translate(bx + w / 2, by + h / 2);
        ctx.rotate(-0.04);
        ctx.translate(-bx - w / 2, -by - h / 2);
        solid("#FFD23F", () => {
          ctx.beginPath();
          ctx.roundRect(bx, by, w, h, 14 * u);
          ctx.moveTo(bx + 40 * u, by + h);
          ctx.lineTo(bx + 30 * u, by + h + 22 * u);
          ctx.lineTo(bx + 64 * u, by + h);
        });
        words(s, bx + w / 2, by + h / 2, size, "#FF4F9A");
        ctx.restore();
      });
    },
    label(s, x, y, o = {}) {
      const { size = 32, align = "center", tone = "ink", at = 0 } = o;
      ctx.font = font(size);
      const w = ctx.measureText(s.toUpperCase()).width + 28 * u;
      const h = size * 1.5 * u;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      popped(left + w / 2, Y(y), at, x * 20, () => {
        solid(tone === "ink" || tone === "muted" ? CREAM6 : FILL5[tone], () => {
          ctx.beginPath();
          ctx.roundRect(left, Y(y) - h / 2, w, h, h / 2);
        }, 3.5);
        ctx.font = font(size);
        ctx.fillStyle = tone === "ink" || tone === "muted" ? INK8 : CREAM6;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s.toUpperCase(), left + w / 2, Y(y) + 1 * u);
      });
    },
    node(x, y, r, o = {}) {
      const R = r * u;
      const i = Math.floor(hash(x * 91 + y * 37) * POP.length);
      const color = o.tone && o.tone !== "accent" ? FILL5[o.tone] : POP[i];
      const shape = Math.floor(hash(x * 13 + y * 71) * 3);
      popped(X(x), Y(y), o.at, x * 30 + y * 10, () => {
        solid(color, () => {
          ctx.beginPath();
          if (shape === 0)
            ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
          else if (shape === 1)
            ctx.roundRect(X(x) - R * 0.9, Y(y) - R * 0.9, R * 1.8, R * 1.8, 4 * u);
          else {
            ctx.moveTo(X(x), Y(y) - R * 1.1);
            ctx.lineTo(X(x) + R * 1.05, Y(y) + R * 0.8);
            ctx.lineTo(X(x) - R * 1.05, Y(y) + R * 0.8);
            ctx.closePath();
          }
        }, 3.5);
      });
    },
    box(x, y, w, h, o = {}) {
      popped(X(x + w / 2), Y(y + h / 2), o.at, 3, () => {
        solid(CREAM6, () => {
          ctx.beginPath();
          ctx.roundRect(X(x), Y(y), X(w), Y(h), 16 * u);
        }, 5);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(X(x), Y(y), X(w), Y(h), 16 * u);
        ctx.clip();
        ctx.fillStyle = FILL5[o.tone ?? "muted"];
        ctx.fillRect(X(x), Y(y), X(w), 16 * u);
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(X(x), Y(y) + 16 * u);
        ctx.lineTo(X(x + w), Y(y) + 16 * u);
        ctx.lineWidth = 4 * u;
        ctx.strokeStyle = INK8;
        ctx.stroke();
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.3, bend = 0, head = true, tone = "accent" } = o;
      const p = clamp((t - at) / dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 24);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      const col = FILL5[tone];
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (head) {
        ctx.save();
        ctx.translate(SH * 0.6, SH * 0.6);
        trace(ctx, shown);
        ctx.strokeStyle = INK8;
        ctx.lineWidth = 15 * u;
        ctx.stroke();
        ctx.restore();
      }
      trace(ctx, shown);
      ctx.strokeStyle = INK8;
      ctx.lineWidth = (head ? 15 : 6) * u;
      ctx.stroke();
      trace(ctx, shown);
      ctx.strokeStyle = col;
      ctx.lineWidth = (head ? 8 : 2.5) * u;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        solid(col, () => arrowhead(ctx, [end[0] + Math.cos(a) * 8 * u, end[1] + Math.sin(a) * 8 * u], a, 28 * u, false), 3.5);
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const n = 4;
      const sh = Y(h) / n;
      for (let i = n - 1;i >= 0; i--) {
        const cy = Y(y) + sh * (i + 0.5);
        popped(X(x + w / 2), cy, at + (n - 1 - i) * 0.1, i, () => {
          solid(POP[i % POP.length], () => {
            ctx.beginPath();
            if (i === 0) {
              ctx.moveTo(X(x), cy - sh * 0.45);
              ctx.lineTo(X(x + w), cy - sh * 0.45);
              ctx.lineTo(X(x + w / 2), cy + sh * 0.45);
              ctx.closePath();
            } else if (i % 2)
              ctx.roundRect(X(x), cy - sh * 0.42, X(w), sh * 0.84, sh * 0.42);
            else
              ctx.roundRect(X(x) + 6 * u, cy - sh * 0.42, X(w) - 12 * u, sh * 0.84, 4 * u);
          }, 3.5);
          if (i % 2) {
            ctx.fillStyle = INK8;
            for (let k = 0;k < 4; k++)
              ctx.fillRect(X(x) + X(w) * (0.2 + k * 0.18), cy - 2 * u, 4 * u, 4 * u);
          }
        });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "accent" } = o;
      const str = count ? counting(t, at, dur, count) + s : s;
      popped(X(x), Y(y), at, 7, () => {
        if (sub) {
          ctx.font = font(size);
          const w = ctx.measureText(`${count ? count[1] : ""}${s}`).width + 60 * u;
          const h = size * 1.9 * u;
          ctx.save();
          ctx.translate(X(x), Y(y));
          ctx.rotate(0.05);
          solid(CREAM6, () => {
            ctx.beginPath();
            ctx.roundRect(-w / 2, -h / 2, w, h, 18 * u);
          }, 5);
          words(str, 0, -size * 0.12 * u, size, FILL5[tone]);
          ctx.font = font(size * 0.26);
          ctx.fillStyle = INK8;
          ctx.textAlign = "center";
          ctx.fillText(sub.toUpperCase(), 0, size * 0.6 * u);
          ctx.restore();
        } else
          words(str, X(x), Y(y), size, FILL5[tone]);
      });
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 34) * u;
      popped(X(x), Y(y), o.at, 9, () => {
        solid(kind === "check" ? "#14B8A6" : "#FF5A36", () => {
          if (kind === "check") {
            ctx.beginPath();
            ctx.arc(X(x), Y(y), r, 0, Math.PI * 2);
          } else {
            const pts = Array.from({ length: 20 }, (_, i) => {
              const a = i / 20 * Math.PI * 2;
              const rr = i % 2 ? r * 0.7 : r * 1.15;
              return [X(x) + Math.cos(a) * rr, Y(y) + Math.sin(a) * rr];
            });
            trace(ctx, pts, true);
          }
        }, 3.5);
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = CREAM6;
        ctx.lineWidth = 7 * u;
        const [cx, cy] = [X(x), Y(y)];
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.45, cy],
            [cx - r * 0.1, cy + r * 0.35],
            [cx + r * 0.5, cy - r * 0.35]
          ]);
        else {
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.38, cy - r * 0.38);
          ctx.lineTo(cx + r * 0.38, cy + r * 0.38);
          ctx.moveTo(cx + r * 0.38, cy - r * 0.38);
          ctx.lineTo(cx - r * 0.38, cy + r * 0.38);
        }
        ctx.stroke();
        ctx.restore();
      });
    },
    finish() {}
  };
}
var memphis_default = {
  id: "memphis",
  name: "Memphis pop",
  category: "Art & Design Movements",
  make: make41
};

// plugin/skills/motion-graphics/styles/mosaic.ts
var GROUT = "#5E564A";
var TILE = {
  ink: ["#EDE6D6", "#DCD3BF", "#F5F0E4"],
  accent: ["#A8322C", "#8E2620", "#BF4136"],
  good: ["#3E5FA8", "#33508F", "#5274BD"],
  bad: ["#A8322C", "#C2463A", "#8A241F"],
  muted: ["#9C9488", "#8A8276", "#B0A99C"]
};
var SERIF7 = '"Hoefler Text", "Baskerville", "Palatino", Georgia, serif';
function make42(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const S = 13 * u;
  const g = globalThis;
  g.__mosaicGround ??= new Map;
  function tessera(x, y, a, cols, seed, s = S) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + (hash(seed) - 0.5) * 0.15);
    const w = s * (0.82 + hash(seed + 1) * 0.12);
    const h = s * (0.78 + hash(seed + 2) * 0.14);
    ctx.fillStyle = cols[Math.floor(hash(seed + 3) * cols.length)];
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(-w / 2, -h / 2, w, h * 0.22);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(-w / 2, h * 0.3, w, h * 0.2);
    ctx.restore();
  }
  function lay(x0, y0, x1, y1, p, inside, order) {
    if (p <= 0)
      return;
    let k = 0;
    for (let row = 0, y = y0 + S / 2;y < y1; row++, y += S) {
      for (let x = x0 + (row % 2 ? S : S / 2);x < x1; x += S) {
        k++;
        const tone = inside(x, y);
        if (!tone)
          continue;
        if (order(x, y) > p)
          continue;
        tessera(x, y, 0, TILE[tone], Math.round(x * 3.1 + y * 7.7));
      }
    }
  }
  function serif(s, x, y, size, fill, stroke, align = "center", italic = false) {
    ctx.font = `${italic ? "italic " : ""}700 ${Math.round(size * u)}px ${SERIF7}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.16 * u;
    ctx.strokeStyle = stroke;
    ctx.strokeText(s, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
  }
  function setText(s, x, y, size, p, fill, stroke, align = "center") {
    if (p <= 0)
      return;
    const n = Math.ceil(s.length * clamp(p));
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${SERIF7}`;
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    serif(s.slice(0, n), left, y, size, fill, stroke, "left");
    ctx.restore();
  }
  function plaque(x, y, w, h, p, tone = "ink") {
    lay(x, y, x + w, y + h, p, (px, py) => {
      const edge = px < x + S * 1.1 || px > x + w - S * 1.1 || py < y + S * 1.1 || py > y + h - S * 1.1;
      return edge ? tone === "ink" ? "accent" : tone : "ink";
    }, (px) => (px - x) / w);
  }
  return {
    surface() {
      const key = `${W}x${H}`;
      let tile = g.__mosaicGround.get(key);
      if (!tile) {
        tile = new OffscreenCanvas(W, H);
        const c = tile.getContext("2d");
        c.fillStyle = GROUT;
        c.fillRect(0, 0, W, H);
        const golds = ["#C9A13B", "#B58D2E", "#D8B24C", "#A98228", "#E1C062", "#BE9535"];
        const s = 20 * u;
        let k = 0;
        for (let row = 0, y = s / 2;y < H + s; row++, y += s * 0.92) {
          const wave = Math.sin(row * 0.4) * s * 0.3;
          for (let x = row % 2 * s * 0.5 + wave;x < W + s; x += s * (0.9 + hash(k) * 0.25)) {
            k++;
            c.save();
            c.translate(x, y);
            c.rotate((hash(k * 1.3) - 0.5) * 0.25);
            const w = s * (0.7 + hash(k * 2.1) * 0.25);
            const h = s * (0.7 + hash(k * 3.7) * 0.15);
            c.fillStyle = golds[Math.floor(hash(k * 5.3) * golds.length)];
            c.fillRect(-w / 2, -h / 2, w, h);
            c.fillStyle = `rgba(255,240,190,${0.1 + hash(k * 7.1) * 0.25})`;
            c.fillRect(-w / 2, -h / 2, w, h * 0.3);
            c.restore();
          }
        }
        const b = 26 * u;
        c.fillStyle = "#3A332B";
        c.fillRect(0, 0, W, b);
        c.fillRect(0, H - b, W, b);
        c.fillRect(0, 0, b, H);
        c.fillRect(W - b, 0, b, H);
        for (let x = 0;x < W; x += s) {
          for (const y of [b * 0.3, H - b * 0.7]) {
            c.fillStyle = Math.floor(x / s) % 3 === 0 ? "#A8322C" : "#E9E2D2";
            c.fillRect(x + 1, y, s - 2, s - 2);
          }
        }
        for (let y = 0;y < H; y += s) {
          for (const x of [b * 0.3, W - b * 0.7]) {
            c.fillStyle = Math.floor(y / s) % 3 === 0 ? "#A8322C" : "#E9E2D2";
            c.fillRect(x, y + 1, s - 2, s - 2);
          }
        }
        c.strokeStyle = "#A8322C";
        c.lineWidth = 3 * u;
        c.strokeRect(b + 4 * u, b + 4 * u, W - 2 * b - 8 * u, H - 2 * b - 8 * u);
        g.__mosaicGround.set(key, tile);
      }
      ctx.drawImage(tile, 0, 0);
      const gx = (t * 0.12 % 1.4 - 0.2) * W;
      const sh = ctx.createLinearGradient(gx - W * 0.2, 0, gx + W * 0.2, H * 0.3);
      sh.addColorStop(0, "rgba(255,235,170,0)");
      sh.addColorStop(0.5, "rgba(255,235,170,0.16)");
      sh.addColorStop(1, "rgba(255,235,170,0)");
      ctx.fillStyle = sh;
      ctx.fillRect(0, 0, W, H);
    },
    title(s, o = {}) {
      const { x = 0.05, y = 0.11, size = 58, at = 0, dur = 0.9 } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${SERIF7}`;
      const w = ctx.measureText(s).width + 40 * u;
      const h = size * 1.6 * u;
      plaque(X(x), Y(y) - h / 2, w, h, p * 1.6);
      setText(s, X(x) + 20 * u, Y(y), size, (p - 0.3) / 0.7, "#7E1F1A", "#F3EEE2", "left");
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 38, tone = "ink", align = "center" } = o;
      const p = progress(t, at, o.dur ?? 0.04 * s.length + 0.1);
      const fill = tone === "good" ? "#2C4C94" : tone === "accent" || tone === "bad" || tone === "ink" ? "#7E1F1A" : "#4A4238";
      setText(s, X(x), Y(y), size, p, fill, "#F3EEE2", align);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.35, tone = "accent" } = o;
      const R = Math.max(r * u * 1.5, S * 2.6);
      const cx = X(x);
      const cy = Y(y);
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      ctx.fillStyle = GROUT;
      ctx.beginPath();
      ctx.arc(cx, cy, (R + S * 0.5) * Math.min(1, p * 1.5), 0, Math.PI * 2);
      ctx.fill();
      tessera(cx, cy, 0, TILE[tone], cx + cy);
      for (let ring = 1;ring * S <= R; ring++) {
        const rr = ring * S;
        const n = Math.max(6, Math.round(Math.PI * 2 * rr / S));
        const isEdge = (ring + 1) * S > R;
        for (let i = 0;i < n; i++) {
          if ((ring - 1 + i / n) / Math.max(1, R / S) > p * 1.05)
            continue;
          const a = i / n * Math.PI * 2;
          tessera(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, a + Math.PI / 2, isEdge ? TILE.ink : TILE[tone], ring * 31 + i + cx);
        }
      }
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      plaque(X(x), Y(y), X(w), Y(h), progress(t, at, dur), tone);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 64);
      let len = 0;
      for (let i = 1;i < pts.length; i++)
        len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const thin = !head;
      const step = thin ? S * 0.75 : S;
      const n = Math.floor(len / step * p);
      const cols = TILE[tone === "ink" ? "accent" : tone];
      for (let k = 0;k <= n; k++) {
        const f = Math.min(pts.length - 1, Math.round(k * step / len * (pts.length - 1)));
        const a = pts[f];
        const b = pts[Math.min(pts.length - 1, f + 1)] ?? a;
        const last = pts.at(-1);
        const first = pts[0];
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) || Math.atan2(last[1] - first[1], last[0] - first[0]);
        const nx = -Math.sin(ang);
        const ny = Math.cos(ang);
        if (thin)
          tessera(a[0], a[1], ang, cols, k * 13 + a[0], S * 0.6);
        else
          for (const off of [-0.5, 0.5])
            tessera(a[0] + nx * off * S, a[1] + ny * off * S, ang, cols, k * 13 + off * 7 + a[0]);
      }
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-4);
        const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        for (let r = 0;r < 3; r++) {
          for (let i = -r;i <= r; i++) {
            const back = (2 - r) * S * 0.9;
            const bx = end[0] - Math.cos(ang) * back - Math.sin(ang) * i * S;
            const by = end[1] - Math.sin(ang) * back + Math.cos(ang) * i * S;
            tessera(bx, by, ang, cols, r * 17 + i + end[0]);
          }
        }
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "good" } = o;
      const x0 = X(x);
      const y0 = Y(y);
      const x1 = X(x + w);
      const y1 = Y(y + h);
      const cx = (x0 + x1) / 2;
      const rx = (x1 - x0) / 2;
      const ry = rx * 0.32;
      lay(x0 - S, y0, x1 + S, y1, progress(t, at, dur), (px, py) => {
        const dx = (px - cx) / rx;
        if (Math.abs(dx) > 1)
          return null;
        const e = ry * Math.sqrt(1 - dx * dx);
        if (py < y0 + ry - e || py > y1 - ry + e)
          return null;
        const band = [0, 1, 2, 3].some((i) => Math.abs(py - (y0 + ry + (y1 - y0 - 2 * ry) * i / 3 + e)) < S * 0.6);
        if (py < y0 + ry + e)
          return "ink";
        return band ? "ink" : tone;
      }, (_, py) => 1 - (py - y0) / (y1 - y0));
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      const p = progress(t, at, 0.3);
      if (p <= 0)
        return;
      const value = count ? `${countTo(t, at, dur, count)}${s}` : s;
      const fill = tone === "good" ? "#2C4C94" : tone === "accent" ? "#2F6B3A" : "#7E1F1A";
      ctx.save();
      ctx.globalAlpha = p;
      if (sub) {
        const bw = size * 3.2 * u;
        const bh = size * 2.1 * u;
        plaque(X(x) - bw / 2, Y(y) - bh * 0.55, bw, bh, p * 2, "ink");
        serif(sub, X(x), Y(y) - size * 0.62 * u, size * 0.4, "#7E1F1A", "#F3EEE2");
        serif(value, X(x), Y(y) + size * 0.2 * u, size, fill, "#F3EEE2");
      } else
        serif(value, X(x), Y(y), size, fill, "#F3EEE2");
      ctx.restore();
      const f = clamp(1 - Math.abs(t - (at + dur + 0.1)) / 0.25);
      if (f > 0) {
        const gl = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), size * 2 * u);
        gl.addColorStop(0, `rgba(255,240,180,${0.5 * f})`);
        gl.addColorStop(1, "rgba(255,240,180,0)");
        ctx.fillStyle = gl;
        ctx.fillRect(X(x) - size * 2 * u, Y(y) - size * 2 * u, size * 4 * u, size * 4 * u);
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 36 } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      const path = kind === "check" ? [
        ...curve([cx - s * 0.6, cy], [cx - s * 0.15, cy + s * 0.45], 0, 3),
        ...curve([cx - s * 0.15, cy + s * 0.45], [cx + s * 0.7, cy - s * 0.6], 0, 6)
      ] : [
        ...curve([cx - s * 0.5, cy - s * 0.5], [cx + s * 0.5, cy + s * 0.5], 0, 5),
        ...curve([cx + s * 0.5, cy - s * 0.5], [cx - s * 0.5, cy + s * 0.5], 0, 5)
      ];
      const n = Math.ceil(path.length * p);
      const cols = kind === "check" ? ["#2F7A44", "#3A8C52", "#276A3A"] : TILE.bad;
      path.slice(0, n).forEach(([px, py], i) => {
        tessera(px, py, 0, ["#F3EEE2"], i + 99, S * 1.5);
        tessera(px, py, 0, cols, i + cx, S * 1.05);
      });
    },
    finish() {
      for (let i = 0;i < 14; i++) {
        const ph = (t * 0.7 + hash(i * 9.1)) % 1;
        const a = clamp(1 - Math.abs(ph - 0.5) * 8);
        if (a <= 0)
          continue;
        const gx = hash(i * 3.3) * W;
        const gy = hash(i * 5.7) * H;
        const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, 14 * u);
        gr.addColorStop(0, `rgba(255,250,220,${0.8 * a})`);
        gr.addColorStop(1, "rgba(255,250,220,0)");
        ctx.fillStyle = gr;
        ctx.fillRect(gx - 14 * u, gy - 14 * u, 28 * u, 28 * u);
      }
    }
  };
}
function countTo(t, at, dur, [a, b]) {
  const p = clamp((t - at) / (dur || 0.000001));
  const e = p === 1 ? 1 : 1 - 2 ** (-10 * p);
  return Math.round(a + (b - a) * e).toLocaleString("en-US");
}
var mosaic_default = {
  id: "mosaic",
  name: "Byzantine mosaic",
  category: "Illustration",
  make: make42
};

// plugin/skills/motion-graphics/styles/ms-paint.ts
var INK9 = {
  ink: "#000000",
  accent: "#0000C0",
  good: "#008000",
  bad: "#E00000",
  muted: "#808080"
};
var FILL6 = {
  ink: "#FFFFFF",
  accent: "#FF80C0",
  good: "#80FF80",
  bad: "#FF8040",
  muted: "#C0C0C0"
};
var HAND5 = '"Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive';
var UI = "Tahoma, Verdana, Arial, sans-serif";
var SWATCH = [
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
  "#FF8040"
];
function make43(ctx, t, m) {
  const full = frame(m);
  const { W, H } = full;
  const U = full.u;
  const cx0 = Math.round(W * 0.06);
  const cy0 = Math.round(H * 0.1);
  const cw = Math.round(W * 0.915);
  const ch = Math.round(H * 0.72);
  const S = 2;
  const bw = Math.round(cw / S);
  const bh = Math.round(ch / S);
  const g = globalThis;
  g.__paint ??= {};
  const st = g.__paint;
  if (!st.buf || st.buf.width !== bw)
    st.buf = new OffscreenCanvas(bw, bh);
  const c = st.buf.getContext("2d");
  const u = full.u * 1.15 / S;
  const X = (x) => x * bw;
  const Y = (y) => y * bh;
  let tip = null;
  let tipAt = -1;
  const pen = (at, p) => {
    if (t >= at && at >= tipAt) {
      tipAt = at;
      tip = p;
    }
  };
  function stroke(pts, color, width) {
    if (pts.length < 2)
      return;
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    for (const [i, [x, y]] of pts.entries())
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    c.stroke();
  }
  const upTo = (pts, p) => pts.slice(0, Math.max(2, Math.round(pts.length * clamp(p))));
  function typed(s, x, y, size, color, at, dur, align = "left", box = true) {
    const n = Math.ceil(s.length * progress(t, at, dur));
    c.font = `${Math.round(size * u)}px ${HAND5}`;
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
      c.strokeRect(Math.round(x0 - 4) + 0.5, Math.round(y - size * u * 0.7) + 0.5, Math.round(tw + 10), Math.round(size * u * 1.4));
      c.restore();
      if (Math.floor(t * 3) % 2 === 0) {
        c.fillStyle = "#000";
        c.fillRect(Math.round(x0 + c.measureText(shown).width + 1), Math.round(y - size * u * 0.45), 1, Math.round(size * u * 0.9));
      }
    }
    pen(at, [x0 + c.measureText(shown).width, y]);
  }
  function bevel(x, y, w, h, sunken = false) {
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
      if (t < at)
        return;
      typed(text, X(x), Y(y), size, "#000080", at, dur);
    },
    label(text, x, y, o = {}) {
      const { at = 0, dur = 0.4, size = 36, tone = "ink", align = "center" } = o;
      if (t < at)
        return;
      typed(text, X(x), Y(y), size, INK9[tone], at, dur, align);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.3, tone = "accent" } = o;
      if (t < at)
        return;
      const p = progress(t, at, dur * 0.7);
      const rr = r * u * 1.3;
      const ring = ellipse(X(x), Y(y), rr, rr * 0.92, 32);
      if (progress(t, at, dur) >= 1) {
        c.fillStyle = FILL6[tone];
        c.beginPath();
        c.ellipse(X(x), Y(y), rr, rr * 0.92, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = INK9[tone === "accent" ? "bad" : tone];
        c.lineWidth = 1;
        c.beginPath();
        for (let i = 0;i < 3; i++)
          c.lineTo(X(x) - rr * 0.55 + i * rr * 0.55, Y(y) + (i % 2 ? -rr * 0.2 : rr * 0.15));
        c.stroke();
      }
      const shown = upTo(ring, p);
      stroke(shown, "#000", 1.6);
      if (p < 1)
        pen(at, shown.at(-1));
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.3, tone = "ink" } = o;
      if (t < at)
        return;
      const p = progress(t, at, dur);
      const ww = X(w) * p;
      const hh = Y(h) * p;
      c.fillStyle = tone === "ink" ? "#FFFFFF" : FILL6[tone];
      if (p >= 1)
        c.fillRect(X(x), Y(y), ww, hh);
      c.strokeStyle = "#000";
      c.lineWidth = 1.5;
      c.strokeRect(Math.round(X(x)) + 0.5, Math.round(Y(y)) + 0.5, Math.round(ww), Math.round(hh));
      if (p >= 1)
        c.strokeRect(Math.round(X(x)) + 2.5, Math.round(Y(y)) + 1.5, Math.round(ww) - 3, Math.round(hh) - 2);
      pen(at, [X(x) + ww, Y(y) + hh]);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      if (t < at)
        return;
      const p = progress(t, at, dur);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const color = head ? INK9[tone === "accent" ? "ink" : tone] : "#A0A0A0";
      const shown = upTo(pts, p);
      stroke(shown, color, head ? tone === "bad" ? 2.6 : 1.6 : 0.8);
      if (head && p >= 1) {
        const e = pts.at(-1);
        const q = pts.at(-3);
        const a = Math.atan2(e[1] - q[1], e[0] - q[0]);
        const s = 9 * u * 1.8;
        stroke([
          [e[0] - Math.cos(a - 0.5) * s, e[1] - Math.sin(a - 0.5) * s],
          e,
          [e[0] - Math.cos(a + 0.5) * s, e[1] - Math.sin(a + 0.5) * s]
        ], color, 1.6);
      }
      if (head && p < 1)
        pen(at, shown.at(-1));
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (t < at)
        return;
      const n = 4;
      const cw2 = X(w) * 0.8;
      const ch2 = Y(h) * 0.7;
      for (let i = 0;i < n; i++) {
        const ta = at + i * dur / n;
        if (t < ta)
          continue;
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
      if (t < at)
        return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const px = size * 0.95;
      const yy = Y(y) - (sub ? px * u * 0.2 : 0);
      typed(s, X(x), yy, px, tone === "good" ? INK9.good : "#000", at, 0.01, "center", t - at < dur);
      if (sub)
        typed(sub, X(x), Y(y) + px * u * 0.62, px * 0.3, "#000", at + 0.2, 0.3, "center", false);
      if (sub && t > at + dur) {
        c.font = `${Math.round(px * u)}px ${HAND5}`;
        const rx = c.measureText(s).width * 0.7;
        const ring = ellipse(X(x), yy, rx, px * u * 0.75, 40);
        stroke(upTo(ring, progress(t, at + dur, 0.3)), INK9.bad, 2.2);
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 40 } = o;
      if (t < at)
        return;
      const r = size * u * 0.9;
      const p = progress(t, at, dur);
      const cx = X(x);
      const cy = Y(y);
      if (kind === "check") {
        const pts = curve([cx - r, cy - r * 0.1], [cx - r * 0.25, cy + r * 0.7], 0, 6).concat(curve([cx - r * 0.25, cy + r * 0.7], [cx + r * 1.1, cy - r * 0.9], 0.08, 10));
        stroke(upTo(pts, p), INK9.good, 4);
      } else {
        stroke(upTo([
          [cx - r, cy - r],
          [cx + r, cy + r]
        ], p * 2), INK9.bad, 4);
        if (p > 0.5)
          stroke(upTo([
            [cx + r, cy - r],
            [cx - r, cy + r]
          ], p * 2 - 1), INK9.bad, 4);
      }
    },
    finish() {
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
      for (let i = 0;i < 3; i++)
        bevel(W - (3 - i) * tb * 1.05 - 6 * U, 4 * U, tb * 0.95, tb - 4 * U);
      ctx.font = `${Math.round(tb * 0.55)}px ${UI}`;
      ctx.fillStyle = "#000";
      ["File", "Edit", "View", "Image", "Colors", "Help"].reduce((x, s) => {
        ctx.fillText(s, x, tb * 1.55);
        return x + ctx.measureText(s).width + 18 * U;
      }, 10 * U);
      const bs = Math.min(W * 0.022, H * 0.045);
      for (let i = 0;i < 16; i++) {
        const bx = 6 * U + i % 2 * bs;
        const by = cy0 + Math.floor(i / 2) * bs;
        bevel(bx, by, bs - U, bs - U, i === 9);
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1.2 * U;
        ctx.beginPath();
        const k = bs * 0.25;
        if (i % 4 === 0)
          ctx.rect(bx + k, by + k, bs - 2 * k, bs - 2 * k);
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
      ctx.fillStyle = "#808080";
      ctx.fillRect(cx0 - 3 * U, cy0 - 3 * U, cw + 6 * U, ch + 6 * U);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(st.buf, cx0, cy0, cw, ch);
      ctx.restore();
      const py = cy0 + ch + 10 * U;
      const sw = Math.min(W * 0.022, H * 0.04);
      bevel(6 * U, py, sw * 2, sw * 2, true);
      ctx.fillStyle = "#FFF";
      ctx.fillRect(6 * U + sw * 0.8, py + sw * 0.8, sw * 0.9, sw * 0.9);
      ctx.fillStyle = "#000";
      ctx.fillRect(6 * U + sw * 0.3, py + sw * 0.3, sw * 0.9, sw * 0.9);
      SWATCH.forEach((col, i) => {
        const x = 10 * U + sw * 2.2 + i % 14 * sw;
        const y = py + Math.floor(i / 14) * sw;
        bevel(x, y, sw - U, sw - U, true);
        ctx.fillStyle = col;
        ctx.fillRect(x + 2 * U, y + 2 * U, sw - 5 * U, sw - 5 * U);
      });
      const sy = H - tb * 0.95;
      bevel(2 * U, sy, W * 0.7, tb * 0.85, true);
      bevel(W * 0.71, sy, W * 0.28, tb * 0.85, true);
      ctx.fillStyle = "#000";
      ctx.font = `${Math.round(tb * 0.5)}px ${UI}`;
      ctx.fillText("Ready. Pick a tool and draw on the canvas.", 8 * U, sy + tb * 0.42);
      if (tip) {
        const [tx, ty] = tip;
        ctx.fillText(`${Math.round(tx)},${Math.round(ty)}`, W * 0.72, sy + tb * 0.42);
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
    }
  };
}
var ms_paint_default = {
  id: "ms-paint",
  name: "Paint program",
  category: "Retro UI & Neon",
  make: make43
};

// plugin/skills/motion-graphics/styles/napkin-sketch.ts
var INK10 = {
  ink: "#151515",
  accent: "#151515",
  good: "#1C4F33",
  bad: "#D3202A",
  muted: "#6B6B6B"
};
var HAND6 = '"Permanent Marker", "Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive';
function make44(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__napkin ??= new Map;
  const cache = g.__napkin;
  let tip = null;
  let seed = 1;
  const nx = W * 0.025;
  const ny = H * 0.035;
  function table() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      b.fillStyle = "#6E4128";
      b.fillRect(0, 0, W, H);
      for (let i = 0;i < 200; i++) {
        const y = hash(i * 1.3) * H;
        b.strokeStyle = hash(i) > 0.5 ? "rgba(40,20,8,0.18)" : "rgba(160,100,60,0.12)";
        b.lineWidth = (1 + hash(i + 4) * 3) * u;
        b.beginPath();
        b.moveTo(0, y);
        for (let x = 0;x <= W; x += 40 * u)
          b.lineTo(x, y + Math.sin(x / (90 * u) + i) * 3 * u);
        b.stroke();
      }
      for (let y = 0;y < H; y += H / 4) {
        b.fillStyle = "rgba(20,10,4,0.5)";
        b.fillRect(0, y, W, 2 * u);
      }
      const [x0, y0, w, h] = [nx, ny, W - nx * 2, H - ny * 2];
      b.shadowColor = "rgba(0,0,0,0.35)";
      b.shadowBlur = 20 * u;
      b.shadowOffsetY = 6 * u;
      b.fillStyle = "#F7F5F0";
      b.fillRect(x0, y0, w, h);
      b.shadowColor = "transparent";
      for (let i = 0;i < 70; i++) {
        const cx = x0 + hash(i * 2.1) * w;
        const cy = y0 + hash(i * 3.7) * h;
        const r = (40 + hash(i + 9) * 120) * u;
        const gr = b.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
        gr.addColorStop(0, "rgba(255,255,255,0.0)");
        gr.addColorStop(0.5, `rgba(120,115,105,${0.08 + hash(i) * 0.08})`);
        gr.addColorStop(0.52, "rgba(255,255,255,0.35)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        b.fillStyle = gr;
        b.save();
        b.beginPath();
        b.rect(x0, y0, w, h);
        b.clip();
        b.translate(cx, cy);
        b.rotate(hash(i + 5) * 6);
        b.fillRect(-r, -r * 0.4, r * 2, r * 0.8);
        b.restore();
      }
      b.fillStyle = "rgba(110,100,90,0.3)";
      b.fillRect(x0 + w / 2, y0, 2 * u, h);
      b.fillRect(x0, y0 + h / 2, w, 2 * u);
      b.fillStyle = "rgba(255,255,255,0.7)";
      b.fillRect(x0 + w / 2 + 2 * u, y0, 2 * u, h);
      b.fillRect(x0, y0 + h / 2 + 2 * u, w, 2 * u);
      const inset = 18 * u;
      for (let x = x0 + inset;x < x0 + w - inset; x += 9 * u)
        for (const yy of [y0 + inset, y0 + h - inset]) {
          b.fillStyle = "rgba(160,150,135,0.6)";
          b.fillRect(x, yy, 4 * u, 4 * u);
        }
      for (let y = y0 + inset;y < y0 + h - inset; y += 9 * u)
        for (const xx of [x0 + inset, x0 + w - inset]) {
          b.fillStyle = "rgba(160,150,135,0.6)";
          b.fillRect(xx, y, 4 * u, 4 * u);
        }
      const rx = x0 + w * 0.92;
      const ry = y0 + h * 0.86;
      for (let i = 0;i < 3; i++) {
        b.strokeStyle = `rgba(140,90,45,${0.18 + i * 0.08})`;
        b.lineWidth = (3 - i) * 2 * u;
        b.beginPath();
        b.arc(rx + i * 3 * u, ry - i * 2 * u, (58 - i * 3) * u, 0, Math.PI * 2);
        b.stroke();
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  function ink(points, { at = 0, dur = 0.4, tone = "ink", width = 7 } = {}) {
    const p = progress(t, at, dur);
    seed += 1;
    if (p <= 0)
      return;
    const { points: drawn } = along(roughen(points, 1.6 * u, seed * 5.7), p);
    const col = INK10[tone];
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    trace(ctx, drawn);
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = width * 2.1 * u;
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
    if (p < 1)
      tip = { pt: drawn.at(-1), color: col };
  }
  function write(s, x, y, o = {}) {
    const { at = 0, size = 40, tone = "ink", align = "left" } = o;
    const dur = o.dur ?? 0.04 * s.length + 0.1;
    const p = progress(t, at, dur);
    if (p <= 0)
      return 0;
    ctx.save();
    ctx.font = `800 ${Math.round(size * u)}px ${HAND6}`;
    ctx.textBaseline = "middle";
    const text = s.toUpperCase();
    const w = ctx.measureText(text).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.beginPath();
    ctx.rect(left - 4 * u, Y(y) - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = INK10[tone];
    ctx.shadowColor = INK10[tone];
    ctx.shadowBlur = 2.5 * u;
    ctx.fillText(text, left, Y(y));
    ctx.restore();
    if (p < 1)
      tip = { pt: [left + w * p, Y(y)], color: INK10[tone] };
    return w;
  }
  return {
    surface() {
      table();
    },
    title(s, o = {}) {
      const { x = 0.06, y = 0.13, size = 74, at = 0 } = o;
      const w = write(s, x, y, { ...o, size, at, align: o.align ?? "left" });
      if (!w)
        return;
      const done = at + (o.dur ?? 0.04 * s.length + 0.1);
      ink(curve([X(x), Y(y) + size * 0.75 * u], [X(x) + w, Y(y) + size * 0.72 * u], -0.01, 12), {
        at: done,
        dur: 0.25,
        width: 6
      });
    },
    label(s, x, y, o = {}) {
      write(s, x, y, { size: 36, align: "center", ...o });
    },
    node(x, y, r, o = {}) {
      ink(ellipse(X(x), Y(y), r * u, r * u, 36, -Math.PI / 2, 1.06), { dur: 0.15, width: 5, ...o });
    },
    box(x, y, w, h, o = {}) {
      const a = [X(x), Y(y)];
      const b = [X(x + w), Y(y + h)];
      ink([a, [b[0], a[1]], b, [a[0], b[1]], [a[0], a[1] - 3 * u]], { dur: 0.4, ...o });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.3, head = true } = o;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      ink(shaft, { ...o, at, dur, width: head ? 5 : 3 });
      if (!head)
        return;
      const end = shaft.at(-1);
      const prev = shaft.at(-3);
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 18 * u;
      ink([
        [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
        end,
        [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s]
      ], { ...o, at: at + dur, dur: 0.1, width: 5 });
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.28;
      const top = Y(y) + ry;
      const bottom = Y(y + h) - ry;
      const half = (cy) => ellipse(cx, cy, rx, ry, 24, 0, 0.5);
      const step = dur / 5;
      ink(ellipse(cx, top, rx, ry, 28, Math.PI, 1.05), { ...o, at, dur: step * 1.5 });
      ink([
        [cx - rx, top],
        [cx - rx, bottom]
      ], { ...o, at: at + step * 1.5, dur: step * 0.7 });
      ink(half(bottom), { ...o, at: at + step * 2.2, dur: step });
      ink([
        [cx + rx, bottom],
        [cx + rx, top]
      ], { ...o, at: at + step * 3.2, dur: step * 0.6 });
      ink(half(top + (bottom - top) / 2), { ...o, at: at + step * 3.8, dur: step });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      write(value, x, y, { at, size, align: "center", dur: 0.25 });
      if (sub)
        write(sub, x, y - size * 0.8 * u / H, {
          at: at + 0.2,
          size: size * 0.3,
          align: "center"
        });
      if (size >= 80)
        ink(ellipse(X(x), Y(y), size * 1.55 * u, size * 0.8 * u, 40, -Math.PI * 0.75, 1.1), {
          at: at + dur,
          dur: 0.35,
          tone: "bad",
          width: 6
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check") {
        ink([
          [cx - s * 0.5, cy],
          [cx - s * 0.1, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5]
        ], { dur: 0.25, ...o });
      } else {
        const at = o.at ?? 0;
        ink([
          [cx - s * 0.5, cy - s * 0.5],
          [cx + s * 0.5, cy + s * 0.5]
        ], { dur: 0.12, tone: "bad", ...o });
        ink([
          [cx + s * 0.5, cy - s * 0.5],
          [cx - s * 0.5, cy + s * 0.5]
        ], { dur: 0.12, tone: "bad", ...o, at: at + 0.12 });
      }
    },
    finish() {
      const tp = tip;
      if (!tp)
        return;
      const [x, y] = tp.pt;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI * 0.3);
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 14 * u;
      ctx.shadowOffsetX = 10 * u;
      ctx.shadowOffsetY = 12 * u;
      const L = 190 * u;
      const R = 10 * u;
      ctx.fillStyle = tp.color === INK10.bad ? "#C21C25" : "#1B1B1B";
      ctx.beginPath();
      ctx.roundRect(16 * u, -R, L, R * 2, R);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#D9D9D9";
      ctx.fillRect(60 * u, -R, 50 * u, R * 2);
      ctx.fillStyle = "#2A2A2A";
      trace(ctx, [
        [0, 0],
        [18 * u, -R * 0.7],
        [18 * u, R * 0.7]
      ], true);
      ctx.fill();
      ctx.restore();
    }
  };
}
var napkin_sketch_default = {
  id: "napkin-sketch",
  name: "Napkin sketch",
  category: "Hand-drawn",
  make: make44
};

// plugin/skills/motion-graphics/styles/neon-sign.ts
var TUBE = {
  ink: "#4FEFFF",
  accent: "#FF3FB4",
  good: "#5CFF73",
  bad: "#FF3A3A",
  muted: "#9C8CFF"
};
var ROUND6 = '"Arial Rounded MT Bold", "Avenir Next", "Helvetica Neue", Arial, sans-serif';
function make45(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__neonBrick ??= new Map;
  const FLOOR = 0.89;
  function power(at = 0, k = 0, dur = 0.35) {
    const p = progress(t, at, dur);
    if (p <= 0)
      return 0;
    if (p < 1)
      return hash(Math.floor(t * 40) + k * 13) > 0.45 ? 0.9 : 0.12;
    return 0.94 + 0.06 * Math.sin(t * 60 + k);
  }
  function dead(points, width) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    trace(ctx, points);
    ctx.strokeStyle = "rgba(120,110,120,0.35)";
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
  }
  function tube(points, color, a, width = 5, close = false) {
    if (a <= 0)
      return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = a;
    trace(ctx, points, close);
    ctx.shadowColor = color;
    ctx.shadowBlur = 26 * u;
    ctx.strokeStyle = alpha(color, 0.5);
    ctx.lineWidth = width * 2.4 * u;
    ctx.stroke();
    ctx.shadowBlur = 10 * u;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = width * 0.35 * u;
    ctx.stroke();
    ctx.restore();
  }
  function sign(s, x, y, size, color, align, at, per = 0.06) {
    if (t < at)
      return;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${ROUND6}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const w = ctx.measureText(s).width;
    let cx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    for (const [i, ch] of [...s].entries()) {
      const cw = ctx.measureText(ch).width;
      let a = power(at + i * per, i + size, 0.25);
      if (s.length > 6 && i === Math.floor(s.length * 0.6) && hash(Math.floor(t * 9)) > 0.8)
        a *= 0.25;
      if (a > 0) {
        ctx.globalAlpha = a;
        ctx.shadowColor = color;
        ctx.shadowBlur = 24 * u;
        ctx.fillStyle = color;
        ctx.fillText(ch, cx, y);
        ctx.shadowBlur = 6 * u;
        ctx.fillStyle = alpha("#FFFFFF", 0.65);
        ctx.fillText(ch, cx, y);
      } else {
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(110,100,110,0.3)";
        ctx.fillText(ch, cx, y);
      }
      cx += cw;
    }
    ctx.restore();
  }
  return {
    surface() {
      const key = `${W}x${H}`;
      let tile = g.__neonBrick.get(key);
      if (!tile) {
        tile = new OffscreenCanvas(W, H);
        const c = tile.getContext("2d");
        c.fillStyle = "#1A1012";
        c.fillRect(0, 0, W, H);
        const bh = 22 * u;
        const bw = 64 * u;
        for (let row = 0;row * bh < H * FLOOR; row++) {
          for (let x = row % 2 ? -bw / 2 : 0;x < W; x += bw) {
            const k = row * 131 + x;
            const v = 30 + hash(k) * 22;
            c.fillStyle = `rgb(${v + 22},${v * 0.55},${v * 0.5})`;
            c.fillRect(x + 1.5 * u, row * bh + 1.5 * u, bw - 3 * u, bh - 3 * u);
          }
        }
        const pv = c.createLinearGradient(0, H * FLOOR, 0, H);
        pv.addColorStop(0, "#0E0C10");
        pv.addColorStop(1, "#050406");
        c.fillStyle = pv;
        c.fillRect(0, H * FLOOR, W, H * (1 - FLOOR));
        c.fillStyle = "rgba(255,255,255,0.06)";
        c.fillRect(0, H * FLOOR, W, 2 * u);
        g.__neonBrick.set(key, tile);
      }
      ctx.drawImage(tile, 0, 0);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, W, H * FLOOR);
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 56, at = 0 } = o;
      sign(s, X(x), Y(y), size, TUBE.accent, o.align ?? "left", at, (o.dur ?? 0.9) / Math.max(1, s.length));
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, tone = "ink", align = "center" } = o;
      sign(s, X(x), Y(y), size, TUBE[tone === "ink" ? "ink" : tone], align, at, 0.03);
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const R = r * u * 0.8;
      const ring = ellipse(X(x), Y(y), R, R, 40);
      if (t < at)
        return;
      dead(ring, 4);
      tube(ring, TUBE[tone], power(at, x * 97 + y * 13), 3.5, true);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      if (t < at)
        return;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const r = 14 * u;
      const pts = [
        ...ellipse(x0 + r, y0 + r, r, r, 6, Math.PI, 0.25),
        ...ellipse(x1 - r, y0 + r, r, r, 6, -Math.PI / 2, 0.25),
        ...ellipse(x1 - r, y1 - r, r, r, 6, 0, 0.25),
        ...ellipse(x0 + r, y1 - r, r, r, 6, Math.PI / 2, 0.25)
      ];
      ctx.fillStyle = "#3A3438";
      for (const [cx, cy] of [
        [x0 + r, y0],
        [x1 - r, y0],
        [x0 + r, y1],
        [x1 - r, y1]
      ])
        ctx.fillRect(cx - 4 * u, cy - 6 * u, 8 * u, 12 * u);
      dead(pts, 5);
      tube(pts, TUBE[tone === "good" ? "muted" : tone], power(at, 5), 4.5, true);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      if (t < at)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const color = TUBE[tone === "accent" && head ? "ink" : tone];
      if (!head) {
        tube(pts, color, power(at, x1 * 50 + y2 * 70, dur) * 0.55, 1.4);
        return;
      }
      const p = progress(t, at, dur * 1.6);
      const n = 10;
      for (let i = 0;i < n; i++) {
        const seg = pts.slice(Math.floor(i / n * 30), Math.floor((i + 0.7) / n * 30) + 1);
        dead(seg, 3.5);
        const on = p >= 1 ? 0.7 + 0.3 * ((Math.floor(t * 8) - i + 100) % 3 === 0 ? 1 : 0) : i / n < p ? 1 : 0;
        tube(seg, color, on, 3.5);
      }
      if (p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 16 * u;
        tube([
          [end[0] - Math.cos(a - 0.6) * s, end[1] - Math.sin(a - 0.6) * s],
          end,
          [end[0] - Math.cos(a + 0.6) * s, end[1] - Math.sin(a + 0.6) * s]
        ], color, 1, 3.5);
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "muted" } = o;
      if (t < at)
        return;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const cx = (x0 + x1) / 2;
      const rx = (x1 - x0) / 2;
      const ry = rx * 0.3;
      const parts = [
        ellipse(cx, y0 + ry, rx, ry, 30),
        [
          [x0, y0 + ry],
          [x0, y1 - ry]
        ],
        ellipse(cx, y1 - ry, rx, ry, 20, 0, 0.5),
        [
          [x1, y1 - ry],
          [x1, y0 + ry]
        ],
        ellipse(cx, (y0 + y1) / 2, rx, ry, 20, 0, 0.5)
      ];
      parts.forEach((pp, i) => {
        dead(pp, 4);
        tube(pp, TUBE[tone], power(at + i * dur / 6, i + 40), 3.5);
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const a = power(at, 9);
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${ROUND6}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const changing = count && t < at + dur && hash(Math.floor(t * 20)) > 0.7 ? 0.7 : 1;
      ctx.globalAlpha = a * changing;
      ctx.shadowColor = TUBE[tone];
      ctx.shadowBlur = 30 * u;
      ctx.fillStyle = TUBE[tone];
      ctx.fillText(value, X(x), Y(y));
      ctx.shadowBlur = 8 * u;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(value, X(x), Y(y));
      const tw = ctx.measureText(value).width;
      ctx.restore();
      if (sub) {
        sign(sub, X(x), Y(y) - size * 0.85 * u, size * 0.36, TUBE.ink, "center", at + 0.2, 0.04);
        const ring = ellipse(X(x), Y(y), tw * 0.68, size * 0.7 * u, 48);
        if (t >= at + dur)
          tube(ring, TUBE.good, power(at + dur, 77), 3, true);
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 34 } = o;
      if (t < at)
        return;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      const color = kind === "check" ? TUBE.good : TUBE.bad;
      const a = power(at, 61);
      tube(ellipse(cx, cy, s * 0.8, s * 0.8, 36), color, a * 0.8, 2.5, true);
      if (kind === "check")
        tube([
          [cx - s * 0.4, cy],
          [cx - s * 0.1, cy + s * 0.32],
          [cx + s * 0.45, cy - s * 0.38]
        ], color, a, 3.5);
      else {
        tube([
          [cx - s * 0.38, cy - s * 0.38],
          [cx + s * 0.38, cy + s * 0.38]
        ], color, a, 3.5);
        tube([
          [cx + s * 0.38, cy - s * 0.38],
          [cx - s * 0.38, cy + s * 0.38]
        ], color, a, 3.5);
      }
    },
    finish() {
      const src = ctx.canvas;
      const top = H * FLOOR;
      const band = H - top;
      const rows = 24;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0;i < rows; i++) {
        const dy = band / rows * i;
        const sy = top - dy - band / rows;
        const wob = Math.sin(t * 6 + i * 0.9) * 3 * u * (i / rows);
        ctx.drawImage(src, 0, sy, W, band / rows, wob, top + dy, W, band / rows + 1);
      }
      ctx.restore();
      vignette(ctx, m, 0.55);
    }
  };
}
var neon_sign_default = {
  id: "neon-sign",
  name: "Neon sign",
  category: "Light & Imaging",
  make: make45
};

// plugin/skills/motion-graphics/styles/newsprint.ts
var PULP = "#E9DDBF";
var INK11 = "#1F1C18";
var GREASE = "#C8392E";
var COND2 = '"Oswald", "Bebas Neue", "Impact", "Arial Narrow", sans-serif';
var SERIF8 = '"Georgia", "Times New Roman", serif';
var TONE11 = {
  ink: INK11,
  accent: INK11,
  good: INK11,
  bad: GREASE,
  muted: "#6E6556"
};
function make46(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const inked = (at = 0, dur = 0.25) => clamp((t - at) / dur);
  function halftone(x, y, w, h, dark = 0.6) {
    const s = 6 * u;
    ctx.fillStyle = INK11;
    for (let gy = y + s / 2;gy < y + h; gy += s)
      for (let gx = x + s / 2;gx < x + w; gx += s) {
        const f = clamp(0.25 + dark * ((gx - x) / w * 0.5 + (gy - y) / h * 0.5));
        ctx.beginPath();
        ctx.arc(gx, gy, s * 0.5 * f, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  function cond(s, x, y, size, color, align = "left", weight = 700) {
    ctx.font = `${weight} ${Math.round(size * u)}px ${COND2}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }
  function greeked(x, y, w, h, seed) {
    ctx.fillStyle = "rgba(31,28,24,0.55)";
    for (let ly = y, i = 0;ly < y + h; ly += 9 * u, i++) {
      let lx = x;
      while (lx < x + w - 8 * u) {
        const ww = Math.min((8 + 26 * hash(seed + i * 13.1 + lx)) * u, x + w - lx);
        ctx.fillRect(lx, ly, ww, 3 * u);
        lx += ww + 4 * u;
      }
    }
  }
  return {
    surface() {
      ctx.fillStyle = PULP;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(60,50,30,0.05)";
      for (let i = 0;i < 40; i++)
        ctx.fillRect(hash(i * 2.2) * W, hash(i * 3.3) * H, (60 + 140 * hash(i)) * u, 3 * u);
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      v.addColorStop(0, "rgba(120,90,40,0)");
      v.addColorStop(1, "rgba(120,90,40,0.28)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      for (let i = 0;i < 8; i++) {
        ctx.fillStyle = "rgba(150,110,50,0.08)";
        ctx.beginPath();
        ctx.arc(hash(i * 7.7) * W, hash(i * 9.1) * H, (6 + 14 * hash(i)) * u, 0, Math.PI * 2);
        ctx.fill();
      }
      const m0 = W * 0.03;
      ctx.fillStyle = INK11;
      ctx.fillRect(m0, H * 0.18, W - m0 * 2, 1.5 * u);
      ctx.fillRect(m0, H * 0.18 + 4 * u, W - m0 * 2, 0.8 * u);
      const top = H * 0.82;
      ctx.fillRect(m0, top - 8 * u, W - m0 * 2, 1.5 * u);
      const cols = 5;
      const cw = (W - m0 * 2) / cols;
      for (let c = 0;c < cols; c++) {
        greeked(m0 + c * cw + 8 * u, top, cw - 16 * u, H - top - 16 * u, c * 31);
        if (c)
          ctx.fillRect(m0 + c * cw, top, 0.8 * u, H - top - 16 * u);
      }
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.1, size = 76, at = 0, dur = 0.9 } = o;
      const p = clamp((t - at) / dur);
      if (p <= 0)
        return;
      const e = 1 - (1 - p) ** 3;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${COND2}`;
      const w = ctx.measureText(s.toUpperCase()).width;
      const cx = X(x) + w / 2;
      ctx.translate(cx, Y(y));
      ctx.rotate((1 - e) * Math.PI * 4);
      ctx.scale(0.05 + 0.95 * e, 0.05 + 0.95 * e);
      cond(s.toUpperCase(), 0, 0, size, INK11, "center");
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 24, tone = "ink", align = "center" } = o;
      const p = inked(at);
      if (p <= 0)
        return;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.letterSpacing = `${(size * 0.06 * u).toFixed(1)}px`;
      if (tone === "bad") {
        ctx.font = `italic 400 ${Math.round(size * 1.1 * u)}px ${SERIF8}`;
        ctx.textAlign = align;
        ctx.textBaseline = "middle";
        ctx.fillStyle = INK11;
        ctx.fillText(s, X(x), Y(y));
      } else
        cond(s.toUpperCase(), X(x), Y(y), size, TONE11[tone], align, 600);
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const p = inked(at, 0.2);
      if (p <= 0)
        return;
      const R = r * u;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
      ctx.fillStyle = PULP;
      ctx.fill();
      ctx.save();
      ctx.clip();
      halftone(X(x) - R, Y(y) - R, R * 2, R * 2, tone === "accent" ? 0.35 : 0.2);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = INK11;
      ctx.stroke();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0 } = o;
      const p = inked(at, 0.3);
      if (p <= 0)
        return;
      const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
      ctx.save();
      ctx.globalAlpha = p;
      ctx.fillStyle = "#EFE5CB";
      ctx.fillRect(l, tp, ww, hh);
      ctx.lineWidth = 2.5 * u;
      ctx.strokeStyle = INK11;
      ctx.strokeRect(l, tp, ww, hh);
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = clamp((t - at) / dur);
      if (p <= 0)
        return;
      const grease = tone === "bad";
      const base = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 28);
      const pts = grease ? roughen(base, 1.8 * u, x2 * 41) : base;
      const res = along(pts, p);
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = grease ? GREASE : INK11;
      ctx.globalAlpha = grease ? 0.85 : head ? 1 : 0.55;
      ctx.lineWidth = (grease ? 5 : head ? 2.4 : 1) * u;
      trace(ctx, res.points);
      ctx.stroke();
      if (head && p >= 1) {
        const tip = pts.at(-1);
        const s = 15 * u;
        trace(ctx, [
          tip,
          [tip[0] - Math.cos(res.angle - 0.4) * s, tip[1] - Math.sin(res.angle - 0.4) * s],
          [tip[0] - Math.cos(res.angle + 0.4) * s, tip[1] - Math.sin(res.angle + 0.4) * s]
        ], true);
        ctx.fillStyle = grease ? GREASE : INK11;
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0 } = o;
      const p = inked(at, 0.5);
      if (p <= 0)
        return;
      const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
      ctx.save();
      ctx.globalAlpha = p;
      ctx.fillStyle = "#EFE5CB";
      ctx.fillRect(l, tp, ww, hh);
      halftone(l, tp, ww, hh, 0.75);
      for (let i = 0;i < 2; i++) {
        const cx = l + ww / 2;
        const cy = tp + hh * (0.3 + i * 0.4);
        const r = Math.min(ww, hh) * 0.2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = "#EFE5CB";
        ctx.fill();
        ctx.lineWidth = 2 * u;
        ctx.strokeStyle = INK11;
        ctx.stroke();
        for (let k = 0;k < 3; k++) {
          const a = t * 2 * (i ? -1 : 1) + k * Math.PI * 2 / 3;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, r * 0.18, 0, Math.PI * 2);
          ctx.fillStyle = INK11;
          ctx.fill();
        }
      }
      ctx.lineWidth = 2 * u;
      ctx.strokeStyle = INK11;
      ctx.strokeRect(l, tp, ww, hh);
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      const p = inked(at);
      if (p <= 0)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.globalAlpha = p;
      const big = size >= 80;
      if (big) {
        ctx.font = `600 ${Math.round(size * u)}px ${COND2}`;
        const bw = Math.max(ctx.measureText(`${count ? count[1] : ""}${s}`).width, ctx.measureText(value).width) + size * 0.6 * u;
        const bh = size * (sub ? 1.75 : 1.3) * u;
        const top = Y(y) - bh / 2 - (sub ? size * 0.22 * u : 0);
        ctx.fillStyle = "#EFE5CB";
        ctx.fillRect(X(x) - bw / 2, top, bw, bh);
        ctx.lineWidth = 2.5 * u;
        ctx.strokeStyle = INK11;
        ctx.strokeRect(X(x) - bw / 2, top, bw, bh);
      }
      cond(value, X(x), Y(y) + (sub ? size * 0.12 * u : 0), size, TONE11[tone], "center", 600);
      if (sub) {
        ctx.letterSpacing = `${(size * 0.04 * u).toFixed(1)}px`;
        cond(sub.toUpperCase(), X(x), Y(y) - size * 0.52 * u, size * 0.24, INK11, "center", 700);
      }
      ctx.restore();
      if (big && count) {
        const q = clamp((t - at - dur) / 0.5);
        if (q > 0) {
          ctx.save();
          ctx.strokeStyle = GREASE;
          ctx.globalAlpha = 0.85;
          ctx.lineWidth = 4 * u;
          ctx.lineCap = "round";
          trace(ctx, along(roughen(ellipse(X(x), Y(y) + size * 0.12 * u, size * 1.25 * u, size * 0.62 * u, 36, -2.4, 1.1), 2.5 * u, 7), q).points);
          ctx.stroke();
          ctx.restore();
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const s = (o.size ?? 30) * u;
      const cx = X(x);
      const cy = Y(y);
      const p = clamp((t - at) / 0.3);
      if (p <= 0)
        return;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (kind === "check") {
        ctx.strokeStyle = INK11;
        ctx.lineWidth = 3.5 * u;
        trace(ctx, along([
          [cx - s * 0.5, cy],
          [cx - s * 0.12, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.55]
        ], p).points);
      } else {
        ctx.strokeStyle = GREASE;
        ctx.lineWidth = 5 * u;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.5, cy - s * 0.5);
        ctx.lineTo(cx + s * 0.5, cy + s * 0.5);
        ctx.moveTo(cx + s * 0.5, cy - s * 0.5);
        ctx.lineTo(cx - s * 0.5, cy + s * 0.5);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {}
  };
}
var newsprint_default = {
  id: "newsprint",
  name: "Vintage newsprint",
  category: "Print",
  make: make46
};

// plugin/skills/motion-graphics/styles/op-art.ts
var IVORY = "#F1ECDF";
var BLACK7 = "#121212";
var RED6 = "#D7261E";
var SLAB2 = {
  ink: BLACK7,
  accent: RED6,
  good: BLACK7,
  bad: RED6,
  muted: "#6B6B6B"
};
var HEAVY3 = '"Archivo Black", "Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif';
function make47(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const lens = { x: W * 0.34, y: H * 0.42, r: H * 0.3 * spring(t, { stiffness: 70, damping: 9 }) };
  function warp(x, y) {
    const dx = x - lens.x;
    const dy = y - lens.y;
    const d = Math.hypot(dx, dy) || 1;
    let k = 1;
    if (lens.r > 1 && d < lens.r)
      k = lens.r * (d / lens.r) ** 0.55 / d;
    const ripple = Math.sin(d / (60 * u) - t * 2.4) * 5 * u * clamp((d - lens.r) / (200 * u));
    return [lens.x + dx * k + dx / d * ripple, lens.y + dy * k + dy / d * ripple];
  }
  function flipped(cx, cy, at, draw) {
    const p = progress(t, at ?? 0, 0.28);
    if (p <= 0)
      return;
    const s = Math.abs(Math.cos((1 - expo(p)) * Math.PI * 0.5 * 2)) * 0.999 + 0.001;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(p < 0.5 ? Math.max(0.02, expo(p)) : s, 1);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }
  function slab(s, cx, cy, size, fill, ink = IVORY, align = "center") {
    ctx.font = `900 ${Math.round(size * u)}px ${HEAVY3}`;
    const w = ctx.measureText(s).width + size * 0.9 * u;
    const h = size * 1.55 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    ctx.fillStyle = fill;
    ctx.fillRect(left, cy - h / 2, w, h);
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + w / 2, cy + u);
    return { left, w, h };
  }
  return {
    surface() {
      ctx.fillStyle = IVORY;
      ctx.fillRect(0, 0, W, H);
      const s = 44 * u;
      const cols = Math.ceil(W / s) + 2;
      const rows = Math.ceil(H / s) + 2;
      const redP = progress(t, 0.8, 1.6);
      for (let j = -1;j < rows; j++)
        for (let i = -1;i < cols; i++) {
          if ((i + j) % 2 === 0)
            continue;
          const x = i * s;
          const y = j * s;
          const q = [warp(x, y), warp(x + s, y), warp(x + s, y + s), warp(x, y + s)];
          const cx = x + s / 2 - lens.x;
          const cy = y + s / 2 - lens.y;
          const d = Math.hypot(cx, cy);
          const red = d < H * 0.2 * redP && hash(i * 7.3 + j * 3.1) > 0.5;
          ctx.fillStyle = red ? RED6 : BLACK7;
          trace(ctx, q, true);
          ctx.fill();
        }
    },
    title(s, o = {}) {
      const { x = 0.025, y = 0.07, size = 34, at = 0, align = "left" } = o;
      const p = progress(t, at, o.dur ?? 0.5);
      if (p <= 0)
        return;
      ctx.save();
      ctx.font = `900 ${Math.round(size * u)}px ${HEAVY3}`;
      const w = ctx.measureText(s.toUpperCase()).width + size * 0.9 * u;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      ctx.beginPath();
      ctx.rect(left, 0, w * expo(p), H);
      ctx.clip();
      const r = slab(s.toUpperCase(), left, Y(y), size, BLACK7, IVORY, "left");
      ctx.fillStyle = RED6;
      ctx.fillRect(r.left, Y(y) + r.h / 2, r.w, 6 * u);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      flipped(X(x), Y(y), o.at, () => slab(s.toUpperCase(), X(x), Y(y), o.size ?? 28, SLAB2[o.tone ?? "ink"], IVORY, o.align ?? "center"));
    },
    node(x, y, r, o = {}) {
      const tone = o.tone ?? "accent";
      flipped(X(x), Y(y), o.at, () => {
        const R = r * u * 1.2;
        const rings = [IVORY, BLACK7, IVORY, tone === "accent" || tone === "bad" ? RED6 : BLACK7];
        for (const [k, col] of rings.entries()) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(X(x), Y(y), R * (1 - k * 0.22), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = BLACK7;
        ctx.lineWidth = 2.5 * u;
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
        ctx.stroke();
      });
    },
    box(x, y, w, h, o = {}) {
      flipped(X(x + w / 2), Y(y + h / 2), o.at, () => {
        const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
        ctx.fillStyle = IVORY;
        ctx.fillRect(x0, y0, bw, bh);
        ctx.strokeStyle = BLACK7;
        ctx.lineWidth = 5 * u;
        ctx.strokeRect(x0, y0, bw, bh);
        ctx.fillStyle = o.tone === "bad" || o.tone === "accent" ? RED6 : BLACK7;
        ctx.fillRect(x0, y0 + bh - 10 * u, bw, 10 * u);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.3, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * expo(p))));
      const col = tone === "ink" || tone === "accent" || tone === "bad" ? RED6 : BLACK7;
      ctx.save();
      ctx.lineCap = "butt";
      trace(ctx, shown);
      ctx.strokeStyle = IVORY;
      ctx.lineWidth = (head ? 9 : 4) * u;
      ctx.stroke();
      trace(ctx, shown);
      ctx.strokeStyle = head ? col : alpha(BLACK7, 0.85);
      ctx.lineWidth = (head ? 4 : 1.5) * u;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 18 * u, false);
        ctx.fillStyle = col;
        ctx.strokeStyle = IVORY;
        ctx.lineWidth = 2.5 * u;
        ctx.stroke();
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6 } = o;
      flipped(X(x + w / 2), Y(y + h / 2), at, () => {
        const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
        ctx.fillStyle = IVORY;
        ctx.fillRect(x0, y0, bw, bh);
        const n = 9;
        const shown = Math.ceil(n * progress(t, at + 0.1, dur));
        for (let i = 0;i < shown; i++) {
          const f0 = (i / n) ** 0.7;
          const f1 = ((i + 0.5) / n) ** 0.7;
          ctx.fillStyle = i === n - 1 ? RED6 : BLACK7;
          ctx.fillRect(x0, y0 + bh * f0, bw, bh * (f1 - f0));
        }
        ctx.strokeStyle = BLACK7;
        ctx.lineWidth = 4 * u;
        ctx.strokeRect(x0, y0, bw, bh);
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      flipped(X(x), Y(y), at, () => {
        const value = count ? counting(t, at, dur, count) + s : s;
        ctx.font = `900 ${Math.round(size * u)}px ${HEAVY3}`;
        const w = Math.max(ctx.measureText(`${value}0`).width, size * 2 * u);
        const h = size * 1.2 * u;
        ctx.fillStyle = IVORY;
        ctx.fillRect(X(x) - w / 2, Y(y) - h / 2, w, h);
        ctx.fillStyle = BLACK7;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(value, X(x), Y(y) + 2 * u);
        if (tone === "accent" && t > at + dur) {
          const q = progress(t, at + dur, 0.3);
          ctx.strokeStyle = RED6;
          ctx.lineWidth = 4 * u;
          ctx.beginPath();
          ctx.ellipse(X(x), Y(y), w * 0.48, h * 0.55, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * q);
          ctx.stroke();
        }
        if (sub)
          slab(sub.toUpperCase(), X(x), Y(y) - h / 2 - size * 0.2 * u, size * 0.24, BLACK7);
      });
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 22) * u;
      flipped(X(x), Y(y), o.at, () => {
        const [cx, cy] = [X(x), Y(y)];
        ctx.fillStyle = kind === "check" ? BLACK7 : RED6;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        ctx.strokeStyle = IVORY;
        ctx.lineWidth = r * 0.24;
        ctx.lineJoin = "miter";
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.5, cy],
            [cx - r * 0.12, cy + r * 0.38],
            [cx + r * 0.55, cy - r * 0.4]
          ]);
        else
          trace(ctx, [
            [cx - r * 0.45, cy - r * 0.45],
            [cx + r * 0.45, cy + r * 0.45],
            [cx, cy],
            [cx + r * 0.45, cy - r * 0.45],
            [cx - r * 0.45, cy + r * 0.45]
          ]);
        ctx.stroke();
      });
    },
    finish() {}
  };
}
var op_art_default = {
  id: "op-art",
  name: "Op art",
  category: "Generative & Type",
  make: make47
};

// plugin/skills/motion-graphics/styles/origami.ts
var PAPER7 = {
  ink: ["#EDE6D8", "#CFC6B4"],
  accent: ["#E8806A", "#C45E4C"],
  good: ["#2E8C84", "#1F6A64"],
  bad: ["#D8433A", "#A82E28"],
  muted: ["#D9A440", "#B07F26"]
};
var INK12 = "#26262B";
var TEXT3 = {
  ink: INK12,
  accent: "#D2533E",
  good: "#23807A",
  bad: "#C8372E",
  muted: "#9C7A2A"
};
var FACE3 = '"Avenir Next", "Futura", "Helvetica Neue", Arial, sans-serif';
var LIGHT2 = [-0.6, -0.8];
function make48(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__origami ??= new Map;
  const cache = g.__origami;
  const fold = (at) => t < at ? 0 : spring(t, { start: at, stiffness: 150, damping: 13 });
  function shadow(cx, cy, rx, k = 1) {
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    gr.addColorStop(0, `rgba(40,40,50,${0.28 * k})`);
    gr.addColorStop(1, "rgba(40,40,50,0)");
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.22);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function facet(pts, tone) {
    const [a, b, c] = pts;
    const nx = (a[0] + b[0] + c[0]) / 3;
    const ny = (a[1] + b[1] + c[1]) / 3;
    return { pts, nx, ny, tone };
  }
  function mix(c1, c2, f) {
    const p = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
    const [r1, g1, b1] = p(c1);
    const [r2, g2, b2] = p(c2);
    const k = clamp(f);
    return `rgb(${Math.round(r1 + (r2 - r1) * k)},${Math.round(g1 + (g2 - g1) * k)},${Math.round(b1 + (b2 - b1) * k)})`;
  }
  function ball(cx, cy, R, tone, f, seed) {
    const ry = R * (0.2 + 0.8 * f);
    const n = 9;
    const ring = Array.from({ length: n }, (_, i) => {
      const a = i / n * Math.PI * 2 + seed;
      const rr = 1 + (hash(seed * 10 + i) - 0.5) * 0.12;
      return [cx + Math.cos(a) * R * rr, cy - ry * 0.05 + Math.sin(a) * ry * rr];
    });
    const inner = Array.from({ length: n }, (_, i) => {
      const a = (i + 0.5) / n * Math.PI * 2 + seed;
      return [cx + Math.cos(a) * R * 0.55, cy - ry * 0.12 + Math.sin(a) * ry * 0.55];
    });
    const top = [cx - R * 0.12, cy - ry * 0.2];
    const faces = [];
    for (let i = 0;i < n; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const c = inner[i];
      const d = inner[(i + 1) % n];
      faces.push(facet([a, b, c], tone), facet([b, d, c], tone), facet([c, d, top], tone));
    }
    const [lit, shade] = PAPER7[tone];
    for (const fc of faces) {
      const dx = (fc.nx - cx) / R;
      const dy = (fc.ny - cy) / Math.max(1, ry);
      const facing = -(dx * LIGHT2[0] + dy * LIGHT2[1]);
      ctx.fillStyle = mix(shade, lit, 0.5 + facing * 0.6 + (hash(fc.nx + fc.ny) - 0.5) * 0.15);
      trace(ctx, fc.pts, true);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = Math.max(0.5, 0.6 * u);
      ctx.stroke();
    }
  }
  function tent(x0, y0, w, h, tone, f) {
    const hh = h * f;
    const yb = y0 + h;
    shadow(x0 + w / 2 + 10 * u, yb, w * 0.6, f);
    const [lit, shade] = PAPER7[tone];
    ctx.fillStyle = shade;
    trace(ctx, [
      [x0 + 6 * u, yb - hh - 6 * u * f],
      [x0 + w + 8 * u, yb - hh - 4 * u * f],
      [x0 + w, yb - hh],
      [x0, yb - hh]
    ], true);
    ctx.fill();
    const gr = ctx.createLinearGradient(x0, yb - hh, x0 + w, yb);
    gr.addColorStop(0, lit);
    gr.addColorStop(1, mix(lit, shade, 0.35));
    ctx.fillStyle = gr;
    trace(ctx, [
      [x0, yb - hh],
      [x0 + w, yb - hh],
      [x0 + w + 4 * u, yb],
      [x0 - 4 * u, yb]
    ], true);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.moveTo(x0, yb - hh);
    ctx.lineTo(x0 + w, yb - hh);
    ctx.stroke();
    return { top: yb - hh, bottom: yb };
  }
  function printed(s, x, y, size, color, align, weight = 700) {
    ctx.font = `${weight} ${Math.round(size * u)}px ${FACE3}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s, x, y);
    return ctx.measureText(s).width;
  }
  return {
    surface() {
      const key = `${W}x${H}`;
      let img = cache.get(key);
      if (!img) {
        img = new OffscreenCanvas(W, H);
        const c = img.getContext("2d");
        const gr = c.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, "#C9CCCB");
        gr.addColorStop(0.55, "#E4E5E2");
        gr.addColorStop(1, "#D5D6D2");
        c.fillStyle = gr;
        c.fillRect(0, 0, W, H);
        const key2 = c.createRadialGradient(W * 0.35, H * 0.3, 0, W * 0.35, H * 0.3, Math.max(W, H) * 0.8);
        key2.addColorStop(0, "rgba(255,255,250,0.55)");
        key2.addColorStop(1, "rgba(255,255,250,0)");
        c.fillStyle = key2;
        c.fillRect(0, 0, W, H);
        cache.set(key, img);
      }
      ctx.drawImage(img, 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.06, size = 50, at = 0, tone = "ink", align = "left" } = o;
      const f = fold(at);
      if (f <= 0)
        return;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${FACE3}`;
      const w = ctx.measureText(s).width + size * 1.2 * u;
      ctx.restore();
      const h = size * 1.7 * u;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      const r = tent(left, Y(y), w, h, "ink", f);
      if (f > 0.6) {
        ctx.save();
        ctx.globalAlpha = clamp((f - 0.6) * 2.5);
        printed(s, left + size * 0.6 * u, (r.top + r.bottom) / 2, size, TEXT3[tone === "ink" ? "accent" : tone], "left");
        ctx.restore();
      }
    },
    label(s, x, y, o = {}) {
      const size = o.size ?? 26;
      const f = fold(o.at ?? 0);
      if (f <= 0)
        return;
      const tone = o.tone ?? "ink";
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${FACE3}`;
      const w = ctx.measureText(s).width + size * 0.9 * u;
      const h = size * 1.4 * u;
      const align = o.align ?? "center";
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      ctx.translate(left + w / 2, Y(y));
      ctx.rotate((hash(x * 13 + y * 7) - 0.5) * 0.1);
      ctx.scale(1, f);
      ctx.shadowColor = "rgba(40,40,50,0.3)";
      ctx.shadowBlur = 6 * u;
      ctx.shadowOffsetY = 3 * u;
      ctx.fillStyle = PAPER7.ink[0];
      trace(ctx, [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2 + 6 * u, h / 2],
        [-w / 2 - 2 * u, h / 2]
      ], true);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      trace(ctx, [
        [0, -h / 2],
        [w / 2, -h / 2],
        [w / 2 + 6 * u, h / 2],
        [0, h / 2]
      ], true);
      ctx.fill();
      printed(s, 0, size * 0.04 * u, size, TEXT3[tone], "center");
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const f = fold(at);
      if (f <= 0)
        return;
      const R = r * 1.1 * u;
      shadow(X(x) + R * 0.4, Y(y) + R * 0.9, R * 1.3, f);
      ball(X(x), Y(y), R, tone, f, hash(x * 7 + y * 3) * 2);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const f = fold(at);
      if (f <= 0)
        return;
      tent(X(x), Y(y), X(w), Y(h), "ink", f);
      if (tone !== "ink") {
        ctx.fillStyle = PAPER7[tone][0];
        const hh = Y(h) * f;
        ctx.fillRect(X(x), Y(y + h) - hh, X(w), 6 * u * f);
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "muted" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * (1 - (1 - p) ** 2))));
      const thin = !head && tone === "accent";
      const t2 = tone === "ink" ? "muted" : tone;
      const [lit, shade] = PAPER7[t2];
      const w = (thin ? 2 : 7) * u;
      ctx.save();
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      if (thin) {
        trace(ctx, shown);
        ctx.strokeStyle = "rgba(60,60,70,0.4)";
        ctx.lineWidth = w;
        ctx.stroke();
        ctx.restore();
        return;
      }
      ctx.shadowColor = "rgba(40,40,50,0.3)";
      ctx.shadowBlur = 5 * u;
      ctx.shadowOffsetY = 3 * u;
      trace(ctx, shown);
      ctx.strokeStyle = shade;
      ctx.lineWidth = w * 2;
      ctx.stroke();
      ctx.shadowColor = "transparent";
      ctx.translate(0, -w * 0.5);
      trace(ctx, shown);
      ctx.strokeStyle = lit;
      ctx.lineWidth = w;
      ctx.stroke();
      ctx.translate(0, w * 0.5);
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 26 * u;
        const tip = [end[0] + Math.cos(a) * s * 0.6, end[1] + Math.sin(a) * s * 0.6];
        const l = [
          end[0] + Math.cos(a - Math.PI / 2) * s * 0.6,
          end[1] + Math.sin(a - Math.PI / 2) * s * 0.6
        ];
        const rr = [
          end[0] + Math.cos(a + Math.PI / 2) * s * 0.6,
          end[1] + Math.sin(a + Math.PI / 2) * s * 0.6
        ];
        ctx.fillStyle = lit;
        trace(ctx, [tip, l, end], true);
        ctx.fill();
        ctx.fillStyle = shade;
        trace(ctx, [tip, end, rr], true);
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, tone = "good" } = o;
      const f = fold(at);
      if (f <= 0)
        return;
      const [x0, bw] = [X(x), X(w)];
      const yb = Y(y + h);
      const hh = Y(h) * f;
      const cx = x0 + bw / 2;
      const d = bw * 0.22;
      shadow(cx + bw * 0.3, yb, bw * 0.9, f);
      const [lit, shade] = PAPER7[tone];
      const yt = yb - hh;
      ctx.fillStyle = mix(lit, "#FFFFFF", 0.15);
      trace(ctx, [
        [x0, yt],
        [x0 + bw * 0.25, yt - d],
        [x0 + bw * 0.75, yt - d],
        [x0 + bw, yt],
        [x0 + bw * 0.75, yt + d * 0.5],
        [x0 + bw * 0.25, yt + d * 0.5]
      ], true);
      ctx.fill();
      ctx.fillStyle = lit;
      trace(ctx, [
        [x0, yt],
        [x0 + bw * 0.25, yt + d * 0.5],
        [x0 + bw * 0.25, yb + d * 0.5],
        [x0, yb]
      ], true);
      ctx.fill();
      ctx.fillStyle = mix(lit, shade, 0.45);
      trace(ctx, [
        [x0 + bw * 0.25, yt + d * 0.5],
        [x0 + bw * 0.75, yt + d * 0.5],
        [x0 + bw * 0.75, yb + d * 0.5],
        [x0 + bw * 0.25, yb + d * 0.5]
      ], true);
      ctx.fill();
      ctx.fillStyle = shade;
      trace(ctx, [
        [x0 + bw * 0.75, yt + d * 0.5],
        [x0 + bw, yt],
        [x0 + bw, yb],
        [x0 + bw * 0.75, yb + d * 0.5]
      ], true);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = u;
      for (const k of [0.33, 0.66]) {
        ctx.beginPath();
        ctx.moveTo(x0, yt + hh * k);
        ctx.lineTo(x0 + bw * 0.25, yt + hh * k + d * 0.5);
        ctx.lineTo(x0 + bw * 0.75, yt + hh * k + d * 0.5);
        ctx.lineTo(x0 + bw, yt + hh * k);
        ctx.stroke();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      const f = fold(at);
      if (f <= 0)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      if (sub) {
        ctx.save();
        ctx.font = `700 ${Math.round(size * u)}px ${FACE3}`;
        const w = Math.max(ctx.measureText(value).width, size * 2.2 * u) + size * 0.6 * u;
        ctx.restore();
        const h = size * 1.9 * u;
        const r = tent(X(x) - w / 2, Y(y) - h * 0.45, w, h, "ink", f);
        if (f > 0.6) {
          ctx.save();
          ctx.globalAlpha = clamp((f - 0.6) * 2.5);
          printed(sub, X(x), r.top + size * 0.35 * u, size * 0.3, TEXT3.good, "center", 600);
          printed(value, X(x), r.top + size * 1.05 * u, size, TEXT3[tone === "ink" ? "accent" : tone], "center");
          ctx.restore();
        }
        return;
      }
      ctx.save();
      ctx.globalAlpha = clamp(f * 1.5);
      printed(value, X(x), Y(y), size, TEXT3[tone], "center");
      ctx.restore();
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const f = fold(o.at ?? 0);
      if (f <= 0)
        return;
      const [lit, shade] = PAPER7[o.tone ?? (kind === "check" ? "good" : "bad")];
      const [cx, cy] = [X(x), Y(y)];
      const strip = (a, b) => {
        ctx.lineCap = "butt";
        ctx.strokeStyle = shade;
        ctx.lineWidth = 11 * u;
        trace(ctx, [a, b]);
        ctx.stroke();
        ctx.strokeStyle = lit;
        ctx.lineWidth = 5 * u;
        trace(ctx, [
          [a[0], a[1] - 2.5 * u],
          [b[0], b[1] - 2.5 * u]
        ]);
        ctx.stroke();
      };
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, f);
      ctx.translate(-cx, -cy);
      ctx.shadowColor = "rgba(40,40,50,0.3)";
      ctx.shadowBlur = 5 * u;
      ctx.shadowOffsetY = 3 * u;
      if (kind === "check") {
        strip([cx - s * 0.5, cy], [cx - s * 0.1, cy + s * 0.4]);
        strip([cx - s * 0.1, cy + s * 0.4], [cx + s * 0.6, cy - s * 0.5]);
      } else {
        strip([cx - s * 0.5, cy - s * 0.5], [cx + s * 0.5, cy + s * 0.5]);
        strip([cx + s * 0.5, cy - s * 0.5], [cx - s * 0.5, cy + s * 0.5]);
      }
      ctx.restore();
    },
    finish() {
      const gr = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.4, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, "rgba(40,40,50,0.18)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }
  };
}
var origami_default = {
  id: "origami",
  name: "Folded paper",
  category: "Paper & Craft",
  make: make48
};

// plugin/skills/motion-graphics/styles/oscilloscope.ts
var GREEN = "#8CFFA8";
var AMBER = "#FFB547";
var BEAM = {
  ink: GREEN,
  accent: GREEN,
  good: GREEN,
  bad: AMBER,
  muted: "#4E9A62"
};
var MONO7 = '"Menlo", "DIN Alternate", "Consolas", "Courier New", monospace';
function make49(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const heads = [];
  const sx = W * 0.012;
  const sy = H * 0.02;
  const sw = W - sx * 2;
  const sh = H - sy * 2;
  const shake = (tone, at) => tone === "bad" && t - at < 1.2 ? (hash(Math.floor(t * 30)) - 0.5) * 4 * u : 0;
  function beam(points, at, dur, tone, width = 2.2) {
    const p = progress(t, at, dur);
    if (p <= 0)
      return null;
    const res = along(points, p);
    const c = BEAM[tone];
    const dx = shake(tone, at);
    ctx.save();
    ctx.translate(dx, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "lighter";
    trace(ctx, res.points);
    ctx.strokeStyle = c;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = width * 4 * u;
    ctx.shadowColor = c;
    ctx.shadowBlur = 16 * u;
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.shadowBlur = 6 * u;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
    if (p < 1) {
      const end = res.points.at(-1);
      heads.push({ x: end[0] + dx, y: end[1], c });
    }
    return res;
  }
  function write(s, x, y, size, tone, at, dur, align = "left") {
    const p = progress(t, at, dur);
    if (p <= 0)
      return;
    const c = BEAM[tone];
    const dx = shake(tone, at);
    ctx.save();
    ctx.font = `500 ${Math.round(size * u)}px ${MONO7}`;
    ctx.letterSpacing = `${(size * 0.04 * u).toFixed(1)}px`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = (align === "center" ? x - w / 2 : align === "right" ? x - w : x) + dx;
    ctx.beginPath();
    ctx.rect(left - 4 * u, y - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = c;
    ctx.shadowBlur = 14 * u;
    ctx.lineWidth = Math.max(1.2, size * 0.05) * u;
    ctx.strokeStyle = c;
    ctx.globalAlpha = 0.9;
    ctx.strokeText(s, left, y);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = c;
    ctx.fillText(s, left, y);
    ctx.restore();
    if (p < 1)
      heads.push({ x: left + w * p, y, c });
  }
  function rectPts(l, tp, w, h) {
    return [
      [l, tp],
      [l + w, tp],
      [l + w, tp + h],
      [l, tp + h],
      [l, tp]
    ];
  }
  return {
    surface() {
      const bz = ctx.createLinearGradient(0, 0, 0, H);
      bz.addColorStop(0, "#3A3B38");
      bz.addColorStop(1, "#1E1F1D");
      ctx.fillStyle = bz;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(sx, sy, sw, sh, 28 * u);
      ctx.clip();
      const face = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(sw, sh) * 0.55);
      face.addColorStop(0, "#0E1A12");
      face.addColorStop(1, "#040805");
      ctx.fillStyle = face;
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = "rgba(140,255,168,0.09)";
      ctx.lineWidth = 1 * u;
      for (let i = 1;i < 10; i++) {
        ctx.beginPath();
        ctx.moveTo(sx + sw * i / 10, sy);
        ctx.lineTo(sx + sw * i / 10, sy + sh);
        ctx.stroke();
      }
      for (let i = 1;i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(sx, sy + sh * i / 8);
        ctx.lineTo(sx + sw, sy + sh * i / 8);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(140,255,168,0.14)";
      for (let i = 0;i < 50; i++) {
        const x = sx + sw * i / 50;
        ctx.beginPath();
        ctx.moveTo(x, sy + sh / 2 - 4 * u);
        ctx.lineTo(x, sy + sh / 2 + 4 * u);
        ctx.stroke();
      }
      for (let i = 0;i < 40; i++) {
        const y = sy + sh * i / 40;
        ctx.beginPath();
        ctx.moveTo(sx + sw / 2 - 4 * u, y);
        ctx.lineTo(sx + sw / 2 + 4 * u, y);
        ctx.stroke();
      }
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.08, size = 44, at = 0, dur, align = "left" } = o;
      write(s.toUpperCase(), X(x), Y(y), size, "ink", at, dur ?? 0.05 * s.length + 0.2, align);
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 26, tone = "ink", align = "center" } = o;
      write(s.toUpperCase(), X(x), Y(y), size, tone, at, o.dur ?? 0.03 * s.length + 0.15, align);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.3, tone = "ink" } = o;
      const R = r * 0.8 * u;
      const res = beam(ellipse(X(x), Y(y), R, R, 36, -Math.PI / 2, 1), at, dur, tone, 2);
      if (res && progress(t, at, dur) >= 1) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = BEAM[tone];
        ctx.shadowColor = BEAM[tone];
        ctx.shadowBlur = 10 * u;
        ctx.beginPath();
        ctx.arc(X(x), Y(y), 2.6 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      beam(rectPts(X(x), Y(y), X(w), Y(h)), at, dur, tone, 2.2);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 32);
      const res = beam(pts, at, dur, tone, head ? 2.2 : 1);
      if (!res || !head || progress(t, at, dur) < 1)
        return;
      const tip = pts.at(-1);
      const s = 14 * u;
      beam([
        [tip[0] - Math.cos(res.angle - 0.5) * s, tip[1] - Math.sin(res.angle - 0.5) * s],
        tip,
        [tip[0] - Math.cos(res.angle + 0.5) * s, tip[1] - Math.sin(res.angle + 0.5) * s]
      ], at + dur, 0.08, tone, 2.2);
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "ink" } = o;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.3;
      const top = Y(y) + ry;
      const bot = Y(y + h) - ry;
      const n = 4;
      for (let i = 0;i < n; i++) {
        beam(ellipse(cx, top + (bot - top) * i / (n - 1), rx, ry, 40, -Math.PI / 2, 1), at + i * dur / (n + 1), dur / (n + 1), tone, 2);
      }
      beam([
        [cx - rx, top],
        [cx - rx, bot]
      ], at + dur * 0.8, 0.15, tone, 2);
      beam([
        [cx + rx, top],
        [cx + rx, bot]
      ], at + dur * 0.8, 0.15, tone, 2);
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const flicker = count && t < at + dur ? 0.75 + 0.25 * hash(Math.floor(t * 30)) : 1;
      ctx.save();
      ctx.globalAlpha = flicker;
      write(value, X(x), Y(y), size, tone === "accent" ? "ink" : tone, at, 0.2, "center");
      ctx.restore();
      if (sub)
        write(sub.toUpperCase(), X(x), Y(y) + size * 0.8 * u, size * 0.3, tone === "accent" ? "ink" : tone, at + 0.2, 0.3, "center");
      if (count && size >= 80) {
        const w = size * 1.6 * u;
        const pts = Array.from({ length: 61 }, (_, i) => {
          const f = i / 60;
          return [
            X(x) - w / 2 + w * f,
            Y(y) + size * 1.25 * u + Math.sin(f * Math.PI * 6 + t * 4) * 6 * u * (1 - f * 0.7)
          ];
        });
        beam(pts, at + dur, 0.5, "ink", 1.6);
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const s = (o.size ?? 30) * u;
      const cx = X(x);
      const cy = Y(y);
      if (kind === "check")
        beam([
          [cx - s * 0.5, cy],
          [cx - s * 0.12, cy + s * 0.4],
          [cx + s * 0.55, cy - s * 0.5]
        ], at, 0.3, "ink", 2.6);
      else {
        beam([
          [cx - s * 0.45, cy - s * 0.45],
          [cx + s * 0.45, cy + s * 0.45]
        ], at, 0.15, "bad", 2.6);
        beam([
          [cx + s * 0.45, cy - s * 0.45],
          [cx - s * 0.45, cy + s * 0.45]
        ], at + 0.15, 0.15, "bad", 2.6);
      }
    },
    finish() {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const h of heads) {
        const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 14 * u);
        g.addColorStop(0, "rgba(240,255,240,1)");
        g.addColorStop(0.25, h.c);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(h.x - 14 * u, h.y - 14 * u, 28 * u, 28 * u);
      }
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(sx, sy, sw, sh, 28 * u);
      ctx.clip();
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(sw, sh) * 0.35, W / 2, H / 2, Math.hypot(sw, sh) * 0.58);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = v;
      ctx.fillRect(sx, sy, sw, sh);
      const glare = ctx.createLinearGradient(sx, sy, sx + sw * 0.4, sy + sh * 0.5);
      glare.addColorStop(0, "rgba(255,255,255,0.05)");
      glare.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glare;
      ctx.fillRect(sx, sy, sw, sh);
      ctx.restore();
      ctx.save();
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.roundRect(sx, sy, sw, sh, 28 * u);
      ctx.stroke();
      ctx.restore();
    }
  };
}
var oscilloscope_default = {
  id: "oscilloscope",
  name: "Vector scope",
  category: "Retro Digital",
  make: make49
};

// plugin/skills/motion-graphics/styles/paper-marbling.ts
var PAPER8 = "#EFE6D2";
var LABEL = "#F7F1E3";
var INK13 = "#2A2219";
var TONE12 = {
  ink: "#1F2A5C",
  accent: "#C9962E",
  good: "#3B7A57",
  bad: "#A3262A",
  muted: "#8DA9C8"
};
var PIGMENTS = ["#1F2A5C", "#C9962E", "#8DA9C8", "#C8B28A", "#2E6F73"];
var SERIF9 = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif';
function make50(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__marbling ??= new Map;
  const cache = g.__marbling;
  function blob(cx, cy, r, seed, pull = 0) {
    return Array.from({ length: 49 }, (_, i) => {
      const a = i / 48 * Math.PI * 2;
      const k = 1 + Math.sin(a * 3 + seed) * 0.08 + Math.sin(a * 5 + seed * 2) * 0.05;
      const x = cx + Math.cos(a) * r * k;
      const y = cy + Math.sin(a) * r * k;
      return [x + pull * r * Math.exp(-(((y - cy) / r) ** 2) * 3) * (Math.cos(a) > 0 ? 1 : 0.2), y];
    });
  }
  function sheet() {
    const key = `${W}x${H}`;
    let tex = cache.get(key);
    if (tex)
      return tex;
    tex = new OffscreenCanvas(W, H);
    const c = tex.getContext("2d");
    c.fillStyle = PAPER8;
    c.fillRect(0, 0, W, H);
    c.strokeStyle = "rgba(120,95,60,0.06)";
    c.lineWidth = 1;
    for (let y = 0;y < H; y += 5 * u) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }
    const fill = (pts, col) => {
      c.fillStyle = col;
      c.beginPath();
      for (const [i, [x, y]] of pts.entries())
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      c.closePath();
      c.fill();
    };
    const shapes = [];
    for (let i = 0;i < 46; i++) {
      const cx = hash(i * 3.3) * W;
      const cy = hash(i * 5.1 + 2) * H;
      const r = (40 + hash(i * 7.7) * 80) * u;
      for (const sh of shapes)
        sh.pts = sh.pts.map(([x, y]) => {
          const dx = x - cx;
          const dy = y - cy;
          const d2 = dx * dx + dy * dy || 1;
          const k = Math.sqrt(1 + r * r / d2);
          return [cx + dx * k, cy + dy * k];
        });
      shapes.push({
        pts: Array.from({ length: 160 }, (_, k) => {
          const a = k / 160 * Math.PI * 2;
          return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
        }),
        col: i % 7 === 6 ? PAPER8 : PIGMENTS[i % PIGMENTS.length]
      });
    }
    for (let k = 0;k < 5; k++) {
      const ty = H * (0.1 + k * 0.2);
      const amp = (k % 2 ? -1 : 1) * W * 0.07;
      const lam = H * 0.06;
      for (const sh of shapes)
        sh.pts = sh.pts.map(([x, y]) => [x + amp * lam / (Math.abs(y - ty) + lam), y]);
    }
    for (const sh of shapes)
      fill(sh.pts, alpha(sh.col, 0.92));
    const calm = c.createLinearGradient(0, 0, 0, H);
    calm.addColorStop(0.12, "rgba(239,230,210,0)");
    calm.addColorStop(0.3, "rgba(239,230,210,0.72)");
    calm.addColorStop(0.78, "rgba(239,230,210,0.72)");
    calm.addColorStop(0.95, "rgba(239,230,210,0)");
    c.fillStyle = calm;
    c.fillRect(0, 0, W, H);
    for (let i = 0;i < 400; i++) {
      c.fillStyle = `rgba(90,70,40,${0.03 + hash(i) * 0.04})`;
      c.fillRect(hash(i * 1.7) * W, hash(i * 2.9) * H, (2 + hash(i * 4.4) * 8) * u, 1 * u);
    }
    cache.set(key, tex);
    return tex;
  }
  function label(s, cx, cy, size, tone, align = "center", italic = true) {
    ctx.font = `${italic ? "italic " : ""}500 ${Math.round(size * u)}px ${SERIF9}`;
    const w = ctx.measureText(s).width + size * 1.1 * u;
    const h = size * 1.55 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    const red = tone === "bad";
    ctx.fillStyle = "rgba(40,25,10,0.22)";
    ctx.fillRect(left + 3 * u, cy - h / 2 + 3 * u, w, h);
    ctx.fillStyle = red ? "#F9E4DE" : LABEL;
    ctx.fillRect(left, cy - h / 2, w, h);
    ctx.strokeStyle = red ? TONE12.bad : "rgba(42,34,25,0.7)";
    ctx.lineWidth = 1 * u;
    ctx.strokeRect(left + 3 * u, cy - h / 2 + 3 * u, w - 6 * u, h - 6 * u);
    ctx.fillStyle = red ? TONE12.bad : INK13;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + w / 2, cy + u);
    return w;
  }
  function laid(cx, cy, at, draw) {
    const s = spring(t, { start: at ?? 0, stiffness: 180, damping: 15 });
    if (s <= 0)
      return;
    ctx.save();
    ctx.globalAlpha = clamp(s * 2);
    ctx.translate(cx, cy);
    ctx.rotate((1 - s) * 0.08);
    ctx.scale(1.08 - 0.08 * s, 1.08 - 0.08 * s);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }
  function drop(cx, cy, r, at, colors, seed) {
    const p = progress(t, at, 0.7);
    if (p <= 0)
      return;
    const grow = expo(p);
    for (let k = 0;k < colors.length; k++) {
      const rr = r * grow * (1 - k / (colors.length + 0.5));
      if (rr <= 0)
        continue;
      ctx.fillStyle = colors[k];
      trace(ctx, blob(cx, cy, rr, seed + k), true);
      ctx.fill();
    }
  }
  return {
    surface() {
      ctx.drawImage(sheet(), 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 40, at = 0, align = "left" } = o;
      ctx.save();
      ctx.font = `italic 500 ${Math.round(size * u)}px ${SERIF9}`;
      const w = ctx.measureText(s).width + size * 1.1 * u;
      ctx.restore();
      const cx = align === "center" ? X(x) : align === "right" ? X(x) - w / 2 : X(x) + w / 2;
      laid(cx, Y(y), at, () => label(s, cx, Y(y), size, "ink"));
    },
    label(s, x, y, o = {}) {
      laid(X(x), Y(y), o.at, () => label(s, X(x), Y(y), o.size ?? 28, o.tone ?? "ink", o.align ?? "center"));
    },
    node(x, y, r, o = {}) {
      const tone = o.tone ?? "accent";
      const base = tone === "accent" ? TONE12.ink : TONE12[tone];
      const second = tone === "accent" ? TONE12.accent : PAPER8;
      drop(X(x), Y(y), r * u * 1.1, o.at ?? 0, [base, second, base, PAPER8], x * 40 + y * 13);
    },
    box(x, y, w, h, o = {}) {
      laid(X(x + w / 2), Y(y + h / 2), o.at, () => {
        const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
        ctx.fillStyle = "rgba(40,25,10,0.25)";
        ctx.fillRect(x0 + 5 * u, y0 + 5 * u, bw, bh);
        ctx.fillStyle = LABEL;
        ctx.fillRect(x0, y0, bw, bh);
        ctx.strokeStyle = o.tone === "good" ? TONE12.good : "rgba(42,34,25,0.75)";
        ctx.lineWidth = 1.2 * u;
        ctx.strokeRect(x0 + 6 * u, y0 + 6 * u, bw - 12 * u, bh - 12 * u);
        ctx.lineWidth = 0.6 * u;
        ctx.strokeRect(x0 + 10 * u, y0 + 10 * u, bw - 20 * u, bh - 20 * u);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const { points, angle } = along(pts, expo(p));
      const col = tone === "accent" ? TONE12.ink : tone === "ink" ? INK13 : TONE12[tone];
      ctx.save();
      ctx.strokeStyle = col;
      ctx.globalAlpha = head ? 1 : 0.55;
      ctx.lineWidth = (head ? 2 : 1.1) * u;
      ctx.lineCap = "round";
      trace(ctx, points);
      ctx.stroke();
      if (head && p >= 1) {
        arrowhead(ctx, pts.at(-1), angle, 12 * u, false);
        ctx.fillStyle = col;
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const cx = X(x + w / 2);
      const r = X(w) * 0.7;
      const n = 4;
      for (let i = 0;i < n; i++) {
        const cy = Y(y) + Y(h) * ((i + 0.5) / n);
        const cols = i % 2 ? [TONE12.accent, PAPER8, TONE12.accent] : [TONE12.ink, TONE12.muted, TONE12.ink, PAPER8];
        drop(cx + (hash(i) - 0.5) * r * 0.5, cy, r * (0.75 + hash(i + 2) * 0.3), at + i / n * dur, cols, i * 9 + x * 30);
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      laid(X(x), Y(y), at, () => {
        ctx.font = `600 ${Math.round(size * u)}px ${SERIF9}`;
        const w = ctx.measureText(value).width;
        if (sub) {
          const bw = Math.max(w + size * 0.8 * u, size * 2.6 * u);
          const bh = size * 1.75 * u;
          ctx.fillStyle = "rgba(40,25,10,0.25)";
          ctx.fillRect(X(x) - bw / 2 + 5 * u, Y(y) - bh / 2 + 5 * u, bw, bh);
          ctx.fillStyle = LABEL;
          ctx.fillRect(X(x) - bw / 2, Y(y) - bh / 2, bw, bh);
          ctx.strokeStyle = "rgba(42,34,25,0.75)";
          ctx.lineWidth = 1.2 * u;
          ctx.strokeRect(X(x) - bw / 2 + 6 * u, Y(y) - bh / 2 + 6 * u, bw - 12 * u, bh - 12 * u);
          ctx.font = `italic 500 ${Math.round(size * 0.26 * u)}px ${SERIF9}`;
          ctx.fillStyle = INK13;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(sub[0]?.toUpperCase() + sub.slice(1), X(x) - bw / 2 + size * 0.25 * u, Y(y) - bh / 2 + size * 0.3 * u);
        }
        ctx.font = `600 ${Math.round(size * u)}px ${SERIF9}`;
        ctx.fillStyle = tone === "good" ? TONE12.good : INK13;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const vy = Y(y) + (sub ? size * 0.15 * u : 0);
        ctx.fillText(value, X(x), vy);
        if (tone === "accent") {
          const q = progress(t, at + dur, 0.4);
          if (q > 0) {
            trace(ctx, along(Array.from({ length: 41 }, (_, i) => {
              const a = i / 40 * Math.PI * 2.1 - 2.6;
              return [
                X(x) + Math.cos(a) * (w / 2 + 12 * u),
                vy + Math.sin(a) * size * 0.5 * u
              ];
            }), q).points);
            ctx.strokeStyle = TONE12.bad;
            ctx.lineWidth = 2.5 * u;
            ctx.stroke();
          }
        }
      });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 24) * u;
      const p = progress(t, o.at ?? 0, 0.3);
      if (p <= 0)
        return;
      const [cx, cy] = [X(x), Y(y)];
      const path = kind === "check" ? [
        [cx - s * 0.5, cy],
        [cx - s * 0.15, cy + s * 0.4],
        [cx + s * 0.55, cy - s * 0.45]
      ] : [
        [cx - s * 0.45, cy - s * 0.45],
        [cx + s * 0.45, cy + s * 0.45],
        [cx, cy],
        [cx + s * 0.45, cy - s * 0.45],
        [cx - s * 0.45, cy + s * 0.45]
      ];
      trace(ctx, along(path, p).points);
      ctx.strokeStyle = TONE12.bad;
      ctx.lineWidth = 3 * u;
      ctx.lineCap = "round";
      ctx.stroke();
    },
    finish() {
      const x = t * 0.15 % 1.6 * W - W * 0.3;
      const sheen = ctx.createLinearGradient(x, 0, x + W * 0.3, H);
      sheen.addColorStop(0, "rgba(255,255,255,0)");
      sheen.addColorStop(0.5, "rgba(255,255,255,0.08)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, W, H);
    }
  };
}
var paper_marbling_default = {
  id: "paper-marbling",
  name: "Marbled paper",
  category: "Generative & Type",
  make: make50
};

// plugin/skills/motion-graphics/styles/papercraft.ts
var FACE4 = {
  ink: ["#F7F2E6", "#E9E1CF", "#CFC5B0"],
  accent: ["#5C93E0", "#3E74C4", "#2C5A9E"],
  good: ["#52B86A", "#3A9A53", "#2A7A40"],
  bad: ["#F06A4A", "#D9502F", "#B23E22"],
  muted: ["#E3B85C", "#CC9C3E", "#A97E2C"]
};
var STRIP = {
  ink: "#F2C230",
  accent: "#F2C230",
  good: "#4FAE66",
  bad: "#E2463A",
  muted: "#C9BFA8"
};
var CARD = "#FBF8F0";
var INK14 = "#2A2622";
var ROUND7 = '"Arial Rounded MT Bold", "Nunito", "Varela Round", "Helvetica Neue", Arial, sans-serif';
function make51(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const tq = Math.floor(t * 12) / 12;
  const jit = (seed) => (hash(seed + Math.floor(t * 12) * 0.77) - 0.5) * 1.6 * u;
  const hop = (at = 0) => spring(tq, { start: at, stiffness: 180, damping: 12 });
  const fold = (at = 0, dur = 0.5) => clamp((tq - at) / dur);
  function shadow(blur = 14, dx = 6, dy = 9) {
    ctx.shadowColor = "rgba(10,30,15,0.35)";
    ctx.shadowBlur = blur * u;
    ctx.shadowOffsetX = dx * u;
    ctx.shadowOffsetY = dy * u;
  }
  function tent(cx, cy, w, h, header, at, seed, draw) {
    const f = fold(at, 0.42);
    if (f <= 0)
      return;
    const e = 1 - (1 - f) ** 2;
    ctx.save();
    ctx.translate(cx + jit(seed), cy + h / 2 + jit(seed + 3));
    ctx.scale(1, 0.12 + 0.88 * e);
    ctx.translate(0, -h / 2);
    ctx.fillStyle = "#D8D0BE";
    ctx.fillRect(-w / 2 + 4 * u, h / 2 - 2 * u, w - 8 * u, 10 * u);
    shadow();
    ctx.fillStyle = CARD;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.shadowColor = "transparent";
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, "rgba(255,255,255,0.0)");
    g.addColorStop(1, "rgba(120,100,70,0.12)");
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    const hh = Math.min(h * 0.16, 16 * u);
    ctx.fillStyle = header;
    ctx.fillRect(-w / 2, -h / 2, w, hh);
    ctx.setLineDash([5 * u, 5 * u]);
    ctx.strokeStyle = "rgba(60,50,40,0.35)";
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 6 * u, h / 2 - 4 * u);
    ctx.lineTo(w / 2 - 6 * u, h / 2 - 4 * u);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.translate(0, hh / 2);
    draw?.();
    ctx.restore();
  }
  function cube(cx, cy, s, tone) {
    const [top, front, side] = FACE4[tone];
    const d = s * 0.35;
    ctx.save();
    shadow(10, 5, 7);
    ctx.fillStyle = front;
    ctx.fillRect(cx - s / 2, cy - s / 2 + d / 2, s, s);
    ctx.shadowColor = "transparent";
    ctx.beginPath();
    ctx.moveTo(cx - s / 2, cy - s / 2 + d / 2);
    ctx.lineTo(cx - s / 2 + d, cy - s / 2 - d / 2);
    ctx.lineTo(cx + s / 2 + d, cy - s / 2 - d / 2);
    ctx.lineTo(cx + s / 2, cy - s / 2 + d / 2);
    ctx.closePath();
    ctx.fillStyle = top;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + s / 2, cy - s / 2 + d / 2);
    ctx.lineTo(cx + s / 2 + d, cy - s / 2 - d / 2);
    ctx.lineTo(cx + s / 2 + d, cy + s / 2 - d / 2);
    ctx.lineTo(cx + s / 2, cy + s / 2 + d / 2);
    ctx.closePath();
    ctx.fillStyle = side;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1 * u;
    ctx.strokeRect(cx - s / 2 + 0.5 * u, cy - s / 2 + d / 2 + 0.5 * u, s - u, s - u);
    ctx.restore();
  }
  function words(s, x, y, size, color, align = "center") {
    ctx.font = `800 ${Math.round(size * u)}px ${ROUND7}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s, x, y);
  }
  return {
    surface() {
      ctx.fillStyle = "#2F7A4E";
      ctx.fillRect(0, 0, W, H);
      const wood = ctx.createLinearGradient(0, 0, 0, H * 0.05);
      wood.addColorStop(0, "#8A5A34");
      wood.addColorStop(1, "#A8703F");
      ctx.fillStyle = wood;
      ctx.fillRect(0, 0, W, H * 0.04);
      ctx.save();
      ctx.lineWidth = 1 * u;
      const step = 36 * u;
      for (let i = 0, x = 0;x < W; i++, x += step) {
        ctx.strokeStyle = i % 5 ? "rgba(200,240,210,0.13)" : "rgba(220,250,225,0.3)";
        ctx.beginPath();
        ctx.moveTo(x, H * 0.04);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let i = 0, y = H * 0.04;y < H; i++, y += step) {
        ctx.strokeStyle = i % 5 ? "rgba(200,240,210,0.13)" : "rgba(220,250,225,0.3)";
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      for (let i = 0;i < 40; i++) {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(hash(i * 3.3) * W, hash(i * 5.1) * H, (10 + hash(i) * 30) * u, 1.5 * u);
      }
      const key = ctx.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, Math.max(W, H) * 0.9);
      key.addColorStop(0, "rgba(255,240,200,0.12)");
      key.addColorStop(1, "rgba(0,20,10,0.35)");
      ctx.fillStyle = key;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W * 0.93, H * 0.9);
      ctx.rotate(-0.5);
      shadow(8, 4, 6);
      ctx.fillStyle = "#F4F1EA";
      ctx.fillRect(-60 * u, -11 * u, 90 * u, 22 * u);
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#7D4FB5";
      ctx.fillRect(30 * u, -12 * u, 30 * u, 24 * u);
      ctx.restore();
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.07, size = 44, at = 0 } = o;
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${ROUND7}`;
      const w = ctx.measureText(s).width + 50 * u;
      const h = size * 1.9 * u;
      ctx.restore();
      const cx = o.align === "center" ? X(x) : X(x) + w / 2;
      tent(cx, Y(y) + h / 2 - 8 * u, w, h, "#3E74C4", at, 1, () => {
        const parts = s.split(" ");
        const last = parts.pop() ?? "";
        const head = parts.join(" ");
        ctx.font = `800 ${Math.round(size * u)}px ${ROUND7}`;
        const hw = ctx.measureText(head ? `${head} ` : "").width;
        const lw = ctx.measureText(last).width;
        const left = -(hw + lw) / 2;
        words(head ? `${head} ` : "", left, 0, size, INK14, "left");
        words(last, left + hw, 0, size, "#E8692A", "left");
      });
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 26, tone = "ink" } = o;
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${ROUND7}`;
      const w = ctx.measureText(s).width + 26 * u;
      ctx.restore();
      const h = size * 1.75 * u;
      const color = tone === "ink" ? INK14 : FACE4[tone][2];
      tent(X(x), Y(y), w, h, STRIP[tone === "ink" ? "accent" : tone], at, x * 91 + y * 7, () => words(s, 0, 0, size, color));
    },
    node(x, y, r, o = {}) {
      const s = hop(o.at);
      if (s <= 0)
        return;
      const R = r * 1.3 * u;
      const lift = (1 - clamp(s)) * 30 * u;
      cube(X(x) + jit(x * 13), Y(y) - lift, R * Math.min(1.1, s), o.tone ?? "accent");
    },
    box(x, y, w, h, o = {}) {
      tent(X(x + w / 2), Y(y + h / 2), X(w), Y(h), STRIP[o.tone ?? "accent"], o.at ?? 0, x * 51);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      const p = fold(at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 24);
      const { points } = along(pts, p);
      const wd = (head ? 12 : 3.5) * u;
      if (!head) {
        ctx.save();
        ctx.strokeStyle = "rgba(250,246,236,0.8)";
        ctx.lineWidth = 2.2 * u;
        ctx.beginPath();
        trace(ctx, points);
        ctx.stroke();
        ctx.restore();
        return;
      }
      ctx.save();
      shadow(6, 3, 5);
      for (let i = 1;i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
        const ox = Math.cos(ang) * wd;
        const oy = Math.sin(ang) * wd;
        ctx.beginPath();
        ctx.moveTo(a[0] + ox, a[1] + oy);
        ctx.lineTo(b[0] + ox, b[1] + oy);
        ctx.lineTo(b[0] - ox, b[1] - oy);
        ctx.lineTo(a[0] - ox, a[1] - oy);
        ctx.closePath();
        ctx.fillStyle = STRIP[tone];
        ctx.fill();
        if (i === 1)
          ctx.shadowColor = "transparent";
        if (i % 2) {
          ctx.fillStyle = "rgba(0,0,0,0.12)";
          ctx.fill();
        }
      }
      if (p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const L = 26 * u;
        const tip = [end[0] + Math.cos(a) * L * 0.4, end[1] + Math.sin(a) * L * 0.4];
        ctx.beginPath();
        ctx.moveTo(tip[0], tip[1]);
        ctx.lineTo(tip[0] - Math.cos(a - 0.6) * L, tip[1] - Math.sin(a - 0.6) * L);
        ctx.lineTo(tip[0] - Math.cos(a + 0.6) * L, tip[1] - Math.sin(a + 0.6) * L);
        ctx.closePath();
        ctx.fillStyle = STRIP[tone];
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "muted" } = o;
      const s = Math.min(X(w), Y(h) / 2.4);
      const cx = X(x + w / 2);
      for (let i = 0;i < 3; i++) {
        const k = hop(at + i * dur / 4);
        if (k <= 0)
          continue;
        const cy = Y(y + h) - s * 0.6 - i * s * 0.95 - (1 - clamp(k)) * 40 * u;
        cube(cx + (i % 2 ? 4 : -3) * u, cy, s * 0.9, i === 1 ? "ink" : tone);
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "good" } = o;
      const value = count ? counting(tq, at, dur, count) + s : s;
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${ROUND7}`;
      const w = Math.max(ctx.measureText(`${count ? count[1] : ""}${s}`).width, sub ? size * 2 * u : 0) + 40 * u;
      ctx.restore();
      const h = size * (sub ? 1.95 : 1.4) * u;
      const color = tone === "ink" ? INK14 : FACE4[tone][1];
      tent(X(x), Y(y), w, h, STRIP[tone === "ink" ? "accent" : tone], at, x * 31, () => {
        if (sub) {
          words(sub, 0, -size * 0.55 * u, size * 0.3, INK14);
          words(value, 0, size * 0.18 * u, size, color);
        } else
          words(value, 0, 0, size, color);
      });
    },
    mark(kind, x, y, o = {}) {
      const k = hop(o.at);
      if (k <= 0)
        return;
      const s = (o.size ?? 34) * u;
      const bx = X(x) - s * 0.6;
      const by = Y(y) + s * 0.9 - (1 - clamp(k)) * 30 * u;
      ctx.save();
      shadow(8, 4, 6);
      ctx.fillStyle = "#E8B72E";
      ctx.fillRect(bx - 6 * u, by - 4 * u, 12 * u, 10 * u);
      ctx.fillStyle = "#EDE6D6";
      ctx.fillRect(bx - 1.5 * u, by - s * 1.9, 3 * u, s * 1.9);
      ctx.fillStyle = kind === "check" ? "#3A9A53" : "#D9402F";
      ctx.fillRect(bx, by - s * 1.9, s * 1.4, s);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = CARD;
      ctx.lineWidth = 4 * u;
      ctx.lineCap = "round";
      const cx = bx + s * 0.7;
      const cy = by - s * 1.4;
      ctx.beginPath();
      if (kind === "check") {
        ctx.moveTo(cx - s * 0.3, cy);
        ctx.lineTo(cx - s * 0.05, cy + s * 0.22);
        ctx.lineTo(cx + s * 0.32, cy - s * 0.25);
      } else {
        ctx.moveTo(cx - s * 0.25, cy - s * 0.25);
        ctx.lineTo(cx + s * 0.25, cy + s * 0.25);
        ctx.moveTo(cx + s * 0.25, cy - s * 0.25);
        ctx.lineTo(cx - s * 0.25, cy + s * 0.25);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {}
  };
}
var papercraft_default = {
  id: "papercraft",
  name: "Papercraft",
  category: "Popular Explainer Looks",
  make: make51
};

// plugin/skills/motion-graphics/styles/patent-drawing.ts
var PAPER9 = "#EFE5CC";
var INK15 = "#1D1A16";
var RED7 = "#B8352B";
var COLOR = {
  ink: INK15,
  accent: INK15,
  good: INK15,
  bad: RED7,
  muted: "#6E665A"
};
var SERIF10 = '"Century Schoolbook", "Baskerville", "Times New Roman", Georgia, serif';
var MONO8 = '"Courier New", Courier, monospace';
function make52(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__patentPaper ??= new Map;
  let seed = 5;
  function rule(points, at, dur, width = 2, color = INK15, wobble = 0.25) {
    seed++;
    const p = progress(t, at, dur);
    if (p <= 0)
      return 0;
    const { points: drawn } = along(wobble ? roughen(points, wobble * u, seed * 3.7) : points, p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    trace(ctx, drawn);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
    return p;
  }
  function hatch(x0, y0, x1, y1, at, dur, gap = 7, vertical = true) {
    const n = Math.floor((vertical ? x1 - x0 : y1 - y0) / (gap * u) | 0);
    for (let i = 1;i < n; i++) {
      const a = at + dur * i / n;
      if (vertical)
        rule([
          [x0 + i * gap * u, y0],
          [x0 + i * gap * u, y1]
        ], a, 0.05, 1, INK15, 0);
      else
        rule([
          [x0, y0 + i * gap * u],
          [x1, y0 + i * gap * u]
        ], a, 0.05, 1, INK15, 0);
    }
  }
  function typeset(s, x, y, font, color, align, p) {
    if (p <= 0)
      return;
    ctx.save();
    ctx.font = font;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.textAlign = "left";
    ctx.fillStyle = color;
    ctx.fillText(s.slice(0, Math.ceil(s.length * clamp(p))), left, y);
    ctx.restore();
    return { left, w };
  }
  return {
    surface() {
      const key = `${W}x${H}`;
      let tile = g.__patentPaper.get(key);
      if (!tile) {
        tile = new OffscreenCanvas(W, H);
        const c = tile.getContext("2d");
        c.fillStyle = PAPER9;
        c.fillRect(0, 0, W, H);
        for (let i = 0;i < 2600; i++) {
          c.fillStyle = hash(i) > 0.5 ? "rgba(120,90,40,0.06)" : "rgba(255,250,235,0.08)";
          const s = (2 + hash(i * 2.3) * 14) * u;
          c.fillRect(hash(i * 3.1) * W, hash(i * 4.7) * H, s, s * 0.6);
        }
        const v = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7);
        v.addColorStop(0, "rgba(140,100,40,0)");
        v.addColorStop(1, "rgba(140,100,40,0.22)");
        c.fillStyle = v;
        c.fillRect(0, 0, W, H);
        c.strokeStyle = "rgba(29,26,22,0.55)";
        c.lineWidth = 1.5 * u;
        c.strokeRect(14 * u, 14 * u, W - 28 * u, H - 28 * u);
        c.fillStyle = INK15;
        c.font = `${Math.round(14 * u)}px ${SERIF10}`;
        c.textBaseline = "top";
        c.textAlign = "left";
        c.fillText("Mar. 7, 1933.", 28 * u, 24 * u);
        c.textAlign = "right";
        c.fillText("Sheet 1", W - 28 * u, 24 * u);
        c.font = `700 ${Math.round(20 * u)}px ${SERIF10}`;
        c.textBaseline = "bottom";
        c.fillText("FIG. 1.", W - 40 * u, H - 30 * u);
        g.__patentPaper.set(key, tile);
      }
      ctx.drawImage(tile, 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.05, y = 0.11, size = 40, at = 0, dur = 0.9 } = o;
      const r = typeset(s.toUpperCase(), X(x), Y(y), `500 ${Math.round(size * u)}px ${SERIF10}`, INK15, o.align ?? "left", progress(t, at, dur * 0.8));
      if (!r)
        return;
      const ly = Y(y) + size * 0.62 * u;
      rule([
        [r.left, ly],
        [r.left + r.w, ly]
      ], at + dur * 0.8, 0.25, 1.5, INK15, 0);
      rule([
        [r.left, ly + 4 * u],
        [r.left + r.w, ly + 4 * u]
      ], at + dur * 0.8 + 0.1, 0.25, 0.8, INK15, 0);
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, tone = "ink", align = "center" } = o;
      typeset(s, X(x), Y(y), `italic 400 ${Math.round(size * u)}px ${SERIF10}`, COLOR[tone], align, progress(t, at, o.dur ?? 0.035 * s.length + 0.1));
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.25, tone = "ink" } = o;
      const R = r * u;
      const [cx, cy] = [X(x), Y(y)];
      if (t < at)
        return;
      if (progress(t, at, dur) > 0.98) {
        ctx.fillStyle = PAPER9;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();
      }
      rule(ellipse(cx, cy, R, R, 40), at, dur, 1.8, COLOR[tone], 0);
      rule(ellipse(cx, cy, R - 2 * u, R - 2 * u, 20, Math.PI * -0.1, 0.35), at + dur, 0.12, 3, COLOR[tone], 0);
      rule(ellipse(cx, cy, R * 0.35, R * 0.35, 20), at + dur + 0.08, 0.12, 1.2, COLOR[tone], 0);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "ink" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      if (t < at)
        return;
      ctx.fillStyle = PAPER9;
      ctx.fillRect(x0, y0, (x1 - x0) * clamp(progress(t, at, dur) * 4), y1 - y0);
      const c = COLOR[tone];
      rule([
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0]
      ], at, dur * 0.5, 2, c, 0);
      rule([
        [x1 + 3 * u, y0 + 4 * u],
        [x1 + 3 * u, y1 + 3 * u],
        [x0 + 4 * u, y1 + 3 * u]
      ], at + dur * 0.5, 0.15, 3.5, c, 0);
      for (let i = 0;i < 7; i++) {
        const lx = x1 - (x1 - x0) * 0.22 * (1 - i / 7) ** 1.6;
        rule([
          [lx, y0 + 3 * u],
          [lx, y1 - 3 * u]
        ], at + dur * 0.6 + i * 0.03, 0.06, 0.9, c, 0);
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const c = COLOR[tone];
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      if (tone === "bad") {
        rule(pts, at, dur, 3, RED7, 1.2);
      } else
        rule(pts, at, dur, head ? 1.6 : 0.9, c, 0);
      if (head && progress(t, at, dur) >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 14 * u;
        ctx.beginPath();
        ctx.moveTo(end[0], end[1]);
        ctx.lineTo(end[0] - Math.cos(a - 0.3) * s, end[1] - Math.sin(a - 0.3) * s);
        ctx.lineTo(end[0] - Math.cos(a + 0.3) * s, end[1] - Math.sin(a + 0.3) * s);
        ctx.closePath();
        ctx.fillStyle = c;
        ctx.fill();
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      if (t < at)
        return;
      const cx = (x0 + x1) / 2;
      const rx = (x1 - x0) / 2;
      const ry = rx * 0.3;
      ctx.fillStyle = PAPER9;
      ctx.fillRect(x0, y0 + ry, x1 - x0, y1 - y0 - 2 * ry);
      const s = dur / 6;
      rule(ellipse(cx, y0 + ry, rx, ry, 40), at, s * 1.5, 1.8, INK15, 0);
      rule([
        [x0, y0 + ry],
        [x0, y1 - ry]
      ], at + s * 1.5, s, 1.8, INK15, 0);
      rule(ellipse(cx, y1 - ry, rx, ry, 24, 0, 0.5), at + s * 2.5, s, 1.8, INK15, 0);
      rule([
        [x1, y1 - ry],
        [x1, y0 + ry]
      ], at + s * 3.5, s, 3, INK15, 0);
      for (let i = 1;i < 12; i++) {
        const f = i / 12;
        const k = Math.sign(f - 0.5) * Math.abs(f - 0.5) ** 0.6 * 2 ** -0.4 * 2;
        const lx = cx + k * rx * 0.97;
        if (Math.abs(f - 0.5) < 0.2)
          continue;
        const e = ry * Math.sqrt(Math.max(0, 1 - ((lx - cx) / rx) ** 2));
        rule([
          [lx, y0 + ry + e],
          [lx, y1 - ry + e]
        ], at + s * 4.5 + i * 0.02, 0.06, 0.8, INK15, 0);
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) : s;
      const unit = count ? s : "";
      const digits = value.split("");
      const cw = size * 0.62 * u;
      const ch = size * 1.05 * u;
      const total = digits.length * cw + (unit ? cw * 0.8 : 0);
      let left = X(x) - total / 2;
      const top = Y(y) - ch / 2 + (sub ? -size * 0.05 * u : 0);
      const p = progress(t, at, 0.25);
      ctx.save();
      ctx.globalAlpha = p;
      const raw = count ? count[0] + (count[1] - count[0]) * (1 - 2 ** (-10 * clamp((t - at) / dur))) : 0;
      const frac = count && clamp((t - at) / dur) < 1 ? raw % 1 : 0;
      for (const [i, d] of digits.entries()) {
        if (d === ",") {
          left += cw * 0.3;
          continue;
        }
        ctx.fillStyle = "#FBF6E8";
        ctx.fillRect(left, top, cw * 0.9, ch);
        ctx.strokeStyle = INK15;
        ctx.lineWidth = 2 * u;
        ctx.strokeRect(left, top, cw * 0.9, ch);
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, cw * 0.9, ch);
        ctx.clip();
        ctx.font = `700 ${Math.round(size * 0.8 * u)}px ${SERIF10}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = INK15;
        const last = i === digits.length - 1;
        const off = last ? frac * ch : 0;
        ctx.fillText(d, left + cw * 0.45, top + ch / 2 - off);
        if (last && frac)
          ctx.fillText(String((Number(d) + 1) % 10), left + cw * 0.45, top + ch * 1.5 - off);
        for (let k = 0;k < 4; k++) {
          ctx.fillStyle = `rgba(29,26,22,${0.12 - k * 0.025})`;
          ctx.fillRect(left, top + k * 3 * u, cw * 0.9, 3 * u);
          ctx.fillRect(left, top + ch - (k + 1) * 3 * u, cw * 0.9, 3 * u);
        }
        ctx.restore();
        left += cw;
      }
      if (unit) {
        ctx.font = `400 ${Math.round(size * 0.7 * u)}px ${SERIF10}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = INK15;
        ctx.fillText(unit, left + 2 * u, top + ch / 2);
      }
      ctx.restore();
      if (sub) {
        typeset(sub, X(x), top - size * 0.35 * u, `italic 400 ${Math.round(size * 0.38 * u)}px ${SERIF10}`, INK15, "center", progress(t, at + 0.2, 0.4));
        rule(ellipse(X(x), top + ch / 2, total * 0.72, ch * 0.85, 48, -Math.PI * 0.7, 1.08), at + dur + 0.1, 0.45, 2.5, RED7, 1.5);
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 34 } = o;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check")
        rule([
          [cx - s * 0.5, cy],
          [cx - s * 0.15, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.55]
        ], at, dur, 2.5);
      else {
        rule([
          [cx - s * 0.5, cy - s * 0.5],
          [cx + s * 0.5, cy + s * 0.5]
        ], at, dur / 2, 2.5, RED7, 1);
        rule([
          [cx + s * 0.5, cy - s * 0.5],
          [cx - s * 0.5, cy + s * 0.5]
        ], at + dur / 2, dur / 2, 2.5, RED7, 1);
      }
    },
    finish() {}
  };
}
var patent_drawing_default = {
  id: "patent-drawing",
  name: "Patent drawing",
  category: "Illustration",
  make: make52
};

// plugin/skills/motion-graphics/styles/pixel-16bit.ts
var DARK = "#0B0E2A";
var WHITE2 = "#F4F1FF";
var TONE13 = {
  ink: "#7FB2FF",
  accent: "#FFD23F",
  good: "#5CE38A",
  bad: "#FF4F5E",
  muted: "#8A86B8"
};
var SKY = [
  "#140F33",
  "#1E1546",
  "#2C1A5E",
  "#432176",
  "#62288A",
  "#8A3592",
  "#B44A8E",
  "#D86A84"
];
var FONT3 = 'Verdana, "DejaVu Sans", Tahoma, Arial, sans-serif';
var step2 = (p, n) => Math.floor(clamp(p) * n) / n;
function make53(ctx, t, m) {
  const full = frame(m);
  const s = full.H / 180;
  const w = Math.round(full.W / s);
  const h = 180;
  const g = globalThis;
  g.__px16 ??= { text: new Map };
  const store_ = g.__px16;
  if (!store_.buf || store_.buf.width !== w) {
    store_.buf = new OffscreenCanvas(w, h);
    store_.sky = null;
  }
  const c = store_.buf.getContext("2d");
  const { u, X, Y } = frame({ width: w, height: h });
  const R = Math.round;
  function crisp(s, px, color) {
    const key = `${s}|${px}|${color}`;
    let img = store_.text.get(key);
    if (!img) {
      if (store_.text.size > 600)
        store_.text.clear();
      const font = `bold ${px}px ${FONT3}`;
      const probe = new OffscreenCanvas(4, 4).getContext("2d");
      probe.font = font;
      const tw = Math.ceil(probe.measureText(s).width) + 2;
      img = new OffscreenCanvas(tw, Math.ceil(px * 1.5));
      const x = img.getContext("2d", { willReadFrequently: true });
      x.font = font;
      x.fillStyle = color;
      x.textBaseline = "middle";
      x.fillText(s, 1, img.height / 2);
      const d = x.getImageData(0, 0, img.width, img.height);
      for (let i = 3;i < d.data.length; i += 4)
        d.data[i] = d.data[i] > 100 ? 255 : 0;
      x.putImageData(d, 0, 0);
      store_.text.set(key, img);
    }
    return img;
  }
  function say(s, x, y, px, color, align = "left", outline = true) {
    const img = crisp(s, px, color);
    const ox = align === "center" ? img.width / 2 : align === "right" ? img.width : 0;
    const x0 = R(x - ox);
    const y0 = R(y - img.height / 2);
    if (outline) {
      const sh = crisp(s, px, DARK);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1]
      ])
        c.drawImage(sh, x0 + dx, y0 + dy);
    }
    c.drawImage(img, x0, y0);
    return img.width;
  }
  function windowAt(x, y, ww, hh, rim = WHITE2) {
    x = R(x);
    y = R(y);
    ww = R(ww);
    hh = R(hh);
    if (ww < 4 || hh < 4)
      return;
    c.fillStyle = DARK;
    c.fillRect(x - 1, y - 1, ww + 2, hh + 2);
    c.fillStyle = rim;
    c.fillRect(x, y, ww, hh);
    const bands = ["#3448C8", "#2D3DB4", "#2734A0", "#212B8C", "#1C2478"];
    const ih = hh - 4;
    for (let i = 0;i < bands.length; i++) {
      c.fillStyle = bands[i];
      const y0 = y + 2 + Math.floor(ih * i / bands.length);
      c.fillRect(x + 2, y0, ww - 4, Math.ceil(ih / bands.length) + 1);
    }
    c.fillStyle = DARK;
    c.fillRect(x + 2, y + hh - 2, ww - 4, 1);
  }
  function sky() {
    if (store_.sky)
      return store_.sky;
    const sc = new OffscreenCanvas(w, h);
    const x = sc.getContext("2d");
    const horizon = R(h * 0.8);
    const band = horizon / SKY.length;
    for (let i = 0;i < SKY.length; i++) {
      const y0 = R(i * band);
      x.fillStyle = SKY[i];
      x.fillRect(0, y0, w, R(band) + 1);
      const next = SKY[i + 1];
      if (next) {
        x.fillStyle = next;
        for (let yy = R((i + 1) * band) - 3;yy < R((i + 1) * band); yy++)
          for (let xx = yy % 2 * 1;xx < w; xx += 2)
            x.fillRect(xx, yy, 1, 1);
      }
    }
    for (let i = 0;i < 70; i++) {
      x.fillStyle = hash(i * 5.1) > 0.7 ? "#FFFFFF" : "#B9A8FF";
      x.fillRect(R(hash(i * 3.3) * w), R(hash(i * 7.7) * h * 0.45), 1, 1);
    }
    x.fillStyle = "#FFC56B";
    x.beginPath();
    x.arc(R(w * 0.8), horizon - 4, 16, 0, Math.PI * 2);
    x.fill();
    let bx = 0;
    for (let i = 0;bx < w; i++) {
      const bw = 8 + R(hash(i * 2.1) * 14);
      const bh = 10 + R(hash(i * 4.7) * 26);
      x.fillStyle = i % 2 ? "#1A1238" : "#22184A";
      x.fillRect(bx, horizon - bh, bw, bh);
      x.fillStyle = "#FFD97A";
      for (let wy = horizon - bh + 3;wy < horizon - 2; wy += 4)
        for (let wx = bx + 2;wx < bx + bw - 2; wx += 3)
          if (hash(wx * 1.3 + wy * 7.1) > 0.72)
            x.fillRect(wx, wy, 1, 2);
      bx += bw + 1;
    }
    x.fillStyle = "#0F0B26";
    x.fillRect(0, horizon, w, h - horizon);
    x.fillStyle = "#3A2A6E";
    for (let xx = 0;xx < w; xx += 6)
      x.fillRect(xx, horizon + 2, 3, 1);
    store_.sky = sc;
    return sc;
  }
  const shown = (at = 0) => t >= at;
  return {
    surface() {
      c.imageSmoothingEnabled = false;
      c.drawImage(sky(), 0, 0);
    },
    title(text, o = {}) {
      const { x = 0.035, y = 0.06, size = 54, at = 0, dur = 0.9 } = o;
      if (!shown(at))
        return;
      const px = Math.max(9, R(size * u));
      const s = text.toUpperCase();
      const n = Math.ceil(s.length * progress(t, at + 0.12, dur));
      const full_ = crisp(s, px, WHITE2).width;
      const open = step2(progress(t, at, 0.12), 3);
      const bh = px + 8;
      windowAt(X(x), Y(y) + bh * (1 - open) / 2, full_ + 12, bh * open);
      if (open >= 1 && n > 0)
        say(s.slice(0, n), X(x) + 6, Y(y) + bh / 2, px, WHITE2);
    },
    label(text, x, y, o = {}) {
      const { size = 44, at = 0, dur = 0.3, tone = "ink", align = "center" } = o;
      if (!shown(at))
        return;
      const px = Math.max(8, R(size * u));
      const s = text.toUpperCase();
      const tw = crisp(s, px, WHITE2).width;
      const bx = align === "center" ? X(x) - tw / 2 - 4 : align === "right" ? X(x) - tw - 8 : X(x);
      c.fillStyle = DARK;
      c.fillRect(R(bx) - 1, R(Y(y) - px / 2 - 3) - 1, tw + 10, px + 8);
      c.fillStyle = tone === "ink" ? WHITE2 : TONE13[tone];
      c.fillRect(R(bx), R(Y(y) - px / 2 - 3), tw + 8, px + 6);
      c.fillStyle = "#1C2478";
      c.fillRect(R(bx) + 1, R(Y(y) - px / 2 - 3) + 1, tw + 6, px + 4);
      const n = Math.ceil(s.length * progress(t, at, dur));
      say(s.slice(0, n), bx + 4, Y(y), px, tone === "ink" ? WHITE2 : TONE13[tone], "left", false);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.2, tone = "accent" } = o;
      if (!shown(at))
        return;
      const p = progress(t, at, dur);
      const k = p < 0.34 ? 0.5 : p < 0.67 ? 1.25 : 1;
      const rr = Math.max(2, R(r * u * 1.3 * k));
      const cx = R(X(x));
      const cy = R(Y(y));
      c.fillStyle = DARK;
      c.beginPath();
      c.arc(cx, cy, rr + 1, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = TONE13[tone];
      c.beginPath();
      c.arc(cx, cy, rr, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "rgba(11,14,42,0.35)";
      c.beginPath();
      c.arc(cx + R(rr * 0.35), cy + R(rr * 0.35), R(rr * 0.75), 0, Math.PI * 2);
      c.fill();
      c.fillStyle = WHITE2;
      c.fillRect(cx - R(rr * 0.5), cy - R(rr * 0.55), Math.max(1, R(rr * 0.3)), Math.max(1, R(rr * 0.3)));
    },
    box(x, y, bw, bh, o = {}) {
      const { at = 0, dur = 0.15, tone = "ink" } = o;
      if (!shown(at))
        return;
      const open = Math.max(0.2, step2(progress(t, at, dur), 4));
      const hh = Y(bh) * open;
      windowAt(X(x), Y(y) + (Y(bh) - hh) / 2, X(bw), hh, tone === "ink" ? WHITE2 : TONE13[tone]);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (!shown(at))
        return;
      const p = step2(progress(t, at, dur), 6);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 48);
      let len = 0;
      const dist = [0];
      for (let i = 1;i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        len += Math.hypot(b[0] - a[0], b[1] - a[1]);
        dist.push(len);
      }
      const at_ = (d) => {
        let i = 1;
        while (i < dist.length - 1 && dist[i] < d)
          i++;
        const a = pts[i - 1];
        const b = pts[i];
        const f = (d - dist[i - 1]) / (dist[i] - dist[i - 1] || 1);
        return {
          x: a[0] + (b[0] - a[0]) * f,
          y: a[1] + (b[1] - a[1]) * f,
          ang: Math.atan2(b[1] - a[1], b[0] - a[0])
        };
      };
      const end = len * (p || 1 / 6);
      if (!head) {
        c.fillStyle = TONE13[tone === "accent" ? "muted" : tone];
        for (let d = 0;d < end; d += 2) {
          const q = at_(d);
          c.fillRect(R(q.x), R(q.y), 1, 1);
        }
        return;
      }
      const gap = 6;
      const off = t * 12 % gap;
      for (let d = off;d < end; d += gap) {
        const q = at_(d);
        const ca = Math.cos(q.ang);
        const sa = Math.sin(q.ang);
        for (const [col, grow] of [
          [DARK, 1],
          [TONE13[tone], 0]
        ]) {
          c.fillStyle = col;
          c.beginPath();
          c.moveTo(R(q.x + ca * (2 + grow)), R(q.y + sa * (2 + grow)));
          c.lineTo(R(q.x - ca * 2 - sa * (2 + grow)), R(q.y - sa * 2 + ca * (2 + grow)));
          c.lineTo(R(q.x - ca * 2 + sa * (2 + grow)), R(q.y - sa * 2 - ca * (2 + grow)));
          c.closePath();
          c.fill();
        }
      }
    },
    store(x, y, sw, sh, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (!shown(at))
        return;
      const n = 4;
      const colors = ["#FF6B8A", "#FFD23F", "#5CE38A", "#7FB2FF"];
      const slab = Y(sh) / n;
      for (let i = 0;i < n; i++) {
        const p = progress(t, at + i * dur / n, dur / n);
        if (p <= 0)
          continue;
        const drop = R((1 - step2(p, 4)) * 12);
        const yy = R(Y(y) + Y(sh) - slab * (i + 1) - drop);
        const xx = R(X(x));
        c.fillStyle = DARK;
        c.fillRect(xx - 1, yy - 1, R(X(sw)) + 2, R(slab) + 1);
        c.fillStyle = "#C9C3E6";
        c.fillRect(xx, yy, R(X(sw)), R(slab) - 1);
        c.fillStyle = colors[i];
        c.fillRect(xx + 3, yy + 2, R(X(sw)) - 6, R(slab) - 5);
        c.fillStyle = WHITE2;
        c.fillRect(xx, yy, R(X(sw)), 1);
      }
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "accent" } = o;
      if (!shown(at))
        return;
      const px = Math.max(10, R(size * u * 1.4));
      const s = count ? counting(t, at, dur, count) + text : text;
      say(s, X(x), Y(y) - (sub ? px * 0.3 : 0), px, TONE13[tone], "center");
      if (sub)
        say(sub.toUpperCase(), X(x), Y(y) + px * 0.65, Math.max(8, R(px * 0.42)), WHITE2, "center");
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.2, size = 40 } = o;
      if (!shown(at))
        return;
      const r = Math.max(4, R(size * u * 0.9 * (progress(t, at, dur) < 0.5 ? 1.4 : 1)));
      const cx = R(X(x));
      const cy = R(Y(y));
      const line = (pts, col, wid) => {
        c.strokeStyle = col;
        c.lineWidth = wid;
        c.lineCap = "square";
        c.beginPath();
        for (const [i, [px, py]] of pts.entries())
          i ? c.lineTo(px, py) : c.moveTo(px, py);
        c.stroke();
      };
      const pts = kind === "check" ? [
        [
          [cx - r * 0.6, cy],
          [cx - r * 0.15, cy + r * 0.5],
          [cx + r * 0.7, cy - r * 0.55]
        ]
      ] : [
        [
          [cx - r * 0.55, cy - r * 0.55],
          [cx + r * 0.55, cy + r * 0.55]
        ],
        [
          [cx + r * 0.55, cy - r * 0.55],
          [cx - r * 0.55, cy + r * 0.55]
        ]
      ];
      for (const pl of pts)
        line(pl, DARK, 5);
      for (const pl of pts)
        line(pl, kind === "check" ? TONE13.good : TONE13.bad, 3);
    },
    finish() {
      const fade = step2(progress(t, 0, 0.5), 16);
      if (fade < 1) {
        c.fillStyle = `rgba(0,0,0,${1 - fade})`;
        c.fillRect(0, 0, w, h);
      }
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(store_.buf, 0, 0, full.W, full.H);
      ctx.restore();
    }
  };
}
var pixel_16bit_default = {
  id: "pixel-16bit",
  name: "16-bit cutscene",
  category: "Retro Digital",
  make: make53
};

// plugin/skills/motion-graphics/styles/pointillism.ts
var HUES = {
  ink: ["#2B2F7A", "#3D3A98", "#1E3F8A", "#6A3A8C", "#C2552E"],
  accent: ["#E3A02A", "#F2C640", "#D9742A", "#F7DD7A", "#5B6FC4"],
  good: ["#3E8E4A", "#6BB04A", "#2F6F8A", "#A8C84A", "#D6533A"],
  bad: ["#D8442E", "#EE6A3A", "#B8304A", "#F29A6A", "#3E8E7A"],
  muted: ["#8A86A8", "#A9A4C0", "#7C9AB0", "#C2B2C8", "#D9C27A"],
  pad: ["#F4E6D2", "#F8EEDD", "#EBD7CE", "#E9E2EE", "#F2D6C0"],
  sky: ["#8FB2E0", "#B8CBEA", "#E8C9D8", "#F3E2C4", "#6E92D0", "#C7D9F0"],
  water: ["#3E6CB8", "#5C8AD0", "#2F4E9A", "#8FB0E0", "#E2B48A", "#6A5AA8"],
  grass: ["#4E9A3E", "#7AB848", "#3A7A4E", "#A8C850", "#E0B24A", "#2E5E8A"],
  path: ["#E8C8A8", "#F2D8C0", "#D8A890", "#C8B8D8", "#F0E0B0"]
};
var FACE5 = '"Didot", "Bodoni 72", "Playfair Display", "Iowan Old Style", Georgia, serif';
function make54(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__pointil ??= new Map;
  const cache = g.__pointil;
  const beat = Math.floor(t * 10) % 3;
  function tile(name, density, v) {
    const d = Math.max(1, Math.round(density * 3));
    const key = `${name}:${d}:${v}:${Math.round(u * 100)}`;
    let pat = cache.get(key);
    if (!pat) {
      const S = Math.round(56 * u);
      const c0 = new OffscreenCanvas(S, S);
      const c = c0.getContext("2d");
      const pal = HUES[name];
      const step = 4.2 * u;
      let i = 0;
      for (let y = 0;y < S; y += step) {
        for (let x = 0;x < S; x += step) {
          i++;
          if (hash(i * 1.37 + 3) > d / 3)
            continue;
          const pick = hash(i * 2.11 + v * 31.7);
          const col = pal[pick < 0.55 ? 0 : Math.floor(1 + hash(i + v * 7) * (pal.length - 1))];
          c.fillStyle = col;
          c.beginPath();
          c.ellipse((x + hash(i * 3.1) * step * 0.6 + S) % S, (y + hash(i * 4.3) * step * 0.6 + S) % S, step * 0.55, step * 0.42, hash(i) * 3, 0, Math.PI * 2);
          c.fill();
        }
      }
      pat = ctx.createPattern(c0, "repeat");
      cache.set(key, pat);
    }
    return pat;
  }
  function scene() {
    const key = `scene:${W}x${H}`;
    let img = cache.get(key);
    if (!img) {
      img = new OffscreenCanvas(W, H);
      const c = img.getContext("2d");
      c.fillStyle = "#EEE4D0";
      c.fillRect(0, 0, W, H);
      const step = 4.6 * u;
      let i = 0;
      for (let y = 0;y < H; y += step * 0.86) {
        for (let x = 0;x < W; x += step) {
          i++;
          const yy = y / H;
          const shore = 0.36 + Math.sin(x / (W * 0.13)) * 0.01;
          const lawn = 0.47 + x / W * 0.02;
          const onPath = Math.abs(yy - (0.62 - x / W * 0.18)) < 0.025 && x < W * 0.75;
          const name = yy < shore ? "sky" : yy < shore + 0.02 ? "muted" : yy < lawn ? "water" : onPath ? "path" : "grass";
          const pal = HUES[name];
          c.fillStyle = pal[Math.floor(hash(i * 1.9) * pal.length)];
          c.beginPath();
          c.ellipse(x + hash(i * 2.7) * step, y + hash(i * 3.3) * step, step * 0.6, step * 0.45, hash(i) * 3, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.fillStyle = "#2B2F7A";
      const b = 10 * u;
      for (let k = 0;k < (W + H) * 2; k += 5 * u) {
        const p = k;
        const [x, y] = p < W ? [p, b / 2] : p < W + H ? [W - b / 2, p - W] : p < W * 2 + H ? [W - (p - W - H), H - b / 2] : [b / 2, H - (p - W * 2 - H)];
        c.beginPath();
        c.arc(x + (hash(k) - 0.5) * 4 * u, y + (hash(k + 1) - 0.5) * 4 * u, 2.6 * u, 0, Math.PI * 2);
        c.fill();
      }
      cache.set(key, img);
    }
    ctx.drawImage(img, 0, 0);
  }
  function dab(name, p, how = "fill") {
    const pat = tile(name, clamp(p * 1.4), beat);
    ctx.save();
    ctx.globalAlpha *= 0.65 * clamp(p * 1.5);
    if (how === "fill") {
      ctx.fillStyle = HUES[name][0];
      ctx.fill();
    } else {
      ctx.strokeStyle = HUES[name][0];
      ctx.stroke();
    }
    ctx.restore();
    if (how === "fill") {
      ctx.fillStyle = pat;
      ctx.fill();
    } else {
      ctx.strokeStyle = pat;
      ctx.stroke();
    }
  }
  function letters(s, x, y, size, o) {
    const { at = 0, tone = "ink", align = "left", pad = true, italic = true } = o;
    const p = progress(t, at, o.dur ?? 0.5);
    if (p <= 0)
      return 0;
    ctx.save();
    ctx.font = `${italic ? "italic " : ""}700 ${Math.round(size * u)}px ${FACE5}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    if (pad) {
      ctx.beginPath();
      ctx.roundRect(left - size * 0.35 * u, y - size * 0.6 * u, w + size * 0.7 * u, size * 1.2 * u, size * 0.5 * u);
      dab("pad", p);
    }
    ctx.globalAlpha = 0.8 * p;
    ctx.fillStyle = HUES[tone][0];
    ctx.fillText(s, left, y);
    ctx.globalAlpha = 1;
    ctx.fillStyle = tile(tone, clamp(p * 1.4), beat);
    ctx.fillText(s, left, y);
    ctx.restore();
    return w;
  }
  return {
    surface() {
      scene();
      ctx.save();
      const f = Math.floor(t * 10);
      for (let i = 0;i < 900; i++) {
        const x = hash(i * 1.3) * W;
        const y = hash(i * 2.7) * H;
        const yy = y / H;
        const pal = HUES[yy < 0.36 ? "sky" : yy < 0.47 ? "water" : "grass"];
        ctx.fillStyle = pal[Math.floor(hash(i + f * 13.1) * pal.length)];
        ctx.beginPath();
        ctx.arc(x, y, 2.4 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.08, size = 60, at = 0, tone = "ink", align = "left" } = o;
      letters(s, X(x), Y(y), size, { at, dur: o.dur ?? 0.8, tone, align });
    },
    label(s, x, y, o = {}) {
      letters(s, X(x), Y(y), o.size ?? 34, {
        at: o.at ?? 0,
        dur: o.dur ?? 0.4,
        tone: o.tone ?? "ink",
        align: o.align ?? "center"
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.4, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const R = r * u * (0.85 + 0.15 * p);
      ctx.save();
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
      dab(tone, p);
      ctx.beginPath();
      ctx.arc(X(x) + R * 0.3, Y(y) + R * 0.3, R * 0.7, 0, Math.PI * 2);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
      ctx.globalAlpha = 0.7;
      dab("ink", p);
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(X(x), Y(y), X(w), Y(h), 10 * u);
      dab("pad", p);
      ctx.lineWidth = 9 * u;
      dab(tone === "good" ? "ink" : tone, p, "stroke");
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = (!head && tone === "accent" ? 4 : 9) * u;
      trace(ctx, shown);
      dab(tone, 1, "stroke");
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 26 * u;
        trace(ctx, [
          end,
          [end[0] - Math.cos(a - 0.45) * s, end[1] - Math.sin(a - 0.45) * s],
          [end[0] - Math.cos(a + 0.45) * s, end[1] - Math.sin(a + 0.45) * s]
        ], true);
        dab(tone, 1);
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.7, tone = "muted" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const [x0, x1] = [X(x), X(x + w)];
      const rx = (x1 - x0) / 2;
      const ry = rx * 0.3;
      const top = Y(y) + ry;
      const bottom = Y(y + h) - ry;
      const shown = bottom - (bottom - top) * clamp(p * 1.3);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x0 + rx, bottom, rx, ry, 0, 0, Math.PI);
      ctx.lineTo(x0, shown);
      ctx.ellipse(x0 + rx, shown, rx, ry, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      dab(tone, p);
      for (const f of [0.33, 0.66]) {
        const yy = top + (bottom - top) * f;
        if (yy < shown)
          continue;
        ctx.beginPath();
        ctx.ellipse(x0 + rx, yy, rx, ry, 0, 0, Math.PI);
        ctx.lineWidth = 5 * u;
        dab("ink", p, "stroke");
      }
      ctx.beginPath();
      ctx.ellipse(x0 + rx, shown, rx, ry, 0, 0, Math.PI * 2);
      dab("pad", p);
      ctx.lineWidth = 4 * u;
      dab("ink", p, "stroke");
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const w = letters(value, X(x), Y(y), size, {
        at,
        dur: 0.3,
        tone,
        align: "center",
        pad: true,
        italic: true
      });
      if (sub) {
        letters(sub, X(x), Y(y) + size * 0.85 * u, size * 0.36, {
          at: at + 0.3,
          dur: 0.3,
          tone: "ink",
          align: "center"
        });
        const p = progress(t, at + dur, 0.4);
        if (p > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(X(x), Y(y), w / 2 + size * 0.3 * u, size * 0.6 * u, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
          ctx.lineWidth = 6 * u;
          dab("bad", 1, "stroke");
          ctx.restore();
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 36) * u;
      const [cx, cy] = [X(x), Y(y)];
      const p = progress(t, o.at ?? 0, 0.3);
      if (p <= 0)
        return;
      ctx.save();
      ctx.lineWidth = 9 * u;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (kind === "check")
        trace(ctx, [
          [cx - s * 0.5, cy],
          [cx - s * 0.12, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5]
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.5, cy - s * 0.5);
        ctx.lineTo(cx + s * 0.5, cy + s * 0.5);
        ctx.moveTo(cx + s * 0.5, cy - s * 0.5);
        ctx.lineTo(cx - s * 0.5, cy + s * 0.5);
      }
      dab(o.tone ?? (kind === "check" ? "good" : "bad"), p, "stroke");
      ctx.restore();
    },
    finish() {}
  };
}
var pointillism_default = {
  id: "pointillism",
  name: "Pointillist",
  category: "Painterly",
  make: make54
};

// plugin/skills/motion-graphics/styles/product-launch.ts
var SANS7 = '"SF Pro Display", "Helvetica Neue", "Inter", Arial, sans-serif';
var GRAD = {
  ink: ["#F5F5F7", "#B9B9C2"],
  accent: ["#B36BFF", "#FF7A45"],
  good: ["#3FD8D0", "#3E8BFF"],
  bad: ["#FF4B55", "#FF4B55"],
  muted: ["#8E8E96", "#5E5E66"]
};
function make55(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  function grad(x0, y0, x1, y1, tone) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, GRAD[tone][0]);
    g.addColorStop(1, GRAD[tone][1]);
    return g;
  }
  function reveal(s, x, y, size, weight, fill, p, align = "left", track = -0.02) {
    if (p <= 0)
      return;
    const e = expo(p);
    ctx.save();
    ctx.globalAlpha = e;
    const b = (1 - e) * 14 * u;
    if (b > 0.3)
      ctx.filter = `blur(${b.toFixed(1)}px)`;
    ctx.font = `${weight} ${Math.round(size * u)}px ${SANS7}`;
    ctx.letterSpacing = `${(track * size * u).toFixed(1)}px`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y + (1 - e) * 12 * u);
    ctx.restore();
  }
  function hairline(points, at, dur, color, head, width = 1.6) {
    const p = expo(progress(t, at, dur));
    if (p <= 0)
      return;
    const res = along(points, p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    trace(ctx, res.points);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(points[0]?.[0] ?? 0, points[0]?.[1] ?? 0, 2.6 * u, 0, Math.PI * 2);
    ctx.fill();
    if (head && p >= 0.999) {
      const tip = points.at(-1);
      const s = 10 * u;
      trace(ctx, [
        [tip[0] - Math.cos(res.angle - 0.5) * s, tip[1] - Math.sin(res.angle - 0.5) * s],
        tip,
        [tip[0] - Math.cos(res.angle + 0.5) * s, tip[1] - Math.sin(res.angle + 0.5) * s]
      ]);
      ctx.stroke();
    }
    ctx.restore();
  }
  return {
    surface() {
      ctx.fillStyle = "#050506";
      ctx.fillRect(0, 0, W, H);
      const spot = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, Math.max(W, H) * 0.65);
      spot.addColorStop(0, "rgba(70,70,88,0.55)");
      spot.addColorStop(0.5, "rgba(30,30,40,0.35)");
      spot.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, W, H);
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
      ctx.font = `700 ${Math.round(size * u)}px ${SANS7}`;
      ctx.letterSpacing = `${(-0.02 * size * u).toFixed(1)}px`;
      const full = ctx.measureText(s).width;
      const space = ctx.measureText(" ").width;
      let cx = align === "center" ? X(x) - full / 2 : align === "right" ? X(x) - full : X(x);
      const widths = words.map((w) => ctx.measureText(w).width);
      ctx.restore();
      words.forEach((w, i) => {
        const p = progress(t, at + i * dur / words.length, 0.6);
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
      const { at = 0, tone = "accent" } = o;
      const p = expo(progress(t, at, 0.5));
      if (p <= 0)
        return;
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
      const { at = 0, tone = "accent" } = o;
      const p = expo(progress(t, at, 0.9));
      if (p <= 0)
        return;
      const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
      const r = Math.min(ww, hh) * 0.16;
      const depth = 12 * u;
      ctx.save();
      ctx.globalAlpha = p;
      const refl = ctx.createLinearGradient(0, tp + hh + depth, 0, tp + hh + depth + hh * 0.5);
      refl.addColorStop(0, "rgba(160,160,180,0.12)");
      refl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = refl;
      ctx.beginPath();
      ctx.roundRect(l, tp + hh + depth + 2 * u, ww, hh * 0.5, r);
      ctx.fill();
      const metal = ctx.createLinearGradient(l, 0, l + ww, 0);
      metal.addColorStop(0, "#6E6E78");
      metal.addColorStop(0.5, "#E6E6EC");
      metal.addColorStop(1, "#5A5A64");
      ctx.beginPath();
      ctx.roundRect(l, tp + depth, ww, hh, r);
      ctx.fillStyle = metal;
      ctx.fill();
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
      const color = tone === "bad" ? "#FF4B55" : !head ? alpha(GRAD[tone][0], 0.6) : "rgba(220,220,228,0.8)";
      hairline(curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30), at, dur, color, head, head ? 1.6 : 1);
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const p = expo(progress(t, at, 0.8));
      if (p <= 0)
        return;
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
      for (let i = 0;i < 3; i++) {
        ctx.beginPath();
        ctx.roundRect(-ww * 0.3, -hh * 0.28 + i * hh * 0.2, ww * 0.6, hh * 0.1, hh * 0.05);
        ctx.fill();
      }
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "accent" } = o;
      const p = progress(t, at, 0.6);
      if (p <= 0)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${SANS7}`;
      const tw = ctx.measureText(value).width;
      ctx.restore();
      const cy = Y(y);
      ctx.save();
      ctx.shadowColor = alpha(GRAD[tone][0], 0.55);
      ctx.shadowBlur = 30 * u;
      reveal(value, X(x), cy, size, 800, grad(X(x) - tw / 2, 0, X(x) + tw / 2, 0, tone), p, "center", -0.03);
      ctx.restore();
      if (sub)
        reveal(sub, X(x), cy - size * 0.75 * u, size * 0.28, 500, "#A8A8B2", progress(t, at - 0.1, 0.6), "center", 0);
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const s = (o.size ?? 30) * u;
      const cx = X(x);
      const cy = Y(y);
      if (kind === "check")
        hairline([
          [cx - s * 0.5, cy],
          [cx - s * 0.12, cy + s * 0.38],
          [cx + s * 0.55, cy - s * 0.45]
        ], at, 0.45, GRAD.good[0], false, 3);
      else
        hairline([
          [cx - s * 0.7, cy],
          [cx + s * 0.7, cy]
        ], at, 0.3, "#FF4B55", false, 3.5);
    },
    finish() {
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }
  };
}
var product_launch_default = {
  id: "product-launch",
  name: "Keynote launch",
  category: "Popular Explainer Looks",
  make: make55
};

// plugin/skills/motion-graphics/styles/psychedelic.ts
var INK16 = "#2A0F3D";
var CREAM7 = "#FFF1D6";
var TONE14 = {
  ink: "#7B2CBF",
  accent: "#FF2E88",
  good: "#18B05A",
  bad: "#FF3B1F",
  muted: "#F5A623"
};
var BANDS = [
  [255, 46, 136],
  [166, 226, 46],
  [245, 127, 32],
  [45, 63, 209],
  [123, 44, 191],
  [255, 210, 63]
];
var BULB = '"Cooper Black", "Shrikhand", "Bookman Old Style", "Georgia", serif';
function make56(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const font = (size) => `italic 900 ${Math.round(size * u)}px ${BULB}`;
  const unfurl = (at = 0) => spring(t, { start: at, stiffness: 120, damping: 9 });
  const g = globalThis;
  function bands() {
    const w = 320;
    const h = Math.round(320 * H / W);
    g.__psyField ??= {};
    const f = g.__psyField;
    if (!f.canvas || f.w !== w || f.h !== h) {
      f.canvas = new OffscreenCanvas(w, h);
      f.c = f.canvas.getContext("2d");
      f.img = f.c.createImageData(w, h);
      f.w = w;
      f.h = h;
    }
    const d = f.img.data;
    const cx = w * 0.62;
    const cy = h * 0.5;
    for (let y = 0;y < h; y++)
      for (let x = 0;x < w; x++) {
        const dx = (x - cx) / w;
        const dy = (y - cy) / w;
        const warp = Math.sin(dx * 14 + t * 0.7) * 1.6 + Math.sin(dy * 18 - t * 0.5) * 1.6 + Math.sin((dx - dy) * 10 + t * 0.9) * 1.2;
        const v = Math.sqrt(dx * dx + dy * dy) * 22 + warp - t * 1.2;
        const k = (Math.floor(v) % BANDS.length + BANDS.length) % BANDS.length;
        const edge = v - Math.floor(v) < 0.12;
        const [r, gg, b] = BANDS[k];
        const i = (y * w + x) * 4;
        d[i] = edge ? 42 : r;
        d[i + 1] = edge ? 15 : gg;
        d[i + 2] = edge ? 61 : b;
        d[i + 3] = 255;
      }
    f.c.putImageData(f.img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(f.canvas, 0, 0, W, H);
    ctx.restore();
  }
  function bulb(s, x, y, size, fill, align = "center", melt = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, melt);
    ctx.font = font(size);
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.fillStyle = INK16;
    ctx.fillText(s, size * 0.06 * u, size * 0.08 * u);
    ctx.lineWidth = size * 0.16 * u;
    ctx.strokeStyle = INK16;
    ctx.strokeText(s, 0, 0);
    ctx.lineWidth = size * 0.06 * u;
    ctx.strokeStyle = CREAM7;
    ctx.strokeText(s, 0, 0);
    ctx.fillStyle = fill;
    ctx.fillText(s, 0, 0);
    ctx.restore();
  }
  function blob(cx, cy, rx, ry, seed) {
    const pts = Array.from({ length: 49 }, (_, i) => {
      const a = i / 48 * Math.PI * 2;
      const wob = 1 + Math.sin(a * 5 + seed + t * 1.5) * 0.04 + Math.sin(a * 3 + seed * 2) * 0.03;
      return [cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * wob];
    });
    trace(ctx, pts, true);
    ctx.fillStyle = CREAM7;
    ctx.fill();
    ctx.lineWidth = 5 * u;
    ctx.strokeStyle = INK16;
    ctx.stroke();
  }
  function rippled(cx, cy, at, draw) {
    const s = unfurl(at);
    if (s <= 0)
      return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((1 - clamp(s)) * 0.6);
    ctx.scale(s, s * (1 + Math.sin(t * 6) * 0.02 * (1 - clamp(progress(t, at ?? 0, 1.2)))));
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }
  function flower(cx, cy, R, at, color, seed) {
    const n = 10;
    for (let layer = 1;layer >= 0; layer--)
      for (let i = 0;i < n; i++) {
        const p = progress(t, at + i / n * 0.35 + layer * 0.1, 0.35);
        if (p <= 0)
          continue;
        const a = i / n * Math.PI * 2 + layer * (Math.PI / n) + Math.sin(t + seed) * 0.05;
        const len = R * (layer ? 1.9 : 1.5) * p;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(R * 0.6 + len / 2, 0, len / 2, R * (layer ? 0.42 : 0.32), 0, 0, Math.PI * 2);
        ctx.fillStyle = layer ? `rgb(${BANDS[(i + seed) % BANDS.length]})` : color;
        ctx.fill();
        ctx.lineWidth = 2.5 * u;
        ctx.strokeStyle = INK16;
        ctx.stroke();
        ctx.restore();
      }
    const e = progress(t, at + 0.3, 0.3);
    if (e <= 0)
      return;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = CREAM7;
    ctx.fill();
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = INK16;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 0.5, R * 0.5 * e, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.22 * e, 0, Math.PI * 2);
    ctx.fillStyle = INK16;
    ctx.fill();
  }
  return {
    surface() {
      bands();
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.09, size = 72, at = 0, dur = 0.9, align = "left" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const melt = 1 + (1 - p) ** 2 * 1.4 + Math.sin(t * 2) * 0.02;
      ctx.save();
      ctx.globalAlpha = clamp(p * 3);
      bulb(s, X(x), Y(y), size, "#FFB000", align, melt);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { size = 34, align = "center", tone = "ink", at = 0 } = o;
      ctx.font = font(size);
      const w = ctx.measureText(s).width + size * 1.1 * u;
      const h = size * 1.6 * u;
      const cx = align === "center" ? X(x) : align === "right" ? X(x) - w / 2 : X(x) + w / 2;
      rippled(cx, Y(y), at, () => {
        blob(cx, Y(y), w / 2, h / 2, x * 10 + y);
        ctx.font = font(size);
        ctx.fillStyle = tone === "ink" ? INK16 : TONE14[tone];
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s, cx, Y(y) + 1 * u);
      });
    },
    node(x, y, r, o = {}) {
      const at = o.at ?? 0;
      if (t < at)
        return;
      flower(X(x), Y(y), r * u * 0.62, at, TONE14[o.tone ?? "accent"], Math.floor(hash(x * 13 + y * 7) * 6));
    },
    box(x, y, w, h, o = {}) {
      const [cx, cy] = [X(x + w / 2), Y(y + h / 2)];
      rippled(cx, cy, o.at, () => {
        ctx.save();
        ctx.translate(6 * u, 7 * u);
        blob(cx, cy, X(w) / 2, Y(h) / 2, 3);
        ctx.restore();
        ctx.save();
        blob(cx, cy, X(w) / 2, Y(h) / 2, 3);
        ctx.clip();
        ctx.strokeStyle = TONE14[o.tone ?? "ink"];
        ctx.lineWidth = 5 * u;
        for (let k = -10;k < 20; k++) {
          ctx.beginPath();
          ctx.moveTo(X(x) + k * 16 * u, Y(y + h));
          ctx.lineTo(X(x) + k * 16 * u + 40 * u, Y(y + h) - 40 * u);
          ctx.stroke();
        }
        ctx.restore();
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30).map(([px, py], i) => [px, py + Math.sin(i * 0.6 + t * 3) * 2 * u]);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      trace(ctx, shown);
      ctx.strokeStyle = INK16;
      ctx.lineWidth = (head ? 16 : 6) * u;
      ctx.stroke();
      trace(ctx, shown);
      ctx.strokeStyle = TONE14[tone];
      ctx.lineWidth = (head ? 10 : 3) * u;
      ctx.stroke();
      if (head) {
        trace(ctx, shown);
        ctx.setLineDash([8 * u, 8 * u]);
        ctx.lineDashOffset = -t * 40 * u;
        ctx.strokeStyle = CREAM7;
        ctx.lineWidth = 2.5 * u;
        ctx.stroke();
        ctx.setLineDash([]);
        if (p >= 1) {
          const end = pts.at(-1);
          const prev = pts.at(-3);
          arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 26 * u, false);
          ctx.fillStyle = TONE14[tone];
          ctx.fill();
          ctx.lineWidth = 4 * u;
          ctx.strokeStyle = INK16;
          ctx.stroke();
        }
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const [bx, by, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      rippled(bx + bw / 2, by + bh / 2, o.at, () => {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, bw * 0.3);
        ctx.fillStyle = CREAM7;
        ctx.fill();
        ctx.clip();
        for (let k = 0;k < 8; k++) {
          ctx.beginPath();
          for (let i = 0;i <= 20; i++) {
            const px = bx + i / 20 * bw;
            const py = by + k / 7 * bh + Math.sin(i * 0.6 + t * 2 + k) * 6 * u;
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          }
          ctx.strokeStyle = `rgb(${BANDS[k % BANDS.length]})`;
          ctx.lineWidth = bh / 9;
          ctx.stroke();
        }
        ctx.restore();
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, bw * 0.3);
        ctx.lineWidth = 5 * u;
        ctx.strokeStyle = INK16;
        ctx.stroke();
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "accent" } = o;
      const str = count ? counting(t, at, dur, count) + s : s;
      const [cx, cy] = [X(x), Y(y)];
      if (sub && t >= at) {
        flower(cx, cy, size * 0.95 * u, at, TONE14.muted, 2);
      }
      rippled(cx, cy, at, () => {
        if (sub)
          blob(cx, cy, size * 1.25 * u, size * 0.85 * u, 5);
        bulb(str, cx, cy - (sub ? size * 0.12 * u : 0), size * (sub ? 0.85 : 1), TONE14[tone]);
        if (sub) {
          ctx.font = font(size * 0.28);
          ctx.fillStyle = INK16;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(sub, cx, cy + size * 0.5 * u);
        }
      });
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 32) * u;
      rippled(X(x), Y(y), o.at, () => {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const [cx, cy] = [X(x), Y(y)];
        const path = () => {
          if (kind === "check")
            trace(ctx, [
              [cx - r * 0.6, cy],
              [cx - r * 0.15, cy + r * 0.5],
              [cx + r * 0.7, cy - r * 0.6]
            ]);
          else {
            ctx.beginPath();
            ctx.moveTo(cx - r * 0.55, cy - r * 0.55);
            ctx.lineTo(cx + r * 0.55, cy + r * 0.55);
            ctx.moveTo(cx + r * 0.55, cy - r * 0.55);
            ctx.lineTo(cx - r * 0.55, cy + r * 0.55);
          }
        };
        path();
        ctx.strokeStyle = INK16;
        ctx.lineWidth = r * 0.55;
        ctx.stroke();
        path();
        ctx.strokeStyle = kind === "check" ? TONE14.good : TONE14.bad;
        ctx.lineWidth = r * 0.3;
        ctx.stroke();
        ctx.restore();
      });
    },
    finish() {}
  };
}
var psychedelic_default = {
  id: "psychedelic",
  name: "Psychedelic poster",
  category: "Cosmic & Psychedelic",
  make: make56
};

// plugin/skills/motion-graphics/styles/ridgeline.ts
var BG3 = "#0D0D0D";
var LINE5 = {
  ink: "#F2F2EE",
  accent: "#FFFFFF",
  good: "#F2F2EE",
  bad: "#BDBDB8",
  muted: "#8A8A86"
};
var MONO9 = '"Space Mono", "SF Mono", Menlo, Consolas, "Courier New", monospace';
function make57(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  let pen = null;
  function ridge(x0, x1, y, amp, seed, p, peak = 0.5, color = LINE5.ink) {
    if (p <= 0)
      return;
    const n = Math.max(12, Math.round((x1 - x0) / (4 * u)));
    const pts = [];
    for (let i = 0;i <= n; i++) {
      const f = i / n;
      const g = Math.exp(-(((f - peak) / 0.09) ** 2));
      const wob = (hash(seed + i * 0.73) - 0.5) * 3 * u * (1 + g * 2) + Math.sin(f * 40 + seed + t * 3) * 0.6 * u;
      pts.push([x0 + (x1 - x0) * f, y - g * amp + wob]);
    }
    const shown = along(pts, p).points;
    ctx.save();
    trace(ctx, [...shown, [shown.at(-1)[0], y + 4 * u], [x0, y + 4 * u]], true);
    ctx.fillStyle = BG3;
    ctx.fill();
    trace(ctx, shown);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6 * u;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
    if (p < 1)
      pen = shown.at(-1);
  }
  function typed(s, x, y, size, o = {}) {
    const { at = 0, tone = "ink", align = "left", weight = 400, spacing = 0.08 } = o;
    const n = Math.floor((t - at) / 0.035);
    if (n <= 0)
      return;
    ctx.save();
    ctx.font = `${weight} ${Math.round(size * u)}px ${MONO9}`;
    ctx.letterSpacing = `${spacing * size * u}px`;
    ctx.fillStyle = LINE5[tone];
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.textAlign = "left";
    ctx.fillText(s.slice(0, n), left, y);
    ctx.restore();
  }
  return {
    surface() {
      ctx.fillStyle = BG3;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(242,242,238,0.18)";
      ctx.lineWidth = 1 * u;
      ctx.beginPath();
      ctx.moveTo(W * 0.04, H * 0.9);
      ctx.lineTo(W * 0.96, H * 0.9);
      ctx.stroke();
      for (let i = 0;i <= 16; i++) {
        const x = W * (0.04 + 0.92 * i / 16);
        ctx.beginPath();
        ctx.moveTo(x, H * 0.9);
        ctx.lineTo(x, H * 0.9 + 6 * u);
        ctx.stroke();
      }
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.08, size = 34, at = 0, align = "left" } = o;
      typed(s.toUpperCase(), X(x), Y(y), size, { at, align, weight: 700, spacing: 0.22 });
    },
    label(s, x, y, o = {}) {
      typed(s.toLowerCase(), X(x), Y(y), o.size ?? 26, {
        at: o.at,
        tone: o.tone === "muted" ? "muted" : "ink",
        align: o.align ?? "center"
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.3 } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const R = r * u;
      ctx.save();
      trace(ctx, along(ellipse(X(x), Y(y), R, R, 40), p).points);
      ctx.fillStyle = BG3;
      ctx.fill();
      ctx.strokeStyle = LINE5[o.tone ?? "ink"];
      ctx.lineWidth = 1.4 * u;
      ctx.stroke();
      ctx.restore();
      ridge(X(x) - R * 0.7, X(x) + R * 0.7, Y(y) + R * 0.3, R * 0.75, x * 91 + y * 37, clamp(p * 1.4 - 0.3));
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      ctx.save();
      ctx.fillStyle = BG3;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      const rows = Math.floor((y1 - y0) / (5 * u));
      ctx.strokeStyle = "rgba(242,242,238,0.22)";
      ctx.lineWidth = 1 * u;
      for (let i = 0;i < rows * p; i++) {
        const yy = y0 + (i + 0.5) * ((y1 - y0) / rows);
        ctx.beginPath();
        ctx.moveTo(x0, yy);
        ctx.lineTo(x1, yy);
        ctx.stroke();
      }
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const { points, angle } = along(pts, expo(p));
      ctx.save();
      ctx.strokeStyle = LINE5[tone];
      ctx.globalAlpha = head ? 1 : 0.45;
      ctx.lineWidth = (head ? 1.6 : 1) * u;
      if (tone === "bad")
        ctx.setLineDash([6 * u, 5 * u]);
      trace(ctx, points);
      ctx.stroke();
      ctx.setLineDash([]);
      if (head && p >= 1) {
        arrowhead(ctx, pts.at(-1), angle, 10 * u);
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      if (t < at)
        return;
      const n = 14;
      const gap = Y(h) / (n + 2);
      for (let i = 0;i < n; i++) {
        const p = progress(t, at + i / n * dur * 0.6, dur * 0.4);
        ridge(X(x), X(x + w), Y(y) + gap * (i + 2.5), gap * (2 + hash(i) * 2.5), i * 13.7 + x * 50, p, 0.35 + hash(i + 4) * 0.3);
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${MONO9}`;
      ctx.fillStyle = LINE5[tone];
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = clamp((t - at) / 0.15);
      ctx.fillText(value, X(x), Y(y));
      const w = ctx.measureText(value).width;
      ctx.restore();
      if (sub) {
        typed(sub.toUpperCase(), X(x), Y(y) - size * 0.8 * u, size * 0.2, {
          at: at + 0.1,
          align: "center",
          spacing: 0.25
        });
        const p = progress(t, at + 0.3, 0.4);
        ctx.strokeStyle = LINE5.ink;
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.moveTo(X(x) - w / 2, Y(y) + size * 0.55 * u);
        ctx.lineTo(X(x) - w / 2 + w * expo(p), Y(y) + size * 0.55 * u);
        ctx.stroke();
      }
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 22) * u;
      const p = progress(t, o.at ?? 0, 0.25);
      if (p <= 0)
        return;
      const [cx, cy] = [X(x), Y(y)];
      const path = kind === "check" ? [
        [cx - s * 0.5, cy],
        [cx - s * 0.15, cy + s * 0.4],
        [cx + s * 0.55, cy - s * 0.45]
      ] : [
        [cx - s * 0.45, cy - s * 0.45],
        [cx + s * 0.45, cy + s * 0.45],
        [cx, cy],
        [cx + s * 0.45, cy - s * 0.45],
        [cx - s * 0.45, cy + s * 0.45]
      ];
      ctx.save();
      trace(ctx, along(path, p).points);
      ctx.strokeStyle = LINE5.ink;
      ctx.lineWidth = 2 * u;
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      if (!pen)
        return;
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(pen[0], pen[1], 3 * u, 0, Math.PI * 2);
      ctx.fill();
    }
  };
}
var ridgeline_default = {
  id: "ridgeline",
  name: "Ridgeline",
  category: "Data & Information",
  make: make57
};

// plugin/skills/motion-graphics/styles/risograph.ts
var STOCK2 = "#F3EEE3";
var YEL = "#FFE33B";
var PINK3 = "#FF4FA0";
var BLUE2 = "#3B5BA9";
var SANS8 = '"Futura", "Avenir Next", "Helvetica Neue", Arial, sans-serif';
var MONO10 = '"Courier New", "Menlo", "Courier", monospace';
var LINE6 = { ink: BLUE2, accent: BLUE2, good: BLUE2, bad: PINK3, muted: BLUE2 };
var SOLID = { ink: YEL, accent: YEL, good: YEL, bad: PINK3, muted: YEL };
function make58(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const boil = Math.floor(t * 8);
  const g = globalThis;
  g.__risoGrain ??= new Map;
  const cache = g.__risoGrain;
  function plate(at, k) {
    const p = clamp((t - at - k * 0.12) / 0.3);
    const settle = 1 - (1 - p) ** 3;
    const miss = [
      [3, -2],
      [-4, -3],
      [3, 3]
    ][k];
    const jx = (hash(boil * 1.3 + k * 7) - 0.5) * 1.4;
    const jy = (hash(boil * 2.1 + k * 3) - 0.5) * 1.4;
    return {
      p,
      dx: miss[0] * u + (1 - settle) * 30 * u * (k === 1 ? -1 : 1) + jx * u,
      dy: miss[1] * u + (1 - settle) * -18 * u + jy * u
    };
  }
  function plates(at, draw, use = [0, 1, 2]) {
    const colors = [YEL, PINK3, BLUE2];
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    for (const k of use) {
      const { p, dx, dy } = plate(at, k);
      if (p <= 0)
        continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p * 2);
      ctx.translate(dx, dy);
      draw(k, colors[k]);
      ctx.restore();
    }
    ctx.restore();
  }
  function grainTile() {
    const key = `${W}x${H}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      for (let i = 0;i < W * H / 26; i++) {
        c.fillStyle = `rgba(243,238,227,${0.25 + 0.5 * hash(i * 0.77)})`;
        c.fillRect(hash(i * 1.91) * W, hash(i * 2.73) * H, 1.6, 1.6);
      }
      for (let i = 0;i < 14; i++) {
        c.fillStyle = "rgba(243,238,227,0.12)";
        c.fillRect(0, hash(i * 9.3) * H, W, (2 + hash(i) * 6) * 1);
      }
      cache.set(key, tile);
    }
    return tile;
  }
  function dots(x, y, w, h, color, step = 7) {
    ctx.fillStyle = color;
    for (let gy = y + step / 2;gy < y + h; gy += step * u)
      for (let gx = x + step / 2;gx < x + w; gx += step * u) {
        ctx.beginPath();
        ctx.arc(gx, gy, 1.6 * u, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  return {
    surface() {
      ctx.fillStyle = STOCK2;
      ctx.fillRect(0, 0, W, H);
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.08, size = 56, at = 0 } = o;
      const font = `800 ${Math.round(size * u)}px ${SANS8}`;
      plates(at, (k, color) => {
        ctx.font = font;
        ctx.textAlign = o.align ?? "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = color;
        if (k === 0) {
          ctx.beginPath();
          ctx.arc(X(x) + ctx.measureText(s.split(" ")[0] ?? "").width + size * 0.9 * u, Y(y), size * 0.62 * u, 0, Math.PI * 2);
          ctx.fill();
        } else
          ctx.fillText(s, X(x), Y(y));
        if (k === 1)
          ctx.fillRect(X(x), Y(y) + size * 0.62 * u, ctx.measureText(s).width, 3 * u);
      });
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 26, tone = "ink", align = "center" } = o;
      plates(at, (_k, color) => {
        ctx.font = `700 ${Math.round(size * u)}px ${MONO10}`;
        ctx.letterSpacing = `${(size * 0.12 * u).toFixed(1)}px`;
        ctx.textAlign = align;
        ctx.textBaseline = "middle";
        ctx.fillStyle = color;
        ctx.fillText(s.toUpperCase(), X(x), Y(y));
      }, tone === "bad" ? [1] : [2]);
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const R = r * u;
      plates(at, (k, color) => {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
        if (k === 2) {
          ctx.lineWidth = 3 * u;
          ctx.strokeStyle = color;
          ctx.stroke();
        } else if (k === 0) {
          ctx.fillStyle = tone === "bad" ? PINK3 : color;
          ctx.fill();
        } else {
          ctx.save();
          ctx.clip();
          dots(X(x) - R, Y(y), R * 2, R, color, 5);
          ctx.restore();
        }
      });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
      plates(at, (k, color) => {
        if (k === 0) {
          ctx.fillStyle = SOLID[tone];
          ctx.beginPath();
          ctx.roundRect(l, tp, ww, hh, 10 * u);
          ctx.fill();
        } else if (k === 1) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(l, tp, ww, hh, 10 * u);
          ctx.clip();
          dots(l, tp + hh * 0.7, ww, hh * 0.3, color, 6);
          ctx.restore();
        } else {
          ctx.lineWidth = 4 * u;
          ctx.strokeStyle = color;
          ctx.beginPath();
          ctx.roundRect(l, tp, ww, hh, 10 * u);
          ctx.stroke();
        }
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = clamp((t - at) / dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const res = along(pts, p);
      const color = LINE6[tone];
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.translate(tone === "bad" ? -2 * u : 2 * u, tone === "bad" ? 2 * u : -1 * u);
      ctx.strokeStyle = color;
      ctx.lineCap = "round";
      ctx.lineWidth = (head ? 4 : 1.5) * u;
      if (head)
        ctx.setLineDash(tone === "bad" ? [12 * u, 8 * u] : [0.1, 9 * u]);
      if (!head)
        ctx.globalAlpha = 0.55;
      trace(ctx, res.points);
      ctx.stroke();
      ctx.setLineDash([]);
      if (head && p >= 1) {
        const tip = pts.at(-1);
        const s = 16 * u;
        trace(ctx, [
          tip,
          [tip[0] - Math.cos(res.angle - 0.5) * s, tip[1] - Math.sin(res.angle - 0.5) * s],
          [tip[0] - Math.cos(res.angle + 0.5) * s, tip[1] - Math.sin(res.angle + 0.5) * s]
        ], true);
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      for (let i = 0;i < 3; i++) {
        const cx = X(x + w / 2) + (i - 1) * 10 * u;
        const cy = Y(y + h / 2) + (1 - i) * 12 * u;
        const cw = X(w) * 0.95;
        const ch = Y(h) * 0.7;
        plates(at + i * dur / 4, (k, color) => {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate((i - 1) * 0.14);
          if (k === 0) {
            ctx.fillStyle = color;
            ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
          } else if (k === 1) {
            ctx.fillStyle = color;
            ctx.fillRect(-cw / 2, ch * 0.22, cw, ch * 0.28);
          } else {
            ctx.lineWidth = 3 * u;
            ctx.strokeStyle = color;
            ctx.strokeRect(-cw / 2, -ch / 2, cw, ch);
            ctx.beginPath();
            ctx.arc(0, -ch * 0.08, cw * 0.2, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      const big = size >= 80;
      plates(at, (k, color) => {
        ctx.font = `800 ${Math.round(size * u)}px ${SANS8}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = color;
        if (k === 0) {
          if (big) {
            ctx.beginPath();
            ctx.arc(X(x), Y(y), size * 0.95 * u, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (k === 1)
          ctx.fillText(value, X(x), Y(y));
        else {
          ctx.fillText(value, X(x) + 3 * u, Y(y) + 3 * u);
          if (sub) {
            ctx.font = `700 ${Math.round(size * 0.24 * u)}px ${MONO10}`;
            ctx.fillText(sub.toUpperCase(), X(x), Y(y) - size * 0.75 * u);
          }
        }
      }, tone === "bad" ? [0, 1] : [0, 1, 2]);
      if (big && count) {
        const p = clamp((t - at - dur) / 0.5);
        if (p > 0) {
          ctx.save();
          ctx.globalCompositeOperation = "multiply";
          ctx.strokeStyle = PINK3;
          ctx.lineWidth = 3.5 * u;
          trace(ctx, along(roughen(ellipse(X(x), Y(y), size * 1.25 * u, size * 0.7 * u, 40, -2.2, 1.15), 3 * u, 4), p).points);
          ctx.stroke();
          ctx.restore();
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const s = (o.size ?? 30) * u;
      const cx = X(x);
      const cy = Y(y);
      const p = clamp((t - at) / 0.3);
      if (p <= 0)
        return;
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.lineWidth = 6 * u;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = kind === "check" ? BLUE2 : PINK3;
      if (kind === "check")
        trace(ctx, along([
          [cx - s * 0.5, cy],
          [cx - s * 0.1, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.55]
        ], p).points);
      else {
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.5, cy - s * 0.5);
        ctx.lineTo(cx + s * 0.5 * (2 * p - 1), cy + s * 0.5 * (2 * p - 1));
        if (p > 0.5) {
          ctx.moveTo(cx + s * 0.5, cy - s * 0.5);
          ctx.lineTo(cx - s * 0.5, cy + s * 0.5);
        }
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      ctx.save();
      ctx.drawImage(grainTile(), (hash(boil) - 0.5) * 4, (hash(boil + 3) - 0.5) * 4);
      ctx.restore();
    }
  };
}
var risograph_default = { id: "risograph", name: "Risograph zine", category: "Print", make: make58 };

// plugin/skills/motion-graphics/styles/screenprint-grid.ts
var WALL = "#ECE6DA";
var BLACK8 = "#161412";
var PLATE = {
  ink: "#FFE14D",
  accent: "#FF4FA3",
  good: "#B8F04A",
  bad: "#FF3B30",
  muted: "#8FD7F0"
};
var PANELS = [
  [0.025, 0.2, 0.17, 0.66, "#FF5FAE"],
  [0.205, 0.2, 0.555, 0.66, "#22C1C8"],
  [0.77, 0.2, 0.205, 0.66, "#FF8A1F"]
];
var STENCIL = '"Impact", "Haettenschweiler", "Bebas Neue", "Arial Narrow", sans-serif';
function make59(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__silkGrain ??= new Map;
  const cache = g.__silkGrain;
  const pull = (at) => clamp((t - at - 0.15) / 0.3);
  function slap(at) {
    const p = clamp((t - at) / 0.1);
    return { on: p > 0, s: 1 + (1 - p) * 0.06 };
  }
  function squeegee(x, y, w, h, at, draw) {
    const p = pull(at);
    if (p <= 0)
      return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 20 * u, y - 20 * u, (w + 40 * u) * p, h + 40 * u);
    ctx.clip();
    draw();
    ctx.restore();
    if (p < 1) {
      ctx.fillStyle = "rgba(22,20,18,0.8)";
      ctx.fillRect(x - 20 * u + (w + 40 * u) * p - 3 * u, y - 20 * u, 6 * u, h + 40 * u);
    }
  }
  function grainTile() {
    const key = `${W}x${H}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      for (let i = 0;i < W * H / 70; i++) {
        c.fillStyle = `rgba(236,230,218,${0.15 + 0.35 * hash(i * 0.91)})`;
        c.fillRect(hash(i * 1.53) * W, hash(i * 2.17) * H, 1.5, 1.5);
      }
      for (let i = 0;i < 30; i++) {
        c.fillStyle = "rgba(255,255,255,0.06)";
        c.fillRect(0, hash(i * 7.9) * H, W, 1 + hash(i) * 3);
      }
      cache.set(key, tile);
    }
    return tile;
  }
  function stencil(s, x, y, size, color, align = "center") {
    ctx.font = `400 ${Math.round(size * u)}px ${STENCIL}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(s.toUpperCase(), x, y);
  }
  function cut(x, y, w, h, seed) {
    const j = (k) => (hash(seed + k) - 0.5) * 6 * u;
    trace(ctx, [
      [x + j(1), y + j(2)],
      [x + w + j(3), y + j(4)],
      [x + w + j(5), y + h + j(6)],
      [x + j(7), y + h + j(8)]
    ], true);
  }
  return {
    surface() {
      ctx.fillStyle = WALL;
      ctx.fillRect(0, 0, W, H);
      for (const [x, y, w, h, c] of PANELS) {
        ctx.fillStyle = c;
        ctx.fillRect(X(x), Y(y), X(w), Y(h));
      }
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.09, size = 54, at = 0 } = o;
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${STENCIL}`;
      const w = ctx.measureText(s.toUpperCase()).width + 30 * u;
      ctx.restore();
      const h = size * 1.3 * u;
      const { on } = slap(at);
      if (!on)
        return;
      ctx.fillStyle = PLATE.ink;
      cut(X(x) + 6 * u, Y(y) - h / 2 + 4 * u, w, h, 3);
      ctx.fill();
      squeegee(X(x), Y(y) - h / 2, w, h, at, () => stencil(s, X(x) + 15 * u, Y(y), size, BLACK8, "left"));
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 26, tone = "ink", align = "center" } = o;
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${STENCIL}`;
      const w = ctx.measureText(s.toUpperCase()).width + 18 * u;
      ctx.restore();
      const h = size * 1.3 * u;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      if (!slap(at).on)
        return;
      ctx.fillStyle = tone === "ink" ? "#F6F1E4" : PLATE[tone];
      cut(left + 4 * u, Y(y) - h / 2 + 3 * u, w, h, x * 77);
      ctx.fill();
      squeegee(left, Y(y) - h / 2, w, h, at, () => stencil(s, left + w / 2, Y(y), size, BLACK8));
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const R = r * u;
      const cx = X(x);
      const cy = Y(y);
      const { on, s } = slap(at);
      if (!on)
        return;
      ctx.beginPath();
      ctx.arc(cx + 5 * u, cy - 4 * u, R * s, 0, Math.PI * 2);
      ctx.fillStyle = PLATE[tone === "accent" ? "ink" : tone];
      ctx.fill();
      squeegee(cx - R, cy - R, R * 2, R * 2, at - 0.1, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.lineWidth = 4 * u;
        ctx.strokeStyle = BLACK8;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx - R * 0.15, cy + R * 0.1, R * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = BLACK8;
        ctx.fill();
      });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const [l, tp, ww, hh] = [X(x), Y(y), X(w), Y(h)];
      if (!slap(at).on)
        return;
      ctx.fillStyle = "#F6F1E4";
      cut(l, tp, ww, hh, x * 19);
      ctx.fill();
      ctx.fillStyle = PLATE[tone];
      cut(l + ww * 0.08 + 7 * u, tp + hh * 0.55, ww * 0.84, hh * 0.32, x * 23);
      ctx.fill();
      squeegee(l, tp, ww, hh, at, () => {
        ctx.lineWidth = 5 * u;
        ctx.strokeStyle = BLACK8;
        ctx.strokeRect(l - 3 * u, tp + 3 * u, ww, hh);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = clamp((t - at) / dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 28);
      const res = along(pts, p);
      const color = tone === "bad" ? PLATE.bad : BLACK8;
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = color;
      ctx.globalAlpha = head ? 1 : 0.6;
      ctx.lineWidth = (head ? 6 : 1.8) * u;
      trace(ctx, res.points);
      ctx.stroke();
      if (tone === "bad") {
        ctx.strokeStyle = BLACK8;
        ctx.lineWidth = 2 * u;
        trace(ctx, res.points.map(([px, py]) => [px - 3 * u, py + 3 * u]));
        ctx.stroke();
      }
      if (head && p >= 1) {
        const tip = pts.at(-1);
        const s = 22 * u;
        trace(ctx, [
          [tip[0] + Math.cos(res.angle) * 4 * u, tip[1] + Math.sin(res.angle) * 4 * u],
          [tip[0] - Math.cos(res.angle - 0.5) * s, tip[1] - Math.sin(res.angle - 0.5) * s],
          [tip[0] - Math.cos(res.angle + 0.5) * s, tip[1] - Math.sin(res.angle + 0.5) * s]
        ], true);
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const cols = 2;
      const rows = 3;
      const cw = X(w) / cols;
      const ch = Y(h) / rows;
      for (let i = 0;i < cols * rows; i++) {
        const l = X(x) + i % cols * cw;
        const tp = Y(y) + Math.floor(i / cols) * ch;
        const a = at + i * dur / (cols * rows + 2);
        if (!slap(a).on)
          continue;
        ctx.fillStyle = "#F6F1E4";
        cut(l + 2 * u, tp + 2 * u, cw - 4 * u, ch - 4 * u, i * 5 + x * 9);
        ctx.fill();
        ctx.fillStyle = i % 3 === 1 ? PLATE.accent : PLATE.ink;
        ctx.fillRect(l + 6 * u, tp + ch * 0.66, cw - 12 * u, ch * 0.24);
        squeegee(l, tp, cw, ch, a - 0.1, () => {
          ctx.lineWidth = 2.5 * u;
          ctx.strokeStyle = BLACK8;
          ctx.strokeRect(l + 3 * u, tp + 3 * u, cw - 6 * u, ch - 6 * u);
          ctx.beginPath();
          ctx.arc(l + cw / 2, tp + ch * 0.38, Math.min(cw, ch) * 0.2, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      if (!slap(at).on)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${STENCIL}`;
      const w = ctx.measureText(value).width + 24 * u;
      ctx.restore();
      const h = size * 1.15 * u;
      const big = size >= 80;
      const ways = [PLATE.ink, PLATE.good, PLATE.accent];
      const color = big && count && t < at + dur ? ways[Math.floor(t * 6) % 3] : PLATE[tone === "accent" ? "ink" : tone];
      ctx.fillStyle = color;
      cut(X(x) - w / 2 + 6 * u, Y(y) - h / 2 + 5 * u, w, h, x * 31);
      ctx.fill();
      squeegee(X(x) - w / 2, Y(y) - h / 2, w, h, at, () => stencil(value, X(x), Y(y) + 2 * u, size, BLACK8));
      if (sub)
        squeegee(X(x) - w / 2, Y(y) - size * u, w, size * 0.4 * u, at + 0.1, () => stencil(sub, X(x), Y(y) - size * 0.78 * u, size * 0.26, BLACK8));
      if (big && count) {
        const q = clamp((t - at - dur) / 0.4);
        if (q > 0) {
          ctx.save();
          ctx.strokeStyle = BLACK8;
          ctx.lineWidth = 4 * u;
          trace(ctx, along(ellipse(X(x), Y(y), w * 0.68, h * 0.75, 40, -2.4, 1.05), q).points);
          ctx.stroke();
          ctx.restore();
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const s = (o.size ?? 32) * u;
      const cx = X(x);
      const cy = Y(y);
      if (!slap(at).on)
        return;
      ctx.save();
      ctx.lineCap = "square";
      ctx.lineJoin = "miter";
      ctx.lineWidth = 8 * u;
      ctx.strokeStyle = kind === "check" ? PLATE.good : PLATE.bad;
      const pts = kind === "check" ? [
        [cx - s * 0.5, cy],
        [cx - s * 0.1, cy + s * 0.45],
        [cx + s * 0.6, cy - s * 0.55]
      ] : [];
      if (kind === "check") {
        trace(ctx, pts.map(([px, py]) => [px + 4 * u, py - 3 * u]));
        ctx.stroke();
      }
      ctx.restore();
      squeegee(cx - s, cy - s, s * 2, s * 2, at - 0.1, () => {
        ctx.save();
        ctx.lineWidth = 6 * u;
        ctx.strokeStyle = BLACK8;
        if (kind === "check")
          trace(ctx, pts);
        else {
          ctx.beginPath();
          ctx.moveTo(cx - s * 0.5, cy - s * 0.5);
          ctx.lineTo(cx + s * 0.5, cy + s * 0.5);
          ctx.moveTo(cx + s * 0.5, cy - s * 0.5);
          ctx.lineTo(cx - s * 0.5, cy + s * 0.5);
          ctx.strokeStyle = PLATE.bad;
        }
        ctx.stroke();
        ctx.restore();
      });
    },
    finish() {
      ctx.drawImage(grainTile(), 0, 0);
    }
  };
}
var screenprint_grid_default = {
  id: "screenprint-grid",
  name: "Silkscreen pop",
  category: "Print",
  make: make59
};

// plugin/skills/motion-graphics/styles/shadow-puppet.ts
var BLACK9 = "#140C07";
var GEL = {
  ink: "#E9B866",
  accent: "#E2683A",
  good: "#6DBA4E",
  bad: "#D8382A",
  muted: "#9C7A4E"
};
var SERIF11 = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
function make60(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__shadowPlay ??= new Map;
  const cache = g.__shadowPlay;
  function hang(at) {
    if (t < at)
      return null;
    const s = spring(t, { start: at, stiffness: 140, damping: 9 });
    const swing = Math.sin((t - at) * 4.5) * 0.06 * Math.exp(-(t - at) * 1.6) + Math.sin(t * 1.3 + at) * 0.006;
    return { dy: (1 - s) * -H * 0.25, swing };
  }
  function strings(x1, x2, y) {
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
  function plaque(s, cx, cy, size, o) {
    const h = hang(o.at ?? 0);
    if (!h)
      return;
    ctx.save();
    ctx.font = `italic 500 ${Math.round(size * u)}px ${SERIF11}`;
    const w = ctx.measureText(s).width + size * 1.1 * u;
    const ph = size * 1.5 * u;
    const left = o.align === "left" ? cx : o.align === "right" ? cx - w : cx - w / 2;
    const y = cy + h.dy;
    if (o.hung)
      strings(left + w * 0.15, left + w * 0.85, y - ph / 2);
    ctx.translate(left + w / 2, y - ph);
    ctx.rotate(h.swing);
    ctx.translate(-(left + w / 2), -(y - ph));
    ctx.fillStyle = BLACK9;
    ctx.beginPath();
    ctx.roundRect(left, y - ph / 2, w, ph, ph * 0.15);
    ctx.fill();
    for (const ex of [left, left + w]) {
      ctx.beginPath();
      ctx.arc(ex, y, ph * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = alpha(GEL.ink, 0.55);
    ctx.lineWidth = Math.max(1, 1.5 * u);
    ctx.setLineDash([3 * u, 3 * u]);
    ctx.strokeRect(left + ph * 0.14, y - ph / 2 + ph * 0.14, w - ph * 0.28, ph * 0.72);
    ctx.setLineDash([]);
    ctx.font = `italic 500 ${Math.round(size * u)}px ${SERIF11}`;
    ctx.fillStyle = o.tone && o.tone !== "ink" ? GEL[o.tone] : "#F2D9A2";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + w / 2, y + size * 0.04 * u);
    ctx.restore();
  }
  function cog(cx, cy, R, tone, spin) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spin);
    ctx.fillStyle = BLACK9;
    const n = 10;
    ctx.beginPath();
    for (let i = 0;i < n * 2; i++) {
      const a = i / (n * 2) * Math.PI * 2;
      const r = i % 2 ? R : R * 1.18;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = GEL[tone];
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = BLACK9;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = R * 0.12;
    ctx.strokeStyle = BLACK9;
    ctx.beginPath();
    for (let i = 0;i < 4; i++) {
      const a = i / 4 * Math.PI * 2;
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
        const gr = c.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.45, Math.hypot(W, H) * 0.6);
        gr.addColorStop(0, "#F7D9A0");
        gr.addColorStop(0.35, "#E6A55A");
        gr.addColorStop(0.7, "#A9562A");
        gr.addColorStop(1, "#3A1A0C");
        c.fillStyle = gr;
        c.fillRect(0, 0, W, H);
        c.globalAlpha = 0.05;
        c.fillStyle = "#3A1A0C";
        for (let x = 0;x < W; x += 3 * u)
          c.fillRect(x, 0, Math.max(0.5, 0.6 * u), H);
        for (let y = 0;y < H; y += 3 * u)
          c.fillRect(0, y, W, Math.max(0.5, 0.6 * u));
        c.globalAlpha = 1;
        c.save();
        c.filter = `blur(${5 * u}px)`;
        c.fillStyle = "rgba(40,20,10,0.35)";
        for (let i = 0;i < 14; i++) {
          const y = H * (0.55 + i * 0.028);
          c.beginPath();
          c.ellipse(W * 0.11 + i * 4 * u, y, (40 - i * 1.5) * u, 6 * u, -0.5, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();
        c.fillStyle = BLACK9;
        c.fillRect(0, 0, W, 8 * u);
        for (let x = 0;x < W; x += 22 * u) {
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
        c.strokeStyle = BLACK9;
        c.lineCap = "round";
        for (let i = 0;i < 260; i++) {
          const x = hash(i * 1.7) * W;
          const hgt = (8 + hash(i * 2.3) * 22) * u;
          c.lineWidth = (1.5 + hash(i) * 1.5) * u;
          c.beginPath();
          c.moveTo(x, base + 2 * u);
          c.quadraticCurveTo(x + (hash(i * 3) - 0.5) * 10 * u, base - hgt * 0.6, x + (hash(i * 5) - 0.5) * 16 * u, base - hgt);
          c.stroke();
        }
        for (let i = 0;i < 12; i++) {
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
        align: o.align ?? "center"
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      if (t < at)
        return;
      const s = spring(t, { start: at, stiffness: 180, damping: 12 });
      const dy = (1 - s) * 60 * u;
      const R = r * u;
      cog(X(x), Y(y) + dy, R * 0.85, tone, t * 0.4 + hash(x * 7 + y));
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const hg = hang(at);
      if (!hg)
        return;
      const [x0, y0, bw, bh] = [X(x), Y(y) + hg.dy, X(w), Y(h)];
      strings(x0 + bw * 0.2, x0 + bw * 0.8, y0);
      ctx.save();
      ctx.translate(x0 + bw / 2, y0);
      ctx.rotate(hg.swing);
      ctx.translate(-(x0 + bw / 2), -y0);
      const b = 14 * u;
      ctx.fillStyle = BLACK9;
      ctx.beginPath();
      ctx.rect(x0 - b, y0 - b, bw + b * 2, bh + b * 2);
      ctx.rect(x0 + bw, y0, -bw, bh);
      ctx.fill();
      ctx.fillStyle = alpha(GEL[tone], 0.28);
      ctx.fillRect(x0, y0, bw, bh);
      ctx.fillStyle = "#F2C27A";
      for (let i = 0;i < 12; i++) {
        const f = (i + 0.5) / 12;
        for (const [px, py] of [
          [x0 + bw * f, y0 - b / 2],
          [x0 + bw * f, y0 + bh + b / 2]
        ]) {
          ctx.beginPath();
          ctx.arc(px, py, 2.2 * u, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 40);
      const n = Math.max(2, Math.round(pts.length * p));
      const shown = pts.slice(0, n);
      const thin = !head && tone === "accent";
      ctx.save();
      ctx.lineCap = "round";
      trace(ctx, shown);
      ctx.strokeStyle = BLACK9;
      ctx.lineWidth = (thin ? 1.6 : 4) * u;
      ctx.stroke();
      if (!thin) {
        ctx.fillStyle = BLACK9;
        for (let i = 0;i < shown.length; i += 4) {
          const [px, py] = shown[i];
          ctx.beginPath();
          ctx.arc(px, py, 4.5 * u, 0, Math.PI * 2);
          ctx.fill();
        }
        if (tone !== "ink") {
          ctx.fillStyle = GEL[tone];
          for (let i = 0;i < shown.length; i += 4) {
            const [px, py] = shown[i];
            ctx.beginPath();
            ctx.arc(px, py, 2 * u, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 22 * u;
        trace(ctx, [
          [end[0] + Math.cos(a) * 4 * u, end[1] + Math.sin(a) * 4 * u],
          [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
          [end[0] - Math.cos(a) * s * 0.6, end[1] - Math.sin(a) * s * 0.6],
          [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s]
        ], true);
        ctx.fillStyle = BLACK9;
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, tone = "accent" } = o;
      if (t < at)
        return;
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
      ctx.fillStyle = BLACK9;
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
      for (let row = 0;row < 3; row++) {
        for (let col = 0;col < 2; col++) {
          ctx.beginPath();
          ctx.ellipse(x0 + bw * (0.32 + col * 0.36), y0 + bh * (0.38 + row * 0.2), bw * 0.1, bh * 0.065, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const a = progress(t, at, 0.4);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `500 ${Math.round(size * u)}px ${SERIF11}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = BLACK9;
      ctx.fillText(value, X(x), Y(y));
      ctx.restore();
      if (tone !== "ink") {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = GEL[tone];
        ctx.fillRect(X(x) - size * 0.9 * u, Y(y) + size * 0.42 * u, size * 1.8 * u, 4 * u);
        ctx.restore();
      }
      if (sub)
        plaque(sub, X(x), Y(y) + size * 0.95 * u, size * 0.34, { at: at + 0.3 });
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 30) * u;
      const s = spring(t, { start: o.at ?? 0, stiffness: 240, damping: 13 });
      if (s <= 0)
        return;
      ctx.save();
      ctx.translate(X(x), Y(y));
      ctx.scale(s, s);
      ctx.fillStyle = BLACK9;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = GEL[o.tone ?? (kind === "check" ? "good" : "bad")];
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = BLACK9;
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
      const f = 0.06 + 0.04 * Math.sin(t * 7.3) + 0.03 * Math.sin(t * 13.1 + 1) + 0.02 * (hash(Math.floor(t * 12)) - 0.5);
      ctx.save();
      ctx.fillStyle = `rgba(30,10,0,${clamp(f, 0, 0.2)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  };
}
var shadow_puppet_default = {
  id: "shadow-puppet",
  name: "Shadow play",
  category: "Paper & Craft",
  make: make60
};

// plugin/skills/motion-graphics/styles/sketchbook-pencil.ts
var LEAD = {
  ink: "#3A3936",
  accent: "#2E2D2B",
  good: "#3A3936",
  bad: "#C2362F",
  muted: "#8E8A82"
};
var HAND7 = '"Noteworthy", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';
function make61(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__pencil ??= new Map;
  const cache = g.__pencil;
  let tip = null;
  let seed = 1;
  function paper() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      const gr = b.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.6);
      gr.addColorStop(0, "#F3EDDF");
      gr.addColorStop(1, "#E2D9C6");
      b.fillStyle = gr;
      b.fillRect(0, 0, W, H);
      for (let i = 0;i < W * H / 60; i++) {
        b.fillStyle = hash(i * 1.3) > 0.5 ? "rgba(255,255,255,0.18)" : "rgba(110,95,70,0.06)";
        b.fillRect(hash(i * 0.7) * W, hash(i * 1.9 + 2) * H, u, u);
      }
      b.font = `italic ${Math.round(16 * u)}px ${HAND7}`;
      b.fillStyle = "rgba(90,85,78,0.6)";
      b.textAlign = "right";
      b.fillText("p. 14", W * 0.95, H * 0.06);
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  function lead(tone) {
    const key = `lead:${tone}`;
    let tile = cache.get(key);
    if (!tile) {
      const n = 96;
      tile = new OffscreenCanvas(n, n);
      const c = tile.getContext("2d");
      const img = c.createImageData(n, n);
      const hex = Number.parseInt(LEAD[tone].slice(1), 16);
      for (let i = 0;i < n * n; i++) {
        img.data[i * 4] = hex >> 16 & 255;
        img.data[i * 4 + 1] = hex >> 8 & 255;
        img.data[i * 4 + 2] = hex & 255;
        img.data[i * 4 + 3] = hash(i * 0.913 + 1.7) < 0.15 ? 40 : Math.round(255 * (0.6 + 0.4 * hash(i * 1.71)));
      }
      c.putImageData(img, 0, 0);
      cache.set(key, tile);
    }
    return ctx.createPattern(tile, "repeat");
  }
  function pencil(points, { at = 0, dur = 0.5, tone = "ink", width = 2.6, build = true } = {}) {
    seed += 1;
    if (t < at)
      return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (build) {
      const c = progress(t, at, 0.25);
      const ghost = roughen(points, 2.4 * u, seed * 11.3);
      const a = ghost[0];
      const b = ghost.at(-1);
      const a2 = ghost[1];
      const b2 = ghost.at(-2);
      const over = 14 * u;
      const ext = (p, q) => {
        const l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
        return [p[0] + (p[0] - q[0]) / l * over, p[1] + (p[1] - q[1]) / l * over];
      };
      const closed = Math.hypot(a[0] - b[0], a[1] - b[1]) < 4 * u;
      const path = closed ? ghost : [ext(a, a2), ...ghost, ext(b, b2)];
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = LEAD.muted;
      ctx.lineWidth = 1 * u;
      trace(ctx, along(path, c).points);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const p = progress(t, build ? at + 0.15 : at, dur);
    if (p > 0) {
      const { points: drawn } = along(roughen(points, 1 * u, seed * 5.1), p);
      ctx.strokeStyle = lead(tone);
      ctx.lineWidth = width * u;
      trace(ctx, drawn);
      ctx.stroke();
      if (p < 1)
        tip = { pt: drawn.at(-1), color: LEAD[tone] };
    }
    ctx.restore();
  }
  function shade(clip, cx, cy, r, at, tone) {
    const p = progress(t, at, 0.5);
    if (p <= 0)
      return;
    ctx.save();
    clip();
    ctx.clip();
    ctx.strokeStyle = lead(tone);
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.3 * u;
    const step = 4 * u;
    const n = Math.ceil(r * 2 / step);
    for (let i = 0;i < n * p; i++) {
      const d = -r + i * step;
      const len = Math.max(0, (d + r * 0.2) / (r * 1.2)) * r * 1.4;
      if (len <= 0)
        continue;
      trace(ctx, [
        [cx + d - len * 0.3, cy + r - len],
        [cx + d + len * 0.3, cy + r + len * 0.1]
      ]);
      ctx.stroke();
    }
    ctx.restore();
  }
  function write(s, x, y, o = {}) {
    const { at = 0, size = 34, tone = "ink", align = "left" } = o;
    const dur = o.dur ?? 0.05 * s.length + 0.1;
    const p = progress(t, at, dur);
    if (p <= 0)
      return 0;
    ctx.save();
    ctx.font = `600 ${Math.round(size * u)}px ${HAND7}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.beginPath();
    ctx.rect(left - 4 * u, Y(y) - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = lead(tone);
    ctx.fillText(s, left, Y(y));
    ctx.restore();
    if (p < 1)
      tip = { pt: [left + w * p, Y(y) + size * 0.15 * u], color: LEAD[tone] };
    return w;
  }
  return {
    surface() {
      paper();
    },
    title(s, o = {}) {
      const { x = 0.06, y = 0.12, size = 68, at = 0 } = o;
      const w = write(s, x, y, { ...o, size, at, align: o.align ?? "left" });
      if (!w)
        return;
      const done = at + (o.dur ?? 0.05 * s.length + 0.1);
      pencil(curve([X(x) - 10 * u, Y(y) + size * 0.75 * u], [X(x) + w + 14 * u, Y(y) + size * 0.7 * u], -0.01, 12), {
        at: done,
        dur: 0.35,
        width: 1.8,
        build: false
      });
    },
    label(s, x, y, o = {}) {
      write(s, x, y, { size: 40, align: "center", ...o });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const [cx, cy, R] = [X(x), Y(y), r * u];
      pencil(ellipse(cx, cy, R, R, 40, -Math.PI / 2, 1.04), { dur: 0.2, width: 2.2, ...o });
      shade(() => {
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
      }, cx, cy, R, at + 0.25, tone);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      const a = [X(x), Y(y)];
      const b = [X(x + w), Y(y + h)];
      const q = dur / 4;
      pencil([a, [b[0], a[1]]], { ...o, at, dur: q });
      pencil([[b[0], a[1]], b], { ...o, at: at + q, dur: q });
      pencil([b, [a[0], b[1]]], { ...o, at: at + 2 * q, dur: q });
      pencil([[a[0], b[1]], a], { ...o, at: at + 3 * q, dur: q });
      const s = progress(t, at + dur, 0.5);
      if (s > 0) {
        ctx.save();
        ctx.globalAlpha = 0.5 * s;
        ctx.fillStyle = lead(tone);
        ctx.fillRect(b[0], a[1] + 8 * u, 6 * u, b[1] - a[1]);
        ctx.fillRect(a[0] + 8 * u, b[1], b[0] - a[0], 6 * u);
        ctx.restore();
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true } = o;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      pencil(shaft, { ...o, at, dur, width: head ? 2 : 1.3, build: head });
      if (!head)
        return;
      const end = shaft.at(-1);
      const prev = shaft.at(-3);
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 15 * u;
      pencil([
        [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
        end,
        [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s]
      ], { ...o, at: at + dur, dur: 0.1, width: 2, build: false });
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9, tone = "ink" } = o;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.28;
      const top = Y(y) + ry;
      const bottom = Y(y + h) - ry;
      const step = dur / 4;
      pencil(ellipse(cx, top, rx, ry, 32), { ...o, at, dur: step });
      pencil([
        [cx - rx, top],
        [cx - rx, bottom]
      ], { ...o, at: at + step, dur: step });
      pencil([
        [cx + rx, top],
        [cx + rx, bottom]
      ], { ...o, at: at + step, dur: step });
      pencil(ellipse(cx, bottom, rx, ry, 24, 0, 0.5), { ...o, at: at + step * 2, dur: step });
      shade(() => {
        ctx.beginPath();
        ctx.rect(cx, top, rx, bottom - top + ry);
      }, cx + rx * 0.5, (top + bottom) / 2, Math.max(rx, (bottom - top) / 2), at + step * 3, tone);
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      write(value, x, y, { at, size, align: "center", dur: 0.25 });
      if (sub)
        write(sub, x, y - size * 0.8 * u / H, {
          at: at + 0.2,
          size: size * 0.34,
          align: "center"
        });
      if (size >= 80)
        pencil(ellipse(X(x), Y(y), size * 1.7 * u, size * 0.85 * u, 44, -Math.PI * 0.7, 1.08), {
          at: at + dur,
          dur: 0.4,
          tone: "bad",
          width: 2,
          build: false
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 32) * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check") {
        pencil([
          [cx - s * 0.5, cy],
          [cx - s * 0.1, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5]
        ], { dur: 0.25, width: 2.6, build: false, ...o });
      } else {
        const at = o.at ?? 0;
        pencil([
          [cx - s * 0.5, cy - s * 0.5],
          [cx + s * 0.5, cy + s * 0.5]
        ], { dur: 0.12, tone: "bad", build: false, ...o });
        pencil([
          [cx + s * 0.5, cy - s * 0.5],
          [cx - s * 0.5, cy + s * 0.5]
        ], { dur: 0.12, tone: "bad", build: false, ...o, at: at + 0.12 });
      }
    },
    finish() {
      const tp = tip;
      if (!tp)
        return;
      const [x, y] = tp.pt;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI * 0.25);
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 10 * u;
      ctx.shadowOffsetX = 10 * u;
      ctx.shadowOffsetY = 12 * u;
      const L = 220 * u;
      const R = 6 * u;
      ctx.fillStyle = tp.color === LEAD.bad ? "#B3332C" : "#2F5D3A";
      ctx.fillRect(26 * u, -R, L, R * 2);
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#E3C79C";
      trace(ctx, [
        [4 * u, -R * 0.25],
        [26 * u, -R],
        [26 * u, R],
        [4 * u, R * 0.25]
      ], true);
      ctx.fill();
      ctx.fillStyle = tp.color;
      trace(ctx, [
        [0, 0],
        [5 * u, -R * 0.3],
        [5 * u, R * 0.3]
      ], true);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(26 * u, -R, L, R * 0.6);
      ctx.restore();
    }
  };
}
var sketchbook_pencil_default = {
  id: "sketchbook-pencil",
  name: "Graphite sketchbook",
  category: "Hand-drawn",
  make: make61
};

// plugin/skills/motion-graphics/styles/soft-3d.ts
var CLAY2 = {
  ink: ["#B4A6FF", "#8E7CF0", "#6A57D2"],
  accent: ["#FFB3A0", "#FF8D73", "#E0644F"],
  good: ["#A8F0D2", "#73DDB4", "#45B98F"],
  bad: ["#FF9A9A", "#F06A6A", "#CC4545"],
  muted: ["#E5DEFA", "#CFC5F2", "#B1A5E0"]
};
var BUTTER = ["#FFE7A0", "#FFD25E", "#E6AE2E"];
var SANS9 = '"Nunito", "Avenir Next Rounded", "Arial Rounded MT Bold", "Avenir Next", "Helvetica Neue", sans-serif';
function make62(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  function drop(at = 0) {
    const s = t - at;
    if (s < 0)
      return null;
    const fall = clamp(s / 0.22);
    const y = (1 - fall * fall) * -90 * u;
    if (fall < 1)
      return [y, 0.9, 1.12];
    const b = spring(t, { start: at + 0.22, stiffness: 300, damping: 9 });
    const sq = (1 - b) * 0.35;
    return [0, 1 + sq, 1 - sq];
  }
  function dropped(cx, foot, at, draw, shadowW = 0) {
    const d = drop(at);
    if (!d)
      return;
    const [dy, sx, sy] = d;
    if (shadowW)
      contact(cx, foot, shadowW, clamp(1 + dy / (90 * u)));
    ctx.save();
    ctx.globalAlpha = clamp((t - (at ?? 0)) / 0.08);
    ctx.translate(cx, foot + dy);
    ctx.scale(sx, sy);
    ctx.translate(-cx, -foot);
    draw();
    ctx.restore();
  }
  function contact(cx, y, w, k = 1) {
    const g = ctx.createRadialGradient(cx, y, 0, cx, y, w);
    g.addColorStop(0, `rgba(90,70,170,${0.28 * k})`);
    g.addColorStop(1, "rgba(90,70,170,0)");
    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(1, 0.22);
    ctx.translate(-cx, -y);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, y, w, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function slab(x, y, w, h, r, [light, base, shade]) {
    const depth = Math.min(h * 0.12, 14 * u);
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.roundRect(x, y + depth, w, h, r);
    ctx.fill();
    const g = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
    g.addColorStop(0, light);
    g.addColorStop(0.6, base);
    g.addColorStop(1, shade);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2.5 * u;
    ctx.beginPath();
    ctx.roundRect(x + 3 * u, y + 3 * u, w - 6 * u, h - 6 * u, Math.max(0, r - 3 * u));
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.ellipse(x + w * 0.22, y + h * 0.18, Math.min(w * 0.12, 30 * u), Math.min(h * 0.07, 10 * u), -0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  function ball(cx, cy, r, [light, base, shade]) {
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, light);
    g.addColorStop(0.55, base);
    g.addColorStop(1, shade);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = r * 0.08;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.92, Math.PI * 0.15, Math.PI * 0.75);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.35, cy - r * 0.42, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  function pill(s, cx, cy, size, clay, ink = "#FFFFFF", align = "center") {
    ctx.font = `800 ${Math.round(size * u)}px ${SANS9}`;
    const w = ctx.measureText(s).width + size * 1.3 * u;
    const h = size * 1.6 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    slab(left, cy - h / 2, w, h, h / 2, clay);
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + w / 2, cy + u);
  }
  return {
    surface() {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#F1ECFF");
      g.addColorStop(0.62, "#E6DEFA");
      g.addColorStop(1, "#F3EFFF");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, W * 0.55);
      glow.addColorStop(0, "rgba(255,248,230,0.6)");
      glow.addColorStop(1, "rgba(255,248,230,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      for (let i = 0;i < 9; i++) {
        const r = (6 + hash(i * 3) * 10) * u;
        const cx = X(hash(i * 1.7));
        const cy = Y(0.1 + hash(i * 2.9) * 0.85) + Math.sin(t * 1.3 + i) * 6 * u;
        ball(cx, cy, r, i % 3 === 0 ? BUTTER : i % 3 === 1 ? CLAY2.accent : CLAY2.ink);
      }
      ball(W * 0.95, H * 0.95, 70 * u, CLAY2.muted);
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 42, at = 0, align = "left" } = o;
      ctx.font = `800 ${Math.round(size * u)}px ${SANS9}`;
      const w = ctx.measureText(s).width + size * 1.4 * u;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      const h = size * 1.7 * u;
      dropped(left + w / 2, Y(y) + h / 2, at, () => {
        ctx.fillStyle = CLAY2.ink[2];
        trace(ctx, [
          [left + w * 0.18, Y(y) + h / 2 - 4 * u],
          [left + w * 0.12, Y(y) + h / 2 + 16 * u],
          [left + w * 0.32, Y(y) + h / 2 - 4 * u]
        ], true);
        ctx.fill();
        pill(s, left + w / 2, Y(y), size, CLAY2.ink);
      });
    },
    label(s, x, y, o = {}) {
      const tone = o.tone ?? "ink";
      const size = o.size ?? 32;
      dropped(X(x), Y(y) + size * 0.8 * u, o.at, () => pill(s, X(x), Y(y), size, CLAY2[tone === "muted" ? "ink" : tone], "#FFFFFF", o.align ?? "center"));
    },
    node(x, y, r, o = {}) {
      const R = r * u;
      dropped(X(x), Y(y) + R, o.at, () => ball(X(x), Y(y), R, CLAY2[o.tone ?? "accent"]), R * 1.2);
    },
    box(x, y, w, h, o = {}) {
      const tone = o.tone ?? "ink";
      dropped(X(x + w / 2), Y(y + h), o.at, () => {
        const pin = BUTTER;
        for (let i = 0;i < 5; i++) {
          const py = Y(y) + Y(h) * (0.18 + i * 0.16);
          slab(X(x) - 9 * u, py, 18 * u, 9 * u, 4 * u, pin);
          slab(X(x + w) - 9 * u, py, 18 * u, 9 * u, 4 * u, pin);
        }
        slab(X(x), Y(y), X(w), Y(h), 26 * u, tone === "good" ? CLAY2.good : CLAY2[tone]);
      }, X(w) * 0.55);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * expo(p))));
      const [light, base, shade] = CLAY2[tone === "accent" ? "muted" : tone];
      const wd = (head ? 12 : 4) * u;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      trace(ctx, shown.map(([a, b]) => [a, b + wd * 0.25]));
      ctx.strokeStyle = shade;
      ctx.lineWidth = wd;
      ctx.stroke();
      trace(ctx, shown);
      ctx.strokeStyle = base;
      ctx.lineWidth = wd * 0.85;
      ctx.stroke();
      trace(ctx, shown.map(([a, b]) => [a, b - wd * 0.2]));
      ctx.strokeStyle = alpha(light, 0.9);
      ctx.lineWidth = wd * 0.3;
      ctx.stroke();
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-4);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 20 * u;
        ctx.fillStyle = base;
        ctx.strokeStyle = shade;
        ctx.lineWidth = 4 * u;
        trace(ctx, [
          end,
          [end[0] - Math.cos(a - 0.6) * s, end[1] - Math.sin(a - 0.6) * s],
          [end[0] - Math.cos(a + 0.6) * s, end[1] - Math.sin(a + 0.6) * s]
        ], true);
        ctx.stroke();
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const rows = 4;
      const bh = Y(h) / rows;
      const bw = X(w) / 2;
      let k = 0;
      if (t >= at)
        contact(X(x + w / 2), Y(y + h) + 6 * u, X(w) * 0.8);
      for (let row = 0;row < rows; row++)
        for (let c = 0;c < 2; c++) {
          const off = row % 2 ? bw * 0.25 : 0;
          const bx = X(x) + c * bw + off - bw * 0.12;
          const by = Y(y + h) - (row + 1) * bh;
          const clay = (row + c) % 3 === 0 ? CLAY2.accent : (row + c) % 3 === 1 ? CLAY2.ink : CLAY2.muted;
          dropped(bx + bw / 2, by + bh, at + k++ / (rows * 2) * dur, () => slab(bx + 2 * u, by + 2 * u, bw - 4 * u, bh - 8 * u, 10 * u, clay));
        }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      const clay = tone === "ink" ? BUTTER : tone === "good" ? BUTTER : CLAY2[tone];
      const ink = tone === "ink" || tone === "good" ? "#8A5A12" : "#FFFFFF";
      dropped(X(x), Y(y) + size * 0.7 * u, at, () => {
        ctx.font = `900 ${Math.round(size * u)}px ${SANS9}`;
        const w = Math.max(ctx.measureText(`${value}0`).width, size * 2 * u);
        const h = size * 1.25 * u;
        slab(X(x) - w / 2, Y(y) - h / 2, w, h, h / 2.2, clay);
        ctx.fillStyle = ink;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(value, X(x), Y(y) + 2 * u);
      });
      if (sub) {
        const sz = size * 0.26;
        dropped(X(x), Y(y) - size * 0.9 * u, at + 0.15, () => pill(sub[0]?.toUpperCase() + sub.slice(1), X(x), Y(y) - size * 0.95 * u, sz, CLAY2.ink));
      }
    },
    mark(kind, x, y, o = {}) {
      const r = (o.size ?? 24) * u;
      dropped(X(x), Y(y) + r, o.at, () => {
        ball(X(x), Y(y), r, kind === "check" ? CLAY2.good : CLAY2.bad);
        const [cx, cy] = [X(x), Y(y)];
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = r * 0.24;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (kind === "check")
          trace(ctx, [
            [cx - r * 0.42, cy],
            [cx - r * 0.1, cy + r * 0.32],
            [cx + r * 0.45, cy - r * 0.3]
          ]);
        else
          trace(ctx, [
            [cx - r * 0.35, cy - r * 0.35],
            [cx + r * 0.35, cy + r * 0.35],
            [cx, cy],
            [cx + r * 0.35, cy - r * 0.35],
            [cx - r * 0.35, cy + r * 0.35]
          ]);
        ctx.stroke();
      });
    },
    finish() {}
  };
}
var soft_3d_default = {
  id: "soft-3d",
  name: "Soft 3D clay",
  category: "Dimensional",
  make: make62
};

// plugin/skills/motion-graphics/styles/spirograph.ts
var INK17 = {
  ink: "#2F4F45",
  accent: "#3E6A8A",
  good: "#2E6B4E",
  bad: "#C3303A",
  muted: "#8A9A8E"
};
var IRIS = ["#3F8A64", "#4568B0", "#C05A6C", "#C08F38", "#6A52A8"];
var SERIF12 = '"Didot", "Bodoni 72", "Georgia", "Times New Roman", serif';
var NUMBERING = '"Courier New", "Menlo", monospace';
function lathe(cx, cy, R, loops, depth, phase, n = 360) {
  const r = R / loops;
  const big = R - r;
  const d = r * (0.6 + depth);
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = i / n * Math.PI * 2;
    return [
      cx + big * Math.cos(a + phase) + d * Math.cos(big / r * a + phase),
      cy + big * Math.sin(a + phase) - d * Math.sin(big / r * a + phase)
    ];
  });
}
function make63(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__lathe ??= new Map;
  const cache = g.__lathe;
  function rope(c, a, b, half, color, p = 1) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    c.save();
    c.translate(a[0], a[1]);
    c.rotate(ang);
    c.strokeStyle = color;
    c.lineWidth = 0.8 * u;
    const L = len * p;
    for (const ph of [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]) {
      c.beginPath();
      for (let x = 0;x <= L; x += 2 * u) {
        const y = Math.sin(x / (6 * u) + ph) * half * 0.8;
        x ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
    c.lineWidth = 1.2 * u;
    c.beginPath();
    c.moveTo(0, -half);
    c.lineTo(L, -half);
    c.moveTo(0, half);
    c.lineTo(L, half);
    c.stroke();
    c.restore();
  }
  function note() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      const gr = b.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0, "#DCE6D6");
      gr.addColorStop(0.5, "#EEE8DA");
      gr.addColorStop(1, "#ECDCD0");
      b.fillStyle = gr;
      b.fillRect(0, 0, W, H);
      b.strokeStyle = "rgba(90,130,110,0.14)";
      b.lineWidth = 0.8 * u;
      for (let y = 0;y < H; y += 7 * u) {
        b.beginPath();
        for (let x = 0;x <= W; x += 6 * u) {
          const yy = y + Math.sin(x / (40 * u) + y / (30 * u)) * 5 * u;
          x ? b.lineTo(x, yy) : b.moveTo(x, yy);
        }
        b.stroke();
      }
      for (let i = 0;i < 160; i++) {
        b.strokeStyle = hash(i) > 0.5 ? "rgba(200,60,70,0.35)" : "rgba(60,90,170,0.35)";
        b.lineWidth = 0.8 * u;
        const x = hash(i * 1.3) * W;
        const y = hash(i * 2.9) * H;
        const a = hash(i * 4.1) * 6;
        b.beginPath();
        b.moveTo(x, y);
        b.quadraticCurveTo(x + 6 * u, y + 3 * u, x + Math.cos(a) * 12 * u, y + Math.sin(a) * 12 * u);
        b.stroke();
      }
      const f = 22 * u;
      const hb = 7 * u;
      const col = "rgba(60,105,88,0.9)";
      rope(b, [f, f], [W - f, f], hb, col);
      rope(b, [W - f, f], [W - f, H - f], hb, col);
      rope(b, [W - f, H - f], [f, H - f], hb, col);
      rope(b, [f, H - f], [f, f], hb, col);
      b.strokeStyle = "rgba(70,110,95,0.6)";
      b.lineWidth = u;
      b.strokeRect(f + hb + 6 * u, f + hb + 6 * u, W - 2 * (f + hb + 6 * u), H - 2 * (f + hb + 6 * u));
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  function engraved(tone) {
    const key = `eng:${tone}:${u}`;
    let tile = cache.get(key);
    if (!tile) {
      const n = Math.max(3, Math.round(4 * u));
      tile = new OffscreenCanvas(8, n);
      const c = tile.getContext("2d");
      c.fillStyle = INK17[tone];
      c.fillRect(0, 0, 8, Math.max(1, n * 0.62));
      cache.set(key, tile);
    }
    return ctx.createPattern(tile, "repeat");
  }
  function rosette(cx, cy, R, at, dur, passes = 3, loops = 18, iris = true) {
    if (t < at)
      return;
    ctx.save();
    ctx.lineWidth = 1.25 * u;
    for (let k = 0;k < passes; k++) {
      const p = progress(t, at + dur / passes * k * 0.8, dur / passes * 1.2);
      if (p <= 0)
        continue;
      const pts = lathe(cx, cy, R * (1 - k * 0.12), loops + k * 4, 0.3 + k * 0.15, k * 0.3 + t * 0.02 * (k % 2 ? -1 : 1), Math.round(220 + R / u));
      ctx.strokeStyle = iris ? IRIS[k % IRIS.length] : INK17.ink;
      trace(ctx, along(pts, p).points);
      ctx.stroke();
    }
    ctx.restore();
  }
  function engrave(s, x, y, o = {}) {
    const { at = 0, size = 30, tone = "ink", align = "left", spacing = 0.06, font = SERIF12 } = o;
    const p = expo(progress(t, at, o.dur ?? 0.5));
    if (p <= 0)
      return 0;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${font}`;
    ctx.letterSpacing = `${size * spacing * u}px`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.beginPath();
    ctx.rect(left - 6 * u, Y(y) - size * u, (w + 12 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = size >= 40 ? engraved(tone) : INK17[tone];
    ctx.fillText(s, left, Y(y));
    ctx.strokeStyle = INK17[tone];
    ctx.lineWidth = 0.8 * u;
    if (size >= 40)
      ctx.strokeText(s, left, Y(y));
    ctx.restore();
    return w;
  }
  function stamp(word, cx, cy, size, at, tone) {
    const p = progress(t, at, 0.18);
    if (p <= 0)
      return;
    const s = 1 + (1 - p) * 0.6;
    ctx.save();
    ctx.globalAlpha = 0.85 * p;
    ctx.translate(cx, cy);
    ctx.rotate(-0.12);
    ctx.scale(s, s);
    ctx.strokeStyle = INK17[tone];
    ctx.fillStyle = INK17[tone];
    ctx.lineWidth = 2.5 * u;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.6, size * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = u;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.45, size * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `700 ${Math.round(size * 0.45)}px ${NUMBERING}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(word, 0, 0);
    ctx.restore();
  }
  return {
    surface() {
      note();
    },
    title(s, o = {}) {
      const { x = 0.06, y = 0.15, size = 64, at = 0 } = o;
      if (t < at)
        return;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${SERIF12}`;
      ctx.letterSpacing = `${size * 0.06 * u}px`;
      const w = ctx.measureText(s.toUpperCase()).width;
      ctx.restore();
      const a = expo(progress(t, at, 0.4));
      const bx = X(x) - 18 * u;
      const by = Y(y) - size * 0.85 * u;
      const bw = (w + 36 * u) * a;
      const bh = size * 1.7 * u;
      ctx.save();
      ctx.fillStyle = "rgba(245,240,226,0.85)";
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = INK17.ink;
      ctx.lineWidth = 1.6 * u;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.lineWidth = 0.8 * u;
      ctx.strokeRect(bx + 5 * u, by + 5 * u, Math.max(0, bw - 10 * u), bh - 10 * u);
      ctx.restore();
      engrave("CERTIFICATE OF THE EXPLAINER RESERVE · SERIES A", x, y - size * 1.15 * u / H, {
        at: at + 0.2,
        size: 14,
        tone: "muted",
        spacing: 0.1
      });
      engrave(s.toUpperCase(), x, y, { ...o, at: at + 0.25, size, dur: o.dur ?? 0.6 });
    },
    label(s, x, y, o = {}) {
      engrave(s.toUpperCase(), x, y, { size: 28, align: "center", spacing: 0.12, ...o, dur: 0.35 });
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "accent" } = o;
      const [cx, cy, R] = [X(x), Y(y), r * u * 1.9];
      rosette(cx, cy, R, at, dur, 3, 14, tone !== "ink");
      const p = progress(t, at + dur * 0.6, 0.25);
      if (p <= 0)
        return;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.fillStyle = "#F2EDE0";
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK17[tone];
      ctx.lineWidth = u;
      ctx.stroke();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.7, tone = "ink" } = o;
      if (t < at)
        return;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      ctx.save();
      ctx.globalAlpha = progress(t, at, 0.3);
      ctx.fillStyle = "rgba(246,242,230,0.9)";
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
      const q = dur / 4;
      const col = INK17[tone];
      const hb = 5 * u;
      rope(ctx, [x0, y0], [x1, y0], hb, col, progress(t, at, q));
      rope(ctx, [x1, y0], [x1, y1], hb, col, progress(t, at + q, q));
      rope(ctx, [x1, y1], [x0, y1], hb, col, progress(t, at + 2 * q, q));
      rope(ctx, [x0, y1], [x0, y0], hb, col, progress(t, at + 3 * q, q));
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = along(shaft, p).points;
      ctx.save();
      ctx.strokeStyle = tone === "accent" ? alphaIris(0.55) : INK17[tone];
      if (!head) {
        ctx.lineWidth = 0.9 * u;
        trace(ctx, shown);
        ctx.stroke();
        ctx.restore();
        return;
      }
      ctx.lineWidth = 1.1 * u;
      for (const off of [-2.5 * u, 2.5 * u]) {
        const pts = shown.map((pt, i) => {
          const q = shown[Math.min(i + 1, shown.length - 1)];
          const r = shown[Math.max(i - 1, 0)];
          const a = Math.atan2(q[1] - r[1], q[0] - r[0]);
          return [pt[0] - Math.sin(a) * off, pt[1] + Math.cos(a) * off];
        });
        trace(ctx, pts);
        ctx.stroke();
      }
      if (p >= 1) {
        const end = shaft.at(-1);
        const prev = shaft.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 14 * u;
        ctx.fillStyle = INK17[tone];
        trace(ctx, [
          [end[0] + Math.cos(a) * 4 * u, end[1] + Math.sin(a) * 4 * u],
          [end[0] - Math.cos(a - 0.45) * s, end[1] - Math.sin(a - 0.45) * s],
          [end[0] - Math.cos(a + 0.45) * s, end[1] - Math.sin(a + 0.45) * s]
        ], true);
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      const [x0, y0, ww, hh] = [X(x), Y(y), X(w), Y(h)];
      const n = 4;
      for (let i = 0;i < n; i++) {
        const p = progress(t, at + dur / n * i, dur / n);
        if (p <= 0)
          continue;
        const cy = y0 + hh / n * (i + 0.5);
        rope(ctx, [x0, cy], [x0 + ww, cy], hh / n / 2 - 3 * u, IRIS[i % IRIS.length], p);
      }
      if (t >= at) {
        ctx.save();
        ctx.strokeStyle = INK17.ink;
        ctx.lineWidth = 1.4 * u;
        ctx.globalAlpha = progress(t, at, 0.3);
        ctx.strokeRect(x0 - 4 * u, y0 - 4 * u, ww + 8 * u, hh + 8 * u);
        ctx.restore();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      if (size >= 80) {
        rosette(X(x), Y(y), size * 1.9 * u, at, 1.4, 5, 30);
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "#EFE9DA";
        ctx.beginPath();
        ctx.arc(X(x), Y(y), size * 0.82 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        engrave(value, x, y, {
          at,
          dur: 0.01,
          size,
          tone: tone === "accent" ? "ink" : tone,
          align: "center",
          spacing: 0
        });
        if (sub)
          engrave(sub.toUpperCase(), x, y - size * 0.85 * u / H, {
            at: at + 0.3,
            size: 18,
            align: "center",
            spacing: 0.2
          });
        stamp("CERTIFIED", X(x), Y(y) + size * 1.25 * u, 46 * u, at + dur + 0.1, "bad");
      } else {
        engrave(value, x, y, {
          at,
          dur: 0.01,
          size,
          tone: "bad",
          align: "center",
          spacing: 0.1,
          font: NUMBERING
        });
        if (sub)
          engrave(sub.toUpperCase(), x, y - size * 0.8 * u / H, {
            at: at + 0.3,
            size: 16,
            align: "center"
          });
      }
    },
    mark(kind, x, y, o = {}) {
      const size = (o.size ?? 44) * u;
      stamp(kind === "check" ? "VERIFIED ✓" : "VOID ✕", X(x), Y(y), size, o.at ?? 0, kind === "check" ? "good" : "bad");
    },
    finish() {
      const c = t % 5 / 1.4;
      if (c > 1)
        return;
      const gx = -W * 0.3 + c * W * 1.6;
      ctx.save();
      const gl = ctx.createLinearGradient(gx - 120 * u, 0, gx + 120 * u, H * 0.3);
      gl.addColorStop(0, "rgba(255,255,255,0)");
      gl.addColorStop(0.5, `rgba(255,255,255,${0.18 * clamp(Math.sin(c * Math.PI))})`);
      gl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gl;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  };
}
var alphaIris = (a) => `rgba(99,128,184,${a})`;
var spirograph_default = {
  id: "spirograph",
  name: "Lathe guilloche",
  category: "Generative & Type",
  make: make63
};

// plugin/skills/motion-graphics/styles/stained-glass.ts
var LEAD2 = "#1B1714";
var GLASS = {
  ink: "#EDE3C4",
  accent: "#E2B62C",
  good: "#3E9C5A",
  bad: "#C2262E",
  muted: "#8CA0C8"
};
var PAINT2 = "#2A1E14";
var SERIF13 = '"Luminari", "Palatino", "Book Antiqua", Georgia, serif';
function make64(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__stainedWindow ??= new Map;
  function lit(at = 0, dur = 0.5) {
    const p = progress(t, at, dur);
    return { a: expo(p), flare: p > 0 && p < 1 ? Math.sin(p * Math.PI) : 0 };
  }
  function glass(color, a, flare, leadW = 5) {
    if (a <= 0)
      return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fill();
    if (flare > 0) {
      ctx.fillStyle = `rgba(255,250,230,${flare * 0.7})`;
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = LEAD2;
    ctx.lineWidth = leadW * u;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }
  function painted(s, x, y, size, align = "center") {
    ctx.font = `600 ${Math.round(size * u)}px ${SERIF13}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = PAINT2;
    ctx.fillText(s, x, y);
  }
  function banner(s, cx, cy, size, align, at, tone = "ink") {
    const { a, flare } = lit(at, 0.4);
    if (a <= 0)
      return;
    ctx.save();
    ctx.font = `600 ${Math.round(size * u)}px ${SERIF13}`;
    const w = ctx.measureText(s).width + size * 0.9 * u;
    ctx.restore();
    const h = size * 1.5 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    ctx.beginPath();
    ctx.rect(left, cy - h / 2, w, h);
    const fill = tone === "bad" ? "#F2C9CC" : tone === "good" ? "#D9EDD4" : GLASS.ink;
    glass(fill, a, flare, 4);
    ctx.save();
    ctx.globalAlpha = a;
    painted(s, left + w / 2, cy + 1 * u, size, "center");
    ctx.restore();
  }
  return {
    surface() {
      const key = `${W}x${H}`;
      let tile = g.__stainedWindow.get(key);
      if (!tile) {
        tile = new OffscreenCanvas(W, H);
        const c = tile.getContext("2d");
        c.fillStyle = "#6E6253";
        c.fillRect(0, 0, W, H);
        const bh = 40 * u;
        for (let row = 0;row * bh < H; row++) {
          for (let x = row % 2 ? -50 * u : 0;x < W; x += 100 * u) {
            const v = 95 + hash(row * 31 + x) * 25;
            c.fillStyle = `rgb(${v},${v * 0.88},${v * 0.74})`;
            c.fillRect(x + 2 * u, row * bh + 2 * u, 96 * u, bh - 4 * u);
          }
        }
        const [x0, x1, top, bot] = [W * 0.015, W * 0.985, H * 0.02, H * 0.975];
        const spring = top + (x1 - x0) * 0.12;
        const arch = () => {
          c.beginPath();
          c.moveTo(x0, bot);
          c.lineTo(x0, spring);
          c.quadraticCurveTo(x0, top, W / 2, top);
          c.quadraticCurveTo(x1, top, x1, spring);
          c.lineTo(x1, bot);
          c.closePath();
        };
        arch();
        c.fillStyle = LEAD2;
        c.fill();
        c.save();
        arch();
        c.clip();
        const s = 46 * u;
        const nx = Math.ceil(W / s) + 2;
        const ny = Math.ceil(H / s) + 2;
        const P = (i, j) => [
          (i + (hash(i * 7 + j * 131) - 0.5) * 0.7) * s,
          (j + (hash(i * 13 + j * 71 + 5) - 0.5) * 0.7) * s
        ];
        for (let j = -1;j < ny; j++) {
          for (let i = -1;i < nx; i++) {
            const k = i * 17 + j * 29;
            const q = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
            c.beginPath();
            for (const [n, [px, py]] of q.entries())
              n ? c.lineTo(px, py) : c.moveTo(px, py);
            c.closePath();
            const hue = 218 + hash(k) * 30;
            const light = 30 + hash(k + 1) * 22;
            const gr = c.createLinearGradient(q[0][0], q[0][1], q[2][0], q[2][1]);
            gr.addColorStop(0, `hsl(${hue},70%,${light + 8}%)`);
            gr.addColorStop(1, `hsl(${hue},75%,${light - 6}%)`);
            c.fillStyle = gr;
            c.fill();
            c.strokeStyle = LEAD2;
            c.lineWidth = 4 * u;
            c.stroke();
          }
        }
        const band = 18 * u;
        c.lineWidth = band;
        const cols = ["#C2262E", "#E2B62C", "#3E9C5A", "#C2262E"];
        c.setLineDash([band * 0.9, band * 0.25]);
        arch();
        c.strokeStyle = cols[0];
        c.stroke();
        c.lineDashOffset = band * 0.6;
        c.setLineDash([band * 0.4, band * 1.6]);
        c.strokeStyle = "#E2B62C";
        c.stroke();
        c.restore();
        c.setLineDash([]);
        arch();
        c.lineWidth = 8 * u;
        c.strokeStyle = "#4B4036";
        c.stroke();
        g.__stainedWindow.set(key, tile);
      }
      ctx.drawImage(tile, 0, 0);
      const lx = (t * 0.08 % 1.3 - 0.15) * W;
      const sun = ctx.createLinearGradient(lx - W * 0.25, 0, lx + W * 0.25, H);
      sun.addColorStop(0, "rgba(255,240,200,0)");
      sun.addColorStop(0.5, "rgba(255,240,200,0.12)");
      sun.addColorStop(1, "rgba(255,240,200,0)");
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, W, H);
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.085, size = 40, at = 0 } = o;
      ctx.save();
      ctx.font = `600 ${Math.round(size * u)}px ${SERIF13}`;
      const w = ctx.measureText(s).width + size * 0.9 * u;
      ctx.restore();
      const align = o.align ?? "left";
      banner(s, align === "left" ? X(x) : X(x), Y(y), size, align, at);
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 24, align = "center", tone = "ink" } = o;
      banner(s, X(x), Y(y), size, align, at, tone);
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const { a, flare } = lit(at, 0.4);
      if (a <= 0)
        return;
      const R = r * u;
      const [cx, cy] = [X(x), Y(y)];
      const n = 8;
      for (let i = 0;i < n; i++) {
        const a0 = i / n * Math.PI * 2;
        const a1 = (i + 1) / n * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, R, a0, a1);
        ctx.arc(cx, cy, R * 0.55, a1, a0, true);
        ctx.closePath();
        glass(i % 2 ? GLASS.bad : GLASS[tone], a, flare, 2.5);
      }
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2);
      glass("#8FC6E8", a, flare, 2.5);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const { a, flare } = lit(at, 0.5);
      if (a <= 0)
        return;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      ctx.beginPath();
      ctx.rect(x0, y0, bw, bh);
      glass(tone === "good" ? "#DDEBD3" : GLASS.ink, a, flare, 7);
      ctx.beginPath();
      ctx.rect(x0 + 10 * u, y0 + 10 * u, bw - 20 * u, bh - 20 * u);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = GLASS[tone === "ink" ? "accent" : tone];
      ctx.lineWidth = 5 * u;
      ctx.stroke();
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      const color = GLASS[tone === "ink" ? "accent" : tone];
      ctx.save();
      ctx.lineCap = "butt";
      ctx.lineJoin = "round";
      trace(ctx, shown);
      ctx.strokeStyle = LEAD2;
      ctx.lineWidth = (head ? 15 : 5) * u;
      ctx.stroke();
      if (head) {
        trace(ctx, shown);
        ctx.strokeStyle = color;
        ctx.lineWidth = 8 * u;
        ctx.stroke();
        for (let i = 4;i < shown.length - 1; i += 5) {
          const [a, b] = [shown[i - 1], shown[i]];
          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(b[0] + Math.cos(ang) * 6 * u, b[1] + Math.sin(ang) * 6 * u);
          ctx.lineTo(b[0] - Math.cos(ang) * 6 * u, b[1] - Math.sin(ang) * 6 * u);
          ctx.strokeStyle = LEAD2;
          ctx.lineWidth = 2.5 * u;
          ctx.stroke();
        }
      } else {
        trace(ctx, shown);
        ctx.strokeStyle = "rgba(245,215,120,0.85)";
        ctx.lineWidth = 2.5 * u;
        ctx.stroke();
      }
      ctx.restore();
      if (head && p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 22 * u;
        ctx.beginPath();
        ctx.moveTo(end[0] + Math.cos(ang) * 4 * u, end[1] + Math.sin(ang) * 4 * u);
        ctx.lineTo(end[0] - Math.cos(ang - 0.5) * s, end[1] - Math.sin(ang - 0.5) * s);
        ctx.lineTo(end[0] - Math.cos(ang + 0.5) * s, end[1] - Math.sin(ang + 0.5) * s);
        ctx.closePath();
        glass(color, 1, 0, 3);
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "muted" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const cx = (x0 + x1) / 2;
      const rx = (x1 - x0) / 2;
      const ry = rx * 0.3;
      const n = 4;
      const bandH = (y1 - y0 - 2 * ry) / n;
      for (let i = n - 1;i >= 0; i--) {
        const { a, flare } = lit(at + (n - 1 - i) * dur / (n + 1), 0.35);
        const top = y0 + ry + i * bandH;
        const pts = [
          ...ellipse(cx, top, rx, ry, 16, Math.PI, -0.5),
          ...ellipse(cx, top + bandH, rx, ry, 16, 0, 0.5)
        ];
        trace(ctx, pts, true);
        glass(i % 2 ? GLASS[tone] : "#5B78B8", a, flare, 4);
      }
      const { a, flare } = lit(at + dur * 0.8, 0.35);
      trace(ctx, ellipse(cx, y0 + ry, rx, ry, 30), true);
      glass(GLASS.accent, a, flare, 4);
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      const { a, flare } = lit(at, 0.4);
      if (a <= 0)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${SERIF13}`;
      const w = ctx.measureText(value).width;
      ctx.restore();
      if (sub) {
        const bw = Math.max(w, size * 2.2 * u) + 40 * u;
        const bh = size * 1.9 * u;
        ctx.beginPath();
        ctx.rect(X(x) - bw / 2, Y(y) - bh * 0.55, bw, bh);
        glass(GLASS.ink, a, flare, 7);
        ctx.save();
        ctx.globalAlpha = a;
        painted(sub, X(x), Y(y) - bh * 0.33, size * 0.32);
        painted(value, X(x), Y(y) + size * 0.12 * u, size);
        ctx.restore();
        const r = lit(at + dur + 0.1, 0.4);
        if (r.a > 0) {
          ctx.save();
          ctx.globalAlpha = r.a;
          trace(ctx, ellipse(X(x), Y(y) + size * 0.1 * u, w * 0.72, size * 0.62 * u, 40), true);
          ctx.strokeStyle = LEAD2;
          ctx.lineWidth = 14 * u;
          ctx.stroke();
          ctx.strokeStyle = r.flare > 0 ? "#FFE9A0" : GLASS.accent;
          ctx.lineWidth = 7 * u;
          ctx.stroke();
          ctx.restore();
        }
      } else {
        ctx.save();
        ctx.globalAlpha = a;
        painted(value, X(x), Y(y), size);
        ctx.restore();
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 34 } = o;
      const { a, flare } = lit(at, 0.35);
      if (a <= 0)
        return;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      const path = kind === "check" ? [
        [cx - s * 0.5, cy],
        [cx - s * 0.12, cy + s * 0.4],
        [cx + s * 0.6, cy - s * 0.5]
      ] : [
        [cx - s * 0.45, cy - s * 0.45],
        [cx + s * 0.45, cy + s * 0.45]
      ];
      const draw = (pp) => {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        trace(ctx, pp);
        ctx.strokeStyle = LEAD2;
        ctx.lineWidth = 14 * u;
        ctx.stroke();
        ctx.strokeStyle = flare > 0 ? "#FFFBE0" : kind === "check" ? GLASS.good : GLASS.bad;
        ctx.lineWidth = 8 * u;
        ctx.stroke();
        ctx.restore();
      };
      draw(path);
      if (kind === "cross")
        draw([
          [cx + s * 0.45, cy - s * 0.45],
          [cx - s * 0.45, cy + s * 0.45]
        ]);
    },
    finish() {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0;i < 4; i++) {
        const x = W * (0.1 + i * 0.22) + Math.sin(t * 0.3 + i) * 10 * u;
        const ray = ctx.createLinearGradient(x, 0, x + W * 0.2, H);
        ray.addColorStop(0, "rgba(255,240,200,0.07)");
        ray.addColorStop(1, "rgba(255,240,200,0)");
        ctx.fillStyle = ray;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 50 * u, 0);
        ctx.lineTo(x + W * 0.25, H);
        ctx.lineTo(x + W * 0.15, H);
        ctx.fill();
      }
      ctx.restore();
    }
  };
}
var stained_glass_default = {
  id: "stained-glass",
  name: "Cathedral glass",
  category: "Painterly",
  make: make64
};

// plugin/skills/motion-graphics/styles/sticky-notes.ts
var PAD = {
  ink: "#FFF27A",
  accent: "#FF9EC4",
  good: "#9BE08A",
  bad: "#FFB15E",
  muted: "#F7F5EE"
};
var PEN = {
  ink: "#1E1E24",
  accent: "#1E1E24",
  good: "#1F8A3A",
  bad: "#D62828",
  muted: "#5A5A66"
};
var PIN = ["#D62828", "#2B6CD6", "#2EA44F", "#F2B705"];
var HAND8 = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive';
function make65(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__corkBoard ??= new Map;
  let seed = 3;
  const slap = (at = 0) => spring(t, { start: at, stiffness: 320, damping: 16, from: 0, to: 1 });
  function pen(s, x, y, size, color, align = "center", p = 1) {
    if (p <= 0)
      return;
    ctx.save();
    ctx.font = `700 ${Math.round(size * u)}px ${HAND8}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 4 * u, y - size * u, (w + 8 * u) * clamp(p), size * 2 * u);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.fillText(s, left, y);
    ctx.restore();
  }
  function stroke(points, at, dur, color, width = 4) {
    seed++;
    const p = progress(t, at, dur);
    if (p <= 0)
      return null;
    const { points: drawn, angle } = along(roughen(points, 1 * u, seed * 7.3), p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    trace(ctx, drawn);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
    return { p, angle, end: drawn.at(-1) };
  }
  function pin(x, y, k) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(x + 4 * u, y + 5 * u, 8 * u, 6 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    const c = PIN[Math.floor(hash(k) * PIN.length)];
    const gr = ctx.createRadialGradient(x - 3 * u, y - 3 * u, 1, x, y, 9 * u);
    gr.addColorStop(0, "#FFFFFF");
    gr.addColorStop(0.3, c);
    gr.addColorStop(1, "#000000");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x, y, 8 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function note(cx, cy, w, h, color, at, k, pinned = true, lined = false) {
    const s = slap(at);
    if (s <= 0)
      return 0;
    const sc = 1 + (1 - s) * 0.35;
    ctx.save();
    ctx.globalAlpha = clamp(s * 3);
    ctx.translate(cx, cy);
    ctx.rotate((hash(k) - 0.5) * 0.08);
    ctx.scale(sc, sc);
    ctx.shadowColor = "rgba(40,20,0,0.35)";
    ctx.shadowBlur = 12 * u;
    ctx.shadowOffsetX = 3 * u;
    ctx.shadowOffsetY = (6 + (1 - s) * 20) * u;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, -h / 2);
    ctx.lineTo(w / 2, h / 2 - 8 * u);
    ctx.quadraticCurveTo(w / 2 - 2 * u, h / 2 - 2 * u, w / 2 - 12 * u, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(-w / 2, -h / 2, w, h * 0.18);
    const curl = ctx.createLinearGradient(w / 2 - 20 * u, h / 2 - 20 * u, w / 2, h / 2);
    curl.addColorStop(0, "rgba(0,0,0,0)");
    curl.addColorStop(1, "rgba(0,0,0,0.12)");
    ctx.fillStyle = curl;
    ctx.fillRect(w / 2 - 22 * u, h / 2 - 22 * u, 22 * u, 22 * u);
    if (lined) {
      ctx.strokeStyle = "rgba(80,120,200,0.35)";
      ctx.lineWidth = 1.2 * u;
      for (let ly = -h / 2 + h * 0.28;ly < h / 2; ly += 14 * u) {
        ctx.beginPath();
        ctx.moveTo(-w / 2, ly);
        ctx.lineTo(w / 2, ly);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(220,60,60,0.5)";
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2 + h * 0.22);
      ctx.lineTo(w / 2, -h / 2 + h * 0.22);
      ctx.stroke();
    }
    ctx.restore();
    if (pinned && s > 0.6)
      pin(cx, cy - h / 2 + 10 * u, k);
    return s;
  }
  return {
    surface() {
      const key = `${W}x${H}`;
      let tile = g.__corkBoard.get(key);
      if (!tile) {
        tile = new OffscreenCanvas(W, H);
        const c = tile.getContext("2d");
        c.fillStyle = "#C79A62";
        c.fillRect(0, 0, W, H);
        const n = Math.floor(W * H / (5 * u * 5 * u) / 3);
        for (let i = 0;i < n; i++) {
          const v = hash(i * 1.7);
          c.fillStyle = v < 0.35 ? "rgba(110,70,30,0.35)" : v < 0.7 ? "rgba(230,190,130,0.35)" : "rgba(80,50,20,0.25)";
          const s = (1 + hash(i * 3.1) * 3) * u;
          c.fillRect(hash(i * 5.3) * W, hash(i * 7.9) * H, s, s);
        }
        const v = c.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.75);
        v.addColorStop(0, "rgba(0,0,0,0)");
        v.addColorStop(1, "rgba(60,30,0,0.35)");
        c.fillStyle = v;
        c.fillRect(0, 0, W, H);
        const f = 14 * u;
        c.fillStyle = "#7A4E26";
        c.fillRect(0, 0, W, f);
        c.fillRect(0, H - f, W, f);
        c.fillRect(0, 0, f, H);
        c.fillRect(W - f, 0, f, H);
        c.strokeStyle = "rgba(0,0,0,0.3)";
        c.lineWidth = 2 * u;
        c.strokeRect(f, f, W - 2 * f, H - 2 * f);
        g.__corkBoard.set(key, tile);
      }
      ctx.drawImage(tile, 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 44, at = 0 } = o;
      if (t < at)
        return;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${HAND8}`;
      const tw = ctx.measureText(s.toUpperCase()).width;
      ctx.restore();
      const w = tw + 60 * u;
      const h = size * 2.4 * u;
      const cx = X(x) + w / 2;
      const cy = Y(y) + h * 0.2;
      if (note(cx, cy, w, h, "#FBFBF6", at, 11, false, true) <= 0)
        return;
      ctx.save();
      ctx.fillStyle = "rgba(235,225,190,0.75)";
      for (const sx of [-1, 1]) {
        ctx.save();
        ctx.translate(cx + sx * (w / 2 - 10 * u), cy - h / 2 + 2 * u);
        ctx.rotate(sx * 0.6);
        ctx.fillRect(-26 * u, -9 * u, 52 * u, 18 * u);
        ctx.restore();
      }
      ctx.restore();
      const wd = o.dur ?? 0.05 * s.length + 0.2;
      pen(s.toUpperCase(), X(x) + 30 * u, cy - h * 0.05, size, PEN.ink, "left", progress(t, at + 0.2, wd));
      stroke(curve([X(x) + 30 * u, cy + h * 0.28], [X(x) + 30 * u + tw, cy + h * 0.26], -0.03, 12), at + 0.2 + wd, 0.3, PEN.bad, 3);
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 32, tone = "ink", align = "center" } = o;
      pen(s, X(x), Y(y), size, PEN[tone], align, progress(t, at, o.dur ?? 0.04 * s.length + 0.15));
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const k = Math.round(x * 997 + y * 131);
      const colors = ["#FFF27A", "#9ED8F5", "#9BE08A", "#FFB15E", "#FF9EC4"];
      const c = tone === "accent" ? colors[k % colors.length] : PAD[tone];
      const s = r * 1.7 * u;
      if (note(X(x), Y(y), s, s, c, at, k, false) > 0.5) {
        ctx.save();
        ctx.strokeStyle = PEN.ink;
        ctx.lineWidth = 2.5 * u;
        ctx.beginPath();
        ctx.arc(X(x), Y(y) + 2 * u, s * 0.22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      note(X(x + w / 2), Y(y + h / 2), X(w), Y(h), PAD[tone], at, Math.round(x * 311 + y * 71));
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      if (!head) {
        const a = [X(x1), Y(y1)];
        const b = [X(x2), Y(y2)];
        const sag = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.08;
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag];
        const pts = Array.from({ length: 13 }, (_, i) => {
          const s = i / 12;
          return [
            (1 - s) ** 2 * a[0] + 2 * (1 - s) * s * mid[0] + s * s * b[0],
            (1 - s) ** 2 * a[1] + 2 * (1 - s) * s * mid[1] + s * s * b[1]
          ];
        });
        const p = progress(t, at, dur);
        if (p <= 0)
          return;
        const { points } = along(pts, p);
        ctx.save();
        trace(ctx, points);
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 2.5 * u;
        ctx.translate(2 * u, 3 * u);
        ctx.stroke();
        ctx.restore();
        ctx.save();
        trace(ctx, points);
        ctx.strokeStyle = "#C21F1F";
        ctx.lineWidth = 2 * u;
        ctx.stroke();
        ctx.restore();
        return;
      }
      const color = tone === "bad" ? PEN.bad : PEN.ink;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const r = stroke(shaft, at, dur, color, 4);
      if (r && r.p >= 1) {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const end = shaft.at(-1);
        const prev = shaft.at(-3);
        arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 18 * u);
        ctx.strokeStyle = color;
        ctx.lineWidth = 4 * u;
        ctx.stroke();
        ctx.restore();
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0 } = o;
      const cols = ["#FFF27A", "#9ED8F5", "#9BE08A", "#FFB15E", "#FF9EC4", "#9ED8F5"];
      const cw = X(w) / 2;
      const ch = Y(h) / 3;
      for (let i = 0;i < 6; i++) {
        const cx = X(x) + cw * (0.5 + i % 2) + (hash(i * 3) - 0.5) * 6 * u;
        const cy = Y(y) + ch * (0.5 + Math.floor(i / 2)) + (hash(i * 5) - 0.5) * 6 * u;
        if (note(cx, cy, cw * 0.92, ch * 0.92, cols[i], at + i * 0.1, i * 7 + 1, false) > 0.6) {
          pen(i % 3 === 1 ? "dog" : "cat", cx, cy + ch * 0.2, 13, "#2B4FB0");
        }
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      const color = tone === "good" ? PEN.good : PEN.ink;
      if (sub) {
        const w = size * 2.6 * u;
        const h = size * 2.3 * u;
        if (note(X(x), Y(y), w, h, PAD.ink, at, 77) <= 0)
          return;
        pen(sub.toUpperCase(), X(x), Y(y) - size * 0.6 * u, size * 0.3, PEN.ink, "center", progress(t, at + 0.2, 0.3));
        pen(value, X(x), Y(y) + size * 0.25 * u, size, color);
        const ring = curve([0, 0], [0, 0]);
        const pts = Array.from({ length: 40 }, (_, i) => {
          const a = -Math.PI * 0.6 + i / 39 * Math.PI * 2.15;
          return [
            X(x) + Math.cos(a) * size * 1.15 * u,
            Y(y) + size * 0.25 * u + Math.sin(a) * size * 0.62 * u
          ];
        });
        stroke(pts, at + dur + 0.1, 0.4, PEN.bad, 4);
      } else if (t >= at)
        pen(value, X(x), Y(y), size, color);
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 34 } = o;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check")
        stroke([
          [cx - s * 0.5, cy],
          [cx - s * 0.1, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5]
        ], at, dur, PEN.good, 5);
      else {
        stroke([
          [cx - s * 0.5, cy - s * 0.5],
          [cx + s * 0.5, cy + s * 0.5]
        ], at, dur / 2, PEN.bad, 5);
        stroke([
          [cx + s * 0.5, cy - s * 0.5],
          [cx - s * 0.5, cy + s * 0.5]
        ], at + dur / 2, dur / 2, PEN.bad, 5);
      }
    },
    finish() {}
  };
}
var sticky_notes_default = {
  id: "sticky-notes",
  name: "Sticky-note wall",
  category: "Illustration",
  make: make65
};

// plugin/skills/motion-graphics/styles/string-art.ts
var THREAD2 = {
  ink: "#F4EEDC",
  accent: "#F4EEDC",
  good: "#E9BC4C",
  bad: "#C8372D",
  muted: "#B9A27E"
};
var BURN = "#2B160B";
var KRAFT = "#D9B886";
var HAND9 = '"Bradley Hand", "Segoe Print", "Comic Sans MS", "Marker Felt", cursive';
var SEGMENTS = {
  "0": "abcdef",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgedc",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg"
};
function make66(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__stringArt ??= new Map;
  const cache = g.__stringArt;
  let ember = null;
  function board() {
    const key = `${W}x${H}`;
    let tex = cache.get(key);
    if (tex)
      return tex;
    tex = new OffscreenCanvas(W, H);
    const c = tex.getContext("2d");
    const base = c.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, "#7A4A2A");
    base.addColorStop(1, "#5E3720");
    c.fillStyle = base;
    c.fillRect(0, 0, W, H);
    for (let i = 0;i < 160; i++) {
      const y0 = hash(i * 1.37) * H;
      c.strokeStyle = hash(i * 2.1) > 0.5 ? `rgba(40,20,8,${0.08 + hash(i) * 0.12})` : `rgba(170,110,60,${0.05 + hash(i) * 0.08})`;
      c.lineWidth = (0.6 + hash(i * 3.3) * 2) * u;
      c.beginPath();
      for (let x = 0;x <= W; x += 16 * u) {
        const knot = Math.exp(-(((x - W * 0.62) / (W * 0.15)) ** 2)) * Math.sin(y0 / H * 9) * 40 * u;
        const y = y0 + Math.sin(x / (W * 0.25) + i) * 10 * u + knot;
        x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    }
    c.fillStyle = "rgba(25,12,5,0.45)";
    for (const y of [0.33, 0.66])
      c.fillRect(0, H * y, W, 2 * u);
    const v = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.35)");
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
    cache.set(key, tex);
    return tex;
  }
  function nail(x, y, at, size = 3.2) {
    const p = progress(t, at, 0.12);
    if (p <= 0)
      return;
    const r = size * u * (1 + (1 - p) * 0.8);
    ctx.fillStyle = "rgba(20,10,4,0.45)";
    ctx.beginPath();
    ctx.arc(x + r * 0.5, y + r * 0.6, r, 0, Math.PI * 2);
    ctx.fill();
    const gr = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    gr.addColorStop(0, "#FFF0B8");
    gr.addColorStop(0.5, "#C9A24A");
    gr.addColorStop(1, "#6E5320");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function thread(a, b, p, color, width = 1.3) {
    if (p <= 0)
      return;
    const e = [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(20,8,2,0.35)";
    ctx.lineWidth = width * u;
    ctx.beginPath();
    ctx.moveTo(a[0] + 2 * u, a[1] + 3 * u);
    ctx.lineTo(e[0] + 2 * u, e[1] + 3 * u);
    ctx.stroke();
    ctx.strokeStyle = alpha(color, 0.92);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(e[0], e[1]);
    ctx.stroke();
  }
  function wind(chords, at, dur, color, width = 1.3) {
    const n = chords.length;
    for (const [i, [a, b]] of chords.entries())
      thread(a, b, clamp((t - at) / dur * n - i), color, width);
  }
  function burn(s, x, y, size, at, o = {}) {
    const { align = "left", color = BURN } = o;
    const dur = o.dur ?? 0.04 * s.length + 0.2;
    const p = progress(t, at, dur);
    if (p <= 0)
      return 0;
    ctx.save();
    ctx.font = `italic 700 ${Math.round(size * u)}px ${HAND9}`;
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 4 * u, y - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(255,150,60,0.25)";
    ctx.shadowBlur = 3 * u;
    ctx.fillText(s, left, y);
    ctx.restore();
    if (p < 1)
      ember = [left + w * p, y];
    return w;
  }
  function tag(s, cx, cy, size, tone, at, align = "center") {
    const p = progress(t, at, 0.2);
    if (p <= 0)
      return;
    ctx.save();
    ctx.font = `italic 700 ${Math.round(size * u)}px ${HAND9}`;
    const w = ctx.measureText(s).width + size * 1.1 * u;
    const h = size * 1.6 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    ctx.translate(cx, cy - h / 2);
    ctx.rotate((hash(cx + cy) - 0.5) * 0.06 + (1 - expo(p)) * 0.25);
    ctx.translate(-cx, -(cy - h / 2));
    ctx.globalAlpha = clamp(p * 3);
    ctx.fillStyle = "rgba(20,8,2,0.4)";
    ctx.fillRect(left + 3 * u, cy - h / 2 + 4 * u, w, h);
    ctx.fillStyle = tone === "bad" ? "#C0392B" : KRAFT;
    ctx.fillRect(left, cy - h / 2, w, h);
    ctx.fillStyle = tone === "bad" ? "#FBE9D8" : BURN;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left + w / 2, cy + 2 * u);
    ctx.restore();
    nail(cx, cy - h / 2 + 4 * u, at, 2.6);
  }
  function digits(s, cx, cy, size, at, color) {
    const dw = size * 0.5 * u;
    const dh = size * u;
    const gap = size * 0.16 * u;
    const width = [...s].reduce((sum, ch) => sum + (ch in SEGMENTS ? dw + gap : ch === "%" ? dw + gap : gap * 0.8), 0);
    let x = cx - width / 2;
    const top = cy - dh / 2;
    for (const [k, ch] of [...s].entries()) {
      const when = at + k * 0.05;
      if (ch in SEGMENTS) {
        const P = {
          a: [
            [x, top],
            [x + dw, top]
          ],
          b: [
            [x + dw, top],
            [x + dw, top + dh / 2]
          ],
          c: [
            [x + dw, top + dh / 2],
            [x + dw, top + dh]
          ],
          d: [
            [x, top + dh],
            [x + dw, top + dh]
          ],
          e: [
            [x, top + dh / 2],
            [x, top + dh]
          ],
          f: [
            [x, top],
            [x, top + dh / 2]
          ],
          g: [
            [x, top + dh / 2],
            [x + dw, top + dh / 2]
          ]
        };
        for (const seg of SEGMENTS[ch]) {
          const [a, b] = P[seg];
          for (let w = 0;w < 3; w++)
            thread([a[0], a[1] + (w - 1) * u], [b[0], b[1] + (w - 1) * u], progress(t, when, 0.2), color, 1.6);
        }
        for (const pt of [
          [x, top],
          [x + dw, top],
          [x, top + dh / 2],
          [x + dw, top + dh / 2],
          [x, top + dh],
          [x + dw, top + dh]
        ])
          nail(pt[0], pt[1], when, 2.4);
        x += dw + gap;
      } else if (ch === "%") {
        thread([x + dw, top], [x, top + dh], progress(t, when, 0.2), color, 2);
        for (const [rx, ry] of [
          [x + dw * 0.2, top + dh * 0.2],
          [x + dw * 0.8, top + dh * 0.8]
        ]) {
          const ring = Array.from({ length: 6 }, (_, i) => [
            rx + Math.cos(i / 6 * Math.PI * 2) * dw * 0.18,
            ry + Math.sin(i / 6 * Math.PI * 2) * dw * 0.18
          ]);
          wind(ring.map((p, i) => [p, ring[(i + 2) % 6]]), when, 0.2, color, 1.2);
          for (const p of ring)
            nail(p[0], p[1], when, 1.8);
        }
        x += dw + gap;
      } else {
        if (ch === ",")
          nail(x, top + dh, when, 2.8);
        x += gap * 0.8;
      }
    }
    return width;
  }
  return {
    surface() {
      ember = null;
      ctx.drawImage(board(), 0, 0);
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 44, at = 0, align = "left" } = o;
      burn(s, X(x), Y(y), size, at, { align, dur: o.dur });
    },
    label(s, x, y, o = {}) {
      tag(s, X(x), Y(y), o.size ?? 26, o.tone ?? "ink", o.at ?? 0, o.align ?? "center");
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      if (t < at)
        return;
      const R = r * u;
      const n = 10;
      const ring = Array.from({ length: n }, (_, i) => {
        const a = i / n * Math.PI * 2 - Math.PI / 2;
        return [X(x) + Math.cos(a) * R, Y(y) + Math.sin(a) * R];
      });
      wind(ring.map((p, i) => [p, ring[(i + 4) % n]]), at + 0.12, dur, THREAD2[tone === "accent" ? "good" : tone], 1);
      for (const [i, p] of ring.entries())
        nail(p[0], p[1], at + i * 0.012, 2.2);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "ink" } = o;
      if (t < at)
        return;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const col = THREAD2[tone];
      const k = 6;
      const chords = [
        [
          [x0, y0],
          [x1, y0]
        ],
        [
          [x1, y0],
          [x1, y1]
        ],
        [
          [x1, y1],
          [x0, y1]
        ],
        [
          [x0, y1],
          [x0, y0]
        ]
      ];
      for (let i = 1;i < k; i++) {
        const f = i / k;
        chords.push([
          [x0, y0 + (y1 - y0) * f * 0.5],
          [x0 + (x1 - x0) * (0.5 - f * 0.5) * 0.9, y0]
        ]);
        chords.push([
          [x1, y1 - (y1 - y0) * f * 0.5],
          [x1 - (x1 - x0) * (0.5 - f * 0.5) * 0.9, y1]
        ]);
      }
      wind(chords, at + 0.15, dur, col, 1.2);
      for (const [i, p] of [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1]
      ].entries())
        nail(p[0], p[1], at + i * 0.04);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const a = [X(x1), Y(y1)];
      const b = [X(x2), Y(y2)];
      const col = THREAD2[tone === "accent" ? "ink" : tone];
      if (!head) {
        thread(a, b, expo(p), col, 1);
        return;
      }
      const pts = bend ? curve(a, b, bend, 6) : [a, b];
      const segs = pts.length - 1;
      for (let i = 0;i < segs; i++)
        thread(pts[i], pts[i + 1], clamp(p * segs - i), col, 1.6);
      for (const [i, q] of pts.entries())
        if (i === 0 || bend)
          nail(q[0], q[1], at + i / pts.length * dur, 2.4);
      if (p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-2);
        const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 14 * u;
        for (const side of [-1, 1]) {
          const q = [
            end[0] - Math.cos(ang + side * 0.5) * s,
            end[1] - Math.sin(ang + side * 0.5) * s
          ];
          thread(q, end, 1, col, 1.6);
          nail(q[0], q[1], at + dur, 2.2);
        }
        nail(end[0], end[1], at + dur, 2.6);
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9, tone = "ink" } = o;
      if (t < at)
        return;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const n = 9;
      const left = Array.from({ length: n }, (_, i) => [x0, y0 + (y1 - y0) * i / (n - 1)]);
      const right = Array.from({ length: n }, (_, i) => [x1, y0 + (y1 - y0) * i / (n - 1)]);
      const chords = [];
      for (let i = 0;i < n; i++)
        chords.push([left[i], right[n - 1 - i]]);
      for (let i = 0;i < n - 1; i++)
        chords.push([left[i], left[i + 1]], [right[i], right[i + 1]]);
      wind(chords, at + 0.25, dur, THREAD2[tone === "accent" ? "good" : tone], 1.2);
      for (const [i, p] of [...left, ...right].entries())
        nail(p[0], p[1], at + i % n * 0.025);
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const col = tone === "ink" || tone === "accent" ? THREAD2.good : THREAD2[tone];
      digits(value, X(x), Y(y), size * 0.85, at, col);
      if (sub)
        tag(sub, X(x), Y(y) - size * 0.85 * u, size * 0.28, "ink", at + 0.1);
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 24) * u;
      const at = o.at ?? 0;
      if (t < at)
        return;
      const [cx, cy] = [X(x), Y(y)];
      const pts = kind === "check" ? [
        [cx - s * 0.5, cy],
        [cx - s * 0.12, cy + s * 0.42],
        [cx + s * 0.6, cy - s * 0.5]
      ] : [
        [cx - s * 0.45, cy - s * 0.45],
        [cx + s * 0.45, cy + s * 0.45],
        [cx + s * 0.45, cy - s * 0.45],
        [cx - s * 0.45, cy + s * 0.45]
      ];
      const col = kind === "check" ? THREAD2.good : THREAD2.bad;
      const chords = kind === "check" ? [
        [pts[0], pts[1]],
        [pts[1], pts[2]]
      ] : [
        [pts[0], pts[1]],
        [pts[2], pts[3]]
      ];
      for (let w = 0;w < 3; w++)
        wind(chords.map(([a, b]) => [
          [a[0], a[1] + (w - 1) * u],
          [b[0], b[1] + (w - 1) * u]
        ]), at + 0.1, 0.25, col, 1.8);
      for (const p of pts)
        nail(p[0], p[1], at, 2.6);
    },
    finish() {
      if (!ember)
        return;
      const [x, y] = ember;
      const gl = ctx.createRadialGradient(x, y, 0, x, y, 18 * u);
      gl.addColorStop(0, "rgba(255,240,180,1)");
      gl.addColorStop(0.25, "rgba(255,140,40,0.85)");
      gl.addColorStop(1, "rgba(255,90,20,0)");
      ctx.fillStyle = gl;
      ctx.fillRect(x - 18 * u, y - 18 * u, 36 * u, 36 * u);
    }
  };
}
var string_art_default = {
  id: "string-art",
  name: "String art",
  category: "Generative & Type",
  make: make66
};

// plugin/skills/motion-graphics/styles/sumi-e.ts
var PAPER10 = "#EEE6D3";
var SEAL = "#B8322A";
var INK18 = {
  ink: "#1C1B19",
  accent: "#2C3A4E",
  good: "#2F4A34",
  bad: SEAL,
  muted: "#8A857B"
};
var SERIF14 = '"Cormorant Garamond", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
function make67(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__sumiPaper ??= new Map;
  const cache = g.__sumiPaper;
  let seed = 3;
  function paper() {
    const key = `${W}x${H}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      c.fillStyle = PAPER10;
      c.fillRect(0, 0, W, H);
      for (let i = 0;i < 40; i++) {
        const r = (80 + hash(i * 5.1) * 260) * u;
        const gr = c.createRadialGradient(hash(i) * W, hash(i + 2) * H, 0, hash(i) * W, hash(i + 2) * H, r);
        gr.addColorStop(0, `rgba(160,140,105,${0.05 + hash(i + 4) * 0.05})`);
        gr.addColorStop(1, "rgba(160,140,105,0)");
        c.fillStyle = gr;
        c.fillRect(0, 0, W, H);
      }
      c.lineWidth = Math.max(0.6, 0.8 * u);
      for (let i = 0;i < 900; i++) {
        const x = hash(i * 1.3) * W;
        const y = hash(i * 2.9 + 1) * H;
        const a = hash(i * 3.7) * Math.PI;
        const l = (6 + hash(i * 4.1) * 22) * u;
        c.strokeStyle = `rgba(120,100,70,${0.06 + hash(i) * 0.08})`;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 3 * u, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
        c.stroke();
      }
      for (const [base, tone, amp, s] of [
        [0.8, 0.13, 0.12, 1],
        [0.88, 0.2, 0.08, 7]
      ]) {
        c.save();
        c.filter = `blur(${6 * u}px)`;
        const pts = [];
        for (let i = 0;i <= 40; i++) {
          const x = i / 40 * W;
          const ridge = Math.sin(i * 0.35 + s) * 0.5 + Math.sin(i * 0.9 + s * 2) * 0.3 + hash(i + s) * 0.2;
          pts.push([x, H * (base - amp * Math.max(0, ridge))]);
        }
        trace(c, [...pts, [W, H], [0, H]], true);
        const gr = c.createLinearGradient(0, H * (base - amp), 0, H);
        gr.addColorStop(0, `rgba(60,58,52,${tone})`);
        gr.addColorStop(1, "rgba(60,58,52,0)");
        c.fillStyle = gr;
        c.fill();
        c.restore();
      }
      cache.set(key, tile);
    }
    ctx.drawImage(tile, 0, 0);
  }
  function brush(points, { at = 0, dur = 0.5, tone = "ink", width = 10, dry = 0.35 } = {}) {
    seed += 1;
    const p = progress(t, at, dur);
    if (p <= 0)
      return;
    const ease = 1 - (1 - p) ** 2;
    const rough = roughen(densify(points, 6 * u), 0.8 * u, seed * 7.3);
    const { points: drawn } = along(rough, ease);
    const n = rough.length - 1;
    const col = INK18[tone];
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1;i < drawn.length; i++) {
      const s = i / n;
      const a = drawn[i - 1];
      const b = drawn[i];
      const press = Math.min(1, s * 6);
      const w = width * 1.5 * u * (0.55 + 0.45 * press) * (1 - 0.45 * s);
      const nx = -(b[1] - a[1]);
      const ny = b[0] - a[0];
      const nl = Math.hypot(nx, ny) || 1;
      if (s < 1 - dry) {
        ctx.strokeStyle = alpha(col, 0.9);
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      } else {
        const k = (s - (1 - dry)) / dry;
        for (let h = 0;h < 6; h++) {
          if (hash(seed * 3 + h * 11 + i * 1.7) < k * 0.7)
            continue;
          const off = (h - 2.5) / 2.5 * w * 0.5;
          ctx.strokeStyle = alpha(col, 0.75 - k * 0.3);
          ctx.lineWidth = Math.max(0.8, w / 6 * (1.2 - k * 0.6));
          ctx.beginPath();
          ctx.moveTo(a[0] + nx / nl * off, a[1] + ny / nl * off);
          ctx.lineTo(b[0] + nx / nl * off, b[1] + ny / nl * off);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
  function wash(cx, cy, r, at, tone = "ink", strength = 0.18) {
    const p = progress(t, at, 0.8);
    if (p <= 0)
      return;
    const rr = r * (0.4 + 0.6 * (1 - (1 - p) ** 3));
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
    gr.addColorStop(0, alpha(INK18[tone], strength * p));
    gr.addColorStop(0.7, alpha(INK18[tone], strength * 0.6 * p));
    gr.addColorStop(1, alpha(INK18[tone], 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  function write(s, x, y, size, o = {}) {
    const { at = 0, tone = "ink", align = "left", italic = true } = o;
    const dur = o.dur ?? 0.04 * s.length + 0.2;
    const p = progress(t, at, dur);
    if (p <= 0)
      return;
    ctx.save();
    ctx.font = `${italic ? "italic " : ""}500 ${Math.round(size * u)}px ${SERIF14}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 6 * u, y - size * u, (w + 12 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = INK18[tone];
    const bleed = 1 - progress(t, at + dur * 0.6, 0.5);
    if (bleed > 0) {
      ctx.shadowColor = alpha(INK18[tone], 0.5 * bleed);
      ctx.shadowBlur = 8 * u * bleed;
    }
    ctx.fillText(s, left, y);
    ctx.restore();
    return { left, w };
  }
  function seal(cx, cy, s, at) {
    const p = progress(t, at, 0.25);
    if (p <= 0)
      return;
    const k = 1 + 0.25 * (1 - p);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.rotate(-0.03);
    ctx.globalAlpha = Math.min(1, p * 1.5) * 0.92;
    ctx.fillStyle = SEAL;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeStyle = PAPER10;
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.lineCap = "square";
    ctx.beginPath();
    ctx.moveTo(-s * 0.25, -s * 0.2);
    ctx.lineTo(s * 0.25, -s * 0.2);
    ctx.moveTo(0, -s * 0.3);
    ctx.lineTo(0, s * 0.3);
    ctx.moveTo(-s * 0.22, s * 0.05);
    ctx.lineTo(-s * 0.05, s * 0.25);
    ctx.moveTo(s * 0.22, s * 0.05);
    ctx.lineTo(s * 0.05, s * 0.25);
    ctx.stroke();
    ctx.restore();
  }
  return {
    surface() {
      paper();
      ctx.save();
      for (let i = 0;i < 3; i++) {
        const x = (t * 18 * u + i * W * 0.45) % (W * 1.4) - W * 0.2;
        const y = H * (0.55 + i * 0.12);
        const gr = ctx.createRadialGradient(x, y, 0, x, y, 260 * u);
        gr.addColorStop(0, "rgba(250,247,240,0.45)");
        gr.addColorStop(1, "rgba(250,247,240,0)");
        ctx.fillStyle = gr;
        ctx.fillRect(x - 300 * u, y - 300 * u, 600 * u, 600 * u);
      }
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.09, size = 64, at = 0, tone = "ink", align = "left" } = o;
      const dur = o.dur ?? 0.04 * s.length + 0.2;
      const r = write(s, X(x), Y(y), size, { at, dur, tone, align });
      if (r)
        seal(r.left + r.w + size * 0.5 * u, Y(y) - size * 0.1 * u, size * 0.42 * u, at + dur);
    },
    label(s, x, y, o = {}) {
      write(s, X(x), Y(y), o.size ?? 36, {
        at: o.at ?? 0,
        dur: o.dur,
        tone: o.tone ?? "ink",
        align: o.align ?? "center"
      });
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.35, tone = "ink" } = o;
      const R = r * u;
      wash(X(x), Y(y), R * 1.1, at + dur * 0.5, tone, 0.12);
      const start = -Math.PI * 0.6 + hash(x * 9 + y * 7) * 0.8;
      brush(ellipse(X(x), Y(y), R, R * 0.96, 30, start, 0.9), {
        at,
        dur,
        tone,
        width: Math.max(4, r * 0.32),
        dry: 0.3
      });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "ink" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const p = progress(t, at, 0.4);
      if (p > 0) {
        ctx.fillStyle = `rgba(250,246,236,${0.75 * p})`;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
      const step = dur / 4;
      brush([
        [x0, y0],
        [x1, y0 + 2 * u]
      ], { at, dur: step, tone, width: 7 });
      brush([
        [x1, y0],
        [x1 - 2 * u, y1]
      ], { at: at + step, dur: step, tone, width: 7 });
      brush([
        [x1, y1],
        [x0, y1 - u]
      ], { at: at + step * 2, dur: step, tone, width: 7 });
      brush([
        [x0, y1],
        [x0 + u, y0]
      ], { at: at + step * 3, dur: step, tone, width: 7 });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const thin = tone === "accent" && !head;
      brush(pts, { at, dur, tone, width: thin ? 2.6 : 6, dry: thin ? 0.15 : 0.4 });
      if (!head)
        return;
      const end = pts.at(-1);
      const prev = pts.at(-4);
      const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      const s = 18 * u;
      brush([[end[0] - Math.cos(a - 0.55) * s, end[1] - Math.sin(a - 0.55) * s], end], {
        at: at + dur,
        dur: 0.1,
        tone,
        width: 4,
        dry: 0.2
      });
      brush([end, [end[0] - Math.cos(a + 0.55) * s, end[1] - Math.sin(a + 0.55) * s]], {
        at: at + dur + 0.08,
        dur: 0.1,
        tone,
        width: 4,
        dry: 0.5
      });
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "ink" } = o;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const top = Y(y) + rx * 0.25;
      const bottom = Y(y + h) - rx * 0.25;
      wash(cx, (top + bottom) / 2, Math.max(rx, (bottom - top) / 2) * 1.05, at + dur * 0.3, tone, 0.14);
      const step = dur / 4;
      brush(ellipse(cx, top, rx, rx * 0.25, 28, Math.PI, 1), {
        at,
        dur: step,
        tone,
        width: 5,
        dry: 0.2
      });
      brush([
        [cx - rx, top],
        [cx - rx * 0.96, bottom]
      ], { at: at + step, dur: step, tone, width: 8 });
      brush(ellipse(cx, bottom, rx, rx * 0.25, 20, Math.PI, -0.5), {
        at: at + step * 2,
        dur: step,
        tone,
        width: 7
      });
      brush([
        [cx + rx, bottom],
        [cx + rx * 0.98, top]
      ], { at: at + step * 3, dur: step, tone, width: 7, dry: 0.5 });
      for (const f of [0.38, 0.66]) {
        const yy = lerpN(top, bottom, f);
        brush(ellipse(cx, yy, rx, rx * 0.25, 18, Math.PI, -0.5), {
          at: at + dur * f,
          dur: step,
          tone,
          width: 3,
          dry: 0.5
        });
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      write(value, X(x), Y(y), size, { at, dur: 0.15, tone, align: "center", italic: false });
      if (sub)
        write(sub, X(x), Y(y) + size * 0.72 * u, size * 0.36, {
          at: at + 0.3,
          tone: "ink",
          align: "center"
        });
      if (count && sub) {
        ctx.save();
        ctx.font = `500 ${Math.round(size * u)}px ${SERIF14}`;
        const w = ctx.measureText(value).width;
        ctx.restore();
        seal(X(x) + w / 2 + size * 0.35 * u, Y(y) - size * 0.2 * u, size * 0.3 * u, at + dur);
      }
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const [cx, cy] = [X(x), Y(y)];
      const at = o.at ?? 0;
      if (kind === "check") {
        brush([
          [cx - s * 0.5, cy - s * 0.05],
          [cx - s * 0.15, cy + s * 0.35]
        ], { at, dur: 0.12, tone: o.tone ?? "ink", width: 7, dry: 0 });
        brush([
          [cx - s * 0.15, cy + s * 0.35],
          [cx + s * 0.25, cy - s * 0.2],
          [cx + s * 0.6, cy - s * 0.55]
        ], { at: at + 0.12, dur: 0.22, tone: o.tone ?? "ink", width: 6, dry: 0.5 });
      } else {
        brush([
          [cx - s * 0.5, cy - s * 0.5],
          [cx + s * 0.5, cy + s * 0.5]
        ], { at, dur: 0.15, tone: o.tone ?? "bad", width: 8 });
        brush([
          [cx + s * 0.5, cy - s * 0.5],
          [cx - s * 0.5, cy + s * 0.5]
        ], { at: at + 0.15, dur: 0.15, tone: o.tone ?? "bad", width: 8 });
      }
    },
    finish() {
      const gr = ctx.createLinearGradient(0, 0, W, 0);
      gr.addColorStop(0, "rgba(120,95,60,0.14)");
      gr.addColorStop(0.06, "rgba(120,95,60,0)");
      gr.addColorStop(0.94, "rgba(120,95,60,0)");
      gr.addColorStop(1, "rgba(120,95,60,0.14)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }
  };
}
function densify(points, step) {
  const out = [points[0]];
  for (let i = 1;i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const k = Math.max(1, Math.min(24, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)));
    for (let j = 1;j <= k; j++)
      out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
  }
  return out;
}
var lerpN = (a, b, f) => a + (b - a) * f;
var sumi_e_default = { id: "sumi-e", name: "Ink wash", category: "Painterly", make: make67 };

// plugin/skills/motion-graphics/styles/swiss-grid.ts
var PAPER11 = "#EFEEEA";
var BLACK10 = "#111111";
var RED8 = "#E1251B";
var TONE15 = {
  ink: BLACK10,
  accent: BLACK10,
  good: BLACK10,
  bad: RED8,
  muted: "#8C8C88"
};
var GROTESK = '"Helvetica Neue", "Neue Haas Grotesk Display Pro", Helvetica, Arial, sans-serif';
function make68(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const font = (size, w = 700) => `${w} ${Math.round(size * u)}px ${GROTESK}`;
  const ease = (at = 0, dur = 0.5) => expo(progress(t, at, dur));
  function rise(s, x, y, size, at, dur, color, align = "left", w = 700) {
    const p = ease(at, dur);
    if (p <= 0)
      return;
    ctx.save();
    ctx.font = font(size, w);
    ctx.letterSpacing = `${Math.round(-size * 0.03 * u)}px`;
    const tw = ctx.measureText(s).width;
    const left = align === "center" ? x - tw / 2 : align === "right" ? x - tw : x;
    ctx.beginPath();
    ctx.rect(left - 10 * u, y - size * 0.9 * u, tw + 20 * u, size * 1.15 * u);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(s, left, y + (1 - p) * size * u);
    ctx.restore();
  }
  function rule(x1, y1, x2, p, w = 1.5, color = BLACK10) {
    if (p <= 0)
      return;
    ctx.fillStyle = color;
    ctx.fillRect(x1, y1, (x2 - x1) * p, w * u);
  }
  return {
    surface() {
      ctx.fillStyle = PAPER11;
      ctx.fillRect(0, 0, W, H);
      const gp = ease(0, 0.9);
      ctx.fillStyle = "rgba(17,17,17,0.08)";
      for (let c = 0;c <= 12; c++)
        ctx.fillRect(X(0.03 + 0.94 / 12 * c), 0, 1 * u, H * gp);
      rule(X(0.03), Y(0.035), X(0.97), ease(0, 0.8), 2);
      const d = ease(0.2, 0.7);
      if (d > 0) {
        const [cx, cy] = [X(0.9), Y(0.16)];
        ctx.beginPath();
        ctx.arc(cx, cy, 58 * u * d, 0, Math.PI * 2);
        ctx.fillStyle = RED8;
        ctx.fill();
        ctx.strokeStyle = BLACK10;
        ctx.lineCap = "butt";
        for (let i = 0;i < 4; i++) {
          const settle = expo(progress(t, 0.4 + i * 0.15, 1.6));
          const base = Math.round(hash(i * 3.7) * 16) * (Math.PI / 8);
          const a = base + (1 - settle) * (2 + i) + Math.sin(t * 0.4 + i) * 0.04;
          ctx.lineWidth = (7 - i) * u;
          ctx.beginPath();
          ctx.arc(cx + 10 * u, cy - 6 * u, (32 + i * 13) * u, a, a + Math.PI * (0.5 + hash(i) * 0.5));
          ctx.stroke();
        }
      }
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.15, size = 84, at = 0, dur = 0.7, align = "left" } = o;
      rise(s, X(x), Y(y), size, at, dur, BLACK10, align);
    },
    label(s, x, y, o = {}) {
      const { size = 34, align = "center", tone = "ink", at = 0 } = o;
      rise(s, X(x), Y(y) + size * 0.35 * u, size, at, 0.4, TONE15[tone], align, 600);
      ctx.font = font(size, 600);
      const tw = ctx.measureText(s).width;
      const left = align === "center" ? X(x) - tw / 2 : align === "right" ? X(x) - tw : X(x);
      rule(left, Y(y) - size * 0.85 * u, left + tw, ease(at, 0.4), 2, tone === "bad" ? RED8 : BLACK10);
    },
    node(x, y, r, o = {}) {
      const p = ease(o.at, 0.35);
      if (p <= 0)
        return;
      const R = r * u * 0.55 * p;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), R, 0, Math.PI * 2);
      ctx.fillStyle = PAPER11;
      ctx.fill();
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = o.tone === "bad" ? RED8 : BLACK10;
      ctx.stroke();
      if (o.tone === "good" || o.tone === "bad") {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), R * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = TONE15[o.tone];
        ctx.fill();
      }
    },
    box(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const p = ease(at, 0.6);
      if (p <= 0)
        return;
      rule(X(x), Y(y), X(x + w), p, 7, o.tone === "bad" ? RED8 : BLACK10);
      const q = ease(at + 0.15, 0.5);
      ctx.strokeStyle = BLACK10;
      ctx.lineWidth = 1.2 * u;
      ctx.beginPath();
      ctx.moveTo(X(x), Y(y));
      ctx.lineTo(X(x), Y(y) + Y(h) * q);
      ctx.moveTo(X(x + w), Y(y));
      ctx.lineTo(X(x + w), Y(y) + Y(h) * q);
      ctx.stroke();
      rule(X(x), Y(y + h), X(x + w), q, 1.2);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "ink" } = o;
      const p = ease(at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      trace(ctx, shown);
      ctx.strokeStyle = TONE15[tone];
      ctx.lineWidth = (head ? 2.5 : 1.2) * u;
      ctx.stroke();
      if (head && p >= 0.98) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 14 * u;
        ctx.beginPath();
        ctx.moveTo(end[0], end[1]);
        ctx.lineTo(end[0] - Math.cos(a - 0.4) * s, end[1] - Math.sin(a - 0.4) * s);
        ctx.lineTo(end[0] - Math.cos(a + 0.4) * s, end[1] - Math.sin(a + 0.4) * s);
        ctx.closePath();
        ctx.fillStyle = TONE15[tone];
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const dur = o.dur ?? 0.8;
      const cols = 4;
      const cw = X(w) / cols;
      const rows = Math.max(3, Math.floor(Y(h) / cw));
      const ch = Y(h) / rows;
      for (let c = 0;c < cols; c++)
        for (let r = 0;r < rows; r++) {
          const p = progress(t, at + c / cols * dur * 0.7 + r * 0.02, 0.15);
          if (p <= 0)
            continue;
          ctx.fillStyle = (c + r * 3) % 7 === 0 ? RED8 : BLACK10;
          const s = clamp(p) * 0.72;
          ctx.fillRect(X(x) + cw * c + cw * (1 - s) / 2, Y(y) + ch * r + ch * (1 - s) / 2, cw * s, ch * s);
        }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "ink" } = o;
      const str = count ? counting(t, at, dur, count) + s : s;
      const color = sub ? RED8 : TONE15[tone];
      rise(str, X(x), Y(y) + size * 0.36 * u, size * 1.1, at, 0.5, color, "center", 800);
      if (sub) {
        rise(sub, X(x), Y(y) + size * 0.95 * u, size * 0.34, at + 0.2, 0.4, BLACK10, "center", 600);
        ctx.font = font(size * 1.1, 800);
        const w = ctx.measureText(`${count ? count[1] : ""}${s}`).width;
        rule(X(x) - w / 2, Y(y) - size * 0.75 * u, X(x) + w / 2, ease(at, 0.6), 2);
      }
    },
    mark(kind, x, y, o = {}) {
      const p = ease(o.at, 0.35);
      if (p <= 0)
        return;
      const r = (o.size ?? 26) * u;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.strokeStyle = kind === "check" ? BLACK10 : RED8;
      ctx.lineWidth = 5 * u;
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      if (kind === "check") {
        const pts = [
          [cx - r * 0.6, cy],
          [cx - r * 0.15, cy + r * 0.45],
          [cx + r * 0.7, cy - r * 0.6]
        ];
        trace(ctx, pts.slice(0, p < 0.5 ? 2 : 3));
      } else {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.55, cy - r * 0.55);
        ctx.lineTo(cx + r * 0.55, cy + r * 0.55);
        if (p > 0.5) {
          ctx.moveTo(cx + r * 0.55, cy - r * 0.55);
          ctx.lineTo(cx - r * 0.55, cy + r * 0.55);
        }
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {}
  };
}
var swiss_grid_default = {
  id: "swiss-grid",
  name: "Swiss grid",
  category: "Art & Design Movements",
  make: make68
};

// plugin/skills/motion-graphics/styles/synthwave.ts
var NEON = {
  ink: "#3FE8FF",
  accent: "#FF3FD0",
  good: "#5CFFB8",
  bad: "#FF3B5C",
  muted: "#B38CFF"
};
var SANS10 = '"Avenir Next", "Futura", "Helvetica Neue", Arial, sans-serif';
function make69(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const HZ = H * 0.6;
  const g = globalThis;
  g.__synth ??= {};
  const st = g.__synth;
  const lit = (at) => {
    const s = t - at;
    if (s < 0)
      return 0;
    if (s > 0.35)
      return 1;
    return hash(Math.floor(s * 40) + at * 13) > 0.4 ? 0.4 + s * 1.7 : 0.1;
  };
  function neon(draw, color, a = 1, blur = 16) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * u;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    draw();
    ctx.restore();
  }
  function chrome(y, size) {
    const gr = ctx.createLinearGradient(0, y - size * 0.55, 0, y + size * 0.55);
    gr.addColorStop(0, "#E9F4FF");
    gr.addColorStop(0.45, "#6FA8E8");
    gr.addColorStop(0.5, "#4A2F7A");
    gr.addColorStop(0.62, "#C06AA0");
    gr.addColorStop(1, "#FFE3F6");
    return gr;
  }
  function chromeText(s, x, y, size, align = "center", outline = NEON.accent) {
    ctx.save();
    ctx.font = `italic 800 ${Math.round(size)}px ${SANS10}`;
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
    if (st.key === key)
      return st.bg;
    const bg = new OffscreenCanvas(W, H);
    const c = bg.getContext("2d");
    const sky = c.createLinearGradient(0, 0, 0, HZ);
    sky.addColorStop(0, "#0B0420");
    sky.addColorStop(0.6, "#2A0B4A");
    sky.addColorStop(1, "#6A1A6E");
    c.fillStyle = sky;
    c.fillRect(0, 0, W, HZ);
    for (let i = 0;i < 120; i++) {
      c.fillStyle = `rgba(255,255,255,${0.3 + hash(i * 9.1) * 0.6})`;
      const s = (hash(i * 2.2) > 0.9 ? 2.2 : 1.2) * u;
      c.fillRect(hash(i * 3.3) * W, hash(i * 7.7) * HZ * 0.8, s, s);
    }
    const sr = H * 0.24;
    const sx = W * 0.5;
    const sy = HZ - sr * 0.35;
    const sun = c.createLinearGradient(0, sy - sr, 0, sy + sr);
    sun.addColorStop(0, "#FFE96A");
    sun.addColorStop(0.5, "#FF9A3C");
    sun.addColorStop(1, "#FF2E8A");
    c.save();
    c.shadowColor = "#FF5AA0";
    c.shadowBlur = 60 * u;
    c.beginPath();
    c.arc(sx, sy, sr, 0, Math.PI * 2);
    c.fillStyle = sun;
    c.fill();
    c.restore();
    c.globalCompositeOperation = "destination-out";
    for (let i = 0;i < 7; i++) {
      const y = sy + sr * (-0.15 + i * 0.17);
      c.fillRect(sx - sr, y, sr * 2, sr * (0.03 + i * 0.022));
    }
    c.globalCompositeOperation = "source-over";
    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 0;i <= 12; i++) {
        const f = i / 12;
        const x = W / 2 + side * (W * 0.12 + f * W * 0.4);
        const hgt = Math.sin(f * Math.PI) * (0.6 + hash(i * 4.3 + side) * 0.6) * H * 0.17;
        pts.push([x, HZ - hgt]);
      }
      c.beginPath();
      c.moveTo(W / 2 + side * W * 0.12, HZ);
      for (const [x, y] of pts)
        c.lineTo(x, y);
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
      ctx.save();
      ctx.strokeStyle = "#FF3FD0";
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath();
      for (let i = -14;i <= 14; i++) {
        ctx.moveTo(W / 2 + i * W * 0.02, HZ);
        ctx.lineTo(W / 2 + i * W * 0.16, H);
      }
      const scroll = t * 0.9 % 1;
      for (let k = 0;k < 14; k++) {
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
      if (t < at)
        return;
      const s = spring(t, { start: at, from: 1.8, to: 1, stiffness: 320, damping: 22 });
      ctx.save();
      ctx.translate(X(x), Y(y) + size * u * 0.6);
      ctx.scale(s, s);
      ctx.globalAlpha = clamp((t - at) / 0.08);
      chromeText(text.toUpperCase(), 0, 0, size * u, "left");
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
      if (!a)
        return;
      neon(() => {
        ctx.font = `italic 700 ${Math.round(size * u)}px ${SANS10}`;
        ctx.textAlign = align;
        ctx.textBaseline = "middle";
        ctx.fillText(text.toUpperCase(), X(x), Y(y));
      }, NEON[tone], a, 12);
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const a = lit(at);
      if (!a)
        return;
      const rr = r * u;
      const spin = t * 1.5;
      neon(() => {
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.arc(X(x), Y(y), rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1.1 * u;
        ctx.beginPath();
        ctx.ellipse(X(x), Y(y), rr, rr * 0.35, 0, 0, Math.PI * 2);
        ctx.ellipse(X(x), Y(y), Math.abs(Math.cos(spin)) * rr, rr, 0, 0, Math.PI * 2);
        ctx.stroke();
      }, NEON[tone], a, 12);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      const a = lit(at);
      if (!a)
        return;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(14,4,32,0.78)";
      ctx.beginPath();
      ctx.roundRect(X(x), Y(y), X(w), Y(h), 10 * u);
      ctx.fill();
      ctx.restore();
      neon(() => {
        ctx.lineWidth = 2.5 * u;
        ctx.beginPath();
        ctx.roundRect(X(x), Y(y), X(w), Y(h), 10 * u);
        ctx.stroke();
      }, NEON[tone], a);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (t < at)
        return;
      const p = progress(t, at, dur);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      const color = head ? NEON[tone] : alpha(NEON.muted, 0.55);
      neon(() => {
        ctx.lineWidth = (head ? 2.6 : 1.2) * u;
        ctx.lineCap = "round";
        ctx.beginPath();
        for (const [i, [px, py]] of shown.entries())
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        ctx.stroke();
        if (head && p >= 1) {
          const e = pts.at(-1);
          const q = pts.at(-3);
          const an = Math.atan2(e[1] - q[1], e[0] - q[0]);
          const s = 16 * u;
          ctx.beginPath();
          ctx.moveTo(e[0] - Math.cos(an - 0.5) * s, e[1] - Math.sin(an - 0.5) * s);
          ctx.lineTo(e[0], e[1]);
          ctx.lineTo(e[0] - Math.cos(an + 0.5) * s, e[1] - Math.sin(an + 0.5) * s);
          ctx.stroke();
        }
      }, color, 1, head ? 14 : 0);
      if (p < 1 && head) {
        const e = shown.at(-1);
        neon(() => {
          ctx.beginPath();
          ctx.arc(e[0], e[1], 4 * u, 0, Math.PI * 2);
          ctx.fill();
        }, "#FFFFFF");
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "ink" } = o;
      if (t < at)
        return;
      const n = 4;
      const rx = X(w) / 2;
      const ry = rx * 0.3;
      const cx = X(x + w / 2);
      for (let i = 0;i < n; i++) {
        const a = lit(at + i * dur / n);
        if (!a)
          continue;
        const cy = Y(y + h) - ry - i * (Y(h) - ry * 2) / (n - 1);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = "rgba(14,4,32,0.85)";
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        neon(() => {
          ctx.lineWidth = 2 * u;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        }, i % 2 ? NEON.accent : NEON[tone], a, 12);
      }
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "accent" } = o;
      if (t < at)
        return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const k = spring(t, { start: at, from: 0.6, to: 1, stiffness: 260, damping: 16 });
      ctx.save();
      ctx.translate(X(x), Y(y) - (sub ? size * u * 0.2 : 0));
      ctx.scale(k, k);
      chromeText(s, 0, 0, size * u * 1.1, "center", NEON[tone]);
      ctx.restore();
      if (sub)
        neon(() => {
          ctx.font = `italic 700 ${Math.round(size * u * 0.3)}px ${SANS10}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(sub.toUpperCase(), X(x), Y(y) + size * u * 0.6);
        }, NEON.ink, lit(at + 0.3), 10);
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 40 } = o;
      const a = lit(at);
      if (!a)
        return;
      const r = size * u * 0.6;
      const cx = X(x);
      const cy = Y(y);
      neon(() => {
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
      }, kind === "check" ? NEON.good : NEON.bad, a);
    },
    finish() {
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (let y = 0;y < H; y += 4 * u)
        ctx.fillRect(0, y, W, 1.5 * u);
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.65);
      v.addColorStop(0, "rgba(10,0,30,0)");
      v.addColorStop(1, "rgba(10,0,30,0.6)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }
  };
}
var synthwave_default = {
  id: "synthwave",
  name: "Neon night drive",
  category: "Retro UI & Neon",
  make: make69
};

// plugin/skills/motion-graphics/styles/tarot-card.ts
var GOLD3 = "#D8B867";
var NAVY5 = "#1E2A55";
var DEEP2 = "#141C3D";
var LINE7 = {
  ink: GOLD3,
  accent: GOLD3,
  good: "#E9D28E",
  bad: "#E0714F",
  muted: "#9C8A5A"
};
var SERIF15 = '"Cormorant Garamond", "Didot", "Palatino", "Georgia", serif';
function make70(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__tarot ??= new Map;
  const cache = g.__tarot;
  function foil(x0, y0, x1, y1) {
    const gr = ctx.createLinearGradient(x0, y0, x1, y1);
    const s = clamp(t * 0.3 % 1.6 - 0.3);
    gr.addColorStop(0, "#A8843E");
    gr.addColorStop(Math.max(0, s - 0.12), GOLD3);
    gr.addColorStop(s, "#FFF4C8");
    gr.addColorStop(Math.min(1, s + 0.12), GOLD3);
    gr.addColorStop(1, "#A8843E");
    return gr;
  }
  function velvet() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      const gr = b.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.6);
      gr.addColorStop(0, "#5C1430");
      gr.addColorStop(1, "#2A0716");
      b.fillStyle = gr;
      b.fillRect(0, 0, W, H);
      b.filter = `blur(${26 * u}px)`;
      for (let i = 0;i < 12; i++) {
        b.strokeStyle = hash(i) > 0.5 ? "rgba(140,40,80,0.35)" : "rgba(15,0,8,0.4)";
        b.lineWidth = (40 + hash(i + 1) * 60) * u;
        b.beginPath();
        const y = hash(i + 2) * H;
        b.moveTo(-50 * u, y);
        b.bezierCurveTo(W * 0.3, y + (hash(i + 3) - 0.5) * H * 0.6, W * 0.7, y + (hash(i + 4) - 0.5) * H * 0.6, W + 50 * u, y + (hash(i + 5) - 0.5) * H * 0.3);
        b.stroke();
      }
      b.filter = `blur(${2 * u}px)`;
      for (let i = 0;i < 8; i++) {
        b.strokeStyle = "rgba(230,120,160,0.22)";
        b.lineWidth = 2 * u;
        b.beginPath();
        const y = hash(i * 7.1) * H;
        b.moveTo(-20 * u, y);
        b.bezierCurveTo(W * 0.35, y + (hash(i + 13) - 0.5) * H * 0.7, W * 0.65, y + (hash(i + 17) - 0.5) * H * 0.7, W + 20 * u, y + (hash(i + 19) - 0.5) * H * 0.4);
        b.stroke();
      }
      b.filter = "none";
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  function star(cx, cy, r, fill) {
    const pts = Array.from({ length: 16 }, (_, i) => {
      const a = i / 16 * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.32 : i % 4 ? r * 0.6 : r;
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    });
    trace(ctx, pts, true);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function back(x, y, w, h) {
    ctx.fillStyle = NAVY5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6 * u);
    ctx.fill();
    ctx.strokeStyle = foil(x, y, x + w, y + h);
    ctx.lineWidth = 2 * u;
    ctx.strokeRect(x + 6 * u, y + 6 * u, w - 12 * u, h - 12 * u);
    ctx.fillStyle = "rgba(216,184,103,0.55)";
    const s = Math.max(10 * u, w / 7);
    for (let yy = y + s;yy < y + h - s * 0.5; yy += s)
      for (let xx = x + s;xx < x + w - s * 0.5; xx += s)
        ctx.fillRect(xx - u, yy - u, 2 * u, 2 * u);
    ctx.strokeStyle = GOLD3;
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    star(x + w / 2, y + h / 2, Math.min(w, h) * 0.16, foil(x, y, x + w, y + h));
  }
  function face(x, y, w, h, numeral) {
    ctx.fillStyle = "#E9DDB8";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6 * u);
    ctx.fill();
    const i = 7 * u;
    ctx.fillStyle = NAVY5;
    ctx.beginPath();
    ctx.roundRect(x + i, y + i, w - i * 2, h - i * 2, [w * 0.25, w * 0.25, 4 * u, 4 * u]);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(216,184,103,0.25)";
    ctx.lineWidth = 3 * u;
    const cx = x + w / 2;
    const cy = y + h * 0.55;
    for (let k = 0;k < 28; k++) {
      const a = k / 28 * Math.PI * 2;
      trace(ctx, [
        [cx, cy],
        [cx + Math.cos(a) * w * 1.5, cy + Math.sin(a) * w * 1.5]
      ]);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = foil(x, y, x + w, y + h);
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.roundRect(x + i, y + i, w - i * 2, h - i * 2, [w * 0.25, w * 0.25, 4 * u, 4 * u]);
    ctx.stroke();
    ctx.lineWidth = u;
    ctx.strokeRect(x + 2.5 * u, y + 2.5 * u, w - 5 * u, h - 5 * u);
    ctx.fillStyle = DEEP2;
    ctx.font = `600 ${Math.round(Math.max(10, w * 0.09))}px ${SERIF15}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(numeral, cx, y + i * 0.55 + 1.5 * u);
  }
  function flipCard(cx, cy, w, h, at, dur, numeral) {
    const p = progress(t, at, dur);
    if (p <= 0)
      return 0;
    const dealt = expo(progress(t, at, dur * 0.4));
    const flip = progress(t, at + dur * 0.35, dur * 0.65);
    const sx = Math.abs(Math.cos(flip * Math.PI)) || 0.02;
    ctx.save();
    ctx.translate(cx, cy + (1 - dealt) * 60 * u);
    ctx.globalAlpha = dealt;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 18 * u;
    ctx.shadowOffsetY = 8 * u;
    ctx.scale(sx, 1);
    ctx.fillStyle = "rgba(0,0,0,0.01)";
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.shadowColor = "transparent";
    if (flip < 0.5)
      back(-w / 2, -h / 2, w, h);
    else
      face(-w / 2, -h / 2, w, h, numeral);
    ctx.restore();
    return flip;
  }
  function plaque(s, x, y, o = {}) {
    const { at = 0, size = 26, align = "center", tone = "ink" } = o;
    const p = expo(progress(t, at, 0.4));
    if (p <= 0)
      return;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.font = `600 ${Math.round(size * u)}px ${SERIF15}`;
    ctx.textBaseline = "middle";
    const w = Math.max(o.minW ?? 0, ctx.measureText(s).width + size * 1.2 * u);
    const h = size * 1.5 * u;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    const top = Y(y) - h / 2 + (1 - p) * 8 * u;
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 10 * u;
    ctx.shadowOffsetY = 4 * u;
    ctx.fillStyle = NAVY5;
    ctx.fillRect(left, top, w, h);
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = foil(left, top, left + w, top + h);
    ctx.lineWidth = 2 * u;
    ctx.strokeRect(left + 3 * u, top + 3 * u, w - 6 * u, h - 6 * u);
    ctx.fillStyle = LINE7[tone];
    ctx.textAlign = "center";
    ctx.fillText(s, left + w / 2, top + h / 2 + u);
    ctx.restore();
  }
  return {
    surface() {
      velvet();
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 44, at = 0 } = o;
      plaque(s, x, y, { ...o, at, size, align: o.align ?? "left" });
    },
    label(s, x, y, o = {}) {
      plaque(s, x, y, { size: 30, ...o });
    },
    node(x, y, r, o = {}) {
      const { at = 0 } = o;
      const p = expo(progress(t, at, 0.35));
      if (p <= 0)
        return;
      const R = r * u * 1.1;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(Math.max(0.05, p), 1);
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 8 * u;
      ctx.fillStyle = NAVY5;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = foil(-R, -R, R, R);
      ctx.lineWidth = 3 * u;
      ctx.stroke();
      star(0, 0, R * 0.62, foil(-R, -R, R, R));
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      flipCard(X(x + w / 2), Y(y + h / 2), X(w), Y(h), at, dur, "XVII");
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = along(shaft, p).points;
      ctx.save();
      ctx.strokeStyle = tone === "accent" ? "rgba(216,184,103,0.55)" : LINE7[tone];
      ctx.lineWidth = (head ? 2 : 1.1) * u;
      ctx.shadowColor = "rgba(255,220,140,0.5)";
      ctx.shadowBlur = 4 * u;
      trace(ctx, shown);
      ctx.stroke();
      if (head) {
        ctx.fillStyle = LINE7[tone];
        const s0 = shaft[0];
        ctx.beginPath();
        ctx.arc(s0[0], s0[1], 3 * u, 0, Math.PI * 2);
        ctx.fill();
        for (const f of [0.33, 0.66]) {
          if (p < f)
            continue;
          const q = shaft[Math.round(f * (shaft.length - 1))];
          ctx.beginPath();
          ctx.arc(q[0], q[1] - 4 * u, 4 * u, Math.PI * 0.6, Math.PI * 2.4);
          ctx.stroke();
        }
        if (p >= 1) {
          const end = shaft.at(-1);
          const prev = shaft.at(-3);
          const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
          const s = 13 * u;
          trace(ctx, [
            end,
            [end[0] - Math.cos(a - 0.45) * s, end[1] - Math.sin(a - 0.45) * s],
            [end[0] - Math.cos(a) * s * 0.55, end[1] - Math.sin(a) * s * 0.55],
            [end[0] - Math.cos(a + 0.45) * s, end[1] - Math.sin(a + 0.45) * s]
          ], true);
          ctx.fill();
        }
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      for (let i = 0;i < 4; i++) {
        const p = expo(progress(t, at + i * (dur / 5), dur / 3));
        if (p <= 0)
          continue;
        ctx.save();
        ctx.globalAlpha = p;
        ctx.translate(x0 + bw / 2 + (i - 1.5) * 4 * u, y0 + bh / 2 - i * 4 * u + (1 - p) * 40 * u);
        ctx.rotate((i - 1.5) * 0.05);
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 10 * u;
        ctx.fillStyle = NAVY5;
        ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
        ctx.shadowColor = "transparent";
        back(-bw / 2, -bh / 2, bw, bh);
        ctx.restore();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const [cx, cy] = [X(x), Y(y)];
      const big = size >= 80;
      if (big) {
        const b = expo(progress(t, at + dur, 0.6));
        if (b > 0) {
          const R = size * 2.2 * u * b;
          const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
          gl.addColorStop(0, "rgba(255,225,150,0.45)");
          gl.addColorStop(1, "rgba(255,225,150,0)");
          ctx.fillStyle = gl;
          ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
          ctx.save();
          ctx.strokeStyle = "rgba(255,225,150,0.4)";
          ctx.lineWidth = 1.2 * u;
          for (let i = 0;i < 36; i++) {
            const a = i / 36 * Math.PI * 2;
            trace(ctx, [
              [cx + Math.cos(a) * size * 1.1 * u, cy + Math.sin(a) * size * 0.8 * u],
              [cx + Math.cos(a) * R, cy + Math.sin(a) * R]
            ]);
            ctx.stroke();
          }
          ctx.restore();
        }
        plaque("", x, y + size * 0.12 * u / H, { at, size: size * 1.05, minW: size * 2.6 * u });
      }
      const p = expo(progress(t, at, 0.4));
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = `500 ${Math.round(size * (big ? 0.8 : 1) * u)}px ${SERIF15}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = foil(cx - size * u, cy - size * u, cx + size * u, cy + size * u);
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 6 * u;
      ctx.fillText(value, cx, cy + (big ? size * 0.25 * u : 0));
      if (sub) {
        ctx.font = `500 ${Math.round(size * 0.28 * u)}px ${SERIF15}`;
        ctx.fillStyle = GOLD3;
        ctx.fillText(sub, cx, cy - size * 0.38 * u);
      }
      ctx.restore();
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      const p = expo(progress(t, at, 0.35));
      if (p <= 0)
        return;
      const r = (o.size ?? 26) * u * (0.5 + 0.5 * p);
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.globalAlpha = p;
      ctx.fillStyle = kind === "check" ? foil(cx - r, cy - r, cx + r, cy + r) : "#B23A2E";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = kind === "check" ? NAVY5 : "#F4E6C8";
      ctx.lineWidth = r * 0.22;
      ctx.lineCap = "round";
      if (kind === "check")
        trace(ctx, [
          [cx - r * 0.45, cy],
          [cx - r * 0.1, cy + r * 0.35],
          [cx + r * 0.5, cy - r * 0.35]
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.4, cy - r * 0.4);
        ctx.lineTo(cx + r * 0.4, cy + r * 0.4);
        ctx.moveTo(cx + r * 0.4, cy - r * 0.4);
        ctx.lineTo(cx - r * 0.4, cy + r * 0.4);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      vignette(ctx, m, 0.55, "10,0,6");
    }
  };
}
var tarot_card_default = {
  id: "tarot-card",
  name: "Tarot reading",
  category: "Illustration",
  make: make70
};

// plugin/skills/motion-graphics/styles/tech-glow.ts
var GLOW3 = {
  ink: ["#9FB4FF", "#6C7CFF"],
  accent: ["#4FE3FF", "#8A5CFF"],
  good: ["#3DF5C4", "#2BB8FF"],
  bad: ["#FF5C9A", "#FF3D6E"],
  muted: ["#6E7BB0", "#4A5490"]
};
var SANS11 = '"SF Pro Display", "Inter", "Helvetica Neue", Arial, sans-serif';
function make71(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const pop = (at = 0) => spring(t, { start: at, stiffness: 220, damping: 15 });
  function grad(x0, y0, x1, y1, tone) {
    const [a, b] = GLOW3[tone];
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    return g;
  }
  function scaled(cx, cy, s, draw) {
    if (s <= 0)
      return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }
  function tile(x, y, w, h, r, tone, fill = 0.55) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, `rgba(40,46,120,${fill})`);
    bg.addColorStop(1, `rgba(14,16,58,${fill + 0.2})`);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.shadowColor = GLOW3[tone][0];
    ctx.shadowBlur = 22 * u;
    ctx.lineWidth = 2.5 * u;
    ctx.strokeStyle = grad(x, y, x + w, y + h, tone);
    ctx.stroke();
    ctx.restore();
  }
  function glowText(s, x, y, size, weight, fill, align = "left", blur = 16) {
    ctx.save();
    ctx.font = `${weight} ${Math.round(size * u)}px ${SANS11}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(120,160,255,0.75)";
    ctx.shadowBlur = blur * u;
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  return {
    surface() {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#070A2A");
      g.addColorStop(0.55, "#12105A");
      g.addColorStop(1, "#1B0F6B");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0;i < 4; i++) {
        const cx = W * (0.2 + 0.6 * hash(i * 3.1)) + Math.sin(t * 0.25 + i) * 60 * u;
        const cy = H * (0.2 + 0.6 * hash(i * 5.7)) + Math.cos(t * 0.2 + i * 2) * 40 * u;
        const r = (380 + 220 * hash(i + 9)) * u;
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        rg.addColorStop(0, i % 2 ? "rgba(60,90,255,0.22)" : "rgba(130,60,255,0.2)");
        rg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
      ctx.save();
      const hz = H * 0.66;
      ctx.strokeStyle = "rgba(120,140,255,0.09)";
      ctx.lineWidth = 1.2 * u;
      for (let i = -12;i <= 12; i++) {
        ctx.beginPath();
        ctx.moveTo(W / 2 + i * 40 * u, hz);
        ctx.lineTo(W / 2 + i * 260 * u, H);
        ctx.stroke();
      }
      for (let k = 0;k < 8; k++) {
        const f = ((k + t * 0.15 % 1) / 8) ** 2;
        const yy = hz + (H - hz) * f;
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(W, yy);
        ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      for (let i = 0;i < 70; i++) {
        const px = (hash(i * 1.3) * W + t * (6 + hash(i) * 14) * u) % W;
        const py = (hash(i * 2.9) * H - t * (4 + hash(i + 4) * 10) * u + H * 4) % H;
        ctx.fillStyle = `rgba(190,210,255,${0.15 + 0.4 * hash(i * 7.7) * (0.6 + 0.4 * Math.sin(t * 2 + i))})`;
        ctx.fillRect(px, py, 2.4 * u, 2.4 * u);
      }
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.08, size = 52, at = 0, dur = 0.9, align = "left" } = o;
      if (t < at)
        return;
      const words = s.split(" ");
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${SANS11}`;
      const full = ctx.measureText(s).width;
      let cx = align === "center" ? X(x) - full / 2 : align === "right" ? X(x) - full : X(x);
      const space = ctx.measureText(" ").width;
      words.forEach((w, i) => {
        const p = expo(progress(t, at + i * dur / words.length, 0.5));
        const ww = ctx.measureText(w).width;
        if (p > 0) {
          ctx.globalAlpha = p;
          const fill = i === words.length - 1 ? grad(cx, 0, cx + ww, 0, "accent") : "#EEF1FF";
          glowText(w, cx, Y(y) + (1 - p) * 26 * u, size, 700, fill, "left", 18);
        }
        cx += ww + space;
      });
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 24, tone = "ink", align = "center" } = o;
      const p = expo(progress(t, at, 0.4));
      if (p <= 0)
        return;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = `600 ${Math.round(size * u)}px ${SANS11}`;
      const tw = ctx.measureText(s).width;
      const pad = 14 * u;
      const pw = tw + pad * 2 + 14 * u;
      const ph = size * 1.55 * u;
      const left = align === "center" ? X(x) - pw / 2 : align === "right" ? X(x) - pw : X(x);
      const top = Y(y) - ph / 2 + (1 - p) * 10 * u;
      ctx.beginPath();
      ctx.roundRect(left, top, pw, ph, ph / 2);
      ctx.fillStyle = "rgba(14,18,64,0.8)";
      ctx.fill();
      ctx.lineWidth = 1.5 * u;
      ctx.strokeStyle = alpha(GLOW3[tone][0], 0.6);
      ctx.stroke();
      ctx.fillStyle = GLOW3[tone][0];
      ctx.shadowColor = GLOW3[tone][0];
      ctx.shadowBlur = 8 * u;
      ctx.beginPath();
      ctx.arc(left + pad + 3 * u, top + ph / 2, 3.5 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#E8ECFF";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(s, left + pad + 14 * u, top + ph / 2);
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const tone = o.tone ?? "accent";
      const cx = X(x);
      const cy = Y(y);
      const R = r * u;
      scaled(cx, cy, pop(o.at), () => {
        ctx.save();
        const halo = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 2.4);
        halo.addColorStop(0, alpha(GLOW3[tone][0], 0.35));
        halo.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = halo;
        ctx.fillRect(cx - R * 2.5, cy - R * 2.5, R * 5, R * 5);
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = "#151A5C";
        ctx.fill();
        ctx.shadowColor = GLOW3[tone][0];
        ctx.shadowBlur = 14 * u;
        ctx.lineWidth = 3 * u;
        ctx.strokeStyle = grad(cx - R, cy - R, cx + R, cy + R, tone);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = GLOW3[tone][0];
        ctx.fill();
        ctx.restore();
      });
    },
    box(x, y, w, h, o = {}) {
      const tone = o.tone ?? "ink";
      const s = pop(o.at);
      if (s <= 0)
        return;
      ctx.save();
      ctx.globalAlpha = clamp(s);
      scaled(X(x + w / 2), Y(y + h / 2), 0.92 + 0.08 * s, () => tile(X(x), Y(y), X(w), Y(h), 16 * u, tone, 0.6));
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 32);
      const { points, angle } = along(pts, expo(p));
      ctx.save();
      ctx.lineCap = "round";
      ctx.shadowColor = GLOW3[tone][0];
      ctx.shadowBlur = 10 * u;
      trace(ctx, points);
      ctx.strokeStyle = alpha(GLOW3[tone][0], head ? 0.85 : 0.45);
      ctx.lineWidth = (head ? 3 : 1.6) * u;
      ctx.stroke();
      if (head && p >= 1) {
        arrowhead(ctx, pts.at(-1), angle, 14 * u, true);
        ctx.lineWidth = 3 * u;
        ctx.stroke();
      }
      if (p >= 1) {
        ctx.globalCompositeOperation = "lighter";
        const k = ((t - at - dur) * 0.6 + hash(x1 * 9 + y2 * 7)) % 1;
        const [px, py] = along(pts, k).points.at(-1);
        const pg = ctx.createRadialGradient(px, py, 0, px, py, 12 * u);
        pg.addColorStop(0, "rgba(255,255,255,0.95)");
        pg.addColorStop(0.3, alpha(GLOW3[tone][0], 0.7));
        pg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = pg;
        ctx.fillRect(px - 12 * u, py - 12 * u, 24 * u, 24 * u);
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const cx = X(x + w / 2);
      const cy = Y(y + h / 2);
      const side = Math.min(X(w), Y(h)) * 1.05;
      scaled(cx, cy, pop(at), () => {
        tile(cx - side / 2, cy - side / 2, side, side, side * 0.24, tone, 0.65);
        const d = progress(t, at + 0.2, 0.6);
        const rx = side * 0.24;
        const ry = rx * 0.35;
        const top = cy - side * 0.2;
        const bot = cy + side * 0.2;
        ctx.save();
        ctx.lineWidth = 3 * u;
        ctx.strokeStyle = grad(cx - rx, top, cx + rx, bot, tone);
        ctx.shadowColor = GLOW3[tone][0];
        ctx.shadowBlur = 10 * u;
        ctx.beginPath();
        ctx.ellipse(cx, top, rx, ry, 0, 0, Math.PI * 2 * d);
        ctx.stroke();
        for (let i = 1;i <= 2; i++) {
          if (d < i / 3)
            continue;
          ctx.beginPath();
          ctx.ellipse(cx, top + (bot - top) * i / 2, rx, ry, 0, 0, Math.PI);
          ctx.stroke();
        }
        if (d > 0.3) {
          ctx.beginPath();
          ctx.moveTo(cx - rx, top);
          ctx.lineTo(cx - rx, bot);
          ctx.moveTo(cx + rx, top);
          ctx.lineTo(cx + rx, bot);
          ctx.stroke();
        }
        ctx.restore();
      });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "accent" } = o;
      const p = expo(progress(t, at, 0.5));
      if (p <= 0)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = `800 ${Math.round(size * u)}px ${SANS11}`;
      const tw = ctx.measureText(value).width;
      const cy = Y(y) + (1 - p) * 20 * u;
      glowText(value, X(x), cy, size, 800, grad(X(x) - tw / 2, cy - size * u, X(x) + tw / 2, cy + size * u, tone), "center", 26);
      if (sub) {
        ctx.font = `700 ${Math.round(size * 0.24 * u)}px ${SANS11}`;
        ctx.textAlign = "center";
        ctx.fillStyle = GLOW3[tone][0];
        ctx.fillText(`• ${sub.toUpperCase().split("").join(" ")}`, X(x), Y(y) - size * 0.72 * u);
      }
      ctx.restore();
    },
    mark(kind, x, y, o = {}) {
      const R = (o.size ?? 34) * u;
      const tone = kind === "check" ? "good" : "bad";
      const cx = X(x);
      const cy = Y(y);
      scaled(cx, cy, pop(o.at), () => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = alpha(GLOW3[tone][1], 0.22);
        ctx.fill();
        ctx.shadowColor = GLOW3[tone][0];
        ctx.shadowBlur = 18 * u;
        ctx.lineWidth = 3 * u;
        ctx.strokeStyle = GLOW3[tone][0];
        ctx.stroke();
        const d = progress(t, (o.at ?? 0) + 0.15, 0.3);
        ctx.lineWidth = 4.5 * u;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const pts = kind === "check" ? [
          [cx - R * 0.42, cy + R * 0.02],
          [cx - R * 0.1, cy + R * 0.34],
          [cx + R * 0.45, cy - R * 0.32]
        ] : [
          [cx - R * 0.35, cy - R * 0.35],
          [cx + R * 0.35, cy + R * 0.35]
        ];
        trace(ctx, along(pts, d).points);
        ctx.stroke();
        if (kind === "cross" && d > 0) {
          trace(ctx, [
            [cx + R * 0.35, cy - R * 0.35],
            [cx - R * 0.35, cy + R * 0.35]
          ]);
          ctx.stroke();
        }
        ctx.restore();
      });
    },
    finish() {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      g.addColorStop(0, "rgba(4,4,20,0)");
      g.addColorStop(1, "rgba(4,4,20,0.55)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  };
}
var tech_glow_default = {
  id: "tech-glow",
  name: "Neon tech",
  category: "Popular Explainer Looks",
  make: make71
};

// plugin/skills/motion-graphics/styles/teletext.ts
var COL3 = {
  red: "#FF0000",
  green: "#00FF00",
  yellow: "#FFFF00",
  blue: "#0000FF",
  magenta: "#FF00FF",
  cyan: "#00FFFF",
  white: "#FFFFFF"
};
var TONE16 = {
  ink: COL3.white,
  accent: COL3.yellow,
  good: COL3.green,
  bad: COL3.red,
  muted: COL3.cyan
};
var MONO11 = '"Courier New", Menlo, Consolas, monospace';
var COLS = 40;
function make72(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const rows = 25;
  const bw = COLS * 2;
  const bh = rows * 3;
  const g = globalThis;
  g.__ttx ??= {};
  const st = g.__ttx;
  if (!st.buf)
    st.buf = new OffscreenCanvas(bw, bh);
  const c = st.buf.getContext("2d", { willReadFrequently: true });
  const bx = (x) => x * bw;
  const by = (y) => y * bh;
  const cw = W / COLS;
  const rh = H / rows;
  const words = [];
  const snapX = (x) => Math.round(x / cw) * cw;
  const snapY = (y) => (Math.floor(y / rh) + 0.5) * rh;
  function say(s, x, y, color, tall = false, align = "left", bg, wide = false) {
    const k = wide ? 2 : 1;
    words.push(() => {
      ctx.save();
      const fs = Math.round(rh * 0.9);
      ctx.font = `bold ${fs}px ${MONO11}`;
      const adv = ctx.measureText("M").width;
      const tw = s.length * cw * k;
      let x0 = align === "center" ? x - tw / 2 : align === "right" ? x - tw : x;
      x0 = snapX(x0);
      const y0 = snapY(y);
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(x0 - cw * 0.5, y0 - rh * (tall ? 1 : 0.5), tw + cw, rh * (tall ? 2 : 1));
      }
      ctx.translate(x0, y0);
      ctx.scale(cw * k * 0.96 / adv, tall ? 2 : 1);
      ctx.fillStyle = color;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      for (let i = 0;i < s.length; i++)
        ctx.fillText(s[i], i * cw * k * adv / (cw * k * 0.96), rh * 0.04);
      ctx.restore();
    });
    return s.length * cw * k;
  }
  function landing(at, dur, y0, y1, draw) {
    if (t < at)
      return;
    const p = progress(t, at, dur);
    const cut = Math.ceil((y0 + (y1 - y0) * p) / 6) * 6;
    c.save();
    c.beginPath();
    c.rect(0, 0, bw, cut + 1);
    c.clip();
    draw();
    c.restore();
  }
  return {
    surface() {
      c.imageSmoothingEnabled = false;
      c.fillStyle = "#000";
      c.fillRect(0, 0, bw, bh);
      const sec = 12 + Math.floor(t);
      const page = 100 + Math.min(4, Math.floor(t / 2));
      say(`P${page}  INFO ${page}  Mon 01 Jan`, cw * 0.5, rh * 0.5, COL3.white);
      say(`10:24/${String(sec % 60).padStart(2, "0")}`, W - cw * 0.5, rh * 0.5, COL3.yellow, false, "right");
      const links = [
        ["Back", COL3.red],
        ["Index", COL3.green],
        ["Next", COL3.yellow],
        ["More", COL3.cyan]
      ];
      for (const [i, [s, col]] of links.entries())
        say(s, cw * (2 + i * 12), H - rh * 0.5, col);
    },
    title(text, o = {}) {
      const { x = 0.035, y = 0.06, at = 0, dur = 0.6 } = o;
      if (t < at)
        return;
      c.fillStyle = COL3.blue;
      const row = Math.floor(Y(y) / rh) * 3;
      c.fillRect(0, row, bw, 6);
      const n = Math.ceil(text.length * progress(t, at, dur));
      say(text.toUpperCase().slice(0, n), X(x), (row / 3 + 1) * rh, COL3.yellow, true);
    },
    label(text, x, y, o = {}) {
      const { at = 0, tone = "ink", align = "center" } = o;
      if (t < at)
        return;
      say(text, X(x), Y(y), TONE16[tone === "ink" ? "muted" : tone], false, align);
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.2, tone = "accent" } = o;
      const rr = Math.max(1.5, r * u / H * bh * 1.3);
      landing(at, dur, by(y) - rr, by(y) + rr, () => {
        c.fillStyle = TONE16[tone === "accent" ? "accent" : tone];
        c.beginPath();
        c.ellipse(bx(x), by(y), rr * (bw / bh) * (H / W) * 1, rr, 0, 0, Math.PI * 2);
        c.fill();
      });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.3, tone = "ink" } = o;
      landing(at, dur, by(y), by(y + h), () => {
        c.fillStyle = tone === "good" ? COL3.green : tone === "bad" ? COL3.red : tone === "accent" ? COL3.yellow : COL3.white;
        c.fillRect(Math.round(bx(x)), Math.round(by(y)), Math.round(bx(w)), Math.round(by(h)));
        c.fillStyle = tone === "ink" ? COL3.blue : "#000";
        c.fillRect(Math.round(bx(x)) + 1, Math.round(by(y)) + 2, Math.round(bx(w)) - 2, Math.round(by(h)) - 4);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (t < at)
        return;
      const p = Math.max(0.2, Math.floor(progress(t, at, dur) * 5) / 5);
      const pts = curve([bx(x1), by(y1)], [bx(x2), by(y2)], bend, 30);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      c.strokeStyle = head ? tone === "accent" ? COL3.white : TONE16[tone] : COL3.blue;
      c.lineWidth = head ? 1.6 : 0.8;
      c.beginPath();
      for (const [i, [px, py]] of shown.entries())
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      c.stroke();
      if (head && p >= 1) {
        const e = pts.at(-1);
        const q = pts.at(-4);
        const a = Math.atan2(e[1] - q[1], e[0] - q[0]);
        c.fillStyle = c.strokeStyle;
        c.beginPath();
        c.moveTo(e[0] + Math.cos(a), e[1] + Math.sin(a));
        c.lineTo(e[0] - Math.cos(a - 0.7) * 4, e[1] - Math.sin(a - 0.7) * 4);
        c.lineTo(e[0] - Math.cos(a + 0.7) * 4, e[1] - Math.sin(a + 0.7) * 4);
        c.fill();
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (t < at)
        return;
      const n = 4;
      const cols = [COL3.cyan, COL3.green, COL3.yellow, COL3.magenta];
      const slab = by(h) / n;
      for (let i = 0;i < n; i++) {
        if (t < at + i * dur / n)
          continue;
        c.fillStyle = cols[i];
        c.fillRect(Math.round(bx(x)), Math.round(by(y + h) - slab * (i + 1)), Math.round(bx(w)), Math.max(2, Math.round(slab) - 1));
      }
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, sub, tone = "accent" } = o;
      if (t < at)
        return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const done = progress(t, at, dur) >= 1;
      if (done && Math.floor((t - at - dur) * 3) % 2 === 1 && t - at - dur < 2)
        return;
      say(s, X(x), Y(y) - (sub ? rh * 0.5 : 0), TONE16[tone], true, "center", undefined, !!sub);
      if (sub)
        say(sub, X(x), Y(y) + rh * 1.5, COL3.white, false, "center");
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 40 } = o;
      if (t < at)
        return;
      const r = size * u / H * bh;
      c.strokeStyle = kind === "check" ? COL3.green : COL3.red;
      c.lineWidth = 1.8;
      c.beginPath();
      const cx = bx(x);
      const cy = by(y);
      const rx = r * 0.8;
      if (kind === "check") {
        c.moveTo(cx - rx, cy);
        c.lineTo(cx - rx * 0.2, cy + r * 0.6);
        c.lineTo(cx + rx, cy - r * 0.7);
      } else {
        c.moveTo(cx - rx, cy - r * 0.6);
        c.lineTo(cx + rx, cy + r * 0.6);
        c.moveTo(cx + rx, cy - r * 0.6);
        c.lineTo(cx - rx, cy + r * 0.6);
      }
      c.stroke();
    },
    finish() {
      const d = c.getImageData(0, 0, bw, bh);
      for (let i = 0;i < d.data.length; i += 4) {
        d.data[i] = d.data[i] > 110 ? 255 : 0;
        d.data[i + 1] = d.data[i + 1] > 110 ? 255 : 0;
        d.data[i + 2] = d.data[i + 2] > 110 ? 255 : 0;
      }
      c.putImageData(d, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(st.buf, 0, 0, W, H);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      const pw = W / bw;
      const ph = H / bh;
      for (let i = 0;i < bw; i++)
        ctx.fillRect(i * pw, 0, Math.max(1, pw * 0.12), H);
      for (let j = 0;j < bh; j++)
        ctx.fillRect(0, j * ph, W, Math.max(1, ph * 0.12));
      ctx.restore();
      for (const f of words)
        f();
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      for (let y = 0;y < H; y += 3)
        ctx.fillRect(0, y, W, 1);
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.65);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }
  };
}
var teletext_default = {
  id: "teletext",
  name: "Text-service page",
  category: "Retro UI & Neon",
  make: make72
};

// plugin/skills/motion-graphics/styles/thermal-camera.ts
var STOPS = [
  [0, 22, 0, 60],
  [0.25, 95, 10, 150],
  [0.45, 190, 30, 120],
  [0.65, 240, 95, 30],
  [0.85, 255, 195, 35],
  [1, 255, 250, 225]
];
function iron(v, a = 1) {
  const x = clamp(v);
  for (let i = 1;i < STOPS.length; i++) {
    const b = STOPS[i];
    const p = STOPS[i - 1];
    if (x <= b[0]) {
      const f = (x - p[0]) / (b[0] - p[0]);
      return `rgba(${Math.round(p[1] + (b[1] - p[1]) * f)},${Math.round(p[2] + (b[2] - p[2]) * f)},${Math.round(p[3] + (b[3] - p[3]) * f)},${a})`;
    }
  }
  return `rgba(255,250,225,${a})`;
}
var HEAT = { ink: 0.7, accent: 0.88, good: 0.95, bad: 0, muted: 0.45 };
var HUD = '"Helvetica Neue", "Arial", sans-serif';
function make73(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__thermalField ??= new Map;
  const warm = (at = 0, dur = 0.8) => clamp((t - at) / dur) ** 0.7;
  function hudText(s, x, y, size, color = "#FFFFFF", align = "left", weight = 700) {
    ctx.font = `${weight} ${Math.round(size * u)}px ${HUD}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillText(s, x + 1.5 * u, y + 1.5 * u);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }
  function heatPath(points, heat, width, close = false) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [k, f] of [
      [2.6, 0.45],
      [1.6, 0.7],
      [0.8, 1]
    ]) {
      trace(ctx, points, close);
      ctx.strokeStyle = iron(heat * f, 0.55);
      ctx.shadowColor = iron(heat * f, 0.8);
      ctx.shadowBlur = width * k * u;
      ctx.lineWidth = width * k * u;
      ctx.stroke();
    }
    ctx.restore();
  }
  function blob(cx, cy, r, heat) {
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2);
    gr.addColorStop(0, iron(heat, 1));
    gr.addColorStop(0.35, iron(heat * 0.8, 0.9));
    gr.addColorStop(0.7, iron(heat * 0.5, 0.4));
    gr.addColorStop(1, iron(heat * 0.3, 0));
    ctx.fillStyle = gr;
    ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
  }
  return {
    surface() {
      const key = `${W}x${H}`;
      let field = g.__thermalField.get(key);
      if (!field) {
        field = new OffscreenCanvas(80, 45);
        const c = field.getContext("2d");
        for (let y = 0;y < 45; y++) {
          for (let x = 0;x < 80; x++) {
            const v = 0.22 + 0.08 * Math.sin(x * 0.15 + y * 0.1) + hash(x * 7 + y * 131) * 0.06 + (y > 30 ? 0.04 : 0);
            c.fillStyle = iron(v);
            c.fillRect(x, y, 1, 1);
          }
        }
        g.__thermalField.set(key, field);
      }
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(field, 0, 0, W, H);
      ctx.restore();
    },
    title(s, o = {}) {
      const { x = 0.01, y = 0.04, size = 30, at = 0, dur = 0.9 } = o;
      if (t < at)
        return;
      const n = Math.ceil(s.length * clamp((t - at) / dur));
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${HUD}`;
      const w = ctx.measureText(s).width + 24 * u;
      ctx.fillStyle = "rgba(20,10,40,0.55)";
      ctx.fillRect(X(x), Y(y) - size * 0.8 * u, w, size * 1.6 * u);
      hudText(s.slice(0, n), X(x) + 12 * u, Y(y), size);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 26, align = "center", tone = "ink" } = o;
      if (t < at)
        return;
      const n = Math.ceil(s.length * clamp((t - at) / (o.dur ?? 0.3)));
      const color = tone === "bad" ? "#7FD8FF" : tone === "good" ? "#9DFF8A" : "#FFFFFF";
      hudText(s.slice(0, n), X(x), Y(y), size, color, align);
      if (n >= s.length && tone !== "bad") {
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillRect(X(x) - 0.5 * u, Y(y) + size * 0.55 * u, 1 * u, 6 * u);
      }
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.8, tone = "accent" } = o;
      if (t < at)
        return;
      const h = HEAT[tone] * warm(at, dur);
      blob(X(x), Y(y), r * u * 0.9, Math.max(0.3, h + 0.05 * Math.sin(t * 3 + x * 20)));
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "good" } = o;
      if (t < at)
        return;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const heat = (tone === "bad" ? 0.2 : 0.62) * warm(at, dur);
      ctx.save();
      ctx.shadowColor = iron(heat, 0.9);
      ctx.shadowBlur = 30 * u;
      ctx.fillStyle = iron(heat, 0.9);
      ctx.fillRect(x0 + 6 * u, y0 + 6 * u, bw - 12 * u, bh - 12 * u);
      ctx.restore();
      if (t > at + 0.2) {
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1.5 * u;
        ctx.strokeRect(x0, y0, bw, bh);
        hudText(`max ${(30 + heat * 25).toFixed(1)}°`, x0 + 4 * u, y0 - 10 * u, 12, "#FFFFFF", "left", 500);
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      if (!head) {
        heatPath(shown, 0.75 * warm(at, 0.6) + 0.15, 3);
        return;
      }
      const color = tone === "bad" ? "#7FD8FF" : "#FFFFFF";
      if (tone === "bad")
        heatPath(shown, 0.12, 6);
      ctx.save();
      trace(ctx, shown);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8 * u;
      ctx.stroke();
      if (p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        trace(ctx, [
          [end[0] - Math.cos(a - 0.4) * 12 * u, end[1] - Math.sin(a - 0.4) * 12 * u],
          end,
          [end[0] - Math.cos(a + 0.4) * 12 * u, end[1] - Math.sin(a + 0.4) * 12 * u]
        ]);
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (t < at)
        return;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const p = warm(at, dur);
      for (let i = 0;i < 5; i++) {
        const f = clamp(p * 5 - (4 - i));
        const sy = y0 + bh / 5 * i;
        ctx.save();
        ctx.shadowColor = iron(0.35 + 0.5 * f, 0.8);
        ctx.shadowBlur = 14 * u;
        ctx.fillStyle = iron(0.3 + 0.55 * f + 0.03 * Math.sin(t * 4 + i), 0.95);
        ctx.fillRect(x0, sy + 3 * u, bw, bh / 5 - 6 * u);
        ctx.restore();
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const done = t >= at + dur;
      ctx.save();
      ctx.font = `800 ${Math.round(size * u)}px ${HUD}`;
      const w = ctx.measureText(value).width + 24 * u;
      const hgt = size * 1.2 * u;
      if (sub) {
        ctx.fillStyle = "rgba(15,8,30,0.6)";
        ctx.fillRect(X(x) - w / 2, Y(y) - hgt / 2, w, hgt);
        if (done) {
          ctx.strokeStyle = "#7CFF6B";
          ctx.lineWidth = 2.5 * u;
          ctx.strokeRect(X(x) - w / 2, Y(y) - hgt / 2, w, hgt);
        }
        hudText(sub, X(x) - w / 2, Y(y) - hgt / 2 - 14 * u, size * 0.26, "#FFFFFF", "left", 600);
      }
      ctx.restore();
      hudText(value, X(x), Y(y) + size * 0.04 * u, size, sub && done ? "#7CFF6B" : "#FFFFFF", "center", 800);
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 30 } = o;
      if (t < at)
        return;
      const s = size * u * clamp((t - at) / 0.15);
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.strokeStyle = kind === "check" ? "#7CFF6B" : "#FF4040";
      ctx.lineWidth = 3 * u;
      ctx.lineCap = "round";
      if (kind === "check")
        trace(ctx, [
          [cx - s * 0.5, cy],
          [cx - s * 0.12, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5]
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.4, cy - s * 0.4);
        ctx.lineTo(cx + s * 0.4, cy + s * 0.4);
        ctx.moveTo(cx + s * 0.4, cy - s * 0.4);
        ctx.lineTo(cx - s * 0.4, cy + s * 0.4);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      grain(ctx, m, t, 0.05, 3);
      hudText("ε 0.95   IRONBOW", W - 150 * u, 22 * u, 12, "#FFFFFF", "right", 500);
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1.2 * u;
      ctx.strokeRect(W - 132 * u, 16 * u, 22 * u, 11 * u);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(W - 130 * u, 18 * u, 14 * u, 7 * u);
      ctx.fillStyle = Math.floor(t * 2) % 2 ? "#FF3030" : "rgba(255,48,48,0.3)";
      ctx.beginPath();
      ctx.arc(W - 96 * u, 22 * u, 4 * u, 0, Math.PI * 2);
      ctx.fill();
      hudText("REC", W - 88 * u, 22 * u, 12, "#FFFFFF", "left", 600);
      const bx = W - 42 * u;
      const by0 = H * 0.12;
      const by1 = H * 0.86;
      const sg = ctx.createLinearGradient(0, by1, 0, by0);
      for (const [v] of STOPS)
        sg.addColorStop(v, iron(v));
      ctx.fillStyle = sg;
      ctx.fillRect(bx, by0, 10 * u, by1 - by0);
      hudText("47.0", bx + 5 * u, by0 - 12 * u, 11, "#FFFFFF", "center", 500);
      hudText("19.5", bx + 5 * u, by1 + 12 * u, 11, "#FFFFFF", "center", 500);
      const sec = String(10 + Math.floor(t)).padStart(2, "0");
      hudText(`2026-10-09  23:41:${sec}`, W - 60 * u, H - 18 * u, 11, "#FFFFFF", "right", 500);
      const sx = W * (0.5 + Math.sin(t * 0.3) * 0.08);
      const sy = H * (0.5 + Math.cos(t * 0.4) * 0.05);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1.2 * u;
      ctx.beginPath();
      ctx.moveTo(sx - 14 * u, sy);
      ctx.lineTo(sx - 5 * u, sy);
      ctx.moveTo(sx + 5 * u, sy);
      ctx.lineTo(sx + 14 * u, sy);
      ctx.moveTo(sx, sy - 14 * u);
      ctx.lineTo(sx, sy - 5 * u);
      ctx.moveTo(sx, sy + 5 * u);
      ctx.lineTo(sx, sy + 14 * u);
      ctx.stroke();
      hudText(`${(28 + Math.sin(t) * 2).toFixed(1)}°C`, sx + 16 * u, sy - 12 * u, 11, "#FFFFFF", "left", 500);
    }
  };
}
var thermal_camera_default = {
  id: "thermal-camera",
  name: "Thermal camera",
  category: "Light & Imaging",
  make: make73
};

// plugin/skills/motion-graphics/styles/topographic.ts
var PAPER12 = "#EFE7D2";
var BROWN = "#9A6A44";
var INK19 = "#2E2A24";
var WATER = "#9CC3DA";
var WATER_LINE = "#3E7DB0";
var TONE17 = {
  ink: INK19,
  accent: WATER_LINE,
  good: "#2F7A45",
  bad: "#C2352B",
  muted: "#8C8070"
};
var SERIF16 = '"Iowan Old Style", "Baskerville", "Palatino", Georgia, serif';
var LEVELS = 16;
function height(x, y) {
  let h = 0.35 + 0.08 * Math.sin(x * 5.1 + 1) * Math.cos(y * 4.3);
  for (let i = 0;i < 7; i++) {
    const cx = hash(i * 3.7 + 1) * 1.2 - 0.1;
    const cy = hash(i * 5.3 + 2) * 1.2 - 0.1;
    const s = 0.08 + hash(i * 7.1) * 0.14;
    const a = (hash(i * 9.9) - 0.35) * 0.9;
    h += a * Math.exp(-((x - cx) ** 2 + ((y - cy) * 0.75) ** 2) / (2 * s * s));
  }
  return h;
}
function make74(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const serif = (size, style = "600") => `${style} ${Math.round(size * u)}px ${SERIF16}`;
  const g = globalThis;
  g.__topoPlates ??= new Map;
  const cache = g.__topoPlates;
  function plates() {
    const key = `${W}x${H}`;
    let p = cache.get(key);
    if (p)
      return p;
    const sw = 256;
    const sh = Math.round(256 * H / W);
    const shade = new OffscreenCanvas(sw, sh);
    const sc = shade.getContext("2d");
    const img = sc.createImageData(sw, sh);
    let lo = 1e9;
    let hi = -1e9;
    const field = [];
    for (let y = 0;y < sh; y++)
      for (let x = 0;x < sw; x++) {
        const v = height(x / sw, y / sh * (H / W) * 1.6);
        field.push(v);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    for (let y = 1;y < sh - 1; y++)
      for (let x = 1;x < sw - 1; x++) {
        const i = y * sw + x;
        const dx = field[i + 1] - field[i - 1];
        const dy = field[i + sw] - field[i - sw];
        const light = clamp(0.5 + (-dx - dy) * 25);
        const v = (field[i] - lo) / (hi - lo);
        const wood = v > 0.32 && v < 0.55 && hash(Math.floor(x / 9) * 7 + Math.floor(y / 9) * 13) > 0.35;
        const k = i * 4;
        const shadeA = (1 - light) * 0.35;
        img.data[k] = wood ? 170 : 90;
        img.data[k + 1] = wood ? 200 : 80;
        img.data[k + 2] = wood ? 140 : 70;
        img.data[k + 3] = Math.round(255 * (wood ? 0.35 + shadeA * 0.5 : shadeA));
      }
    sc.putImageData(img, 0, 0);
    const gw = 160;
    const gh = Math.round(160 * H / W);
    const hv = (x, y) => (height(x / gw, y / gh * (H / W) * 1.6) - lo) / (hi - lo);
    const grid = Array.from({ length: gh + 1 }, (_, y) => Array.from({ length: gw + 1 }, (_, x) => hv(x, y)));
    const cw = W / gw;
    const ch = H / gh;
    const levels = [];
    for (let l = 1;l <= LEVELS; l++) {
      const iso = l / (LEVELS + 1);
      const path = new Path2D;
      for (let y = 0;y < gh; y++)
        for (let x = 0;x < gw; x++) {
          const a = grid[y]?.[x];
          const b = grid[y]?.[x + 1];
          const c = grid[y + 1]?.[x + 1];
          const d = grid[y + 1]?.[x];
          const pts = [];
          const edge = (v1, v2, p1, p2) => {
            if (v1 < iso !== v2 < iso) {
              const f = (iso - v1) / (v2 - v1);
              pts.push([(p1[0] + (p2[0] - p1[0]) * f) * cw, (p1[1] + (p2[1] - p1[1]) * f) * ch]);
            }
          };
          edge(a, b, [x, y], [x + 1, y]);
          edge(b, c, [x + 1, y], [x + 1, y + 1]);
          edge(c, d, [x + 1, y + 1], [x, y + 1]);
          edge(d, a, [x, y + 1], [x, y]);
          for (let k = 0;k + 1 < pts.length; k += 2) {
            path.moveTo(pts[k][0], pts[k][1]);
            path.lineTo(pts[k + 1][0], pts[k + 1][1]);
          }
        }
      levels.push(path);
    }
    p = { shade, levels };
    cache.set(key, p);
    return p;
  }
  function caps(s, x, y, size, color, align = "center", style = "600") {
    ctx.save();
    ctx.font = serif(size, style);
    ctx.letterSpacing = style.includes("italic") ? "0px" : `${Math.round(size * 0.1 * u)}px`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4 * u;
    ctx.strokeStyle = alpha(PAPER12, 0.85);
    const str = style.includes("italic") ? s : s.toUpperCase();
    ctx.strokeText(str, x, y);
    ctx.fillText(str, x, y);
    ctx.restore();
  }
  function cartouche(x, y, w, h, a) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = alpha(PAPER12, 0.94);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = INK19;
    ctx.lineWidth = 1.6 * u;
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 0.8 * u;
    ctx.strokeRect(x + 4 * u, y + 4 * u, w - 8 * u, h - 8 * u);
    ctx.restore();
  }
  return {
    surface() {
      ctx.fillStyle = PAPER12;
      ctx.fillRect(0, 0, W, H);
      const { shade, levels } = plates();
      const sp = progress(t, 0, 0.8);
      ctx.save();
      ctx.globalAlpha = sp;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(shade, 0, 0, W, H);
      ctx.restore();
      const shown = Math.floor(progress(t, 0.4, 2.2) * LEVELS);
      ctx.save();
      for (let l = 0;l < shown; l++) {
        const index = (l + 1) % 5 === 0;
        ctx.strokeStyle = alpha(BROWN, index ? 0.8 : 0.5);
        ctx.lineWidth = (index ? 1.8 : 0.9) * u;
        ctx.stroke(levels[l]);
      }
      ctx.restore();
      const m0 = 14 * u;
      ctx.strokeStyle = INK19;
      ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(m0, m0, W - 2 * m0, H - 2 * m0);
      const [sx, sy] = [X(0.04), Y(0.94)];
      for (let k = 0;k < 4; k++) {
        ctx.fillStyle = k % 2 ? PAPER12 : INK19;
        ctx.fillRect(sx + k * 30 * u, sy, 30 * u, 5 * u);
      }
      ctx.strokeRect(sx, sy, 120 * u, 5 * u);
      ctx.font = serif(11);
      ctx.fillStyle = INK19;
      ctx.textAlign = "left";
      ctx.fillText("SCALE 1:24 000", sx + 130 * u, sy + 5 * u);
      ctx.beginPath();
      ctx.moveTo(X(0.965), Y(0.88));
      ctx.lineTo(X(0.965) - 7 * u, Y(0.88) + 24 * u);
      ctx.lineTo(X(0.965), Y(0.88) + 18 * u);
      ctx.closePath();
      ctx.fill();
      ctx.font = serif(13);
      ctx.textAlign = "center";
      ctx.fillText("N", X(0.965), Y(0.88) - 8 * u);
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.05, size = 36, at = 0 } = o;
      const p = expo(progress(t, at, 0.6));
      if (p <= 0)
        return;
      ctx.font = serif(size);
      ctx.letterSpacing = `${Math.round(size * 0.1 * u)}px`;
      const w = ctx.measureText(s.toUpperCase()).width + 36 * u;
      ctx.letterSpacing = "0px";
      const h = size * 1.7 * u;
      cartouche(X(x), Y(y), w, h, p);
      ctx.save();
      ctx.globalAlpha = p;
      caps(s, X(x) + 18 * u, Y(y) + h / 2, size, INK19, "left");
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { size = 28, align = "center", tone = "ink", at = 0 } = o;
      const p = progress(t, at, 0.4);
      if (p <= 0)
        return;
      ctx.save();
      ctx.globalAlpha = p;
      const hand = tone === "bad" || tone === "accent";
      caps(s, X(x), Y(y), hand ? size * 1.1 : size, TONE17[tone], align, hand ? "italic 500" : "600");
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const at = o.at ?? 0;
      const col = o.tone === "accent" || !o.tone ? BROWN : TONE17[o.tone];
      const [cx, cy] = [X(x), Y(y)];
      const R = r * u;
      for (let k = 0;k < 3; k++) {
        const p = progress(t, at + k * 0.08, 0.3);
        if (p <= 0)
          continue;
        const rr = R * (1 - k * 0.3);
        const pts = ellipse(cx, cy, rr, rr * 0.85, 32).map(([px, py], i) => [px + (hash(i + k * 40 + x * 99) - 0.5) * 2 * u, py]);
        ctx.save();
        trace(ctx, pts.slice(0, Math.max(2, Math.round(pts.length * p))));
        if (k === 0 && p >= 1) {
          ctx.fillStyle = alpha(PAPER12, 0.9);
          ctx.fill();
        }
        ctx.strokeStyle = col;
        ctx.lineWidth = (k === 0 ? 2.2 : 1.2) * u;
        ctx.stroke();
        ctx.restore();
      }
      if (progress(t, at + 0.2, 0.1) > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5 * u, 0, Math.PI * 2);
        ctx.fillStyle = o.tone === "bad" ? TONE17.bad : INK19;
        ctx.fill();
      }
    },
    box(x, y, w, h, o = {}) {
      const p = expo(progress(t, o.at, 0.5));
      if (p <= 0)
        return;
      cartouche(X(x), Y(y), X(w), Y(h), p);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.5, bend = 0, head = true, tone = "bad" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const { points: shown, angle } = along(pts, p);
      ctx.save();
      trace(ctx, shown);
      if (!head) {
        ctx.strokeStyle = alpha(WATER_LINE, 0.55);
        ctx.lineWidth = 1 * u;
        ctx.stroke();
      } else {
        ctx.setLineDash([9 * u, 6 * u]);
        ctx.strokeStyle = tone === "accent" ? WATER_LINE : tone === "ink" ? INK19 : TONE17[tone];
        ctx.lineWidth = 3 * u;
        ctx.stroke();
        ctx.setLineDash([]);
        const tip = shown.at(-1);
        if (p < 1) {
          ctx.beginPath();
          ctx.arc(tip[0], tip[1], 5 * u, 0, Math.PI * 2);
          ctx.fillStyle = TONE17.bad;
          ctx.fill();
        } else {
          arrowhead(ctx, tip, angle, 13 * u);
          ctx.lineWidth = 2.5 * u;
          ctx.stroke();
        }
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const p = expo(progress(t, at, o.dur ?? 0.8));
      if (p <= 0)
        return;
      const [cx, cy] = [X(x + w / 2), Y(y + h / 2)];
      const [rx, ry] = [X(w) * 0.62, Y(h) * 0.55];
      const shore = (k) => ellipse(cx, cy, rx * k, ry * k, 48).map(([px, py], i) => {
        const a = i / 48 * Math.PI * 2;
        const wob = 1 + Math.sin(a * 3 + 1) * 0.08 + Math.sin(a * 5) * 0.05;
        return [cx + (px - cx) * wob, cy + (py - cy) * wob];
      });
      ctx.save();
      ctx.globalAlpha = p;
      trace(ctx, shore(1), true);
      ctx.fillStyle = WATER;
      ctx.fill();
      ctx.strokeStyle = WATER_LINE;
      ctx.lineWidth = 1.8 * u;
      ctx.stroke();
      for (let k = 1;k <= 3; k++) {
        if (progress(t, at + k * 0.15, 0.2) <= 0)
          continue;
        trace(ctx, shore(1 - k * 0.18), true);
        ctx.strokeStyle = alpha(WATER_LINE, 0.5);
        ctx.lineWidth = 0.9 * u;
        ctx.stroke();
      }
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "ink" } = o;
      const p = expo(progress(t, at, 0.4));
      if (p <= 0)
        return;
      const str = count ? counting(t, at, dur, count) + s : s;
      const [cx, cy] = [X(x), Y(y)];
      if (sub) {
        ctx.font = serif(size, "700");
        const w = ctx.measureText(`${count ? count[1] : ""}${s}`).width + 50 * u;
        const h = size * 1.9 * u;
        cartouche(cx - w / 2, cy - h / 2, w, h, p);
      }
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = serif(size, "700");
      ctx.fillStyle = sub ? TONE17.bad : tone === "good" ? TONE17.good : INK19;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(str, cx, cy - (sub ? size * 0.15 * u : 0));
      if (sub) {
        ctx.font = serif(size * 0.3, "italic 500");
        ctx.fillStyle = INK19;
        ctx.fillText(sub, cx, cy + size * 0.58 * u);
      }
      ctx.restore();
    },
    mark(kind, x, y, o = {}) {
      const p = progress(t, o.at, 0.3);
      if (p <= 0)
        return;
      const r = (o.size ?? 22) * u;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = kind === "check" ? WATER_LINE : TONE17.bad;
      ctx.lineWidth = 3.2 * u;
      const pts = kind === "check" ? [
        [cx - r * 0.6, cy],
        [cx - r * 0.15, cy + r * 0.5],
        [cx + r * 0.7, cy - r * 0.7]
      ] : [
        [cx - r * 0.5, cy - r * 0.5],
        [cx + r * 0.5, cy + r * 0.5]
      ];
      trace(ctx, along(pts, p).points);
      ctx.stroke();
      if (kind === "cross" && p > 0.5) {
        trace(ctx, [
          [cx + r * 0.5, cy - r * 0.5],
          [cx - r * 0.5, cy + r * 0.5]
        ]);
        ctx.stroke();
      }
      ctx.restore();
    },
    finish() {}
  };
}
var topographic_default = {
  id: "topographic",
  name: "Survey map",
  category: "Data & Information",
  make: make74
};

// plugin/skills/motion-graphics/styles/transit-map.ts
var PAPER13 = "#F4F2EC";
var NAVY6 = "#1C2340";
var LINE8 = {
  ink: NAVY6,
  accent: "#1F6FD1",
  good: "#13914A",
  bad: "#DC2B2B",
  muted: "#A3A3A3"
};
var AMBER2 = "#FFC21A";
var SANS12 = '"Gill Sans", "Helvetica Neue", "Avenir Next", Arial, sans-serif';
var MONO12 = '"Menlo", "SF Mono", "Courier New", monospace';
function route(a, b, bend) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (bend) {
    const off = [(a[1] - b[1]) * bend, (b[0] - a[0]) * bend];
    const len = Math.hypot(...off) || 1;
    const dir = [dx / (Math.hypot(dx, dy) || 1), dy / (Math.hypot(dx, dy) || 1)];
    return [
      a,
      [a[0] + off[0] + dir[0] * len, a[1] + off[1] + dir[1] * len],
      [b[0] + off[0] - dir[0] * len, b[1] + off[1] - dir[1] * len],
      b
    ];
  }
  const sx = Math.sign(dx) || 1;
  const sy = Math.sign(dy) || 1;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ay < 1 || ax < 1)
    return [a, b];
  if (ay <= ax * 0.6) {
    const mx = (a[0] + b[0]) / 2;
    return [a, [mx - sx * ay / 2, a[1]], [mx + sx * ay / 2, b[1]], b];
  }
  const h = ax * 0.2;
  const k = ax * 0.3;
  return [
    a,
    [a[0] + sx * h, a[1]],
    [a[0] + sx * (h + k), a[1] + sy * k],
    [a[0] + sx * (h + k), b[1] - sy * k],
    [b[0] - sx * h, b[1]],
    b
  ];
}
function make75(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const font = (size, w = 600) => `${w} ${Math.round(size * u)}px ${SANS12}`;
  const pop = (at = 0) => spring(t, { start: at, stiffness: 300, damping: 15 });
  const g = globalThis;
  g.__metroDots ??= new Map;
  const cache = g.__metroDots;
  function stroke(points, color, w) {
    ctx.save();
    trace(ctx, points);
    ctx.strokeStyle = color;
    ctx.lineWidth = w * u;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  }
  function station(x, y, r, ring = NAVY6) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.lineWidth = Math.max(2.5 * u, r * 0.3);
    ctx.strokeStyle = ring;
    ctx.stroke();
  }
  function board(s, cx, cy, size, sub) {
    ctx.font = `700 ${Math.round(size * u)}px ${MONO12}`;
    const w = Math.max(ctx.measureText(s).width, sub ? ctx.measureText(sub.toUpperCase()).width * 0.35 : 0) + size * 0.6 * u;
    const h = size * (sub ? 1.75 : 1.25) * u;
    const [bx, by] = [cx - w / 2, cy - h / 2];
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(bx, by, w, h, 8 * u);
    ctx.fillStyle = "#14130F";
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = AMBER2;
    ctx.shadowColor = "rgba(255,194,26,0.6)";
    ctx.shadowBlur = 8 * u;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (sub) {
      ctx.font = `700 ${Math.round(size * 0.3 * u)}px ${MONO12}`;
      ctx.fillText(sub.toUpperCase(), cx, by + size * 0.3 * u);
    }
    ctx.font = `700 ${Math.round(size * u)}px ${MONO12}`;
    ctx.fillText(s, cx, cy + (sub ? size * 0.18 * u : 0));
    ctx.shadowBlur = 0;
    const step = Math.max(3, Math.round(4 * u));
    const key = `${step}`;
    let tile = cache.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(step, step);
      const c = tile.getContext("2d");
      c.fillStyle = "#14130F";
      c.fillRect(0, 0, step, step);
      c.globalCompositeOperation = "destination-out";
      c.beginPath();
      c.arc(step / 2, step / 2, step * 0.46, 0, Math.PI * 2);
      c.fill();
      cache.set(key, tile);
    }
    ctx.fillStyle = ctx.createPattern(tile, "repeat");
    ctx.fillRect(bx, by, w, h);
    ctx.restore();
  }
  return {
    surface() {
      ctx.fillStyle = PAPER13;
      ctx.fillRect(0, 0, W, H);
      stroke([
        [0, Y(0.86)],
        [X(0.3), Y(0.86)],
        [X(0.36), Y(0.94)],
        [X(0.7), Y(0.94)],
        [X(0.76), Y(0.86)],
        [W, Y(0.86)]
      ], "#BFDCEB", 26);
    },
    title(s, o = {}) {
      const { x = 0.025, y = 0.04, size = 40, at = 0 } = o;
      const p = expo(progress(t, at, 0.5));
      if (p <= 0)
        return;
      ctx.font = font(size, 700);
      const w = ctx.measureText(s).width + 90 * u;
      const h = size * 1.9 * u;
      const [bx, by] = [X(x), Y(y)];
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, w * p, h);
      ctx.clip();
      ctx.fillStyle = NAVY6;
      ctx.fillRect(bx, by, w, h);
      const [mx, my] = [bx + 30 * u, by + h / 2];
      for (const [i, c] of [LINE8.accent, LINE8.bad, LINE8.good].entries()) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / 3;
        stroke([
          [mx, my],
          [mx + Math.cos(a) * 18 * u, my + Math.sin(a) * 18 * u]
        ], c, 6);
      }
      station(mx, my, 6 * u);
      ctx.font = font(size, 700);
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(s, bx + 58 * u, by + h / 2);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { size = 32, align = "center", tone = "ink", at = 0 } = o;
      const p = expo(progress(t, at, 0.3));
      if (p <= 0)
        return;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.font = font(size, 700);
      ctx.fillStyle = tone === "ink" || tone === "muted" ? NAVY6 : LINE8[tone];
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.fillText(s, X(x), Y(y) + (1 - p) * 6 * u);
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const s = pop(o.at);
      if (s <= 0)
        return;
      station(X(x), Y(y), r * u * 0.6 * s, o.tone === "accent" || !o.tone ? NAVY6 : LINE8[o.tone]);
    },
    box(x, y, w, h, o = {}) {
      const s = expo(progress(t, o.at, 0.4));
      if (s <= 0)
        return;
      const [bx, by, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      ctx.save();
      ctx.globalAlpha = s;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 14 * u);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.lineWidth = 5 * u;
      ctx.strokeStyle = LINE8[o.tone ?? "ink"];
      ctx.stroke();
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.5, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = route([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const { points: shown } = along(pts, expo(p));
      const col = LINE8[tone];
      stroke(shown, col, head ? 14 : 5);
      if (head) {
        if (p >= 1) {
          const n = 3;
          for (let i = 0;i < n; i++) {
            const f = (t * 0.35 + i / n) % 1;
            const { points: q, angle } = along(pts, f);
            const tip = q.at(-1);
            ctx.save();
            ctx.translate(tip[0], tip[1]);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(-3 * u, -4 * u);
            ctx.lineTo(2 * u, 0);
            ctx.lineTo(-3 * u, 4 * u);
            ctx.strokeStyle = "#FFFFFF";
            ctx.lineWidth = 2.2 * u;
            ctx.stroke();
            ctx.restore();
          }
          const end = pts.at(-1);
          const prev = pts.at(-2);
          const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]) + Math.PI / 2;
          stroke([
            [end[0] + Math.cos(a) * 12 * u, end[1] + Math.sin(a) * 12 * u],
            [end[0] - Math.cos(a) * 12 * u, end[1] - Math.sin(a) * 12 * u]
          ], col, 7);
        }
      }
    },
    store(x, y, w, h, o = {}) {
      const at = o.at ?? 0;
      const p = expo(progress(t, at, o.dur ?? 0.8));
      if (p <= 0)
        return;
      const [bx, by, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      ctx.save();
      ctx.globalAlpha = clamp(p * 2);
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 12 * u);
      ctx.fillStyle = "#E7E4DA";
      ctx.fill();
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = NAVY6;
      ctx.stroke();
      ctx.restore();
      const cols = [LINE8.accent, LINE8.bad, LINE8.good, "#F2A900"];
      for (const [i, c] of cols.entries()) {
        const yy = by + bh / (cols.length + 1) * (i + 1);
        const q = progress(t, at + i * 0.1, 0.4);
        if (q > 0)
          stroke([
            [bx + 10 * u, yy],
            [bx + 10 * u + (bw - 20 * u) * expo(q), yy]
          ], c, 7);
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub } = o;
      const p = expo(progress(t, at, 0.3));
      if (p <= 0)
        return;
      const str = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.translate(X(x), Y(y));
      ctx.scale(1, p);
      board(str, 0, 0, size * 1.05, sub);
      ctx.restore();
    },
    mark(kind, x, y, o = {}) {
      const s = pop(o.at);
      if (s <= 0)
        return;
      const r = (o.size ?? 24) * u * s;
      const col = kind === "check" ? LINE8.good : LINE8.bad;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = col;
      ctx.lineWidth = 5 * u;
      if (kind === "check")
        trace(ctx, [
          [cx - r * 0.6, cy],
          [cx - r * 0.15, cy + r * 0.45],
          [cx + r * 0.7, cy - r * 0.6]
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.5, cy - r * 0.5);
        ctx.lineTo(cx + r * 0.5, cy + r * 0.5);
        ctx.moveTo(cx + r * 0.5, cy - r * 0.5);
        ctx.lineTo(cx - r * 0.5, cy + r * 0.5);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {}
  };
}
var transit_map_default = {
  id: "transit-map",
  name: "Metro diagram",
  category: "Data & Information",
  make: make75
};

// plugin/skills/motion-graphics/styles/truchet.ts
var NAVY7 = "#1C2240";
var ORANGE = "#E5603A";
var CREAM8 = "#EFE7D6";
var GREY3 = "#6E7386";
var TILE2 = {
  ink: NAVY7,
  accent: NAVY7,
  good: NAVY7,
  bad: ORANGE,
  muted: GREY3
};
var HEAVY4 = '"Archivo Black", "Arial Black", "Helvetica Neue", Arial, sans-serif';
function make76(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__truchet ??= new Map;
  const cache = g.__truchet;
  function paper() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const b = c.getContext("2d");
      b.fillStyle = CREAM8;
      b.fillRect(0, 0, W, H);
      for (let i = 0;i < W * H / 80; i++) {
        b.fillStyle = hash(i * 1.3) > 0.5 ? "rgba(255,255,255,0.25)" : "rgba(90,70,40,0.06)";
        b.fillRect(hash(i * 0.7) * W, hash(i * 1.9 + 2) * H, 1.5 * u, 1.5 * u);
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  function tile(cx, cy, s, flip, turn, ink, path = CREAM8) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(turn + (flip ? Math.PI / 2 : 0));
    ctx.fillStyle = ink;
    ctx.fillRect(-s / 2 - 0.5, -s / 2 - 0.5, s + 1, s + 1);
    ctx.strokeStyle = path;
    ctx.lineWidth = s / 3;
    ctx.beginPath();
    ctx.arc(-s / 2, -s / 2, s / 2, 0, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2, Math.PI, Math.PI * 1.5);
    ctx.stroke();
    ctx.restore();
  }
  const land = (at) => {
    const p = expo(progress(t, at, 0.35));
    return { p, turn: (1 - p) * (Math.PI / 2) };
  };
  function block(s, x, y, o = {}) {
    const { at = 0, size = 22, align = "center", tone = "ink" } = o;
    const p = expo(progress(t, at, o.dur ?? 0.3));
    if (p <= 0)
      return;
    ctx.save();
    ctx.font = `400 ${Math.round(size * u)}px ${HEAVY4}`;
    ctx.letterSpacing = `${size * 0.12 * u}px`;
    ctx.textBaseline = "middle";
    const text = s.toUpperCase();
    const w = ctx.measureText(text).width + size * 0.9 * u;
    const h = size * 1.6 * u;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    const top = Y(y) - h / 2;
    const off = (3 + (1 - p) * 10) * u;
    const slab = tone === "bad" ? ORANGE : NAVY7;
    const shadow = tone === "bad" ? NAVY7 : ORANGE;
    ctx.fillStyle = shadow;
    ctx.fillRect(left + off, top + off, w * p, h);
    ctx.fillStyle = slab;
    ctx.fillRect(left, top, w * p, h);
    ctx.beginPath();
    ctx.rect(left, top, w * p, h);
    ctx.clip();
    ctx.fillStyle = CREAM8;
    ctx.fillText(text, left + size * 0.45 * u, Y(y) + u);
    ctx.restore();
  }
  return {
    surface() {
      paper();
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 42, at = 0 } = o;
      block(s, x, y, { ...o, at, size, align: o.align ?? "left", dur: o.dur ?? 0.4 });
    },
    label(s, x, y, o = {}) {
      block(s, x, y, { size: 26, ...o });
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      if (t < at)
        return;
      const { p, turn } = land(at);
      const s = r * 2.5 * u * (0.6 + 0.4 * p);
      ctx.save();
      ctx.globalAlpha = p;
      ctx.fillStyle = ORANGE;
      ctx.fillRect(X(x) - s / 2 + 3 * u, Y(y) - s / 2 + 3 * u, s, s);
      ctx.restore();
      tile(X(x), Y(y), s, hash(x * 31 + y * 17) > 0.5, turn, TILE2[tone]);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "ink" } = o;
      if (t < at)
        return;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const n = Math.max(3, Math.round(bh / (34 * u)));
      const s = bh / n;
      const cols = Math.ceil(bw / s);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, bw, bh);
      ctx.clip();
      for (let i = 0;i < cols; i++)
        for (let j = 0;j < n; j++) {
          const a = at + (i + j) / (cols + n) * dur;
          if (t < a)
            continue;
          const { turn } = land(a);
          tile(x0 + (i + 0.5) * s, y0 + (j + 0.5) * s, s, hash(i * 7.1 + j * 3.3 + x * 50) > 0.5, turn, TILE2[tone]);
        }
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = NAVY7;
      ctx.lineWidth = 3 * u;
      ctx.strokeRect(x0, y0, bw, bh);
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { bend = 0, at = 0, dur = 0.35, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const shaft = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = along(shaft, p).points;
      ctx.save();
      ctx.lineCap = "round";
      if (tone === "bad") {
        ctx.strokeStyle = NAVY7;
        ctx.lineWidth = 14 * u;
        trace(ctx, shown);
        ctx.stroke();
        ctx.strokeStyle = ORANGE;
        ctx.lineWidth = 9 * u;
        trace(ctx, shown);
        ctx.stroke();
      } else {
        ctx.strokeStyle = tone === "accent" ? GREY3 : NAVY7;
        ctx.lineWidth = (tone === "accent" ? 1.4 : 2.4) * u;
        trace(ctx, shown);
        ctx.stroke();
      }
      if (head && p >= 1) {
        const end = shaft.at(-1);
        const prev = shaft.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = (tone === "bad" ? 26 : 14) * u;
        ctx.fillStyle = tone === "bad" ? ORANGE : NAVY7;
        trace(ctx, [
          end,
          [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
          [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s]
        ], true);
        ctx.fill();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "ink" } = o;
      if (t < at)
        return;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const s = bw / 2;
      const rows = Math.max(1, Math.floor(bh / s));
      for (let j = rows - 1, k = 0;j >= 0; j--)
        for (let i = 0;i < 2; i++, k++) {
          const a = at + k / (rows * 2) * dur;
          if (t < a)
            continue;
          const { turn } = land(a);
          tile(x0 + (i + 0.5) * s, y0 + bh - (rows - j - 0.5) * s, s, hash(i * 5 + j * 9) > 0.5, turn, TILE2[tone]);
        }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      const p = expo(progress(t, at, 0.4));
      if (p <= 0)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      ctx.save();
      ctx.font = `400 ${Math.round(size * u)}px ${HEAVY4}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.letterSpacing = `${size * 0.04 * u}px`;
      const off = (4 + (1 - p) * 14) * (size / 90) * u;
      if (size < 80) {
        const w = ctx.measureText(value).width + size * 0.5 * u;
        ctx.fillStyle = CREAM8;
        ctx.fillRect(X(x) - w / 2, Y(y) - size * 0.65 * u, w, size * 1.3 * u);
        ctx.strokeStyle = NAVY7;
        ctx.lineWidth = 3 * u;
        ctx.strokeRect(X(x) - w / 2, Y(y) - size * 0.65 * u, w, size * 1.3 * u);
      }
      ctx.fillStyle = ORANGE;
      ctx.fillText(value, X(x) + off, Y(y) + off);
      ctx.fillStyle = NAVY7;
      ctx.fillText(value, X(x), Y(y));
      ctx.restore();
      if (sub)
        block(sub, x, y - size * 1.05 * u / H, { at: at + 0.2, size: 24 });
      if (size >= 80) {
        const rp = progress(t, at + dur, 0.4);
        if (rp > 0) {
          ctx.save();
          ctx.strokeStyle = ORANGE;
          ctx.lineWidth = 4 * u;
          trace(ctx, along(ellipse(X(x), Y(y), size * 1.5 * u, size * 0.75 * u, 60, -Math.PI / 2), rp).points);
          ctx.stroke();
          ctx.restore();
        }
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0 } = o;
      if (t < at)
        return;
      const { p, turn } = land(at);
      const s = (o.size ?? 34) * u * (0.6 + 0.4 * p);
      ctx.save();
      ctx.translate(X(x), Y(y));
      ctx.rotate(turn);
      ctx.fillStyle = NAVY7;
      ctx.fillRect(-s / 2 + 3 * u, -s / 2 + 3 * u, s, s);
      ctx.fillStyle = ORANGE;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.strokeStyle = CREAM8;
      ctx.lineWidth = s * 0.14;
      ctx.lineCap = "square";
      if (kind === "check")
        trace(ctx, [
          [-s * 0.28, 0],
          [-s * 0.06, s * 0.22],
          [s * 0.3, -s * 0.22]
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(-s * 0.25, -s * 0.25);
        ctx.lineTo(s * 0.25, s * 0.25);
        ctx.moveTo(s * 0.25, -s * 0.25);
        ctx.lineTo(-s * 0.25, s * 0.25);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {}
  };
}
var truchet_default = {
  id: "truchet",
  name: "Truchet print",
  category: "Generative & Type",
  make: make76
};

// plugin/skills/motion-graphics/styles/ukiyo-e.ts
var SUMI = "#2A2420";
var WASHI = "#EFE2C4";
var CARD2 = "#F6ECD2";
var GOLD4 = "#B8913F";
var BLOCK4 = {
  ink: "#5B3A26",
  accent: "#1F4C7A",
  good: "#3F6E52",
  bad: "#C2412D",
  muted: "#9A8B70"
};
var SERIF17 = '"Hiragino Mincho ProN", "Yu Mincho", "Iowan Old Style", "Palatino", Georgia, serif';
function make77(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const font = (size, w = 600) => `${w} ${Math.round(size * u)}px ${SERIF17}`;
  const g = globalThis;
  g.__ukiyoPaper ??= new Map;
  const cache = g.__ukiyoPaper;
  function press(at = 0, dur = 0.6) {
    const p = progress(t, at, dur);
    return {
      key: clamp(p / 0.35),
      color: clamp((p - 0.35) / 0.4),
      shift: (1 - clamp((p - 0.35) / 0.65)) * 6 * u,
      on: p > 0
    };
  }
  function paper() {
    const key = `${W}x${H}`;
    let c = cache.get(key);
    if (!c) {
      c = new OffscreenCanvas(W, H);
      const x = c.getContext("2d");
      x.fillStyle = WASHI;
      x.fillRect(0, 0, W, H);
      const sky = x.createLinearGradient(0, 0, 0, H * 0.45);
      sky.addColorStop(0, "rgba(31,76,122,0.55)");
      sky.addColorStop(0.35, "rgba(31,76,122,0.18)");
      sky.addColorStop(1, "rgba(31,76,122,0)");
      x.fillStyle = sky;
      x.fillRect(0, 0, W, H * 0.45);
      x.strokeStyle = "rgba(90,60,30,0.06)";
      x.lineWidth = 1.2 * u;
      for (let i = 0;i < 60; i++) {
        const y0 = hash(i * 3.3) * H;
        x.beginPath();
        for (let px = 0;px <= W; px += 20 * u)
          x.lineTo(px, y0 + Math.sin(px / (140 * u) + i) * 6 * u);
        x.stroke();
      }
      x.strokeStyle = "rgba(120,90,50,0.10)";
      for (let i = 0;i < 500; i++) {
        const fx = hash(i * 1.7) * W;
        const fy = hash(i * 2.9) * H;
        const a = hash(i * 4.1) * Math.PI;
        const l = (4 + hash(i * 5.3) * 14) * u;
        x.beginPath();
        x.moveTo(fx, fy);
        x.quadraticCurveTo(fx + Math.cos(a) * l, fy + Math.sin(a + 1) * l, fx + Math.cos(a) * l * 1.6, fy + Math.sin(a) * l * 1.6);
        x.stroke();
      }
      cache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  function sea() {
    const top = H * 0.88;
    const bands = ["#9CB8C9", "#5E86A6", "#2F5B84", "#1D3D61"];
    for (const [i, col] of bands.entries()) {
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let px = 0;px <= W + 10; px += 10 * u)
        ctx.lineTo(px, top + i * 14 * u + Math.sin(px / (60 * u) + t * 1.2 + i) * 4 * u);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(246,236,210,0.9)";
    ctx.lineWidth = 2 * u;
    for (let k = 0;k < 18; k++) {
      const cx = (k / 18 * W + t * 20 * u) % (W + 40 * u);
      const cy = top + Math.sin(cx / (60 * u) + t * 1.2) * 4 * u;
      ctx.beginPath();
      ctx.arc(cx, cy + 6 * u, 7 * u, Math.PI * 1.05, Math.PI * 1.9);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(246,236,210,0.35)";
    ctx.lineWidth = 1.2 * u;
    for (let r = 0;r < 4; r++) {
      ctx.beginPath();
      for (let px = 0;px <= W; px += 12 * u)
        ctx.lineTo(px, top + (22 + r * 14) * u + Math.sin(px / (40 * u) + r + t) * 2 * u);
      ctx.stroke();
    }
  }
  function cartouche(x, y, w, h, pr, edge = SUMI) {
    ctx.save();
    if (pr.color > 0) {
      ctx.globalAlpha = pr.color;
      ctx.fillStyle = CARD2;
      ctx.fillRect(x + pr.shift, y + pr.shift, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = edge;
    ctx.lineWidth = 3 * u;
    ctx.globalAlpha = pr.key;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = GOLD4;
    ctx.lineWidth = 1.5 * u;
    ctx.strokeRect(x + 5 * u, y + 5 * u, w - 10 * u, h - 10 * u);
    ctx.restore();
  }
  return {
    surface() {
      paper();
      ctx.beginPath();
      ctx.arc(X(0.93), Y(0.16), 52 * u, 0, Math.PI * 2);
      ctx.fillStyle = alpha(BLOCK4.bad, 0.92);
      ctx.fill();
      sea();
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.05, size = 50, at = 0, dur = 0.8 } = o;
      const pr = press(at, dur);
      if (!pr.on)
        return;
      ctx.font = font(size);
      const w = ctx.measureText(s).width + 44 * u;
      const h = size * 1.7 * u;
      cartouche(X(x), Y(y), w, h, pr);
      ctx.save();
      ctx.globalAlpha = pr.color;
      text(ctx, s, X(x) + 22 * u, Y(y) + h / 2, font(size), SUMI);
      ctx.fillStyle = BLOCK4.bad;
      ctx.fillRect(X(x) + w + 10 * u, Y(y) + 4 * u, 26 * u, 26 * u);
      ctx.strokeStyle = CARD2;
      ctx.lineWidth = 2 * u;
      ctx.strokeRect(X(x) + w + 14 * u, Y(y) + 8 * u, 18 * u, 18 * u);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { size = 34, align = "center", tone = "ink", at = 0 } = o;
      const pr = press(at, o.dur ?? 0.45);
      if (!pr.on)
        return;
      ctx.font = font(size);
      const w = ctx.measureText(s).width + 22 * u;
      const h = size * 1.45 * u;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      cartouche(left, Y(y) - h / 2, w, h, pr, tone === "ink" || tone === "muted" ? SUMI : BLOCK4[tone]);
      ctx.save();
      ctx.globalAlpha = pr.color;
      text(ctx, s, left + w / 2, Y(y), font(size), tone === "ink" ? SUMI : BLOCK4[tone], "center");
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const pr = press(o.at, o.dur ?? 0.5);
      if (!pr.on)
        return;
      const R = r * u;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      if (pr.color > 0) {
        ctx.globalAlpha = pr.color;
        ctx.beginPath();
        ctx.arc(cx + pr.shift, cy + pr.shift, R, 0, Math.PI * 2);
        ctx.fillStyle = BLOCK4[o.tone ?? "accent"];
        ctx.fill();
        ctx.strokeStyle = alpha(CARD2, 0.75);
        ctx.lineWidth = 1.6 * u;
        const sp = Array.from({ length: 40 }, (_, i) => {
          const a = i / 40 * Math.PI * 5;
          const rr = i / 40 * R * 0.8;
          return [cx + pr.shift + Math.cos(a) * rr, cy + pr.shift + Math.sin(a) * rr];
        });
        trace(ctx, sp);
        ctx.stroke();
      }
      ctx.globalAlpha = pr.key;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = SUMI;
      ctx.lineWidth = 3 * u;
      ctx.stroke();
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const pr = press(o.at, o.dur ?? 0.7);
      if (!pr.on)
        return;
      cartouche(X(x), Y(y), X(w), Y(h), pr, o.tone ? BLOCK4[o.tone] : SUMI);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "accent" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const col = BLOCK4[tone];
      trace(ctx, shown);
      ctx.strokeStyle = head ? SUMI : alpha(SUMI, 0.6);
      ctx.lineWidth = (head ? 9 : 4) * u;
      ctx.stroke();
      trace(ctx, shown);
      ctx.strokeStyle = col;
      ctx.lineWidth = (head ? 6 : 2) * u;
      ctx.stroke();
      if (head) {
        trace(ctx, shown);
        ctx.setLineDash([4 * u, 10 * u]);
        ctx.strokeStyle = alpha(CARD2, 0.85);
        ctx.lineWidth = 1.6 * u;
        ctx.stroke();
        ctx.setLineDash([]);
        if (p >= 1) {
          const end = pts.at(-1);
          const prev = pts.at(-3);
          arrowhead(ctx, end, Math.atan2(end[1] - prev[1], end[0] - prev[0]), 20 * u, false);
          ctx.fillStyle = col;
          ctx.fill();
          ctx.strokeStyle = SUMI;
          ctx.lineWidth = 2.5 * u;
          ctx.stroke();
        }
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const pr = press(o.at, o.dur ?? 0.8);
      if (!pr.on)
        return;
      const [bx, by, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      ctx.save();
      if (pr.color > 0) {
        ctx.globalAlpha = pr.color;
        ctx.fillStyle = "#4A2E1E";
        ctx.fillRect(bx + pr.shift, by + pr.shift, bw, bh);
        for (let i = 0;i < 3; i++) {
          const cy = by + pr.shift + bh / 3 * (i + 0.5);
          ctx.strokeStyle = alpha(SUMI, 0.8);
          ctx.lineWidth = 2 * u;
          ctx.beginPath();
          ctx.moveTo(bx + pr.shift, by + pr.shift + bh / 3 * i);
          ctx.lineTo(bx + pr.shift + bw, by + pr.shift + bh / 3 * i);
          ctx.stroke();
          const r = Math.min(bw, bh / 3) * 0.28;
          ctx.fillStyle = "#D7A53F";
          for (let k = 0;k < 8; k++) {
            const a = k / 8 * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(bx + pr.shift + bw / 2 + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8, r * 0.32, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(bx + pr.shift + bw / 2, cy, r * 0.45, 0, Math.PI * 2);
          ctx.fillStyle = "#4A2E1E";
          ctx.fill();
        }
      }
      ctx.globalAlpha = pr.key;
      ctx.strokeStyle = SUMI;
      ctx.lineWidth = 3 * u;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.restore();
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 80, sub, tone = "accent" } = o;
      const pr = press(at, 0.5);
      if (!pr.on)
        return;
      const str = count ? counting(t, at, dur, count) + s : s;
      ctx.font = font(size, 700);
      const longest = count ? `${count[1]}${s}` : s;
      const w = ctx.measureText(longest).width + 50 * u;
      const h = size * (sub ? 1.9 : 1.4) * u;
      if (sub)
        cartouche(X(x) - w / 2, Y(y) - h / 2, w, h, pr, BLOCK4[tone]);
      ctx.save();
      ctx.globalAlpha = pr.color;
      text(ctx, str, X(x), Y(y) - (sub ? size * 0.2 * u : 0), font(size, 700), BLOCK4[tone] === BLOCK4.accent ? SUMI : BLOCK4[tone], "center");
      if (sub)
        text(ctx, sub, X(x), Y(y) + size * 0.58 * u, font(size * 0.36), SUMI, "center");
      ctx.restore();
      if (sub && progress(t, at + dur, 0.6) > 0) {
        const ring = ellipse(X(x), Y(y), w * 0.62, h * 0.66, 48, -2.2, progress(t, at + dur, 0.6) * 1.05);
        ctx.save();
        trace(ctx, ring);
        ctx.strokeStyle = alpha(BLOCK4.bad, 0.85);
        ctx.lineWidth = 3 * u;
        ctx.stroke();
        ctx.restore();
      }
    },
    mark(kind, x, y, o = {}) {
      const pr = press(o.at, o.dur ?? 0.4);
      if (!pr.on)
        return;
      const r = (o.size ?? 30) * u;
      const [cx, cy] = [X(x), Y(y)];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.06);
      ctx.globalAlpha = pr.color;
      ctx.fillStyle = BLOCK4.bad;
      ctx.fillRect(-r + pr.shift, -r + pr.shift, r * 2, r * 2);
      ctx.strokeStyle = CARD2;
      ctx.lineWidth = 2 * u;
      ctx.strokeRect(-r * 0.78, -r * 0.78, r * 1.56, r * 1.56);
      ctx.lineWidth = 6 * u;
      ctx.lineCap = "square";
      if (kind === "check")
        trace(ctx, [
          [-r * 0.45, 0],
          [-r * 0.1, r * 0.35],
          [r * 0.5, -r * 0.4]
        ]);
      else {
        ctx.beginPath();
        ctx.moveTo(-r * 0.4, -r * 0.4);
        ctx.lineTo(r * 0.4, r * 0.4);
        ctx.moveTo(r * 0.4, -r * 0.4);
        ctx.lineTo(-r * 0.4, r * 0.4);
      }
      ctx.stroke();
      ctx.restore();
    },
    finish() {
      ctx.save();
      ctx.globalAlpha = 0.02;
      ctx.fillStyle = "#6B4A2A";
      for (let i = 0;i < 40; i++) {
        ctx.beginPath();
        ctx.arc(hash(i * 7.1) * W, hash(i * 8.3) * H, (40 + hash(i) * 120) * u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  };
}
var ukiyo_e_default = {
  id: "ukiyo-e",
  name: "Woodblock print",
  category: "Art & Design Movements",
  make: make77
};

// plugin/skills/motion-graphics/styles/vaporwave.ts
var TONE18 = {
  ink: "#F4ECFF",
  accent: "#7DF9FF",
  good: "#9CFFCF",
  bad: "#FF5FA8",
  muted: "#C9B3FF"
};
var DEEP3 = {
  ink: "#4A2A7A",
  accent: "#4A2A7A",
  good: "#1E8F6A",
  bad: "#D62E7A",
  muted: "#6A5A9A"
};
var SERIF18 = '"Didot", "Bodoni 72", "Times New Roman", Georgia, serif';
var MONO13 = '"Courier New", Menlo, monospace';
function make78(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const HZ = H * 0.62;
  const g = globalThis;
  g.__vapor ??= {};
  const st = g.__vapor;
  function glitch(at, dur, y0, y1, draw) {
    if (t < at)
      return;
    const p = progress(t, at, dur);
    if (p >= 1)
      return draw();
    const n = 6;
    const f = Math.floor(t * 30);
    for (let i = 0;i < n; i++) {
      if (hash(i * 3.1 + f) > 0.35 + p)
        continue;
      const a = y0 + (y1 - y0) * i / n - 4 * u;
      const b = (y1 - y0) / n + 8 * u;
      const dx = (hash(i * 7.3 + f * 1.7) - 0.5) * 60 * u * (1 - p);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, a, W, b);
      ctx.clip();
      for (const [ox, col] of [
        [-5 * u, "rgba(0,255,255,0.5)"],
        [5 * u, "rgba(255,0,170,0.5)"]
      ]) {
        ctx.save();
        ctx.translate(dx + ox, 0);
        ctx.globalAlpha = 0.5;
        ctx.globalCompositeOperation = "lighter";
        ctx.shadowColor = col;
        draw();
        ctx.restore();
      }
      ctx.translate(dx, 0);
      draw();
      ctx.restore();
    }
  }
  function split(s, x, y, font, color, align = "center", off = 3) {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,240,255,0.75)";
    ctx.fillText(s, x - off * u, y);
    ctx.fillStyle = "rgba(255,40,170,0.75)";
    ctx.fillText(s, x + off * u, y);
    ctx.shadowColor = "rgba(40,0,70,0.85)";
    ctx.shadowBlur = 5 * u;
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  function palm(c, x, base, hgt, lean) {
    c.strokeStyle = c.fillStyle = "#2A0F45";
    c.lineCap = "round";
    c.lineWidth = 14 * u;
    const top = [x + lean * hgt, base - hgt];
    c.beginPath();
    c.moveTo(x, base);
    c.quadraticCurveTo(x + lean * hgt * 0.2, base - hgt * 0.6, top[0], top[1]);
    c.stroke();
    for (let i = 0;i < 9; i++) {
      const a = -Math.PI + i / 8 * Math.PI + (hash(i + x) - 0.5) * 0.3;
      const len = hgt * (0.38 + hash(i * 2 + x) * 0.15);
      const ex = top[0] + Math.cos(a) * len;
      const ey = top[1] + Math.sin(a) * len * 0.5 + len * 0.35;
      c.lineWidth = 9 * u;
      c.beginPath();
      c.moveTo(top[0], top[1]);
      c.quadraticCurveTo(top[0] + Math.cos(a) * len * 0.5, top[1] - len * 0.25, ex, ey);
      c.stroke();
    }
  }
  function backdrop() {
    const key = `${W}x${H}`;
    if (st.key === key)
      return st.bg;
    const bg = new OffscreenCanvas(W, H);
    const c = bg.getContext("2d");
    const sky = c.createLinearGradient(0, 0, 0, HZ);
    sky.addColorStop(0, "#3A1A6B");
    sky.addColorStop(0.55, "#B04FB0");
    sky.addColorStop(1, "#FFA6C9");
    c.fillStyle = sky;
    c.fillRect(0, 0, W, HZ);
    const sr = H * 0.25;
    const sx = W * 0.42;
    const sy = HZ - sr * 0.45;
    const sun = c.createLinearGradient(0, sy - sr, 0, sy + sr);
    sun.addColorStop(0, "#FFE27A");
    sun.addColorStop(1, "#FF6FA8");
    c.fillStyle = sun;
    c.beginPath();
    c.arc(sx, sy, sr, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = sky;
    for (let i = 0;i < 8; i++)
      c.fillRect(sx - sr, sy + sr * (0 + i * 0.13), sr * 2, sr * (0.015 + i * 0.012));
    palm(c, W * 0.08, HZ + 10 * u, H * 0.55, 0.15);
    palm(c, W * 0.93, HZ + 10 * u, H * 0.62, -0.12);
    palm(c, W * 0.82, HZ + 10 * u, H * 0.4, -0.05);
    const floor = c.createLinearGradient(0, HZ, 0, H);
    floor.addColorStop(0, "#3A0F5E");
    floor.addColorStop(1, "#1A0730");
    c.fillStyle = floor;
    c.fillRect(0, HZ, W, H - HZ);
    c.strokeStyle = "rgba(240,140,255,0.8)";
    c.lineWidth = 1.5 * u;
    c.beginPath();
    for (let i = -16;i <= 16; i++) {
      c.moveTo(W / 2 + i * W * 0.025, HZ);
      c.lineTo(W / 2 + i * W * 0.14, H);
    }
    for (let k = 1;k < 12; k++) {
      const y = HZ + (H - HZ) * (k / 11) ** 2;
      c.moveTo(0, y);
      c.lineTo(W, y);
    }
    c.stroke();
    st.key = key;
    st.bg = bg;
    return bg;
  }
  return {
    surface() {
      ctx.drawImage(backdrop(), 0, 0);
      if (t < 0.25) {
        ctx.fillStyle = "#1A3BFF";
        ctx.fillRect(0, 0, W, H * (1 - t / 0.25));
      }
    },
    title(text, o = {}) {
      const { x = 0.035, y = 0.06, size = 54, at = 0, dur = 0.5 } = o;
      const fy = Y(y) + size * u * 0.6;
      glitch(at, dur, fy - size * u, fy + size * u, () => split(text.toUpperCase(), X(x), fy, `700 ${Math.round(size * u)}px ${SERIF18}`, TONE18.ink, "left", 4));
    },
    label(text, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 38, tone = "ink", align = "center" } = o;
      glitch(at, dur, Y(y) - size * u, Y(y) + size * u, () => split(text.toUpperCase(), X(x), Y(y), `700 ${Math.round(size * u)}px ${MONO13}`, TONE18[tone], align, 2));
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.3, tone = "accent" } = o;
      const rr = r * u;
      glitch(at, dur, Y(y) - rr, Y(y) + rr, () => {
        const gr = ctx.createRadialGradient(X(x) - rr * 0.4, Y(y) - rr * 0.4, rr * 0.1, X(x), Y(y), rr);
        gr.addColorStop(0, "#FFFFFF");
        gr.addColorStop(0.55, "#E6DDF5");
        gr.addColorStop(1, TONE18[tone === "ink" ? "muted" : tone]);
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(X(x), Y(y), rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = alpha("#5A2A8A", 0.5);
        ctx.lineWidth = 1.5 * u;
        ctx.stroke();
      });
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.35, tone = "ink" } = o;
      glitch(at, dur, Y(y), Y(y + h), () => {
        const bar = 20 * u;
        ctx.save();
        ctx.shadowColor = "rgba(40,0,70,0.45)";
        ctx.shadowOffsetX = 6 * u;
        ctx.shadowOffsetY = 6 * u;
        ctx.fillStyle = "#EDE4FF";
        ctx.fillRect(X(x), Y(y), X(w), Y(h));
        ctx.restore();
        const gr = ctx.createLinearGradient(X(x), 0, X(x + w), 0);
        gr.addColorStop(0, "#7DF9FF");
        gr.addColorStop(1, tone === "bad" ? "#FF5FA8" : "#FF9DE2");
        ctx.fillStyle = gr;
        ctx.fillRect(X(x), Y(y), X(w), bar);
        ctx.strokeStyle = "#5A2A8A";
        ctx.lineWidth = 2 * u;
        ctx.strokeRect(X(x), Y(y), X(w), Y(h));
        ctx.fillStyle = "#5A2A8A";
        ctx.font = `700 ${Math.round(bar * 0.8)}px ${MONO13}`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText("×", X(x + w) - 6 * u, Y(y) + bar / 2);
        ctx.fillStyle = tone === "good" ? alpha("#2FBF8A", 0.18) : alpha("#B04FB0", 0.1);
        ctx.fillRect(X(x) + 2 * u, Y(y) + bar, X(w) - 4 * u, Y(h) - bar - 2 * u);
      });
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (t < at)
        return;
      const p = progress(t, at, dur);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      ctx.save();
      ctx.strokeStyle = head ? TONE18[tone] : "rgba(255,255,255,0.55)";
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 10 * u;
      ctx.lineWidth = (head ? 3 : 1.2) * u;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const [i, [px, py]] of shown.entries())
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      ctx.stroke();
      if (head && p >= 1) {
        const e = pts.at(-1);
        const q = pts.at(-3);
        const a = Math.atan2(e[1] - q[1], e[0] - q[0]);
        const s = 16 * u;
        ctx.beginPath();
        ctx.moveTo(e[0] - Math.cos(a - 0.6) * s, e[1] - Math.sin(a - 0.6) * s);
        ctx.lineTo(e[0], e[1]);
        ctx.lineTo(e[0] - Math.cos(a + 0.6) * s, e[1] - Math.sin(a + 0.6) * s);
        ctx.stroke();
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6 } = o;
      glitch(at, dur, Y(y), Y(y + h), () => {
        const x0 = X(x);
        const y0 = Y(y);
        const ww = X(w);
        const hh = Y(h);
        const top = ww * 0.22;
        ctx.fillStyle = "#F4ECFF";
        ctx.beginPath();
        ctx.moveTo(x0, y0 + top);
        ctx.lineTo(x0 + top, y0);
        ctx.lineTo(x0 + ww, y0);
        ctx.lineTo(x0 + ww - top, y0 + top);
        ctx.closePath();
        ctx.fill();
        const n = 5;
        const cw = (ww - top) / n;
        const rows = Math.max(3, Math.round((hh - top) / cw));
        const ch = (hh - top) / rows;
        for (let i = 0;i < n; i++)
          for (let j = 0;j < rows; j++) {
            ctx.fillStyle = (i + j) % 2 ? "#120822" : "#FFFFFF";
            ctx.fillRect(x0 + i * cw, y0 + top + j * ch, cw + 0.5, ch + 0.5);
          }
        ctx.fillStyle = "#8A6AB8";
        ctx.beginPath();
        ctx.moveTo(x0 + ww - top, y0 + top);
        ctx.lineTo(x0 + ww, y0);
        ctx.lineTo(x0 + ww, y0 + hh - top);
        ctx.lineTo(x0 + ww - top, y0 + hh);
        ctx.closePath();
        ctx.fill();
      });
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const yy = Y(y) - (sub ? size * u * 0.2 : 0);
      split(s, X(x), yy, `400 ${Math.round(size * u * 1.1)}px ${SERIF18}`, tone === "accent" ? "#FFFFFF" : DEEP3[tone], "center", 4);
      if (sub)
        split(sub.toUpperCase(), X(x), Y(y) + size * u * 0.62, `700 ${Math.round(size * u * 0.26)}px ${MONO13}`, TONE18.ink, "center", 2);
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.25, size = 40 } = o;
      const r = size * u * 0.6;
      glitch(at, dur, Y(y) - r, Y(y) + r, () => {
        const cx = X(x);
        const cy = Y(y);
        ctx.save();
        ctx.strokeStyle = kind === "check" ? TONE18.accent : TONE18.bad;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 10 * u;
        ctx.lineWidth = 5 * u;
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
        ctx.restore();
      });
    },
    finish() {
      ctx.fillStyle = "rgba(20,0,40,0.14)";
      for (let y = 0;y < H; y += 3 * u)
        ctx.fillRect(0, y, W, 1.2 * u);
      const by = t * 0.12 % 1.2 * H - H * 0.1;
      const f = Math.floor(t * 30);
      for (let i = 0;i < 40; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.08 + hash(i + f) * 0.18})`;
        ctx.fillRect(hash(i * 3.3 + f) * W, by + hash(i * 1.7 + f) * H * 0.04, (20 + hash(i * 9 + f) * 120) * u, 1.5 * u);
      }
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(0, by, W, H * 0.04);
      const font = `700 ${Math.round(20 * u)}px ${MONO13}`;
      split("PLAY ▶", W - 40 * u, 36 * u, font, "#FFFFFF", "right", 1.5);
      const secs = 52 + Math.floor(t);
      const clock = `SP 0:${String(21 + Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
      split(clock, W - 40 * u, H - 36 * u, font, "#FFFFFF", "right", 1.5);
      const k = clamp(1 - t / 0.6);
      if (k > 0) {
        ctx.fillStyle = `rgba(255,255,255,${k * 0.2})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
  };
}
var vaporwave_default = {
  id: "vaporwave",
  name: "Pastel tape dream",
  category: "Retro UI & Neon",
  make: make78
};

// plugin/skills/motion-graphics/styles/vector-arcade.ts
var BEAM2 = {
  ink: "#7CFFA0",
  accent: "#F0FFF4",
  good: "#7CFFA0",
  bad: "#FF5A3C",
  muted: "#3A9A5C"
};
var GLYPH2 = {
  A: "0602204246 0343",
  B: "06003041423303 3344453606",
  C: "40000646",
  D: "00304244360600",
  E: "40000646 0333",
  F: "400006 0333",
  G: "41400006464323",
  H: "0006 4046 0343",
  I: "0040 2026 0646",
  J: "40460604",
  K: "0006 400346",
  L: "000646",
  M: "0600234046",
  N: "06004640",
  O: "0040460600",
  P: "0600404303",
  Q: "0040460600 2446",
  R: "0600404303 2346",
  S: "400003434606",
  T: "0040 2026",
  U: "00064640",
  V: "002640",
  W: "0016233640",
  X: "0046 4006",
  Y: "0023 4023 2326",
  Z: "00400646",
  "0": "0040460600 4006",
  "1": "112026 0646",
  "2": "004043030646",
  "3": "00404606 0343",
  "4": "000343 4046",
  "5": "400003434606",
  "6": "400006464303",
  "7": "004016",
  "8": "0040460600 0343",
  "9": "430300404606",
  "%": "0640 0010110100 3545463635",
  "?": "010040432324 2526",
  "!": "2024 2526",
  ".": "2526",
  ",": "2516",
  "-": "0343",
  ">": "004306",
  "<": "400346",
  ":": "2122 2425",
  "'": "2021",
  "/": "0640",
  "(": "30111536",
  ")": "10313516",
  "+": "2125 0343",
  "=": "0242 0444"
};
var strokes = (ch) => (GLYPH2[ch] ?? "").split(" ").filter(Boolean).map((s) => Array.from({ length: s.length / 2 }, (_, i) => [Number(s[i * 2]), Number(s[i * 2 + 1])]));
function make79(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const flicker = 0.86 + 0.14 * hash(Math.floor(t * 30) * 1.31);
  function beam(lines, color, width = 1.6, dots = true) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [lw, a] of [
      [width * 5, 0.12],
      [width * 2.2, 0.25],
      [width, 0.95]
    ]) {
      ctx.globalAlpha = a * flicker;
      ctx.lineWidth = lw * u;
      ctx.beginPath();
      for (const pl of lines)
        for (const [i, [x, y]] of pl.entries())
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      ctx.stroke();
    }
    if (dots) {
      ctx.globalAlpha = flicker;
      ctx.fillStyle = "#FFFFFF";
      const r = width * 1.1 * u;
      for (const pl of lines)
        for (const [x, y] of pl)
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }
  function letters(s, x, y, size, color, align = "left", n = Infinity) {
    const k = size * u / 9;
    const adv = 6 * k;
    const up = s.toUpperCase();
    const tw = up.length * adv - 2 * k;
    const x0 = align === "center" ? x - tw / 2 : align === "right" ? x - tw : x;
    const lines = [];
    for (let i = 0;i < Math.min(n, up.length); i++)
      for (const pl of strokes(up[i]))
        lines.push(pl.map(([gx, gy]) => [x0 + i * adv + gx * k, y - 3 * k + gy * k]));
    beam(lines, color, Math.max(1.2, size / 28));
    return tw;
  }
  const typed = (s, at, dur) => Math.ceil(s.length * progress(t, at, dur));
  return {
    surface() {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      const haze = ctx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, W * 0.6);
      haze.addColorStop(0, "rgba(40,90,60,0.12)");
      haze.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, W, H);
      const ridge = Array.from({ length: 33 }, (_, i) => [
        i / 32 * W,
        H * 0.88 - (i % 2 ? hash(i * 3.7) * 40 + 10 : hash(i) * 8) * u
      ]);
      const p = progress(t, 0, 1);
      beam([ridge.slice(0, Math.max(2, Math.round(ridge.length * p)))], BEAM2.muted, 1.1, false);
      beam([
        [
          [0, H * 0.88],
          [W * p, H * 0.88]
        ]
      ], BEAM2.muted, 1, false);
    },
    title(text, o = {}) {
      const { x = 0.035, y = 0.06, size = 56, at = 0, dur = 0.9 } = o;
      if (t < at)
        return;
      letters(text, X(x), Y(y) + size * u * 0.5, size, BEAM2.bad, "left", typed(text, at, dur));
    },
    label(text, x, y, o = {}) {
      const { at = 0, dur = 0.35, size = 38, tone = "ink", align = "center" } = o;
      if (t < at)
        return;
      letters(text, X(x), Y(y), size, BEAM2[tone], align, typed(text, at, dur));
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "accent" } = o;
      if (t < at)
        return;
      const p = progress(t, at, dur);
      const e = 1 - (1 - p) ** 3;
      const rr = r * u * 1.15 * (0.15 + 0.85 * e);
      const spin = t * 1.2 + x * 9 + (1 - e) * 6;
      const tilt = 0.5;
      const v = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1]
      ];
      const pr = v.map(([a, b, c]) => {
        const x1 = a * Math.cos(spin) - c * Math.sin(spin);
        const z1 = a * Math.sin(spin) + c * Math.cos(spin);
        const y1 = b * Math.cos(tilt) - z1 * Math.sin(tilt);
        return [X(x) + x1 * rr, Y(y) + y1 * rr];
      });
      const E = [
        [0, 2],
        [0, 3],
        [0, 4],
        [0, 5],
        [1, 2],
        [1, 3],
        [1, 4],
        [1, 5],
        [2, 4],
        [4, 3],
        [3, 5],
        [5, 2]
      ];
      beam(E.map(([a, b]) => [pr[a], pr[b]]), BEAM2[tone], 1.3);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.45, tone = "ink" } = o;
      if (t < at)
        return;
      const p = progress(t, at, dur);
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const ring = [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0]
      ];
      const per = 2 * (x1 - x0 + y1 - y0);
      let left = per * p;
      const out = [ring[0]];
      for (let i = 1;i < ring.length && left > 0; i++) {
        const a = ring[i - 1];
        const b = ring[i];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const f = Math.min(1, left / l);
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
        left -= l;
      }
      beam([out], BEAM2[tone], 1.4);
      if (p >= 1) {
        const g = 10 * u;
        const L = 18 * u;
        beam([
          [
            [x0 - g, y0 - g + L],
            [x0 - g, y0 - g],
            [x0 - g + L, y0 - g]
          ],
          [
            [x1 + g - L, y0 - g],
            [x1 + g, y0 - g],
            [x1 + g, y0 - g + L]
          ],
          [
            [x1 + g, y1 + g - L],
            [x1 + g, y1 + g],
            [x1 + g - L, y1 + g]
          ],
          [
            [x0 - g + L, y1 + g],
            [x0 - g, y1 + g],
            [x0 - g, y1 + g - L]
          ]
        ], BEAM2.muted, 1.1, false);
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      if (t < at)
        return;
      const p = progress(t, at, dur);
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const shown = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
      const color = head ? BEAM2[tone === "accent" ? "ink" : tone] : BEAM2.muted;
      beam([shown], color, head ? 1.4 : 0.8, false);
      const tip = shown.at(-1);
      if (p < 1)
        beam([[tip, tip]], "#FFFFFF", 3);
      else if (head) {
        const q = pts.at(-3);
        const a = Math.atan2(tip[1] - q[1], tip[0] - q[0]);
        const s = 16 * u;
        beam([
          [
            [tip[0] - Math.cos(a - 0.45) * s, tip[1] - Math.sin(a - 0.45) * s],
            tip,
            [tip[0] - Math.cos(a + 0.45) * s, tip[1] - Math.sin(a + 0.45) * s]
          ]
        ], color, 1.4);
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "ink" } = o;
      if (t < at)
        return;
      const p = progress(t, at, dur);
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.32;
      const lines = [];
      const rings = 4;
      for (let i = 0;i < rings; i++) {
        const f = clamp(p * rings - i);
        if (f <= 0)
          continue;
        const cy = Y(y + h) - ry - i / (rings - 1) * (Y(h) - ry * 2);
        lines.push(ellipse(cx, cy, rx, ry, 32, Math.PI / 2, f));
      }
      if (p >= 1)
        lines.push([
          [cx - rx, Y(y) + ry],
          [cx - rx, Y(y + h) - ry]
        ], [
          [cx + rx, Y(y) + ry],
          [cx + rx, Y(y + h) - ry]
        ]);
      beam(lines, BEAM2[tone], 1.3, false);
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const yy = Y(y) - (sub ? size * u * 0.25 : 0);
      letters(s, X(x), yy, size * 1.35, BEAM2[tone === "accent" ? "accent" : tone], "center");
      if (sub)
        letters(sub, X(x), Y(y) + size * u * 0.55, size * 0.3, BEAM2.ink, "center", typed(sub, at, 0.4));
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.25, size = 40 } = o;
      if (t < at)
        return;
      const r = size * u * 0.6;
      const p = progress(t, at, dur);
      const cx = X(x);
      const cy = Y(y);
      if (kind === "check") {
        const pts = [
          [cx - r, cy],
          [cx - r * 0.3, cy + r * 0.7],
          [cx + r, cy - r * 0.8]
        ];
        beam([pts.slice(0, p < 0.5 ? 2 : 3)], BEAM2.good, 1.8);
      } else {
        const ls = [
          [
            [cx - r, cy - r],
            [cx + r, cy + r]
          ]
        ];
        if (p > 0.5)
          ls.push([
            [cx + r, cy - r],
            [cx - r, cy + r]
          ]);
        beam(ls, BEAM2.bad, 1.8);
      }
    },
    finish() {}
  };
}
var vector_arcade_default = {
  id: "vector-arcade",
  name: "Vector cabinet",
  category: "Retro Digital",
  make: make79
};

// plugin/skills/motion-graphics/styles/voxel.ts
var CUBE = {
  ink: ["#F4EEE2", "#D9CFBE", "#B8AC98"],
  accent: ["#FFA45C", "#F07F2E", "#C9621C"],
  good: ["#8CE0C4", "#45C29C", "#2F9C7C"],
  bad: ["#FF7A7A", "#E04848", "#B03434"],
  muted: ["#CFC6E8", "#A99EDA", "#8679BE"]
};
var BROWN2 = "#6B3F2A";
var CREAM9 = "#FFF6E6";
var GRASS = ["#97D158", "#6FAE3C", "#55902C"];
var DIRT = ["#A9714A", "#8A5636", "#6C4028"];
var MONO14 = '"Silkscreen", "Press Start 2P", Menlo, "Courier New", monospace';
function make80(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__voxelText ??= new Map;
  const texts = g.__voxelText;
  function cube(x, y, s, [top, front, side]) {
    const d = s * 0.42;
    ctx.fillStyle = side;
    trace(ctx, [
      [x + s, y],
      [x + s + d, y - d],
      [x + s + d, y + s - d],
      [x + s, y + s]
    ], true);
    ctx.fill();
    ctx.fillStyle = top;
    trace(ctx, [
      [x, y],
      [x + d, y - d],
      [x + s + d, y - d],
      [x + s, y]
    ], true);
    ctx.fill();
    ctx.fillStyle = front;
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(x, y + s * 0.82, s, s * 0.18);
  }
  function fall(at, dur = 0.35) {
    const p = progress(t, at, dur);
    if (p <= 0)
      return -1;
    if (p < 0.75)
      return easeIn(p / 0.75);
    return 1 - Math.sin((p - 0.75) / 0.25 * Math.PI) * 0.06;
  }
  function pixels(s, x, y, size, color, align = "center") {
    const scale = Math.max(2, Math.round(size * u / 13));
    const key = `${s}|${scale}|${color}|${Math.round(size * u)}`;
    let tex = texts.get(key);
    if (!tex) {
      const fs = Math.max(6, Math.round(size * u / scale));
      const probe = new OffscreenCanvas(4, 4).getContext("2d");
      probe.font = `700 ${fs}px ${MONO14}`;
      const w = Math.ceil(probe.measureText(s).width) + 2;
      tex = new OffscreenCanvas(w, fs + 4);
      const c = tex.getContext("2d");
      c.font = `700 ${fs}px ${MONO14}`;
      c.fillStyle = color;
      c.textBaseline = "middle";
      c.fillText(s, 1, (fs + 4) / 2);
      const img = c.getImageData(0, 0, tex.width, tex.height);
      for (let i = 3;i < img.data.length; i += 4)
        img.data[i] = img.data[i] > 110 ? 255 : 0;
      c.putImageData(img, 0, 0);
      texts.set(key, tex);
    }
    const w = tex.width * scale;
    const h = tex.height * scale;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tex, Math.round(left), Math.round(y - h / 2), w, h);
    ctx.imageSmoothingEnabled = true;
    return w;
  }
  function tag(s, cx, cy, size, fill, ink, at, align = "center") {
    const f = fall(at, 0.3);
    if (f < 0)
      return;
    const y = cy - (1 - f) * 60 * u;
    ctx.save();
    ctx.globalAlpha = clamp(f * 3);
    ctx.font = `700 ${Math.round(size * u)}px ${MONO14}`;
    const w = ctx.measureText(s).width * 1.15 + size * 1.2 * u;
    const h = size * 1.6 * u;
    const left = align === "center" ? cx - w / 2 : align === "right" ? cx - w : cx;
    ctx.fillStyle = "rgba(60,30,20,0.35)";
    ctx.fillRect(left + 4 * u, y - h / 2 + 4 * u, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(left, y - h / 2, w, h);
    ctx.strokeStyle = BROWN2;
    ctx.lineWidth = 2 * u;
    ctx.strokeRect(left, y - h / 2, w, h);
    pixels(s, left + w / 2, y, size, ink);
    ctx.restore();
  }
  return {
    surface() {
      const bg = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.4, Math.max(W, H) * 0.75);
      bg.addColorStop(0, "#FBE6D2");
      bg.addColorStop(1, "#E9B99A");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      const s = 34 * u;
      const top = H * 0.84;
      const cols = Math.ceil(W * 0.94 / s);
      const x0 = W * 0.03;
      const back = H * 0.16;
      const skew = (yy) => (top - yy) / (top - back) * W * 0.04;
      for (let yy = back, r = 0;yy < top - s * 0.4; yy += s * 0.6, r++)
        for (let i = 0;i < cols; i++) {
          ctx.fillStyle = hash(i * 1.3 + r * 7.1) > 0.5 ? "#9AD45E" : "#90CB55";
          ctx.fillRect(x0 + i * s + skew(yy), yy, s + 1, s * 0.6 + 1);
        }
      ctx.fillStyle = "rgba(110,60,40,0.15)";
      ctx.beginPath();
      ctx.ellipse(W * 0.5, H * 0.99, W * 0.4, H * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let row = 2;row >= 0; row--) {
        for (let i = row;i < cols - row; i++) {
          if (row > 0 && hash(i * 3.7 + row) < 0.35)
            continue;
          cube(x0 + i * s, top + s * (row + 0.6), s, DIRT);
        }
      }
      for (let i = 0;i < cols; i++)
        cube(x0 + i * s, top - s * 0.4, s, GRASS);
      for (let i = 0;i < 26; i++) {
        const fx = x0 + hash(i * 1.9) * cols * s;
        ctx.fillStyle = ["#F35E7A", "#FFD25A", "#FFFFFF", "#C99BFF"][i % 4];
        ctx.fillRect(fx, top - s * 0.4 - hash(i) * s * 0.35, 6 * u, 6 * u);
      }
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 34, at = 0, align = "left" } = o;
      const n = clamp((t - at) / (o.dur ?? 0.9)) * s.length;
      if (n <= 0)
        return;
      const shown = s.toUpperCase().slice(0, Math.ceil(n));
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${MONO14}`;
      const full = ctx.measureText(s.toUpperCase()).width * 1.15 + size * u;
      const left = align === "center" ? X(x) - full / 2 : align === "right" ? X(x) - full : X(x);
      ctx.fillStyle = "rgba(255,246,230,0.85)";
      ctx.fillRect(left, Y(y) - size * 0.85 * u, full, size * 1.7 * u);
      ctx.strokeStyle = "rgba(107,63,42,0.4)";
      ctx.lineWidth = 2 * u;
      ctx.strokeRect(left, Y(y) - size * 0.85 * u, full, size * 1.7 * u);
      ctx.restore();
      pixels(shown, left + size * 0.5 * u, Y(y), size, BROWN2, "left");
    },
    label(s, x, y, o = {}) {
      const tone = o.tone ?? "ink";
      const fill = tone === "ink" || tone === "muted" ? BROWN2 : CUBE[tone][1];
      tag(s.toUpperCase(), X(x), Y(y), o.size ?? 28, fill, CREAM9, o.at ?? 0, o.align ?? "center");
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      const s = r * u * 0.85;
      const order = [
        [0, 1],
        [1, 1],
        [0, 0],
        [1, 0]
      ];
      for (const [i, [cx, cy]] of order.entries()) {
        const f = fall(at + i * 0.05, 0.3);
        if (f < 0)
          continue;
        ctx.save();
        ctx.globalAlpha = clamp(f * 4);
        cube(X(x) - s + cx * s, Y(y) - s + cy * s - (1 - f) * 220 * u, s, CUBE[tone]);
        ctx.restore();
      }
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6, tone = "ink" } = o;
      const s = 18 * u;
      const nx = Math.max(2, Math.round(X(w) / s));
      const ny = Math.max(2, Math.round(Y(h) / s));
      const ring = [];
      for (let i = 0;i < nx; i++)
        ring.push([i, ny - 1]);
      for (let j = ny - 2;j >= 0; j--)
        ring.push([nx - 1, j]);
      for (let i = nx - 2;i >= 0; i--)
        ring.push([i, 0]);
      for (let j = 1;j < ny - 1; j++)
        ring.push([0, j]);
      const done = progress(t, at + dur * 0.8, 0.2);
      if (done > 0) {
        ctx.fillStyle = CREAM9;
        ctx.globalAlpha = done;
        ctx.fillRect(X(x) + s, Y(y) + s, (nx - 2) * s, (ny - 2) * s);
        ctx.globalAlpha = 1;
      }
      const colors = tone === "ink" ? CUBE.muted : CUBE[tone];
      for (const [k, [i, j]] of ring.entries()) {
        const f = fall(at + k / ring.length * dur * 0.8, 0.25);
        if (f < 0)
          continue;
        cube(X(x) + i * s, Y(y) + j * s - (1 - f) * 200 * u, s, colors);
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      if (t < at)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 60);
      const len = Math.hypot(X(x2) - X(x1), Y(y2) - Y(y1)) * (1 + Math.abs(bend));
      const s = (head ? 9 : 5) * u;
      const n = Math.max(2, Math.floor(len / (s * 1.8)));
      const colors = tone === "ink" ? [BROWN2, "#4E2C1D", "#3A2015"] : CUBE[tone];
      for (let i = 0;i <= n; i++) {
        if (progress(t, at + i / n * dur, 0.05) <= 0)
          break;
        const [px, py] = pts[Math.round(i / n * (pts.length - 1))];
        ctx.globalAlpha = head ? 1 : 0.55;
        cube(px - s / 2, py - s / 2, s, colors);
      }
      ctx.globalAlpha = 1;
      if (head && t >= at + dur) {
        const end = pts.at(-1);
        const prev = pts.at(-6);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        for (const side of [-1, 1])
          for (let k = 1;k <= 2; k++)
            cube(end[0] - Math.cos(a + side * 0.8) * k * s * 1.3 - s / 2, end[1] - Math.sin(a + side * 0.8) * k * s * 1.3 - s / 2, s, colors);
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.9 } = o;
      const s = X(w) / 3;
      const rows = Math.max(1, Math.floor(Y(h) / s));
      let k = 0;
      for (let row = 0;row < rows; row++)
        for (let col = 0;col < 3; col++) {
          const f = fall(at + k++ / (rows * 3) * dur, 0.3);
          if (f < 0)
            continue;
          const shade = (row + col) % 3 === 0 ? CUBE.accent : row % 2 ? CUBE.muted : CUBE.ink;
          cube(X(x) + col * s, Y(y + h) - (row + 1) * s - (1 - f) * 220 * u, s, shade);
        }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      const f = fall(at, 0.3);
      if (f < 0)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const cy = Y(y) - (1 - f) * 80 * u;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${MONO14}`;
      const w = Math.max(ctx.measureText(`${value}0`).width * 1.15, size * 2.4 * u);
      const h = size * 1.35 * u;
      const fill = tone === "ink" ? CREAM9 : CUBE[tone][1];
      const ink = tone === "ink" ? BROWN2 : CREAM9;
      ctx.fillStyle = CUBE[tone === "ink" ? "muted" : tone][2];
      ctx.fillRect(X(x) - w / 2 + 8 * u, cy - h / 2 + 8 * u, w, h);
      ctx.fillStyle = fill;
      ctx.fillRect(X(x) - w / 2, cy - h / 2, w, h);
      ctx.strokeStyle = BROWN2;
      ctx.lineWidth = 3 * u;
      ctx.strokeRect(X(x) - w / 2, cy - h / 2, w, h);
      ctx.restore();
      pixels(value, X(x), cy, size * 0.8, ink);
      if (sub)
        tag(sub.toUpperCase(), X(x), cy - h / 2 - size * 0.25 * u, size * 0.26, BROWN2, CREAM9, at + 0.15);
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 30) * u / 3;
      const cells = kind === "check" ? [
        [0, 1],
        [1, 2],
        [2, 1],
        [3, 0]
      ] : [
        [0, 0],
        [2, 0],
        [1, 1],
        [0, 2],
        [2, 2]
      ];
      const colors = kind === "check" ? CUBE.good : CUBE.bad;
      for (const [i, [cx, cy]] of cells.entries()) {
        const f = fall((o.at ?? 0) + i * 0.05, 0.25);
        if (f < 0)
          continue;
        cube(X(x) - s * 1.5 + cx * s, Y(y) - s * 1.5 + cy * s - (1 - f) * 150 * u, s, colors);
      }
    },
    finish() {}
  };
}
var voxel_default = {
  id: "voxel",
  name: "Voxel diorama",
  category: "Dimensional",
  make: make80
};

// plugin/skills/motion-graphics/styles/watercolor.ts
var PAINT3 = {
  ink: "#2E3A6E",
  accent: "#3E7FC1",
  good: "#5C9E58",
  bad: "#B5303B",
  muted: "#C99A58"
};
var BRUSH = '"Noteworthy", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';
function make81(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const g = globalThis;
  g.__wcPaper ??= new Map;
  let seed = 13;
  function paper() {
    const key = `${W}x${H}`;
    let tile = g.__wcPaper.get(key);
    if (!tile) {
      tile = new OffscreenCanvas(W, H);
      const c = tile.getContext("2d");
      c.fillStyle = "#F6EFDF";
      c.fillRect(0, 0, W, H);
      for (let i = 0;i < 9000; i++) {
        const v = hash(i * 1.1);
        c.fillStyle = v > 0.5 ? "rgba(255,255,255,0.35)" : "rgba(150,120,80,0.10)";
        const s = (1 + hash(i * 2.7) * 3) * u;
        c.beginPath();
        c.arc(hash(i * 3.9) * W, hash(i * 5.1) * H, s, 0, Math.PI * 2);
        c.fill();
      }
      g.__wcPaper.set(key, tile);
    }
    return tile;
  }
  function ragged(cx, cy, rx, ry, k, rough = 0.18) {
    return Array.from({ length: 36 }, (_, i) => {
      const a = i / 36 * Math.PI * 2;
      const n = 1 + (hash(k + i * 1.7) - 0.5) * rough * 2 + Math.sin(a * 3 + k) * rough * 0.5;
      return [cx + Math.cos(a) * rx * n, cy + Math.sin(a) * ry * n];
    });
  }
  function wash(pts, cx, cy, color, p, strength = 1) {
    if (p <= 0)
      return;
    const s = expo(p);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(0.2 + 0.8 * s, 0.2 + 0.8 * s);
    ctx.translate(-cx, -cy);
    for (let layer = 0;layer < 3; layer++) {
      const shrink = 1 - layer * 0.08;
      const pp = pts.map(([x, y], i) => [
        cx + (x - cx) * shrink + (hash(i + layer * 50) - 0.5) * 6 * u,
        cy + (y - cy) * shrink + (hash(i * 2 + layer * 50) - 0.5) * 6 * u
      ]);
      trace(ctx, pp, true);
      ctx.fillStyle = alpha(color, 0.16 * strength);
      ctx.fill();
    }
    trace(ctx, pts, true);
    ctx.strokeStyle = alpha(color, 0.35 * strength * clamp(p * 1.5 - 0.3));
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();
    for (let i = 0;i < 2; i++) {
      const bx = cx + (hash(cx + i) - 0.5) * pts[0][0] * 0;
    }
    ctx.restore();
  }
  function sketch(points, at, dur) {
    seed++;
    const p = progress(t, at, dur);
    if (p <= 0)
      return;
    const { points: drawn } = along(roughen(points, 1 * u, seed * 2.1), p);
    ctx.save();
    trace(ctx, drawn);
    ctx.strokeStyle = "rgba(90,85,80,0.35)";
    ctx.lineWidth = 1 * u;
    ctx.stroke();
    ctx.restore();
  }
  function brush(points, at, dur, color, width = 6) {
    seed++;
    const p = progress(t, at, dur);
    if (p <= 0)
      return 0;
    const { points: drawn } = along(roughen(points, 1.2 * u, seed * 4.7), p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1;i < drawn.length; i++) {
      const f = i / Math.max(1, drawn.length - 1);
      const a = drawn[i - 1];
      const b = drawn[i];
      ctx.strokeStyle = alpha(color, 0.75);
      ctx.lineWidth = width * u * (1.15 - 0.55 * f * p);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    ctx.restore();
    return p;
  }
  function letter(s, x, y, size, color, align, p) {
    if (p <= 0)
      return;
    ctx.save();
    ctx.font = `italic 700 ${Math.round(size * u)}px ${BRUSH}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 6 * u, y - size * u, (w + 12 * u) * clamp(p), size * 2 * u);
    ctx.clip();
    ctx.textAlign = "left";
    ctx.fillStyle = alpha(color, 0.9);
    ctx.fillText(s, left, y);
    ctx.restore();
  }
  return {
    surface() {
      ctx.drawImage(paper(), 0, 0);
      const zones = [
        [0.3, 0.45, 0.3, 0.2, "muted"],
        [0.62, 0.42, 0.2, 0.24, "accent"],
        [0.86, 0.5, 0.14, 0.2, "good"]
      ];
      zones.forEach(([zx, zy, rx, ry, tone], i) => {
        wash(ragged(X(zx), Y(zy), X(rx), Y(ry), i * 17 + 3, 0.22), X(zx), Y(zy), PAINT3[tone], progress(t, 0.3 + i * 0.4, 1.4), 0.45);
      });
    },
    title(s, o = {}) {
      const { x = 0.04, y = 0.1, size = 52, at = 0, dur = 0.9 } = o;
      letter(s, X(x), Y(y), size, PAINT3.ink, o.align ?? "left", progress(t, at, dur));
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, tone = "ink", align = "center" } = o;
      letter(s, X(x), Y(y), size, PAINT3[tone === "accent" ? "ink" : tone], align, progress(t, at, o.dur ?? 0.04 * s.length + 0.15));
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "accent" } = o;
      const R = r * u;
      const [cx, cy] = [X(x), Y(y)];
      const k = x * 311 + y * 97;
      sketch(ellipse(cx, cy, R, R, 24), at, 0.15);
      wash(ragged(cx, cy, R * 1.25, R * 1.25, k, 0.15), cx, cy, PAINT3[tone], progress(t, at + 0.1, dur), 1.8);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "good" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      sketch([
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0]
      ], at, 0.3);
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const pts = Array.from({ length: 40 }, (_, i) => {
        const f = i / 40;
        const side = Math.floor(f * 4);
        const s = f * 4 % 1;
        const j = (hash(i * 3.3 + x0) - 0.5) * 22 * u;
        const corners = [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1]
        ];
        const a = corners[side];
        const b = corners[(side + 1) % 4];
        return [a[0] + (b[0] - a[0]) * s + j, a[1] + (b[1] - a[1]) * s + j];
      });
      wash(pts, cx, cy, PAINT3[tone], progress(t, at + 0.2, dur), 1.2);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      const color = PAINT3[tone === "accent" && head ? "ink" : tone];
      if (!head) {
        const p = progress(t, at, dur);
        if (p <= 0)
          return;
        const { points: drawn } = along(pts, p);
        ctx.save();
        trace(ctx, drawn);
        ctx.strokeStyle = alpha(color, 0.35);
        ctx.lineWidth = 1.6 * u;
        ctx.stroke();
        ctx.restore();
        return;
      }
      const p = brush(pts, at, dur, color, 7);
      if (p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 16 * u;
        brush([[end[0] - Math.cos(a - 0.55) * s, end[1] - Math.sin(a - 0.55) * s], end], at + dur, 0.08, color, 4);
        brush([[end[0] - Math.cos(a + 0.55) * s, end[1] - Math.sin(a + 0.55) * s], end], at + dur + 0.05, 0.08, color, 4);
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8, tone = "muted" } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const cx = (x0 + x1) / 2;
      const rx = (x1 - x0) / 2;
      const ry = rx * 0.3;
      sketch(ellipse(cx, y0 + ry, rx, ry, 30), at, 0.2);
      sketch([
        [x0, y0 + ry],
        [x0, y1 - ry]
      ], at + 0.15, 0.12);
      sketch([
        [x1, y0 + ry],
        [x1, y1 - ry]
      ], at + 0.2, 0.12);
      sketch(ellipse(cx, y1 - ry, rx, ry, 20, 0, 0.5), at + 0.25, 0.15);
      const body = [
        ...ellipse(cx, y1 - ry, rx, ry, 18, 0, 0.5),
        ...ellipse(cx, y0 + ry, rx, ry, 18, Math.PI, 0.5)
      ];
      wash(roughen(body, 3 * u, 77), cx, (y0 + y1) / 2, PAINT3[tone], progress(t, at + 0.3, dur), 1.4);
      wash(ragged(cx, y0 + ry, rx * 0.95, ry * 0.9, 5, 0.06), cx, y0 + ry, PAINT3.accent, progress(t, at + 0.5, dur), 1);
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "accent" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const color = tone === "good" ? PAINT3.ink : PAINT3[tone === "accent" ? "bad" : tone];
      letter(value, X(x), Y(y), size, color, "center", 1);
      if (sub) {
        letter(sub, X(x), Y(y) - size * 0.85 * u, size * 0.4, PAINT3.ink, "center", progress(t, at + 0.2, 0.4));
        ctx.save();
        ctx.font = `italic 700 ${Math.round(size * u)}px ${BRUSH}`;
        const w = ctx.measureText(value).width;
        ctx.restore();
        brush(ellipse(X(x), Y(y), w * 0.7, size * 0.62 * u, 40, -Math.PI * 0.65, 1.08), at + dur + 0.1, 0.45, PAINT3.bad, 3.5);
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 34 } = o;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check")
        brush([
          [cx - s * 0.5, cy],
          [cx - s * 0.12, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5]
        ], at, dur, PAINT3.good, 6);
      else {
        brush([
          [cx - s * 0.45, cy - s * 0.45],
          [cx + s * 0.45, cy + s * 0.45]
        ], at, dur / 2, PAINT3.bad, 6);
        brush([
          [cx + s * 0.45, cy - s * 0.45],
          [cx - s * 0.45, cy + s * 0.45]
        ], at + dur / 2, dur / 2, PAINT3.bad, 6);
      }
    },
    finish() {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.5;
      ctx.drawImage(paper(), 0, 0);
      ctx.restore();
    }
  };
}
var watercolor_default = {
  id: "watercolor",
  name: "Watercolour wash",
  category: "Painterly",
  make: make81
};

// plugin/skills/motion-graphics/styles/whiteboard.ts
var INK20 = {
  ink: "#22262B",
  accent: "#2F5BD3",
  good: "#1F9254",
  bad: "#D9343F",
  muted: "#7A8088"
};
var HAND10 = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive';
function make82(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  let tip = null;
  let seed = 1;
  function ink(points, { at = 0, dur = 0.6, tone = "ink", width = 9 } = {}) {
    const p = progress(t, at, dur);
    seed += 1;
    if (p <= 0)
      return;
    const { points: drawn } = along(roughen(points, 1.2 * u, seed * 13.1), p);
    const col = INK20[tone];
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
    ctx.font = `700 ${Math.round(size * u)}px ${HAND10}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
    ctx.beginPath();
    ctx.rect(left - 4 * u, Y(y) - size * u, (w + 8 * u) * p, size * 2 * u);
    ctx.clip();
    ctx.fillStyle = INK20[tone];
    ctx.fillText(s, left, Y(y));
    ctx.restore();
    if (p < 1)
      tip = { x: left + w * p, y: Y(y), color: INK20[tone] };
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
        ctx.fillStyle = INK20[c];
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
      ctx.font = `700 ${Math.round(size * u)}px ${HAND10}`;
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
      ink([
        [cx - rx, top],
        [cx - rx, bottom]
      ], { ...o, at: at + step * 1.5, dur: step * 0.7 });
      ink(half(bottom), { ...o, at: at + step * 2.2, dur: step });
      ink([
        [cx + rx, bottom],
        [cx + rx, top]
      ], { ...o, at: at + step * 3.2, dur: step * 0.6 });
      ink(half(top + (bottom - top) / 3), { ...o, at: at + step * 3.8, dur: step * 0.6 });
      ink(half(top + (bottom - top) * 2 / 3), { ...o, at: at + step * 4.4, dur: step * 0.6 });
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      const value = count ? counting(t, at, dur, count) + s : s;
      write(value, x, y, { ...o, size, align: "center", dur: 0.3 });
      if (sub)
        write(sub, x, y + size * 0.75 * u / H, {
          ...o,
          at: at + 0.3,
          size: size * 0.35,
          align: "center"
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 34) * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check") {
        ink([
          [cx - s * 0.5, cy],
          [cx - s * 0.1, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5]
        ], { dur: 0.3, tone: "good", ...o });
      } else {
        const at = o.at ?? 0;
        ink([
          [cx - s * 0.5, cy - s * 0.5],
          [cx + s * 0.5, cy + s * 0.5]
        ], { dur: 0.15, tone: "bad", ...o });
        ink([
          [cx + s * 0.5, cy - s * 0.5],
          [cx - s * 0.5, cy + s * 0.5]
        ], { dur: 0.15, tone: "bad", ...o, at: at + 0.15 });
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
      trace(ctx, [
        [0, 0],
        [20 * u, -R * 0.7],
        [20 * u, R * 0.7]
      ], true);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(18 * u, -R, 10 * u, R * 2);
      ctx.restore();
    }
  };
}
var whiteboard_default = {
  id: "whiteboard",
  name: "Whiteboard",
  category: "Hand-drawn",
  make: make82
};

// plugin/skills/motion-graphics/styles/win95.ts
var FACE6 = "#C0C0C0";
var HI = "#FFFFFF";
var SH = "#808080";
var DK = "#000000";
var NAVY8 = "#000080";
var TONE19 = {
  ink: "#000000",
  accent: NAVY8,
  good: "#008000",
  bad: "#C00000",
  muted: "#808080"
};
var FONT4 = 'Tahoma, "MS Sans Serif", Verdana, Arial, sans-serif';
function make83(ctx, t, m) {
  const full = frame(m);
  const h = 360;
  const w = Math.round(full.W / full.H * h);
  const g = globalThis;
  g.__w95 ??= {};
  const st = g.__w95;
  if (!st.buf || st.buf.width !== w)
    st.buf = new OffscreenCanvas(w, h);
  const c = st.buf.getContext("2d");
  const { u, X, Y } = frame({ width: w, height: h });
  const R = Math.round;
  let pointer = null;
  let pointerAt = -1;
  const arrived = (at, x, y) => {
    if (t >= at && at >= pointerAt) {
      pointerAt = at;
      pointer = [x, y];
    }
  };
  const px = (size) => Math.max(10, R(size * u));
  function write(s, x, y, size, color = DK, align = "left", bold = false) {
    c.font = `${bold ? "bold " : ""}${px(size)}px ${FONT4}`;
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = "middle";
    c.fillText(s, R(x), R(y));
  }
  function bevel(x, y, ww, hh, raised, fill = FACE6) {
    x = R(x);
    y = R(y);
    ww = R(ww);
    hh = R(hh);
    const [a, b, a2, b2] = raised ? [HI, DK, FACE6, SH] : [SH, HI, DK, FACE6];
    c.fillStyle = b;
    c.fillRect(x, y, ww, hh);
    c.fillStyle = a;
    c.fillRect(x, y, ww - 1, hh - 1);
    c.fillStyle = b2;
    c.fillRect(x + 1, y + 1, ww - 2, hh - 2);
    c.fillStyle = a2;
    c.fillRect(x + 1, y + 1, ww - 3, hh - 3);
    c.fillStyle = fill;
    c.fillRect(x + 2, y + 2, ww - 4, hh - 4);
  }
  function zoom(p, x, y, ww, hh) {
    c.strokeStyle = HI;
    c.lineWidth = 1;
    for (let k = 0;k < 3; k++) {
      const f = Math.min(1, p + k * 0.12);
      c.strokeRect(R(x + ww * (1 - f) / 2) + 0.5, R(y + hh * (1 - f) / 2) + 0.5, R(ww * f), R(hh * f));
    }
  }
  function dotted(pts, p, color) {
    c.fillStyle = color;
    let total = 0;
    for (let i = 1;i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    let left = total * p;
    let carry = 0;
    for (let i = 1;i < pts.length && left > 0; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let d = carry;d < Math.min(l, left); d += 2) {
        c.fillRect(R(a[0] + (b[0] - a[0]) * d / l), R(a[1] + (b[1] - a[1]) * d / l), 1, 1);
        carry = d + 2 - l;
      }
      left -= l;
    }
  }
  const win = { x: 6, y: 6, w: w - 12, h: h - 12 };
  return {
    surface() {
      c.imageSmoothingEnabled = false;
      c.fillStyle = "#008080";
      c.fillRect(0, 0, w, h);
      const p = progress(t, 0, 0.3);
      if (p < 1)
        return zoom(p, win.x, win.y, win.w, win.h);
      bevel(win.x, win.y, win.w, win.h, true);
      c.fillStyle = NAVY8;
      c.fillRect(win.x + 3, win.y + 3, win.w - 6, 18);
      bevel(win.x + win.w - 22, win.y + 5, 16, 14, true);
      write("×", win.x + win.w - 14, win.y + 11.5, 0, DK, "center", true);
      bevel(win.x + 4, win.y + 23, win.w - 8, win.h - 46, false, FACE6);
      bevel(win.x + 4, win.y + win.h - 21, win.w * 0.6, 17, false);
      bevel(win.x + 8 + win.w * 0.6, win.y + win.h - 21, win.w * 0.4 - 12, 17, false);
      write("Ready", win.x + 10, win.y + win.h - 12.5, 0);
    },
    title(text, o = {}) {
      const { at = 0, dur = 0.5 } = o;
      if (t < at)
        return;
      const n = Math.ceil(text.length * progress(t, at, dur));
      write(text.slice(0, n), win.x + 8, win.y + 12, 0, HI, "left", true);
    },
    label(text, x, y, o = {}) {
      const { at = 0, size = 38, tone = "ink", align = "center" } = o;
      if (t < at)
        return;
      arrived(at, X(x) + 10, Y(y));
      write(text, X(x), Y(y), size, TONE19[tone], align, tone !== "ink" && tone !== "muted");
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      if (t < at)
        return;
      arrived(at, X(x), Y(y));
      const rr = Math.max(4, R(r * u * 1.1));
      const cx = R(X(x));
      const cy = R(Y(y));
      const arc = (rad, a0, a1, col) => {
        c.strokeStyle = col;
        c.lineWidth = 1;
        c.beginPath();
        c.arc(cx, cy, rad, a0, a1);
        c.stroke();
      };
      c.fillStyle = HI;
      c.beginPath();
      c.arc(cx, cy, rr, 0, Math.PI * 2);
      c.fill();
      arc(rr, Math.PI * 0.75, Math.PI * 1.75, SH);
      arc(rr - 1, Math.PI * 0.75, Math.PI * 1.75, DK);
      arc(rr, -Math.PI * 0.25, Math.PI * 0.75, HI);
      arc(rr - 1, -Math.PI * 0.25, Math.PI * 0.75, FACE6);
      if (t - at > 0.12) {
        c.fillStyle = TONE19[tone];
        c.beginPath();
        c.arc(cx, cy, Math.max(2, rr * 0.45), 0, Math.PI * 2);
        c.fill();
      }
    },
    box(x, y, bw, bh, o = {}) {
      const { at = 0, dur = 0.25, tone = "ink" } = o;
      if (t < at)
        return;
      const p = progress(t, at, dur);
      if (p < 1)
        return zoom(p, X(x), Y(y), X(bw), Y(bh));
      arrived(at, X(x + bw) - 8, Y(y + bh) - 8);
      bevel(X(x), Y(y), X(bw), Y(bh), false, HI);
      if (tone !== "ink") {
        c.fillStyle = TONE19[tone];
        c.fillRect(R(X(x)) + 2, R(Y(y)) + 2, R(X(bw)) - 4, 3);
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "accent" } = o;
      if (t < at)
        return;
      const p = Math.floor(progress(t, at, dur) * 8) / 8 || 1 / 8;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 30);
      const col = head ? TONE19[tone] : SH;
      dotted(pts, p, col);
      if (head && p >= 1) {
        const e = pts.at(-1);
        const q = pts.at(-3);
        const a = Math.atan2(e[1] - q[1], e[0] - q[0]);
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(R(e[0]), R(e[1]));
        c.lineTo(R(e[0] - Math.cos(a - 0.5) * 6), R(e[1] - Math.sin(a - 0.5) * 6));
        c.lineTo(R(e[0] - Math.cos(a + 0.5) * 6), R(e[1] - Math.sin(a + 0.5) * 6));
        c.fill();
      }
    },
    store(x, y, bw, bh, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      if (t < at)
        return;
      arrived(at, X(x + bw / 2), Y(y + bh / 2));
      bevel(X(x), Y(y), X(bw), Y(bh), true);
      const n = 4;
      const sh = (Y(bh) - 8) / n;
      for (let i = 0;i < n; i++) {
        const yy = Y(y) + 4 + i * sh;
        bevel(X(x) + 4, yy, X(bw) - 8, sh - 3, false, "#A0A0A0");
        if (t >= at + (i + 1) * dur / n) {
          c.fillStyle = "#00C000";
          c.fillRect(R(X(x + bw)) - 10, R(yy + sh / 2) - 2, 3, 2);
        }
      }
    },
    stat(text, x, y, o = {}) {
      const { at = 0, dur = 1.2, count, size = 110, sub, tone = "accent" } = o;
      if (t < at)
        return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const big = size * 1.05;
      if (sub) {
        c.font = `bold ${px(big)}px ${FONT4}`;
        const tw = Math.max(c.measureText(s).width, 60) + 20;
        bevel(X(x) - tw / 2, Y(y) - px(big) * 0.9, tw, px(big) * 2, false, NAVY8);
        write(s, X(x), Y(y) - px(big) * 0.15, big, HI, "center", true);
        write(sub, X(x), Y(y) + px(big) * 0.65, size * 0.35, HI, "center");
      } else
        write(s, X(x), Y(y), big, tone === "accent" ? NAVY8 : TONE19[tone], "center", true);
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 40 } = o;
      if (t < at)
        return;
      arrived(at, X(x), Y(y));
      const r = Math.max(6, R(size * u * 0.7));
      const cx = R(X(x));
      const cy = R(Y(y));
      if (kind === "check") {
        bevel(cx - r, cy - r, r * 2, r * 2, false, HI);
        c.strokeStyle = DK;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(cx - r * 0.5, cy);
        c.lineTo(cx - r * 0.1, cy + r * 0.45);
        c.lineTo(cx + r * 0.55, cy - r * 0.45);
        c.stroke();
      } else {
        c.fillStyle = "#E00000";
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = HI;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(cx - r * 0.4, cy - r * 0.4);
        c.lineTo(cx + r * 0.4, cy + r * 0.4);
        c.moveTo(cx + r * 0.4, cy - r * 0.4);
        c.lineTo(cx - r * 0.4, cy + r * 0.4);
        c.stroke();
      }
    },
    finish() {
      if (pointer) {
        const [px0, py0] = pointer;
        const arrow = [
          [0, 0],
          [0, 16],
          [4, 12],
          [7, 18],
          [9, 17],
          [6, 11],
          [11, 11]
        ];
        c.beginPath();
        for (const [i, [ax, ay]] of arrow.entries())
          i ? c.lineTo(R(px0) + ax, R(py0) + ay) : c.moveTo(R(px0) + ax, R(py0) + ay);
        c.closePath();
        c.fillStyle = HI;
        c.fill();
        c.strokeStyle = DK;
        c.lineWidth = 1;
        c.stroke();
      }
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(st.buf, 0, 0, full.W, full.H);
      ctx.restore();
    }
  };
}
var win95_default = {
  id: "win95",
  name: "Retro desktop",
  category: "Retro UI & Neon",
  make: make83
};

// plugin/skills/motion-graphics/styles/wireframe-terrain.ts
var NIGHT = "#070B24";
var TONE20 = {
  ink: "#8FE9FF",
  accent: "#FFC247",
  good: "#5CF29A",
  bad: "#FF5470",
  muted: "#4F6A9A"
};
var MONO15 = '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';
function make84(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  function glow(color, width, blur = 8) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * u;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.restore();
  }
  function typed(s, x, y, size, o = {}) {
    const { at = 0, tone = "ink", align = "left", weight = 600 } = o;
    const n = Math.floor((t - at) / 0.03);
    if (n <= 0)
      return 0;
    ctx.save();
    ctx.font = `${weight} ${Math.round(size * u)}px ${MONO15}`;
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    const shown = s.slice(0, n);
    ctx.fillStyle = tone === "ink" ? "#E8FBFF" : TONE20[tone];
    ctx.shadowColor = TONE20[tone];
    ctx.shadowBlur = 8 * u;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(shown, left, y);
    if (n <= s.length + 6 && Math.floor(t * 4) % 2 === 0) {
      ctx.fillRect(left + ctx.measureText(shown).width + 2 * u, y - size * 0.45 * u, size * 0.5 * u, size * 0.9 * u);
    }
    ctx.restore();
    return w;
  }
  function brackets(x, y, w, h, p, color) {
    const o = (1 - expo(p)) * 20 * u;
    const l = Math.min(w, h) * 0.18;
    ctx.beginPath();
    for (const [cx, cy, dx, dy] of [
      [x - o, y - o, 1, 1],
      [x + w + o, y - o, -1, 1],
      [x - o, y + h + o, 1, -1],
      [x + w + o, y + h + o, -1, -1]
    ]) {
      ctx.moveTo(cx + dx * l, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * l);
    }
    glow(color, 2, 6);
  }
  function sphere(cx, cy, r, p, color, spin = 0) {
    for (let i = 1;i < 6; i++) {
      const lat = i / 6 * Math.PI - Math.PI / 2;
      trace(ctx, along(ellipse(cx, cy + Math.sin(lat) * r, Math.cos(lat) * r, Math.cos(lat) * r * 0.18, 32), p).points);
      glow(color, 1, 5);
    }
    for (let i = 0;i < 6; i++) {
      const a = i / 6 * Math.PI + spin;
      trace(ctx, along(ellipse(cx, cy, Math.abs(Math.cos(a)) * r, r, 32), p).points);
      glow(color, 1, 5);
    }
    trace(ctx, along(ellipse(cx, cy, r, r, 48), p).points);
    glow(color, 1.5, 10);
  }
  return {
    surface() {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#050820");
      sky.addColorStop(0.45, "#0E1A4A");
      sky.addColorStop(1, NIGHT);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.globalAlpha = 0.7;
      sphere(W * 0.86, H * 0.16, H * 0.09, progress(t, 0, 1.2), "#4FC9F0", t * 0.2);
      ctx.restore();
      const cols = 64;
      const rows = 30;
      const horizon = H * 0.42;
      const glide = t * 0.25;
      const height = (x, z) => Math.sin(x * 2.1 + (z + glide) * 0.9) * 0.35 + Math.cos(x * 0.8 - (z + glide) * 1.7) * 0.25 + Math.sin((z + glide) * 2.6 + x * 3.3) * 0.08;
      const proj = (x, z) => {
        const y = height(x, z);
        return [W / 2 + x / z * W * 0.55, horizon + (1.1 - y) / z * H * 0.72];
      };
      const zAt = (j) => 1.7 + (j / rows) ** 1.25 * 10;
      const xAt = (i) => (i / cols - 0.5) * 12;
      const scan = clamp(t / 1.4);
      ctx.save();
      ctx.lineWidth = 1 * u;
      for (let j = rows - 1;j >= 0; j--) {
        if (j / rows > scan)
          continue;
        const front = Math.abs(j / rows - scan) < 0.06 && scan < 1;
        const fade = 0.35 + 0.65 * (1 - j / rows);
        ctx.strokeStyle = front ? "#E8FBFF" : alpha("#5FD3FF", fade);
        for (let i = 0;i < cols; i++) {
          const q = [
            proj(xAt(i), zAt(j)),
            proj(xAt(i + 1), zAt(j)),
            proj(xAt(i + 1), zAt(j + 1)),
            proj(xAt(i), zAt(j + 1))
          ];
          trace(ctx, q, true);
          ctx.fillStyle = NIGHT;
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
      const bloom = ctx.createLinearGradient(0, horizon - H * 0.05, 0, horizon + H * 0.1);
      bloom.addColorStop(0, "rgba(80,200,255,0)");
      bloom.addColorStop(0.5, "rgba(80,200,255,0.12)");
      bloom.addColorStop(1, "rgba(80,200,255,0)");
      ctx.fillStyle = bloom;
      ctx.fillRect(0, horizon - H * 0.05, W, H * 0.15);
    },
    title(s, o = {}) {
      const { x = 0.03, y = 0.08, size = 32, at = 0, align = "left" } = o;
      const w = typed(s.toUpperCase(), X(x), Y(y), size, { at, align, weight: 700 });
      if (!w)
        return;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      const p = progress(t, at + s.length * 0.03, 0.4);
      ctx.beginPath();
      ctx.moveTo(left, Y(y) + size * 0.75 * u);
      ctx.lineTo(left + w * expo(p), Y(y) + size * 0.75 * u);
      glow(TONE20.ink, 1.5);
    },
    label(s, x, y, o = {}) {
      const { at = 0, tone = "ink", align = "center" } = o;
      if (t < at)
        return;
      const size = o.size ?? 28;
      ctx.save();
      ctx.font = `600 ${Math.round(size * u)}px ${MONO15}`;
      const w = ctx.measureText(s.toUpperCase()).width + size * u;
      const left = align === "center" ? X(x) - w / 2 : align === "right" ? X(x) - w : X(x);
      const h = size * 1.5 * u;
      const p = progress(t, at, 0.2);
      ctx.fillStyle = "rgba(7,11,36,0.85)";
      ctx.fillRect(left, Y(y) - h / 2, w * expo(p), h);
      ctx.beginPath();
      ctx.rect(left, Y(y) - h / 2, w * expo(p), h);
      glow(tone === "ink" ? TONE20.ink : TONE20[tone], 1.2, 4);
      ctx.restore();
      typed(s.toUpperCase(), left + size * 0.5 * u, Y(y), size, { at: at + 0.1, tone });
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      ctx.save();
      ctx.beginPath();
      ctx.arc(X(x), Y(y), r * u, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(7,11,36,0.9)";
      ctx.fill();
      sphere(X(x), Y(y), r * u, expo(p), TONE20[tone === "accent" ? "ink" : tone], t * 0.8 + x * 10);
      ctx.restore();
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.4, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const col = TONE20[tone];
      ctx.save();
      ctx.globalAlpha = expo(p);
      ctx.fillStyle = "rgba(7,11,36,0.9)";
      ctx.fillRect(x0, y0, bw, bh);
      ctx.strokeStyle = alpha(col, 0.5);
      ctx.lineWidth = 1 * u;
      ctx.strokeRect(x0, y0, bw, bh);
      ctx.fillStyle = alpha(col, 0.8);
      ctx.fillRect(x0 + 10 * u, y0 + bh - 14 * u, (bw - 20 * u) * progress(t, at + 0.3, 0.8), 4 * u);
      ctx.restore();
      brackets(x0, y0, bw, bh, p, col);
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend, 36);
      const { points, angle } = along(pts, expo(p));
      const col = TONE20[tone === "accent" && !head ? "ink" : tone];
      ctx.save();
      if (tone === "bad")
        ctx.setLineDash([8 * u, 6 * u]);
      ctx.globalAlpha = head ? 1 : 0.5;
      trace(ctx, points);
      glow(col, head ? 2 : 1, head ? 10 : 4);
      ctx.setLineDash([]);
      if (p < 1) {
        const [hx, hy] = points.at(-1);
        ctx.fillStyle = "#FFFFFF";
        ctx.shadowColor = col;
        ctx.shadowBlur = 14 * u;
        ctx.beginPath();
        ctx.arc(hx, hy, 3 * u, 0, Math.PI * 2);
        ctx.fill();
      } else if (head) {
        arrowhead(ctx, pts.at(-1), angle, 12 * u);
        glow(col, 2);
      }
      ctx.restore();
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const p = progress(t, at, dur);
      if (p <= 0)
        return;
      const cx = X(x + w / 2);
      const rx = X(w) / 2;
      const ry = rx * 0.28;
      const top = Y(y) + ry;
      const bottom = Y(y + h) - ry;
      ctx.save();
      ctx.fillStyle = "rgba(7,11,36,0.9)";
      ctx.fillRect(cx - rx, top, rx * 2, bottom - top);
      for (let i = 0;i <= 5; i++) {
        const q = clamp(p * 6 - i);
        if (q <= 0)
          continue;
        trace(ctx, along(ellipse(cx, bottom - (bottom - top) * i / 5, rx, ry, 36), q).points);
        glow(i === 5 ? "#E8FBFF" : TONE20.ink, i === 5 ? 1.8 : 1.1);
      }
      for (const s of [-1, 1]) {
        trace(ctx, [
          [cx + s * rx, bottom],
          [cx + s * rx, bottom - (bottom - top) * p]
        ]);
        glow(TONE20.ink, 1.2);
      }
      ctx.restore();
      brackets(X(x) - 8 * u, Y(y) - 8 * u, X(w) + 16 * u, Y(h) + 16 * u, p, alpha(TONE20.ink, 0.6));
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub, tone = "ink" } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      const col = tone === "ink" ? "#E8FBFF" : tone === "accent" ? TONE20.good : TONE20[tone];
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${MONO15}`;
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 16 * u;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = Math.floor(t * 30) % 3 === 0 && t < at + 0.25 ? 0.4 : 1;
      ctx.fillText(value, X(x), Y(y));
      ctx.restore();
      if (sub)
        typed(sub.toUpperCase(), X(x), Y(y) - size * 0.75 * u, size * 0.22, {
          at,
          align: "center",
          tone: "ink",
          weight: 500
        });
    },
    mark(kind, x, y, o = {}) {
      const s = (o.size ?? 24) * u;
      const p = progress(t, o.at ?? 0, 0.25);
      if (p <= 0)
        return;
      const [cx, cy] = [X(x), Y(y)];
      const path = kind === "check" ? [
        [cx - s * 0.5, cy],
        [cx - s * 0.15, cy + s * 0.4],
        [cx + s * 0.55, cy - s * 0.45]
      ] : [
        [cx - s * 0.45, cy - s * 0.45],
        [cx + s * 0.45, cy + s * 0.45],
        [cx, cy],
        [cx + s * 0.45, cy - s * 0.45],
        [cx - s * 0.45, cy + s * 0.45]
      ];
      trace(ctx, along(path, p).points);
      ctx.lineCap = "round";
      glow(kind === "check" ? TONE20.good : TONE20.bad, 3, 10);
    },
    finish() {
      const c = 26 * u;
      const e = 14 * u;
      ctx.beginPath();
      for (const [x, y, dx, dy] of [
        [e, e, 1, 1],
        [W - e, e, -1, 1],
        [e, H - e, 1, -1],
        [W - e, H - e, -1, -1]
      ]) {
        ctx.moveTo(x + dx * c, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + dy * c);
      }
      ctx.strokeStyle = alpha(TONE20.ink, 0.5);
      ctx.lineWidth = 1.5 * u;
      ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (let y = 0;y < H; y += 4 * u)
        ctx.fillRect(0, y, W, 1.2 * u);
    }
  };
}
var wireframe_terrain_default = {
  id: "wireframe-terrain",
  name: "Wireframe terrain",
  category: "Dimensional",
  make: make84
};

// plugin/skills/motion-graphics/styles/x-ray.ts
var FILM = "#0B1119";
var BONE = "#CFE0F0";
var PENCIL2 = {
  ink: "#F3D46A",
  accent: "#F3D46A",
  good: "#86E89A",
  bad: "#EE4436",
  muted: "#B9B3A0"
};
var HAND11 = '"Bradley Hand", "Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive';
var MONO16 = '"Courier New", Courier, monospace';
function make85(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const film = { x0: W * 0.025, y0: H * 0.04, x1: W * 0.975, y1: H * 0.93 };
  let seed = 11;
  const develop = (at = 0, dur = 0.6) => clamp((t - at) / dur);
  function shell(draw, a, fill = 0.12) {
    if (a <= 0)
      return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    draw();
    ctx.fillStyle = alpha(BONE, fill * a);
    ctx.fill();
    ctx.shadowColor = alpha(BONE, 0.8);
    ctx.shadowBlur = 10 * u * (2 - a);
    ctx.strokeStyle = alpha(BONE, 0.75 * a);
    ctx.lineWidth = 3.5 * u;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = alpha("#FFFFFF", 0.35 * a);
    ctx.lineWidth = 1 * u;
    ctx.stroke();
    ctx.restore();
  }
  function pencil(points, at, dur, color, width = 3.5) {
    seed++;
    const p = progress(t, at, dur);
    if (p <= 0)
      return 0;
    const { points: drawn } = along(roughen(points, 1.3 * u, seed * 3.3), p);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    trace(ctx, drawn);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * u;
    ctx.stroke();
    ctx.setLineDash([2 * u, 9 * u]);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = width * 0.5 * u;
    ctx.stroke();
    ctx.restore();
    return p;
  }
  function scrawl(s, x, y, size, color, align, p) {
    if (p <= 0)
      return;
    ctx.save();
    ctx.font = `italic 700 ${Math.round(size * u)}px ${HAND11}`;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(s).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.beginPath();
    ctx.rect(left - 4 * u, y - size * u, (w + 8 * u) * clamp(p), size * 2 * u);
    ctx.clip();
    ctx.textAlign = "left";
    ctx.fillStyle = color;
    ctx.fillText(s, left, y);
    ctx.restore();
  }
  return {
    surface() {
      const on = t < 0.5 ? hash(Math.floor(t * 30)) > 0.4 ? 1 : 0.55 : 1;
      const box = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
      box.addColorStop(0, `rgba(${Math.round(248 * on)},${Math.round(250 * on)},${Math.round(255 * on)},1)`);
      box.addColorStop(1, `rgba(${Math.round(196 * on)},${Math.round(204 * on)},${Math.round(214 * on)},1)`);
      ctx.fillStyle = box;
      ctx.fillRect(0, 0, W, H);
      const { x0, y0, x1, y1 } = film;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 16 * u;
      ctx.fillStyle = "#7E8C9C";
      ctx.fillRect(x0 - 6 * u, y0 - 6 * u, x1 - x0 + 12 * u, y1 - y0 + 12 * u);
      ctx.restore();
      const fg = ctx.createLinearGradient(x0, y0, x1, y1);
      fg.addColorStop(0, "#142338");
      fg.addColorStop(1, FILM);
      ctx.fillStyle = fg;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeStyle = "rgba(200,220,240,0.06)";
      ctx.lineWidth = 1 * u;
      for (let i = 0;i < 10; i++) {
        const sx = x0 + hash(i * 3.1) * (x1 - x0);
        const sy = y0 + hash(i * 5.3) * (y1 - y0);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + (hash(i) - 0.5) * 60 * u, sy + hash(i * 2) * 120 * u);
        ctx.stroke();
      }
      for (const cx of [0.3, 0.7]) {
        ctx.fillStyle = "#A9B3BE";
        ctx.fillRect(W * cx - 18 * u, y0 - 12 * u, 36 * u, 16 * u);
        ctx.fillStyle = "#6C7682";
        ctx.fillRect(W * cx - 4 * u, y0 - 14 * u, 8 * u, 6 * u);
      }
      ctx.strokeStyle = "rgba(200,220,240,0.12)";
      ctx.strokeRect(x0 + 16 * u, y0 + 16 * u, x1 - x0 - 32 * u, y1 - y0 - 32 * u);
      ctx.fillStyle = "rgba(230,240,250,0.7)";
      ctx.font = `700 ${Math.round(16 * u)}px ${MONO16}`;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText("R", x1 - 24 * u, y1 - 22 * u);
      ctx.font = `${Math.round(10 * u)}px ${MONO16}`;
      ctx.fillStyle = "rgba(200,215,230,0.4)";
      ctx.fillText("MODEL-01  ·  24 OCT  ·  kVp 70", x1 - 50 * u, y1 - 24 * u);
      const d = clamp(t / 1.4);
      if (d < 1) {
        const fog = ctx.createLinearGradient(0, y0, 0, y1);
        fog.addColorStop(0, `rgba(170,185,200,${0.6 * (1 - d) ** 2})`);
        fog.addColorStop(clamp(d), `rgba(170,185,200,${0.6 * (1 - d)})`);
        fog.addColorStop(1, `rgba(170,185,200,${0.75 * (1 - d * 0.5)})`);
        ctx.fillStyle = fog;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    },
    title(s, o = {}) {
      const { x = 0.035, y = 0.075, size = 34, at = 0, dur = 0.9 } = o;
      const p = progress(t, at, 0.2);
      if (p <= 0)
        return;
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${HAND11}`;
      const w = ctx.measureText(s.toUpperCase()).width + 36 * u;
      const h = size * 1.5 * u;
      ctx.translate(X(x), Y(y));
      ctx.rotate(-0.01);
      ctx.globalAlpha = p;
      ctx.fillStyle = "#E7D9A8";
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      for (let i = 0;i <= 6; i++)
        ctx.lineTo(w + (i % 2 ? 4 : 0) * u, -h / 2 + h * i / 6);
      for (let i = 6;i >= 0; i--)
        ctx.lineTo((i % 2 ? -4 : 0) * u, -h / 2 + h * i / 6);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${HAND11}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.beginPath();
      ctx.rect(X(x), Y(y) - h, w * progress(t, at + 0.15, dur), h * 2);
      ctx.clip();
      ctx.fillStyle = "#2A2620";
      ctx.fillText(s.toUpperCase(), X(x) + 18 * u, Y(y) + 1 * u);
      ctx.restore();
    },
    label(s, x, y, o = {}) {
      const { at = 0, size = 30, tone = "ink", align = "center" } = o;
      scrawl(s, X(x), Y(y), size, PENCIL2[tone], align, progress(t, at, o.dur ?? 0.04 * s.length + 0.15));
    },
    node(x, y, r, o = {}) {
      const { at = 0, dur = 0.5 } = o;
      const R = r * u;
      const [cx, cy] = [X(x), Y(y)];
      const a = develop(at, dur);
      shell(() => {
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
      }, a);
      shell(() => {
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.3, 0, Math.PI * 2);
      }, a, 0.5);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.6 } = o;
      const [x0, y0, bw, bh] = [X(x), Y(y), X(w), Y(h)];
      const a = develop(at, dur);
      shell(() => {
        ctx.beginPath();
        ctx.roundRect(x0, y0, bw, bh, 16 * u);
      }, a, 0.08);
      for (const [sx, sy] of [
        [x0 + 12 * u, y0 + 12 * u],
        [x0 + bw - 12 * u, y0 + 12 * u],
        [x0 + 12 * u, y0 + bh - 12 * u],
        [x0 + bw - 12 * u, y0 + bh - 12 * u]
      ]) {
        shell(() => {
          ctx.beginPath();
          ctx.arc(sx, sy, 4 * u, 0, Math.PI * 2);
        }, a, 0.4);
      }
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.35, bend = 0, head = true, tone = "ink" } = o;
      const pts = curve([X(x1), Y(y1)], [X(x2), Y(y2)], bend);
      if (!head) {
        const a = develop(at, dur * 2);
        if (a <= 0)
          return;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        trace(ctx, pts);
        ctx.strokeStyle = alpha(BONE, 0.28 * a);
        ctx.lineWidth = 2 * u;
        ctx.stroke();
        ctx.restore();
        return;
      }
      const color = PENCIL2[tone];
      const p = pencil(pts, at, dur, color);
      if (p >= 1) {
        const end = pts.at(-1);
        const prev = pts.at(-3);
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        const s = 16 * u;
        pencil([
          [end[0] - Math.cos(a - 0.5) * s, end[1] - Math.sin(a - 0.5) * s],
          end,
          [end[0] - Math.cos(a + 0.5) * s, end[1] - Math.sin(a + 0.5) * s]
        ], at + dur, 0.1, color);
      }
    },
    store(x, y, w, h, o = {}) {
      const { at = 0, dur = 0.8 } = o;
      const [x0, y0, x1, y1] = [X(x), Y(y), X(x + w), Y(y + h)];
      const a = develop(at, dur);
      const cx = (x0 + x1) / 2;
      shell(() => {
        ctx.beginPath();
        ctx.roundRect(x0, y0 + 10 * u, x1 - x0, y1 - y0 - 10 * u, 10 * u);
      }, a, 0.1);
      shell(() => {
        ctx.beginPath();
        ctx.roundRect(cx - (x1 - x0) * 0.2, y0, (x1 - x0) * 0.4, 12 * u, 3 * u);
      }, a, 0.5);
      for (let i = 0;i < 5; i++) {
        const py = y0 + 24 * u + i * ((y1 - y0 - 36 * u) / 5);
        shell(() => {
          ctx.beginPath();
          ctx.rect(x0 + 8 * u, py, x1 - x0 - 16 * u, (y1 - y0) / 14);
        }, a * clamp(develop(at, dur) * 5 - i), 0.25);
      }
    },
    stat(s, x, y, o = {}) {
      const { at = 0, dur = 1, count, size = 90, sub } = o;
      if (t < at)
        return;
      const value = count ? counting(t, at, dur, count) + s : s;
      if (sub) {
        ctx.save();
        ctx.font = `700 ${Math.round(size * 0.9 * u)}px ${MONO16}`;
        const w = Math.max(ctx.measureText(value).width, size * 2.2 * u) + 30 * u;
        const h = size * 1.7 * u;
        const [px, py] = [X(x) - w / 2, Y(y) - h / 2];
        ctx.fillStyle = "#D7DEE6";
        ctx.fillRect(px, py, w, h);
        ctx.fillStyle = "#1B2027";
        ctx.font = `${Math.round(size * 0.16 * u)}px ${MONO16}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`MODEL  ·  ${sub.toUpperCase()}`, px + 12 * u, py + 10 * u);
        ctx.font = `700 ${Math.round(size * 0.9 * u)}px ${MONO16}`;
        ctx.textBaseline = "middle";
        ctx.fillText(value, px + 12 * u, py + h * 0.6);
        ctx.restore();
        pencil(ellipse(X(x), Y(y) + h * 0.1, w * 0.62, h * 0.7, 40, -Math.PI * 0.7, 1.08), at + dur + 0.1, 0.45, PENCIL2.bad, 4);
      } else {
        ctx.save();
        ctx.globalAlpha = develop(at, 0.3);
        ctx.font = `700 ${Math.round(size * u)}px ${MONO16}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = BONE;
        ctx.shadowColor = BONE;
        ctx.shadowBlur = 10 * u;
        ctx.fillText(value, X(x), Y(y));
        ctx.restore();
      }
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, dur = 0.3, size = 34 } = o;
      const s = size * u;
      const [cx, cy] = [X(x), Y(y)];
      if (kind === "check")
        pencil([
          [cx - s * 0.5, cy],
          [cx - s * 0.12, cy + s * 0.4],
          [cx + s * 0.6, cy - s * 0.5]
        ], at, dur, PENCIL2.good, 4);
      else {
        pencil([
          [cx - s * 0.45, cy - s * 0.45],
          [cx + s * 0.45, cy + s * 0.45]
        ], at, dur / 2, PENCIL2.bad, 4);
        pencil([
          [cx + s * 0.45, cy - s * 0.45],
          [cx - s * 0.45, cy + s * 0.45]
        ], at + dur / 2, dur / 2, PENCIL2.bad, 4);
      }
    },
    finish() {
      grain(ctx, m, t, 0.035, 2);
    }
  };
}
var x_ray_default = {
  id: "x-ray",
  name: "X-ray lightbox",
  category: "Light & Imaging",
  make: make85
};

// plugin/skills/motion-graphics/styles/y2k-chrome.ts
var TONE21 = {
  ink: "#3A3F7A",
  accent: "#7A6CFF",
  good: "#22B573",
  bad: "#FF4D7D",
  muted: "#9A95C8"
};
var ROUND8 = '"Arial Rounded MT Bold", "Nunito", "Avenir Next", "Helvetica Neue", Arial, sans-serif';
function make86(ctx, t, m) {
  const { W, H, u, X, Y } = frame(m);
  const pop = (at) => spring(t, { start: at, stiffness: 180, damping: 11 });
  function metal(y0, y1) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, "#FFFFFF");
    g.addColorStop(0.3, "#B3BFEF");
    g.addColorStop(0.5, "#3F4592");
    g.addColorStop(0.6, "#7F8CDA");
    g.addColorStop(0.8, "#F2E8FF");
    g.addColorStop(1, "#B7A6F0");
    return g;
  }
  function bubble(s, x, y, px, align = "center") {
    ctx.save();
    ctx.font = `800 ${Math.round(px)}px ${ROUND8}`;
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
  function glass(x, y, w, h, r, tint = "#FFFFFF") {
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
  function glint(x, y, s, a) {
    if (a <= 0)
      return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    for (let i = 0;i < 8; i++) {
      const r = i % 2 ? s * 0.18 : s;
      const an = i / 8 * Math.PI * 2;
      ctx.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
    }
    ctx.fill();
    ctx.restore();
  }
  function blob(cx, cy, r, seed, tone) {
    const pts = Array.from({ length: 40 }, (_, i) => {
      const a = i / 40 * Math.PI * 2;
      const k = 1 + 0.07 * Math.sin(a * 3 + t * 2.2 + seed) + 0.05 * Math.sin(a * 5 - t * 1.7 + seed * 2);
      return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k];
    });
    ctx.save();
    ctx.shadowColor = "rgba(90,70,170,0.35)";
    ctx.shadowBlur = r * 0.6;
    ctx.shadowOffsetY = r * 0.25;
    ctx.beginPath();
    for (const [i, [x, y]] of pts.entries())
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    ctx.closePath();
    ctx.fillStyle = metal(cy - r, cy + r);
    ctx.fill();
    ctx.shadowColor = "transparent";
    const rim = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    rim.addColorStop(0, "#9FF3FF");
    rim.addColorStop(0.5, TONE21[tone]);
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
      ctx.save();
      for (let i = 0;i < 9; i++) {
        const r = (10 + hash(i * 4.1) * 22) * u;
        const x = hash(i * 2.7) * W + Math.sin(t * 0.7 + i) * 10 * u;
        const y = H - ((t * (12 + hash(i) * 18) * u + hash(i * 5.3) * H) % (H + r * 2) - r);
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
      if (t < at)
        return;
      const k = pop(at);
      ctx.save();
      ctx.globalAlpha = clamp(k);
      ctx.font = `700 ${Math.round(size * u)}px ${ROUND8}`;
      const tw = ctx.measureText(text).width;
      const ph = size * u * 1.7;
      const yy = Y(y) + (1 - k) * 20 * u;
      glass(X(x), yy, tw + 36 * u, ph, ph / 2);
      ctx.fillStyle = TONE21.ink;
      ctx.textBaseline = "middle";
      ctx.fillText(text, X(x) + 18 * u, yy + ph / 2);
      ctx.restore();
    },
    label(text, x, y, o = {}) {
      const { at = 0, size = 36, tone = "ink", align = "center" } = o;
      if (t < at)
        return;
      const k = pop(at);
      ctx.save();
      ctx.font = `700 ${Math.round(size * u)}px ${ROUND8}`;
      const tw = ctx.measureText(text).width;
      const ph = size * u * 1.6;
      const cx = align === "center" ? X(x) : align === "right" ? X(x) - tw / 2 - 16 * u : X(x) + tw / 2 + 16 * u;
      ctx.translate(cx, Y(y));
      ctx.scale(k, k);
      glass(-tw / 2 - 16 * u, -ph / 2, tw + 32 * u, ph, ph / 2);
      ctx.fillStyle = tone === "ink" ? TONE21.ink : TONE21[tone];
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 0, 0);
      ctx.restore();
    },
    node(x, y, r, o = {}) {
      const { at = 0, tone = "accent" } = o;
      if (t < at)
        return;
      const k = pop(at);
      if (k <= 0)
        return;
      blob(X(x), Y(y) - (1 - clamp(k)) * 40 * u, r * u * 1.15 * k, x * 17 + y * 5, tone);
    },
    box(x, y, w, h, o = {}) {
      const { at = 0, tone = "ink" } = o;
      if (t < at)
        return;
      const k = pop(at);
      ctx.save();
      ctx.globalAlpha = clamp(k * 1.5);
      ctx.translate(0, (1 - k) * 30 * u);
      glass(X(x), Y(y), X(w), Y(h), 26 * u, tone === "good" ? "#F0FFF8" : "#FFFFFF");
      ctx.restore();
    },
    link(x1, y1, x2, y2, o = {}) {
      const { at = 0, dur = 0.4, bend = 0, head = true, tone = "accent" } = o;
      if (t < at)
        return;
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
      if (!head)
        ctx.globalAlpha = 0.75;
      ctx.beginPath();
      for (const [i, [px, py]] of shown.entries())
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      ctx.stroke();
      if (head) {
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 1.5 * u;
        ctx.stroke();
      }
      if (head && p >= 1) {
        const e = pts.at(-1);
        const q = pts.at(-3);
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
      if (t < at)
        return;
      const n = 4;
      const rx = X(w) / 2;
      const ry = rx * 0.32;
      const cx = X(x + w / 2);
      const gap = (Y(h) - ry * 2) / (n - 1);
      for (let i = 0;i < n; i++) {
        const k = pop(at + i * dur / n);
        if (k <= 0)
          continue;
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
      if (t < at)
        return;
      const s = count ? counting(t, at, dur, count) + text : text;
      const k = pop(at);
      ctx.save();
      ctx.translate(X(x), Y(y) - (sub ? size * u * 0.2 : 0));
      ctx.scale(k, k);
      bubble(s, 0, 0, size * u * 1.15);
      ctx.restore();
      if (sub) {
        ctx.save();
        ctx.font = `700 ${Math.round(size * u * 0.26)}px ${ROUND8}`;
        ctx.fillStyle = TONE21[tone === "accent" ? "accent" : tone];
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = clamp((t - at - 0.3) / 0.3);
        ctx.fillText(sub, X(x), Y(y) + size * u * 0.65);
        ctx.restore();
      }
      glint(X(x) + size * u * 0.9, Y(y) - size * u * 0.6, 14 * u * (0.6 + 0.4 * Math.sin(t * 4)), clamp((t - at - dur) / 0.3));
    },
    mark(kind, x, y, o = {}) {
      const { at = 0, size = 40 } = o;
      if (t < at)
        return;
      const k = pop(at);
      const r = size * u * 0.7 * k;
      if (r <= 0)
        return;
      const cx = X(x);
      const cy = Y(y);
      ctx.save();
      const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
      g.addColorStop(0, kind === "check" ? "#9AF5C8" : "#FFB0C8");
      g.addColorStop(1, kind === "check" ? TONE21.good : TONE21.bad);
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
      for (let i = 0;i < 6; i++) {
        const a = Math.sin(t * 2.5 + i * 1.9);
        glint(hash(i * 6.1) * W, hash(i * 8.3) * H, 10 * u, a > 0.6 ? (a - 0.6) * 2.5 : 0);
      }
    }
  };
}
var y2k_chrome_default = {
  id: "y2k-chrome",
  name: "Liquid chrome",
  category: "Retro UI & Neon",
  make: make86
};

// plugin/skills/motion-graphics/styles/index.ts
var STYLES = {
  "art-deco": art_deco_default,
  "ascii-render": ascii_render_default,
  "ballpoint-notebook": ballpoint_notebook_default,
  bauhaus: bauhaus_default,
  blueprint: blueprint_default,
  "botanical-plate": botanical_plate_default,
  chalkboard: chalkboard_default,
  claymation: claymation_default,
  "collage-zine": collage_zine_default,
  comic: comic_default,
  constructivist: constructivist_default,
  cosmic: cosmic_default,
  "cross-stitch": cross_stitch_default,
  "crt-terminal": crt_terminal_default,
  "cut-paper": cut_paper_default,
  "deep-sea": deep_sea_default,
  "editorial-chart": editorial_chart_default,
  "editorial-collage": editorial_collage_default,
  "etch-sketch": etch_sketch_default,
  "felt-quilt": felt_quilt_default,
  "film-noir": film_noir_default,
  "flat-space": flat_space_default,
  "flow-field": flow_field_default,
  gameboy: gameboy_default,
  glassmorphism: glassmorphism_default,
  "gouache-poster": gouache_poster_default,
  "holographic-foil": holographic_foil_default,
  illuminated: illuminated_default,
  "impasto-oil": impasto_oil_default,
  isometric: isometric_default,
  isotype: isotype_default,
  kawaii: kawaii_default,
  "kinetic-type": kinetic_type_default,
  letterpress: letterpress_default,
  "light-painting": light_painting_default,
  linocut: linocut_default,
  "low-poly": low_poly_default,
  "mac-1bit": mac_1bit_default,
  "manga-panel": manga_panel_default,
  "math-anim": math_anim_default,
  memphis: memphis_default,
  mosaic: mosaic_default,
  "ms-paint": ms_paint_default,
  "napkin-sketch": napkin_sketch_default,
  "neon-sign": neon_sign_default,
  newsprint: newsprint_default,
  "op-art": op_art_default,
  origami: origami_default,
  oscilloscope: oscilloscope_default,
  "paper-marbling": paper_marbling_default,
  papercraft: papercraft_default,
  "patent-drawing": patent_drawing_default,
  "pixel-16bit": pixel_16bit_default,
  pointillism: pointillism_default,
  "product-launch": product_launch_default,
  psychedelic: psychedelic_default,
  ridgeline: ridgeline_default,
  risograph: risograph_default,
  "screenprint-grid": screenprint_grid_default,
  "shadow-puppet": shadow_puppet_default,
  "sketchbook-pencil": sketchbook_pencil_default,
  "soft-3d": soft_3d_default,
  spirograph: spirograph_default,
  "stained-glass": stained_glass_default,
  "sticky-notes": sticky_notes_default,
  "string-art": string_art_default,
  "sumi-e": sumi_e_default,
  "swiss-grid": swiss_grid_default,
  synthwave: synthwave_default,
  "tarot-card": tarot_card_default,
  "tech-glow": tech_glow_default,
  teletext: teletext_default,
  "thermal-camera": thermal_camera_default,
  topographic: topographic_default,
  "transit-map": transit_map_default,
  truchet: truchet_default,
  "ukiyo-e": ukiyo_e_default,
  vaporwave: vaporwave_default,
  "vector-arcade": vector_arcade_default,
  voxel: voxel_default,
  watercolor: watercolor_default,
  whiteboard: whiteboard_default,
  win95: win95_default,
  "wireframe-terrain": wireframe_terrain_default,
  "x-ray": x_ray_default,
  "y2k-chrome": y2k_chrome_default
};
function style(id, ctx, t, m) {
  const s = STYLES[id];
  if (!s)
    throw new Error(`No style "${id}". Styles: ${Object.keys(STYLES).join(", ")}`);
  return s.make(ctx, t, m);
}
export {
  STYLES,
  along,
  alpha,
  arrowhead,
  clamp,
  counting,
  curve,
  easeIn,
  ellipse,
  expo,
  frame,
  grain,
  hash,
  lerp,
  progress,
  roughen,
  spring,
  style,
  text,
  trace,
  vignette
};
