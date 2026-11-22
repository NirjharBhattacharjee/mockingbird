import { expect, test } from "bun:test";
import { check, forbidden, importsOf, resolve } from "./imports.ts";

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
  expect(forbidden(`${D}mcp/tools.ts`, `${D}mcp.ts`)).toBeUndefined();
  expect(forbidden(`${D}cli.ts`, `${D}mcp.ts`)).toContain("mcp.ts");
  expect(forbidden(`${D}track.ts`, `${D}mcp.ts`)).toContain("mcp.ts");
  expect(forbidden(`${D}track.ts`, `${D}cli.ts`)).toContain("entry point");
  const errors = check(new Map([[`${D}mcp/tools.ts`, 'import { motion } from "../mcp.ts";']]));
  expect(errors.some((e) => e.startsWith(`${D}transcribe.ts: no longer imports`))).toBe(true);
});

test("a folder that isn't a domain fails", () => {
  const errors = check(new Map([[`${D}misc/a.ts`, ""]]));
  expect(errors.some((e) => e.includes("misc/ isn't a domain"))).toBe(true);
});

test("review fixes: tests, comments, extensionless paths, root files, tools-only folders", () => {
  expect(forbidden("apps/daemon/test/new.test.ts", `${D}mcp.ts`)).toContain("mcp.ts");
  expect(importsOf('// import { a } from "./mcp.ts";\nconst s = "x from \'./y\'";')).toEqual([]);
  expect(
    importsOf('import {\n  a,\n} from "./a.ts";\nimport "./b.ts";\nawait import("./c.ts");'),
  ).toEqual(["./a.ts", "./b.ts", "./c.ts"]);
  expect(forbidden(`${D}track.ts`, resolve(`${D}track.ts`, "./mcp") as string)).toContain("mcp.ts");
  expect(forbidden(`${D}transcribe.ts`, `${D}mcp/args.ts`)).toBeUndefined();
  expect(forbidden("packages/motion/src/a.ts", "packages/motion/package.json")).toBeUndefined();
  const errors = check(new Map([[`${D}misc/tools.ts`, ""]]));
  expect(errors.some((e) => e.includes("misc/ isn't a domain"))).toBe(true);
});
