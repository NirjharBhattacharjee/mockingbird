# Set up mockingbird with a coding agent

This page is written for an AI agent (Claude Code, Codex, Cursor, Gemini CLI,
or any agent that can run shell commands) that a person has asked to set up
mockingbird on their Mac. If you're that person, paste this into your agent:

```text
Set up mockingbird on this Mac by following
https://raw.githubusercontent.com/NirjharBhattacharjee/mockingbird/main/docs/AGENT_INSTALL.md
```

mockingbird is a video editing engine for AI agents: it gives you tools to
transcribe, cut, caption, animate and render the person's footage, on their
Mac. The installer and the model download (by `models pull`, or by `setup`
after asking) are its only network use.

## Rules for the agent

- Run the steps in order. Each says how to tell whether it worked.
- Never use `sudo`. Nothing here needs it.
- Don't change anything the person didn't ask for: not their shell profile,
  not system settings, not the code. Where a step offers a change, ask first.

## 1. Check the Mac

```sh
uname -sm
command -v brew || ls /opt/homebrew/bin/brew
df -h "$HOME" | awk 'NR==2 {print "free:", $4}'
ls -l ~/.local/bin/mockingbird 2>/dev/null && ~/.local/bin/mockingbird status
```

- `uname -sm` must print `Darwin arm64`. Anything else isn't supported: tell
  the person mockingbird needs a Mac with Apple Silicon, and stop.
- The `brew` line must print a path. If only `/opt/homebrew/bin/brew` exists,
  Homebrew is installed but not on your PATH: start each command below with
  `eval "$(/opt/homebrew/bin/brew shellenv)" && `. If neither exists,
  **(person)** Homebrew's installer asks for their password, so ask them to
  install it from <https://brew.sh> and tell you when it's done, then check
  again.
- `free:` must be at least 3G (or 3Gi; Ti is plenty). If it's less, tell the
  person how much is free and that mockingbird needs about 3 GB, and stop.
- If the last command printed anything, mockingbird is already installed.
  Ask the person whether to update it with step 2 or go to step 3. Don't
  reinstall without asking: step 2 replaces `~/.local/bin/mockingbird`,
  including a link to their own copy of the code if that's what it is
  (`ls -l` shows the target).

## 2. Install

The installer clones the code into `~/mockingbird`, installs Bun, whisper-cpp
and ffmpeg with Homebrew, downloads the speech models into `~/.mockingbird`, and puts the `mockingbird` command in `~/.local/bin`. If
that folder isn't on the PATH, it adds it to the shell's profile: `~/.zshrc`
for zsh, or for bash whichever of `~/.bash_profile`, `~/.bash_login` and
`~/.profile` bash reads. New terminal windows pick it up. The first run
downloads about 1.1 GB, so it usually takes a few minutes.

First download the installer, and check this command succeeds. If it prints
`curl: (...)`, nothing was installed: check the network and try again.

```sh
mkdir -p ~/.mockingbird && rm -f ~/.mockingbird/install.out
curl -fsSL https://github.com/NirjharBhattacharjee/mockingbird/releases/latest/download/install.sh -o ~/.mockingbird/install.sh
```

It goes in the person's own folder rather than `/tmp`, where another account
on the Mac could swap the file before it runs.

Then run it in the background, so a time limit on your commands can't cut it
off. This returns at once:

```sh
nohup bash -c 'bash ~/.mockingbird/install.sh; echo "exit=$?"' > ~/.mockingbird/install.out 2>&1 &
```

Check on it every 30 to 60 seconds (wait between checks with your tool's own
wait or `sleep 30`):

```sh
tail -n 8 ~/.mockingbird/install.out
```

It has finished when the last line is `exit=` and a number. Before that it's
still working, even if a step has failed: it waits for every step to end.

- **`exit=0`:** it worked. Each step has a line starting `✓`, then `All set.`
- **Any other number:** it failed. The output names the failed step and shows
  the end of its log. Every step's full log is in
  `~/.mockingbird/logs/install-<step>.log`. See
  [If something fails](#if-something-fails), then run step 2 again: finished
  steps are skipped.
- Run `grep -A1 'note:' ~/.mockingbird/install.out`. If it says
  `~/.local/bin` isn't on the PATH, tell the person. That happens when their
  shell isn't zsh or bash, or the installer couldn't write the profile.
  They should add the `export PATH=...` line it shows to their shell profile,
  or you can, if they say so. The steps below use the full path either way.

## 3. Check it

```sh
~/.local/bin/mockingbird doctor
```

It exits 0 when everything mockingbird needs is there. A line starting `✗`
is something missing, with a `fix:` line under it: run that, or run step 2
again. A line starting `!` is optional. The last lines list the coding agents
on this Mac and whether each has mockingbird. `--json` gives the same as
JSON.

## 4. Connect it to yourself

```sh
~/.local/bin/mockingbird doctor --json
```

If your own entry under `agents` says `"registered": false`, ask the person
whether to add mockingbird to the agents it found, then:

```sh
~/.local/bin/mockingbird setup --yes
```

It adds the MCP server to each agent's config (Claude Code with `claude mcp
add`; Cursor, Gemini CLI, VS Code and Codex in their config files, which it
edits rather than replaces). If you're not in that list, the server is the
command `~/.local/bin/mockingbird` with the argument `mcp`, over stdio;
[MCP.md](./MCP.md#register-it) has the JSON. Write the full path: JSON
configs don't expand `~`. Most agents load MCP servers at start, so tell the
person to restart you, then call the `status` tool to check.

For Claude Code, the plugin is another way in: `/plugin marketplace add
NirjharBhattacharjee/mockingbird`, then `/plugin install mockingbird@mockingbird`.
It brings the skills too. Use one or the other, not both, or every tool shows
up twice.

## 5. Hand it over

Tell the person it's ready, and that they can ask for an edit, for example:
"cut a 60-second vertical short with captions from ~/Movies/talk.mp4".

## If something fails

| What you see | What to do |
|---|---|
| `mockingbird runs on macOS, Linux and Windows` or `needs a 64-bit ... processor` | Not supported. Stop. |
| `mockingbird needs git ffmpeg ...` (Linux) | **(person)** Ask them to install those with their package manager (it needs their password), then step 2 again. |
| `Homebrew is needed first` | See step 1's `brew` check. |
| `... has local changes, so it wasn't updated` | The person edited `~/mockingbird`. Ask before discarding anything. Never run `git checkout` or `git reset` there on your own. |
| `error: <step> failed` | Read `~/.mockingbird/logs/install-<step>.log`. For a network error, run step 2 again. |
| `curl: (...)` when starting step 2 | The installer didn't download, so nothing ran. Check the network, then step 2 again. |
| `command not found: mockingbird` | Use `~/.local/bin/mockingbird`. |
| The `status` tool isn't there after a restart | The MCP config has the wrong path, or wasn't reloaded. |

More detail for people: [the user guide](./README.md), especially
[Troubleshooting](./README.md#troubleshooting).
