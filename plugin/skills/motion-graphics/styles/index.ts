// Every explainer style, by id. Written by `bun run styles` from the files in
// this folder; don't edit by hand.
import type { Look, Style } from "./look.ts";
import comic from "./comic.ts";
import whiteboard from "./whiteboard.ts";

export type { Look, Style };
export const STYLES: Record<string, Style> = {
  "comic": comic,
  "whiteboard": whiteboard,
};

/** The Look for `id` this frame: style("whiteboard", ctx, t, m).title("How AI learns"). */
export function style(id: string, ctx: any, t: number, m: any): Look {
  const s = STYLES[id];
  if (!s) throw new Error(`No style "${id}". Styles: ${Object.keys(STYLES).join(", ")}`);
  return s.make(ctx, t, m);
}
