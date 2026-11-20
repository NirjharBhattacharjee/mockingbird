// bun test plugin/skills/color-grade: the shipped .cube files are what looks.ts makes.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cube, LOOKS } from "./looks.ts";

test("each luts/*.cube is looks.ts's output (`bun plugin/skills/color-grade/looks.ts` after a change)", () => {
  for (const name of Object.keys(LOOKS)) {
    expect(readFileSync(join(import.meta.dir, "luts", `${name}.cube`), "utf8")).toBe(cube(name));
  }
});

test("the looks keep black, white and mid grey close to where they were", () => {
  for (const [name, look] of Object.entries(LOOKS)) {
    const grey = look([0.5, 0.5, 0.5]);
    for (const v of grey) expect(Math.abs(v - 0.5), name).toBeLessThan(0.04);
    expect(Math.max(...look([0, 0, 0])), name).toBeLessThan(0.1);
    expect(Math.min(...look([1, 1, 1])), name).toBeGreaterThan(0.85);
  }
});
