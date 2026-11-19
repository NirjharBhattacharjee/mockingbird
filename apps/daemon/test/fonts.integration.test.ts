import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { drawCaptions } from "@mockingbird/captions";
import { renderHtml } from "@mockingbird/motion";
import { findChrome, fontFaces } from "../src/models.ts";

/**
 * Bengali and CJK drawn with the fonts mockingbird ships (#156). A glyph a
 * font lacks is drawn as the same box whatever the character, so two
 * different lines in a script with no font come out the same; with one,
 * they differ. MOCKINGBIRD_STILLS keeps the pictures, for a person to look at.
 */
const stills = process.env.MOCKINGBIRD_STILLS;
const keep = (file: string, name: string) => {
  if (!stills) return;
  mkdirSync(stills, { recursive: true });
  copyFileSync(file, join(stills, name));
};

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("shipped fonts (integration)", () => {
  const chrome = findChrome();
  const fonts = fontFaces();

  test("the fonts are pulled", () => {
    expect(fonts.map((f) => f.family)).toContain("Noto Sans Bengali");
    expect(fonts.map((f) => f.family)).toContain("Noto Sans SC");
  });

  // With the shipped fonts and without, the same text: if they match, the
  // shipped font wasn't used. Where the system has no font for the script
  // (a bare Linux), without is boxes; the pictures are kept as before/after.
  test("a Bengali caption is drawn in the shipped Noto, not boxes or a system font", async () => {
    const line = ["আমার সোনার বাংলা"];
    // Both keep Inter, so only the Bengali face differs between them.
    const noBengali = fonts.filter((f) => f.family !== "Noto Sans Bengali");
    const draw = async (with_: boolean) => {
      const dir = mkdtempSync(join(tmpdir(), "fonts-caption-"));
      const [file] = (await drawCaptions(line, dir, 1080, 1920, {
        chrome,
        fonts: with_ ? fonts : noBengali,
      })) ?? [""];
      keep(file as string, `caption-bengali-${with_ ? "after" : "before"}.png`);
      return readFileSync(file as string);
    };
    expect((await draw(true)).equals(await draw(false))).toBe(false);
  }, 60_000);

  // 直 and 骨 are drawn differently in Japan and China: as Japanese, a kanji
  // takes Noto Sans JP's shape, not SC's (#224).
  test("a Japanese caption's kanji take the Japanese shapes", async () => {
    const draw = async (line: string, language: string) => {
      const dir = mkdtempSync(join(tmpdir(), "fonts-han-"));
      const [file] = (await drawCaptions([line], dir, 1080, 1920, {
        chrome,
        fonts,
        language,
      })) ?? [""];
      keep(file as string, `caption-han-${language}-${line.length}.png`);
      return readFileSync(file as string);
    };
    expect((await draw("直骨", "ja")).equals(await draw("直骨", "zh"))).toBe(false);
    // Unknown language: kana in the captions makes them Japanese.
    expect((await draw("直骨です", "en")).equals(await draw("直骨です", "ja"))).toBe(true);
  }, 60_000);

  test("CJK titles are drawn in the shipped Noto", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fonts-title-"));
    const titles = ["你好，世界", "日本語のタイトル", "안녕하세요"];
    const warned: string[] = [];
    const frame = async (i: number, with_: boolean) => {
      const path = join(dir, `title-${i}.html`);
      writeFileSync(
        path,
        `<!doctype html><body style="margin:0;background:#111"><h1 style="margin:40px;color:#fff;font:900 100px 'Noto Sans SC','Noto Sans JP','Noto Sans KR'">${titles[i]}</h1></body>`,
      );
      const out = join(dir, `title-${i}-${with_}.mp4`);
      await renderHtml(path, {
        chrome: chrome as string,
        out,
        width: 1080,
        height: 220,
        fps: 1,
        duration: 1,
        fonts: with_ ? fonts : [],
        onWarning: (w) => warned.push(w),
      });
      const png = join(dir, `title-${i}-${with_}.png`);
      Bun.spawnSync(["ffmpeg", "-v", "error", "-y", "-i", out, "-frames:v", "1", png]);
      keep(png, `title-cjk-${i}-${with_ ? "after" : "before"}.png`);
      return readFileSync(png);
    };
    for (const i of titles.keys()) {
      warned.length = 0;
      const shipped = await frame(i, true);
      expect(warned).toEqual([]);
      // Without them, Chrome draws a system font or boxes: the render finishes
      // and warns, naming the font and the fix (#276; degrade, don't break).
      expect(shipped.equals(await frame(i, false))).toBe(false);
      expect(warned.join("\n")).toMatch(/"Noto Sans SC" .*isn't loaded.*models pull chrome/);
    }
  }, 180_000);

  // What the check skips and what it doesn't: case, hidden text, a canvas's
  // fallback, and visible text in the browser's default font.
  test("the font check ignores case and text nobody sees (#276)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fonts-check-"));
    const warned: string[] = [];
    const render = (name: string, body: string) => {
      const path = join(dir, `${name}.html`);
      writeFileSync(path, `<!doctype html><body style="margin:0">${body}</body>`);
      warned.length = 0;
      return renderHtml(path, {
        chrome: chrome as string,
        out: join(dir, `${name}.mp4`),
        width: 64,
        height: 64,
        fps: 1,
        duration: 1,
        fonts,
        onWarning: (w) => warned.push(w),
      });
    };
    const quiet =
      '<canvas id="c" width="64" height="64">no canvas</canvas><div style="display:none">hidden</div>' +
      '<p style="font-family:inter">seen</p><script>const x = c.getContext("2d"); x.font = "700 20px inter"; x.fillText("a", 4, 30);</script>';
    expect(await render("quiet", quiet)).toBe(1);
    expect(warned).toEqual([]);
    expect(await render("default", "<p>seen in the default font</p>")).toBe(1);
    expect(warned.join("\n")).toMatch(/isn't loaded/);
  }, 60_000);

  // Every style's whole explainer, one style a frame, drawn through the page's
  // font check: a family that isn't pinned, or isn't pulled, leaves a warning.
  test("every motion style renders in the pinned fonts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fonts-styles-"));
    const motion = join(import.meta.dir, "../../../plugin/skills/motion-graphics");
    const template = readFileSync(join(motion, "templates/styles.html"), "utf8");
    const page = join(dir, "styles.html");
    writeFileSync(
      page,
      template
        .replace('from "KIT"', `from ${JSON.stringify(pathToFileURL(join(motion, "kit.js")).href)}`)
        .replace(
          'from "STYLES"',
          `from ${JSON.stringify(pathToFileURL(join(motion, "styles.js")).href)}`,
        )
        .replace(
          "const look = style(STYLE, ctx, t, m);",
          "const look = style(Object.keys(STYLES)[m.frame], ctx, 7, m);",
        ),
    );
    const out = join(dir, "styles.mp4");
    const count = Object.keys((await import(join(motion, "styles/index.ts"))).STYLES).length;
    const warned: string[] = [];
    const drawn = await renderHtml(page, {
      chrome: chrome as string,
      out,
      width: 960,
      height: 540,
      fps: 1,
      duration: count,
      fonts,
      onWarning: (w) => warned.push(w),
    });
    expect(drawn).toBe(count);
    expect(warned).toEqual([]);
    keep(out, "styles.mp4");
  }, 300_000);
});
