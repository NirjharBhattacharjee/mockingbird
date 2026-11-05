import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    const draw = async (with_: boolean) => {
      const dir = mkdtempSync(join(tmpdir(), "fonts-caption-"));
      const [file] = (await drawCaptions(line, dir, 1080, 1920, {
        chrome,
        fonts: with_ ? fonts : [],
      })) ?? [""];
      keep(file as string, `caption-bengali-${with_ ? "after" : "before"}.png`);
      return readFileSync(file as string);
    };
    expect((await draw(true)).equals(await draw(false))).toBe(false);
  }, 60_000);

  test("CJK titles are drawn in the shipped Noto", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fonts-title-"));
    const titles = ["你好，世界", "日本語のタイトル", "안녕하세요"];
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
      });
      const png = join(dir, `title-${i}-${with_}.png`);
      Bun.spawnSync(["ffmpeg", "-v", "error", "-y", "-i", out, "-frames:v", "1", png]);
      keep(png, `title-cjk-${i}-${with_ ? "after" : "before"}.png`);
      return readFileSync(png);
    };
    for (const i of titles.keys()) {
      expect((await frame(i, true)).equals(await frame(i, false))).toBe(false);
    }
  }, 180_000);
});
