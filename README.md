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
</p>

<p align="center">
  <img src="docs/assets/demo.gif" alt="Terminal demo: mockingbird transcribes two recordings, cleaning up the first and skipping cleanup for the short second one" width="100%">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/palette/macchiato.png" width="400" alt="">
</p>

Hold a key, speak, let go, and the cleaned-up text is typed into whatever app
you're in. Everything runs on your Mac: no account, no cloud, no usage limits.
It's an open-source alternative to tools like Wispr Flow. Why it exists and
what it will never become: [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md).

> [!NOTE]
> **Early development.** You can talk to mockingbird live in the terminal:
> `bun run listen`, press Enter, speak, press Enter again, and the cleaned-up
> text is printed. You can also transcribe a recording with
> `bun run transcribe my-recording.mp3` (that's the demo above). It doesn't
> type into other apps yet, and the `Fn` hotkey, history, and terminal UI are
> still to be built.

## 🚀 Quick start: run it in the terminal

Copy each block into your terminal, one at a time. You need a Mac with Apple
Silicon, about 3 GB of free disk space, and [Homebrew](https://brew.sh).

**1. Install the tools** (skip any you already have)

```sh
curl -fsSL https://bun.sh/install | bash
brew install whisper-cpp ollama ffmpeg
```

Close and reopen your terminal afterwards so the `bun` command is found.

**2. Get the code**

```sh
git clone https://github.com/NirjharBhattacharjee/mockingbird.git
cd mockingbird
bun install
```

**3. Download the speech models** (about 150 MB)

```sh
mkdir -p ~/.mockingbird/models ~/.mockingbird/recordings
curl -L -o ~/.mockingbird/models/ggml-base.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
curl -L -o ~/.mockingbird/models/silero_vad.onnx \
  https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx
```

**4. Start Ollama** in a **second terminal window**, and leave it open

```sh
ollama serve
```

If you use the Ollama desktop app, open it instead. Then, back in the first
window, download the cleanup model (about 2.5 GB, only needed once):

```sh
ollama pull qwen3:4b-instruct-2507-q4_K_M
```

**5. Try it on the sample recording**

```sh
bun run transcribe bench/fixtures/hello.wav
```

You should see:

```
$ bun apps/daemon/src/transcribe.ts bench/fixtures/hello.wav
starting whisper-server (the first run on a Mac can take ~15s)...
Hello world, this is a test of the Mockingbird dictation pipeline.
speech 4.5s · vad 17ms · asr 201ms · cleanup 1645ms
```

The first run can pause for about 15 seconds while macOS prepares the GPU.
After that it starts in about a second.

**6. Record yourself and transcribe it**

This records 10 seconds from your microphone. Start talking right after you
press Enter:

```sh
ffmpeg -f avfoundation -i ":0" -t 10 -y ~/.mockingbird/recordings/me.wav
bun run transcribe ~/.mockingbird/recordings/me.wav
```

`:0` is the first microphone on your Mac. If you get "Invalid audio device
index" or a silent recording, list your microphones and use the number shown
next to the one you want:

```sh
ffmpeg -f avfoundation -list_devices true -i ""
```

The first time, macOS asks whether your terminal can use the microphone:
click **Allow**. If you missed it, turn it on in **System Settings → Privacy &
Security → Microphone** and run the command again.

**7. Talk to it live**

```sh
bun run listen
```

Wait for `○ ready`, press **Enter**, say something, press **Enter** again. The
text appears a moment later. Press **q** to quit. The bars next to `ready`
move when the microphone hears you; if they don't, see
[Troubleshooting](#troubleshooting).

Every time you come back later, it's just:

```sh
cd mockingbird
bun run listen
```

with Ollama running in another window.

## 🎤 Using `listen`

`listen` keeps your microphone open and turns what you say into text, using
the keyboard as the talk button.

| Key | What it does |
|---|---|
| **Enter** or **Space** | Start recording; press again to stop and transcribe |
| **Esc** | Cancel the current recording |
| **q** or **Ctrl+C** | Quit |

```
○ ready  ▮▮▮▯▯▯▯▯▯▯  Enter: start speaking · q: quit
● recording 3.4s  ▮▮▮▮▮▮▯▯▯▯  Enter: stop · Esc: cancel
… transcribing
```

- **Which microphone:** by default, the input selected in **System Settings →
  Sound → Input**. To pick another one:

  ```sh
  bun run listen --list-devices
  bun run listen --device 2
  ```

- **The first word isn't lost:** the last 300 ms before you press Enter is
  included, so you can start talking as you press it.
- **Options:** `--terminal` and `--json` work like they do for `transcribe`.
- **Limits:** a single recording stops growing after 2 minutes. Audio is only
  held in memory (the last 30 seconds) and is never saved to disk.
- **Privacy indicator:** while `listen` runs, macOS shows the orange
  microphone dot, because the microphone really is open. Quit with **q** to
  close it.
- If the microphone stops (for example, you unplug a headset), `listen`
  restarts it automatically. After five quick failures in a row it gives up
  and tells you why.

## 🎙️ Using `transcribe`

Run it from the `mockingbird` folder (it isn't found from subfolders).

```sh
bun run transcribe ~/Desktop/memo.m4a            # print the cleaned text
bun run transcribe ~/Desktop/memo.m4a | pbcopy   # copy it to the clipboard
bun run transcribe --json memo.m4a               # full result with timings
bun run transcribe --terminal memo.m4a           # no trailing period
bun run transcribe --help
bun run --silent transcribe memo.m4a             # hide bun's "$ bun ..." line
```

- **Any format ffmpeg reads works:** mp3, m4a, wav, and so on. Recordings from
  QuickTime Player (File → New Audio Recording) or Voice Memos are fine.
- **Tip:** type `bun run transcribe ` (with the space), then drag the file from
  Finder into the terminal to paste its path.
- **Output:** only the transcript goes to standard output, so pipes get just
  the text. The status and timing lines go to standard error.
- **Language:** English only for now.
- **Without Ollama** you still get text, just not cleaned up, plus a warning.

With `--json`, `rawText` is what Whisper heard and `finalText` is what would
be typed. `llmOutcome` tells you what cleanup did:

| `llmOutcome` | Meaning |
|---|---|
| `cleaned` | The model tidied up the text |
| `skipped` | Short, clear phrase; cleanup wasn't needed |
| `failed` | Ollama couldn't be reached; raw text was used |
| `rejected` | The model's answer didn't look like a cleanup; raw text was used |

### Settings

| Variable | Default | What it sets |
|---|---|---|
| `MOCKINGBIRD_HOME` | `~/.mockingbird` | Where `models/` is |
| `MOCKINGBIRD_ASR_PORT` | `8771` | Port `whisper-server` listens on (this Mac only) |
| `MOCKINGBIRD_LLM_URL` | `http://127.0.0.1:11434` | Ollama address |
| `MOCKINGBIRD_LLM_MODEL` | `qwen3:4b-instruct-2507-q4_K_M` | Cleanup model |

Example: `MOCKINGBIRD_ASR_PORT=9000 bun run transcribe memo.m4a`

### Troubleshooting

| You see | Do this |
|---|---|
| `zsh: permission denied: …/memo.mp3` | You ran the file itself. Put `bun run transcribe ` in front of the path. |
| `Script not found "transcribe"` | `cd` into the `mockingbird` folder first. |
| `Whisper model not found` | Redo step 3 of the quick start. |
| `warning: Ollama isn't running` | Start `ollama serve` in another window (step 4). |
| `no speech detected` | Speak closer to the microphone, or check you're using the right one (`bun run listen --list-devices`). |
| `the recording was completely silent` | Your terminal isn't allowed to use the microphone. Turn it on in **System Settings → Privacy & Security → Microphone**, then quit and restart the terminal. |
| `listen` stays on `waiting for the microphone` | Same as above, or the microphone is in use elsewhere. |
| `giving up on the microphone` | The device couldn't be opened. Check `bun run listen --list-devices` and pick one with `--device`. |
| `listen needs an interactive terminal` | Run `listen` directly in a terminal window, not through a pipe or script. |
| `command not found: bun` | Reopen the terminal after installing Bun. |

## 🗺️ How it will work

Once v1 is done:

- **Hold `Fn`**, speak, release. The text appears in the focused field in any
  app: terminal, browser, editor, chat.
- **Double-tap `Fn`** to keep dictating hands-free until you press it again.
- **`Esc`** cancels a dictation.
- A terminal dashboard (`mockingbird-tui`, in Catppuccin colors) shows live
  status, searchable history, your custom vocabulary, and how long each step
  took.

```
microphone → voice detection (Silero) → speech-to-text (Whisper) → cleanup (Qwen3 via Ollama) → typed into your app
```

| Piece | Status |
|---|---|
| Voice activity detection (Silero VAD) | ✅ Working |
| Speech-to-text via `whisper-server` | ✅ Working |
| Text cleanup via Ollama | ✅ Working |
| Pipeline with fallbacks | ✅ Working |
| `bun run transcribe <file>` | ✅ Working |
| Live microphone capture, with automatic restart | ✅ Working |
| `bun run listen` (Enter to talk) | ✅ Working |
| `Fn` hotkey (hold to talk, double-tap for hands-free) | 🔲 Not started |
| Typing text into other apps | 🔲 Not started |
| History and vocabulary (SQLite) | 🔲 Not started |
| Terminal UI | 🔲 Not started |
| Homebrew installer | 🔲 Not started |

Measured on an Apple M3: a 4.5-second sentence takes about 0.2 s to
transcribe and about 1.2 s to clean up. "Yes, please." takes about 0.15 s,
because it skips cleanup.

## 🔒 Privacy

- Audio and text are processed on your Mac only. `whisper-server` listens on
  `127.0.0.1`, so other machines can't reach it.
- mockingbird itself makes no internet requests. Everything it needs is
  downloaded during setup, by commands you run yourself.
- `transcribe` doesn't save anything; it prints the text and exits.

Details: [docs/SECURITY_PRIVACY.md](docs/SECURITY_PRIVACY.md).

## 🛠️ Development

| Command | What it does |
|---|---|
| `bun run typecheck` | Type-check every package |
| `bun run lint` | Lint and check formatting (Biome) |
| `bun run format` | Fix formatting |
| `bun test` | Unit tests; no models needed |
| `bun run test:integration` | All tests, including ones that use the real models |
| `bun run fixtures` | Regenerate the sample recordings (macOS `say` voice) |
| `bun run demo` | Re-record the demo GIF above ([vhs](https://github.com/charmbracelet/vhs), Ollama running) |

```
apps/daemon/src/   pipeline.ts           VAD → ASR → cleanup → format
                   listen.ts             the listen command
                   listen-controller.ts  its keys and status line
                   recorder.ts           cuts recordings (with pre-roll) from live audio
                   supervisor.ts         restarts ffmpeg if it dies
                   runtime.ts            model checks and server startup
                   transcribe.ts         the transcribe command
packages/audio/    audio files, live ffmpeg capture, ring buffer
packages/vad/      Silero voice activity detection
packages/asr/      speech-to-text, whisper-server adapter
packages/llm/      cleanup prompt, skip rule, formatting, Ollama adapter
bench/fixtures/    sample recordings
docs/              design documents
```

## 📚 Documentation

- [Philosophy](docs/PHILOSOPHY.md): why this exists, and the rules it won't break
- [Architecture](docs/ARCHITECTURE.md): how the system fits together
- [Models](docs/MODELS.md): which models run where
- [Security and privacy](docs/SECURITY_PRIVACY.md): what data is handled and how
- [Database](docs/DATABASE.md): the planned SQLite schema
- [Terminal UI](docs/TUI.md): the planned dashboard and its Catppuccin theme

## 💜 Contributing

Contributions are welcome from anyone. Read [CONTRIBUTING.md](CONTRIBUTING.md)
first; AI agents should also read [AGENTS.md](AGENTS.md). Found a security
problem? Don't open a public issue; follow [SECURITY.md](SECURITY.md).

## 📄 License

No license has been chosen yet, so for now the code is not licensed for reuse.
It will be an OSI-approved open-source license
([ARCHITECTURE.md §16](docs/ARCHITECTURE.md#16-known-gaps--scope-not-yet-decided)).

<p align="center">
  <img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/footers/gray0_ctp_on_line.svg?sanitize=true" alt="">
</p>

<p align="center">
  Theme colors from <a href="https://github.com/catppuccin/catppuccin">Catppuccin</a>.
</p>
