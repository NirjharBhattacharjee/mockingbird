import { describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agents, codexMentions } from "../src/agents.ts";
import { PLUGIN } from "../src/guide.ts";
import { pinnedChrome } from "../src/models.ts";
import { DEFAULT_ASR_MODEL } from "../src/runtime.ts";
import { checks, commandPath, doctor, setup } from "../src/setup.ts";

/** A home with Cursor, Gemini CLI, VS Code and Codex folders, `mockingbird` in .local/bin, and no `claude` command. */
function home() {
  const dir = mkdtempSync(join(tmpdir(), "mb-setup-"));
  for (const d of [
    ".cursor",
    ".gemini",
    ".codex",
    "Library/Application Support/Code/User",
    ".local/bin",
  ]) {
    mkdirSync(join(dir, d), { recursive: true });
  }
  writeFileSync(join(dir, ".local/bin/mockingbird"), "");
  return dir;
}
const mbAt = (h: string) => join(h, ".local/bin/mockingbird");
const none = () => null;

describe("agents", () => {
  test("adds mockingbird to each config, keeping what's there", () => {
    const h = home();
    writeFileSync(join(h, ".cursor", "mcp.json"), '{"mcpServers":{"other":{"command":"x"}}}');
    writeFileSync(join(h, ".codex", "config.toml"), 'model = "o4"\n');
    const found = agents(mbAt(h), { home: h, which: none });
    expect(found.map((a) => [a.name, a.registered])).toEqual([
      ["Cursor", false],
      ["Gemini CLI", false],
      ["VS Code", false],
      ["Codex", false],
    ]);
    for (const a of found) a.register();
    const cursor = JSON.parse(readFileSync(join(h, ".cursor", "mcp.json"), "utf8"));
    expect(cursor.mcpServers).toEqual({
      other: { command: "x" },
      mockingbird: { command: mbAt(h), args: ["mcp"] },
    });
    const vscode = join(h, "Library/Application Support/Code/User/mcp.json");
    expect(JSON.parse(readFileSync(vscode, "utf8")).servers.mockingbird.type).toBe("stdio");
    expect(readFileSync(join(h, ".codex", "config.toml"), "utf8")).toBe(
      `model = "o4"\n\n[mcp_servers.mockingbird]\ncommand = ${JSON.stringify(mbAt(h))}\nargs = ["mcp"]\n`,
    );
    // Run again: each one now has it, and nothing is added twice.
    expect(agents(mbAt(h), { home: h, which: none }).every((a) => a.registered)).toBe(true);
  });

  test("a command written as a Windows path is a path, not a name to look up", () => {
    const h = home();
    writeFileSync(
      join(h, ".cursor", "mcp.json"),
      JSON.stringify({ mcpServers: { mockingbird: { command: "C:\\gone\\mockingbird.exe" } } }),
    );
    // `which` finds it, as the old check looked it up by name; but the path it
    // names doesn't exist, so it isn't registered. Nothing else is found, so no
    // agent's own command (claude) is run.
    const which = (name: string) => (name.includes("\\") ? "/usr/bin/x" : null);
    const cursor = agents("mb", { home: h, which }).find((a) => a.name === "Cursor");
    expect(cursor?.registered).toBe(false);
  });

  test("a symlinked, private config is written where it points, still private", () => {
    const h = home();
    const real = join(h, "dotfiles-gemini.json");
    writeFileSync(real, '{"mcpServers":{}}', { mode: 0o600 });
    symlinkSync(real, join(h, ".gemini", "settings.json"));
    agents("mb", { home: h, which: none })
      .find((a) => a.name === "Gemini CLI")
      ?.register();
    expect(lstatSync(join(h, ".gemini", "settings.json")).isSymbolicLink()).toBe(true);
    expect(JSON.parse(readFileSync(real, "utf8")).mcpServers.mockingbird.command).toBe("mb");
    // Windows has no POSIX modes: every file reads as 0o666 there.
    if (process.platform !== "win32") expect(statSync(real).mode & 0o777).toBe(0o600);
  });

  test("an empty config file counts as no servers yet", () => {
    const h = home();
    writeFileSync(join(h, ".cursor", "mcp.json"), "");
    const cursor = agents("mb", { home: h, which: none }).find((a) => a.name === "Cursor");
    cursor?.register();
    expect(
      JSON.parse(readFileSync(join(h, ".cursor", "mcp.json"), "utf8")).mcpServers.mockingbird
        .command,
    ).toBe("mb");
  });

  test("a config that isn't plain JSON is left alone, with what to add", () => {
    const h = home();
    const file = join(h, ".cursor", "mcp.json");
    writeFileSync(file, "{ // mine\n}");
    const cursor = agents("mb", { home: h, which: none }).find((a) => a.name === "Cursor");
    expect(() => cursor?.register()).toThrow(
      'isn\'t plain JSON, so it was left alone. Add this to it: {"mcpServers"',
    );
    expect(readFileSync(file, "utf8")).toBe("{ // mine\n}");
  });

  test("Codex's table counts however TOML names it, and another mention is left alone", () => {
    const h = home();
    const file = join(h, ".codex", "config.toml");
    const codex = () => agents("mb", { home: h, which: none }).find((a) => a.name === "Codex");
    writeFileSync(file, '[mcp_servers."mockingbird"]\ncommand = "mb"\n');
    expect(codex()?.registered).toBe(true);
    writeFileSync(file, '[mcp_servers]\nmockingbird = { command = "mb" }\n');
    expect(codex()?.registered).toBe(false);
    expect(() => codex()?.register()).toThrow("already mentions mockingbird");
    expect(readFileSync(file, "utf8")).toBe('[mcp_servers]\nmockingbird = { command = "mb" }\n');
  });

  test("only a mention under mcp_servers would clash with Codex's table", () => {
    expect(codexMentions('[projects."/Users/me/mockingbird"]\ntrust_level = "trusted"\n')).toBe(
      false,
    );
    expect(codexMentions("# mockingbird was here\n")).toBe(false);
    expect(codexMentions('[mcp_servers]\nmockingbird = { command = "mb" }\n')).toBe(true);
    expect(codexMentions('mcp_servers.mockingbird.command = "mb"\n')).toBe(true);
    expect(codexMentions('mcp_servers = { mockingbird = { command = "mb" } }\n')).toBe(true);
    expect(codexMentions('[mcp_servers.other]\ncommand = "mockingbird"\n')).toBe(false);
  });

  test('a quoted ["mcp_servers"] table is the same table to Codex', () => {
    expect(codexMentions('["mcp_servers"]\nmockingbird = { command = "mb" }\n')).toBe(true);
    const h = home();
    writeFileSync(
      join(h, ".codex", "config.toml"),
      '[ "mcp_servers" . \'mockingbird\' ]\ncommand = "mb"\n',
    );
    expect(agents("mb", { home: h, which: none }).find((a) => a.name === "Codex")?.registered).toBe(
      true,
    );
  });

  test("a Windows .cmd shim is registered through cmd /c, and one run directly is repaired", () => {
    const h = home();
    const shim = join(h, "mockingbird.cmd");
    writeFileSync(shim, "");
    // Written the old way: Node's spawn can't start a .cmd, so it doesn't count.
    writeFileSync(
      join(h, ".cursor", "mcp.json"),
      JSON.stringify({ mcpServers: { mockingbird: { command: shim, args: ["mcp"] } } }),
    );
    let argv: string[] = [];
    const which = (n: string) => (n === "claude" ? "/bin/claude" : null);
    const run = (a: string[]) => {
      if (a[2] === "add") argv = a;
      return { code: 0, out: "" };
    };
    const found = agents(shim, { home: h, which, run });
    expect(found.find((a) => a.name === "Cursor")?.registered).toBe(false);
    for (const a of found) a.register();
    expect(argv.slice(argv.indexOf("--") + 1)).toEqual(["cmd", "/c", shim, "mcp"]);
    const cursor = JSON.parse(readFileSync(join(h, ".cursor", "mcp.json"), "utf8"));
    expect(cursor.mcpServers.mockingbird).toEqual({ command: "cmd", args: ["/c", shim, "mcp"] });
    expect(readFileSync(join(h, ".codex", "config.toml"), "utf8")).toContain(
      `command = "cmd"\nargs = ${JSON.stringify(["/c", shim, "mcp"])}\n`,
    );
    const again = agents(shim, { home: h, which: none });
    expect(again.find((a) => a.name === "Cursor")?.registered).toBe(true);
  });

  test("Claude Code counts as having it through `claude mcp add` or the plugin", () => {
    const empty = mkdtempSync(join(tmpdir(), "mb-setup-"));
    const claude = (out: string) =>
      agents("mb", {
        home: empty,
        which: (n) => (n === "claude" ? "/bin/claude" : null),
        run: () => ({ code: 0, out }),
      })[0];
    expect(claude("other: x - ✔ Connected\n")?.registered).toBe(false);
    expect(claude("mockingbird: mockingbird mcp - ✔ Connected\n")?.registered).toBe(true);
    expect(claude("plugin:mockingbird:mockingbird: /p/launch - ✔ Connected\n")?.registered).toBe(
      true,
    );
  });
});

