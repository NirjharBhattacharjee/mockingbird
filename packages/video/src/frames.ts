import { join } from "node:path";
import { runBoundedProcess } from "./process.ts";
import type { VideoSource } from "./source.ts";
import type { FrameSample } from "./timestamps.ts";

const MAX_SOURCE_PIXELS = 320_000_000;

function selection(samples: FrameSample[]) {
  const indices = [...new Set(samples.map((s) => s.index))].sort((a, b) => a - b);
  return { indices, filter: `select=${indices.map((n) => `eq(n\\,${n})`).join("+")}` };
}

export async function decodePngFrames(
  source: VideoSource,
  samples: FrameSample[],
  dir: string,
  deadline: number,
): Promise<Map<number, string>> {
  if (source.width * source.height * samples.length > MAX_SOURCE_PIXELS)
    throw new Error("Too many full-resolution pixels; request fewer samples at once.");
  const { indices, filter } = selection(samples);
  await runBoundedProcess(
    [
      "ffmpeg",
      "-nostdin",
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe",
      "-noautorotate",
      "-i",
      source.path,
      "-map",
      "0:v:0",
      "-an",
      "-vf",
      filter,
      "-fps_mode",
      "passthrough",
      "-start_number",
      "0",
      join(dir, "frame-%06d.png"),
    ],
    deadline,
  );
  return new Map(indices.map((n, i) => [n, join(dir, `frame-${String(i).padStart(6, "0")}.png`)]));
}

export async function decodeScaledFrames(
  source: VideoSource,
  samples: FrameSample[],
  width: number,
  height: number,
  deadline: number,
): Promise<Map<number, Buffer>> {
  const { indices, filter } = selection(samples);
  const bytes = width * height * 3;
  const raw = await runBoundedProcess(
    [
      "ffmpeg",
      "-nostdin",
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe",
      "-noautorotate",
      "-i",
      source.path,
      "-map",
      "0:v:0",
      "-an",
      "-vf",
      `${filter},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,format=rgb24`,
      "-fps_mode",
      "passthrough",
      "-threads:v",
      "1",
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    deadline,
    bytes * indices.length + 1,
  );
  if (raw.length !== bytes * indices.length)
    throw new Error("ffmpeg returned an incomplete frame set.");
  return new Map(indices.map((n, i) => [n, raw.subarray(i * bytes, (i + 1) * bytes)]));
}
