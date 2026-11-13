import { MAX_SAMPLES, MAX_SECONDS } from "./screen-inspection/common.ts";
import { screenChanges, screenFrames } from "./screen-inspection/frames.ts";
import { screenPrivacy } from "./screen-inspection/privacy.ts";
import { screenWatch } from "./screen-inspection/watch.ts";

type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  run: (args: Record<string, unknown>) => Promise<string>;
};

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

export function screenTools(): Tool[] {
  return [
    {
      name: "screen_frames",
      description:
        "Extract full-resolution frames displayed at requested playback times, including long-held variable-rate frames. Creates a new directory. Returns requested time, selected playback time and source presentation timestamp (PTS). Requires square pixels and no rotation.",
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
        "Compare sampled screen pixels and report changes with timestamps and scores, not clicks. Changes between samples may be missed. Requires square pixels and no rotation.",
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
        "Create a new timestamped PNG contact sheet and measure integrated loudness for each section. Sampled stills and measured sound do not replace watching or listening. Requires square pixels and no rotation.",
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
  ];
}
