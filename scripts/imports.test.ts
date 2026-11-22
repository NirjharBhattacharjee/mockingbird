import { expect, test } from "bun:test";
import { check, forbidden } from "./imports.ts";

const D = "apps/daemon/src/";

test("packages follow the package DAG and never import apps", () => {
  expect(forbidden("packages/asr/src/a.ts", "packages/audio/src/")).toBeUndefined();
  expect(forbidden("packages/audio/src/a.ts", "packages/asr/src/")).toContain("package DAG");
  expect(forbidden("packages/video/src/a.ts", `${D}runtime.ts`)).toContain("never imports apps");
});

test("domains follow the domain DAG and never import the tool surface", () => {
  expect(forbidden(`${D}render/cut.ts`, `${D}effects/masks.ts`)).toBeUndefined();
  expect(forbidden(`${D}effects/masks.ts`, `${D}render/cut.ts`)).toContain("domain DAG");
  expect(forbidden(`${D}screen/render.ts`, `${D}runtime.ts`)).toBeUndefined();
  expect(forbidden(`${D}screen/render.ts`, `${D}mcp/types.ts`)).toContain("never imports mcp/");
  expect(forbidden(`${D}render/cut.ts`, `${D}render/tools.ts`)).toContain("never imports mcp/");
});

test("tools and mcp/ stay thin", () => {
  expect(forbidden(`${D}screen/tools.ts`, `${D}screen/render.ts`)).toBeUndefined();
  expect(forbidden(`${D}screen/tools.ts`, `${D}mcp/args.ts`)).toBeUndefined();
  expect(forbidden(`${D}screen/tools.ts`, `${D}mcp/server.ts`)).toContain("mcp/types.ts");
  expect(forbidden(`${D}screen/tools.ts`, `${D}render/tools.ts`)).toContain("tool surface");
  expect(forbidden(`${D}mcp/tools.ts`, `${D}screen/tools.ts`)).toBeUndefined();
  expect(forbidden(`${D}mcp/server.ts`, `${D}screen/tools.ts`)).toContain("mcp/ imports only");
  expect(forbidden(`${D}mcp/server.ts`, `${D}runtime.ts`)).toContain("mcp/ imports only");
});

test("only the frozen list imports mcp.ts, and the list only shrinks", () => {
  expect(forbidden(`${D}cli.ts`, `${D}mcp.ts`)).toBeUndefined();
  expect(forbidden(`${D}track.ts`, `${D}mcp.ts`)).toContain("mcp.ts");
  expect(forbidden(`${D}track.ts`, `${D}cli.ts`)).toContain("entry point");
  const errors = check(new Map([[`${D}cli.ts`, 'import { serve } from "./mcp.ts";']]));
  expect(errors.some((e) => e.startsWith(`${D}transcribe.ts: no longer imports`))).toBe(true);
  expect(errors.some((e) => e.includes("screen-inspection/ is gone"))).toBe(true);
});

test("a folder that isn't a domain fails", () => {
  const errors = check(new Map([[`${D}misc/a.ts`, ""]]));
  expect(errors.some((e) => e.includes("misc/ isn't a domain"))).toBe(true);
});
