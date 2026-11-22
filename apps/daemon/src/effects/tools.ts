import type { Tool } from "../mcp/types.ts";
import { catalog } from "./catalog.ts";

/** The effects catalog, as text. Effects themselves go on clips through `edit` and `render`. */
export const effectsTools: Tool[] = [
  {
    name: "effects",
    description:
      "The effects catalog: each effect's name, whether it's on the picture or the sound, and its settings with their ranges and defaults. Put effects on a project's clip with edit's {op:\"set\", id, effects:[{name:\"color\", exposure:0.5}, {name:\"denoise\", amount:0.4}]}, or on render's clips (effects: [...]). They apply in order, after the clip's framing; check a grade with `scopes`.",
    inputSchema: { type: "object", properties: {} },
    run: async () => catalog(),
  },
];
