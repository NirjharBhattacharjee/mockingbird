import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cube, lutFile, sdrFilters, toSdr, transferOf, WHITE } from "../src/hdr.ts";

test("ffprobe's transfer names HLG and PQ; anything else is SDR", () => {
  expect(transferOf("arib-std-b67")).toBe("hlg");
  expect(transferOf("smpte2084")).toBe("pq");
  expect(transferOf("bt709")).toBeUndefined();
  expect(transferOf(undefined)).toBeUndefined();
});

test("HLG's reference grey lands a little under SDR white, black stays black, peak white fits", () => {
  // HLG at 75% is reference white (203 nits): display light WHITE, encoded for gamma 2.4.
  const [r, g, b] = toSdr([0.75, 0.75, 0.75], "hlg");
  expect(r).toBeCloseTo(WHITE ** (1 / 2.4), 2);
  expect(g).toBeCloseTo(r as number, 3);
  expect(b).toBeCloseTo(r as number, 3);
  expect(toSdr([0, 0, 0], "hlg")).toEqual([0, 0, 0]);
  const top = toSdr([1, 1, 1], "hlg");
  for (const v of top) {
    expect(v).toBeGreaterThan(0.9);
    expect(v).toBeLessThanOrEqual(1);
  }
});

test("brighter in is never darker out, and every colour fits 0-1", () => {
  for (const transfer of ["hlg", "pq"] as const) {
    let last = -1;
    for (let v = 0; v <= 1.0001; v += 0.05) {
      const [y = 0] = toSdr([v, v, v], transfer);
      expect(y).toBeGreaterThanOrEqual(last);
      last = y;
    }
    // A saturated BT.2020 green is outside BT.709: pulled in, not clipped to garbage.
    for (const c of toSdr([0.2, 0.9, 0.1], transfer)) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  }
});

test("the LUT is a 3D .cube, red changing fastest", () => {
  const lines = cube("hlg", 3).trim().split("\n");
  expect(lines[1]).toBe("LUT_3D_SIZE 3");
  expect(lines.length).toBe(2 + 27);
  expect(lines[2]).toBe("0.000000 0.000000 0.000000");
  // The second entry is red one step up: still mostly red once brought into BT.709.
  const [r = 0, g = 0, b = 0] = (lines[3] as string).split(" ").map(Number);
  expect(r).toBeGreaterThan(g);
  expect(r).toBeGreaterThan(b);
});

test("the LUT is named by its contents, made once and found again", () => {
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-hdr-test-"));
  try {
    const file = lutFile("pq", dir);
    expect(file).toMatch(/mockingbird-pq-to-sdr-[0-9a-f]{12}\.cube$/);
    expect(readFileSync(file, "utf8")).toStartWith('TITLE "mockingbird pq to SDR BT.709"');
    expect(lutFile("pq", dir)).toBe(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the filters convert BT.2020 to RGB, apply the LUT, and label the frames BT.709", () => {
  const f = sdrFilters("C:/Temp/hlg.cube");
  expect(f).toStartWith("scale=in_color_matrix=bt2020:in_range=tv,format=gbrp16le,");
  // A Windows path's colon escaped at both levels the graph is parsed.
  expect(f).toContain("lut3d=file=C\\\\:/Temp/hlg.cube:interp=trilinear");
  expect(f).toEndWith("setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv");
});
