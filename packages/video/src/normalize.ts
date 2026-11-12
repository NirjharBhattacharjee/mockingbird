import { constants, copyFileSync, existsSync, linkSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tempo } from "@mockingbird/audio";

export type NormalizationSource = { path: string; duration: number; audio: boolean };
export type NormalizationOptions = {
  out: string;
  from?: number;
  to?: number;
  fps?: number;
  speed?: number;
};

function publish(temp: string, out: string) {
  try {
    linkSync(temp, out);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "EEXIST") throw new Error("Output already exists; choose a new path");
    if (!["EPERM", "EOPNOTSUPP", "ENOTSUP", "EXDEV"].includes(String(code))) throw error;
    try {
      copyFileSync(temp, out, constants.COPYFILE_EXCL);
    } catch (copyError) {
      if (copyError instanceof Error && "code" in copyError && copyError.code === "EEXIST")
        throw new Error("Output already exists; choose a new path");
      throw copyError;
    }
  }
}

/** Rebuild held frames before trimming; publish only a complete new MP4. */
export async function normalizeScreen(source: NormalizationSource, options: NormalizationOptions) {
  const path = resolve(source.path),
    out = resolve(options.out);
  if (!out.toLowerCase().endsWith(".mp4")) throw new Error("Output must end with .mp4");
  if (existsSync(out)) throw new Error("Output already exists; choose a new path");
  const from = options.from ?? 0,
    to = options.to ?? source.duration,
    fps = options.fps ?? 30,
    speed = options.speed ?? 1;
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from < 0 ||
    to <= from ||
    to > source.duration ||
    to - from > 7200
  )
    throw new Error("Give a valid source interval, at most 7200 seconds");
  if (
    !Number.isInteger(fps) ||
    fps < 1 ||
    fps > 120 ||
    !Number.isFinite(speed) ||
    speed < 0.25 ||
    speed > 64
  )
    throw new Error("fps must be 1–120; speed 0.25–64");
  const duration = (to - from) / speed;
  if (duration > 7200) throw new Error("Normalized output must be at most 7200 seconds");
  const dir = mkdtempSync(join(dirname(out), ".mockingbird-normalize-")),
    temp = join(dir, "video.mp4");
  try {
    const filters = [
      "scale=trunc(iw*sar/2)*2:trunc(ih/2)*2,setsar=1",
      `fps=${fps}:start_time=0:round=up`,
      `trim=start=${from}:end=${to}`,
      `setpts=(PTS-STARTPTS)/${speed}`,
      `fps=${fps}`,
    ];
    const args = [
      "ffmpeg",
      "-nostdin",
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      path,
      "-map",
      "0:v:0",
      "-vf",
      filters.join(","),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
    ];
    if (source.audio)
      args.push(
        "-map",
        "0:a:0?",
        "-af",
        `atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS,${tempo(speed)}`,
        "-c:a",
        "aac",
      );
    else args.push("-an");
    args.push("-movflags", "+faststart", temp);
    const process = Bun.spawn(args, { stdout: "ignore", stderr: "pipe" });
    const error = await new Response(process.stderr).text();
    if (await process.exited) throw new Error(`ffmpeg normalization failed: ${error.trim()}`);
    publish(temp, out);
    return {
      out,
      from,
      to,
      fps,
      speed,
      duration,
      note: "Decoded from the beginning and rebuilt the timeline before trimming. Output duration is quantized to frames.",
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
