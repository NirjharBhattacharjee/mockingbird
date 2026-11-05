/**
 * `scopes` (#197): what a colourist reads off the scopes, as numbers, since
 * the agent can't see the picture well enough to grade by eye. Frames are
 * sampled, scaled down and read as YUV 4:4:4.
 */

/** The skin-tone line on a vectorscope, in degrees from +Cb toward +Cr. */
const SKIN_LINE = 123;

export type Scopes = {
  frames: number;
  /** Mean luma, 0-1 of the legal range. */
  luma: number;
  /** 5th and 95th percentile luma. */
  low: number;
  high: number;
  /** Shares of pixels in each third of the range, and at its ends. */
  shadows: number;
  mids: number;
  highlights: number;
  crushed: number;
  clipped: number;
  /** Mean chroma, 0-1. */
  saturation: number;
  /** Share of pixels that look like skin, and their mean hue's distance from the skin-tone line (+ toward yellow, - toward red). */
  skin: number;
  skinOffset: number | undefined;
};

/** Measures `pixels`, frames of YUV 4:4:4 planes at `width`x`height`. */
export function measure(pixels: Uint8Array, width: number, height: number): Scopes {
  const plane = width * height;
  const frames = Math.floor(pixels.length / (plane * 3));
  const lumas = new Uint32Array(256);
  let chroma = 0;
  let skin = 0;
  let skinAngle = 0;
  for (let f = 0; f < frames; f++) {
    const y0 = f * plane * 3;
    for (let i = 0; i < plane; i++) {
      const y = pixels[y0 + i] as number;
      const u = (pixels[y0 + plane + i] as number) - 128;
      const v = (pixels[y0 + plane * 2 + i] as number) - 128;
      lumas[y] = (lumas[y] as number) + 1;
      const sat = Math.min(1, Math.hypot(u, v) / 112);
      chroma += sat;
      const level = (y - 16) / 219;
      if (sat > 0.05 && level > 0.15 && level < 0.95) {
        const hue = (Math.atan2(v, u) * 180) / Math.PI;
        const off = hue - SKIN_LINE;
        if (Math.abs(off) < 25) {
          skin++;
          skinAngle += off;
        }
      }
    }
  }
  const total = frames * plane || 1;
  const share = (lo: number, hi: number) => {
    let n = 0;
    for (let y = lo; y <= hi; y++) n += lumas[y] as number;
    return n / total;
  };
  const percentile = (p: number) => {
    let seen = 0;
    for (let y = 0; y < 256; y++) {
      seen += lumas[y] as number;
      if (seen >= p * total) return Math.max(0, Math.min(1, (y - 16) / 219));
    }
    return 1;
  };
  let sum = 0;
  for (let y = 0; y < 256; y++)
    sum += (lumas[y] as number) * Math.max(0, Math.min(1, (y - 16) / 219));
  // Thirds of the legal range, 16-235.
  const third = (k: number) => Math.round(16 + (219 * k) / 3);
  return {
    frames,
    luma: sum / total,
    low: percentile(0.05),
    high: percentile(0.95),
    shadows: share(0, third(1) - 1),
    mids: share(third(1), third(2) - 1),
    highlights: share(third(2), 255),
    crushed: share(0, 17),
    clipped: share(234, 255),
    saturation: chroma / total,
    skin: skin / total,
    skinOffset: skin ? skinAngle / skin : undefined,
  };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** `s` as the tool's answer, each number beside what a graded picture usually shows. */
export function report(s: Scopes, where: string): string {
  const skin =
    s.skinOffset === undefined || s.skin < 0.01
      ? "skin: too little in frame to judge"
      : `skin: ${pct(s.skin)} of the picture, its hue ${Math.abs(s.skinOffset).toFixed(1)}° ${s.skinOffset >= 0 ? "toward yellow" : "toward red"} of the skin-tone line (aim: within 5°)`;
  return [
    `${where}: ${s.frames} frames`,
    `luma: mean ${s.luma.toFixed(2)}, 5th to 95th percentile ${s.low.toFixed(2)} to ${s.high.toFixed(2)} (aim: mean 0.40 to 0.60 for a talking head, 95th above 0.75)`,
    `histogram: shadows ${pct(s.shadows)}, mids ${pct(s.mids)}, highlights ${pct(s.highlights)}`,
    `crushed blacks ${pct(s.crushed)}, clipped whites ${pct(s.clipped)} (aim: each under 1%)`,
    `saturation: mean ${s.saturation.toFixed(2)} (aim: about 0.15 to 0.35; under 0.08 looks washed out)`,
    skin,
  ].join("\n");
}

/**
 * Frames from `path` over `from`-`to` (one every `every` seconds, at most
 * 60), measured. `size` is the video's, `WxH`.
 */
export async function scopes(
  path: string,
  size: string,
  { from = 0, to, every = 1 }: { from?: number; to: number; every?: number },
): Promise<string> {
  const span = Math.max(0.04, to - from);
  const step = Math.max(every, span / 60);
  const [w = 1, h = 1] = size.split("x").map(Number);
  const width = 320;
  const height = Math.max(2, Math.round((width * h) / w / 2) * 2);
  const proc = Bun.spawn(
    [
      ...["ffmpeg", "-nostdin", "-loglevel", "error", "-ss", String(from), "-t", String(span)],
      ...["-i", path, "-an", "-vf", `fps=1/${step},scale=${width}:${height},format=yuv444p`],
      ...["-f", "rawvideo", "-pix_fmt", "yuv444p", "-"],
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [bytes, why, code] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`ffmpeg couldn't read ${path}: ${why.trim()}`);
  const s = measure(new Uint8Array(bytes), width, height);
  if (!s.frames) throw new Error(`No frames in ${path} between ${from} s and ${to} s.`);
  return report(s, `${path} ${from.toFixed(2)}-${to.toFixed(2)} s`);
}
