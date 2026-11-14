# Set up mockingbird with a coding agent

This page is written for an AI agent (Claude Code, Codex, Cursor, Gemini CLI,
or any agent that can run shell commands) that a person has asked to set up
mockingbird on their computer, a Mac, Linux or Windows. If you're that
person, paste this into your agent:

```text
Set up mockingbird on this computer by following
https://raw.githubusercontent.com/NirjharBhattacharjee/mockingbird/main/docs/AGENT_INSTALL.md
```

mockingbird is a video editing engine for AI agents. It gives you tools to
transcribe, cut, caption, animate and render the person's footage, on their
computer. The installer and the model download (by `models pull`, or by
`setup` after asking) are its only network use.

## Rules for the agent

- Find out which system you're on, then follow only that system's part of
  each step. macOS and Linux share commands. Windows has its own.
- Run the steps in order. Each says how to tell whether it worked.
- Never use `sudo`, or run anything as administrator. Where something needs
  the person's password, the step says so and they do it.
- Don't change anything the person didn't ask for. That covers their shell
  profile, system settings and the code. Where a step offers a change, ask
  first.

On Windows the commands are PowerShell. If your shell is bash (Claude Code
runs commands in Git Bash on Windows), save each block as a `.ps1` file in
`~\.mockingbird` and run it with
`powershell -NoProfile -ExecutionPolicy Bypass -File <that file>`.

## 1. Check the computer

### macOS and Linux

```sh
uname -sm
command -v brew || ls /opt/homebrew/bin/brew /usr/local/bin/brew 2>/dev/null
for t in git curl ffmpeg unzip; do command -v "$t" >/dev/null || echo "missing: $t"; done
df -h "$HOME" | awk 'NR==2 {print "free:", $4}'
ls -l ~/.local/bin/mockingbird 2>/dev/null && ~/.local/bin/mockingbird status
```

- `uname -sm` must print one of `Darwin arm64`, `Darwin x86_64`,
  `Linux x86_64` or `Linux aarch64`. Anything else isn't supported, so tell
  the person and stop. Chrome has no Linux ARM build, so there motion
  graphics need a Chrome the person points `MOCKINGBIRD_CHROME` at, and
  captions become a subtitle track. Tell the person before going on.
- **On a Mac**, the `brew` line must print a path. If it only lists
  `/opt/homebrew/bin/brew` or `/usr/local/bin/brew`, Homebrew is installed
  but not on your PATH. Start each command below with
  `eval "$(<that path> shellenv)" && `. If it prints nothing,
  **(person)** Homebrew's installer asks for their password, so ask them to
  install it from <https://brew.sh> and tell you when it's done, then check
  again. Ignore the `missing:` lines on a Mac, since Homebrew brings ffmpeg.
- **On Linux**, the `brew` line doesn't matter, but there must be no
  `missing:` lines. If there are, **(person)** ask them to install those with
  their package manager (for example `sudo apt install git curl ffmpeg unzip`,
  which needs their password), then check again.
- `free:` must be at least 3G (or 3Gi; T or Ti is plenty). If it's less, tell
  the person how much is free and that mockingbird needs about 3 GB, and stop.
