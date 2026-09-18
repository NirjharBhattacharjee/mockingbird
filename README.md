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
  <img src="docs/assets/demo.gif" alt="Terminal demo: bun run listen records a sentence and prints the cleaned-up text" width="100%">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/palette/macchiato.png" width="400" alt="">
</p>

Speak, and get clean text back. Everything runs on your Mac: no account, no
cloud, no usage limits. A free, open-source alternative to Wispr Flow
([why](docs/PHILOSOPHY.md)).

> [!NOTE]
> **Early days.** Talking to mockingbird in the terminal works today. Typing
> straight into other apps with the `Fn` key is coming next.

## 🚀 Quick start

You need a Mac with Apple Silicon, [Homebrew](https://brew.sh), and about 3 GB of
free space.

**1. Install the tools**

```sh
curl -fsSL https://bun.sh/install | bash
brew install whisper-cpp ollama ffmpeg
```

Then open a new terminal window.

**2. Get mockingbird**

```sh
git clone https://github.com/NirjharBhattacharjee/mockingbird.git
cd mockingbird
bun install
```

**3. Download the models**

```sh
mkdir -p ~/.mockingbird/models
curl -L -o ~/.mockingbird/models/ggml-base.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
curl -L -o ~/.mockingbird/models/silero_vad.onnx \
  https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx
```

**4. Start Ollama** in a second terminal window and leave it open

```sh
ollama serve
```

Back in the first window, download the cleanup model (once):

```sh
ollama pull qwen3:4b-instruct-2507-q4_K_M
```

**5. Talk to it**

```sh
bun run listen
```

Press **Enter**, speak, press **Enter** again. Your words appear as text. The
first time, click **Allow** when macOS asks for the microphone.

## 🎤 Usage

### `bun run listen`: talk live

| Key | Does |
|---|---|
| **Fn** (hold) | Record while held, from any app |
| **Fn** (double-tap) | Record hands-free until you press **Fn** again |
| **Enter** / **Space** | Start or stop recording (this terminal only) |
| **Esc** | Cancel the recording |
| **q** | Quit |

`Fn` needs **Input Monitoring** permission: System Settings → Privacy &
Security → Input Monitoring, switch on your terminal, then quit it with
**Cmd+Q** and reopen. Without it, Enter still works. The text still prints in
the terminal for now; typing it into other apps is the next step.

Using the wrong microphone? List them and pick one:

```sh
bun run listen --list-devices
bun run listen --device 2
```

### `bun run transcribe`: turn a recording into text

```sh
bun run transcribe ~/Desktop/memo.mp3
bun run transcribe ~/Desktop/memo.mp3 | pbcopy   # copy the text
```

Works with mp3, m4a, wav, and anything else ffmpeg can open. Tip: type
`bun run transcribe `, then drag the file into the terminal.

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
| `permission denied` on a file | Put `bun run transcribe ` in front of the file path. |
| `recording was completely silent` or stuck on `waiting for the microphone` | Allow your terminal in **System Settings → Privacy & Security → Microphone**, then restart the terminal. |
| The level bars don't move | Wrong microphone. Use `--list-devices` and `--device`. |
| `Fn key off` or `Fn` does nothing | Allow your terminal in **System Settings → Privacy & Security → Input Monitoring**, then quit it with Cmd+Q and reopen. |
| `Ollama isn't running` | Run `ollama serve` in another window. You still get text, just not cleaned up. |
| `Whisper model not found` | Redo step 3. |
| `command not found: bun` | Open a new terminal window. |

The first run pauses for about 15 seconds while macOS prepares the GPU. After
that it's quick.

## 🗺️ Roadmap

| | |
|---|---|
| ✅ | Speech to text, cleanup (removes "um", fixes punctuation) |
| ✅ | Live microphone with `bun run listen` |
| ✅ | Transcribe recordings with `bun run transcribe` |
| ✅ | Hold `Fn` to talk, double-tap for hands-free |
| 🔲 | Type the text into any app |
| 🔲 | History and custom vocabulary |
| 🔲 | Terminal dashboard (Catppuccin themed) |
| 🔲 | `brew install mockingbird` |

## 🔒 Privacy

- Your audio and text never leave your Mac.
- mockingbird makes no internet requests. The only downloads are the ones you
  run in the quick start.
- Nothing is saved to disk. Live audio is kept in memory only (the last 30
  seconds). While `listen` runs, macOS shows the orange microphone dot.

More: [docs/SECURITY_PRIVACY.md](docs/SECURITY_PRIVACY.md)

## 🛠️ Development

| Command | Does |
|---|---|
| `bun test` | Unit tests |
| `bun run test:integration` | All tests, using the real models |
| `bun run typecheck` | Type-check |
| `bun run lint` / `bun run format` | Check / fix style |
| `bun run demo` | Re-record the GIF above (needs [vhs](https://github.com/charmbracelet/vhs)) |

Code lives in `apps/daemon` (the commands) and `packages/` (audio, voice
detection, speech-to-text, cleanup). The agent skills are a submodule in
`agent-skills/`; see [AGENTS.md](AGENTS.md).

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
