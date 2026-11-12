import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { screenOptions, screenPage } from "@mockingbird/motion";
import { normalizeScreen } from "@mockingbird/video";

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
        path: { type: "string" },
        out: { type: "string" },
        from: { type: "number" },
        to: { type: "number" },
        fps: { type: "number" },
        speed: { type: "number" },
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
      if (!source.video) throw new Error("screen_normalize needs video, not an audio-only source");
      return JSON.stringify(
        await normalizeScreen(
          { path: resolve(a.path), duration: source.seconds, audio: source.audio },
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
  probe: (path: string) => Promise<{ sourcePixels: boolean }>,
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
          description: "Ordered {at,x,y,zoom}, seconds and source pixels; zoom1 fits the input",
          items: { type: "object" },
        },
        overlays: {
          type: "array",
          description:
            "{kind,from,to,x,y,w,h,text,color,size,radius}; text x/y in output pixels, other marks in source pixels",
          items: { type: "object" },
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
      if (!(await probe(resolve(a.path))).sourcePixels) {
        throw new Error(
          "Source-pixel overlays require unrotated square-pixel video. Use screen_normalize first, then inspect and mark that normalized output.",
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
