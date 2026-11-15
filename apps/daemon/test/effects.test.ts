import { expect, test } from "bun:test";
import { catalog, checkEffects, effectFilters, maskSource, pictureSteps } from "../src/effects.ts";
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

test("phase 2 entries build from the picture's size and length (#198)", () => {
  const ctx = { width: 1000, height: 500, length: 2, fps: 30 };
  expect(effectFilters([{ name: "chromakey", color: "#0000ff" }], ctx).video).toBe(
    "format=yuva420p,chromakey=color=0x0000ff:similarity=0.15:blend=0.05,despill=type=blue:mix=0.5",
  );
  expect(effectFilters([{ name: "crop", left: 0.1, top: 0.2 }], ctx).video).toBe(
    "format=yuva420p,crop=900:400:100:100,pad=1000:500:100:100:color=black@0",
  );
  expect(effectFilters([{ name: "freeze" }], ctx).video).toBe(
    "trim=end_frame=1,tpad=stop_mode=clone:stop_duration=2,trim=duration=2",
  );
  expect(effectFilters([{ name: "reverse" }], ctx)).toEqual({
    video: "reverse",
    audio: "areverse",
  });
  expect(effectFilters([{ name: "stabilize", strength: 1, zoom: 0.1 }], ctx).video).toBe(
    "deshake=rx=64:ry=64:edge=mirror,crop=900:450,scale=1000:500",
  );
  expect(() => checkEffects([{ name: "chromakey", color: "green" }], "fx")).toThrow(
    "a colour like",
  );
});

test("a masked effect is split off, given the mask as alpha and laid back", () => {
  const ctx = { width: 640, height: 360, length: 4, fps: 25 };
  const steps = pictureSteps(
    [
      { name: "color", exposure: 1 },
      {
        name: "blur",
        radius: 10,
        mask: {
          shape: "rect",
          x: 0.1,
          y: 0.1,
          w: 0.5,
          h: 0.5,
          end: { x: 0.4, y: 0.1, w: 0.5, h: 0.5 },
        },
      },
    ],
    "[in]",
    "[out]",
    ctx,
    "c0",
  );
  expect(steps[0]).toBe("[in]exposure=exposure=1[c0p1]");
  expect(steps[1]).toBe("[c0p1]split[c0k1][c0e1]");
  // The box moves from x 0.1 to 0.4 over the clip's 4 s.
  expect(steps[2]).toContain(
    "color=c=black:s=640x360:r=25:d=4,format=gray,geq=lum='255*between((X/W),(0.1+0.3*clip(T/4,0,1))",
  );
  expect(steps.at(-1)).toBe("[c0o1]null[out]");
  expect(
    maskSource(
      {
        shape: "polygon",
        points: [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
        invert: true,
        feather: 0.01,
      },
      ctx,
    ),
  ).toContain("(1-mod(");
  expect(() => checkEffects([{ name: "denoise", mask: { shape: "rect" } }], "fx")).toThrow(
    "only a picture effect",
  );
  expect(() =>
    checkEffects([{ name: "blur", mask: { shape: "polygon", points: [[0, 0]] } }], "fx"),
  ).toThrow("at least 3");
});

test("inserts take a box, a blend and effects; adjustment layers go under the text", () => {
  const graph = renderGraph([{ from: 0, to: 4 }], {
    audio: false,
    size: "640x360",
    fps: 30,
    inserts: [
      { start: 1, end: 3, box: { x: 0.5, y: 0.1, w: 0.25, h: 0.25 } },
      { start: 1, end: 3, blend: "screen" },
    ],
    adjust: [{ start: 2, end: 3, effects: [{ name: "color", saturation: 0 }] }],
    overlays: [{ start: 0, end: 4 }],
  });
  expect(graph).toContain("crop=160:90,setsar=1[ib0]");
  expect(graph).toContain("[c0][i0]overlay=x=320:y=36:eof_action=pass");
  expect(graph).toContain("blend=all_mode=screen:eof_action=pass");
  expect(graph).toContain("[ae2]trim=start=2:end=3,setpts=PTS-STARTPTS[ar2]");
  // The text is laid last, over the adjusted picture.
  expect(graph.indexOf("[ak2][ad2]overlay")).toBeLessThan(
    graph.indexOf("overlay=x=(main_w-overlay_w)/2"),
  );
});
