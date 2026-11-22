// The input schemas of the inspect tools, kept out of tools.ts for its size.

const path = { type: "string", description: "Absolute path to the file" };

export const INPUT = {
  measure: { type: "object", properties: { path }, required: ["path"] },
  frames: {
    type: "object",
    properties: {
      path,
      every: { type: "number", description: "Seconds between stills" },
      from: { type: "number", description: "Start, in seconds from the start of the file" },
      to: { type: "number", description: "End, in seconds from the start of the file" },
    },
    required: ["path"],
  },
  scenes: {
    type: "object",
    properties: {
      path,
      from: { type: "number", description: "Start, in seconds from the start of the file" },
      to: { type: "number", description: "End, in seconds from the start of the file" },
      threshold: {
        type: "number",
        minimum: 0,
        maximum: 100,
        description: "0-100 (default 10)",
      },
    },
    required: ["path"],
  },
  scopes: {
    type: "object",
    properties: {
      path,
      from: { type: "number", description: "Start, in seconds from the start of the file" },
      to: { type: "number", description: "End, in seconds (default the end)" },
      every: { type: "number", description: "Seconds between frames (default 1)" },
    },
    required: ["path"],
  },
  pauses: {
    type: "object",
    properties: {
      path,
      from: { type: "number", description: "Start, in seconds from the start of the file" },
      to: { type: "number", description: "End, in seconds (default the end)" },
      noise: {
        type: "number",
        description: "Quieter than this is a pause, in dB (default -35)",
      },
      shortest: {
        type: "number",
        description: "Shortest pause to report, in seconds (default 0.25)",
      },
      minPause: {
        type: "number",
        description: "Shortest pause to cut, in seconds (default 0.4)",
      },
      margin: {
        type: "number",
        description: "Kept into each cut pause, in seconds (default 0.15)",
      },
    },
    required: ["path"],
  },
  audio_stats: {
    type: "object",
    properties: {
      path,
      from: { type: "number", description: "Start, in seconds from the start of the file" },
      to: { type: "number", description: "End, in seconds from the start of the file" },
    },
    required: ["path"],
  },
  sync: {
    type: "object",
    properties: {
      paths: {
        type: "array",
        items: { type: "string" },
        description: "The recordings, the first as the reference",
      },
      window: {
        type: "number",
        description: "Seconds of each to compare (default 120); offsets up to half of it are found",
      },
    },
    required: ["paths"],
  },
  track: {
    type: "object",
    properties: {
      path: { type: "string" },
      from: { type: "number", description: "Seconds where the box is given" },
      to: { type: "number", description: "Seconds to follow it to" },
      box: {
        type: "object",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          w: { type: "number" },
          h: { type: "number" },
        },
        required: ["x", "y", "w", "h"],
      },
    },
    required: ["path", "from", "to", "box"],
  },
};
