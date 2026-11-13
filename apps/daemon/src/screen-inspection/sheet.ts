import { linkSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type FrameSample, requireFrameData, runBoundedProcess } from "@mockingbird/video";

const DIGITS: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  ":": ["0", "1", "0", "1", "0"],
  ".": ["0", "0", "0", "0", "1"],
};
function label(t: number) {
  const ms = Math.round(t * 1000);
  return `${String(Math.floor(ms / 3_600_000)).padStart(2, "0")}:${String(Math.floor(ms / 60_000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

export function createContactSheet(
  samples: FrameSample[],
  pixels: Map<number, Buffer>,
  columns: number,
) {
  const width = columns * 320;
  const height = Math.ceil(samples.length / columns) * 204;
  const sheet = Buffer.alloc(width * height * 3);
  for (const [i, sample] of samples.entries()) {
    const x0 = (i % columns) * 320;
    const y0 = Math.floor(i / columns) * 204;
    const frame = requireFrameData(pixels.get(sample.index));
    for (let y = 0; y < 180; y++)
      frame.copy(sheet, ((y0 + y) * width + x0) * 3, y * 960, (y + 1) * 960);
    let x = x0 + 8;
    for (const char of label(sample.requested)) {
      const glyph = requireFrameData(DIGITS[char]);
      for (const [gy, row] of glyph.entries())
        for (const [gx, bit] of [...row].entries())
          if (bit === "1") {
            for (let dy = 0; dy < 3; dy++)
              for (let dx = 0; dx < 3; dx++) {
                const p = ((y0 + 184 + gy * 3 + dy) * width + x + gx * 3 + dx) * 3;
                sheet.fill(255, p, p + 3);
              }
          }
      x += (requireFrameData(glyph[0]).length + 1) * 3;
    }
  }
  return { width, height, sheet };
}

export async function publishContactSheet(
  out: string,
  image: { width: number; height: number; sheet: Buffer },
  deadline: number,
) {
  const { width, height, sheet } = image;
  const dir = mkdtempSync(join(dirname(out), ".mockingbird-sheet-"));
  try {
    const ppm = join(dir, "sheet.ppm");
    const png = join(dir, "sheet.png");
    writeFileSync(ppm, Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), sheet]));
    await runBoundedProcess(
      [
        "ffmpeg",
        "-nostdin",
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        ppm,
        "-frames:v",
        "1",
        png,
      ],
      deadline,
    );
    linkSync(png, out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
