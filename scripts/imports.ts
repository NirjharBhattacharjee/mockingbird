// Fails when an import goes the wrong way. Rules: docs/STRUCTURE.md.
// Run with `bun scripts/imports.ts` (part of `bun run lint`).
import { dirname, join, posix } from "node:path";
import { repoFiles } from "./file-size.ts";

const D = "apps/daemon/src/";

/** Which packages each package may import. */
export const PACKAGES: Record<string, string[]> = {
  audio: [],
  store: [],
  matte: [],
  motion: [],
  asr: ["audio"],
  vad: ["audio"],
  video: ["audio"],
  captions: ["motion"],
  timeline: ["captions"],
};

/** Which domain folders under apps/daemon/src each one may import. Files at the root are legacy and open to all. */
export const DOMAINS: Record<string, string[]> = {
  install: [],
  inspect: ["install"],
  transcript: ["inspect", "install"],
  effects: ["inspect", "install"],
  motion: ["inspect", "install"],
  screen: ["motion", "install"],
  captions: ["transcript", "motion", "install"],
  project: ["transcript", "captions", "inspect", "install"],
  render: ["effects", "captions", "motion", "project", "transcript", "inspect", "install"],
};

/** The only files that may import the legacy mcp.ts. May only shrink. */
export const MCP_IMPORTERS = [
  "apps/daemon/src/mcp/tools.ts",
  "apps/daemon/test/characterize/cache.test.ts",
  "apps/daemon/test/characterize/graphs.test.ts",
  "apps/daemon/test/effects.test.ts",
  "apps/daemon/test/mcp.test.ts",
  "apps/daemon/test/track.test.ts",
];

const ENTRIES = [`${D}cli.ts`, `${D}agent.ts`, `${D}motion/runner.ts`];

type Layer =
  | { kind: "package"; name: string }
  | { kind: "mcp" | "tools" | "schema" | "entry" | "test" | "legacy-mcp" | "other" }
  | { kind: "domain"; name: string }; // name "" = a legacy file at the root

export function layerOf(path: string): Layer {
  if (/(^|\/)test\//.test(path) || path.endsWith(".test.ts")) return { kind: "test" };
  const pkg = path.match(/^packages\/([^/]+)\//);
  if (pkg) return { kind: "package", name: pkg[1] as string };
  if (!path.startsWith(D)) return { kind: "other" };
  if (path === `${D}mcp.ts`) return { kind: "legacy-mcp" };
  if (path.startsWith(`${D}mcp/`)) return { kind: "mcp" };
  if (ENTRIES.includes(path)) return { kind: "entry" };
  if (/\/tools\.ts$/.test(path)) return { kind: "tools" };
  if (path.endsWith(".schema.ts")) return { kind: "schema" };
  const rest = path.slice(D.length);
  return { kind: "domain", name: rest.includes("/") ? (rest.split("/")[0] as string) : "" };
}

const folder = (path: string) => path.slice(D.length).split("/")[0];

/** The repo path or `@mockingbird/<pkg>` an import names, or undefined for anything outside the repo. */
export function resolve(from: string, spec: string): string | undefined {
  const pkg = spec.match(/^@mockingbird\/([^/]+)/);
  if (pkg) return `packages/${pkg[1]}/src/`;
  if (!spec.startsWith(".")) return undefined;
  const to = posix.normalize(posix.join(dirname(from), spec)).replace(/\.m?js$/, ".ts");
  return /\.[a-z]+$/i.test(to) ? to : `${to}.ts`; // "./mcp" compiles too
}

// Statements that start a line (so text in comments doesn't count), and import("…").
const SPECS = [
  /^(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gm,
  /^import\s*["']([^"']+)["']/gm,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
];
export const importsOf = (text: string) =>
  SPECS.flatMap((re) => [...text.matchAll(re)].map((m) => m[1] as string));

/** Why `from` may not import `to`, or undefined if it may. */
export function forbidden(from: string, to: string): string | undefined {
  const a = layerOf(from);
  const b = layerOf(to);
  if (b.kind === "legacy-mcp")
    return MCP_IMPORTERS.includes(from) ? undefined : "nothing new may import mcp.ts";
  if (a.kind === "test" || a.kind === "other") return;
  if (b.kind === "test") return "only tests import tests";
  if (b.kind === "entry") return "nothing imports an entry point";
  if (a.kind === "package") {
    if (b.kind !== "package") return "a package never imports apps/*";
    if (b.name === a.name) return;
    return PACKAGES[a.name]?.includes(b.name) ? undefined : `package DAG: ${a.name} -/-> ${b.name}`;
  }
  if (b.kind === "package" || b.kind === "other") return;
  if (a.kind === "mcp") {
    if (b.kind === "mcp" || to === `${D}guide.ts`) return;
    if (b.kind === "tools" && from === `${D}mcp/tools.ts`) return;
    return "mcp/ imports only mcp/, guide.ts, and (in mcp/tools.ts) each domain's tools.ts";
  }
  if (a.kind === "tools" || a.kind === "schema") {
    if (b.kind === "domain") return;
    if (b.kind === "mcp")
      return [`${D}mcp/types.ts`, `${D}mcp/args.ts`].includes(to)
        ? undefined
        : "tools import only mcp/types.ts and mcp/args.ts";
    if (b.kind === "schema" && dirname(to) === dirname(from)) return;
    return "a domain's tools.ts imports only its own schema, not another tool surface";
  }
  if (a.kind === "domain") {
    if (a.name === "") return; // a legacy root file, until it moves
    if (b.kind !== "domain") return "a domain never imports mcp/, a tools.ts or a schema";
    if (b.name === "" || b.name === a.name) return;
    return DOMAINS[a.name]?.includes(b.name) ? undefined : `domain DAG: ${a.name} -/-> ${b.name}`;
  }
  return; // entry: anything not ruled out above
}

export function check(files: Map<string, string>): string[] {
  const errors: string[] = [];
  const mcpImporters = new Set<string>();
  for (const [path, text] of files) {
    const dir = path.startsWith(D) && path.slice(D.length).includes("/") ? folder(path) : "";
    if (dir && dir !== "mcp" && !(dir in DOMAINS))
      errors.push(`${path}: ${D}${dir}/ isn't a domain; add it to docs/STRUCTURE.md`);
    for (const spec of importsOf(text)) {
      const to = resolve(path, spec);
      if (!to) continue;
      if (to === `${D}mcp.ts`) mcpImporters.add(path);
      const why = forbidden(path, to);
      if (why) errors.push(`${path}: imports ${spec}; ${why}`);
    }
  }
  for (const path of MCP_IMPORTERS)
    if (!mcpImporters.has(path))
      errors.push(`${path}: no longer imports mcp.ts; remove it from MCP_IMPORTERS`);
  return errors;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const files = new Map(
    [...repoFiles(root, ["apps", "packages"], true)].filter(([p]) => /\.(ts|tsx|js|mjs)$/.test(p)),
  );
  const errors = check(files);
  for (const e of errors) console.error(e);
  if (errors.length) process.exit(1);
}
