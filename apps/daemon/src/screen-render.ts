import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { screenOptions, screenPage } from "@mockingbird/motion";
import { MAX_SIDE, normalizeScreen } from "@mockingbird/video";

export function screenNormalizeTool(
  probe: (path: string) => Promise<{ audio: boolean; seconds: number; video: boolean }>,
) {
  return {
    name: "screen_normalize",
    description:
      "Decode from the beginning and rebuild held VFR states before trimming and speed changes. New constant-rate square-pixel MP4, with audio on the same timeline.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the recording" },
        out: { type: "string", description: "New absolute .mp4 path" },
        from: { type: "number", description: "Seconds into the source; default 0" },
        to: { type: "number", description: "Seconds into the source; default the end" },
        fps: { type: "number", description: "1 to 120; default 30" },
        speed: { type: "number", description: "0.25 to 64; default 1" },
      },
      required: ["path", "out"],
    },
    run: async (a: Record<string, unknown>) => {
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
    },
  };
}

type Motion = (
  script: string,
  options: { path?: string; out?: string; fps?: number; duration?: number },
) => Promise<string>;
export function screenRenderTool(
  motion: Motion,
  probe: (path: string) => Promise<{ sourcePixels: boolean; width: number; height: number }>,
) {
  return {
    name: "screen_render",
    description:
      "Render source-pixel camera keyframes, anchored blur/mask/spotlight/click/box overlays and output-pixel text. Uses local Chrome, no drawtext. Coordinates refer to the exact input video. Masks do not track controls moving within it. Prefer mask for irreversible privacy hiding; blur is not a privacy guarantee.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        out: { type: "string" },
        fps: { type: "number" },
        duration: { type: "number" },
        easing: { type: "string", enum: ["linear", "smooth"] },
        camera: {
          type: "array",
          description:
            "Camera keys in increasing `at`, up to 200: where the view is centred (source pixels) and how far in. zoom 1 fits the input.",
          items: {
            type: "object",
            properties: {
              at: { type: "number", description: "Seconds, 0 to 7200" },
              x: { type: "number", description: "Centre x, source pixels" },
              y: { type: "number", description: "Centre y, source pixels" },
              zoom: { type: "number", description: "0.05 to 20; 1 fits the input" },
            },
            required: ["at", "x", "y", "zoom"],
          },
        },
        overlays: {
          type: "array",
          description:
            "Marks, up to 200. text x/y are output pixels; every other kind is in source pixels and moves with the camera.",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["blur", "mask", "spotlight", "click", "box", "text"] },
              from: { type: "number", description: "Seconds" },
              to: { type: "number", description: "Seconds, after from" },
              x: { type: "number" },
              y: { type: "number" },
              w: { type: "number", description: "Width, for blur, mask, spotlight and box" },
              h: { type: "number", description: "Height, for blur, mask, spotlight and box" },
              text: { type: "string", description: "For text, up to 1000 characters" },
              color: { type: "string", description: "#RRGGBB" },
              size: { type: "number", description: "Text size, 8 to 160; default 32" },
              radius: {
                type: "number",
                description: "Corner or click radius, 1 to 200; default 18",
              },
            },
            required: ["kind", "from", "to", "x", "y"],
          },
        },
      },
      required: ["path", "out"],
    },
    run: async (a: Record<string, unknown>) => {
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
    },
  };
}
