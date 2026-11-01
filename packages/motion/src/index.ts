import { rmSync } from "node:fs";
import { type Canvas, createCanvas, type Picture } from "./canvas.ts";
import { ease, interpolate, spring } from "./time.ts";

export { createCanvas, Gradient, type Picture, parseColor, parseFont } from "./canvas.ts";
export { bezier, ease, interpolate, spring } from "./time.ts";

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
  const total = Math.max(1, Math.round(duration * fps));
  const size = width * height * 4;
  const raw = ["-f", "rawvideo", "-pix_fmt", "bgra"];
  const decoder = video
    ? Bun.spawn(
        [
          ...["ffmpeg", "-nostdin", "-loglevel", "error", "-i", video],
          ...["-vf", `fps=${fps},scale=${width}:${height},setsar=1`, ...raw, "-"],
        ],
        { stdout: "pipe", stderr: "pipe" },
      )
    : undefined;
  const sound =
    video && audio
      ? ["-i", video, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "160k", "-shortest"]
      : [];
  const encoder = Bun.spawn(
    [
      ...["ffmpeg", "-nostdin", "-loglevel", "error", "-y"],
      ...[...raw, "-s", `${width}x${height}`, "-r", String(fps), "-i", "-"],
      ...sound,
      ...["-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p"],
      ...["-movflags", "+faststart", out],
    ],
    { stdin: "pipe", stderr: "pipe" },
  );
  const canvas = createCanvas(width, height);
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
  };
  let drawn = 0;
  const source = decoder ? framesOf(decoder.stdout, size) : undefined;
  try {
    while (drawn < total) {
      const next = source && (await source.next());
      if (next?.done) break;
      const t = drawn / fps;
      scene.frame = drawn;
      scene.video = canvas.beginFrame(next?.value);
      try {
        draw(canvas.ctx, t, scene);
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
    // Only a decoder that gave nothing has finished; one cut short is still waiting to write.
    if (decoder && drawn === 0 && (await decoder.exited) !== 0) {
      throw new Error(
        `ffmpeg couldn't read ${video}: ${(await new Response(decoder.stderr).text()).trim()}`,
      );
    }
    return drawn;
  } catch (error) {
    encoder.kill();
    rmSync(out, { force: true });
    throw error;
  } finally {
    // A decoder cut short is blocked writing frames nobody reads, and ffmpeg
    // only acts on SIGTERM between writes.
    decoder?.kill("SIGKILL");
    await source?.return(undefined);
    canvas.close();
  }
}
