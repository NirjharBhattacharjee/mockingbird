import { expect, test } from "bun:test";
import { maskSteps, pictureSteps } from "../src/effects.ts";
import { along, follow } from "../src/inspect/track.ts";
import { renderGraph } from "../src/mcp.ts";

test("track follows a textured square across noisy frames (#200)", async () => {
  const [W, H] = [160, 90];
  let seed = 3;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // Detail in 4 px blocks, as a real picture shrunk to 320 wide has, not per-pixel noise.
  const texture = Array.from({ length: 16 }, () => rnd() * 200);
  // The square moves 2 px right and 1 px down a frame for 30 frames.
  const list = Array.from({ length: 30 }, (_, k) => {
    const img = new Uint8Array(W * H).map(() => 30 + rnd() * 20);
    for (let j = 0; j < 16; j++)
      for (let i = 0; i < 16; i++)
        img[(20 + k + j) * W + 10 + 2 * k + i] = texture[(j >> 2) * 4 + (i >> 2)] as number;
    return img;
  });
  const { points, worst } = await follow(list, W, H, {
    x: 10 / W,
    y: 20 / H,
    w: 16 / W,
    h: 16 / H,
  });
  expect(points.at(-1)).toEqual({ x: 10 + 2 * 29, y: 20 + 29 });
  expect(worst).toBeGreaterThan(0.8);
});

test("along is linear between points and held past the ends", () => {
  const pts = [
    { at: 1, x: 0.1, y: 0 },
    { at: 3, x: 0.5, y: 0 },
  ];
  expect(along(pts, "x", "t", 100)).toBe("if(lt(t,1),10,if(lt(t,3),(10+(50-10)*(t-1)/2),50))");
});

test("a mask with a path moves a drawn box with overlay", () => {
  const steps = maskSteps(
    {
      shape: "rect",
      w: 0.1,
      h: 0.1,
      path: [
        { at: 0, x: 0, y: 0 },
        { at: 2, x: 0.5, y: 0.5 },
      ],
    },
    { width: 640, height: 360, fps: 30, length: 2 },
    "[m]",
    "c0",
  );
  expect(steps).toHaveLength(3);
  expect(steps[2]).toContain("overlay=x='if(lt(t,0),0,if(lt(t,2),(0+(320-0)*(t-0)/2),320))'");
  expect(steps[2]?.endsWith("[m]")).toBe(true);
});

test("a masked path reads source time on a sped-up clip, and labels stay apart (#257)", () => {
  const mask = {
    shape: "rect" as const,
    path: [
      { at: 0, x: 0, y: 0 },
      { at: 2, x: 0.5, y: 0.5 },
    ],
  };
  const fast = maskSteps(
    mask,
    { width: 640, height: 360, fps: 30, length: 1, speed: 2 },
    "[m]",
    "c0",
  );
  expect(fast[2]).toContain("lt((t*2),2)");
  // Clip 1's effect 10 and clip 11's effect 0.
  const blur = { name: "blur", sigma: 4, mask };
  const ctx = { width: 640, height: 360, fps: 30, length: 2 };
  const effects = (n: number) => Array.from({ length: n + 1 }, () => blur);
  const a = pictureSteps(effects(10), "[a]", "[ao]", ctx, "c1").join(";");
  const b = pictureSteps(effects(0), "[b]", "[bo]", ctx, "c11").join(";");
  const labels = (g: string) => new Set(g.match(/\[[a-z0-9]+m[sb]\]/g));
  const shared = [...labels(a)].filter((l) => labels(b).has(l));
  expect(shared).toEqual([]);
});

test("an insert's box follows a path, timed from the insert's start (#200)", () => {
  const graph = renderGraph([{ from: 0, to: 4 }], {
    audio: false,
    size: "640x360",
    fps: 30,
    inserts: [
      {
        start: 1,
        end: 3,
        box: {
          x: 0,
          y: 0,
          w: 0.25,
          h: 0.25,
          path: [
            { at: 0, x: 0, y: 0.5 },
            { at: 2, x: 0.5, y: 0.5 },
          ],
        },
      },
    ],
  });
  expect(graph).toContain(
    "overlay=x='if(lt((t-1),0),0,if(lt((t-1),2),(0+(320-0)*((t-1)-0)/2),320))':y='if(lt((t-1),0),180,if(lt((t-1),2),(180+(180-180)*((t-1)-0)/2),180))':eof_action=pass",
  );
});

test("a box that doesn't move is found where it was, and a corner box stays in the frame", async () => {
  const [W, H] = [320, 180];
  const img = new Uint8Array(W * H);
  img[80 * W + 100] = 255;
  const still = await follow([img, img, img], W, H, { x: 100 / W, y: 80 / H, w: 4 / W, h: 4 / H });
  expect(still.points.at(-1)).toEqual({ x: 100, y: 80 });
  const corner = await follow([img, img], W, H, { x: 0.99, y: 0.99, w: 0.01, h: 0.01 });
  expect(corner.points[0]).toEqual({ x: W - 4, y: H - 4 });
  expect(Number.isNaN(corner.worst)).toBe(false);
});

test("along nests shallowly for a long path, which ffmpeg's parser needs", () => {
  const pts = Array.from({ length: 151 }, (_, i) => ({ at: i / 5, x: (i % 7) / 10, y: 0 }));
  let depth = 0;
  let d = 0;
  for (const c of along(pts, "x", "t", 100)) {
    if (c === "(") depth = Math.max(depth, ++d);
    if (c === ")") d--;
  }
  expect(depth).toBeLessThan(20);
});

test("along holds the first point before it, even one at 0 s", () => {
  const e = along(
    [
      { at: 0, x: 0.1, y: 0 },
      { at: 1, x: 0.5, y: 0 },
    ],
    "x",
    "-1",
    100,
  );
  const value = new Function("lt", "IF", `return ${e.replaceAll("if(", "IF(")}`)(
    (a: number, b: number) => (a < b ? 1 : 0),
    (c: number, a: number, b: number) => (c ? a : b),
  );
  expect(value).toBe(10);
});
