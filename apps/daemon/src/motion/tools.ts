import { resolve } from "node:path";
import { seconds, within } from "../mcp/args.ts";
import type { Tool } from "../mcp/types.ts";
import { lookBoard } from "./look.ts";
import {
  boardFrom,
  LOOK_DESCRIPTION,
  LOOK_INPUT,
  MOTION_DESCRIPTION,
  MOTION_INPUT,
} from "./motion.schema.ts";
import type { Host, Motion } from "./run.ts";

const path = (v: unknown) => (v === undefined ? undefined : resolve(String(v)));
const text = (v: unknown) => (v === undefined ? undefined : String(v));

/** The look and motion tools; `host` is render's side of a draw (output names, mixing). */
export function motionTools(motion: Motion, host: Host): Tool[] {
  return [
    {
      name: "look",
      description: LOOK_DESCRIPTION,
      inputSchema: LOOK_INPUT,
      run: (a) =>
        lookBoard(motion, host, resolve(String(a.file)), boardFrom(a.board), {
          size: text(a.size),
          duration: within(a.duration, 1, 60, "duration", 8.5),
          out: path(a.out),
          page: path(a.page),
          path: path(a.path),
        }),
    },
    {
      name: "motion",
      description: MOTION_DESCRIPTION,
      inputSchema: MOTION_INPUT,
      run: (a) =>
        motion(resolve(String(a.script)), {
          path: path(a.path),
          size: text(a.size),
          duration: seconds(a.duration),
          fps: Math.round(within(a.fps, 1, 120, "fps", 30)),
          captions: text(a.captions),
          out: path(a.out),
        }),
    },
  ];
}
