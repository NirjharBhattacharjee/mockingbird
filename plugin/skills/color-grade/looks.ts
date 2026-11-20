/**
 * The color-grade playbook's looks (#254), made here so they're ours and MIT.
 * Each is a function on display RGB (0-1, gamma encoded, as ffmpeg's lut3d
 * sees it), written out as a 17-point .cube that lut3d interpolates.
 *
 *   bun plugin/skills/color-grade/looks.ts    # writes luts/<name>.cube
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

type Rgb = [number, number, number];

const luma = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
/** An S-curve on each channel: `k` 0 leaves it, 1 is a full smoothstep. */
const curve = (c: Rgb, k: number) => c.map((x) => x + k * (x * x * (3 - 2 * x) - x)) as Rgb;
/** Saturation around the pixel's own luma. */
const saturate = (c: Rgb, s: number) => {
  const y = luma(c);
  return c.map((x) => y + (x - y) * s) as Rgb;
};
/** Black lifted to `black`, white pulled to `white`. */
const range = (c: Rgb, black: number, white: number) =>
  c.map((x) => black + x * (white - black)) as Rgb;
/** Adds `tint` in proportion to `weight`. */
const tint = (c: Rgb, t: Rgb, weight: number) =>
  c.map((x, i) => x + (t[i] as number) * weight) as Rgb;

export const LOOKS: Record<string, (c: Rgb) => Rgb> = {
  /** A touch of contrast and colour; for a talking head or anything that should look true. */
  clean: (c) => saturate(curve(c, 0.15), 1.05),
  /** Strong contrast and colour, no hue shift; for a vlog or a short that has to pop. */
  punchy: (c) => saturate(curve(c, 0.4), 1.25),
  /** Soft contrast, lifted blacks, warm brights, a little less colour. */
  "warm-film": (c) => {
    const s = range(curve(c, 0.25), 0.035, 0.97);
    return saturate(tint(s, [0.035, -0.004, -0.035], luma(s)), 0.92);
  },
  /** Teal shadows, orange brights, skin left on its line; for a cinematic or product piece. */
  "teal-orange": (c) => {
    const s = curve(c, 0.25);
    const y = luma(s);
    const shadows = tint(s, [-0.06, 0.01, 0.05], (1 - y) ** 2);
    return saturate(tint(shadows, [0.05, -0.005, -0.045], y ** 2), 1.1);
  },
  /** Low contrast, milky blacks, muted colour; for calm or nostalgic pieces. */
  faded: (c) => saturate(tint(range(c, 0.08, 0.93), [0.012, -0.002, -0.006], 1), 0.8),
};

/** The look as a .cube file's text, red changing fastest as the format wants. */
export function cube(name: string, n = 17): string {
  const look = LOOKS[name];
  if (!look) throw new Error(`No look "${name}"`);
  const lines = [`TITLE "mockingbird ${name}"`, `LUT_3D_SIZE ${n}`];
  const s = n - 1;
  for (let b = 0; b < n; b++)
    for (let g = 0; g < n; g++)
      for (let r = 0; r < n; r++)
        lines.push(
          look([r / s, g / s, b / s])
            .map((v) => clamp(v).toFixed(4))
            .join(" "),
        );
  return `${lines.join("\n")}\n`;
}

if (import.meta.main) {
  for (const name of Object.keys(LOOKS)) {
    writeFileSync(join(import.meta.dir, "luts", `${name}.cube`), cube(name));
  }
}
