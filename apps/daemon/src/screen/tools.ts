import { resolve } from "node:path";
import { screenOptions } from "@mockingbird/motion";
import type { Tool } from "../mcp/types.ts";
import { MAX_SAMPLES, MAX_SECONDS } from "./inspection/common.ts";
import { screenChanges, screenFrames } from "./inspection/frames.ts";
import { screenPrivacy } from "./inspection/privacy.ts";
import { screenWatch } from "./inspection/watch.ts";
import { type Motion, normalizeRecording, probeRecording, renderRecording } from "./render.ts";
import { NORMALIZE_INPUT, RENDER_INPUT } from "./screen.schema.ts";

const pathSchema = { type: "string", description: "Absolute local video path" };
const rangeSchema = {
  from: { type: "number", minimum: 0 },
  to: { type: "number", minimum: 0 },
  every: {
    type: "number",
    minimum: 0.1,
    maximum: MAX_SECONDS,
    description: "Seconds between sampled instants; default 5",
  },
};

/** screen_render's arguments, checked in the order they always were, then the render. */
async function render(motion: Motion, a: Record<string, unknown>) {
  if (typeof a.path !== "string" || typeof a.out !== "string")
    throw new Error("path and out are required");
  const fps = a.fps ?? 30;
  const duration = a.duration;
  if (typeof fps !== "number" || !Number.isInteger(fps) || fps < 1 || fps > 120)
    throw new Error("fps must be 1–120");
  if (
    duration !== undefined &&
    (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0 || duration > 7200)
  )
    throw new Error("duration must be positive and at most 7200 seconds");
  const options = screenOptions(a);
  const path = resolve(a.path);
  const source = await probeRecording(path);
  return renderRecording(motion, source, { path, out: resolve(a.out), fps, duration, options });
}

/** screen_normalize's arguments, checked, then the new file's details as JSON. */
async function normalize(a: Record<string, unknown>) {
  if (typeof a.path !== "string" || typeof a.out !== "string")
    throw new Error("Give path and new out.mp4");
  for (const key of ["from", "to", "fps", "speed"])
    if (a[key] !== undefined && typeof a[key] !== "number")
      throw new Error(`${key} must be a number`);
  const { from, to, fps, speed } = a as Record<string, number | undefined>;
  const path = resolve(a.path);
  const made = await normalizeRecording(await probeRecording(path), path, {
    out: a.out,
    from,
    to,
    fps,
    speed,
  });
  return JSON.stringify(made);
}

/** The screen-recording tools; `motion` draws screen_render's page over the video. */
export function screenTools(motion: Motion): Tool[] {
  return [
    {
      name: "screen_frames",
      description:
        "Extract full-resolution frames displayed at requested playback times, including long-held variable-rate frames. Decodes from the start on every call, so for a still every few seconds of a long file `frames` is faster. Creates a new directory. Returns requested time, selected playback time and source presentation timestamp (PTS). Requires square pixels and no rotation.",
      inputSchema: {
        type: "object",
        properties: {
          path: pathSchema,
          outDir: { type: "string", description: "New absolute directory" },
          times: {
            type: "array",
            minItems: 1,
            maxItems: MAX_SAMPLES,
            items: { type: "number", minimum: 0, maximum: MAX_SECONDS },
          },
        },
        required: ["path", "outDir", "times"],
        additionalProperties: false,
      },
      run: screenFrames,
    },
    {
      name: "screen_changes",
      description:
        "Compare sampled screen pixels and report changes with timestamps and scores, not clicks. For cuts between shots use `scenes`. Changes between samples may be missed. Requires square pixels and no rotation.",
      inputSchema: {
        type: "object",
        properties: {
          path: pathSchema,
          ...rangeSchema,
          threshold: {
            type: "number",
            minimum: 0,
            maximum: 100,
            description: "Minimum mean RGB difference percent; default 5",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
      run: screenChanges,
    },
    {
      name: "screen_privacy",
      description:
        "Use local optional tesseract to find email, file-path and supplied-name rows at sampled instants. Returns input-pixel rectangles, not a privacy clearance. OCR can miss text and unsampled footage. Requires square pixels and no rotation.",
      inputSchema: {
        type: "object",
        properties: {
          path: pathSchema,
          ...rangeSchema,
          names: {
            type: "array",
            maxItems: 20,
            items: { type: "string", minLength: 1, maxLength: 100 },
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
      run: screenPrivacy,
    },
    {
      name: "screen_watch",
      description:
        "Create a new timestamped PNG contact sheet and measure integrated loudness for each section. For the full sound measurements use `audio_stats`. Sampled stills and measured sound do not replace watching or listening. Requires square pixels and no rotation.",
      inputSchema: {
        type: "object",
        properties: {
          path: pathSchema,
          out: { type: "string", description: "New absolute PNG path" },
          ...rangeSchema,
          columns: { type: "integer", minimum: 1, maximum: 6 },
        },
        required: ["path", "out"],
        additionalProperties: false,
      },
      run: screenWatch,
    },
    {
      name: "screen_render",
      description:
        "Render source-pixel camera keyframes, anchored blur/mask/spotlight/click/box overlays and output-pixel text. Uses local Chrome, no drawtext. Coordinates refer to the exact input video. Masks do not track controls moving within it. Prefer mask for irreversible privacy hiding; blur is not a privacy guarantee.",
      inputSchema: RENDER_INPUT,
      run: (a) => render(motion, a),
    },
    {
      name: "screen_normalize",
      description:
        "Decode from the beginning and rebuild held VFR states before trimming and speed changes. New constant-rate square-pixel MP4, with audio on the same timeline.",
      inputSchema: NORMALIZE_INPUT,
      run: normalize,
    },
  ];
}
