/**
 * The effects catalog (#197): each effect is an entry here, not a tool, so
 * the catalog can grow without a tool description per effect. An entry
 * names its parameters with their ranges and builds the ffmpeg filter that
 * render puts on a clip's picture or sound.
 */
import { quoted } from "../inspect/probe.ts";

type Param = { min: number; max: number; default: number; about: string };
/** What an effect is put on: the picture's size, and how long it lasts in the finished video. */
/** `speed` is the clip's (default 1): a tracked path's times are the source's, the graph's the output's. */
export type Ctx = { width: number; height: number; length: number; fps: number; speed?: number };
type Entry = {
  kind: "video" | "audio";
  about: string;
  params: Record<string, Param>;
  /** Paths the effect reads, besides its numbers: a LUT. */
  files?: string[];
  /** Colours it takes as #rrggbb, with their defaults. */
  colors?: Record<string, string>;
  build: (p: Record<string, number>, strings: Record<string, string>, ctx: Ctx) => string;
  /** For a picture effect that changes the sound too (reverse). */
  sound?: (p: Record<string, number>) => string;
};

export const DEFAULT_CTX: Ctx = { width: 1920, height: 1080, length: 0, fps: 30 };
export const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** An effect as a project keeps it: its name and its settings. */
export type Effect = { name: string } & Record<string, unknown>;

export const f = (n: number) => String(Math.round(n * 10000) / 10000);

