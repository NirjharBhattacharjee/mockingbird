import { type Transfer, transferOf } from "./hdr.ts";

/** Rounds down to an even number, as most codecs need. */
export const even = (n: number) => Math.trunc(n / 2) * 2;

/**
 * A path as a filter option inside a graph, escaped at both levels ffmpeg
 * parses: the option value (`\`, `'`, `:`), then the graph (`\`, `'`, `[`, `]`,
 * `,`, `;`). Quoting it instead breaks on an apostrophe: `O'Brien.cube`.
 */
export const quoted = (path: string) =>
  path.replace(/[\\':]/g, (c) => `\\${c}`).replace(/[\\'[\],;]/g, (c) => `\\${c}`);

/**
 * The streams in a media file, how long it is, its picture's size as played
 * (`WxH`, turned for a phone video recorded on its side) and short side, and
 * its frame rate.
 */
export async function probe(path: string): Promise<{
  video: boolean;
  audio: boolean;
  seconds: number;
  side: number;
  size: string;
  fps: number;
  /** The picture's codec and pixel format, e.g. "h264" and "yuv420p". */
  codec: string;
  pix: string;
  /** Its HDR transfer, or undefined for SDR. */
  transfer?: Transfer;
}> {
  const proc = Bun.spawn(
    [
      "ffprobe",
      ...["-v", "error", "-show_entries"],
      "stream=codec_type,codec_name,pix_fmt,color_transfer,width,height,sample_aspect_ratio,avg_frame_rate:stream_side_data=rotation:format=duration",
      ...["-of", "json", path],
    ],
    { stderr: "pipe" },
  );
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) {
    throw new Error(
      `ffprobe couldn't read ${path}: ${(await new Response(proc.stderr).text()).trim()}`,
    );
  }
  const { streams = [], format } = JSON.parse(out);
  type Stream = {
    codec_type: string;
    codec_name?: string;
    pix_fmt?: string;
    color_transfer?: string;
    width?: number;
    height?: number;
    sample_aspect_ratio?: string;
    avg_frame_rate?: string;
    side_data_list?: { rotation?: number }[];
  };
  const has = (type: string) => streams.some((s: Stream) => s.codec_type === type);
  const picture: Stream | undefined = streams.find((s: Stream) => s.codec_type === "video");
  const { width: w = 0, height: h = 0 } = picture ?? {};
  const [num, den] = (picture?.sample_aspect_ratio ?? "1:1").split(":").map(Number);
  const sar = num && den ? num / den : 1;
  // ffmpeg turns the picture upright as it decodes, so filters see it turned,
  // with its pixel ratio turned over too. The size is SQUARE's, so every clip matches it.
  const turned = Math.abs(picture?.side_data_list?.find((d) => d.rotation)?.rotation ?? 0) === 90;
  const [width, height] = turned ? [even(h / sar), w] : [even(w * sar), h];
  // "30000/1001"; a still picture or an odd file says "0/0".
  const [fn, fd] = (picture?.avg_frame_rate ?? "0/0").split("/").map(Number);
  const fps = fn && fd ? Number((fn / fd).toFixed(3)) : 30;
  return {
    fps,
    codec: picture?.codec_name ?? "",
    pix: picture?.pix_fmt ?? "",
    transfer: transferOf(picture?.color_transfer),
    video: has("video"),
    audio: has("audio"),
    seconds: Number(format?.duration ?? 0),
    side: Math.min(width, height),
    size: `${width}x${height}`,
  };
}
