import { expect, test } from "bun:test";
import { maskSteps } from "../src/effects.ts";
import { along, follow } from "../src/track.ts";

test("track follows a textured square across noisy frames (#200)", () => {
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
  const { points, worst } = follow(list, W, H, { x: 10 / W, y: 20 / H, w: 16 / W, h: 16 / H });
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
  expect(steps[2]).toContain("overlay=x='if(lt(t,2),(0+(320-0)*(t-0)/2),320)'");
  expect(steps[2]?.endsWith("[m]")).toBe(true);
});
