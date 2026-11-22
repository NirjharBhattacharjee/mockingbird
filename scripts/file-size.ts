// Fails when a tracked file is longer than its limit. Policy: AGENTS.md §File size.
// Run with `bun scripts/file-size.ts` (part of `bun run lint`).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const LIMITS = [
  // Generated, vendored, binary or data: no limit.
  {
    max: Number.POSITIVE_INFINITY,
    globs: [
      "**/vendor/**",
      "bun.lock",
      "**/*.cube",
      "bench/fixtures/**",
      "plugin/skills/motion-graphics/kit.js",
      "plugin/skills/motion-graphics/styles.js",
      "plugin/skills/motion-graphics/styles/index.ts",
    ],
  },
  {
    max: 200,
    globs: [
      "apps/daemon/src/mcp.ts",
      "apps/daemon/src/mcp/**",
      "apps/daemon/src/*/tools.ts",
      "apps/daemon/src/cli.ts",
      "apps/daemon/src/agent.ts",
      "apps/daemon/src/motion/runner.ts",
      "apps/cli/main.go",
    ],
  },
  { max: 600, globs: ["**/test/**", "**/*.test.ts", "**/*_test.go"] },
  {
    max: 500,
    globs: ["**/*.schema.ts", "**/*.md", "**/*.json", "**/*.yml", "**/*.yaml", "**/*.toml"],
  },
  { max: 350, globs: ["**"] },
].map((r) => ({ max: r.max, globs: r.globs.map((g) => new Bun.Glob(g)) }));

export const limitFor = (path: string) =>
  (LIMITS.find((r) => r.globs.some((g) => g.match(path))) as (typeof LIMITS)[number]).max;

// Physical lines, as `wc -l` counts them plus an unterminated last line.
export const countLines = (text: string) =>
  text.length === 0 ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);

type Allow = Record<string, { max: number; why: string }>;

export function check(files: Map<string, string>, allow: Allow): string[] {
  const errors: string[] = [];
  for (const [path, text] of files) {
    if (text.includes("\0")) continue; // binary
    const lines = countLines(text);
    const limit = limitFor(path);
    const entry = allow[path];
    if (entry && lines <= limit)
      errors.push(`${path}: ${lines} lines, now within ${limit}; remove it from the allowlist`);
    else if (entry && lines > entry.max)
      errors.push(`${path}: ${lines} lines, allowlist ceiling is ${entry.max} (${entry.why})`);
    else if (!entry && lines > limit)
      errors.push(`${path}: ${lines} lines, limit is ${limit}; split it by responsibility`);
  }
  for (const path of Object.keys(allow)) {
    if (!files.has(path)) errors.push(`${path}: on the allowlist but not tracked; remove it`);
  }
  return errors;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const tracked = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: root })
    .stdout.toString()
    .split("\0");
  const files = new Map<string, string>();
  for (const path of tracked.filter(Boolean)) {
    try {
      files.set(path, readFileSync(join(root, path), "utf8"));
    } catch {} // submodule directory or deleted file
  }
  const allow: Allow = JSON.parse(
    readFileSync(join(root, "scripts/file-size-allowlist.json"), "utf8"),
  );
  const errors = check(files, allow);
  for (const e of errors) console.error(e);
  if (errors.length) process.exit(1);
}
