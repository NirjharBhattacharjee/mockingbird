// Motion graphics as HTML pages, rendered frame by frame in a pinned headless Chrome.

/** A caption or other timed text, in seconds of the finished video. */
export type Cue = { start: number; end: number; text: string };

export { type Chrome, launchChrome } from "./chrome.ts";
export { type PageFont, type PageScene, pageFonts, renderHtml } from "./html.ts";
export { type MusicParams, renderMusic } from "./music.ts";
export {
  type CameraKey,
  cameraAt,
  type ScreenMark,
  type ScreenOptions,
  screenOptions,
  screenPage,
} from "./screen.ts";
