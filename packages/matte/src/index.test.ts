import { expect, test } from "bun:test";
import { matteSize } from "./index.ts";

test("MODNet reads a frame with the short side 512 and both sides multiples of 32", () => {
  expect(matteSize(1920, 1080)).toEqual({ width: 896, height: 512 });
  expect(matteSize(1080, 1920)).toEqual({ width: 512, height: 896 });
  expect(matteSize(640, 640)).toEqual({ width: 512, height: 512 });
});
