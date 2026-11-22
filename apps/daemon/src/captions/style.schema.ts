import { CAPTION_FONTS, CAPTION_PRESETS } from "@mockingbird/captions";

/** render's `captionStyle`, and a project's `captions.style` (#276). */
export const CAPTION_STYLE_SCHEMA = {
  description: `How the captions and texts look: a preset's name (${Object.keys(CAPTION_PRESETS).join(", ")}; default classic, white Inter 700 with a black outline and the *spoken* word yellow), or an object with \`preset\` and any of: font (${CAPTION_FONTS.join(", ")}), weight, upper (capitals, which get 0.06 em of tracking), tracking (em), fill, stroke and active (colours; active is the *spoken* word's), outline (0-0.5 of the text height), shadow, pill (a colour behind the spoken word), maxChars (about this many characters a line), pop (1-1.4: the spoken word that much bigger), keyword (the colour of a word written **like this**, drawn 15% bigger) and look (a motion style's id: its title font and accent, so the approved look sets the captions too). subtitle suits long-form; creator and pill suit Shorts.`,
  oneOf: [
    { type: "string", enum: Object.keys(CAPTION_PRESETS) },
    {
      type: "object",
      properties: {
        preset: { type: "string", enum: Object.keys(CAPTION_PRESETS) },
        font: { type: "string", enum: [...CAPTION_FONTS] },
        weight: { type: "number" },
        upper: { type: "boolean" },
        tracking: { type: "number" },
        fill: { type: "string" },
        stroke: { type: "string" },
        active: { type: "string" },
        pill: { type: "string" },
        outline: { type: "number" },
        shadow: { type: "boolean" },
        maxChars: { type: "number" },
        pop: { type: "number" },
        keyword: { type: "string" },
        look: { type: "string" },
      },
      additionalProperties: false,
    },
  ],
};
