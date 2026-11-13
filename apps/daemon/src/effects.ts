/**
 * The effects catalog (#197): each effect is an entry here, not a tool, so
 * the catalog can grow without a tool description per effect. An entry
 * names its parameters with their ranges and builds the ffmpeg filter that
 * render puts on a clip's picture or sound.
 */

type Param = { min: number; max: number; default: number; about: string };
type Entry = {
  kind: "video" | "audio";
  about: string;
  params: Record<string, Param>;
  /** Paths the effect reads, besides its numbers: a LUT. */
  files?: string[];
  build: (p: Record<string, number>, files: Record<string, string>) => string;
};

/** An effect as a project keeps it: its name and its settings. */
export type Effect = { name: string } & Record<string, unknown>;

/**
 * A path as a filter option inside a graph, escaped at both levels ffmpeg
 * parses: the option value (`\`, `'`, `:`), then the graph (`\`, `'`, `[`, `]`,
 * `,`, `;`). Quoting it instead breaks on an apostrophe: `O'Brien.cube`.
 */
const quoted = (path: string) =>
  path.replace(/[\\':]/g, (c) => `\\${c}`).replace(/[\\'[\],;]/g, (c) => `\\${c}`);

const f = (n: number) => String(Math.round(n * 10000) / 10000);

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

/** `effects`, checked against the catalog: each one's numbers in range, its files given. */
export function checkEffects(effects: unknown, what: string): Effect[] {
  if (effects === undefined) return [];
  if (!Array.isArray(effects)) throw new Error(`${what} must be a list of { name, ... }`);
  return effects.map((e, i) => {
    const at = `${what}[${i}]`;
    if (typeof e !== "object" || e === null) throw new Error(`${at} must be an object`);
    const { name, ...given } = e as Record<string, unknown>;
    const entry = EFFECTS[String(name)];
    if (!entry) {
      throw new Error(`${at}.name must be one of ${Object.keys(EFFECTS).join(", ")}; got ${name}`);
    }
    for (const [key, value] of Object.entries(given)) {
      if (entry.files?.includes(key)) {
        if (typeof value !== "string" || !value) throw new Error(`${at}.${key} must be a path`);
        continue;
      }
      const p = entry.params[key];
      if (!p) {
        const known = [...Object.keys(entry.params), ...(entry.files ?? [])].join(", ");
        throw new Error(`${at}: ${name} has no ${key}; it takes ${known}`);
      }
      const n = Number(value);
      if (typeof value !== "number" || !Number.isFinite(n) || n < p.min || n > p.max) {
        throw new Error(
          `${at}.${key} must be from ${p.min} to ${p.max}; got ${JSON.stringify(value)}`,
        );
      }
    }
    for (const file of entry.files ?? []) {
      if (given[file] === undefined) throw new Error(`${at}: ${name} needs ${file}`);
    }
    return { name: String(name), ...given };
  });
}

/** A clip's effects as filter chains for its picture and its sound ("" for none). */
export function effectFilters(effects: Effect[] = []): { video: string; audio: string } {
  const chains = { video: [] as string[], audio: [] as string[] };
  for (const { name, ...given } of effects) {
    const entry = EFFECTS[name];
    if (!entry) continue;
    const numbers: Record<string, number> = {};
    for (const [key, p] of Object.entries(entry.params)) {
      numbers[key] = typeof given[key] === "number" ? (given[key] as number) : p.default;
    }
    const files = Object.fromEntries((entry.files ?? []).map((k) => [k, String(given[k])]));
    const built = entry.build(numbers, files);
    if (built) chains[entry.kind].push(built);
  }
  return { video: chains.video.join(","), audio: chains.audio.join(",") };
}

/** The catalog as text, for the `effects` tool. */
export function catalog(): string {
  return Object.entries(EFFECTS)
    .map(([name, e]) => {
      const params = Object.entries(e.params).map(
        ([k, p]) => `    ${k}: ${p.min} to ${p.max}, default ${p.default} (${p.about})`,
      );
      const files = (e.files ?? []).map((k) => `    ${k}: an absolute path`);
      return [`${name} (${e.kind}): ${e.about}`, ...files, ...params].join("\n");
    })
    .join("\n");
}
