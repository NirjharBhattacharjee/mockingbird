// screen_render and screen_normalize take these: kept out of tools.ts for its size.

export const RENDER_INPUT = {
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
};

export const NORMALIZE_INPUT = {
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
};
