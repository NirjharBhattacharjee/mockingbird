import type { Tool } from "../mcp/types.ts";
import { MAX_SAMPLES, MAX_SECONDS } from "./inspection/common.ts";
import { screenChanges, screenFrames } from "./inspection/frames.ts";
import { screenPrivacy } from "./inspection/privacy.ts";
import { screenWatch } from "./inspection/watch.ts";
import { length, type Motion, normalizeRecording, pixels, renderRecording } from "./render.ts";

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
                kind: {
                  type: "string",
                  enum: ["blur", "mask", "spotlight", "click", "box", "text"],
                },
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
      run: renderRecording(motion, pixels),
    },
    {
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
      run: normalizeRecording(length),
    },
  ];
}
