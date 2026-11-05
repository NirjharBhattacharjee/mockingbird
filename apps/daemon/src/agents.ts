/**
 * The coding agents on this computer, and mockingbird's MCP server in each
 * one's config (#141). Only agents whose config folder or command exists
 * are listed. A config is edited, never replaced: one that can't be read
 * is left alone, with what to add by hand.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type Agent = {
  name: string;
  /** The file mockingbird goes in, or the command that adds it. */
  where: string;
  registered: boolean;
  /** Adds mockingbird; throws, saying what to add by hand, if it can't. */
  register: () => void;
};

export type AgentDeps = {
  home?: string;
  which?: (name: string) => string | null;
  run?: (argv: string[]) => { code: number; out: string };
};

/**
 * Whether a Codex config already defines mockingbird under `mcp_servers` in a
 * form other than the `[mcp_servers.mockingbird]` table: a dotted key, an
 * inline table, or a key inside `[mcp_servers]`. Adding the table then would
 * define it twice, which Codex rejects. Elsewhere (a project path, a
 * comment) the name is harmless.
 */
export function codexMentions(toml: string): boolean {
  let table = "";
  for (const raw of toml.split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    const header = line.match(/^\[\s*([^\]]+?)\s*\]$/);
    if (header) {
      table = bare(header[1] ?? "");
      continue;
    }
    const key = bare(line.match(/^([^=]+?)\s*=/)?.[1] ?? "");
    if (key === "mcp_servers.mockingbird" || key.startsWith("mcp_servers.mockingbird."))
      return true;
    if (key === "mcp_servers" && /\bmockingbird\b/.test(line)) return true;
    if (table === "mcp_servers" && (key === "mockingbird" || key.startsWith("mockingbird.")))
      return true;
  }
  return false;
}

/** A TOML key or table name with its quotes and spaces gone: ["a" . 'b'] names the same table as [a.b]. */
const bare = (name: string) => name.replace(/[\s"']/g, "");

/** Whether the config has the `[mcp_servers.mockingbird]` table, however it's quoted. */
const codexTable = (toml: string) =>
  toml.split("\n").some((line) => {
    const header = line
      .replace(/\s+#.*$/, "")
      .trim()
      .match(/^\[\s*([^\]]+?)\s*\]$/);
    return !!header && bare(header[1] ?? "") === "mcp_servers.mockingbird";
  });

/**
 * Written beside it and renamed over it, so a write cut short never leaves
 * half a config. A symlinked config (say, from a dotfiles folder) is written
 * where it points, and the file keeps its permissions: a private 0600 one
 * may hold the user's keys.
 */
function replace(file: string, text: string) {
  const target = existsSync(file) ? realpathSync(file) : file;
  const mode = existsSync(target) ? statSync(target).mode & 0o777 : 0o644;
  mkdirSync(dirname(target), { recursive: true });
  // This process's own name: two setups at once can't trip on each other's file.
  const temp = `${target}.mockingbird-${process.pid}.tmp`;
  writeFileSync(temp, text, { mode });
  chmodSync(temp, mode);
  renameSync(temp, target);
}

const runIt = (argv: string[]) => {
  const r = Bun.spawnSync(argv, { stderr: "pipe" });
  return { code: r.exitCode, out: `${r.stdout}${r.stderr}` };
};

/** A JSON config with servers under `key`: Cursor's and Gemini CLI's `mcpServers`, VS Code's `servers`. */
function jsonConfig(
  name: string,
  file: string,
  key: string,
  entry: object,
  which: (name: string) => string | null,
): Agent {
  const read = (): Record<string, Record<string, unknown>> => {
    if (!existsSync(file)) return {};
    const text = readFileSync(file, "utf8");
    // Cursor can leave an empty mcp.json: that's no servers, not a broken file.
    if (!text.trim()) return {};
    try {
      return JSON.parse(text);
    } catch {
      const by = JSON.stringify({ [key]: { mockingbird: entry } });
      throw new Error(`${file} isn't plain JSON, so it was left alone. Add this to it: ${by}`);
    }
  };
  // An entry whose command has gone (moved, or uninstalled) doesn't count, so setup repairs it.
  let registered = false;
  try {
    const command = (read()[key]?.mockingbird as { command?: unknown } | undefined)?.command;
    registered =
      typeof command === "string" &&
      // A path (either separator: Windows writes C:\...) must exist; a bare name, be on the PATH.
      (/[\\/]/.test(command) ? existsSync(command) : !!which(command));
  } catch {}
  return {
    name,
    where: file,
    registered,
    register: () => {
      const config = read();
      config[key] = { ...config[key], mockingbird: entry };
      replace(file, `${JSON.stringify(config, null, 2)}\n`);
    },
  };
}

/** Every agent found, with whether mockingbird is in its config. `command` is the full path to run. */
export function agents(command: string, deps: AgentDeps = {}): Agent[] {
  const home = deps.home ?? homedir();
  const which = deps.which ?? ((name: string) => Bun.which(name));
  const run = deps.run ?? runIt;
  const found: Agent[] = [];
  const stdio = { command, args: ["mcp"] };

  if (which("claude")) {
    // `mcp list` shows servers from `claude mcp add` and from plugins alike.
    const list = run(["claude", "mcp", "list"]);
    found.push({
      name: "Claude Code",
      where: "claude mcp add",
      registered: /^(plugin:[^\s:]+:)?mockingbird:/m.test(list.out),
      register: () => {
        const r = run([
          "claude",
          "mcp",
          "add",
          "--scope",
          "user",
          "mockingbird",
          "--",
          command,
          "mcp",
        ]);
        if (r.code !== 0) throw new Error(`claude mcp add failed: ${r.out.trim()}`);
      },
    });
  }
  if (existsSync(join(home, ".cursor"))) {
    found.push(jsonConfig("Cursor", join(home, ".cursor", "mcp.json"), "mcpServers", stdio, which));
  }
  if (existsSync(join(home, ".gemini"))) {
    found.push(
      jsonConfig("Gemini CLI", join(home, ".gemini", "settings.json"), "mcpServers", stdio, which),
    );
  }
  const vscode = join(home, "Library", "Application Support", "Code", "User");
  if (existsSync(vscode)) {
    found.push(
      jsonConfig(
        "VS Code",
        join(vscode, "mcp.json"),
        "servers",
        { type: "stdio", ...stdio },
        which,
      ),
    );
  }
  if (existsSync(join(home, ".codex"))) {
    // ponytail: TOML by hand, since appending one table needs no parser.
    const file = join(home, ".codex", "config.toml");
    // An unreadable config shows as not having mockingbird; register() then says why.
    let text = "";
    try {
      text = existsSync(file) ? readFileSync(file, "utf8") : "";
    } catch {}
    found.push({
      name: "Codex",
      where: file,
      // The table as TOML can name it: bare, "quoted" or 'literal'.
      registered: codexTable(text),
      register: () => {
        const before = existsSync(file) ? readFileSync(file, "utf8") : "";
        if (codexMentions(before)) {
          throw new Error(
            `${file} already mentions mockingbird in a form this doesn't read, so it was left alone. ` +
              `Check that its [mcp_servers.mockingbird] runs ${JSON.stringify(command)} with args ["mcp"].`,
          );
        }
        // A JSON string is a TOML basic string, quotes and backslashes alike.
        const table = `[mcp_servers.mockingbird]\ncommand = ${JSON.stringify(command)}\nargs = ["mcp"]\n`;
        const gap =
          before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
        replace(file, `${before}${gap}${table}`);
      },
    });
  }
  return found;
}
