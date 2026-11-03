/**
 * The plugin's playbooks, served over MCP (#140): every skill in
 * plugin/skills and the reviewer agent, so an agent without the Claude Code
 * plugin edits from the same know-how. The engine only reads these files;
 * nothing here imports from the plugin.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The plugin, beside the engine's code in a checkout or a release. */
export const PLUGIN = join(import.meta.dir, "..", "..", "..", "plugin");

export type Playbook = { topic: string; description: string; folder: string; body: string };

/** A Markdown file's `name:` and `description:` front matter, and the text after it. */
function parse(text: string): { name?: string; description?: string; body: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { body: text };
  const field = (key: string) => match[1]?.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim();
  return {
    name: field("name"),
    description: field("description"),
    body: text.slice(match[0].length),
  };
}

/** Every playbook in `plugin`: its skills, then its agents, by name. */
export function playbooks(plugin = PLUGIN): Playbook[] {
  const read = (folder: string, file: string): Playbook[] => {
    const path = join(folder, file);
    if (!existsSync(path)) return [];
    const { name, description = "", body } = parse(readFileSync(path, "utf8"));
    return name ? [{ topic: name, description, folder, body }] : [];
  };
  const list = (dir: string) => (existsSync(dir) ? readdirSync(dir).sort() : []);
  const skills = join(plugin, "skills");
  const agents = join(plugin, "agents");
  return [
    ...list(skills).flatMap((name) => read(join(skills, name), "SKILL.md")),
    ...list(agents)
      .filter((f) => f.endsWith(".md"))
      .flatMap((file) => read(agents, file)),
  ];
}

/** What `guide(topic)` returns: the playbook, with where its files are. */
export function guide(topic: string, plugin = PLUGIN): string {
  const all = playbooks(plugin);
  const found = all.find((p) => p.topic === topic);
  if (!found) {
    const topics = all.map((p) => p.topic).join(", ") || "none: the plugin folder is missing";
    throw new Error(`No playbook "${topic}". Topics: ${topics}.`);
  }
  return [
    `Playbook: ${found.topic}. Its folder, for the scripts, kit and templates it names: ${found.folder}`,
    "Another playbook it mentions by name comes from `guide` too.",
    "",
    found.body.trim(),
  ].join("\n");
}

/** Sent to every client on connect: short, so it costs little when it isn't needed. */
export const INSTRUCTIONS = `mockingbird edits real footage on this computer: transcribe, frames, captions, render (cuts, framing, captions, b-roll, sound at -14 LUFS) and motion (motion graphics as code). It makes no editing choices; you do.

Before an edit, call \`guide\` with the job's topic and follow that playbook: "viral-short" for Shorts, Reels and TikToks, "long-form" for a YouTube video, "motion-graphics" for anything that moves on screen. Check every finished video against \`guide("reviewer")\` before calling it done. If the playbooks are already loaded as skills, you don't need \`guide\`.`;
