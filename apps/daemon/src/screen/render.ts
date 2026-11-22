import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ScreenOptions, screenPage } from "@mockingbird/motion";
import {
  hasEncodedPixelCoordinates,
  MAX_SIDE,
  normalizeScreen,
  probeVideoMetadata,
} from "@mockingbird/video";

/** What the screen tools need to know of a recording, read in five minutes at most. */
export type Recording = {
  video: boolean;
  audio: boolean;
  seconds: number;
  sourcePixels: boolean;
  width: number;
  height: number;
};

/**
 * Reads a recording's metadata only: listing every frame would refuse a long
 * recording before `from` and `to` pick a short stretch of it.
 */
export async function probeRecording(path: string): Promise<Recording> {
  const video = await probeVideoMetadata(path, Date.now() + 5 * 60_000);
  return {
    video: true,
    audio: video.audio,
    seconds: Number(video.formatTiming.duration ?? video.videoTiming.duration),
    sourcePixels: hasEncodedPixelCoordinates(video.geometry),
    width: video.width,
    height: video.height,
  };
}

/** The recording at `path` as a new constant-rate, square-pixel MP4 (screen_normalize). */
export async function normalizeRecording(
  source: Pick<Recording, "video" | "audio" | "seconds">,
  path: string,
  options: { out: string; from?: number; to?: number; fps?: number; speed?: number },
) {
  if (!Number.isFinite(source.seconds) || source.seconds <= 0)
    throw new Error("Couldn't read how long the recording is");
  if (!source.video) throw new Error("screen_normalize needs video, not an audio-only source");
  return normalizeScreen({ path, duration: source.seconds, audio: source.audio }, options);
}

export type Motion = (
  script: string,
  options: { path?: string; out?: string; fps?: number; duration?: number },
) => Promise<string>;

/**
 * The camera keys and marks in `options` drawn over the recording at `path`
 * in Chrome, through `motion` (screen_render). Only a recording whose pixels
 * are the source's can take source-pixel marks.
 */
export async function renderRecording(
  motion: Motion,
  source: Pick<Recording, "sourcePixels" | "width" | "height">,
  render: { path: string; out: string; fps: number; duration?: number; options: ScreenOptions },
): Promise<string> {
  if (!source.sourcePixels) {
    throw new Error(
      "Source-pixel overlays require unrotated square-pixel video. Use screen_normalize first, then inspect and mark that normalized output.",
    );
  }
  // Checked before rendering: motion refuses a side over this only after starting.
  if (source.width > MAX_SIDE || source.height > MAX_SIDE) {
    throw new Error(
      `The video is ${source.width}x${source.height}; screen_render draws at most ${MAX_SIDE} a side. screen_normalize scales it down.`,
    );
  }
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-screen-"));
  try {
    const script = join(dir, "screen.html");
    writeFileSync(script, screenPage(render.options));
    const { path, out, fps, duration } = render;
    return await motion(script, { path, out, fps, duration });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
