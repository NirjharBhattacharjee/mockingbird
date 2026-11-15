/**
 * `track` (#200): follows a box through a clip, so a mask, a title or a
 * picture in the picture can stay on a moving subject. Template matching on
 * small grey frames: each frame, the box's last picture is looked for near
 * where it was, coarsely then pixel by pixel, by zero-mean normalised
 * cross-correlation, and the template drifts slowly toward what it finds so
 * a subject that turns is still followed.
 */

/** The frames are read this wide; a box is found to about a pixel of it (0.3% of the width). */
const WIDTH = 320;
/** Frames read per second. */
const RATE = 15;
/** Keyframes kept per second; the rest is linear between them. */
const KEEP = 5;

export type Box = { x: number; y: number; w: number; h: number };
/** Where the box's top left is, `at` seconds into the stretch, in 0-1 of the picture. */
export type Point = { at: number; x: number; y: number };

/** `from` to `to` of `path` as grey frames `WIDTH` wide, at `RATE` a second. */
async function frames(path: string, from: number, to: number, aspect: number) {
  const height = Math.round(WIDTH / aspect / 2) * 2;
  const proc = Bun.spawn(
    [
      ...[
        "ffmpeg",
        "-nostdin",
        "-v",
        "error",
        "-ss",
        String(from),
        "-t",
        String(to - from),
        "-i",
        path,
      ],
      ...["-vf", `fps=${RATE},scale=${WIDTH}:${height},format=gray`, "-f", "rawvideo", "-"],
    ],
    { stderr: "pipe" },
  );
  const bytes = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
  if ((await proc.exited) !== 0) {
    throw new Error(
      `ffmpeg couldn't read ${path}: ${(await new Response(proc.stderr).text()).trim()}`,
    );
  }
  const size = WIDTH * height;
  return {
    height,
    list: Array.from({ length: Math.floor(bytes.length / size) }, (_, i) =>
      bytes.subarray(i * size, (i + 1) * size),
    ),
  };
}

/** The patch at (x, y), `w`x`h`, zero-mean. */
function patch(
  img: Uint8Array,
  width: number,
  x: number,
  y: number,
  w: number,
  h: number,
): Float32Array {
  const out = new Float32Array(w * h);
  let sum = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const v = img[(y + j) * width + x + i] as number;
      out[j * w + i] = v;
      sum += v;
    }
  }
  const mean = sum / out.length;
  for (let k = 0; k < out.length; k++) out[k] = (out[k] as number) - mean;
  return out;
}

/** Zero-mean normalised cross-correlation of `t` with the image at (x, y). */
function score(
  img: Uint8Array,
  width: number,
  t: Float32Array,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  let sum = 0;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) sum += img[(y + j) * width + x + i] as number;
  const mean = sum / (w * h);
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const a = t[j * w + i] as number;
      const b = (img[(y + j) * width + x + i] as number) - mean;
      ab += a * b;
      aa += a * a;
      bb += b * b;
    }
  }
  return ab / Math.sqrt(aa * bb || 1);
}

/**
 * Follows `box` (0-1 of the picture, where the subject is at `from`) to
 * `to`. Returns its top left over time, `KEEP` points a second, and the
 * lowest match on the way (under about 0.5, it was probably lost there).
 */
export function follow(
  list: Uint8Array[],
  width: number,
  height: number,
  box: Box,
): { points: { x: number; y: number }[]; worst: number } {
  const w = Math.max(4, Math.round(box.w * width));
  const h = Math.max(4, Math.round(box.h * height));
  let x = Math.round(box.x * width);
  let y = Math.round(box.y * height);
  const first = list[0];
  if (!first) return { points: [], worst: 0 };
  let template = patch(first, width, x, y, w, h);
  const points = [{ x, y }];
  let worst = 1;
  // Far enough for fast motion at 15 frames a second: a sixth of the width.
  const reach = Math.round(width / 6);
  for (const img of list.slice(1)) {
    let best = { x, y, s: -2 };
    const look = (cx: number, cy: number) => {
      if (cx < 0 || cy < 0 || cx + w > width || cy + h > height) return;
      const s = score(img, width, template, cx, cy, w, h);
      if (s > best.s) best = { x: cx, y: cy, s };
    };
    for (let dy = -reach; dy <= reach; dy += 3)
      for (let dx = -reach; dx <= reach; dx += 3) look(x + dx, y + dy);
    const coarse = { ...best };
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) look(coarse.x + dx, coarse.y + dy);
    ({ x, y } = best);
    worst = Math.min(worst, best.s);
    points.push({ x, y });
    // Drift toward what was found, only when it was found well.
    if (best.s > 0.6) {
      const now = patch(img, width, x, y, w, h);
      template = template.map((v, k) => 0.9 * v + 0.1 * (now[k] as number));
    }
  }
  return { points, worst };
}

/** `follow` on `path` from `from` to `to`: points in 0-1 of the picture, `at` seconds from `from`. */
export async function track(
  path: string,
  from: number,
  to: number,
  box: Box,
  aspect: number,
): Promise<{ points: Point[]; worst: number }> {
  const { list, height } = await frames(path, from, to, aspect);
  const { points, worst } = follow(list, WIDTH, height, box);
  const step = RATE / KEEP;
  const kept = points
    .map((p, i) => ({ ...p, i }))
    .filter((p) => p.i % step === 0 || p.i === points.length - 1)
    .map(({ x, y, i }) => ({
      at: Math.round((i / RATE) * 1000) / 1000,
      x: Math.round((x / WIDTH) * 10000) / 10000,
      y: Math.round((y / height) * 10000) / 10000,
    }));
  return { points: kept, worst: Math.round(worst * 100) / 100 };
}

/** A value over time `t` from `points` as an ffmpeg expression: linear between them, held past the ends. */
export function along(points: Point[], key: "x" | "y", t: string, scale: number): string {
  const v = (p: Point) => String(Math.round(p[key] * scale * 100) / 100);
  if (points.length < 2) return points[0] ? v(points[0]) : "0";
  let expr = v(points.at(-1) as Point);
  for (let i = points.length - 2; i >= 0; i--) {
    const a = points[i] as Point;
    const b = points[i + 1] as Point;
    const span = Math.max(b.at - a.at, 1e-3);
    const lerp = `(${v(a)}+(${v(b)}-${v(a)})*(${t}-${a.at})/${span})`;
    expr = `if(lt(${t},${b.at}),${lerp},${expr})`;
  }
  return points[0] && points[0].at > 0
    ? `if(lt(${t},${points[0].at}),${v(points[0])},${expr})`
    : expr;
}
