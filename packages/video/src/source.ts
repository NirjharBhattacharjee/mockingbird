import { statSync } from "node:fs";
import { extname } from "node:path";
import { runBoundedProcess } from "./process.ts";
import {
  compareRationals,
  decimalRational,
  parseTimeBase,
  type Rational,
  rationalToNumber,
  requireFrameData,
  ticksToTime,
} from "./timestamps.ts";

export const MAX_VIDEO_SECONDS = 7200;
const MAX_FRAMES = 1_000_000;
const REFERENCE_FORMATS = new Set(["concat", "dash", "hls"]);
const REFERENCE_EXTENSIONS = new Set([".concat", ".ffconcat", ".m3u", ".m3u8", ".mpd"]);

export type VideoGeometry = {
  encoded: { width: number; height: number };
  sampleAspectRatio: string | null;
  rotationTags: string[];
  displayMatrices: { rotation: number | null; matrix: string | null }[];
};

export type VideoMetadata = {
  path: string;
  width: number;
  height: number;
  geometry: VideoGeometry;
  audio: boolean;
  videoTiming: { timeBase?: string; startPts?: number; startTime?: string; duration?: string };
  streamStarts: { timeBase?: string; startPts?: number }[];
  formatTiming: { startTime?: string; duration?: string; name?: string };
};

export type VideoSource = VideoMetadata & {
  duration: number;
  origin: number;
  originExact: Rational;
  timeBase: Rational;
  ticks: bigint[];
};

export async function probeVideoMetadata(path: string, deadline: number): Promise<VideoMetadata> {
  if (!statSync(path).isFile()) throw new Error("path must identify a local file.");
  if (REFERENCE_EXTENSIONS.has(extname(path).toLowerCase()))
    throw new Error(
      "Playlist and manifest inputs are not supported; supply a direct local media file.",
    );
  const info = JSON.parse(
    (
      await runBoundedProcess(
        [
          "ffprobe",
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-show_entries",
          "stream=codec_type,width,height,sample_aspect_ratio,start_time,start_pts,time_base,duration:stream_tags=rotate:stream_side_data=side_data_type,rotation,displaymatrix:format=start_time,duration,format_name",
          "-of",
          "json",
          path,
        ],
        deadline,
      )
    ).toString(),
  ) as {
    streams?: {
      codec_type?: string;
      width?: number;
      height?: number;
      sample_aspect_ratio?: string;
      tags?: Record<string, string>;
      side_data_list?: { side_data_type?: string; rotation?: number; displaymatrix?: string }[];
      start_time?: string;
      start_pts?: number;
      time_base?: string;
      duration?: string;
    }[];
    format?: { start_time?: string; duration?: string; format_name?: string };
  };
  const formats = (info.format?.format_name ?? "").split(",");
  if (formats.some((format) => REFERENCE_FORMATS.has(format)))
    throw new Error(
      "Playlist and manifest inputs are not supported; supply a direct local media file.",
    );
  const video = info.streams?.find((s) => s.codec_type === "video");
  if (!video?.width || !video.height) throw new Error("The file has no video stream.");
  const geometry: VideoGeometry = {
    encoded: { width: video.width, height: video.height },
    sampleAspectRatio: video.sample_aspect_ratio ?? null,
    rotationTags: Object.entries(video.tags ?? {})
      .filter(([key]) => key.toLowerCase() === "rotate")
      .map(([, value]) => value),
    displayMatrices: (video.side_data_list ?? [])
      .filter(
        (item) =>
          item.side_data_type === "Display Matrix" ||
          item.displaymatrix !== undefined ||
          item.rotation !== undefined,
      )
      .map((item) => ({ rotation: item.rotation ?? null, matrix: item.displaymatrix ?? null })),
  };
  return {
    path,
    width: video.width,
    height: video.height,
    geometry,
    audio: !!info.streams?.some((s) => s.codec_type === "audio"),
    videoTiming: {
      timeBase: video.time_base,
      startPts: video.start_pts,
      startTime: video.start_time,
      duration: video.duration,
    },
    streamStarts: (info.streams ?? []).map((s) => ({
      timeBase: s.time_base,
      startPts: s.start_pts,
    })),
    formatTiming: {
      startTime: info.format?.start_time,
      duration: info.format?.duration,
      name: info.format?.format_name,
    },
  };
}

