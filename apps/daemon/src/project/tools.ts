import { resolve } from "node:path";
import type { Tool } from "../mcp/types.ts";
import { editProject } from "./edit.ts";
import { exportProject } from "./export.ts";

export { projectTranscript } from "./edit.ts";

/** edit and export. `log` is where hearing the clips' words reports. */
export function projectTools(log: (m: string) => void): Tool[] {
  return [
    {
      name: "edit",
      description: `Edit a project file (project.json): an edit kept between calls, whose clips can come from several sources and whose texts, b-roll and sounds stay on their clips as the cut changes. Applies \`ops\` in order, all or none, saves, and returns an outline: each clip's place in the finished video and what's on it. Makes the file if it isn't there; no ops only reads it. You can also edit the JSON by hand. Times: a clip's from/to are seconds in its source (as \`transcribe\` gives them); a text's, insert's or sound's are seconds from the start of its \`clip\` in the finished video, or of the video without one. Ops:
- {op:"add", type:"clip", path, from, to, focus?:{x,y}, zoom?, speed?, moves?, transition?, lead?, index?}: on the main track, which plays in order with no gaps (default at the end). speed: 0.25-4. moves: [{at, focus?, zoom?, ease?}], the framing by \`at\` seconds into the clip, eased ("smooth", or "linear") from the one before: a slow push-in, a move to the other speaker. transition: {type, duration}, how the clip comes in over the end of the one before: ffmpeg xfade's fade, fadeblack, fadewhite, dissolve, wipe*, slide*, smooth*, circleopen, zoomin and others. lead: a J cut (positive: the clip's sound starts that many seconds before its picture) or an L cut (negative: the clip before's sound carries on over its picture)
- {op:"add", type:"text", text, from, to, clip?, y?}: drawn like the captions, *words* yellow
- {op:"add", type:"insert", path, from, to, clip?, box?, blend?, effects?, moves?}: a picture or video over the whole frame (b-roll). box: {x, y, w, h, path?}, 0-1 of the picture, makes it a picture in the picture; path, from track, moves it with a subject. blend: screen, multiply, overlay, softlight, lighten, darken, addition or difference (whole frame only). effects: from the catalog; chromakey keys a green screen over the cut. moves: as a clip's, a Ken Burns pan over a still
- {op:"add", type:"adjust", from, to, clip?, effects}: an adjustment layer; its effects change everything under the text (clips and inserts) for its stretch, e.g. a grade over a whole section
- {op:"add", type:"audio", path, at?, clip?, volume?, loop?, duck?}: music or a sound effect under the speech. Or generated music in place of path: generator:{generator:"/abs/lofi.js", tempo?, key?, energy?, seed?, length?} (a music generator; the bed is made at render time, as long as the video from at or \`length\` seconds if given, and kept, so it isn't made again)
- {op:"remove", id}: a clip goes with everything on it, and the cut closes up
- {op:"split", id, at}: a clip in two at a source time; what's on the second half moves with it
- {op:"trim", id, from?, to?}: a clip's source times; what's on it stays on the same picture
- {op:"move", id, index}: a clip to another place in the cut
- {op:"cut_words", text, clip?, all?} or {op:"cut_words", from, to, clip?}: cut words out of the cut by quoting them from \`transcribe\` with the project (no case or punctuation needed): \`text\` must be said once (or give \`clip\`, or \`all: true\` for every time), and from/to cuts from the first words through the last, across clips. Cuts land in the pauses, 0.2 s from the words kept; clips are split, trimmed or removed to do it
- {op:"set", id, ...fields}: change an item (null clears a field); without id, the project's size ("1080x1920" makes it vertical, cropping each clip around its focus), fps, split {top, bottom} and captions {perCue?, lit?, upper?, y?, style?} (null for none; style is as render's captionStyle). Ids are given out as c1, t1, b1, a1.`,
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Absolute path to the project's .json file" },
          ops: { type: "array", items: { type: "object" }, description: "The ops, in order" },
        },
        required: ["project"],
      },
      run: async (a) => {
        // Unchecked, a missing project would make a file named "undefined" here.
        if (typeof a.project !== "string" || !a.project) {
          throw new Error("project must be the path to a project file");
        }
        if (!Array.isArray(a.ops ?? [])) throw new Error("ops must be a list");
        return editProject(resolve(String(a.project)), (a.ops ?? []) as unknown[], log);
      },
    },
    {
      name: "export",
      description:
        "Save a project as FCPXML 1.10 (Final Cut Pro, DaVinci Resolve, Premiere through it) and OpenTimelineIO (.otio: Resolve, Premiere, Avid through OTIO's adapters), so a person can finish the cut in an editor. Carries the clips with their source times and transitions, inserts on video tracks above, texts as titles (markers in OTIO) and sounds on audio tracks; returns what an editor can't take this way (effects, framing, generated music). Saves beside the project as <name>.fcpxml and <name>.otio, or in `out`, a folder, and never overwrites.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "The project file (project.json)" },
          format: {
            type: "string",
            enum: ["fcpxml", "otio", "both"],
            description: "Which to save (default both)",
          },
          out: { type: "string", description: "A folder to save in (default the project's)" },
        },
        required: ["project"],
      },
      run: async (a) =>
        exportProject(resolve(String(a.project)), String(a.format ?? "both"), a.out),
    },
  ];
}