test("setup finds install.ps1's shim when a shell from before the install has no PATH to it", () => {
  const h = mkdtempSync(join(tmpdir(), "mb-setup-"));
  const mb = join(h, ".mockingbird");
  mkdirSync(join(mb, "bin"), { recursive: true });
  writeFileSync(join(mb, "bin", "mockingbird.cmd"), "");
  expect(commandPath({ home: h, mbHome: mb, which: none })).toBe(
    join(mb, "bin", "mockingbird.cmd"),
  );
});

test("setup installs missing tools and models after asking, then adds the agents", async () => {
  const h = home();
  const mb = join(h, ".mockingbird");
  const ran: string[] = [];
  const asked: string[] = [];
  let pulled = false;
  let chromePulled = false;
  const tools = new Set(["brew"]);
  const code = await setup([], {
    home: h,
    mbHome: mb,
    env: {},
    which: (n) => (tools.has(n) ? `/opt/homebrew/bin/${n}` : null),
    run: (argv) => {
      ran.push(argv.join(" "));
      if (argv[0] === "brew") for (const t of ["ffmpeg", "whisper-server"]) tools.add(t);
      return { code: 0, out: argv[0] === "ffmpeg" ? "libx264" : "" };
    },
    ask: (q) => {
      asked.push(q);
      return true;
    },
    pull: async () => {
      pulled = true;
      mkdirSync(join(mb, "models"), { recursive: true });
      writeFileSync(join(mb, "models", "silero_vad.onnx"), "");
      writeFileSync(join(mb, "models", DEFAULT_ASR_MODEL), "");
      return 0;
    },
    pullChrome: async () => {
      chromePulled = true;
      return 0;
    },
    log: () => {},
  });
  expect(asked[0]).toBe("Install ffmpeg and whisper-cpp with Homebrew? [Y/n]");
  expect(asked[1]).toMatch(
    // 1.1 GB on an Apple Silicon Mac, 0.2 GB where the default is small (#202).
    /^Download the speech models \(up to [\d.]+ GB\) from huggingface\.co and github\.com\?/,
  );
  // Chrome is offered wherever there's a pinned build for it.
  const chromeAsked = !!pinnedChrome(mb);
  if (chromeAsked) expect(asked[2]).toMatch(/^Download the headless Chrome .* \[Y\/n\]$/);
  expect(chromePulled).toBe(chromeAsked);
  expect(asked.at(-1)).toBe("Add mockingbird to Cursor, Gemini CLI, VS Code, Codex? [Y/n]");
  expect(ran).toContain("brew install ffmpeg whisper-cpp");
  expect(pulled).toBe(true);
  expect(existsSync(join(h, ".gemini", "settings.json"))).toBe(true);
  // This pull writes an empty VAD file, and doctor's sha256 check catches it.
  expect(code).toBe(1);
  expect(
    checks({ home: h, mbHome: mb }).find((c) => c.name === "speech detection model")?.detail,
  ).toBe("missing or damaged");
});