export const EFFECTS: Record<string, Entry> = {
  color: {
    kind: "video",
    about: "Exposure, contrast, saturation, gamma and white balance, in one pass",
    params: {
      exposure: { min: -3, max: 3, default: 0, about: "stops; +1 doubles the light" },
      contrast: { min: 0, max: 3, default: 1, about: "1 leaves it" },
      saturation: { min: 0, max: 3, default: 1, about: "0 is black and white" },
      gamma: { min: 0.2, max: 5, default: 1, about: "above 1 lifts the mids" },
      temperature: {
        min: 1000,
        max: 40000,
        default: 6500,
        about: "kelvin the picture is shot at; lower warms a cold picture",
      },
    },
    build: (p) =>
      [
        p.exposure ? `exposure=exposure=${f(p.exposure as number)}` : "",
        p.contrast !== 1 || p.saturation !== 1 || p.gamma !== 1
          ? `eq=contrast=${f(p.contrast as number)}:saturation=${f(p.saturation as number)}:gamma=${f(p.gamma as number)}`
          : "",
        p.temperature !== 6500
          ? `colortemperature=temperature=${Math.round(p.temperature as number)}`
          : "",
      ]
        .filter(Boolean)
        .join(","),
  },
  lut: {
    kind: "video",
    about: "A look from a .cube 3D LUT, at full strength",
    // ponytail: no partial mix; a split and blend need their own graph labels, add if wanted.
    params: {},
    files: ["file"],
    build: (_, files) => `lut3d=file=${quoted(files.file as string)}`,
  },
  vignette: {
    kind: "video",
    about: "Darkens the corners, to pull the eye to the middle",
    params: { amount: { min: 0, max: 1, default: 0.4, about: "0 none, 1 strong" } },
    build: (p) => `vignette=angle=${f((p.amount as number) * (Math.PI / 2.5))}`,
  },
  sharpen: {
    kind: "video",
    about: "Unsharp mask, for soft footage",
    params: { amount: { min: 0, max: 2, default: 0.5, about: "how much" } },
    build: (p) => `unsharp=5:5:${f(p.amount as number)}:5:5:0`,
  },
  blur: {
    kind: "video",
    about: "Gaussian blur over the whole picture",
    params: { radius: { min: 0.5, max: 50, default: 8, about: "pixels" } },
    build: (p) => `gblur=sigma=${f(p.radius as number)}`,
  },
  chromakey: {
    kind: "video",
    about:
      "Keys out a green or blue screen and takes the colour's spill off the edges. Put it on an insert, so the cut shows through where the screen was",
    params: {
      similarity: { min: 0.01, max: 1, default: 0.15, about: "how far from the colour still keys" },
      blend: { min: 0, max: 1, default: 0.05, about: "how soft the key's edge is" },
      spill: { min: 0, max: 1, default: 0.5, about: "how much spill to take off" },
    },
    colors: { color: "#00ff00" },
    build: (p, s) => {
      const hex = (s.color as string).replace("#", "");
      const [, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
      const spill = p.spill
        ? `,despill=${(g as number) >= (b as number) ? "type=green:green=-1:blue=0" : "type=blue:green=0:blue=-1"}:mix=${f(p.spill as number)}`
        : "";
      return `format=yuva420p,chromakey=color=0x${hex}:similarity=${f(p.similarity as number)}:blend=${f(p.blend as number)}${spill}`;
    },
  },
  stabilize: {
    kind: "video",
    about:
      "Steadies a shaky handheld clip (ffmpeg's deshake), then zooms in a little so the moving edges stay out of frame",
    params: {
      strength: { min: 0, max: 1, default: 0.5, about: "how far it searches for the shake" },
      zoom: { min: 0, max: 0.2, default: 0.05, about: "how much to crop to hide the edges" },
    },
    build: (p, _, c) => {
      // deshake searches 16, 32, 48 or 64 pixels each way.
      const range = 16 * Math.round(1 + 3 * (p.strength as number));
      const z = p.zoom as number;
      const crop = z
        ? `,crop=${even(c.width * (1 - z))}:${even(c.height * (1 - z))},scale=${c.width}:${c.height}`
        : "";
      return `deshake=rx=${range}:ry=${range}:edge=mirror${crop}`;
    },
  },
  crop: {
    kind: "video",
    about:
      "Cuts edges off, each 0-0.5 of the picture, leaving the rest where it was: on an insert the cut shows through, on a clip they're black",
    params: {
      left: { min: 0, max: 0.5, default: 0, about: "of the width" },
      right: { min: 0, max: 0.5, default: 0, about: "of the width" },
      top: { min: 0, max: 0.5, default: 0, about: "of the height" },
      bottom: { min: 0, max: 0.5, default: 0, about: "of the height" },
    },
    build: (p, _, c) => {
      const [l, r, t, b] = [p.left, p.right, p.top, p.bottom] as number[];
      if (!(l || r || t || b)) return "";
      const [x, y] = [even(c.width * (l as number)), even(c.height * (t as number))];
      const w = Math.max(2, even(c.width * (1 - (l as number) - (r as number))));
      const h = Math.max(2, even(c.height * (1 - (t as number) - (b as number))));
      return `format=yuva420p,crop=${w}:${h}:${x}:${y},pad=${c.width}:${c.height}:${x}:${y}:color=black@0`;
    },
  },
  freeze: {
    kind: "video",
    about:
      "Holds the clip's first frame for its whole length while its sound plays on; split a clip where the freeze should start",
    params: {},
    build: (_, __, c) =>
      `trim=end_frame=1,tpad=stop_mode=clone:stop_duration=${f(c.length)},trim=duration=${f(c.length)}`,
  },
  interpolate: {
    kind: "video",
    about:
      "Smooth slow motion: a slowed clip (speed under 1) gets new in-between frames from the motion instead of repeated ones. Slow to render: 4 s at 720p took 9.5 s",
    params: {},
    // Placed by render before the frame rate is set, not in the effect chain.
    build: () => "",
  },
  reverse: {
    kind: "video",
    about: "Plays the clip backwards, picture and sound. Keep it short: the clip is held in memory",
    params: {},
    build: () => "reverse",
    sound: () => "areverse",
  },
  gain: {
    kind: "audio",
    about:
      "Raises or lowers the clip's sound by dB; a project's `level` sets it for each source (#265)",
    params: { db: { min: -30, max: 30, default: 0, about: "dB; +6 is about twice as loud" } },
    build: (p) => (p.db ? `volume=${f(p.db as number)}dB` : ""),
  },
  denoise: {
    kind: "audio",
    about:
      "Takes out steady background noise (hiss, hum, fans). Set floor to the source's noise floor from audio_stats",
    params: {
      amount: { min: 0, max: 1, default: 0.5, about: "0 light, 1 strong" },
      floor: {
        min: -80,
        max: -20,
        default: -40,
        about: "dBFS where the noise sits; audio_stats on the source gives it",
      },
    },
    build: (p) => `afftdn=nr=${f(12 + (p.amount as number) * 28)}:nf=${f(p.floor as number)}:tn=1`,
  },
  highpass: {
    kind: "audio",
    about: "Cuts rumble below a frequency; 80 Hz suits speech",
    params: { frequency: { min: 20, max: 400, default: 80, about: "Hz" } },
    build: (p) => `highpass=f=${Math.round(p.frequency as number)}`,
  },
  compress: {
    kind: "audio",
    about: "Evens out loud and quiet speech",
    params: {
      threshold: { min: -60, max: 0, default: -24, about: "dB where it starts" },
      ratio: { min: 1, max: 20, default: 3, about: "how hard" },
    },
    build: (p) =>
      `acompressor=threshold=${f(10 ** ((p.threshold as number) / 20))}:ratio=${f(p.ratio as number)}:attack=10:release=150`,
  },
  deess: {
    kind: "audio",
    about: "Softens harsh s and sh sounds",
    params: { amount: { min: 0, max: 1, default: 0.5, about: "how much" } },
    build: (p) => `deesser=i=${f(p.amount as number)}`,
  },
};

/** The catalog as text, for the `effects` tool. */
export function catalog(): string {
  return Object.entries(EFFECTS)
    .map(([name, e]) => {
      const params = Object.entries(e.params).map(
        ([k, p]) => `    ${k}: ${p.min} to ${p.max}, default ${p.default} (${p.about})`,
      );
      const files = (e.files ?? []).map((k) => `    ${k}: an absolute path`);
      const colors = Object.entries(e.colors ?? {}).map(
        ([k, d]) => `    ${k}: a colour like "#00ff00", default ${d}`,
      );
      return [`${name} (${e.kind}): ${e.about}`, ...files, ...colors, ...params].join("\n");
    })
    .join("\n")
    .concat(
      '\n\nAny picture effect but interpolate takes mask: { shape: "rect" | "ellipse" | "polygon" | "subject", x, y, w, h (0-1 of the picture; a polygon has points: [[x, y], ...]), feather (0-0.5 of the width), invert, end: { x, y, w, h } to move a rect or ellipse there over the clip }, to apply it to that part of the frame only. "subject" is the person in the frame, found per frame by MODNet (`mockingbird models pull modnet` first): with invert, a blur or a grade on everything but them.',
    );
}
