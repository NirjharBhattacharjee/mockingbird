// Motion graphics as HTML pages, rendered frame by frame in a pinned headless Chrome.

/** A caption or other timed text, in seconds of the finished video. */
export type Cue = { start: number; end: number; text: string };

export { type PageScene, renderHtml } from "./html.ts";
