/**
 * Subject masks (#260): a grey video of a clip's stretch of its source, white
 * where MODNet sees the person, for a mask with `shape: "subject"`. Made
 * before the render and kept in the cache, keyed by the source, the stretch
 * and the model, so a second render reuses it.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { matteSize, SubjectMatte } from "@mockingbird/matte";
import { MODNET_FILE } from "./models.ts";

export type MaskJob = {
  path: string;
  from: number;
  to: number;
  /** The source's picture as played, `WxH`, and its frame rate. */
  size: string;
  fps: number;
  /** Filters before the matte: HDR to SDR, square pixels. */
  prefix: string;
  home: string;
};

let loaded: { model: string; matte: Promise<SubjectMatte> } | undefined;

/** The mask video's path, made if it isn't in the cache. Logs its speed. */
export async function subjectMask(
  job: MaskJob,
  log: (m: string) => void = () => {},
): Promise<string> {
  const model = join(job.home, "models", MODNET_FILE.file);
  if (!existsSync(model)) {
    throw new Error(
      "A subject mask needs MODNet: run `mockingbird models pull modnet` (26 MB), then render again.",
    );
  }
  const key = createHash("sha256")
    .update(
      [job.path, statSync(job.path).mtimeMs, job.from, job.to, job.size, MODNET_FILE.sha256].join(
        "|",
      ),
    )
    .digest("hex")
    .slice(0, 16);
  const dir = join(job.home, "cache", "masks");
  const file = join(dir, `${key}.mkv`);
  if (existsSync(file)) return file;
  mkdirSync(dir, { recursive: true });
  if (loaded?.model !== model) loaded = { model, matte: SubjectMatte.load(model) };
  const matte = await loaded.matte;

  const [w = 1, h = 1] = job.size.split("x").map(Number);
  const { width, height } = matteSize(w, h);
  const part = `${file}.${process.pid}-${Date.now()}.part.mkv`;
  const started = performance.now();
  const decode = Bun.spawn(
    [
      ...["ffmpeg", "-nostdin", "-loglevel", "error"],
      ...["-ss", String(job.from), "-t", String(job.to - job.from), "-i", job.path, "-an"],
      ...["-vf", `${job.prefix}scale=${width}:${height},format=rgb24`],
      ...["-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const encode = Bun.spawn(
    [
      ...["ffmpeg", "-nostdin", "-loglevel", "error", "-y"],
      ...["-f", "rawvideo", "-pix_fmt", "gray", "-s", `${width}x${height}`, "-r", String(job.fps)],
      ...["-i", "-", "-c:v", "ffv1", part],
    ],
    { stdin: "pipe", stderr: "pipe" },
  );
  const frame = new Uint8Array(width * height * 3);
  let filled = 0;
  let frames = 0;
  try {
    for await (const chunk of decode.stdout) {
      let at = 0;
      while (at < chunk.length) {
        const n = Math.min(frame.length - filled, chunk.length - at);
        frame.set(chunk.subarray(at, at + n), filled);
        filled += n;
        at += n;
        // ponytail: every frame through MODNet, about 250 ms each on an M3's CPU;
        // matte every other frame and let the mask hold if long clips need it faster.
        if (filled === frame.length) {
          encode.stdin.write(await matte.matte(frame, width, height));
          filled = 0;
          frames++;
        }
      }
    }
    await encode.stdin.end();
    const [dc, ec] = await Promise.all([decode.exited, encode.exited]);
    if (dc !== 0 || ec !== 0 || !frames) {
      const why = `${await new Response(decode.stderr).text()}${await new Response(encode.stderr).text()}`;
      throw new Error(`couldn't make a subject mask of ${job.path}: ${why.trim() || "no frames"}`);
    }
    renameSync(part, file);
  } catch (error) {
    decode.kill();
    encode.kill();
    rmSync(part, { force: true });
    throw error;
  }
  const s = (performance.now() - started) / 1000;
  log(`subject mask: ${frames} frames of ${job.path} at ${width}x${height} in ${s.toFixed(1)} s`);
  return file;
}
