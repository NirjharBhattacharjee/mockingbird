import type { CaptionStyle } from "@mockingbird/captions";
import type { PageFont } from "@mockingbird/motion";
import { findChrome, fontFaces } from "../models.ts";

/** The pinned fonts for drawing captions: whichever are downloaded. */
export function captionFonts(_lines: string[], _style: CaptionStyle): PageFont[] {
  return fontFaces();
}

/**
 * A warning for render's result when the captions' font isn't downloaded:
 * they're drawn in a fallback, not refused (#276; degrade, don't break).
 */
export function captionFontWarning(captions: string | undefined, style: CaptionStyle): string {
  if (!captions?.trim() || !findChrome() || fontFaces().some((f) => f.family === style.font))
    return "";
  return `. Warning: the captions' font, ${style.font}, isn't downloaded, so they're drawn in a fallback font; run \`mockingbird models pull chrome\``;
}