export async function probeVideoSource(
  input: string | VideoMetadata,
  deadline: number,
): Promise<VideoSource> {
  const metadata = typeof input === "string" ? await probeVideoMetadata(input, deadline) : input;
  const { path, videoTiming, formatTiming } = metadata;
  const base = parseTimeBase(videoTiming.timeBase);
  if (!base) throw new Error("Video has no usable presentation time base.");
  if (metadata.width * metadata.height > 40_000_000)
    throw new Error("Video dimensions exceed 40 megapixels.");
  const reportedDuration = Number(formatTiming.duration);
  const frames = JSON.parse(
    (
      await runBoundedProcess(
        [
          "ffprobe",
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-select_streams",
          "v:0",
          "-show_frames",
          "-show_entries",
          "frame=pts,duration",
          "-of",
          "json",
          path,
        ],
        deadline,
      )
    ).toString(),
  ) as { frames?: { pts?: number; duration?: number }[] };
  if (!frames.frames?.length || frames.frames.length > MAX_FRAMES)
    throw new Error(`Video must have 1 to ${MAX_FRAMES} timestamped frames.`);
  if (frames.frames.some((f) => !Number.isSafeInteger(f.pts)))
    throw new Error("Video frames have missing or unordered presentation timestamps.");
  const ticks = frames.frames.map((f) => BigInt(f.pts as number));
  if (ticks.some((p, i) => i > 0 && p < requireFrameData(ticks[i - 1])))
    throw new Error("Video frames have missing or unordered presentation timestamps.");
  const start = formatTiming.startTime ?? videoTiming.startTime;
  const formatStart =
    start !== undefined && Number.isFinite(Number(start)) ? Number(start) : undefined;
  const starts = metadata.streamStarts.flatMap((s) => {
    const sbase = parseTimeBase(s.timeBase);
    return sbase && Number.isSafeInteger(s.startPts)
      ? [ticksToTime(BigInt(s.startPts as number), sbase)]
      : [];
  });
  const matching = starts.filter(
    (s) => formatStart !== undefined && Math.abs(rationalToNumber(s) - formatStart) < 0.000001,
  );
  const originExact =
    matching.sort((a, b) =>
      compareRationals(a, b) < 0n ? -1 : compareRationals(a, b) > 0n ? 1 : 0,
    )[0] ??
    (formatStart !== undefined
      ? decimalRational(formatStart)
      : ticksToTime(requireFrameData(ticks[0]), base));
  const origin = rationalToNumber(originExact);
  const lastTick = requireFrameData(ticks.at(-1));
  const lastPts = rationalToNumber(ticksToTime(lastTick, base));
  // Matroska reports its end timestamp as duration when the timeline starts above zero.
  const formatDuration =
    formatTiming.name?.split(",").includes("matroska") && origin > 0 && reportedDuration > lastPts
      ? reportedDuration - origin
      : reportedDuration;
  const videoDuration = Number(videoTiming.duration);
  const videoStart = Number.isSafeInteger(videoTiming.startPts)
    ? rationalToNumber(ticksToTime(BigInt(videoTiming.startPts as number), base))
    : Number(videoTiming.startTime);
  const videoEnd = videoStart + videoDuration - origin;
  const lastDuration = frames.frames.at(-1)?.duration;
  const lastEnd =
    Number.isSafeInteger(lastDuration) && (lastDuration as number) > 0
      ? rationalToNumber(ticksToTime(lastTick + BigInt(lastDuration as number), base)) - origin
      : lastPts - origin;
  const knownVideoEnd =
    Number.isFinite(videoEnd) && videoDuration > 0
      ? videoEnd
      : metadata.audio
        ? lastEnd
        : formatDuration;
  const duration = Math.min(formatDuration, knownVideoEnd);
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_VIDEO_SECONDS)
    throw new Error(`Video duration must be known and at most ${MAX_VIDEO_SECONDS} seconds.`);
  return {
    ...metadata,
    duration,
    origin,
    originExact,
    timeBase: base,
    ticks,
  };
}
