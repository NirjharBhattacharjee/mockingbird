import { expect, test } from "bun:test";
import { catalog, checkEffects, effectFilters } from "../src/effects.ts";
import { renderGraph } from "../src/mcp.ts";
import { measure } from "../src/scopes.ts";

test("effects are checked against the catalog", () => {
  expect(checkEffects([{ name: "color", exposure: 1 }], "fx")).toEqual([
    { name: "color", exposure: 1 },
  ]);
  expect(() => checkEffects([{ name: "glow" }], "fx")).toThrow("fx[0].name must be one of");
  expect(() => checkEffects([{ name: "color", exposure: 9 }], "fx")).toThrow("from -3 to 3");
  expect(() => checkEffects([{ name: "color", warmth: 1 }], "fx")).toThrow("has no warmth");
  expect(() => checkEffects([{ name: "lut" }], "fx")).toThrow("needs file");
  expect(() => checkEffects({ name: "color" }, "fx")).toThrow("must be a list");
});

test("each effect builds its filter, the picture's and the sound's apart, in order", () => {
  expect(
    effectFilters([
      { name: "color", exposure: 0.5, saturation: 1.2 },
      { name: "denoise", amount: 0.5, floor: -45 },
      { name: "vignette" },
      { name: "highpass" },
      { name: "lut", file: "/looks/teal:orange.cube" },
    ]),
  ).toEqual({
    video:
      "exposure=exposure=0.5,eq=contrast=1:saturation=1.2:gamma=1,vignette=angle=0.5027,lut3d=file=/looks/teal\\\\:orange.cube",
    audio: "afftdn=nr=26:nf=-45:tn=1,highpass=f=80",
  });
  // An apostrophe is escaped for the option and again for the graph; quoting broke it.
  expect(effectFilters([{ name: "lut", file: "/looks/O'Brien.cube" }]).video).toBe(
    "lut3d=file=/looks/O\\\\\\'Brien.cube",
  );
  // Defaults that change nothing add nothing.
  expect(effectFilters([{ name: "color" }])).toEqual({ video: "", audio: "" });
  expect(catalog()).toContain("denoise (audio)");
});

test("a clip's effects go after its framing, on its picture and its sound", () => {
  const graph = renderGraph(
    [{ from: 0, to: 2, effects: [{ name: "color", exposure: 1 }, { name: "highpass" }] }],
    { audio: true, size: "640x360", fps: 30 },
  );
  expect(graph).toContain(",fps=30,exposure=exposure=1[v0]");
  expect(graph).toContain("[0:a]asetpts=PTS-STARTPTS,highpass=f=80[a0]");
});

test("scopes reads luma, clipping, saturation and skin off YUV 4:4:4 frames", () => {
  // One 2x2 frame: black, white, mid grey, and a skin tone (hue on the skin line).
  const w = 2;
  const h = 2;
  const y = [16, 235, 126, 140];
  const angle = (123 * Math.PI) / 180;
  const u = [128, 128, 128, Math.round(128 + 30 * Math.cos(angle))];
  const v = [128, 128, 128, Math.round(128 + 30 * Math.sin(angle))];
  const s = measure(Uint8Array.from([...y, ...u, ...v]), w, h);
  expect(s.frames).toBe(1);
  expect(s.crushed).toBe(0.25);
  expect(s.clipped).toBe(0.25);
  expect(s.luma).toBeCloseTo((0 + 1 + 110 / 219 + 124 / 219) / 4, 3);
  expect(s.skin).toBe(0.25);
  expect(Math.abs(s.skinOffset ?? 99)).toBeLessThan(2);
});
