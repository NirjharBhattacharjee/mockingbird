import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Chrome, launchChrome, type PageFont, pageFonts } from "@mockingbird/motion";

/** One caption: its text, and when it shows, in seconds. */
export type Cue = { start: number; end: number; text: string };

/** `01:02:03,450` or `02:03.45` in seconds; undefined if it isn't a time. */
function srtTime(text: string): number | undefined {
  const m = /(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})/.exec(text);
  if (!m) return undefined;
  const [, h = "0", min = "0", s = "0", ms = "0"] = m;
  return Number(h) * 3600 + Number(min) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
}

/**
 * The cues in SRT text. A cue without a time line, without text, or that
 * ends before it starts is left out. Tags like `<i>` are dropped, since the
 * captions are drawn in one style.
 */
export function parseSrt(srt: string): Cue[] {
  return srt
    .replace(/\r/g, "")
    .split(/\n[ \t]*\n/)
    .flatMap((block) => {
      const lines = block.trim().split("\n");
      const at = lines.findIndex((line) => line.includes("-->"));
      const [from = "", to = ""] = (lines[at] ?? "").split("-->");
      const start = srtTime(from);
      const end = srtTime(to);
      const text = lines
        .slice(at + 1)
        .join("\n")
        .replace(/<[^>]*>/g, "")
        .trim();
      return at >= 0 && start !== undefined && end !== undefined && end > start && text
        ? [{ start, end, text }]
        : [];
    });
}

/**
 * Text height: a share of a tall video's width, as Shorts captions are, or of
 * a wide video's height, as subtitles are (#127). A style's outline is a share of it.
 */
const TALL_TEXT = 0.075;
const WIDE_TEXT = 0.05;
/** How much of the width a line may take before it wraps: subtitles keep clear of the corners. */
const TALL_LINE = 0.9;
const WIDE_LINE = 0.6;
/** The families a caption can be set in: each one `models pull chrome` downloads (#276). */
export const CAPTION_FONTS = [
  "Inter",
  "Montserrat",
  "Anton",
  "Archivo Black",
  "Bebas Neue",
  "Oswald",
  "Bangers",
  "Space Grotesk",
  "Playfair Display",
  "Charis SIL",
] as const;

/**
 * Chinese, Japanese and Korean share Han characters, drawn in each one's own
 * shapes: the first of Noto's three a caption lists draws them (#224). By
 * the captions first: any kana is Japanese, any Hangul Korean. Han alone
 * goes by the language when it's one of the three, and Chinese otherwise.
 */
export function hanOrder(language: string | undefined, texts: string[]): string[] {
  const all = texts.join("");
  // What the captions show wins: the setting is the user's, the captions may be another language's.
  const first = /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(all)
    ? "ja"
    : /\p{Script=Hangul}/u.test(all)
      ? "ko"
      : language === "ja" || language === "ko" || language === "zh"
        ? language
        : "zh";
  return { ja: ["JP", "SC", "KR"], ko: ["KR", "JP", "SC"], zh: ["SC", "JP", "KR"] }[first];
}

/**
 * How captions look. `outline` is the stroke's share of the text height;
 * `tracking` is letter spacing in em; `active` colours a word written
 * `*like this*` (the spoken word), on a `pill` of that colour if one is set;
 * `maxChars` narrows a line to about that many characters.
 */
export type CaptionStyle = {
  font: (typeof CAPTION_FONTS)[number];
  weight: number;
  upper: boolean;
  tracking: number;
  fill: string;
  stroke: string;
  outline: number;
  shadow: boolean;
  active: string;
  pill?: string;
  maxChars?: number;
};

/**
 * Named looks. `classic` is how captions have always looked. `subtitle` is
 * restrained, for long-form: mixed case, a thin outline and a shadow, about
 * 42 characters a line (Netflix's limit), no lit word. `creator` is the
 * Shorts canon: Montserrat 900 in capitals, a thick outline, the spoken
 * word yellow. `pill` puts the spoken word on a yellow pill.
 */
export const CAPTION_PRESETS = {
  classic: {
    font: "Inter",
    weight: 700,
    upper: false,
    tracking: 0,
    fill: "#FFFFFF",
    stroke: "#000000",
    outline: 0.2,
    shadow: false,
    active: "rgb(255, 214, 0)",
  },
  subtitle: {
    font: "Inter",
    weight: 600,
    upper: false,
    tracking: 0,
    fill: "#FFFFFF",
    stroke: "#000000",
    outline: 0.08,
    shadow: true,
    active: "#FFFFFF",
    maxChars: 42,
  },
  creator: {
    font: "Montserrat",
    weight: 900,
    upper: true,
    tracking: 0.06,
    fill: "#FFFFFF",
    stroke: "#000000",
    outline: 0.28,
    shadow: true,
    active: "#FFD600",
  },
  pill: {
    font: "Montserrat",
    weight: 800,
    upper: true,
    tracking: 0.05,
    fill: "#FFFFFF",
    stroke: "#000000",
    outline: 0.16,
    shadow: false,
    active: "#111111",
    pill: "#FFD600",
  },
} satisfies Record<string, CaptionStyle>;

