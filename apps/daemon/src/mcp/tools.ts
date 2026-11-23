import { captionsTools } from "../captions/tools.ts";
import { effectsTools } from "../effects/tools.ts";
import { inspectTools } from "../inspect/tools.ts";
import { engineTools, motion, motionHost } from "../mcp.ts";
import { motionTools } from "../motion/tools.ts";
import { projectTools, projectTranscript } from "../project/tools.ts";
import { screenTools } from "../screen/tools.ts";
import { transcriptTools } from "../transcript/tools.ts";
import type { Tool } from "./types.ts";

/**
 * The order clients list the tools in, as it was when they all sat in mcp.ts.
 * Each domain's list is joined, then sorted to this. ponytail: delete this
 * and list the domains in order once the last tool leaves mcp.ts (#300).
 */
const ORDER = [
  ...["transcribe", "edit", "render", "captions", "look", "motion", "effects", "sync", "track"],
  ...["export", "scopes", "audio_stats", "music", "frames", "scenes", "pauses", "measure", "guide"],
  ...["status", "dictionary_list", "dictionary_add"],
];

/** Every tool, in the order clients list them: the general ones first, screen recording last. */
export function mcpTools(status: () => Promise<object>, log: (m: string) => void): Tool[] {
  const rank = (t: Tool) => ORDER.indexOf(t.name) + 1 || ORDER.length + 1;
  const general = [
    ...engineTools(status, log),
    ...captionsTools(log),
    ...effectsTools,
    ...inspectTools,
    ...motionTools(motion, motionHost),
    ...projectTools(log),
    ...transcriptTools(log, (file, choice) => projectTranscript(file, log, choice)),
  ].sort((a, b) => rank(a) - rank(b));
  return [...general, ...screenTools(motion)];
}
