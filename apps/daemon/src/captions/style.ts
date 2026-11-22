import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CAPTION_FONTS, CAPTION_PRESETS, type CaptionStyle } from "@mockingbird/captions";
import { PLUGIN } from "../guide.ts";

/** Where caption images sit unless told: a little below the middle, where Shorts and Reels leave room for text. */
export const CAPTIONS_Y = 0.7;

/** Each motion style's typography roles (#276), from plugin/skills/motion-graphics/styles/roles.json. */
type Roles = Record<
  string,
  {
    title: { family: string };
    body: { family: string };
    ink: string;
    accent: string;
    background: string;
  }
>;
let roles: Roles | undefined;

/**
 * A caption style with `look: "<style id>"` turned into fields: the look's
 * title font if a caption can use it (its body font, or Inter, if not), and
 * its accent (or ink) for the spoken word when it's light enough to read on
 * the outline, so the approved look sets the captions with its titles.
 * Anything else given stays as given.
 */
export function lookCaptions(v: unknown, what = "captionStyle"): unknown {
  if (!v || typeof v !== "object" || !("look" in v)) return v;
  const { look, ...rest } = v as Record<string, unknown>;
  roles ??= JSON.parse(
    readFileSync(join(PLUGIN, "skills", "motion-graphics", "styles", "roles.json"), "utf8"),
  ) as Roles;
  const r = roles[String(look)];
  if (!r) throw new Error(`${what}.look: no style "${look}"; see the motion-graphics styles`);
  const usable = (f: string) => (CAPTION_FONTS as readonly string[]).includes(f);
  const font = usable(r.title.family)
    ? r.title.family
    : usable(r.body.family)
      ? r.body.family
      : "Inter";
  // Captions are light text on a black outline: a dark accent would vanish, so
  // the look's accent if it's light enough, else its ink, else the preset's.
  const light = (c: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(c)) return false;
    const n = Number.parseInt(c.slice(1), 16);
    return (
      (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 >= 0.35
    );
  };
  const accent = [r.accent, r.ink].find(light);
  // The colour goes where the preset puts its lit word: behind it on a pill
  // (the word stays dark on it), on it otherwise, and nowhere for a preset
  // with no lit word, like subtitle.
  const presets: Record<string, CaptionStyle> = CAPTION_PRESETS;
  const p = presets[String(rest.preset ?? "classic")];
  const lit = !p ? {} : p.pill ? { pill: accent } : p.active !== p.fill ? { active: accent } : {};
  return { font, ...(accent && lit), ...rest };
}
