// The motion-graphics kit: a design system for mockingbird's `motion` tool.
// An HTML page imports kit.js (built from this file: `bun run kit`) by
// absolute path, hands its draw function to `page()`, makes one
// `kit(ctx, t, m, THEMES.x)` per frame and draws with it on the page's
// canvas. Every piece is a pure function of time.
//
// What it's built from is in docs/STYLE-STUDY.md: depth (parallax, blur,
// vignette), light (gradients, glow), texture (grain), a camera that never
// stops, soft staggered reveals, and a sound on every beat.

/** This file's folder, in Bun and in the page alike. */
const DIR = decodeURIComponent(new URL(".", import.meta.url).pathname).replace(/\/$/, "");

/** A sound effect that ships with the kit: whoosh, pop, tick, impact, riser, shimmer, click. */
export const sfx = (name: string) => `${DIR}/assets/sfx/${name}.wav`;

export type Theme = {
  /** Background gradient, top-left to bottom-right. */
  bg: [string, string];
  /** Three light sources that drift behind everything. */
  glows: [string, string, string];
  /** Whether the glows add light (dark themes) or tint (light themes). */
  dark: boolean;
  /** How strong the glows are, 0-1. */
  glow: number;
  ink: string;
  mute: string;
  accent: string;
  accent2: string;
  /** Text on an accent fill. */
  onAccent: string;
  display: string;
  serif: string;
  mono: string;
};

// Installed on every Mac; system-ui is SF Pro there.
const FACES = { display: "system-ui", serif: "Charter", mono: "Menlo" };

export const THEMES: Record<string, Theme> = {
  // Linear / Vercel launch film: near black, violet and blue light, glassy.
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
    ...FACES,
  },
  // Shorts: black and yellow, loud, Hormozi / Varun Mayya.
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
    ...FACES,
  },
  // Apple product film: soft grey studio light.
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
    ...FACES,
  },
  // Kurzgesagt: saturated purples and cyan.
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
    ...FACES,
  },
  // Johnny Harris: warm paper, red ink.
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
    ...FACES,
  },
};

// ---------------------------------------------------------------- pure helpers

export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** A fixed pseudo-random number in [0, 1) for any n: no Math.random, so frames repeat exactly. */
export function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** The curve modern motion design runs on: fast out, long settle (cubic-bezier(.16, 1, .3, 1)). */
export function expo(p: number) {
  const x = clamp(p);
  return x === 1 ? 1 : 1 - 2 ** (-10 * x);
}
/**
 * For exits: a slow start that keeps accelerating (cubic). Not the mirror of
 * `expo`, whose ease-in barely moves for the first two thirds and reads as
 * a pop; an exit has to be seen leaving.
 */
export const easeIn = (p: number) => clamp(p) ** 3;

/** 0 → 1 over [a, a + fadeIn], held, 1 → 0 over [b − fadeOut, b]. How present an element is. */
export function presence(t: number, a: number, b = Infinity, fadeIn = 0.45, fadeOut = 0.35) {
  if (t < a || t > b) return 0;
  return Math.min(expo((t - a) / fadeIn), 1 - easeIn(1 - (b - t) / fadeOut));
}

