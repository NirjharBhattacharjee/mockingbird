import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CAPTION_FONTS, CAPTION_PRESETS } from "@mockingbird/captions";
import { FONT_FILES, FONT_LICENCES, userFonts } from "../src/models.ts";

/**
 * Every family the motion kit, its styles and the caption presets name is
 * one `models pull chrome` downloads (#276). A family that isn't fails the
 * render, so this catches it before anyone renders.
 */
const MOTION = join(import.meta.dir, "../../../plugin/skills/motion-graphics");
const sources = [
  join(MOTION, "kit.ts"),
  ...readdirSync(join(MOTION, "styles"))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(MOTION, "styles", f)),
  join(import.meta.dir, "../../../packages/captions/src/index.ts"),
];
const GENERIC = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy"]);
const pinned = new Set(FONT_FILES.map((f) => f.name));

/**
 * Font family lists in a source: string literals ending in a generic family,
 * after `px `, or made only of double-quoted names (`'"Charis SIL"'`).
 */
function stacks(src: string): string[] {
  const found: string[] = [];
  for (const m of src.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)) {
    const s = (m[1] ?? m[2] ?? m[3]) as string;
    const after = /px\s+(["'A-Za-z][^$]*)$/.exec(s)?.[1];
    const list = after ?? s;
    const last = list.split(",").at(-1)?.trim() ?? "";
    // A family list has no brackets or colons; a shadow or a CSS declaration does.
    if (/[():]/.test(list)) continue;
    const quoted = /^"[^"]+"(\s*,\s*"[^"]+")*$/.test(list);
    if (after || quoted || (GENERIC.has(last) && list.includes(","))) found.push(list);
  }
  return found;
}

test("every font the styles, kit and captions name is pinned", () => {
  const wrong: string[] = [];
  let seen = 0;
  for (const file of sources) {
    for (const list of stacks(readFileSync(file, "utf8"))) {
      const families = list.split(",").map((f) => f.trim().replace(/^["']|["']$/g, ""));
      seen++;
      if (GENERIC.has(families[0] as string)) wrong.push(`${file}: ${list} (generic first)`);
      for (const f of families) {
        if (!GENERIC.has(f) && !pinned.has(f) && !f.includes("${")) wrong.push(`${file}: ${f}`);
      }
    }
  }
  expect(seen).toBeGreaterThan(100);
  expect(wrong).toEqual([]);
});

test("every font a caption style can pick is pinned", () => {
  expect(CAPTION_FONTS.filter((f) => !pinned.has(f))).toEqual([]);
  for (const s of Object.values(CAPTION_PRESETS)) expect(pinned.has(s.font)).toBe(true);
});

test("colour emoji are pinned, and in every stack (#276)", () => {
  expect(pinned.has("Noto Color Emoji")).toBe(true);
  const without: string[] = [];
  for (const file of sources) {
    for (const list of stacks(readFileSync(file, "utf8"))) {
      // A template piece (`"${font}"`) is one name of a stack built in code.
      if (!list.includes("${") && !list.includes("Noto Color Emoji"))
        without.push(`${file}: ${list}`);
    }
  }
  expect(without).toEqual([]);
});

test("a user's fonts are named after their files, as many as there are (#276)", () => {
  const dir = mkdtempSync(join(tmpdir(), "user-fonts-"));
  for (const f of ["Brand Sans.ttf", "Brand Sans Italic.otf", "Logo.woff2", "notes.txt"])
    writeFileSync(join(dir, f), "");
  expect(userFonts(dir).map((f) => [f.family, f.style])).toEqual([
    ["Brand Sans", "italic"],
    ["Brand Sans", "normal"],
    ["Logo", "normal"],
  ]);
  expect(userFonts(join(dir, "none"))).toEqual([]);
});

test("every pinned font family has its licence, and emoji are pinned (#276)", () => {
  expect(FONT_FILES.map((f) => f.name)).toContain("Noto Color Emoji");
  const files = FONT_LICENCES.map((l) => l.file);
  expect(new Set(files).size).toBe(files.length);
  for (const l of FONT_LICENCES) expect(l.sha256).toMatch(/^[0-9a-f]{64}$/);
  // One per family directory in google/fonts, plus the emoji's.
  const dirs = new Set(
    FONT_FILES.filter((f) => f.url.includes("google/fonts")).map(
      (f) => f.url.split("/ofl/")[1]?.split("/")[0],
    ),
  );
  expect(FONT_LICENCES.length).toBe(dirs.size + 1);
});
