import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { screenOptions, screenPage } from "@mockingbird/motion";
import {
  hasEncodedPixelCoordinates,
  MAX_SIDE,
  normalizeScreen,
  probeVideoMetadata,
} from "@mockingbird/video";

/** What screen_render needs to know of its input, read in five minutes at most. */
export async function pixels(input: string) {
  const video = await probeVideoMetadata(input, Date.now() + 5 * 60_000);
  return {
    sourcePixels: hasEncodedPixelCoordinates(video.geometry),
    width: video.width,
    height: video.height,
  };
}

/**
 * How long screen_normalize's input is, and whether it has sound. Metadata
 * only: listing every frame would refuse a long recording before `from` and
 * `to` pick a short stretch of it.
 */
export async function length(input: string) {
  const video = await probeVideoMetadata(input, Date.now() + 5 * 60_000);
  return {
    video: true,
    audio: video.audio,
    seconds: Number(video.formatTiming.duration ?? video.videoTiming.duration),
  };
}

export type NormalizeProbe = (
  path: string,
) => Promise<{ audio: boolean; seconds: number; video: boolean }>;

/** screen_normalize: the recording at `path` as a new constant-rate, square-pixel MP4. */
export function normalizeRecording(probe: NormalizeProbe) {
  return async (a: Record<string, unknown>) => {
    if (typeof a.path !== "string" || typeof a.out !== "string")
      throw new Error("Give path and new out.mp4");
    for (const key of ["from", "to", "fps", "speed"])
      if (a[key] !== undefined && typeof a[key] !== "number")
        throw new Error(`${key} must be a number`);
    const source = await probe(resolve(a.path));
    if (!Number.isFinite(source.seconds) || source.seconds <= 0)
      throw new Error("Couldn't read how long the recording is");
    if (!source.video) throw new Error("screen_normalize needs video, not an audio-only source");
    return JSON.stringify(
      await normalizeScreen(
        {
          path: resolve(a.path),
          duration: source.seconds,
          audio: source.audio,
        },
        {
          out: a.out,
          from: a.from as number | undefined,
          to: a.to as number | undefined,
          fps: a.fps as number | undefined,
          speed: a.speed as number | undefined,
        },
      ),
    );
  };
}

export type Motion = (
  script: string,
  options: { path?: string; out?: string; fps?: number; duration?: number },
) => Promise<string>;
export type RenderProbe = (
  path: string,
) => Promise<{ sourcePixels: boolean; width: number; height: number }>;

/** screen_render: the camera keys and marks drawn over the recording in Chrome, through `motion`. */
export function renderRecording(motion: Motion, probe: RenderProbe) {
  return async (a: Record<string, unknown>) => {
    if (typeof a.path !== "string" || typeof a.out !== "string")
      throw new Error("path and out are required");
    const fps = a.fps ?? 30,
      duration = a.duration;
    if (typeof fps !== "number" || !Number.isInteger(fps) || fps < 1 || fps > 120)
      throw new Error("fps must be 1–120");
    if (
      duration !== undefined &&
      (typeof duration !== "number" ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > 7200)
    )
      throw new Error("duration must be positive and at most 7200 seconds");
    const options = screenOptions(a);
    const source = await probe(resolve(a.path));
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
      writeFileSync(script, screenPage(options));
      return await motion(script, {
        path: resolve(a.path),
        out: resolve(a.out),
        fps,
        duration: duration as number | undefined,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}
