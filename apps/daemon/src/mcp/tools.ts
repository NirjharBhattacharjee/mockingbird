import { engineTools, motion } from "../mcp.ts";
import { screenTools } from "../screen/tools.ts";
import type { Tool } from "./types.ts";

/** Every tool, in the order clients list them: the general ones first, screen recording last. */
export function mcpTools(status: () => Promise<object>, log: (m: string) => void): Tool[] {
  return [...engineTools(status, log), ...screenTools(motion)];
}