const COLOUR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d.,\s%/deg]+\)|[a-z]+)$/i;

/**
 * A caption style from a preset's name, or `{ preset?, ...fields }` laid
 * over that preset (default `classic`). Throws, naming `what`, on anything
 * it doesn't know. Capitals get 0.06 em of tracking unless it's given.
 */
export function captionStyle(v: unknown, what = "captionStyle"): CaptionStyle {
  const presets: Record<string, CaptionStyle> = CAPTION_PRESETS;
  const named = (name: unknown) => {
    const p = presets[String(name)];
    if (!p) {
      throw new Error(
        `${what}: no preset ${JSON.stringify(name)}; there's ${Object.keys(presets).join(", ")}`,
      );
    }
    return p;
  };
  if (v === undefined || v === null) return CAPTION_PRESETS.classic;
  if (typeof v === "string") return named(v);
  if (typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`${what} is a preset's name or an object of fields`);
  }
  const o = v as Record<string, unknown>;
  const fields = [
    "preset",
    "font",
    "weight",
    "upper",
    "tracking",
    "fill",
    "stroke",
    "outline",
    "shadow",
    "active",
    "pill",
    "maxChars",
  ];
  const unknown = Object.keys(o).filter((k) => !fields.includes(k));
  if (unknown.length)
    throw new Error(`${what}: no field ${unknown.join(", ")}; there's ${fields.join(", ")}`);
  const out: CaptionStyle = { ...named(o.preset ?? "classic") };
  const num = (k: string, lo: number, hi: number) => {
    const n = o[k];
    if (!(typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi))
      throw new Error(`${what}.${k} is a number from ${lo} to ${hi}`);
    return n;
  };
  const colour = (k: string) => {
    const c = o[k];
    if (typeof c !== "string" || !COLOUR.test(c))
      throw new Error(`${what}.${k} is a colour like #FFD600 or rgb(255, 214, 0)`);
    return c;
  };
  if (o.font !== undefined) {
    if (!(CAPTION_FONTS as readonly string[]).includes(String(o.font))) {
      throw new Error(`${what}.font is one of ${CAPTION_FONTS.join(", ")}`);
    }
    out.font = String(o.font) as CaptionStyle["font"];
  }
  if (o.weight !== undefined) out.weight = Math.round(num("weight", 100, 1000));
  const flag = (k: string) => {
    if (typeof o[k] !== "boolean") throw new Error(`${what}.${k} is true or false`);
    return o[k] as boolean;
  };
  if (o.upper !== undefined) {
    out.upper = flag("upper");
    if (out.upper && o.tracking === undefined) out.tracking = Math.max(out.tracking, 0.06);
  }
  if (o.tracking !== undefined) out.tracking = num("tracking", -0.05, 0.3);
  if (o.outline !== undefined) out.outline = num("outline", 0, 0.5);
  if (o.maxChars !== undefined) out.maxChars = Math.round(num("maxChars", 8, 80));
  if (o.shadow !== undefined) out.shadow = flag("shadow");
  for (const k of ["fill", "stroke", "active", "pill"] as const) {
    if (o[k] !== undefined) out[k] = colour(k);
  }
  return out;
}

/**
 * The style's font, then Noto for scripts it lacks (Han in `han`'s order) and
 * for emoji. No system font: one would draw differently on every machine (#276).
 */
const families = (font: string, han: string[]) =>
  [
    `"${font}"`,
    ...["Bengali", "Devanagari", "Arabic", "Hebrew", "Thai", "Tamil", ...han].map(
      (script) => `"Noto Sans ${script}"`,
    ),
    '"Noto Color Emoji"',
    "sans-serif",
  ].join(",");

/** A word, and whether it's highlighted. */
type Piece = { text: string; lit: boolean };

/** A caption's paragraphs, each its words, `*marked*` ones lit. */
export function pieces(text: string): Piece[][] {
  return text.split("\n").map((paragraph) =>
    paragraph
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => {
        const lit = /^\*[^*]+\*$/.test(word);
        return { text: lit ? word.slice(1, -1) : word, lit };
      }),
  );
}

/**
 * Draws each of `texts` into `dir` as a transparent PNG in `style` (white
 * bold text with a black outline unless told otherwise), centred, sized and
 * wrapped for a video `side` pixels wide and `height` high (9:16 if not
 * given), as wide as the video. A word written `*like this*` is drawn in the
 * style's `active` colour. A word too long for a line,
 * like a Japanese sentence with no spaces, breaks between characters.
 *
 * It's drawn as HTML in the headless Chrome at `chrome`, so captions look
 * the same on every OS; `wrap` starts Chrome inside a sandbox, and `fonts`
 * are the ones mockingbird ships (#156). `language` (a Whisper code) picks
 * which shapes Han characters take; see hanOrder. Returns the files in
 * order, or undefined if they can't be drawn.
 */