/** "#RRGGBB" with an alpha, as rgba(). */
export function alpha(hex: string, a: number) {
  if (!hex.startsWith("#")) return hex;
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Turn SRT-style cues with the spoken word *marked* into words with their own times. */
export function words(cues: { start: number; end: number; text: string }[]) {
  const out: { text: string; start: number; end: number }[] = [];
  for (const c of cues) {
    const lit = /\*([^*]+)\*/.exec(c.text);
    if (lit?.[1]) out.push({ text: lit[1], start: c.start, end: c.end });
  }
  return out;
}

/** Where to cut a single take so the shot changes every `every` seconds or so: on word starts, never mid-word. */
export function cutPoints(cues: { start: number; end: number; text: string }[], every = 2.2) {
  const cuts: number[] = [];
  let last = 0;
  for (const w of words(cues)) {
    if (w.start - last >= every) {
      cuts.push(w.start);
      last = w.start;
    }
  }
  return cuts;
}

type Run = {
  text: string;
  weight?: number;
  italic?: boolean;
  family?: string;
  color?: string;
  size?: number;
};
type Line = string | Run[];

/**
 * A spring released at `start` seconds, moving from `from` to `to`: a mass
 * on a spring with no starting speed. The defaults (stiffness 100, damping
 * 10, mass 1) overshoot a little and settle in about a second.
 */
export function spring(
  t: number,
  { from = 0, to = 1, start = 0, stiffness = 100, damping = 10, mass = 1 } = {},
): number {
  const s = t - start;
  if (s <= 0) return from;
  const w = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  let done: number;
  if (zeta < 1) {
    const wd = w * Math.sqrt(1 - zeta ** 2);
    done = 1 - Math.exp(-zeta * w * s) * (Math.cos(wd * s) + ((zeta * w) / wd) * Math.sin(wd * s));
  } else if (zeta === 1) {
    done = 1 - Math.exp(-w * s) * (1 + w * s);
  } else {
    const root = w * Math.sqrt(zeta ** 2 - 1);
    const [r1, r2] = [-zeta * w + root, -zeta * w - root];
    done = 1 - (r2 * Math.exp(r1 * s) - r1 * Math.exp(r2 * s)) / (r2 - r1);
  }
  return from + (to - from) * done;
}

// ---------------------------------------------------------------- the page

const GRAIN = `${DIR}/assets/grain.png`;
const pictures = new Map<string, any>();

/**
 * A picture file, as an <img> to draw. Call it as the page loads (at the
 * top of its script), so the page waits for it before the first frame; a
 * picture asked for first while drawing hasn't loaded, and is an error.
 */
export function picture(path: string) {
  let img = pictures.get(path);
  if (!img && document.readyState === "complete") {
    throw new Error(`${path} wasn't loaded with the page: call picture() for it as the page loads`);
  }
  if (!img) {
    img = new Image();
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

/**
 * Sets the page up for a kit draw function, as the canvas engine ran one: a
 * canvas the size of the video, the video's frames (`mockingbird.drawVideo`)
 * drawn first on each frame from a fresh canvas state, then `draw(ctx, t, m)`.
 * `audio(m)` gives the sounds, as `mockingbird.audio` takes them.
 */
export function page(
  draw: (ctx: any, t: number, m: any) => void,
  { audio }: { audio?: (m: any) => unknown[] } = {},
) {
  const m = (globalThis as any).mockingbird;
  const canvas = document.createElement("canvas");
  canvas.width = m.width;
  canvas.height = m.height;
  canvas.style.cssText = "position:absolute;left:0;top:0";
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  m.drawVideo = true;
  if (audio) m.audio = audio(m);
  picture(GRAIN);
  m.draw = (t: number) => {
    ctx.reset();
    if (m.video) ctx.drawImage(m.video, 0, 0, m.width, m.height);
    return draw(ctx, t, m);
  };
}

// ---------------------------------------------------------------- the kit

export function kit(ctx: any, t: number, m: any, theme: Theme = THEMES.night as Theme) {
  const W: number = m.width;
  const H: number = m.height;
  /** One unit: a pixel at 1080 on the short side. Every size is in units, so 1080x1920 and 1920x1080 both work. */
  const u = Math.min(W, H) / 1080;
  const T = theme;

  const font = (size: number, weight = 700, family = T.display, italic = false) =>
    `${italic ? "italic " : ""}${weight} ${Math.round(size * u)}px ${family}`;

  /** The alpha each open layer started with, so a fade inside one is a fraction of its parent's. */
  const alphas: number[] = [];
  /** Wrap a drawing so its state doesn't leak. */
  const layer = (draw: () => void) => {
    ctx.save();
    alphas.push(ctx.globalAlpha);
    try {
      draw();
    } finally {
      alphas.pop();
      ctx.restore();
    }
  };
  /** Set the alpha to `x` of what the enclosing layer started with: a card fading out takes its contents with it. */
  const fade = (x: number) => {
    ctx.globalAlpha = (alphas.at(-1) ?? 1) * x;
  };

  /**
   * Draw a shape blurred: drawn far off the canvas, only its shadow lands
   * here. Core Graphics blurs a shadow over the shape's own bounds, so this
   * costs a fraction of ctx.filter's blur, which works on the whole frame.
   */
  const soften = (draw: () => void, color: string, blur: number, a = 1) =>
    layer(() => {
      const far = (W + H) * 4;
      // A shadow's offset and blur ignore the transform, so move the shape in
      // canvas pixels too, and scale the blur with whatever scale is current.
      const m0 = ctx.getTransform();
      fade(a);
      ctx.shadowColor = color.startsWith("#") ? color : T.ink;
      ctx.shadowBlur = blur * 2 * Math.hypot(m0.a, m0.b);
      ctx.shadowOffsetX = far;
      ctx.shadowOffsetY = 0;
      ctx.setTransform(m0.a, m0.b, m0.c, m0.d, m0.e - far, m0.f);
      draw();
    });

  // ------------------------------------------------------------ atmosphere

  /** An animated gradient world: a base gradient and three soft lights drifting on slow orbits, plus an optional grid. */
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
        // Only the glow's own square: a full-frame gradient costs twice as much.
        const x0 = Math.max(0, x - r);
        const y0 = Math.max(0, y - r);
        ctx.fillRect(x0, y0, Math.min(W, x + r) - x0, Math.min(H, y + r) - y0);
      });
      if (grid) {
        ctx.globalCompositeOperation = "source-over";
        const step = 90 * u;
        const off = (t * 12 * u * drift) % step;
        ctx.strokeStyle = alpha(T.dark ? "#FFFFFF" : "#000000", 0.06);
        ctx.lineWidth = 1 * u;
        ctx.beginPath();
        for (let x = -off; x < W; x += step) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, H);
        }
        for (let y = -off; y < H; y += step) {
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
        }
        ctx.stroke();
        // Fade the grid out at the edges so it reads as depth, not graph paper.
        const fade = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R * 0.7);
        fade.addColorStop(0, alpha(T.bg[0], 0));
        fade.addColorStop(1, alpha(T.bg[0], 0.9));
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, W, H);
      }
    });
  }

  /** Film grain: a noise tile jittered every frame, blended over everything. */
  function grain(amount = 0.07) {
    const tile = picture(GRAIN);
    // At the tile's own size: scaling it costs ten times as much and softens it.
    const s = tile.width;
    const ox = -hash(m.frame) * s;
    const oy = -hash(m.frame + 0.5) * s;
    layer(() => {
      fade(amount);
      ctx.globalCompositeOperation = "overlay";
      for (let y = oy; y < H; y += s)
        for (let x = ox; x < W; x += s) ctx.drawImage(tile, x, y, s, s);
    });
  }

  /** Darker edges pull the eye to the middle. */
  function vignette(strength = 0.55) {
    layer(() => {
      const g = ctx.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.3,
        W / 2,
        H / 2,
        Math.hypot(W, H) * 0.62,
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${strength})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
  }

  /** Out-of-focus specks drifting up at three depths. */
  function bokeh({ count = 26, color = T.accent, opacity = 0.5 } = {}) {
    layer(() => {
      for (let i = 0; i < count; i++) {
        const depth = 0.3 + hash(i) * 0.7;
        const r = (6 + 34 * depth * depth) * u;
        const x = hash(i + 7) * W + Math.sin(t * 0.4 + i) * 20 * u;
        const y =
          ((((hash(i + 3) * H - t * 40 * u * depth) % (H + r * 2)) + H + r * 2) % (H + r * 2)) - r;
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

  /** A warm light leak sweeping across at a transition. */
  function leak(at: number, dur = 0.9, colors = ["#FFB86B", "#FF5E7E"]) {
    const p = (t - at) / dur;
    if (p < 0 || p > 1) return;
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

  /** A soft dark band across the frame behind text, so it reads on any footage. */
  function scrim({
    y,
    h = 600 * u,
    strength = 0.6,
    at = 0,
    out = Infinity,
  }: {
    y: number;
    h?: number;
    strength?: number;
    at?: number;
    out?: number;
  }) {
    const a = presence(t, at, out, 0.2, 0.4);
    if (!a) return;
    layer(() => {
      const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.5, `rgba(0,0,0,${strength * a})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, y - h / 2, W, h);
    });
  }

  /** A two-frame white flash on a hit. */
  function flash(at: number, dur = 0.12, color = "#FFFFFF") {
    const p = (t - at) / dur;
    if (p < 0 || p > 1) return;
    layer(() => {
      fade((1 - p) * 0.8);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, W, H);
    });
  }

  // ------------------------------------------------------------ camera

  type Area = { x: number; y: number; w: number; h: number };
  type Punch = { at: number; zoom?: number; hold?: number };
  type Shake = { at: number; amount?: number };
  /** Glide to a point (0-1 of the area) at a zoom, hold, and glide back: a screen recording's "look here". */
  type Move = { at: number; out: number; x: number; y: number; zoom: number };

  /**
   * Redraw the footage (or one area of it, like a split's half) through a
   * camera that never sits still: each cut is a new framing (jump cuts on a
   * single take read as edits), every shot drifts in slowly, punches spring
   * in on the words that matter, hits shake, and each cut lands with a
   * zoom blur.
   */
  function camera({
    area = { x: 0, y: 0, w: W, h: H } as Area,
    focus = { x: 0.5, y: 0.42 },
    cuts = [] as number[],
    framings = [1.0, 1.16, 1.06, 1.24],
    punches = [] as Punch[],
    shakes = [] as Shake[],
    moves = [] as Move[],
    drift = 0.045,
  } = {}) {
    const still = {
      zoom: 1,
      project: (x: number, y: number) => ({ x: area.x + x * area.w, y: area.y + y * area.h }),
    };
    if (!m.video) return still;
    let shot = 0;
    while (shot < cuts.length && t >= (cuts[shot] as number)) shot++;
    const start = shot ? (cuts[shot - 1] as number) : 0;
    const end = shot < cuts.length ? (cuts[shot] as number) : m.duration;
    let zoom = framings[shot % framings.length] as number;
    zoom *= 1 + drift * clamp((t - start) / Math.max(0.5, end - start));
    for (const p of punches) {
      const hold = p.hold ?? 1.2;
      if (t < p.at || t > p.at + hold + 0.6) continue;
      const into = spring(t, { from: 0, to: 1, start: p.at, stiffness: 220, damping: 18 });
      const out = expo((t - (p.at + hold)) / 0.5);
      zoom *= 1 + ((p.zoom ?? 1.3) - 1) * into * (1 - (t > p.at + hold ? out : 0));
    }
    // Alternate the focus a little between shots, as a second camera angle would.
    let fx = focus.x + (shot % 2 ? 0.04 : -0.02) * (shot ? 1 : 0);
    let fy = focus.y;
    for (const mv of moves) {
      const b = presence(t, mv.at, mv.out, 0.9, 0.8);
      if (!b) continue;
      zoom = lerp(zoom, mv.zoom, b);
      fx = lerp(fx, mv.x, b);
      fy = lerp(fy, mv.y, b);
    }
    let sx = 0;
    let sy = 0;
    for (const s of shakes) {
      const d = t - s.at;
      if (d < 0 || d > 0.5) continue;
      const k = (s.amount ?? 18) * u * (1 - d / 0.5) ** 2;
      sx += Math.sin(d * 90) * k;
      sy += Math.cos(d * 70) * k;
    }
    const draw = (z: number, a = 1) => {
      // The source rectangle is the area shrunk by z around the focus, kept inside the area.
      const sw = area.w / z;
      const sh = area.h / z;
      const x0 = clamp(area.x + area.w * fx - sw / 2, area.x, area.x + area.w - sw);
      const y0 = clamp(area.y + area.h * fy - sh / 2, area.y, area.y + area.h - sh);
      layer(() => {
        fade(a);
        ctx.beginPath();
        ctx.rect(area.x, area.y, area.w, area.h);
        ctx.clip();
        const over = 1 + (Math.abs(sx) + Math.abs(sy)) / Math.min(area.w, area.h);
        ctx.translate(area.x + area.w / 2 + sx, area.y + area.h / 2 + sy);
        ctx.scale(over, over);
        ctx.drawImage(m.video, x0, y0, sw, sh, -area.w / 2, -area.h / 2, area.w, area.h);
      });
    };
    draw(zoom);
    // Zoom blur for the first 0.14 s of a shot: faint, larger copies on top.
    const since = t - start;
    if (shot && since < 0.14) {
      const k = 1 - since / 0.14;
      for (let i = 1; i <= 3; i++) draw(zoom * (1 + 0.035 * i * k), 0.22 * k);
    }
    // Where a point of the footage (0-1 of the area) is on the canvas this frame, to pin marks to it.
    const sw = area.w / zoom;
    const sh = area.h / zoom;
    const x0 = clamp(area.x + area.w * fx - sw / 2, area.x, area.x + area.w - sw);
    const y0 = clamp(area.y + area.h * fy - sh / 2, area.y, area.y + area.h - sh);
    return {
      zoom,
      project: (x: number, y: number) => ({
        x: area.x + ((area.x + x * area.w - x0) / sw) * area.w + sx,
        y: area.y + ((area.y + y * area.h - y0) / sh) * area.h + sy,
      }),
    };
  }

  /**
   * Part of the footage (say the webcam corner, 0-1 of the frame) redrawn as
   * a rounded bubble with a lit edge and a shadow, so it survives the
   * camera zooming past it.
   */
  function pip({
    src,
    x,
    y,
    w,
    h,
    r = 28,
    at = 0,
    out = Infinity,
  }: {
    src: Area;
    x: number;
    y: number;
    w: number;
    h: number;
    r?: number;
    at?: number;
    out?: number;
  }) {
    const a = presence(t, at, out, 0.5, 0.4);
    if (!a || !m.video) return;
    // Crop the source to the bubble's shape, from its middle.
    let sw = src.w * W;
    let sh = src.h * H;
    if (sw / sh > w / h) sw = (sh * w) / h;
    else sh = (sw * h) / w;
    const sx = src.x * W + (src.w * W - sw) / 2;
    const sy = src.y * H + (src.h * H - sh) / 2;
    layer(() => {
      const s = lerp(0.9, 1, a);
      fade(a);
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(s, s);
      ctx.translate(-w / 2, -h / 2);
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 50 * u;
      ctx.shadowOffsetY = 18 * u;
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

  // ------------------------------------------------------------ type

  /** Lay out runs of mixed type on one line; returns pieces with x offsets and the total width. */
  function layout(line: Line, size: number, color = T.ink, gap = 0) {
    const runs: Run[] = typeof line === "string" ? [{ text: line }] : line;
    const pieces: { text: string; font: string; color: string; x: number; w: number }[] = [];
    let x = 0;
    for (const r of runs) {
      const f = font(r.size ?? size, r.weight ?? 800, r.family ?? T.display, r.italic);
      ctx.font = f;
      const space = ctx.measureText(" ").width + gap;
      for (const word of r.text.split(/(\s+)/)) {
        if (!word) continue;
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

  /**
   * A kinetic title: words arrive one after another, each rising out of a
   * blur and settling (or slamming down from oversize), then leave the same
   * way. Lines can mix weights, italics and colours: [{ text: "Linear.",
   * weight: 700 }, { text: " At your command.", weight: 400, color: mute }].
   */
  function title({
    lines,
    at,
    out = Infinity,
    x = W / 2,
    y = H / 2,
    size = 110,
    leading = 1.08,
    align = "center" as "center" | "left",
    stagger = 0.06,
    style = "rise" as "rise" | "slam" | "blur",
    glow = false,
    gradient = false,
    maxWidth = W * 0.88,
  }: {
    lines: Line[];
    at: number;
    out?: number;
    x?: number;
    y?: number;
    size?: number;
    leading?: number;
    align?: "center" | "left";
    stagger?: number;
    style?: "rise" | "slam" | "blur";
    glow?: boolean;
    gradient?: boolean;
    maxWidth?: number;
  }) {
    if (t < at) return;
    const laid = lines.map((l) => layout(l, size));
    const total = laid.reduce((a, l) => a + l.pieces.length, 0);
    // The last word leaves (total - 1) staggers after the first, and takes 0.4 s.
    if (t > out + (total - 1) * stagger * 0.5 + 0.45) return;
    const widest = Math.max(...laid.map((l) => l.width));
    const fit = Math.min(1, maxWidth / widest);
    const lineH = size * u * leading * fit;
    const top = y - (lineH * (laid.length - 1)) / 2;
    let n = 0;
    layer(() => {
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      laid.forEach((l, li) => {
        const left = align === "center" ? x - (l.width * fit) / 2 : x;
        for (const p of l.pieces) {
          const i = n++;
          const pin = expo((t - at - i * stagger) / 0.55);
          const pout = t > out ? easeIn((t - out - (total - 1 - i) * stagger * 0.5) / 0.4) : 0;
          if (pin <= 0 || pout >= 1) continue;
          const vis = pin * (1 - pout);
          layer(() => {
            const cx = left + (p.x + p.w / 2) * fit;
            const cy = top + li * lineH;
            ctx.translate(cx, cy + (1 - pin) * size * u * 0.45 - pout * size * u * 0.35);
            const s =
              style === "slam"
                ? lerp(1.6, 1, spring(t, { start: at + i * stagger, stiffness: 260, damping: 20 }))
                : 1;
            ctx.scale(fit * s, fit * s);
            fade(clamp(vis));
            const blur = (style === "blur" ? 22 : 12) * u * (1 - pin + pout);
            ctx.font = p.font;
            // Out of focus: the word blurred, cross-fading to the sharp word as it lands.
            const soft = clamp(blur / (6 * u));
            if (soft > 0) {
              // soften opens a layer under this one's fade, so it takes `soft` alone.
              soften(() => ctx.fillText(p.text, -p.w / 2, 0), p.color, blur, soft);
              fade(clamp(vis) * (1 - soft));
            }
            if (glow) {
              ctx.shadowColor = alpha(T.accent, 0.8);
              ctx.shadowBlur = 40 * u;
            } else {
              ctx.shadowColor = "rgba(0,0,0,0.45)";
              ctx.shadowBlur = 24 * u;
              ctx.shadowOffsetY = 8 * u;
            }
            if (gradient && p.color === T.ink) {
              const g = ctx.createLinearGradient(
                -p.w / 2,
                -size * u * 0.5,
                p.w / 2,
                size * u * 0.5,
              );
              g.addColorStop(0, T.ink);
              g.addColorStop(1, T.accent);
              ctx.fillStyle = g;
            } else ctx.fillStyle = p.color;
            ctx.fillText(p.text, -p.w / 2, 0);
          });
        }
      });
    });
  }

  /** Small capitals, tracked out, for a kicker above a title ("CHAPTER 02"). */
  function kicker({
    text,
    at,
    out = Infinity,
    x = W / 2,
    y,
    size = 30,
    color = T.accent,
    align = "center" as "center" | "left",
  }: {
    text: string;
    at: number;
    out?: number;
    x?: number;
    y: number;
    size?: number;
    color?: string;
    align?: "center" | "left";
  }) {
    const a = presence(t, at, out, 0.5, 0.3);
    if (!a) return;
    layer(() => {
      ctx.font = font(size, 600, T.mono);
      const track = size * u * 0.28;
      const chars = text.toUpperCase().split("");
      const width = chars.reduce((s, c) => s + ctx.measureText(c).width + track, -track);
      let cx = align === "center" ? x - width / 2 : x;
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      // Letters type on left to right.
      const shown = Math.ceil(chars.length * clamp((t - at) / 0.35));
      chars.slice(0, shown).forEach((c) => {
        fade(a);
        ctx.fillText(c, cx, y);
        cx += ctx.measureText(c).width + track;
      });
    });
  }

  /** A number that counts up with the expo curve; tabular digits so it doesn't wobble. */
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
    out = Infinity,
    color = T.ink,
  }: {
    at: number;
    dur?: number;
    from?: number;
    to: number;
    x?: number;
    y?: number;
    size?: number;
    prefix?: string;
    suffix?: string;
    decimals?: number;
    group?: boolean;
    out?: number;
    color?: string;
  }) {
    const a = presence(t, at, out, 0.3, 0.3);
    if (!a) return;
    const v = lerp(from, to, expo((t - at) / dur));
    const text =
      prefix +
      v.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: group,
      }) +
      suffix;
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

  /** Text typed out, with a blinking cursor. */
  function typewriter({
    text,
    at,
    cps = 28,
    x,
    y,
    size = 40,
    color = T.ink,
    out = Infinity,
    family = T.mono,
  }: {
    text: string;
    at: number;
    cps?: number;
    x: number;
    y: number;
    size?: number;
    color?: string;
    out?: number;
    family?: string;
  }) {
    const a = presence(t, at, out, 0.15, 0.3);
    if (!a) return;
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
        ctx.fillRect(
          x + ctx.measureText(shown).width + 4 * u,
          y - size * u * 0.5,
          size * u * 0.5,
          size * u,
        );
      }
    });
  }

  /**
   * Captions from m.cues (perCue 3, the spoken word *marked*). A group of
   * words pops in together; a pill in the accent colour slides from word to
   * word under the one being said.
   */
  function captions({ y = H * 0.7, size = 78, upper = true, maxWidth = W * 0.86 } = {}) {
    const cues: { start: number; end: number; text: string }[] = m.cues ?? [];
    const i = cues.findIndex((c) => t >= c.start && t < Math.max(c.end, c.start + 0.08));
    if (i < 0) return;
    const cue = cues[i] as { start: number; end: number; text: string };
    const plain = (c: { text: string }) => c.text.replace(/\*/g, "");
    const lit = (c: { text: string }) => c.text.split(/\s+/).findIndex((w) => /^\*.+\*$/.test(w));
    // The group started at the first earlier cue with the same words.
    let g = i;
    while (g > 0 && plain(cues[g - 1] as { text: string }) === plain(cue)) g--;
    const groupStart = (cues[g] as { start: number }).start;
    const text = upper ? plain(cue).toUpperCase() : plain(cue);
    // Wider word spacing than prose, so the pill never crowds a neighbour.
    const l = layout(text, size, T.ink, size * u * 0.3);
    const fit = Math.min(1, maxWidth / l.width);
    const now = lit(cue);
    const prev = i > g ? lit(cues[i - 1] as { text: string }) : now;
    const slide = expo((t - cue.start) / 0.14);
    const box = (k: number) => {
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
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 18 * u;
      ctx.shadowOffsetY = 6 * u;
      ctx.textBaseline = "middle";
      l.pieces.forEach((p, k) => {
        ctx.font = p.font;
        const on = k === now;
        if (on) ctx.shadowColor = "transparent";
        else ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.fillStyle = on ? T.onAccent : T.ink;
        ctx.fillText(p.text, p.x, 2 * u);
      });
    });
  }

  // ------------------------------------------------------------ annotations

  /** Stroke a path progressively. `length` is the path's length (the helpers below compute it). */
  function stroke(
    path: (c: any) => void,
    length: number,
    p: number,
    { color = T.accent, width = 8, glow = true } = {},
  ) {
    if (p <= 0) return;
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

  /** A marker circle drawn around something, slightly more than once round, like a hand would. */
  function ring({
    x,
    y,
    rx,
    ry = rx,
    at,
    out = Infinity,
    dur = 0.55,
    color = T.accent,
    width = 7,
  }: {
    x: number;
    y: number;
    rx: number;
    ry?: number;
    at: number;
    out?: number;
    dur?: number;
    color?: string;
    width?: number;
  }) {
    const a = presence(t, at, out, 0.01, 0.3);
    if (!a) return;
    const turns = 1.12;
    const len = Math.PI * (rx + ry) * turns;
    layer(() => {
      fade(a);
      stroke(
        (c) => {
          const steps = 64;
          for (let i = 0; i <= steps; i++) {
            const th = -2.2 + (i / steps) * Math.PI * 2 * turns;
            const wob = 1 + 0.04 * Math.sin(i * 0.7);
            const px = x + Math.cos(th) * rx * wob;
            const py = y + Math.sin(th) * ry * wob * (1 + 0.05 * (i / steps));
            i ? c.lineTo(px, py) : c.moveTo(px, py);
          }
        },
        len,
        expo((t - at) / dur),
        { color, width },
      );
    });
  }

  /** A curved arrow that draws itself from (x1, y1) to (x2, y2), then grows its head. */
  function arrow({
    x1,
    y1,
    x2,
    y2,
    bend = 0.25,
    at,
    out = Infinity,
    dur = 0.5,
    color = T.accent,
    width = 8,
  }: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    bend?: number;
    at: number;
    out?: number;
    dur?: number;
    color?: string;
    width?: number;
  }) {
    const a = presence(t, at, out, 0.01, 0.3);
    if (!a) return;
    const mx = (x1 + x2) / 2 - (y2 - y1) * bend;
    const my = (y1 + y2) / 2 + (x2 - x1) * bend;
    let len = 0;
    let px = x1;
    let py = y1;
    for (let i = 1; i <= 24; i++) {
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
      stroke(
        (c) => {
          c.moveTo(x1, y1);
          c.quadraticCurveTo(mx, my, x2, y2);
        },
        len,
        p,
        { color, width },
      );
      const head = clamp((p - 0.75) / 0.25);
      if (head > 0) {
        const ang = Math.atan2(y2 - my, x2 - mx);
        const hl = 34 * u * head;
        stroke(
          (c) => {
            c.moveTo(x2 - Math.cos(ang - 0.5) * hl, y2 - Math.sin(ang - 0.5) * hl);
            c.lineTo(x2, y2);
            c.lineTo(x2 - Math.cos(ang + 0.5) * hl, y2 - Math.sin(ang + 0.5) * hl);
          },
          hl * 2.2,
          1,
          { color, width },
        );
      }
    });
  }

  /** A highlighter swipe behind a stretch of the frame, left to right. */
  function highlight({
    x,
    y,
    w,
    h,
    at,
    out = Infinity,
    color = T.accent,
    dur = 0.35,
  }: {
    x: number;
    y: number;
    w: number;
    h: number;
    at: number;
    out?: number;
    color?: string;
    dur?: number;
  }) {
    const a = presence(t, at, out, 0.01, 0.3);
    if (!a) return;
    layer(() => {
      fade(a * 0.85);
      ctx.globalCompositeOperation = T.dark ? "screen" : "multiply";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, w * expo((t - at) / dur), h, 8 * u);
      ctx.fill();
    });
  }

  /** A HUD target: brackets that close in and a dashed ring that turns (Kurzgesagt). */
  function reticle({
    x,
    y,
    r = 120,
    at,
    out = Infinity,
    color = T.ink,
  }: {
    x: number;
    y: number;
    r?: number;
    at: number;
    out?: number;
    color?: string;
  }) {
    const a = presence(t, at, out, 0.35, 0.3);
    if (!a) return;
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
        [-1, 1],
      ] as [number, number][]) {
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

  /** Dim everything but a soft circle. */
  function spotlight({
    x,
    y,
    r = 260,
    at,
    out = Infinity,
    dim = 0.65,
  }: {
    x: number;
    y: number;
    r?: number;
    at: number;
    out?: number;
    dim?: number;
  }) {
    const a = presence(t, at, out, 0.4, 0.4);
    if (!a) return;
    layer(() => {
      const R = r * u;
      const g = ctx.createRadialGradient(x, y, R * 0.8, x, y, R * 1.6);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${dim * a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
  }

  // ------------------------------------------------------------ cards and structure

  type Box = { x: number; y: number; w: number; h: number };

  /**
   * A frosted-glass card: the footage behind it blurred, a light fill, a hairline
   * border lit from the top-left, and a deep soft shadow. It rises in and
   * sinks out; `inner(box, presence)` draws its contents.
   */
  function glass({
    x,
    y,
    w,
    h,
    r = 36,
    at,
    out = Infinity,
    frost = true,
    inner,
  }: Box & {
    r?: number;
    at: number;
    out?: number;
    frost?: boolean;
    inner?: (box: Box, a: number) => void;
  }) {
    const a = presence(t, at, out, 0.55, 0.35);
    if (!a) return;
    const rise = (1 - a) * 40 * u;
    const s = lerp(0.96, 1, a);
    layer(() => {
      fade(a);
      ctx.translate(x + w / 2, y + h / 2 + rise);
      ctx.scale(s, s);
      ctx.translate(-w / 2, -h / 2);
      const R = r * u;
      layer(() => {
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 60 * u;
        ctx.shadowOffsetY = 24 * u;
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

  /** A name and role: an accent bar grows, a glass plate wipes out from it, the name rises, the role follows. */
  function lowerThird({
    name,
    role,
    at,
    out = at + 4.5,
    x = 70 * u,
    y = H * 0.8,
  }: {
    name: string;
    role?: string;
    at: number;
    out?: number;
    x?: number;
    y?: number;
  }) {
    if (t < at || t > out + 0.5) return;
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
      ctx.fillRect(x, y - h / 2 + (h * (1 - bar)) / 2, 8 * u, h * bar);
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

  /**
   * A full-frame transition: two diagonal bands (accent, then dark) sweep
   * across, cover the frame at `at`, and uncover it. Swap what's underneath
   * at `at`. Returns true while the frame is fully covered.
   */
  function wipe(at: number, dur = 0.7, dir = 1) {
    const p = (t - (at - dur / 2)) / dur;
    if (p < 0 || p > 1) return false;
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
        ctx.fillRect(
          Math.min(x0, x1) - span * 0.5 * (1 - lead),
          -span,
          Math.abs(x1 - x0) + span * 0.5 * (1 - lead),
          span * 2,
        );
      });
    });
    return p > 0.45 && p < 0.55;
  }

  /**
   * A chapter card over the whole frame: the backdrop, a huge outlined number
   * with a gradient stroke, a kicker and a title that blur in; it leaves by
   * zooming through the camera.
   */
  function chapter({
    num,
    label = "Chapter",
    title: text,
    at,
    out,
  }: {
    num: string;
    label?: string;
    title: Line[];
    at: number;
    out: number;
  }) {
    if (t < at || t > out + 0.5) return;
    const leave = t > out ? easeIn((t - out) / 0.5) : 0;
    layer(() => {
      fade(1 - leave);
      // It leaves by flying through the camera.
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
        // SF Pro's contours overlap, which an outline shows; Helvetica Neue's don't.
        ctx.font = `700 ${Math.round(big)}px Helvetica Neue`;
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
        gradient: true,
      });
      vignette(0.5);
    });
  }

  /** Break text into lines no wider than maxWidth at this size and face. */
  function wrap(
    text: string,
    size: number,
    maxWidth: number,
    weight = 500,
    family = T.serif,
    italic = true,
  ) {
    ctx.save();
    ctx.font = font(size, weight, family, italic);
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    ctx.restore();
    return lines;
  }

  /** A pull quote over the whole frame: the footage sinks into the backdrop, a huge quote mark, the words blur in. */
  function quote({
    text,
    by,
    at,
    out,
    size = 84,
  }: {
    text: string;
    by?: string;
    at: number;
    out: number;
    size?: number;
  }) {
    // The backdrop fades after `out`, while the words play their exit.
    const a = presence(t, at, out + 0.5, 0.5, 0.5);
    if (!a) return;
    const lines = wrap(text, size, W * 0.72);
    const lineH = size * u * 1.25;
    const top = H / 2 - (lineH * (lines.length - 1)) / 2;
    layer(() => {
      backdrop({ opacity: 0.94 * a });
      fade(a);
      ctx.font = `900 ${Math.round(size * 4 * u)}px ${T.serif}`;
      ctx.fillStyle = alpha(T.accent, 0.9);
      ctx.textBaseline = "alphabetic";
      ctx.shadowColor = alpha(T.accent, 0.6);
      ctx.shadowBlur = 50 * u;
      ctx.fillText("\u201C", W * 0.14 - 20 * u, top + size * u * 1.3 - (1 - a) * 40 * u);
    });
    title({
      lines: lines.map((l) => [{ text: l, italic: true, weight: 500, family: T.serif }]),
      at: at + 0.15,
      out,
      x: W * 0.14,
      y: top + ((lines.length - 1) * lineH) / 2,
      align: "left",
      size,
      leading: 1.25,
      stagger: 0.035,
      style: "blur",
    });
    if (by)
      kicker({
        text: `— ${by}`,
        at: at + 0.6,
        out,
        x: W * 0.14,
        y: top + lines.length * lineH + 20 * u,
        align: "left",
      });
    vignette(0.4 * a);
  }

  /**
   * A row of task chips that stays on screen (MrBeast's checklist): each pops
   * in, and at its `done` time fills with the accent, glows and ticks.
   */
  function checklist({
    items,
    x = W / 2,
    y = H * 0.14,
    at = 0,
    out = Infinity,
    size = 40,
  }: {
    items: { label: string; done?: number }[];
    x?: number;
    y?: number;
    at?: number;
    out?: number;
    size?: number;
  }) {
    if (t < at || t > out + 0.5) return;
    const leave = t > out ? easeIn((t - out) / 0.4) : 0;
    layer(() => {
      ctx.font = font(size, 700);
      const pad = size * u * 0.6;
      const gap = 16 * u;
      const ws = items.map((it) => ctx.measureText(it.label).width + pad * 2 + size * u * 1.1);
      const total = ws.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
      const fit = Math.min(1, (W * 0.92) / total);
      ctx.translate(x, y);
      ctx.scale(fit, fit);
      let cx = -total / 2;
      const h = size * u * 1.9;
      items.forEach((it, i) => {
        const w = ws[i] as number;
        const pin =
          spring(t, { from: 0, to: 1, start: at + i * 0.12, stiffness: 240, damping: 16 }) *
          (1 - leave);
        const done = it.done !== undefined && t >= it.done;
        const dp = done ? expo((t - (it.done as number)) / 0.35) : 0;
        const pulse = done ? Math.max(0, 1 - (t - (it.done as number)) / 0.6) : 0;
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
          // The box, then a tick that draws itself.
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

  /** A slim progress bar with a glowing head, along the top or bottom. */
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

  /** A still (a screenshot, a photo) on a floating card that tilts in and drifts. */
  function photo({
    path,
    x,
    y,
    w,
    h,
    at,
    out = Infinity,
    tilt = -0.05,
    r = 28,
  }: {
    path: string;
    x: number;
    y: number;
    w: number;
    h: number;
    at: number;
    out?: number;
    tilt?: number;
    r?: number;
  }) {
    const a = presence(t, at, out, 0.6, 0.35);
    if (!a) return;
    const img = picture(path);
    layer(() => {
      const float = Math.sin(t * 1.1) * 8 * u;
      ctx.translate(x + w / 2, y + h / 2 + float + (1 - a) * 80 * u);
      ctx.rotate(tilt * (0.4 + 0.6 * (1 - a)) + Math.sin(t * 0.7) * 0.008);
      // A skew reads as the card turning toward us in 3D.
      ctx.transform(1, 0, -0.08 * (1 - a), 1, 0, 0);
      const s = lerp(0.85, 1, a);
      ctx.scale(s, s);
      fade(a);
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 70 * u;
      ctx.shadowOffsetY = 30 * u;
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, r * u);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.save();
      ctx.clip();
      // Cover the card, cropping the picture's longer side.
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

  /** Bars that grow one after another, with their values counting (Vox-style chart). */
  function bars({
    data,
    x,
    y,
    w,
    h,
    at,
    out = Infinity,
  }: {
    data: { label: string; value: number }[];
    x: number;
    y: number;
    w: number;
    h: number;
    at: number;
    out?: number;
  }) {
    const a = presence(t, at, out, 0.3, 0.3);
    if (!a) return;
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
        ctx.fillText(
          Math.round(d.value * p).toLocaleString("en-US"),
          bx + bw / 2,
          y + h - bh - 26 * u,
        );
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
    /** The canvas context and the scene, for pieces a script draws itself. */
    ctx,
    m,
    theme: T,
    font,
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
    bars,
  };
}
