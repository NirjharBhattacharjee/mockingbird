import { expect, test } from "bun:test";
import { check, countLines, limitFor } from "./file-size.ts";

test("counts physical lines", () => {
  expect([countLines(""), countLines("a"), countLines("a\n"), countLines("a\nb")]).toEqual([
    0, 1, 1, 2,
  ]);
});

test("classifies files, first rule wins", () => {
  expect(limitFor("apps/daemon/src/mcp.ts")).toBe(200);
  expect(limitFor("apps/daemon/test/mcp.test.ts")).toBe(600);
  expect(limitFor("docs/MCP.md")).toBe(500);
  expect(limitFor("apps/daemon/src/mcp/server.ts")).toBe(200);
  expect(limitFor("apps/daemon/src/screen/tools.ts")).toBe(200);
  expect(limitFor("apps/daemon/src/render/render.schema.ts")).toBe(500);
  expect(limitFor("packages/video/test/fixture.ts")).toBe(600);
  expect(limitFor("packages/timeline/src/index.ts")).toBe(350);
  expect(limitFor("plugin/skills/motion-graphics/vendor/three.module.min.js")).toBe(Infinity);
});

test("allowlist can only shrink", () => {
  const big = "x\n".repeat(400);
  const files = new Map([["a.ts", big]]);
  expect(check(files, {})).toHaveLength(1);
  expect(check(files, { "a.ts": { max: 400, why: "" } })).toEqual([]);
  expect(check(files, { "a.ts": { max: 399, why: "" } })[0]).toContain("ceiling");
  expect(check(new Map([["a.ts", "x\n"]]), { "a.ts": { max: 400, why: "" } })[0]).toContain(
    "remove",
  );
  expect(check(new Map(), { "a.ts": { max: 400, why: "" } })[0]).toContain("not tracked");
});
