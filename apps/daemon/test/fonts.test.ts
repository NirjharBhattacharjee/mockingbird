import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FONT_FILES } from "../src/models.ts";

/**
 * Every family the motion kit and its styles name is one `models pull
 * chrome` downloads (#276), so a style draws the same on every machine.
 */
const MOTION = join(import.meta.dir, "../../../plugin/skills/motion-graphics");
const sources = [
  join(MOTION, "kit.ts"),
  ...readdirSync(join(MOTION, "styles"))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(MOTION, "styles", f)),
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

test("every font the styles and kit name is pinned", () => {
  const wrong: string[] = [];
  let seen = 0;
  for (const file of sources) {
    for (const list of stacks(readFileSync(file, "utf8"))) {
      const families = list.split(",").map((f) => f.trim().replace(/^["']|["']$/g, ""));
      seen++;
      if (GENERIC.has(families[0] as string)) wrong.push(`${file}: ${list} (generic first)`);
      for (const f of families) {
        if (!GENERIC.has(f) && !pinned.has(f) && !f.startsWith("${")) wrong.push(`${file}: ${f}`);
      }
    }
  }
  expect(seen).toBeGreaterThan(100);
  expect(wrong).toEqual([]);
});
