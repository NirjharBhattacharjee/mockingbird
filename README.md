<h3 align="center">
  <img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/misc/transparent.png" height="30" width="0px"/>
  🐦 mockingbird
  <img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/misc/transparent.png" height="30" width="0px"/>
</h3>

<p align="center">
  Local voice dictation for macOS. Free forever, and your voice never leaves your Mac.
</p>

<p align="center">
  <a href="https://github.com/NirjharBhattacharjee/mockingbird/stargazers"><img src="https://img.shields.io/github/stars/NirjharBhattacharjee/mockingbird?style=for-the-badge&logo=starship&color=cba6f7&logoColor=cdd6f4&labelColor=313244" alt="stars"></a>
  <a href="https://github.com/NirjharBhattacharjee/mockingbird/commits/main"><img src="https://img.shields.io/github/last-commit/NirjharBhattacharjee/mockingbird?style=for-the-badge&logo=git&color=a6e3a1&logoColor=cdd6f4&labelColor=313244" alt="last commit"></a>
  <img src="https://img.shields.io/badge/macOS-Apple%20Silicon-89b4fa?style=for-the-badge&logo=apple&logoColor=cdd6f4&labelColor=313244" alt="macOS on Apple Silicon">
  <img src="https://img.shields.io/badge/runs-100%25%20local-fab387?style=for-the-badge&logo=lock&logoColor=cdd6f4&labelColor=313244" alt="runs 100% local">
  <img src="https://img.shields.io/badge/built%20with-Bun-f5e0dc?style=for-the-badge&logo=bun&logoColor=cdd6f4&labelColor=313244" alt="built with Bun">
  <img src="https://img.shields.io/badge/price-free%20forever-f38ba8?style=for-the-badge&logo=githubsponsors&logoColor=cdd6f4&labelColor=313244" alt="free forever">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-94e2d5?style=for-the-badge&logo=opensourceinitiative&logoColor=cdd6f4&labelColor=313244" alt="MIT license"></a>
</p>

<p align="center">
  <img src="docs/assets/demo.gif" alt="Illustration: running mockingbird start once, after which the terminal is no longer needed; then holding Fn in a chat app, speaking, and letting go types the cleaned-up sentence into the message box" width="100%">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/palette/macchiato.png" width="400" alt="">
</p>

Speak, and get clean text back. Everything runs on your Mac: no account, no
cloud, no usage limits. A free, open-source alternative to Wispr Flow
([why](docs/PHILOSOPHY.md)).

> [!NOTE]
> **Early days.** `mockingbird start` once, then hold `Fn` anywhere, speak,
> and the text is typed into whatever app you're in — no terminal open, and it
> comes back at every login. History, custom vocabulary and the dashboard are
> still to come.

## 🚀 Quick start

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
[Read the script](scripts/install.sh) first if you like.

<details>
<summary>Rather do it step by step?</summary>

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

</details>

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

## 🎤 Usage

### Running in the background

| Command | Does |
|---|---|
| `mockingbird start` | Run in the background, now and at every login |
| `mockingbird stop` | Stop, and stay stopped across reboots |
| `mockingbird restart` | Restart it (do this after granting a permission) |
| `mockingbird status` | Whether it's running, and what it can see |

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

#### Permissions

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
[SECURITY_PRIVACY.md](docs/SECURITY_PRIVACY.md) for what it does mean.

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
- **Holding Fn opens emoji or Apple's dictation.** In System Settings →
  Keyboard, set **Press 🌐 key to** to **Do Nothing**.
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

## 🩹 Troubleshooting

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

## 🗺️ Roadmap

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

## 🔒 Privacy

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

More: [docs/SECURITY_PRIVACY.md](docs/SECURITY_PRIVACY.md)

## 🛠️ Development

| Command | Does |
|---|---|
| `bun test` | Unit tests |
| `bun run test:integration` | All tests, using the real models |
| `bun run typecheck` | Type-check |
| `bun run lint` / `bun run format` | Check / fix style |
| `bun run type --check` | Check typing permission and the app in front |
| `bun apps/daemon/src/cli.ts <cmd>` | The `mockingbird` command, from a clone |
| `bun run demo` | Redraw the GIF above (needs `brew install librsvg`) |

Code lives in `apps/daemon` (the commands, the launchd agent, and the session
wiring they share) and `packages/` (audio, voice detection, speech-to-text,
cleanup, typing, sounds). The agent skills are a submodule in `agent-skills/`;
see [AGENTS.md](AGENTS.md).

## 📚 Docs

[Philosophy](docs/PHILOSOPHY.md) ·
[Architecture](docs/ARCHITECTURE.md) ·
[Models](docs/MODELS.md) ·
[Security & privacy](docs/SECURITY_PRIVACY.md) ·
[Database](docs/DATABASE.md) ·
[Terminal UI](docs/TUI.md)

## 💜 Contributing

Everyone is welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md). AI agents
should also read [AGENTS.md](AGENTS.md). Security issues go through
[SECURITY.md](SECURITY.md), not public issues.

## 📄 License

[MIT](LICENSE). Use it, change it, share it.

<p align="center">
  <img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/footers/gray0_ctp_on_line.svg?sanitize=true" alt="">
</p>

<p align="center">
  Theme colors from <a href="https://github.com/catppuccin/catppuccin">Catppuccin</a>.
</p>
