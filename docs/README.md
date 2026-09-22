# mockingbird docs

The [user guide](#user-guide) comes first: installing, every command and
option, permissions, troubleshooting, and privacy. After it, the
[design docs](#design-docs), the project's living design record.

# User guide

## Quick start

You need a Mac with Apple Silicon, [Homebrew](https://brew.sh), and about 3 GB of
free space.

**1. Install everything**

```sh
curl -fsSL https://raw.githubusercontent.com/NirjharBhattacharjee/mockingbird/main/scripts/install.sh | bash
```

This installs Bun, whisper-cpp, Ollama and ffmpeg with Homebrew, clones
mockingbird into `~/mockingbird`, downloads the models (checking each against
its sha256), and the cleanup model.
It skips anything you already have, so it's safe to run again.
[Read the script](../scripts/install.sh) first if you like.

### Manual install

```sh
# Tools
brew install bun whisper-cpp ollama ffmpeg

# Code
git clone https://github.com/NirjharBhattacharjee/mockingbird.git
cd mockingbird
bun install

# Models
mkdir -p ~/.mockingbird/models
curl -fL -o ~/.mockingbird/models/ggml-base.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base.en.bin
curl -fL -o ~/.mockingbird/models/silero_vad.onnx \
  https://github.com/snakers4/silero-vad/raw/v6.2.2/src/silero_vad/data/silero_vad.onnx
(cd ~/.mockingbird/models && shasum -a 256 -c) <<'SUMS'
a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002  ggml-base.en.bin
1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3  silero_vad.onnx
SUMS

# Cleanup model (Ollama must be running for this: `ollama serve` in another window)
ollama pull qwen3:4b-instruct-2507-q4_K_M

# The `mockingbird` command — a shim, not a compiled binary, because macOS
# records the Fn and typing permissions against the binary that asks for them,
# and rebuilding a compiled one silently drops those grants.
mkdir -p ~/.local/bin
printf '#!/bin/sh\nexec "%s" "%s/apps/daemon/src/cli.ts" "$@"\n' \
  "$(command -v bun)" "$PWD" > ~/.local/bin/mockingbird
chmod +x ~/.local/bin/mockingbird

# If ~/.local/bin isn't on your PATH yet, add it to your shell profile:
export PATH="$HOME/.local/bin:$PATH"
```

Re-run the shim step if you ever move the clone: it points at this directory.

**2. Turn it on**

```sh
mockingbird start
```

That's it — it runs in the background from now on, and starts again by itself
every time you log in. You don't need to keep a terminal open.

Click into any app (Slack, Notes, a browser), then hold **Fn**, speak, and let
go: your words are typed where your cursor is. The first time, macOS will ask
for permission — run `mockingbird status` to see what's still missing, and read
[Permissions](#permissions) for the one surprise in how macOS grants them.

To turn it off again:

```sh
mockingbird stop
```

It stays off, including after a reboot, until the next `mockingbird start`.

## Usage

### Running in the background

| Command | Does |
|---|---|
| `mockingbird start` | Run in the background, now and at every login |
| `mockingbird stop` | Stop, and stay stopped across reboots |
| `mockingbird restart` | Restart it (do this after granting a permission) |
| `mockingbird status` | Whether it's running, and what it can see |
| `mockingbird fn` | Bind Fn to dictation only, so tapping it stops opening the emoji picker. Changes a system-wide setting, so it's never done for you |
| `mockingbird fn --undo` | Put back the Fn setting `mockingbird fn` replaced |

Nothing is printed while it runs — the text goes into your app and nowhere
else. If something goes wrong, it's in `~/.mockingbird/logs/agent.log`, which
records what happened but never what you said.

**It tells you out loud**, since there's no screen to look at:

| Sound | Means |
|---|---|
| A rising **tink** | recording started — it heard the `Fn` hold |
| A falling **pop** | you let go; it's transcribing |
| A low **basso** | it got the words but couldn't type them (the log says why) |

Set `MOCKINGBIRD_CUES=0` to silence them. `mockingbird listen` is quiet by
default instead, since it draws a live level meter; `--cues` turns them on
there too.

### `mockingbird listen`: talk live in a terminal

| Key | Does |
|---|---|
| **Fn** (hold) | Record while held, from any app |
| **Fn** (double-tap) | Record hands-free until you press **Fn** again |
| **Enter** / **Space** | Start or stop recording (this terminal only) |
| **Esc** | Cancel the recording |
| **q** | Quit |

Whatever you say is typed into the app in front (Slack, your editor, a
browser). It's printed here **only when it couldn't be typed** — a missing
permission, or you switched apps while it was still transcribing — so you never
lose words, and never get two copies. Use `--no-type` to only print.

Stop the background agent first (`mockingbird stop`), or both will type.

No need to start Ollama yourself: if it isn't running, `listen` starts it and
stops it again when you quit.

### Permissions

**Three permissions are needed**, all in System Settings → Privacy & Security:

| Permission | For |
|---|---|
| **Input Monitoring** | noticing the `Fn` key |
| **Accessibility** | typing into other apps |
| **Microphone** | hearing you |

macOS grants these to **whichever program asks**, and that differs between the
two ways of running mockingbird — this catches everyone out once:

- **`mockingbird start`** (the background agent): grant them to
  **mockingbird**, at `~/.mockingbird/bin/mockingbird`. Then run
  `mockingbird restart`.
- **`mockingbird listen`** (a terminal): grant them to the terminal app itself
  (Terminal, Ghostty, iTerm, VS Code…), then **quit it with Cmd+Q and reopen
  it** — closing the window isn't enough. Each terminal app needs its own.

If the program isn't in the list, click **+** and add it. Without these, Enter
still records in `listen`, and the text is printed instead of typed.

`mockingbird start` and `mockingbird status` both report what the agent can
actually see, rather than what your terminal can — including the microphone,
which can't be checked by asking, since a blocked one still returns audio.
It's just silent.

That `bin/mockingbird` is mockingbird's own copy of the Bun runtime, signed
under its own name so macOS lists it as "mockingbird" and the permission
belongs to it alone — your `bun` needs no permission at all. It also holds
still: editing the code doesn't change it, and neither does `brew upgrade
bun`, so the grants survive both. See
[SECURITY_PRIVACY.md](./SECURITY_PRIVACY.md) for what it does mean.

<details>
<summary>Fn still not working?</summary>

- **`listen` says "Fn key off".** The app you ran it from doesn't have Input
  Monitoring yet, or hasn't been fully quit and reopened since you allowed it.
  Each terminal app needs its own permission: allowing VS Code doesn't cover
  Ghostty.
- **The background agent does nothing, but `listen` works.** They need
  separate grants: `listen` uses your terminal's, the agent uses its own.
  Add `~/.mockingbird/bin/mockingbird` to both lists, then
  `mockingbird restart`.
- **You granted the permission but nothing changed.** The agent reads them
  once at startup. Run `mockingbird restart`.
- **Holding Fn opens emoji or Apple's dictation.** Run `mockingbird fn`, or
  in System Settings → Keyboard set **Press 🌐 key to** to **Do Nothing**.
  mockingbird never changes this on its own; `mockingbird fn --undo` puts back
  whatever `mockingbird fn` replaced.
- **Text is typed twice.** The background agent and `mockingbird listen` are
  both running, or `listen` is open in two windows. Run `mockingbird stop`, or
  quit the extra window with `q`.
- **The sounds play but nothing is typed.** It heard you. Either Accessibility
  is missing, or you switched apps while it was still transcribing — it won't
  type into an app you didn't dictate into. The log says which.
- **Recordings come back empty.** Microphone permission. `mockingbird status`
  and the log both name it.

</details>

To check typing on its own:

```sh
mockingbird type --check          # is typing allowed? which app is in front?
mockingbird type "hello there"    # waits 3s, then types into the app you click
```

Using the wrong microphone? List them and pick one:

```sh
mockingbird listen --list-devices
mockingbird listen --device 2
```

### `mockingbird transcribe`: turn a recording into text

```sh
mockingbird transcribe ~/Desktop/memo.mp3
mockingbird transcribe ~/Desktop/memo.mp3 | pbcopy   # copy the text
```

Works with mp3, m4a, wav, and anything else ffmpeg can open. Tip: type
`mockingbird transcribe `, then drag the file into the terminal.

<details>
<summary>More options</summary>

Both commands accept:

| Option | Does |
|---|---|
| `--terminal` | No period at the end (for pasting commands) |
| `--json` | Show everything: raw and cleaned text, timings |
| `--help` | Show help |

Environment variables:

| Variable | Default |
|---|---|
| `MOCKINGBIRD_HOME` (where `models/` is) | `~/.mockingbird` |
| `MOCKINGBIRD_ASR_PORT` | `8771` |
| `MOCKINGBIRD_LLM_URL` | `http://127.0.0.1:11434` |
| `MOCKINGBIRD_LLM_MODEL` | `qwen3:4b-instruct-2507-q4_K_M` |

</details>

## Troubleshooting

| Problem | Fix |
|---|---|
| `Script not found` | Run it from inside the `mockingbird` folder. |
| `permission denied` on a file | Put `mockingbird transcribe ` in front of the file path. |
| `recording was completely silent` or stuck on `waiting for the microphone` | Allow your terminal in **System Settings → Privacy & Security → Microphone**, then restart the terminal. |
| The level bars don't move | Wrong microphone. Use `--list-devices` and `--device`. |
| `Fn key off` or `Fn` does nothing | Allow your terminal in **System Settings → Privacy & Security → Input Monitoring**, then quit it with Cmd+Q and reopen. |
| Tapping `Fn` opens the emoji picker, and the text lands in its search box | macOS has its own action on that key. Set **System Settings → Keyboard → "Press 🌐 key to"** to **Do Nothing**. Holding `Fn` works either way; `mockingbird status` tells you when this is set. |
| Text prints but isn't typed into the app | The agent needs **Accessibility** on `~/.mockingbird/bin/mockingbird`, then `mockingbird restart`. In `listen`, allow your terminal instead and reopen it. Check with `mockingbird type --check`. |
| `Ollama isn't running` | `listen` starts Ollama by itself, so this means it's missing or failed to start: run the install command again. You still get text, just not cleaned up. |
| `… isn't downloaded` | Run `ollama pull qwen3:4b-instruct-2507-q4_K_M` (or the install command again). |
| `Whisper model not found` | Run the install command again. |
| `command not found: bun` | Open a new terminal window. |

The first run pauses for about 15 seconds while macOS prepares the GPU. After
that it's quick.

## Roadmap

| | |
|---|---|
| ✅ | Speech to text, cleanup (removes "um", fixes punctuation) |
| ✅ | Live microphone with `mockingbird listen` |
| ✅ | Transcribe recordings with `mockingbird transcribe` |
| ✅ | Runs in the background from login: `mockingbird start` / `stop` |
| ✅ | Hold `Fn` to talk, double-tap for hands-free |
| ✅ | Types into any app: Slack, editors, browsers, terminals |
| 🔲 | History and custom vocabulary |
| 🔲 | Terminal dashboard (Catppuccin themed) |
| 🔲 | `brew install mockingbird` |

## Privacy

- Your audio and text never leave your Mac.
- mockingbird makes no internet requests. The only downloads are the ones you
  run in the quick start.
- No audio or transcript is saved to disk. Live audio is kept in memory only
  (the last 30 seconds).
- The one file written is `~/.mockingbird/logs/agent.log`: start-up, errors,
  and how many characters were typed — never the words themselves. It's capped
  at 1 MB.
- **The microphone is held open the whole time mockingbird runs**, so the
  orange dot stays in your menu bar from login until `mockingbird stop`. That's
  what makes the first word of a sentence come out intact. Nothing is recorded
  until you hold Fn.
- Typing uses key events, not the clipboard, so yours is never touched. Line
  breaks are removed first, so dictation can't send a message or run a command
  by itself.

More: [SECURITY_PRIVACY.md](./SECURITY_PRIVACY.md)

## Development

| Command | Does |
|---|---|
| `bun test` | Unit tests |
| `bun run test:integration` | All tests, using the real models |
| `bun run typecheck` | Type-check |
| `bun run lint` / `bun run format` | Check / fix style |
| `bun run type --check` | Check typing permission and the app in front |
| `bun apps/daemon/src/cli.ts <cmd>` | The `mockingbird` command, from a clone |
| `bun run demo` | Redraw the README GIF (needs `brew install librsvg`) |

Code lives in `apps/daemon` (the commands, the launchd agent, and the session
wiring they share) and `packages/` (audio, voice detection, speech-to-text,
cleanup, typing, sounds). The agent skills are a submodule in `agent-skills/`;
see [AGENTS.md](../AGENTS.md).

# Design docs

- **[PHILOSOPHY.md](./PHILOSOPHY.md)** — why this project exists and what it
  must never become: always free, open to everyone, local-first and
  privacy-first by belief, not just by design. Read this before proposing
  anything that touches monetization, access, or inclusion — for humans and
  AI agents alike.
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — the bible. Stack, architecture, state
  ownership, packaging, deployment, CI/CD, and open scope. Every architectural
  decision should end up reflected here before or shortly after it lands in code.
  This document is expected to change constantly as v1 becomes v2 becomes v3 —
  see its changelog at the top for how edits are tracked.
- **[SECURITY_PRIVACY.md](./SECURITY_PRIVACY.md)** — threat model, data
  inventory, network/storage/permissions policy, and the open privacy risks
  that local-first design does not by itself close.
- **[MODELS.md](./MODELS.md)** — every model mockingbird runs (VAD, ASR,
  cleanup LLM): what each one does, where it sits in the pipeline, how it's
  invoked, and its licensing.
- **[DATABASE.md](./DATABASE.md)** — the SQLite schema in full: every table,
  column, primary/foreign key, index, and the open schema decisions not yet
  settled.
- **[TUI.md](./TUI.md)** — the terminal UI's Catppuccin theming (palette,
  flavors, semantic color mapping) and what each of its four screens
  (Dashboard, History, Dictionary, Latency waterfall) actually controls.

See also, at the repo root: **[../CONTRIBUTING.md](../CONTRIBUTING.md)** —
required reading before opening an issue or PR, for humans and AI agents
alike: standards, workflow, PR checklist, and licensing terms — and
**[../SECURITY.md](../SECURITY.md)** — where to report a vulnerability
privately (never in a public issue).

If a decision made in code contradicts this doc, the doc is wrong and should be
fixed in the same PR that makes the change. Nobody should have to read git log
to understand why the system is shaped the way it is.
