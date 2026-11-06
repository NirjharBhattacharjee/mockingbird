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
 * a wide video's height, as subtitles are (#127). The outline is a share of it.
 */
const TALL_TEXT = 0.075;
const WIDE_TEXT = 0.05;
const OUTLINE = 0.2;
/** How much of the width a line may take before it wraps: subtitles keep clear of the corners. */
const TALL_LINE = 0.9;
const WIDE_LINE = 0.6;
/** The colour of a word written `*like this*`: the spoken word in word-by-word captions. */
const HIGHLIGHT = "rgb(255, 214, 0)";

/**
 * Inter, then Noto for scripts Inter lacks, then whatever the system has.
 * ponytail: Chinese, Japanese and Korean share Han characters; SC comes
 * first, so a Japanese caption's kanji take Chinese shapes. Pick by the
 * caption's language if that matters.
 */
const FAMILIES = [
  "Inter",
  ...["Bengali", "Devanagari", "Arabic", "Hebrew", "Thai", "Tamil", "SC", "JP", "KR"].map(
    (script) => `"Noto Sans ${script}"`,
  ),
  "system-ui",
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
 * Draws each of `texts` into `dir` as a transparent PNG: white bold text
 * with a black outline, centred, sized and wrapped for a video `side` pixels
 * wide and `height` high (9:16 if not given), as wide as the video. A word
 * written `*like this*` is drawn in HIGHLIGHT. A word too long for a line,
 * like a Japanese sentence with no spaces, breaks between characters.
 *
 * It's drawn as HTML in the headless Chrome at `chrome`, so captions look
 * the same on every OS; `wrap` starts Chrome inside a sandbox, and `fonts`
 * are the ones mockingbird ships (#156). Returns the files in order, or
 * undefined if they can't be drawn.
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
  }: { chrome?: string; wrap?: string[]; fonts?: PageFont[] } = {},
): Promise<string[] | undefined> {
  if (!chromePath) return undefined;
  const tall = height >= side;
  const size = Math.round(tall ? side * TALL_TEXT : height * WIDE_TEXT);
  const outline = size * OUTLINE;
  const margin = (side * (1 - (tall ? TALL_LINE : WIDE_LINE))) / 2;
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
    const style = [
      `width:${side}px`,
      "box-sizing:border-box",
      `padding:${outline}px ${margin}px`,
      "text-align:center",
      `font:700 ${size}px/normal ${FAMILIES}`,
      "color:#fff",
      `-webkit-text-stroke:${outline}px #000`,
      "paint-order:stroke fill",
      "overflow-wrap:anywhere",
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
          box.style.cssText = ${JSON.stringify(style)};
          ${JSON.stringify(pieces(text))}.forEach((words, p) => {
            if (p) box.append(document.createElement("br"));
            words.forEach((word, w) => {
              if (w) box.append(" ");
              const span = document.createElement("span");
              span.textContent = word.text;
              if (word.lit) span.style.color = ${JSON.stringify(HIGHLIGHT)};
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
