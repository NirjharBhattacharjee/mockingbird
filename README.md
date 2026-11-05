<h3 align="center">
  <img src="docs/assets/wordmark.png" width="560" alt="mockingbird">
</h3>

<p align="center">
  The video editing engine for AI agents. Your agent edits real footage with it, on your computer. Free, every feature.
</p>

<p align="center">
  <a href="https://github.com/NirjharBhattacharjee/mockingbird/stargazers"><img src="https://img.shields.io/github/stars/NirjharBhattacharjee/mockingbird?style=for-the-badge&logo=starship&color=cba6f7&logoColor=cdd6f4&labelColor=313244" alt="stars"></a>
  <a href="https://github.com/NirjharBhattacharjee/mockingbird/commits/main"><img src="https://img.shields.io/github/last-commit/NirjharBhattacharjee/mockingbird?style=for-the-badge&logo=git&color=a6e3a1&logoColor=cdd6f4&labelColor=313244" alt="last commit"></a>
  <img src="https://img.shields.io/badge/runs%20on-macOS%20%C2%B7%20Linux%20%C2%B7%20Windows-89b4fa?style=for-the-badge&logoColor=cdd6f4&labelColor=313244" alt="macOS, Linux and Windows">
  <img src="https://img.shields.io/badge/runs-100%25%20local-fab387?style=for-the-badge&logo=lock&logoColor=cdd6f4&labelColor=313244" alt="runs 100% local">
  <img src="https://img.shields.io/badge/built%20with-Bun-f5e0dc?style=for-the-badge&logo=bun&logoColor=cdd6f4&labelColor=313244" alt="built with Bun">
  <img src="https://img.shields.io/badge/price-free%20forever-f38ba8?style=for-the-badge&logo=githubsponsors&logoColor=cdd6f4&labelColor=313244" alt="free forever">
  <img src="https://img.shields.io/badge/for-AI%20agents%20over%20MCP-b4befe?style=for-the-badge&logo=modelcontextprotocol&logoColor=cdd6f4&labelColor=313244" alt="for AI agents over MCP">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-94e2d5?style=for-the-badge&logo=opensourceinitiative&logoColor=cdd6f4&labelColor=313244" alt="MIT license"></a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/palette/macchiato.png" width="400" alt="">
</p>

Give your AI agent (Claude Code, Codex, Cursor, Gemini CLI, anything that
speaks MCP) a recording, and get back an edited video: cut on word
boundaries, framed for 9:16, with word-by-word captions, b-roll, music under
the speech, motion graphics written as code, and loudness set for the feed.
mockingbird does the transcribing and rendering on your Mac; your agent
decides the edit. No account, no cloud, no usage limits, nothing locked
([why](docs/PHILOSOPHY.md)).

> [!NOTE]
> **Changing direction.** Until v0.3.2 mockingbird was voice dictation. That's
> gone ([#134](https://github.com/NirjharBhattacharjee/mockingbird/issues/134) has the plan and the reasons). What's here now: transcription,
> stills, captions, cutting and framing, motion graphics and rendering over
> MCP. A timeline, effects, Linux and Windows are on the roadmap.

## 🚀 Install

You need about 3 GB of free space, and a Mac (with [Homebrew](https://brew.sh)),
Linux (with git, ffmpeg and unzip from your package manager) or Windows x64.
Captions and motion graphics are macOS only for now.

```sh
curl -fsSL https://github.com/NirjharBhattacharjee/mockingbird/releases/latest/download/install.sh | bash
```

On Windows, in PowerShell:

```powershell
irm https://github.com/NirjharBhattacharjee/mockingbird/releases/latest/download/install.ps1 | iex
```

It's safe to run again. Prefer to do it by hand? See
[manual install](docs/README.md#manual-install).

The binary isn't notarized yet. That doesn't matter for this command or
Homebrew, but a copy downloaded in a browser gets blocked by macOS; see
[the fix](docs/README.md#apple-could-not-verify-mockingbird).

Or with Homebrew:

```sh
brew install nirjharbhattacharjee/mockingbird/mockingbird
mockingbird models pull
```

### Unsigned binaries

The release binaries aren't signed by Apple or Microsoft yet: that needs a
paid developer account and certificate, which is the maintainer's call, not
something users pay for. The installers and Homebrew never hit a warning,
because they download with `curl` or PowerShell, which don't mark files as
coming from the internet; Homebrew builds from source.

A binary you download yourself in a browser is marked, and then:

- **macOS** stops it: `zsh: killed` in a terminal, or "can't be opened
  because Apple cannot check it" from Finder. Clear the mark with
  `xattr -d com.apple.quarantine mockingbird-darwin-arm64`.
- **Windows** SmartScreen shows "Windows protected your PC". Choose
  **More info → Run anyway**, or run `Unblock-File mockingbird-windows-x64.exe`
  in PowerShell.

Each binary's sha256 is in the release's `checksums.txt`.

### With a coding agent

Paste this into your agent:

```text
Set up mockingbird on this Mac by following
https://raw.githubusercontent.com/NirjharBhattacharjee/mockingbird/main/docs/AGENT_INSTALL.md
```

It runs the installer, checks it, and connects mockingbird to itself.

### Updating

Run the same install command again, or `brew upgrade mockingbird`.
mockingbird never checks for updates on its own. Updating from v0.3.2 or
earlier removes dictation's background agent and keeps your dictionary.

To remove it, follow [Uninstalling](docs/README.md#uninstalling).

## 🎬 Use it

Connect it to your agents once:

```sh
mockingbird setup
```

It adds mockingbird to Claude Code, Cursor, Codex, Gemini CLI and VS Code,
whichever you have, after asking. By hand: [MCP.md](docs/MCP.md#register-it).
`mockingbird doctor` checks the install. Then ask:

> Cut a 60-second vertical short with captions from ~/Movies/talk.mp4.

The agent transcribes the video, picks the moment, gets the word times,
looks at stills to frame the speaker, makes the captions and renders. The
editing know-how (hooks, pacing, caption style, motion design) comes with it:
any agent gets it through the `guide` tool, and Claude Code can also install
it as a plugin, from [`plugin/`](plugin/README.md):

```text
/plugin marketplace add NirjharBhattacharjee/mockingbird
/plugin install mockingbird@mockingbird
```

## 🧰 Tools

| Tool | Does |
|---|---|
| `transcribe` | Timestamped lines, or each word's start and end, with names spelled your way |
| `frames` | Stills from a video, for the agent to look at |
| `captions` | Word-by-word captions timed to the finished cut |
| `render` | Cuts, framing, 9:16 or split layout, captions, titles, b-roll, music and sound effects, −14 LUFS |
| `motion` | Motion graphics as code (the Canvas 2D API), rendered to video |
| `guide` | A playbook for one job: shorts, long-form, hooks, captions, motion graphics, review |
| `status`, `dictionary_list`, `dictionary_add` | What's installed; names to spell right |

Every option: [docs/MCP.md](docs/MCP.md). On the command line,
`mockingbird transcribe`, `dictionary`, `models` and `status` do the same, and
`mockingbird doctor` checks the whole install.
`mockingbird record voiceover.wav` records a voiceover from the mic.

Something not working? See [troubleshooting](docs/README.md#troubleshooting).

## 📚 More

[MIT](LICENSE). Use it, change it, share it.
