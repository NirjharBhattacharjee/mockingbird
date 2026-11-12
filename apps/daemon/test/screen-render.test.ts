import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cameraAt, screenOptions, screenPage } from "@mockingbird/motion";
import { normalizeScreen } from "@mockingbird/video";
import { mcpTools } from "../src/mcp.ts";

test("MCP exposes the screen renderer", () => {
  expect(
    mcpTools(
      async () => ({}),
      () => {},
    ).map((t) => t.name),
  ).toContain("screen_render");
});

test("source camera interpolates position and logarithmic zoom, then holds endpoints", () => {
  const keys = [
    { at: 1, x: 100, y: 50, zoom: 1 },
    { at: 3, x: 200, y: 150, zoom: 4 },
  ];
  expect(cameraAt(keys, 2, "linear")).toEqual({ at: 2, x: 150, y: 100, zoom: 2 });
  expect(cameraAt(keys, 0, "smooth")).toEqual(keys[0]);
  expect(cameraAt(keys, 4, "smooth")).toEqual(keys[1]);
});
test("invalid camera, overlay intervals and code-like text are handled safely", () => {
  expect(() => screenOptions({ camera: [{ at: 0, x: 1, y: 2, zoom: 0 }] })).toThrow("camera zoom");
  expect(() => screenOptions({ overlays: [{ kind: "mask", from: 2, to: 1 }] })).toThrow("follow");
  const page = screenPage(
    screenOptions({
      overlays: [
        { kind: "text", from: 0, to: 1, x: 0, y: 0, text: "</script><script>bad()</script>" },
      ],
    }),
  );
  expect(page).not.toContain("<script>bad()");
});

test("normalization refuses an output longer than the renderer limit before encoding", async () => {
  const dir = mkdtempSync(join(tmpdir(), "screen-normalize-limit-"));
  try {
    await expect(
      normalizeScreen(
        { path: join(dir, "source.mp4"), duration: 7200, audio: false },
        { out: join(dir, "out.mp4"), speed: 0.25 },
      ),
    ).rejects.toThrow("Normalized output must be at most 7200 seconds");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
