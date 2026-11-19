const DIR = decodeURIComponent(new URL(".", import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1").replace(/\/$/, "");
export const sfx = (name) => `${DIR}/assets/sfx/${name}.wav`;
const FACES = {
  display: 'Inter, "Noto Color Emoji"',
  serif: '"Charis SIL", "Noto Color Emoji"',
  mono: '"JetBrains Mono", "Noto Color Emoji"'
};
export const THEMES = {
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
export const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const lerp = (a, b, p) => a + (b - a) * p;
export function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
export function expo(p) {
  const x = clamp(p);
  return x === 1 ? 1 : 1 - 2 ** (-10 * x);
}
export const easeIn = (p) => clamp(p) ** 3;
export function presence(t, a, b = 1 / 0, fadeIn = 0.45, fadeOut = 0.35) {
  if (t < a || t > b)
    return 0;
  return Math.min(expo((t - a) / fadeIn), 1 - easeIn(1 - (b - t) / fadeOut));
}
export function alpha(hex, a) {
  if (!hex.startsWith("#"))
    return hex;
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}
export function words(cues) {
  const out = [];
  for (const c of cues) {
    const lit = /\*([^*]+)\*/.exec(c.text);
    if (lit?.[1])
      out.push({ text: lit[1], start: c.start, end: c.end });
  }
  return out;
}
export function cutPoints(cues, every = 2.2) {
  const cuts = [];
  let last = 0;
  for (const w of words(cues)) {
    if (w.start - last >= every) {
      cuts.push(w.start);
      last = w.start;
    }
  }
  return cuts;
}
export function spring(t, { from = 0, to = 1, start = 0, stiffness = 100, damping = 10, mass = 1 } = {}) {
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
export function noise(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(i + seed * 1013.7) * 2 - 1;
  const b = hash(i + 1 + seed * 1013.7) * 2 - 1;
  return a + (b - a) * f * f * (3 - 2 * f);
}
export function shake(t, at, { amount = 18, dur = 0.5, freq = 24, seed = 1 } = {}) {
  const d = t - at;
  if (d < 0 || d > dur)
    return { x: 0, y: 0, roll: 0 };
  const k = (1 - d / dur) ** 2;
  return {
    x: noise(d * freq, seed) * amount * k,
    y: noise(d * freq, seed + 1) * amount * k,
    roll: noise(d * freq, seed + 2) * 0.0012 * amount * k
  };
}
export function handheld(t, amount = 1, seed = 7) {
  return {
    x: (noise(t * 0.6, seed) * 14 + noise(t * 2.3, seed + 3) * 3) * amount,
    y: (noise(t * 0.5, seed + 1) * 10 + noise(t * 2.1, seed + 4) * 3) * amount,
    roll: noise(t * 0.4, seed + 5) * 0.008 * amount
  };
}
export const REST = { x: 0, y: 0, sx: 0, sy: 0, zoom: 1, roll: 0, z: 0 };
function settle(t, at, dur, zeta) {
  const stiffness = (7 / dur) ** 2;
  return spring(t, { start: at, stiffness, damping: 2 * zeta * Math.sqrt(stiffness) });
}
export function move(t, mv, cam = REST) {
  const s = mv.strength ?? 1;
  const dur = mv.dur ?? 1.6;
  if (t < mv.at)
    return cam;
  const c = { ...cam };
  switch (mv.preset) {
    case "push-in":
      c.z += 0.12 * s * settle(t, mv.at, dur, 0.95);
      break;
    case "dolly":
      c.x += 0.07 * s * settle(t, mv.at, dur, 0.95);
      break;
    case "crash-zoom":
      c.zoom *= 1 + 0.45 * s * settle(t, mv.at, dur, 0.45);
      break;
    case "whip-pan":
      c.x += 0.5 * s * settle(t, mv.at, dur, 0.7);
      break;
    case "orbit": {
      const p = settle(t, mv.at, dur, 0.95);
      c.x += 0.09 * s * p;
      c.roll += 0.02 * s * p;
      c.zoom *= 1 + 0.05 * s * Math.sin(Math.PI * Math.min(1, p));
      break;
    }
    case "handheld": {
      if (t > mv.at + (mv.dur ?? Number.POSITIVE_INFINITY))
        break;
      const h = handheld(t - mv.at, s);
      c.sx += h.x;
      c.sy += h.y;
      c.roll += h.roll;
      break;
    }
    case "dolly-zoom": {
      const z = 0.4 * s * settle(t, mv.at, dur, 0.95);
      c.z += z;
      c.zoom *= 1 - z;
      break;
    }
  }
  return c;
}
export function cameraAt(t, { moves = [], shakes = [], seed = 1 } = {}) {
  let cam = REST;
  for (const mv of moves)
    cam = move(t, mv, cam);
  for (const [i, s] of shakes.entries()) {
    const k = shake(t, s.at, { amount: s.amount, seed: seed + i * 17 });
    cam = { ...cam, sx: cam.sx + k.x, sy: cam.sy + k.y, roll: cam.roll + k.roll };
  }
  return cam;
}
const depthScale = (depth, cam) => cam.zoom * (1 + depth) / Math.max(0.05, 1 + depth - cam.z);
export function project(x, y, depth, cam, W, H, u = 1) {
  const scale = depthScale(depth, cam);
  const k = 1 / Math.max(0.05, 1 + depth);
  const cx = W / 2;
  const cy = H / 2;
  const dx = (x - cx - cam.x * W * k) * scale + cam.sx * u;
  const dy = (y - cy - cam.y * H * k) * scale + cam.sy * u;
  const [c, s] = [Math.cos(cam.roll), Math.sin(cam.roll)];
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c, scale };
}
const GRAIN = new URL("assets/grain.png", import.meta.url).href;
const PAPER = new URL("assets/paper.png", import.meta.url).href;
const TAPE = new URL("assets/tape.png", import.meta.url).href;
const pictures = new Map;
export function picture(path) {
  let img = pictures.get(path);
  if (!img && document.readyState === "complete") {
    throw new Error(`${path} wasn't loaded with the page: call picture() for it as the page loads`);
  }
  if (!img) {
    img = new Image;
    img.src = path;
    img.hidden = true;
    document.documentElement.append(img);
    pictures.set(path, img);
    return img;
  }
  if (!img.complete) {
    throw new Error(`${path} hasn't loaded: call picture() for it as the page loads`);
  }
  return img;
}
export function page(draw, {
  audio,
  blur
} = {}) {
  const m = globalThis.mockingbird;
  const canvas = document.createElement("canvas");
  canvas.width = m.width;
  canvas.height = m.height;
  canvas.style.cssText = "position:absolute;left:0;top:0";
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  m.drawVideo = true;
  if (audio)
    m.audio = audio(m);
  picture(GRAIN);
  picture(PAPER);
  picture(TAPE);
  const frame = (c, t) => {
    c.reset();
    if (m.video)
      c.drawImage(m.video, 0, 0, m.width, m.height);
    return draw(c, t, m);
  };
  const { samples = 4, shutter = 0.5 } = blur === true ? {} : blur || { samples: 1 };
  if (samples <= 1) {
    m.draw = (t) => frame(ctx, t);
    return;
  }
  const sum = new OffscreenCanvas(m.width, m.height);
  const sctx = sum.getContext("2d");
  m.draw = async (t) => {
    sctx.reset();
    for (let i = 0;i < samples; i++) {
      await frame(ctx, Math.max(0, t - shutter / m.fps * (i / (samples - 1))));
      sctx.globalAlpha = 1 / (i + 1);
      sctx.drawImage(canvas, 0, 0);
    }
    ctx.reset();
    ctx.drawImage(sum, 0, 0);
  };
}
const SPARE = [];
export function kit(ctx, t, m, theme = THEMES.night) {
  const W = m.width;
  const H = m.height;
  const u = Math.min(W, H) / 1080;
  const T = theme;
  const font = (size, weight = 700, family = T.display, italic = false) => `${italic ? "italic " : ""}${weight} ${Math.round(size * u)}px ${family}`;
  const fit = (text, width, size, weight = 700, family = T.display) => {
    ctx.save();
    ctx.font = font(size, weight, family);
    const w = ctx.measureText(text).width;
    ctx.restore();
    return w <= width ? size : Math.max(1, size * width / w);
  };
  const alphas = [];
  const layer = (draw) => {
    ctx.save();
    alphas.push(ctx.globalAlpha);
    try {
      draw();
    } finally {
      alphas.pop();
      ctx.restore();
    }
  };
  const fade = (x) => {
    ctx.globalAlpha = (alphas.at(-1) ?? 1) * x;
  };
  const soften = (draw, color, blur, a = 1) => layer(() => {
    const far = (W + H) * 4;
    const m0 = ctx.getTransform();
    fade(a);
    ctx.shadowColor = color.startsWith("#") ? color : T.ink;
    ctx.shadowBlur = blur * 2 * Math.hypot(m0.a, m0.b);
    ctx.shadowOffsetX = far;
    ctx.shadowOffsetY = 0;
    ctx.setTransform(m0.a, m0.b, m0.c, m0.d, m0.e - far, m0.f);
    draw();
  });
  const rad = (T.light ?? 90) * Math.PI / 180;
  const beam = { x: -Math.cos(rad), y: Math.sin(rad) };
  const drop = (distance, blur = distance * 2.5, color = "rgba(0,0,0,0.45)") => {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * u;
    ctx.shadowOffsetX = beam.x * distance * u;
    ctx.shadowOffsetY = beam.y * distance * u;
  };
  function rim(x, y, w, h, r = 24 * u, strength = 0.55) {
    layer(() => {
      const [cx, cy] = [x + w / 2, y + h / 2];
      const reach = (Math.abs(beam.x) * w + Math.abs(beam.y) * h) / 2;
      const g = ctx.createLinearGradient(cx - beam.x * reach, cy - beam.y * reach, cx + beam.x * reach, cy + beam.y * reach);
      g.addColorStop(0, `rgba(255,255,255,${strength})`);
      g.addColorStop(0.45, "rgba(255,255,255,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.stroke();
    });
  }
  function sweep(at, dur = 1.1, strength = 0.35) {
    const p = (t - at) / dur;
    if (p <= 0 || p >= 1)
      return;
    layer(() => {
      const span = Math.hypot(W, H);
      const pos = (p * 1.4 - 0.2) * span;
      const [x0, y0] = [W / 2 - beam.x * span / 2, H / 2 - beam.y * span / 2];
      const g = ctx.createLinearGradient(x0 + beam.x * (pos - 120 * u), y0 + beam.y * (pos - 120 * u), x0 + beam.x * (pos + 120 * u), y0 + beam.y * (pos + 120 * u));
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, `rgba(255,255,255,${strength * Math.sin(Math.PI * p)})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
  }
  const canvasLike = (w, h, i) => {
    SPARE[i] ??= new OffscreenCanvas(1, 1);
    const c = SPARE[i];
    if (c.width !== w || c.height !== h)
      [c.width, c.height] = [w, h];
    return c;
  };
  function defocus(paint, blur) {
    const under = canvasLike(W, H, 0);
    const u0 = under.getContext("2d");
    u0.clearRect(0, 0, W, H);
    u0.drawImage(ctx.canvas, 0, 0);
    layer(() => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
    });
    paint();
    let src = ctx.canvas;
    let [w, h] = [W, H];
    let i = 1;
    while (i === 1 || W / w < blur / 1.5 && w > 8) {
      [w, h] = [Math.ceil(w / 2), Math.ceil(h / 2)];
      const c = canvasLike(w, h, i++);
      const c2 = c.getContext("2d");
      c2.clearRect(0, 0, w, h);
      c2.imageSmoothingQuality = "high";
      c2.drawImage(src, 0, 0, w, h);
      src = c;
    }
    layer(() => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(under, 0, 0);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(src, 0, 0, w, h, 0, 0, W, H);
    });
  }
  function view({
    moves = [],
    shakes = [],
    focus = 0,
    aperture = 0,
    seed = 1
  } = {}) {
    const cam = cameraAt(t, { moves, shakes, seed });
    return {
      ...cam,
      layer(depth, paint) {
        const placed = () => layer(() => {
          const scale = depthScale(depth, cam);
          const k = 1 / Math.max(0.05, 1 + depth);
          ctx.translate(W / 2, H / 2);
          ctx.rotate(cam.roll);
          ctx.translate(cam.sx * u, cam.sy * u);
          ctx.scale(scale, scale);
          ctx.translate(-W / 2 - cam.x * W * k, -H / 2 - cam.y * H * k);
          paint();
        });
        const blur = Math.abs(depth - focus) * aperture * u;
        if (blur < 1.5)
          return placed();
        defocus(placed, blur);
      },
      project: (x, y, depth = 0) => project(x, y, depth, cam, W, H, u)
    };
  }
  function backdrop({ drift = 1, grid = false, opacity = 1 } = {}) {
    layer(() => {
      fade(opacity);
      const base = ctx.createLinearGradient(0, 0, W, H);
      base.addColorStop(0, T.bg[0]);
      base.addColorStop(1, T.bg[1]);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = T.dark ? "screen" : "source-over";
      const R = Math.max(W, H);
      T.glows.forEach((c, i) => {
        const s = t * 0.13 * drift + i * 2.1;
        const x = W * (0.5 + 0.42 * Math.cos(s * (1 + i * 0.3)));
        const y = H * (0.5 + 0.38 * Math.sin(s * (0.8 + i * 0.25) + i));
        const r = R * (0.48 + 0.1 * Math.sin(s * 1.7 + i));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, alpha(c, T.glow));
        g.addColorStop(0.5, alpha(c, T.glow * 0.32));
        g.addColorStop(1, alpha(c, 0));
        ctx.fillStyle = g;
        const x0 = Math.max(0, x - r);
        const y0 = Math.max(0, y - r);
        ctx.fillRect(x0, y0, Math.min(W, x + r) - x0, Math.min(H, y + r) - y0);
      });
      if (grid) {
        ctx.globalCompositeOperation = "source-over";
        const step = 90 * u;
        const off = t * 12 * u * drift % step;
        ctx.strokeStyle = alpha(T.dark ? "#FFFFFF" : "#000000", 0.06);
        ctx.lineWidth = 1 * u;
        ctx.beginPath();
        for (let x = -off;x < W; x += step) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, H);
        }
        for (let y = -off;y < H; y += step) {
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
        }
        ctx.stroke();
        const fade = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R * 0.7);
        fade.addColorStop(0, alpha(T.bg[0], 0));
        fade.addColorStop(1, alpha(T.bg[0], 0.9));
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, W, H);
      }
    });
  }
  function grain(amount = 0.07) {
    const tile = picture(GRAIN);
    const s = tile.width;
    const ox = -hash(m.frame) * s;
    const oy = -hash(m.frame + 0.5) * s;
    layer(() => {
      fade(amount);
      ctx.globalCompositeOperation = "overlay";
      for (let y = oy;y < H; y += s)
        for (let x = ox;x < W; x += s)
          ctx.drawImage(tile, x, y, s, s);
    });
  }
  function vignette(strength = 0.55) {
    layer(() => {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${strength})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
  }
  function bokeh({ count = 26, color = T.accent, opacity = 0.5 } = {}) {
    layer(() => {
      for (let i = 0;i < count; i++) {
        const depth = 0.3 + hash(i) * 0.7;
        const r = (6 + 34 * depth * depth) * u;
        const x = hash(i + 7) * W + Math.sin(t * 0.4 + i) * 20 * u;
        const y = ((hash(i + 3) * H - t * 40 * u * depth) % (H + r * 2) + H + r * 2) % (H + r * 2) - r;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const a = opacity * (0.25 + 0.75 * (1 - depth)) * (0.6 + 0.4 * Math.sin(t * 1.3 + i * 2));
        g.addColorStop(0, alpha(i % 3 ? color : T.accent2, a));
        g.addColorStop(1, alpha(i % 3 ? color : T.accent2, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
  function leak(at, dur = 0.9, colors = ["#FFB86B", "#FF5E7E"]) {
    const p = (t - at) / dur;
    if (p < 0 || p > 1)
      return;
    const a = Math.sin(Math.PI * p);
    layer(() => {
      ctx.globalCompositeOperation = "screen";
      colors.forEach((c, i) => {
        const x = lerp(-0.3, 1.3, expo(p) * 0.6 + p * 0.4) * W + i * 0.18 * W;
        const y = H * (0.25 + 0.5 * i);
        const r = Math.max(W, H) * (0.55 - i * 0.1);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, alpha(c, 0.85 * a));
        g.addColorStop(1, alpha(c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      });
    });
  }
  function scrim({
    y,
    h = 600 * u,
    strength = 0.6,
    at = 0,
    out = 1 / 0
  }) {
    const a = presence(t, at, out, 0.2, 0.4);
    if (!a)
      return;
    layer(() => {
      const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.5, `rgba(0,0,0,${strength * a})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, y - h / 2, W, h);
    });
  }
  function flash(at, dur = 0.12, color = "#FFFFFF") {
    const p = (t - at) / dur;
    if (p < 0 || p > 1)
      return;
    layer(() => {
      fade((1 - p) * 0.8);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, W, H);
    });
  }
  const torn = (a, b, rough, seed) => {
    const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / (9 * u)));
    const [nx, ny] = [-(b[1] - a[1]), b[0] - a[0]];
    const len = Math.hypot(nx, ny) || 1;
    return Array.from({ length: n + 1 }, (_, i) => {
      const f = i / n;
      const k = (noise(i * 0.35, seed) * 0.7 + (hash(i + seed * 31) - 0.5) * 0.6) * rough;
      return [lerp(a[0], b[0], f) + nx / len * k, lerp(a[1], b[1], f) + ny / len * k];
    });
  };
  function tornFrame({
    x,
    y,
    w,
    h,
    at = 0,
    out = 1 / 0,
    pad = 34,
    tilt = -0.02,
    seed = 3
  }) {
    const a = presence(t, at, out, 0.5, 0.3);
    if (!a)
      return;
    const P = pad * u;
    const rough = 7 * u;
    const inner = [
      ...torn([x, y], [x + w, y], rough, seed),
      ...torn([x + w, y], [x + w, y + h], rough, seed + 1),
      ...torn([x + w, y + h], [x, y + h], rough, seed + 2),
      ...torn([x, y + h], [x, y], rough, seed + 3)
    ];
    const outer = [
      ...torn([x - P, y - P], [x + w + P, y - P], rough * 1.4, seed + 4),
      ...torn([x + w + P, y - P], [x + w + P, y + h + P], rough * 1.4, seed + 5),
      ...torn([x + w + P, y + h + P], [x - P, y + h + P], rough * 1.4, seed + 6),
      ...torn([x - P, y + h + P], [x - P, y - P], rough * 1.4, seed + 7)
    ];
    const rise = spring(t, { from: 60 * u, to: 0, start: at, stiffness: 140, damping: 14 });
    layer(() => {
      fade(a);
      ctx.translate(x + w / 2, y + h / 2 + rise);
      ctx.rotate(tilt * (1 - a * 0.3));
      ctx.translate(-(x + w / 2), -(y + h / 2));
      const path = () => {
        ctx.beginPath();
        for (const ring of [outer, inner]) {
          for (const [i, [px, py]] of ring.entries())
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          ctx.closePath();
        }
      };
      layer(() => {
        drop(14, 30, "rgba(0,0,0,0.4)");
        path();
        ctx.fillStyle = ctx.createPattern(picture(PAPER), "repeat");
        ctx.fill("evenodd");
      });
      layer(() => {
        ctx.beginPath();
        for (const [i, [px, py]] of inner.entries())
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        ctx.closePath();
        ctx.clip();
        const far = (W + H) * 4;
        const m0 = ctx.getTransform();
        ctx.shadowColor = "rgba(0,0,0,0.35)";
        ctx.shadowBlur = 8 * u * Math.hypot(m0.a, m0.b);
        ctx.shadowOffsetX = far;
        ctx.setTransform(m0.a, m0.b, m0.c, m0.d, m0.e - far, m0.f);
        ctx.beginPath();
        for (const [i, [px, py]] of inner.entries())
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        ctx.closePath();
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 6 * u;
        ctx.stroke();
      });
      tape(x - P * 0.4, y - P * 0.2, -0.6);
      tape(x + w + P * 0.4, y + h + P * 0.2, -0.5);
    });
  }
  function tape(x, y, angle = -0.5, width = 150) {
    const img = picture(TAPE);
    const tw = width * u;
    const th = tw * img.height / img.width;
    layer(() => {
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.drawImage(img, -tw / 2, -th / 2, tw, th);
    });
  }
  function sticker({
    path,
    text,
    x,
    y,
    w = 260,
    at,
    out = 1 / 0,
    tilt = 0.08,
    color = T.accent,
    ink = T.onAccent
  }) {
    if (t < at || t > out + 0.25)
      return;
    const pop = spring(t, { start: at, stiffness: 260, damping: 13 });
    const leave = t > out ? easeIn((t - out) / 0.25) : 0;
    const k = pop * (1 - leave);
    if (k <= 0.001)
      return;
    const W0 = w * u;
    layer(() => {
      ctx.translate(x, y);
      ctx.rotate(tilt * (2 - pop));
      ctx.scale(k, k);
      const border = 10 * u;
      if (path) {
        const img = picture(path);
        const H0 = W0 * img.height / img.width;
        layer(() => {
          drop(10, 24, "rgba(0,0,0,0.35)");
          ctx.fillStyle = "#FFFFFF";
          ctx.beginPath();
          ctx.roundRect(-W0 / 2 - border, -H0 / 2 - border, W0 + 2 * border, H0 + 2 * border, 18 * u);
          ctx.fill();
        });
        ctx.drawImage(img, -W0 / 2, -H0 / 2, W0, H0);
        return;
      }
      ctx.font = font(w / Math.max(3, (text ?? "").length * 0.62), 900);
      const tw = ctx.measureText(text ?? "").width;
      const th = W0 * 0.42;
      layer(() => {
        drop(10, 24, "rgba(0,0,0,0.35)");
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.roundRect(-tw / 2 - 28 * u - border, -th / 2 - border, tw + 56 * u + 2 * border, th + 2 * border, th);
        ctx.fill();
      });
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(-tw / 2 - 28 * u, -th / 2, tw + 56 * u, th, th);
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text ?? "", 0, 2 * u);
    });
  }
  const snapshot = () => {
    const c = canvasLike(W, H, 9);
    const c2 = c.getContext("2d");
    c2.clearRect(0, 0, W, H);
    c2.drawImage(ctx.canvas, 0, 0);
    return c;
  };
  function glitch(at, dur = 0.22, amount = 1) {
    const p = (t - at) / dur;
    if (p < 0 || p > 1)
      return;
    const k = amount * Math.sin(Math.PI * p);
    const shot = snapshot();
    const f = m.frame;
    layer(() => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      for (const [dx, keep] of [
        [14 * u * k, "#FF0000"],
        [0, "#00FF00"],
        [-14 * u * k, "#0000FF"]
      ]) {
        const c = canvasLike(W, H, 10);
        const c2 = c.getContext("2d");
        c2.globalCompositeOperation = "source-over";
        c2.clearRect(0, 0, W, H);
        c2.drawImage(shot, dx, 0);
        c2.globalCompositeOperation = "multiply";
        c2.fillStyle = keep;
        c2.fillRect(0, 0, W, H);
        c2.globalCompositeOperation = "destination-in";
        c2.drawImage(shot, dx, 0);
        ctx.drawImage(c, 0, 0);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      for (let i = 0;i < 7; i++) {
        if (hash(f * 13 + i) > 0.55)
          continue;
        const sy = hash(f * 7 + i * 3) * H;
        const sh = (0.02 + hash(f * 3 + i) * 0.07) * H;
        const dx = (hash(f * 5 + i * 11) - 0.5) * 120 * u * k;
        ctx.drawImage(shot, 0, sy, W, sh, dx, sy, W, sh);
      }
    });
  }
  function zoomBlur(at, dur = 0.16, amount = 1) {
    const p = (t - at) / dur;
    if (p < 0 || p > 1)
      return;
    const k = (1 - p) * amount;
    const shot = snapshot();
    layer(() => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let i = 1;i <= 4; i++) {
        const s = 1 + 0.045 * i * k;
        ctx.globalAlpha = 0.26 * k;
        ctx.drawImage(shot, (W - W * s) / 2, (H - H * s) / 2, W * s, H * s);
      }
    });
  }
  function scribble({
    points,
    at,
    out = 1 / 0,
    dur = 0.5,
    color = T.accent,
    width = 7,
    loop = false,
    seed = 1
  }) {
    if (t < at || t > out + 0.3)
      return;
    const a = t > out ? 1 - (t - out) / 0.3 : 1;
    const pts = loop ? [...points, points[0]] : points;
    let length = 0;
    for (let i = 1;i < pts.length; i++) {
      const [p, q] = [pts[i - 1], pts[i]];
      length += Math.hypot(q[0] - p[0], q[1] - p[1]);
    }
    layer(() => {
      fade(a);
      for (const pass of [0, 1]) {
        const jitter = (i, axis) => noise(i * 0.7 + pass * 5, seed + axis) * 5 * u;
        stroke((c) => {
          for (const [i, [px, py]] of pts.entries()) {
            const [jx, jy] = [px + jitter(i, 0), py + jitter(i, 1)];
            i ? c.lineTo(jx, jy) : c.moveTo(jx, jy);
          }
        }, length * 1.05, (t - at - pass * dur * 0.35) / dur, { color, width: width * (pass ? 0.6 : 1), glow: false });
      }
    });
  }
  function kinetic({
    text,
    x = W / 2,
    y = H / 2,
    size = 120,
    at,
    out = 1 / 0,
    mode = "scatter",
    stagger = 0.035,
    color = T.ink,
    weight = 900,
    family = T.display,
    italic = false
  }) {
    if (t < at || t > out + 0.3)
      return;
    const leave = t > out ? easeIn((t - out) / 0.3) : 0;
    layer(() => {
      ctx.font = font(size, weight, family, italic);
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      const chars = [...text];
      const widths = chars.map((ch) => ctx.measureText(ch).width);
      const total = widths.reduce((s, v) => s + v, 0);
      let cx = x - total / 2;
      chars.forEach((ch, i) => {
        const w0 = widths[i];
        const start = at + i * stagger;
        const lx = cx;
        cx += w0;
        if (t < start || ch === " ")
          return;
        layer(() => {
          fade(1 - leave);
          ctx.fillStyle = color;
          if (mode === "type") {
            ctx.fillText(ch, lx, y);
            const last = Math.floor((t - at) / stagger) === i;
            if (last && Math.floor(t * 4) % 2 === 0)
              ctx.fillRect(lx + w0 + 4 * u, y - size * 0.4 * u, 6 * u, size * 0.8 * u);
            return;
          }
          if (mode === "glitch") {
            const p = clamp((t - start) / 0.18);
            const on = p >= 1 || hash(m.frame * 7 + i) > 0.4;
            if (!on)
              return;
            const off = (1 - p) * 10 * u;
            for (const [dx, c] of [
              [-off, "#FF2E63"],
              [off, "#08D9D6"]
            ]) {
              ctx.globalAlpha = 0.8 * (1 - p);
              ctx.fillStyle = c;
              ctx.fillText(ch, lx + dx, y);
            }
            ctx.globalAlpha = 1;
            ctx.fillStyle = color;
            ctx.fillText(ch, lx, y);
            return;
          }
          const p = spring(t, { start, stiffness: 160, damping: 15 });
          const fx = (hash(i * 3.1 + 1) - 0.5) * 900 * u;
          const fy = (hash(i * 5.7 + 2) - 0.5) * 700 * u;
          const fr = (hash(i * 9.3 + 3) - 0.5) * 2.4;
          ctx.translate(lx + w0 / 2 + fx * (1 - p), y + fy * (1 - p));
          ctx.rotate(fr * (1 - p));
          ctx.globalAlpha *= clamp(p * 2);
          ctx.fillText(ch, -w0 / 2, 0);
        });
      });
    });
  }
  function camera({
    area = { x: 0, y: 0, w: W, h: H },
    focus = { x: 0.5, y: 0.42 },
    cuts = [],
    framings = [1, 1.16, 1.06, 1.24],
    punches = [],
    shakes = [],
    moves = [],
    presets = [],
    drift = 0.045
  } = {}) {
    const still = {
      zoom: 1,
      project: (x, y) => ({ x: area.x + x * area.w, y: area.y + y * area.h })
    };
    if (!m.video)
      return still;
    let shot = 0;
    while (shot < cuts.length && t >= cuts[shot])
      shot++;
    const start = shot ? cuts[shot - 1] : 0;
    const end = shot < cuts.length ? cuts[shot] : m.duration;
    let zoom = framings[shot % framings.length];
    zoom *= 1 + drift * clamp((t - start) / Math.max(0.5, end - start));
    for (const p of punches) {
      const hold = p.hold ?? 1.2;
      if (t < p.at || t > p.at + hold + 0.6)
        continue;
      const into = spring(t, { from: 0, to: 1, start: p.at, stiffness: 220, damping: 18 });
      const out = expo((t - (p.at + hold)) / 0.5);
      zoom *= 1 + ((p.zoom ?? 1.3) - 1) * into * (1 - (t > p.at + hold ? out : 0));
    }
    let fx = focus.x + (shot % 2 ? 0.04 : -0.02) * (shot ? 1 : 0);
    let fy = focus.y;
    for (const mv of moves) {
      if (t < mv.at || t > mv.out + 1.5)
        continue;
      const there = spring(t, { start: mv.at, stiffness: 40, damping: 11 });
      const back = spring(t, {
        start: Math.max(mv.out - 0.6, (mv.at + mv.out) / 2),
        stiffness: 40,
        damping: 11
      });
      const b = clamp(there - back, 0, 1.1);
      zoom = lerp(zoom, mv.zoom, b);
      fx = lerp(fx, mv.x, b);
      fy = lerp(fy, mv.y, b);
    }
    const cam = cameraAt(t, { moves: presets, shakes });
    zoom = Math.max(1, zoom * depthScale(0, cam));
    fx += cam.x;
    fy += cam.y;
    const sx = cam.sx * u;
    const sy = cam.sy * u;
    const roll = cam.roll;
    const over = 1 + (Math.abs(sx) + Math.abs(sy)) / Math.min(area.w, area.h) + Math.abs(roll) * 1.2;
    const draw = (z, a = 1) => {
      const sw = area.w / z;
      const sh = area.h / z;
      const x0 = clamp(area.x + area.w * fx - sw / 2, area.x, area.x + area.w - sw);
      const y0 = clamp(area.y + area.h * fy - sh / 2, area.y, area.y + area.h - sh);
      layer(() => {
        fade(a);
        ctx.beginPath();
        ctx.rect(area.x, area.y, area.w, area.h);
        ctx.clip();
        ctx.translate(area.x + area.w / 2 + sx, area.y + area.h / 2 + sy);
        ctx.rotate(roll);
        ctx.scale(over, over);
        ctx.drawImage(m.video, x0, y0, sw, sh, -area.w / 2, -area.h / 2, area.w, area.h);
      });
    };
    draw(zoom);
    const since = t - start;
    if (shot && since < 0.14) {
      const k = 1 - since / 0.14;
      for (let i = 1;i <= 3; i++)
        draw(zoom * (1 + 0.035 * i * k), 0.22 * k);
    }
    const sw = area.w / zoom;
    const sh = area.h / zoom;
    const x0 = clamp(area.x + area.w * fx - sw / 2, area.x, area.x + area.w - sw);
    const y0 = clamp(area.y + area.h * fy - sh / 2, area.y, area.y + area.h - sh);
    return {
      zoom,
      project: (x, y) => {
        const lx = ((area.x + x * area.w - x0) / sw - 0.5) * area.w * over;
        const ly = ((area.y + y * area.h - y0) / sh - 0.5) * area.h * over;
        const [c, s] = [Math.cos(roll), Math.sin(roll)];
        return {
          x: area.x + area.w / 2 + sx + lx * c - ly * s,
          y: area.y + area.h / 2 + sy + lx * s + ly * c
        };
      }
    };
  }
  function pip({
    src,
    x,
    y,
    w,
    h,
    r = 28,
    at = 0,
    out = 1 / 0
  }) {
    const a = presence(t, at, out, 0.5, 0.4);
    if (!a || !m.video)
      return;
    let sw = src.w * W;
    let sh = src.h * H;
    if (sw / sh > w / h)
      sw = sh * w / h;
    else
      sh = sw * h / w;
    const sx = src.x * W + (src.w * W - sw) / 2;
    const sy = src.y * H + (src.h * H - sh) / 2;
    layer(() => {
      const s = lerp(0.9, 1, a);
      fade(a);
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(s, s);
      ctx.translate(-w / 2, -h / 2);
      drop(18, 50, "rgba(0,0,0,0.5)");
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, r * u);
      ctx.fill();
      ctx.shadowColor = "transparent";
      layer(() => {
        ctx.clip();
        ctx.drawImage(m.video, sx, sy, sw, sh, 0, 0, w, h);
      });
      const edge = ctx.createLinearGradient(0, 0, w, h);
      edge.addColorStop(0, alpha(T.accent, 0.9));
      edge.addColorStop(1, alpha(T.accent2, 0.4));
      ctx.strokeStyle = edge;
      ctx.lineWidth = 3 * u;
      ctx.stroke();
    });
  }
  function layout(line, size, color = T.ink, gap = 0) {
    const runs = typeof line === "string" ? [{ text: line }] : line;
    const pieces = [];
    let x = 0;
    for (const r of runs) {
      const f = font(r.size ?? size, r.weight ?? 800, r.family ?? T.display, r.italic);
      ctx.font = f;
      const space = ctx.measureText(" ").width + gap;
      for (const word of r.text.split(/(\s+)/)) {
        if (!word)
          continue;
        if (/^\s+$/.test(word)) {
          x += space;
          continue;
        }
        const w = ctx.measureText(word).width;
        pieces.push({ text: word, font: f, color: r.color ?? color, x, w });
        x += w;
      }
    }
    return { pieces, width: x };
  }
  function title({
    lines,
    at,
    out = 1 / 0,
    x = W / 2,
    y = H / 2,
    size = 110,
    leading = 1.08,
    align = "center",
    stagger = 0.06,
    style = "rise",
    glow = false,
    gradient = false,
    maxWidth = W * 0.88
  }) {
    if (t < at)
      return;
    const laid = lines.map((l) => layout(l, size));
    const total = laid.reduce((a, l) => a + l.pieces.length, 0);
    if (t > out + (total - 1) * stagger * 0.5 + 0.45)
      return;
    const widest = Math.max(...laid.map((l) => l.width));
    const fit = Math.min(1, maxWidth / widest);
    const lineH = size * u * leading * fit;
    const top = y - lineH * (laid.length - 1) / 2;
    let n = 0;
    layer(() => {
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      laid.forEach((l, li) => {
        const left = align === "center" ? x - l.width * fit / 2 : x;
        for (const p of l.pieces) {
          const i = n++;
          const pin = expo((t - at - i * stagger) / 0.55);
          const pout = t > out ? easeIn((t - out - (total - 1 - i) * stagger * 0.5) / 0.4) : 0;
          if (pin <= 0 || pout >= 1)
            continue;
          const vis = pin * (1 - pout);
          layer(() => {
            const cx = left + (p.x + p.w / 2) * fit;
            const cy = top + li * lineH;
            ctx.translate(cx, cy + (1 - pin) * size * u * 0.45 - pout * size * u * 0.35);
            const s = style === "slam" ? lerp(1.6, 1, spring(t, { start: at + i * stagger, stiffness: 260, damping: 20 })) : 1;
            ctx.scale(fit * s, fit * s);
            fade(clamp(vis));
            const blur = (style === "blur" ? 22 : 12) * u * (1 - pin + pout);
            ctx.font = p.font;
            const soft = clamp(blur / (6 * u));
            if (soft > 0) {
              soften(() => ctx.fillText(p.text, -p.w / 2, 0), p.color, blur, soft);
              fade(clamp(vis) * (1 - soft));
            }
            if (glow) {
              ctx.shadowColor = alpha(T.accent, 0.8);
              ctx.shadowBlur = 40 * u;
            } else {
              drop(8, 24, "rgba(0,0,0,0.45)");
            }
            if (gradient && p.color === T.ink) {
              const g = ctx.createLinearGradient(-p.w / 2, -size * u * 0.5, p.w / 2, size * u * 0.5);
              g.addColorStop(0, T.ink);
              g.addColorStop(1, T.accent);
              ctx.fillStyle = g;
            } else
              ctx.fillStyle = p.color;
            ctx.fillText(p.text, -p.w / 2, 0);
          });
        }
      });
    });
  }
  function kicker({
    text,
    at,
    out = 1 / 0,
    x = W / 2,
    y,
    size = 30,
    color = T.accent,
    align = "center"
  }) {
    const a = presence(t, at, out, 0.5, 0.3);
    if (!a)
      return;
    layer(() => {
      ctx.font = font(size, 600, T.mono);
      const track = size * u * 0.28;
      const chars = text.toUpperCase().split("");
      const width = chars.reduce((s, c) => s + ctx.measureText(c).width + track, -track);
      let cx = align === "center" ? x - width / 2 : x;
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      const shown = Math.ceil(chars.length * clamp((t - at) / 0.35));
      chars.slice(0, shown).forEach((c) => {
        fade(a);
        ctx.fillText(c, cx, y);
        cx += ctx.measureText(c).width + track;
      });
    });
  }
  function counter({
    at,
    dur = 1.4,
    from = 0,
    to,
    x = W / 2,
    y = H / 2,
    size = 180,
    prefix = "",
    suffix = "",
    decimals = 0,
    group = true,
    out = 1 / 0,
    color = T.ink
  }) {
    const a = presence(t, at, out, 0.3, 0.3);
    if (!a)
      return;
    const v = lerp(from, to, expo((t - at) / dur));
    const text = prefix + v.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: group
    }) + suffix;
    layer(() => {
      fade(a);
      ctx.font = font(size, 800, T.display);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const pop = spring(t, { from: 0.85, to: 1, start: at, stiffness: 180, damping: 14 });
      ctx.translate(x, y);
      ctx.scale(pop, pop);
      ctx.shadowColor = alpha(T.accent, 0.55);
      ctx.shadowBlur = 50 * u;
      const g = ctx.createLinearGradient(0, -size * u * 0.5, 0, size * u * 0.5);
      g.addColorStop(0, color);
      g.addColorStop(1, alpha(T.accent, 1));
      ctx.fillStyle = g;
      ctx.fillText(text, 0, 0);
    });
  }
  function typewriter({
    text,
    at,
    cps = 28,
    x,
    y,
    size = 40,
    color = T.ink,
    out = 1 / 0,
    family = T.mono
  }) {
    const a = presence(t, at, out, 0.15, 0.3);
    if (!a)
      return;
    const n = Math.floor(clamp((t - at) * cps, 0, text.length));
    layer(() => {
      fade(a);
      ctx.font = font(size, 500, family);
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      const shown = text.slice(0, n);
      ctx.fillText(shown, x, y);
      if (Math.floor(t * 2.2) % 2 === 0 || n < text.length) {
        ctx.fillStyle = T.accent;
        ctx.fillRect(x + ctx.measureText(shown).width + 4 * u, y - size * u * 0.5, size * u * 0.5, size * u);
      }
    });
  }
  function captions({ y = H * 0.7, size = 78, upper = true, maxWidth = W * 0.86 } = {}) {
    const cues = m.cues ?? [];
    const i = cues.findIndex((c) => t >= c.start && t < Math.max(c.end, c.start + 0.08));
    if (i < 0)
      return;
    const cue = cues[i];
    const plain = (c) => c.text.replace(/\*/g, "");
    const lit = (c) => c.text.split(/\s+/).findIndex((w) => /^\*.+\*$/.test(w));
    let g = i;
    while (g > 0 && plain(cues[g - 1]) === plain(cue))
      g--;
    const groupStart = cues[g].start;
    const text = upper ? plain(cue).toUpperCase() : plain(cue);
    const l = layout(text, size, T.ink, size * u * 0.3);
    const fit = Math.min(1, maxWidth / l.width);
    const now = lit(cue);
    const prev = i > g ? lit(cues[i - 1]) : now;
    const slide = expo((t - cue.start) / 0.14);
    const box = (k) => {
      const p = l.pieces[k] ?? l.pieces[0];
      return p ? { x: p.x, w: p.w } : { x: 0, w: 0 };
    };
    const a = box(prev);
    const b = box(now);
    const pill = { x: lerp(a.x, b.x, slide), w: lerp(a.w, b.w, slide) };
    const enter = expo((t - groupStart) / 0.22);
    layer(() => {
      ctx.translate(W / 2, y + (1 - enter) * 26 * u);
      const s = fit * lerp(0.9, 1, enter);
      ctx.scale(s, s);
      ctx.translate(-l.width / 2, 0);
      fade(enter);
      const padX = size * u * 0.22;
      const padY = size * u * 0.62;
      ctx.fillStyle = T.accent;
      ctx.shadowColor = alpha(T.accent, 0.6);
      ctx.shadowBlur = 30 * u;
      ctx.beginPath();
      ctx.roundRect(pill.x - padX, -padY, pill.w + padX * 2, padY * 2, 18 * u);
      ctx.fill();
      drop(6, 18, "rgba(0,0,0,0.55)");
      ctx.textBaseline = "middle";
      l.pieces.forEach((p, k) => {
        ctx.font = p.font;
        const on = k === now;
        if (on)
          ctx.shadowColor = "transparent";
        else
          ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.fillStyle = on ? T.onAccent : T.ink;
        ctx.fillText(p.text, p.x, 2 * u);
      });
    });
  }
  function stroke(path, length, p, { color = T.accent, width = 8, glow = true } = {}) {
    if (p <= 0)
      return;
    layer(() => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width * u;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (glow) {
        ctx.shadowColor = alpha(color, 0.7);
        ctx.shadowBlur = 24 * u;
      }
      ctx.setLineDash([length, length + 1]);
      ctx.lineDashOffset = length * (1 - clamp(p));
      ctx.beginPath();
      path(ctx);
      ctx.stroke();
    });
  }
  function ring({
    x,
    y,
    rx,
    ry = rx,
    at,
    out = 1 / 0,
    dur = 0.55,
    color = T.accent,
    width = 7
  }) {
    const a = presence(t, at, out, 0.01, 0.3);
    if (!a)
      return;
    const turns = 1.12;
    const len = Math.PI * (rx + ry) * turns;
    layer(() => {
      fade(a);
      stroke((c) => {
        const steps = 64;
        for (let i = 0;i <= steps; i++) {
          const th = -2.2 + i / steps * Math.PI * 2 * turns;
          const wob = 1 + 0.04 * Math.sin(i * 0.7);
          const px = x + Math.cos(th) * rx * wob;
          const py = y + Math.sin(th) * ry * wob * (1 + 0.05 * (i / steps));
          i ? c.lineTo(px, py) : c.moveTo(px, py);
        }
      }, len, expo((t - at) / dur), { color, width });
    });
  }
  function arrow({
    x1,
    y1,
    x2,
    y2,
    bend = 0.25,
    at,
    out = 1 / 0,
    dur = 0.5,
    color = T.accent,
    width = 8
  }) {
    const a = presence(t, at, out, 0.01, 0.3);
    if (!a)
      return;
    const mx = (x1 + x2) / 2 - (y2 - y1) * bend;
    const my = (y1 + y2) / 2 + (x2 - x1) * bend;
    let len = 0;
    let px = x1;
    let py = y1;
    for (let i = 1;i <= 24; i++) {
      const s = i / 24;
      const qx = (1 - s) ** 2 * x1 + 2 * (1 - s) * s * mx + s * s * x2;
      const qy = (1 - s) ** 2 * y1 + 2 * (1 - s) * s * my + s * s * y2;
      len += Math.hypot(qx - px, qy - py);
      px = qx;
      py = qy;
    }
    const p = expo((t - at) / dur);
    layer(() => {
      fade(a);
      stroke((c) => {
        c.moveTo(x1, y1);
        c.quadraticCurveTo(mx, my, x2, y2);
      }, len, p, { color, width });
      const head = clamp((p - 0.75) / 0.25);
      if (head > 0) {
        const ang = Math.atan2(y2 - my, x2 - mx);
        const hl = 34 * u * head;
        stroke((c) => {
          c.moveTo(x2 - Math.cos(ang - 0.5) * hl, y2 - Math.sin(ang - 0.5) * hl);
          c.lineTo(x2, y2);
          c.lineTo(x2 - Math.cos(ang + 0.5) * hl, y2 - Math.sin(ang + 0.5) * hl);
        }, hl * 2.2, 1, { color, width });
      }
    });
  }
  function highlight({
    x,
    y,
    w,
    h,
    at,
    out = 1 / 0,
    color = T.accent,
    dur = 0.35
  }) {
    const a = presence(t, at, out, 0.01, 0.3);
    if (!a)
      return;
    layer(() => {
      fade(a * 0.85);
      ctx.globalCompositeOperation = T.dark ? "screen" : "multiply";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, w * expo((t - at) / dur), h, 8 * u);
      ctx.fill();
    });
  }
  function reticle({
    x,
    y,
    r = 120,
    at,
    out = 1 / 0,
    color = T.ink
  }) {
    const a = presence(t, at, out, 0.35, 0.3);
    if (!a)
      return;
    const R = r * u * lerp(1.8, 1, expo((t - at) / 0.5));
    layer(() => {
      fade(a);
      ctx.strokeStyle = color;
      ctx.lineWidth = 4 * u;
      ctx.shadowColor = alpha(T.accent, 0.8);
      ctx.shadowBlur = 16 * u;
      ctx.translate(x, y);
      layer(() => {
        ctx.rotate(t * 0.8);
        ctx.setLineDash([18 * u, 14 * u]);
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.stroke();
      });
      const b = R * 1.25;
      const k = R * 0.35;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1]
      ]) {
        ctx.beginPath();
        ctx.moveTo(sx * b, sy * (b - k));
        ctx.lineTo(sx * b, sy * b);
        ctx.lineTo(sx * (b - k), sy * b);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 5 * u, 0, Math.PI * 2);
      ctx.fillStyle = T.accent;
      ctx.fill();
    });
  }
  function spotlight({
    x,
    y,
    r = 260,
    at,
    out = 1 / 0,
    dim = 0.65
  }) {
    const a = presence(t, at, out, 0.4, 0.4);
    if (!a)
      return;
    layer(() => {
      const R = r * u;
      const g = ctx.createRadialGradient(x, y, R * 0.8, x, y, R * 1.6);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${dim * a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
  }
  function glass({
    x,
    y,
    w,
    h,
    r = 36,
    at,
    out = 1 / 0,
    frost = true,
    inner
  }) {
    const a = presence(t, at, out, 0.55, 0.35);
    if (!a)
      return;
    const rise = (1 - a) * 40 * u;
    const s = lerp(0.96, 1, a);
    layer(() => {
      fade(a);
      ctx.translate(x + w / 2, y + h / 2 + rise);
      ctx.scale(s, s);
      ctx.translate(-w / 2, -h / 2);
      const R = r * u;
      layer(() => {
        drop(24, 60, "rgba(0,0,0,0.45)");
        ctx.fillStyle = alpha(T.bg[1], T.dark ? 0.55 : 0.6);
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, R);
        ctx.fill();
      });
      if (frost && m.video) {
        layer(() => {
          ctx.beginPath();
          ctx.roundRect(0, 0, w, h, R);
          ctx.clip();
          ctx.filter = `blur(${Math.round(28 * u)}px) saturate(160%)`;
          fade(0.9);
          ctx.drawImage(m.video, x, y, w, h, 0, 0, w, h);
        });
      }
      layer(() => {
        ctx.fillStyle = T.dark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, R);
        ctx.fill();
        if (T.light !== undefined)
          return rim(0, 0, w, h, R);
        const edge = ctx.createLinearGradient(0, 0, w, h);
        edge.addColorStop(0, "rgba(255,255,255,0.45)");
        edge.addColorStop(0.4, "rgba(255,255,255,0.08)");
        edge.addColorStop(1, "rgba(255,255,255,0.18)");
        ctx.strokeStyle = edge;
        ctx.lineWidth = 2 * u;
        ctx.stroke();
      });
      inner?.({ x: 0, y: 0, w, h }, a);
    });
  }
  function lowerThird({
    name,
    role,
    at,
    out = at + 4.5,
    x = 70 * u,
    y = H * 0.8
  }) {
    if (t < at || t > out + 0.5)
      return;
    const leave = t > out ? easeIn((t - out) / 0.4) : 0;
    const bar = expo((t - at) / 0.35) * (1 - leave);
    const plate = expo((t - at - 0.12) / 0.55) * (1 - leave);
    const nameIn = expo((t - at - 0.22) / 0.5) * (1 - leave);
    const roleIn = expo((t - at - 0.34) / 0.5) * (1 - leave);
    layer(() => {
      ctx.font = font(54, 700);
      const nw = ctx.measureText(name).width;
      ctx.font = font(32, 500);
      const rw = role ? ctx.measureText(role).width : 0;
      const w = Math.max(nw, rw) + 80 * u;
      const h = (role ? 150 : 100) * u;
      ctx.fillStyle = T.accent;
      ctx.shadowColor = alpha(T.accent, 0.8);
      ctx.shadowBlur = 20 * u;
      ctx.fillRect(x, y - h / 2 + h * (1 - bar) / 2, 8 * u, h * bar);
      ctx.shadowColor = "transparent";
      layer(() => {
        ctx.beginPath();
        ctx.rect(x + 8 * u, y - h / 2, w * plate, h);
        ctx.clip();
        ctx.fillStyle = alpha(T.bg[0], 0.72);
        ctx.fillRect(x + 8 * u, y - h / 2, w, h);
        const sheen = ctx.createLinearGradient(x, y - h / 2, x + w, y + h / 2);
        sheen.addColorStop(0, "rgba(255,255,255,0.12)");
        sheen.addColorStop(1, "rgba(255,255,255,0.02)");
        ctx.fillStyle = sheen;
        ctx.fillRect(x + 8 * u, y - h / 2, w, h);
        ctx.textBaseline = "middle";
        fade(nameIn);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = font(54, 700);
        ctx.fillText(name, x + 40 * u, y - (role ? 22 : 0) * u + (1 - nameIn) * 30 * u);
        if (role) {
          fade(roleIn);
          ctx.fillStyle = T.accent;
          ctx.font = font(32, 500);
          ctx.fillText(role, x + 40 * u, y + 34 * u + (1 - roleIn) * 20 * u);
        }
      });
    });
  }
  function wipe(at, dur = 0.7, dir = 1) {
    const p = (t - (at - dur / 2)) / dur;
    if (p < 0 || p > 1)
      return false;
    const span = W + H;
    layer(() => {
      ctx.translate(W / 2, H / 2);
      ctx.rotate(-0.35 * dir);
      [T.accent, T.bg[0]].forEach((c, i) => {
        const lead = expo(clamp(p * 2 - i * 0.18));
        const tail = easeIn(clamp(p * 2 - 1 - i * 0.05));
        const x0 = lerp(-span, span, tail * 0.5) * dir;
        const x1 = lerp(-span, span, 0.5 + lead * 0.5) * dir;
        ctx.fillStyle = c;
        ctx.fillRect(Math.min(x0, x1) - span * 0.5 * (1 - lead), -span, Math.abs(x1 - x0) + span * 0.5 * (1 - lead), span * 2);
      });
    });
    return p > 0.45 && p < 0.55;
  }
  function chapter({
    num,
    label = "Chapter",
    title: text,
    at,
    out
  }) {
    if (t < at || t > out + 0.5)
      return;
    const leave = t > out ? easeIn((t - out) / 0.5) : 0;
    layer(() => {
      fade(1 - leave);
      const z = 1 + leave * 1.8;
      ctx.translate(W / 2, H / 2);
      ctx.scale(z, z);
      ctx.translate(-W / 2, -H / 2);
      backdrop({ grid: true });
      bokeh({ count: 18, opacity: 0.35 });
      const big = Math.min(W, H) * 0.5;
      const cy = H * 0.4;
      layer(() => {
        const s = 1 + 0.06 * clamp((t - at) / (out - at));
        ctx.translate(W / 2, cy);
        ctx.scale(s, s);
        ctx.font = `400 ${Math.round(big)}px "Archivo Black", "Noto Color Emoji"`;
        ctx.lineJoin = "round";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const g = ctx.createLinearGradient(-big / 2, -big / 2, big / 2, big / 2);
        g.addColorStop(0, alpha(T.accent, 0.95));
        g.addColorStop(1, alpha(T.accent2, 0.15));
        ctx.strokeStyle = g;
        ctx.lineWidth = 4 * u;
        fade(expo((t - at) / 0.8));
        ctx.strokeText(num, 0, 0);
      });
      const below = cy + big * 0.45 + 60 * u;
      kicker({ text: `${label} ${num}`, at: at + 0.15, y: below });
      title({
        lines: text,
        at: at + 0.25,
        x: W / 2,
        y: below + 110 * u,
        size: 96,
        style: "blur",
        gradient: true
      });
      vignette(0.5);
    });
  }
  function wrap(text, size, maxWidth, weight = 500, family = T.serif, italic = true) {
    ctx.save();
    ctx.font = font(size, weight, family, italic);
    const lines = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else
        line = next;
    }
    if (line)
      lines.push(line);
    ctx.restore();
    return lines;
  }
  function quote({
    text,
    by,
    at,
    out,
    size = 84
  }) {
    const a = presence(t, at, out + 0.5, 0.5, 0.5);
    if (!a)
      return;
    const lines = wrap(text, size, W * 0.72);
    const lineH = size * u * 1.25;
    const top = H / 2 - lineH * (lines.length - 1) / 2;
    layer(() => {
      backdrop({ opacity: 0.94 * a });
      fade(a);
      ctx.font = `900 ${Math.round(size * 4 * u)}px ${T.serif}`;
      ctx.fillStyle = alpha(T.accent, 0.9);
      ctx.textBaseline = "alphabetic";
      ctx.shadowColor = alpha(T.accent, 0.6);
      ctx.shadowBlur = 50 * u;
      ctx.fillText("“", W * 0.14 - 20 * u, top + size * u * 1.3 - (1 - a) * 40 * u);
    });
    title({
      lines: lines.map((l) => [{ text: l, italic: true, weight: 500, family: T.serif }]),
      at: at + 0.15,
      out,
      x: W * 0.14,
      y: top + (lines.length - 1) * lineH / 2,
      align: "left",
      size,
      leading: 1.25,
      stagger: 0.035,
      style: "blur"
    });
    if (by)
      kicker({
        text: `— ${by}`,
        at: at + 0.6,
        out,
        x: W * 0.14,
        y: top + lines.length * lineH + 20 * u,
        align: "left"
      });
    vignette(0.4 * a);
  }
  function checklist({
    items,
    x = W / 2,
    y = H * 0.14,
    at = 0,
    out = 1 / 0,
    size = 40
  }) {
    if (t < at || t > out + 0.5)
      return;
    const leave = t > out ? easeIn((t - out) / 0.4) : 0;
    layer(() => {
      ctx.font = font(size, 700);
      const pad = size * u * 0.6;
      const gap = 16 * u;
      const ws = items.map((it) => ctx.measureText(it.label).width + pad * 2 + size * u * 1.1);
      const total = ws.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
      const fit = Math.min(1, W * 0.92 / total);
      ctx.translate(x, y);
      ctx.scale(fit, fit);
      let cx = -total / 2;
      const h = size * u * 1.9;
      items.forEach((it, i) => {
        const w = ws[i];
        const pin = spring(t, { from: 0, to: 1, start: at + i * 0.12, stiffness: 240, damping: 16 }) * (1 - leave);
        const done = it.done !== undefined && t >= it.done;
        const dp = done ? expo((t - it.done) / 0.35) : 0;
        const pulse = done ? Math.max(0, 1 - (t - it.done) / 0.6) : 0;
        layer(() => {
          ctx.translate(cx + w / 2, 0);
          ctx.scale(pin * (1 + 0.12 * pulse), pin * (1 + 0.12 * pulse));
          fade(clamp(pin));
          ctx.shadowColor = done ? alpha(T.accent, 0.9) : "rgba(0,0,0,0.4)";
          ctx.shadowBlur = (done ? 40 + 40 * pulse : 20) * u;
          ctx.fillStyle = done ? T.accent : "rgba(20,20,24,0.72)";
          ctx.beginPath();
          ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
          ctx.fill();
          ctx.shadowColor = "transparent";
          ctx.strokeStyle = done ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.18)";
          ctx.lineWidth = 2 * u;
          ctx.stroke();
          const bx = -w / 2 + pad;
          const bs = size * u * 0.8;
          ctx.strokeStyle = done ? T.onAccent : "rgba(255,255,255,0.7)";
          ctx.lineWidth = 3.5 * u;
          ctx.beginPath();
          ctx.roundRect(bx, -bs / 2, bs, bs, 6 * u);
          ctx.stroke();
          if (dp > 0) {
            const len = bs * 1.4;
            ctx.setLineDash([len, len]);
            ctx.lineDashOffset = len * (1 - dp);
            ctx.lineCap = "round";
            ctx.lineWidth = 5 * u;
            ctx.beginPath();
            ctx.moveTo(bx + bs * 0.2, 0);
            ctx.lineTo(bx + bs * 0.42, bs * 0.25);
            ctx.lineTo(bx + bs * 0.85, -bs * 0.3);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.fillStyle = done ? T.onAccent : T.ink;
          ctx.textBaseline = "middle";
          ctx.font = font(size, 700);
          ctx.fillText(it.label, bx + bs + pad * 0.6, 2 * u);
        });
        cx += w + gap;
      });
    });
  }
  function progress({ y = H * 0.035, inset = 60 * u, height = 8 * u } = {}) {
    const p = clamp(t / m.duration);
    layer(() => {
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath();
      ctx.roundRect(inset, y, W - inset * 2, height, height / 2);
      ctx.fill();
      const g = ctx.createLinearGradient(inset, 0, W - inset, 0);
      g.addColorStop(0, T.accent2);
      g.addColorStop(1, T.accent);
      ctx.fillStyle = g;
      ctx.shadowColor = alpha(T.accent, 0.9);
      ctx.shadowBlur = 18 * u;
      ctx.beginPath();
      ctx.roundRect(inset, y, (W - inset * 2) * p, height, height / 2);
      ctx.fill();
    });
  }
  function photo({
    path,
    x,
    y,
    w,
    h,
    at,
    out = 1 / 0,
    tilt = -0.05,
    r = 28
  }) {
    const a = presence(t, at, out, 0.6, 0.35);
    if (!a)
      return;
    const img = picture(path);
    layer(() => {
      const float = Math.sin(t * 1.1) * 8 * u;
      ctx.translate(x + w / 2, y + h / 2 + float + (1 - a) * 80 * u);
      ctx.rotate(tilt * (0.4 + 0.6 * (1 - a)) + Math.sin(t * 0.7) * 0.008);
      ctx.transform(1, 0, -0.08 * (1 - a), 1, 0, 0);
      const s = lerp(0.85, 1, a);
      ctx.scale(s, s);
      fade(a);
      drop(30, 70, "rgba(0,0,0,0.5)");
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, r * u);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.save();
      ctx.clip();
      const k = Math.max(w / img.width, h / img.height);
      const iw = img.width * k;
      const ih = img.height * k;
      ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2 * u;
      ctx.stroke();
    });
  }
  function bars({
    data,
    x,
    y,
    w,
    h,
    at,
    out = 1 / 0
  }) {
    const a = presence(t, at, out, 0.3, 0.3);
    if (!a)
      return;
    const max = Math.max(...data.map((d) => d.value));
    const gap = w * 0.06;
    const bw = (w - gap * (data.length - 1)) / data.length;
    layer(() => {
      fade(a);
      ctx.strokeStyle = alpha(T.dark ? "#FFFFFF" : "#000000", 0.25);
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w * expo((t - at) / 0.5), y + h);
      ctx.stroke();
      data.forEach((d, i) => {
        const p = expo((t - at - 0.2 - i * 0.12) / 0.8);
        const bh = (h - 70 * u) * (d.value / max) * p;
        const bx = x + i * (bw + gap);
        const g = ctx.createLinearGradient(0, y + h - bh, 0, y + h);
        g.addColorStop(0, i === data.length - 1 ? T.accent : alpha(T.ink, 0.85));
        g.addColorStop(1, i === data.length - 1 ? alpha(T.accent2, 0.6) : alpha(T.ink, 0.25));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(bx, y + h - bh, bw, bh, [12 * u, 12 * u, 0, 0]);
        ctx.fill();
        ctx.fillStyle = T.ink;
        ctx.textAlign = "center";
        ctx.font = font(34, 700);
        fade(a * clamp(p * 2 - 0.5));
        ctx.fillText(Math.round(d.value * p).toLocaleString("en-US"), bx + bw / 2, y + h - bh - 26 * u);
        ctx.fillStyle = T.mute;
        ctx.font = font(26, 500);
        ctx.fillText(d.label, bx + bw / 2, y + h + 40 * u);
        fade(a);
      });
    });
  }
  return {
    W,
    H,
    u,
    ctx,
    m,
    theme: T,
    font,
    fit,
    layer,
    fade,
    backdrop,
    grain,
    vignette,
    bokeh,
    leak,
    scrim,
    flash,
    camera,
    view,
    paper: () => picture(PAPER),
    tornFrame,
    tape,
    sticker,
    glitch,
    zoomBlur,
    scribble,
    kinetic,
    drop,
    rim,
    sweep,
    pip,
    layout,
    title,
    kicker,
    counter,
    typewriter,
    captions,
    stroke,
    ring,
    arrow,
    highlight,
    reticle,
    spotlight,
    glass,
    lowerThird,
    wrap,
    quote,
    wipe,
    chapter,
    checklist,
    progress,
    photo,
    bars
  };
}