test("a no to the download still adds the agents, and setup exits 1 for the missing models", async () => {
  const h = home();
  const code = await setup([], {
    home: h,
    mbHome: join(h, ".mockingbird"),
    which: (n) => `/opt/homebrew/bin/${n}`,
    run: () => ({ code: 0, out: "libx264" }),
    ask: (q) => !q.startsWith("Download"),
    log: () => {},
  });
  expect(code).toBe(1);
  expect(existsSync(join(h, ".cursor", "mcp.json"))).toBe(true);
});

test("doctor checks Chrome, which MOCKINGBIRD_CHROME can stand in for", () => {
  const h = home();
  const chrome = (env: Record<string, string>) =>
    checks({ home: h, mbHome: join(h, "mb"), which: none, env }).find((c) => c.name === "chrome");
  expect(chrome({})).toMatchObject({
    ok: false,
    needed: false,
    fix: "`mockingbird models pull chrome`",
  });
  expect(chrome({ MOCKINGBIRD_CHROME: process.execPath })).toMatchObject({
    ok: true,
    detail: process.execPath,
  });
});

test("an empty or cut-short pinned speech model counts as damaged", () => {
  const h = home();
  const mb = join(h, "mb");
  mkdirSync(join(mb, "models"), { recursive: true });
  writeFileSync(join(mb, "models", DEFAULT_ASR_MODEL), "");
  const speech = checks({ home: h, mbHome: mb, which: none, env: {} }).find(
    (c) => c.name === "speech model",
  );
  expect(speech).toMatchObject({
    ok: false,
    detail: `${DEFAULT_ASR_MODEL} is damaged or incomplete`,
  });
});

