# mockingbird docs

The [user guide](#user-guide) comes first: installing, connecting an agent,
every command, troubleshooting and privacy. After it, the
[design docs](#design-docs).

# User guide

## Quick start

You need a Mac with Apple Silicon, [Homebrew](https://brew.sh), about 3 GB of
free space, and an AI agent that speaks MCP (Claude Code, Codex, Cursor,
Gemini CLI, Claude Desktop, …). Without Homebrew, the installer offers to
install it, which needs an administrator account.

**1. Install**

```sh
curl -fsSL https://github.com/NirjharBhattacharjee/mockingbird/releases/latest/download/install.sh | bash
```

This installs Bun, whisper-cpp and ffmpeg with Homebrew, clones mockingbird
into `~/mockingbird` at the latest release, and runs `mockingbird models pull`
for the speech models (about 1.1 GB, each checked against its sha256). It
skips anything you already have, so it's safe to run again.
[Read the script](../scripts/install.sh) first if you like.

Or with Homebrew:

```sh
brew install nirjharbhattacharjee/mockingbird/mockingbird
mockingbird models pull
```

**2. Give it to your agents**

```sh
mockingbird setup
```

It finds Claude Code, Cursor, Codex, Gemini CLI and VS Code, and adds
mockingbird to each after asking, editing their config files rather than
replacing them. It also offers to install anything still missing. To add it
by hand instead, see [MCP.md](./MCP.md#register-it). Then ask your agent for
an edit: "cut a 60-second vertical short with captions from
~/Movies/talk.mp4".

`mockingbird doctor` checks every part and says how to fix what's broken.

### Updating

mockingbird never checks for updates itself: that would be a network call it
doesn't make. To update, run the install command again. It moves
`~/mockingbird` to the latest release and refuses if you've edited files
there. With Homebrew, `brew upgrade mockingbird`.

Updating from v0.3.2 or earlier removes dictation: the installer removes its
background agent and gives the Fn key back to macOS (after you log out). On
a Homebrew install the same happens by itself, the next time the old agent
starts. Your dictionary words are kept.

To test what's coming before it's released, install the beta:

```sh
curl -fsSL https://github.com/NirjharBhattacharjee/mockingbird/releases/latest/download/install.sh | MOCKINGBIRD_CHANNEL=beta bash
```

### Uninstalling

```sh
mockingbird uninstall
```

It lists what it will remove, with sizes, and asks once. It offers to keep
your dictionary in `~/mockingbird-dictionary.txt` before deleting
`~/.mockingbird`, removes the command and the PATH line the installer added,
and deletes `~/mockingbird` only if it's the installer's clone with no changes
of yours. A Homebrew install says to run `brew uninstall mockingbird`. It
never removes the Homebrew tools. `--yes` answers for you: remove
everything, keep a copy of the words.

By hand: `rm -rf ~/.mockingbird ~/mockingbird ~/.local/bin/mockingbird`
(after copying out anything you want), then delete the two lines the
installer added to your shell profile, under `# Added by the mockingbird
installer`.

### Manual install

```sh
brew install bun whisper-cpp ffmpeg go
git clone https://github.com/NirjharBhattacharjee/mockingbird.git
cd mockingbird
bun install
bun apps/daemon/src/cli.ts models pull
(cd apps/cli && go build -o mockingbird .)
mkdir -p ~/.local/bin
ln -sf "$PWD/apps/cli/mockingbird" ~/.local/bin/mockingbird
# If ~/.local/bin isn't on your PATH yet:
export PATH="$HOME/.local/bin:$PATH"
```

## Commands

| Command | Does |
|---|---|
| `mockingbird mcp` | Serves the editing tools to an agent over MCP. The agent starts it; you don't run it yourself. |
| `mockingbird transcribe <file>` | Prints a file's speech as `[mm:ss]` lines. `--words` gives each word's start and end, `--from`/`--to` (seconds) one stretch. |
| `mockingbird dictionary` | Lists the words it spells a particular way. `add "Nirjhar Bhattacharjee"`, `add "cat puck => Catppuccin"` (what it hears => what to write), `remove <term>`. |
| `mockingbird models` | Lists the Whisper models you have. `models use <file>` picks one, `--default` goes back. |
| `mockingbird models pull` | Downloads the speech models. With `setup`, the only commands that use the network. |
| `mockingbird setup` | Installs what's missing (ffmpeg, whisper-cpp, the models), then adds mockingbird to your coding agents. Asks before each step; `--yes` doesn't. |
| `mockingbird doctor` | Checks every part, names what's broken and how to fix it, and lists which agents have mockingbird. `--json` for agents. |
| `mockingbird status` | Whether the models, ffmpeg and whisper-server are installed. |
| `mockingbird uninstall` | Removes mockingbird, after asking. |

Settings, as environment variables:

| Variable | Default | Does |
|---|---|---|
| `MOCKINGBIRD_HOME` | `~/.mockingbird` | where models and `data.db` live |
| `MOCKINGBIRD_ASR_MODEL` | the one `models use` picked | a Whisper file in `models/`, or a path |
| `MOCKINGBIRD_LANGUAGE` | `en` | what's spoken: a code like `de` or `hi`, or `auto` |

## Troubleshooting

| Problem | Fix |
|---|---|
| The agent can't find `mockingbird` | Give its MCP config the full path: `command -v mockingbird` prints it. |
| `Whisper model not found` | `mockingbird models pull`. |
| `whisper-server not ready` | `brew install whisper-cpp`; `mockingbird status` checks. |
| A long file stops partway | The agent cut the call off. In Claude Code, raise `MCP_TOOL_TIMEOUT` (ms). |
| A name comes out wrong | `mockingbird dictionary add "<the right spelling>"`, or `"<what it writes> => <the right spelling>"`. |
| `command not found: bun` | Open a new terminal window. |

The first transcription on a Mac pauses about 15 seconds while macOS prepares
the GPU.

## Privacy

- Your footage is read where it is and never uploaded by mockingbird. The
  only downloads are `mockingbird models pull`.
- **The agent decides where results go.** A transcript returned to a cloud
  model goes to that model's provider. See [MCP.md](./MCP.md#where-your-text-goes).
- Stills from `frames` go to a temp folder; renders go beside the source and
  never overwrite a file.

More: [SECURITY_PRIVACY.md](./SECURITY_PRIVACY.md)

## Development

| Command | Does |
|---|---|
| `bun test` | Unit tests |
| `bun run test:integration` | All tests, with the real models, whisper-server and ffmpeg |
| `bun run typecheck` | Type-check |
| `bun run lint` / `bun run format` | Check / fix style |
| `bun run bench:models` | Compare Whisper models |
| `bun apps/daemon/src/cli.ts <cmd>` | The `mockingbird` command, from a clone |

Code lives in `apps/daemon` (the engine: commands and the MCP server) and
`packages/` (audio, speech detection, speech-to-text, captions, motion
graphics, storage). The agent skills are a submodule in `agent-skills/`; see
[AGENTS.md](../AGENTS.md).

# Design docs

- **[PHILOSOPHY.md](./PHILOSOPHY.md)** — why this exists and what it must
  never become: free, every feature, open to everyone, local-first.
- **[MCP.md](./MCP.md)** — the tools an agent gets, their options, and where
  results go.
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — stack, how an edit flows,
  rendering, layout, packaging, CI and the roadmap.
- **[SECURITY_PRIVACY.md](./SECURITY_PRIVACY.md)** — threat model, data
  inventory, network policy, and the open risks.
- **[MODELS.md](./MODELS.md)** — Silero VAD and Whisper: why these, measured.
- **[DATABASE.md](./DATABASE.md)** — `data.db`: the dictionary and settings.

At the repo root: **[../CONTRIBUTING.md](../CONTRIBUTING.md)**, required
reading before an issue or PR, and **[../SECURITY.md](../SECURITY.md)**, where
to report a vulnerability privately.

If code contradicts a doc, the doc is wrong and gets fixed in the same PR.
