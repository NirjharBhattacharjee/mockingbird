import { expect, test } from "bun:test";
import { noNetwork } from "../src/sandbox.ts";

test("noNetwork: sandbox-exec on macOS, a namespace on Linux if it can be made, Chrome alone on Windows", () => {
  expect(noNetwork("darwin")[0]).toBe("/usr/bin/sandbox-exec");
  expect(noNetwork("linux", () => true)).toEqual(["unshare", "-rn"]);
  expect(noNetwork("linux", () => false)).toEqual([]);
  expect(noNetwork("win32")).toEqual([]);
});