test("doctor's needed checks name a fix", () => {
  const h = home();
  const broken = checks({ home: h, mbHome: join(h, "mb"), which: none }).filter(
    (c) => !c.ok && c.needed,
  );
  expect(broken.map((c) => [c.name, c.fix])).toEqual([
    ["ffmpeg", "install ffmpeg"],
    ["whisper-server", "install whisper-cpp"],
    [
      "speech model",
      "`mockingbird models pull`, or set MOCKINGBIRD_ASR_MODEL to a model that's there",
    ],
    ["speech detection model", "`mockingbird models pull`"],
  ]);
});

test("a model MOCKINGBIRD_ASR_MODEL points at outside models/ counts", () => {
  const h = home();
  const model = join(h, "ggml-mine.bin");
  writeFileSync(model, "");
  const speech = checks({
    home: h,
    mbHome: join(h, "mb"),
    which: none,
    env: { MOCKINGBIRD_ASR_MODEL: model },
  }).find((c) => c.name === "speech model");
  expect(speech).toMatchObject({ ok: true, detail: "ggml-mine.bin" });
});

test("--help shows help, and an unknown option stops before anything runs", async () => {
  const lines: string[] = [];
  const deps = {
    log: (l: string) => lines.push(l),
    run: () => {
      throw new Error("ran something");
    },
  };
  expect(await setup(["--help", "--yes"], deps)).toBe(0);
  expect(doctor(["-h"], deps)).toBe(0);
  expect(lines.join("\n")).toContain("usage: mockingbird setup [--yes]");
  expect(lines.join("\n")).toContain("usage: mockingbird doctor [--json]");
  expect(setup(["--yse"], deps)).rejects.toThrow('unknown option "--yse"');
  expect(() => doctor(["--jsno"], deps)).toThrow('unknown option "--jsno"');
});

test("the plugin's launcher answers MCP itself when mockingbird isn't installed", () => {
  const requests = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: "b", method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "install_mockingbird" } },
    { jsonrpc: "2.0", id: 4, method: "resources/list", params: { method: "ping" } },
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "transcribe" } },
  ];
  // Windows runs launch.cmd, which hands this to launch.ps1 when mockingbird isn't installed (#202).
  const server =
    process.platform === "win32"
      ? [
          "powershell",
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          join(PLUGIN, "launch.ps1"),
        ]
      : ["sh", join(PLUGIN, "launch")];
  const r = Bun.spawnSync(server, {
    stdin: Buffer.from(`${requests.map((m) => JSON.stringify(m)).join("\n")}\n`),
    env:
      process.platform === "win32"
        ? process.env
        : { HOME: mkdtempSync(join(tmpdir(), "mb-setup-")), PATH: "/usr/bin:/bin" },
  });
  const said = r.stdout.toString().trim();
  // No reply at all: show why, not a JSON parse error (#215).
  if (!said) throw new Error(`the launcher exited ${r.exitCode} with no reply: ${r.stderr}`);
  const replies = said.split("\n").map((l) => JSON.parse(l));
  expect(replies.map((m) => m.id)).toEqual([1, "b", 3, 4, 5]);
  expect(replies[0].result.protocolVersion).toBe("2025-06-18");
  expect(replies[0].result.instructions).toContain("isn't installed");
  expect(replies[1].result.tools[0].name).toBe("install_mockingbird");
  expect(replies[2].result.content[0].text).toContain("AGENT_INSTALL.md");
  // The method is the request's, not one inside its params.
  expect(replies[3].error.code).toBe(-32601);
  expect(replies[4].error.code).toBe(-32602);
  // PowerShell can take seconds to start on a busy Windows runner (#215).
}, 30_000);
