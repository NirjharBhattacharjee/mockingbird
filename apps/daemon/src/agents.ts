/**
 * The coding agents on this computer, and mockingbird's MCP server in each
 * one's config (#141). Only agents whose config folder or command exists
 * are listed. A config is edited, never replaced: one that can't be read
 * is left alone, with what to add by hand.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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

/** Written beside it and renamed over it, so a write cut short never leaves half a config. */
function replace(file: string, text: string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.mockingbird-tmp`, text);
  renameSync(`${file}.mockingbird-tmp`, file);
}

const runIt = (argv: string[]) => {
  const r = Bun.spawnSync(argv, { stderr: "pipe" });
  return { code: r.exitCode, out: `${r.stdout}${r.stderr}` };
};

/** A JSON config with servers under `key`: Cursor's and Gemini CLI's `mcpServers`, VS Code's `servers`. */
function jsonConfig(name: string, file: string, key: string, entry: object): Agent {
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
    registered = typeof command === "string" && (!command.includes("/") || existsSync(command));
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
    found.push(jsonConfig("Cursor", join(home, ".cursor", "mcp.json"), "mcpServers", stdio));
  }
  if (existsSync(join(home, ".gemini"))) {
    found.push(
      jsonConfig("Gemini CLI", join(home, ".gemini", "settings.json"), "mcpServers", stdio),
    );
  }
  const vscode = join(home, "Library", "Application Support", "Code", "User");
  if (existsSync(vscode)) {
    found.push(
      jsonConfig("VS Code", join(vscode, "mcp.json"), "servers", { type: "stdio", ...stdio }),
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
      registered:
        /^\s*\[\s*mcp_servers\s*\.\s*(mockingbird|"mockingbird"|'mockingbird')\s*\]/m.test(text),
      register: () => {
        // Any other mention (an inline table, a [mcp_servers] key) would
        // become a duplicate, and Codex rejects a config with one.
        const before = existsSync(file) ? readFileSync(file, "utf8") : "";
        if (/mockingbird/.test(before.replace(/^\s*#.*$/gm, ""))) {
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