- If the last command printed anything, mockingbird is already installed. See
  [Already installed](#already-installed).

### Windows

```powershell
$env:PROCESSOR_ARCHITECTURE
Get-Command winget, git, ffmpeg -ErrorAction SilentlyContinue | ForEach-Object Name
"free: {0:N1} GB" -f ((Get-PSDrive $HOME.Substring(0, 1)).Free / 1GB)
$mb = "$HOME\.mockingbird\bin\mockingbird.cmd"
if (Test-Path $mb) { & $mb status }
```

- The first line must print `AMD64`. Windows on ARM isn't supported yet, so
  tell the person and stop.
- The list must include `winget`, or both `git` and `ffmpeg`. The installer
  uses winget to get whichever of Git and ffmpeg is missing, and Windows may
  ask the person to allow that. If neither is there, **(person)** ask them to
  install App Installer from the Microsoft Store, which brings winget, and
  check again.
- `free:` must be at least 3 GB. If it's less, tell the person how much is
  free and that mockingbird needs about 3 GB, and stop.
- If the last line printed anything, mockingbird is already installed. See
  [Already installed](#already-installed).

### Already installed

Ask the person whether to update it with step 2 or go to step 3. Don't
reinstall without asking. On macOS and Linux, step 2 replaces
`~/.local/bin/mockingbird`, including a link to their own copy of the code
if that's what it is (`ls -l` shows the target).

## 2. Install

The installer clones the code into `~/mockingbird`, installs Bun and ffmpeg,
downloads the speech models and whisper-server into `~/.mockingbird`, and
puts the `mockingbird` command on the PATH. The first run downloads about
1.1 GB, so it usually takes a few minutes. Where the tools come from:

- **macOS:** Bun, whisper-cpp and ffmpeg from Homebrew.
- **Linux:** Bun from its own pinned release. Git and ffmpeg are the ones
  from step 1.
- **Windows:** Git and ffmpeg from winget, Bun from its own pinned release.

You download the installer into the person's own folder rather than a temp
folder, where another account could swap the file before it runs. Then you
run it in the background, so a time limit on your commands can't cut it off.

### macOS and Linux

Download it, and check this command succeeds. If it prints `curl: (...)`,
nothing was installed, so check the network and try again.

```sh
mkdir -p ~/.mockingbird && rm -f ~/.mockingbird/install.out
curl -fsSL https://github.com/NirjharBhattacharjee/mockingbird/releases/latest/download/install.sh -o ~/.mockingbird/install.sh
```

Then start it. This returns at once:

```sh
nohup bash -c 'bash ~/.mockingbird/install.sh; echo "exit=$?"' > ~/.mockingbird/install.out 2>&1 &
```

Check on it every 30 to 60 seconds (wait between checks with your tool's own
wait or `sleep 30`):

```sh
tail -n 8 ~/.mockingbird/install.out
```

It has finished when the last line is `exit=` and a number. Before that it's
still working, even if a step has failed, because it waits for every step to
end.

- **`exit=0`:** it worked. Each step has a line starting `✓`, then `All set.`
- **Any other number:** it failed. The output names the failed step and shows
  the end of its log. Every step's full log is in
  `~/.mockingbird/logs/install-<step>.log`. See
  [If something fails](#if-something-fails), then run step 2 again. Finished
  steps are skipped.
- Run `grep -A1 'note:' ~/.mockingbird/install.out`. If it says
  `~/.local/bin` isn't on the PATH, tell the person. That happens when their
  shell isn't zsh or bash, or the installer couldn't write the profile.
  They should add the `export PATH=...` line it shows to their shell profile,
  or you can, if they say so. The steps below use the full path either way.

### Windows

Download it, and check this command succeeds. If it prints an error,
nothing was installed, so check the network and try again.

```powershell
$mb = "$HOME\.mockingbird"
New-Item -ItemType Directory -Force $mb | Out-Null
Remove-Item -ErrorAction SilentlyContinue "$mb\install.out"
Invoke-WebRequest https://github.com/NirjharBhattacharjee/mockingbird/releases/latest/download/install.ps1 -OutFile "$mb\install.ps1"
```

Then start it in a hidden PowerShell window. This returns at once:

```powershell
$mb = "$HOME\.mockingbird"
$run = "& { try { & '$mb\install.ps1' } catch { `$_ }; 'finished' } *> '$mb\install.out'"
Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($run))
```

Check on it every 30 to 60 seconds (wait between checks with your tool's own
wait or `Start-Sleep 30`):

```powershell
Get-Content -Tail 8 "$HOME\.mockingbird\install.out"
```

It has finished when the last line is `finished`.

- **`All set.` above it:** it worked. Each step has a line starting `✓`.
- **A line starting `error:`, or any other error above it:** it failed. See
  [If something fails](#if-something-fails), then run step 2 again. Finished
  steps are skipped.

The installer adds `~\.mockingbird\bin` to the person's PATH, but only new
terminals see it. Your own shell doesn't, so the steps below use the full
path.

## 3. Check it

macOS and Linux:

```sh
~/.local/bin/mockingbird doctor
```

Windows:

```powershell
& "$HOME\.mockingbird\bin\mockingbird.cmd" doctor
```

It exits 0 when everything mockingbird needs is there. A line starting `✗`
is something missing, with a `fix:` line under it. Run that, or run step 2
again. A line starting `!` is optional. `chrome` shows `!` on Linux ARM, where
there's no Chrome build, which is expected. The last lines list
the coding agents on this computer and whether each has mockingbird.
`--json` gives the same as JSON.

## 4. Connect it to yourself

Run `doctor --json` as in step 3. If your own entry under `agents` says
`"registered": false`, ask the person whether to add mockingbird to the
agents it found, then:

macOS and Linux:

```sh
~/.local/bin/mockingbird setup --yes
```

Windows:

```powershell
& "$HOME\.mockingbird\bin\mockingbird.cmd" setup --yes
```

It adds the MCP server to each agent's config (Claude Code with `claude mcp
add`; Cursor, Gemini CLI, VS Code and Codex in their config files, which it
edits rather than replaces). If you're not in that list, the server is the
`mockingbird` command with the argument `mcp`, over stdio, and
[MCP.md](./MCP.md#register-it) has the JSON. Write the full path, because
JSON configs don't expand `~`:

- macOS and Linux: `/home/<user>/.local/bin/mockingbird` on Linux, or
  `/Users/<user>/.local/bin/mockingbird` on a Mac.
- Windows: the command is `cmd` with the arguments `/c`,
  `C:\Users\<user>\.mockingbird\bin\mockingbird.cmd` and `mcp`, which is
  what `setup` writes. Many agents can't start a `.cmd` file directly.

Most agents load MCP servers at start, so tell the person to restart you,
then call the `status` tool to check.

For Claude Code, the plugin is another way in: `/plugin marketplace add
NirjharBhattacharjee/mockingbird`, then `/plugin install mockingbird@mockingbird`.
It brings the skills too. Use one or the other, not both, or every tool shows
up twice.

## 5. Hand it over

Tell the person it's ready, and that they can ask for an edit with a
video's path, for example "cut a 60-second vertical short with captions
from ~/Movies/talk.mp4".

## If something fails

| What you see | What to do |
|---|---|
| `mockingbird runs on macOS, Linux and Windows` or `needs a 64-bit ... processor` | Not supported. Stop. |
| `mockingbird needs git ffmpeg ...` (Linux) | **(person)** Ask them to install those with their package manager (it needs their password), then step 2 again. |
| `mockingbird needs git` or `needs ffmpeg` (Windows) | winget isn't there. **(person)** Ask them to install App Installer from the Microsoft Store, or the tool it names, then step 2 again. |
| `Bun's Linux build needs glibc, and this system uses musl` | Alpine and other musl systems aren't supported by the installer. Tell the person and stop. |
| `Homebrew is needed first` (macOS) | See step 1's `brew` check. |
| `... has local changes, so it wasn't updated` | The person edited `~/mockingbird`. Ask before discarding anything. Never run `git checkout` or `git reset` there on your own. |
| `error: <step> failed` (macOS, Linux) | Read `~/.mockingbird/logs/install-<step>.log`. For a network error, run step 2 again. |
| `Couldn't replace ...mockingbird.exe` (Windows) | An agent has mockingbird running. Ask the person to close that agent, then step 2 again. |
| `curl: (...)`, or an `Invoke-WebRequest` error, when starting step 2 | The installer didn't download, so nothing ran. Check the network, then step 2 again. |
| `command not found: mockingbird` | Use the full path: `~/.local/bin/mockingbird`, or `~\.mockingbird\bin\mockingbird.cmd` on Windows. |
| The `status` tool isn't there after a restart | The MCP config has the wrong path, or wasn't reloaded. On Windows, check it runs `cmd /c`, as in step 4. |

More detail for people: [the user guide](./README.md), especially
[Troubleshooting](./README.md#troubleshooting).
