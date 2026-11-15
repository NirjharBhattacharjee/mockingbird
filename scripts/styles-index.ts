// bun run styles: writes plugin/skills/motion-graphics/styles/index.ts from
// the style files there, then builds styles.js beside kit.js.
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dir, "..", "plugin", "skills", "motion-graphics", "styles");
const ids = readdirSync(dir)
  .filter((f) => f.endsWith(".ts") && !["index.ts", "look.ts"].includes(f) && !f.endsWith(".test.ts"))
  .map((f) => f.slice(0, -3))
  .sort();
const name = (id: string) => id.replace(/-(\w)/g, (_, c) => c.toUpperCase()).replace(/^(\d)/, "_$1");
writeFileSync(
  join(dir, "index.ts"),
  `// Every explainer style, by id. Written by \`bun run styles\` from the files in
// this folder; don't edit by hand.
import type { Look, Style } from "./look.ts";
${ids.map((id) => `import ${name(id)} from "./${id}.ts";`).join("\n")}

export type { Look, Style };
export const STYLES: Record<string, Style> = {
${ids.map((id) => `  "${id}": ${name(id)},`).join("\n")}
};

/** The Look for \`id\` this frame: style("whiteboard", ctx, t, m).title("How AI learns"). */
export function style(id: string, ctx: any, t: number, m: any): Look {
  const s = STYLES[id];
  if (!s) throw new Error(\`No style "\${id}". Styles: \${Object.keys(STYLES).join(", ")}\`);
  return s.make(ctx, t, m);
}
`,
);
console.log(`${ids.length} styles`);