export async function drawCaptions(
  texts: string[],
  dir: string,
  side: number,
  height = (side * 16) / 9,
  {
    chrome: chromePath,
    wrap,
    fonts = [],
    language,
    style = CAPTION_PRESETS.classic,
  }: {
    chrome?: string;
    wrap?: string[];
    fonts?: PageFont[];
    language?: string;
    style?: CaptionStyle;
  } = {},
): Promise<string[] | undefined> {
  if (!chromePath) return undefined;
  const tall = height >= side;
  const size = Math.round(tall ? side * TALL_TEXT : height * WIDE_TEXT);
  const outline = size * style.outline;
  // ponytail: a character is taken as half the text height wide, so maxChars is about that many.
  const margin = Math.max(
    (side * (1 - (tall ? TALL_LINE : WIDE_LINE))) / 2,
    style.maxChars ? (side - style.maxChars * size * 0.5) / 2 : 0,
  );
  let chrome: Chrome | undefined;
  try {
    chrome = await launchChrome(chromePath, { wrap });
    // A file page when there are fonts, since only one may load them from disk.
    const folder = fonts[0] ? new URL(".", fonts[0].url).href : "about:blank";
    const { targetId } = await chrome.send<{ targetId: string }>("Target.createTarget", {
      url: folder,
    });
    const { sessionId } = await chrome.send<{ sessionId: string }>("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const send = <T>(method: string, params = {}) =>
      (chrome as Chrome).send<T>(method, params, sessionId);
    // createTarget returns before the page has loaded, and anything evaluated
    // while it's still navigating is thrown away: wait until it's there.
    for (const end = Date.now() + 15_000; ; ) {
      const at = await send<{ result: { value: string } }>("Runtime.evaluate", {
        expression: "location.href + ' ' + document.readyState",
        returnByValue: true,
      })
        .then((r) => r.result.value)
        .catch(() => "");
      if (at === `${folder} complete`) break;
      if (Date.now() > end) throw new Error(`the caption page didn't load: ${at}`);
      await Bun.sleep(20);
    }
    await send("Emulation.setDeviceMetricsOverride", {
      width: side,
      height: Math.round(height),
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Emulation.setDefaultBackgroundColorOverride", {
      color: { r: 0, g: 0, b: 0, a: 0 },
    });
    // The outline is a stroke centred on each glyph's edge with the fill painted
    // over its inner half, as Core Graphics drew it before #155.
    const css = [
      `width:${side}px`,
      "box-sizing:border-box",
      `padding:${outline}px ${margin}px`,
      "text-align:center",
      `font:${style.weight} ${size}px/normal ${families(style.font, hanOrder(language, texts))}`,
      `color:${style.fill}`,
      `-webkit-text-stroke:${outline}px ${style.stroke}`,
      "paint-order:stroke fill",
      "overflow-wrap:anywhere",
      ...(style.upper ? ["text-transform:uppercase"] : []),
      ...(style.tracking ? [`letter-spacing:${style.tracking}em`] : []),
      ...(style.shadow ? [`text-shadow:0 ${size * 0.05}px ${size * 0.2}px rgba(0,0,0,0.6)`] : []),
    ].join(";");
    // The spoken word: its colour, on a pill without the outline if there's one.
    const lit = [
      `color:${style.active}`,
      ...(style.pill
        ? [
            `background:${style.pill}`,
            "-webkit-text-stroke:0",
            "text-shadow:none",
            "padding:0 0.18em",
            "border-radius:0.22em",
            "box-decoration-break:clone",
          ]
        : []),
    ].join(";");
    const files: string[] = [];
    for (const [n, text] of texts.entries()) {
      // Built with textContent, so a caption is only ever text, never markup.
      const { result } = await send<{ result: { value: number } }>("Runtime.evaluate", {
        awaitPromise: true,
        returnByValue: true,
        expression: `(async () => {
          if (!document.fonts.size) { ${pageFonts(fonts)} }
          while (document.readyState !== "complete") await new Promise((r) => setTimeout(r, 10));
          document.body.style.margin = "0";
          const box = document.createElement("div");
          box.style.cssText = ${JSON.stringify(css)};
          ${JSON.stringify(pieces(text))}.forEach((words, p) => {
            if (p) box.append(document.createElement("br"));
            words.forEach((word, w) => {
              if (w) box.append(" ");
              const span = document.createElement("span");
              span.textContent = word.text;
              if (word.lit) span.style.cssText = ${JSON.stringify(lit)};
              box.append(span);
            });
          });
          document.body.replaceChildren(box);
          await document.fonts.ready;
          return Math.ceil(box.getBoundingClientRect().height);
        })()`,
      });
      const { data } = await send<{ data: string }>("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: side, height: result.value, scale: 1 },
      });
      const file = join(dir, `caption-${n}.png`);
      writeFileSync(file, Buffer.from(data, "base64"));
      files.push(file);
    }
    return files;
  } catch {
    return undefined;
  } finally {
    await chrome?.close();
  }
}
