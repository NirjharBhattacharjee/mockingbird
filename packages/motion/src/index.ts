import { rmSync } from "node:fs";
import type { Subprocess } from "bun";
import { type Canvas, createCanvas, type Picture } from "./canvas.ts";
import { Path2D } from "./path2d.ts";
import { ease, interpolate, spring } from "./time.ts";

export { createCanvas, Gradient, type Picture, parseColor, parseFont } from "./canvas.ts";
export { type FilterStep, parseFilter } from "./filter.ts";
export { Path2D } from "./path2d.ts";
export { bezier, ease, interpolate, spring } from "./time.ts";

// A global, as a browser has it, so a script can make paths at its top level, when it's imported.
(globalThis as { Path2D?: unknown }).Path2D ??= Path2D;

/** A caption or other timed text, in seconds of the finished video. */
export type Cue = { start: number; end: number; text: string };

/** What a motion script's `draw` gets as `m`, besides the canvas and the time. */
export type Scene = {
  width: number;
  height: number;
  fps: number;
  duration: number;
  /** This frame's number, from 0. */
  frame: number;
  /** The source video's frame, already drawn under everything; draw it again to move or zoom it. */
  video: Picture | undefined;
  cues: Cue[];
  /** A picture file, read once. */
  image: (path: string) => Picture;
  interpolate: typeof interpolate;
  spring: typeof spring;
  ease: typeof ease;
  /** Path2D, also set as a global, as a browser has it: a script is one file with no imports. */
  Path2D: typeof Path2D;
};

/** A motion script: draws the frame `t` seconds in. */
export type Draw = (ctx: Canvas["ctx"], t: number, m: Scene) => void;

/** Reads `stream` as frames of `size` bytes, into one buffer reused for each. */
async function* framesOf(stream: ReadableStream<Uint8Array>, size: number) {
  const frame = new Uint8Array(size);
  let have = 0;
  for await (const chunk of stream) {
    for (let at = 0; at < chunk.length; ) {
      const take = Math.min(size - have, chunk.length - at);
      frame.set(chunk.subarray(at, at + take), have);
      have += take;
      at += take;
      if (have === size) {
        yield frame;
        have = 0;
      }
    }
  }
}

/**
 * Draws `draw` once per frame and encodes the frames to `out` as H.264. With
 * `video`, each frame of it (scaled to the canvas) is drawn first and its
 * sound is kept; the result is as long as the shorter of it and `duration`.
 * Without, the canvas starts each frame transparent, which encodes as black.
 * Returns how many frames were drawn.
 */
export async function renderMotion(
  draw: Draw,
  {
    out,
    width,
    height,
    fps,
    duration,
    video,
    audio = false,
    cues = [],
  }: {
    out: string;
    width: number;
    height: number;
    fps: number;
    duration: number;
    video?: string;
    /** Whether `video` has sound to keep. */
    audio?: boolean;
    cues?: Cue[];
  },
): Promise<number> {
  const total = Math.round(duration * fps);
  if (!(Number.isFinite(total) && total >= 1)) {
    throw new Error(
      `duration × fps must come to at least one frame; got ${duration} s at ${fps} fps`,
    );
  }
  const size = width * height * 4;
  const raw = ["-f", "rawvideo", "-pix_fmt", "bgra"];
  let canvas: Canvas | undefined;
  let decoder: Subprocess<"ignore", "pipe", "pipe"> | undefined;
  let encoder: Subprocess<"pipe", "ignore", "pipe"> | undefined;
  let source: AsyncGenerator<Uint8Array> | undefined;
  let drawn = 0;
  try {
    // The canvas first: if Core Graphics can't be loaded, no ffmpeg is left waiting.
    canvas = createCanvas(width, height);
    const sound =
      video && audio
        ? ["-i", video, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "160k", "-shortest"]
        : [];
    encoder = Bun.spawn(
      [
        ...["ffmpeg", "-nostdin", "-loglevel", "error", "-y"],
        ...[...raw, "-s", `${width}x${height}`, "-r", String(fps), "-i", "-"],
        ...sound,
        ...["-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p"],
        ...["-movflags", "+faststart", out],
      ],
      { stdin: "pipe", stderr: "pipe" },
    );
    if (video) {
      decoder = Bun.spawn(
        [
          ...["ffmpeg", "-nostdin", "-loglevel", "error", "-i", video],
          ...["-vf", `fps=${fps},scale=${width}:${height},setsar=1`, ...raw, "-"],
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      source = framesOf(decoder.stdout, size);
    }
    const scene: Scene = {
      width,
      height,
      fps,
      duration: total / fps,
      frame: 0,
      video: undefined,
      cues,
      image: canvas.image,
      interpolate,
      spring,
      ease,
      Path2D,
    };
    while (drawn < total) {
      const next = source && (await source.next());
      if (next?.done) {
        // The video ran out: fine if ffmpeg read it all, a failure if it gave up.
        if (decoder && (await decoder.exited) !== 0) {
          const why = (await new Response(decoder.stderr).text()).trim();
          throw new Error(`ffmpeg stopped reading ${video} after ${drawn} frames: ${why}`);
        }
        break;
      }
      const t = drawn / fps;
      scene.frame = drawn;
      scene.video = canvas.beginFrame(next?.value);
      try {
        const result: unknown = draw(canvas.ctx, t, scene);
        if (result instanceof Promise) {
          result.catch(() => {});
          throw new Error("draw must be a plain function, not async: each frame is drawn at once");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`draw failed at ${t.toFixed(2)} s (frame ${drawn}): ${message}`);
      } finally {
        canvas.endFrame();
      }
      encoder.stdin.write(canvas.pixels);
      await encoder.stdin.flush();
      drawn++;
    }
    await encoder.stdin.end();
    if ((await encoder.exited) !== 0) {
      throw new Error(
        `ffmpeg couldn't encode ${out}: ${(await new Response(encoder.stderr).text()).trim()}`,
      );
    }
    return drawn;
  } catch (error) {
    // ffmpeg acts on SIGTERM only between writes, so a blocked one needs SIGKILL.
    encoder?.kill("SIGKILL");
    await encoder?.exited;
    rmSync(out, { force: true });
    throw error;
  } finally {
    // A decoder cut short is blocked writing frames nobody reads.
    decoder?.kill("SIGKILL");
    await source?.return(undefined);
    canvas?.close();
  }
}

export { type Chrome, launchChrome } from "./chrome.ts";
export { renderHtml } from "./html.ts";
