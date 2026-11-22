/** The look and motion tools' descriptions and input schemas, and the look tool's board check. */
import { within } from "../mcp/args.ts";
import type { Board } from "./look.ts";

export const LOOK_DESCRIPTION =
  'Shows a look before editing starts (guide("look")): `file` is a style module you wrote for this video (.ts or .js) whose default export is { id, name, category, make(ctx, t, m) } returning the pieces every style draws (surface, title, label, node, box, link, store, stat, mark, finish), with any of your own beside them. It can import the styles and their helpers from "STYLES" and the kit from "KIT". The look is built into `<name>.look.js` beside it and drawn on a board, then saved as a clip and a sheet of twelve stills for the user to approve. Write the board yourself as `page`, an HTML page that imports the look `from "LOOK"` and shows the real content of the video in it (its subjects, its words, over the footage as `path`). Without a `page`, a generic storyboard of the words in `board` is drawn, which only checks that the pieces work. Runs in the pinned headless Chrome with no network. A mistake in the look comes back with its line.';

export const LOOK_INPUT = {
  type: "object",
  properties: {
    file: { type: "string", description: "Absolute path to the look (.ts or .js)" },
    board: {
      type: "object",
      description:
        "Words from the video: title (up to 60 characters), points (up to three labels of up to 24), stat { value, unit, label } for its key number",
      properties: {
        title: { type: "string" },
        points: { type: "array", items: { type: "string" } },
        stat: {
          type: "object",
          properties: {
            value: { type: "number" },
            unit: { type: "string" },
            label: { type: "string" },
          },
        },
      },
    },
    page: {
      type: "string",
      description:
        'Absolute path to your own board page (.html) that imports the look `from "LOOK"` (and "KIT" or "STYLES" if it likes) and draws the video\'s real content in it. Without one, a generic storyboard of `board` is drawn',
    },
    path: {
      type: "string",
      description:
        "Absolute path to a video for the board to draw over (the page gets its frames as m.video)",
    },
    duration: { type: "number", description: "Seconds, 1 to 60 (default 8.5)" },
    size: {
      type: "string",
      description: 'WIDTHxHEIGHT (default "1920x1080"; "1080x1920" for a short)',
    },
    out: {
      type: "string",
      description: "Absolute path for the clip (default beside the look)",
    },
  },
  required: ["file"],
};

export const MOTION_DESCRIPTION =
  "Motion graphics written as code. `script` is an HTML page, rendered in a pinned headless Chrome at the video's size, with a transparent background: any HTML, CSS, SVG, fonts and images by relative path. For each frame at `t` seconds, every CSS animation, transition and Web Animation is set to `t` (stylesheet animations start at 0, so time them with animation-delay; one started later runs from when it started), requestAnimationFrame callbacks run with performance.now() and Date.now() frozen at `t`, and `mockingbird.draw(t, m)`, if the page sets it, is called and awaited. The global `mockingbird` (also `m`) has width, height, fps, duration, frame and cues, and is there before the page's own scripts run, so a page can build captions from cues as it loads. Sound: set `mockingbird.audio = [{ path, at, volume, loop, duck }]` (paths from the page's folder), mixed in as render's audio is, ducked under any speech if `duck`, and brought to -14 LUFS. With `path` (usually render's output), the page is laid over each frame of that video, whose sound is kept; or, if the page sets `mockingbird.drawVideo = true`, it gets each frame as `m.video` (an ImageBitmap) before draw and draws the whole picture itself, e.g. ctx.drawImage(m.video, ...) on a <canvas> to zoom, shake, cut between framings or make a picture-in-picture. setTimeout runs in real time, so don't time anything with it; Math.random is seeded, the same every render. Without `path`, give `size` and `duration`. Saves to `out` or <name>-motion-N.mp4 and never overwrites. The page runs in a sandbox with no network access.";

export const MOTION_INPUT = {
  type: "object",
  properties: {
    script: {
      type: "string",
      description: "Absolute path to the .html page",
    },
    path: { type: "string", description: "Absolute path to a video to draw over" },
    captions: { type: "string", description: "SRT for m.cues, timed to the video" },
    size: { type: "string", description: "WIDTHxHEIGHT without `path` (default 1080x1920)" },
    duration: { type: "number", description: "Seconds; without `path`, required" },
    fps: { type: "number", description: "Frames a second, 1-120 (default 30)" },
    out: { type: "string", description: "Absolute path for the MP4" },
  },
  required: ["script"],
};

/** `v` as board words, or an error naming what's wrong. */
export function boardFrom(v: unknown): Board {
  const o = (v ?? {}) as Record<string, unknown>;
  if (typeof o !== "object" || Array.isArray(o)) throw new Error("board must be an object");
  const short = (s: unknown, what: string, max: number) => {
    if (typeof s !== "string" || !s.trim()) throw new Error(`${what} must be some words`);
    const t = s.trim();
    if (t.length > max) throw new Error(`${what} is ${t.length} characters; keep it to ${max}`);
    return t;
  };
  const points = o.points ?? [];
  if (!Array.isArray(points) || points.length > 3) {
    throw new Error("board.points must be a list of up to three labels");
  }
  // null is no stat, as a client leaving it out often sends it.
  const stat = (o.stat ?? undefined) as Record<string, unknown> | undefined;
  if (stat !== undefined && (typeof stat !== "object" || Array.isArray(stat))) {
    throw new Error("board.stat must be { value, unit?, label? }");
  }
  return {
    title: o.title === undefined ? "Your video" : short(o.title, "board.title", 60),
    points: points.map((p, i) => short(p, `board.points[${i}]`, 24)),
    stat:
      stat === undefined
        ? undefined
        : {
            value: within(stat.value, -1e9, 1e9, "board.stat.value"),
            unit: stat.unit === undefined ? undefined : short(stat.unit, "board.stat.unit", 4),
            label: stat.label === undefined ? undefined : short(stat.label, "board.stat.label", 24),
          },
  };
}
