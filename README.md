# mockingbird

Local voice dictation for macOS. Hold a key, speak, let go, and the cleaned-up
text is typed into whatever app you're in. Your audio and text never leave your
machine: no account, no cloud, no usage limits, free forever.

It's an open-source alternative to tools like Wispr Flow. Why it exists and
what it will never become: [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md).

> **Status: early development.** You can't dictate live with mockingbird yet.
> What works today is transcribing a recording: `bun run transcribe
> my-recording.m4a` runs it through voice detection, speech-to-text, and
> cleanup, and prints the text. The hotkey, live microphone capture, typing
> into apps, history, and terminal UI are still to be built. See
> [What works today](#what-works-today).

## How it will work

Once v1 is done:

- **Hold `Fn`**, speak, release. The text appears in the focused field in any
  app: terminal, browser, editor, chat.
- **Double-tap `Fn`** to keep dictating hands-free until you press it again.
- **`Esc`** cancels a dictation.
- A terminal dashboard (`mockingbird-tui`) shows live status, searchable
  history, your custom vocabulary, and how long each step took.

Everything runs on your Mac:

```
microphone → voice detection (Silero) → speech-to-text (Whisper) → cleanup (Qwen3 via Ollama) → typed into your app
```

Short, clear phrases like "yes please" skip the cleanup step so they come back
faster. If the cleanup model is down, you still get the raw transcript.

## What works today

| Piece | Status |
|---|---|
| Voice activity detection (Silero VAD) | Working |
| Speech-to-text via `whisper-server` | Working |
| Text cleanup via Ollama (removes "um", fixes punctuation) | Working |
| Pipeline that ties them together, with fallbacks | Working |
| `bun run transcribe <file>` for any audio file | Working |
| Live microphone capture | Not started |
| `Fn` hotkey | Not started |
| Typing text into other apps | Not started |
| History and vocabulary (SQLite) | Not started |
| Terminal UI | Not started |
| Installer (Homebrew) | Not started |

Measured on an Apple M3 with the models below: a 4.5-second sentence takes
about 0.2 s to transcribe and about 1.1 s to clean up. "Yes, please." takes
about 0.14 s, since it skips cleanup.

## Requirements

- macOS on Apple Silicon (v1 is macOS only)
- [Bun](https://bun.sh) 1.4.2 or newer
- [Homebrew](https://brew.sh)
- About 3 GB of free disk space for models

## Setup

1. **Clone and install dependencies**

   ```sh
   git clone https://github.com/NirjharBhattacharjee/mockingbird.git
   cd mockingbird
   bun install
   ```

2. **Install the speech and language model servers**

   ```sh
   brew install whisper-cpp ollama ffmpeg
   ```

   ffmpeg converts recordings in formats other than 16 kHz WAV (for example
   `.m4a`) before they're transcribed.

3. **Download the models** into `~/.mockingbird/models/`

   ```sh
   mkdir -p ~/.mockingbird/models
   curl -L -o ~/.mockingbird/models/ggml-base.en.bin \
     https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
   curl -L -o ~/.mockingbird/models/silero_vad.onnx \
     https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx
   ```

   The Whisper model is about 148 MB, the voice-detection model about 2 MB.
   These downloads are the only network access mockingbird needs.

4. **Start Ollama and pull the cleanup model** (about 2.5 GB)

   ```sh
   ollama serve          # leave this running in its own terminal
   ollama pull qwen3:4b-instruct-2507-q4_K_M
   ```

   If you already run the Ollama desktop app, skip `ollama serve`.

## Transcribe a recording

From the repo root (with Ollama running):

```sh
bun run transcribe bench/fixtures/hello.wav
```

```
starting whisper-server (the first run on a Mac can take ~15s)...
Hello world, this is a test of the Mockingbird dictation pipeline.
speech 4.5s · vad 17ms · asr 201ms · cleanup 1645ms
```

The cleaned text goes to standard output, so you can pipe it:
`bun run transcribe memo.m4a | pbcopy` puts it on your clipboard. Status
lines go to standard error.

Any format ffmpeg can read works. Options:

| Option | What it does |
|---|---|
| `--terminal` | Format for a terminal (no trailing period) |
| `--json` | Print the full result: raw and final text, timings, what cleanup did |
| `--help` | Show usage |

With `--json`, `rawText` is what Whisper heard and `finalText` is what would be
typed. `llmOutcome` is `cleaned`, `skipped` (short, clear phrases), `failed`
(Ollama unreachable) or `rejected` (the model's output didn't look like a
cleanup). In the last two cases the raw transcript is used. If Ollama isn't
running you still get text, just not cleaned up.

The first run can take about 15 seconds while macOS compiles
`whisper-server`'s GPU code; later runs start in about a second.

### Recording your own audio

Any of these works:

- **QuickTime Player** → File → New Audio Recording, then save the `.m4a`.
- **Voice Memos**, then drag the memo out to a folder.
- **ffmpeg**, from the terminal. List your microphones, then record 10 seconds
  from one of them (here, device 2):

  ```sh
  ffmpeg -f avfoundation -list_devices true -i ""
  ffmpeg -f avfoundation -i ":2" -t 10 my-recording.wav
  ```

  macOS asks your terminal app for microphone access the first time.

mockingbird currently supports English only.

### Settings

| Variable | Default | What it sets |
|---|---|---|
| `MOCKINGBIRD_HOME` | `~/.mockingbird` | Where `models/` is |
| `MOCKINGBIRD_ASR_PORT` | `8771` | Port `whisper-server` listens on (localhost only) |
| `MOCKINGBIRD_LLM_URL` | `http://127.0.0.1:11434` | Ollama address |
| `MOCKINGBIRD_LLM_MODEL` | `qwen3:4b-instruct-2507-q4_K_M` | Cleanup model |

## Run the tests

```sh
bun run test:integration
```

This runs the unit tests plus the integration tests, which use the real
models and the sample clips in `bench/fixtures/`. The pipeline tests print each
result. The sample clips are generated with the macOS `say` voice; regenerate
them with `bun run fixtures`.

## Development

| Command | What it does |
|---|---|
| `bun run typecheck` | Type-check every package |
| `bun run lint` | Lint and check formatting (Biome) |
| `bun run format` | Fix formatting |
| `bun test` | Unit tests; no models needed |
| `bun run test:integration` | Unit and integration tests with the real models |
| `bun run transcribe <file>` | Transcribe a recording |

Code layout:

```
apps/daemon/       the background service; today, the pipeline (src/pipeline.ts)
                   and the transcribe command (src/transcribe.ts)
packages/audio/    loading audio files (WAV directly, other formats via ffmpeg)
packages/vad/      Silero voice activity detection
packages/asr/      speech-to-text, whisper-server adapter
packages/llm/      cleanup prompt, skip rule, formatting, Ollama adapter
bench/fixtures/    sample recordings
docs/              design documents
```

## Documentation

- [Philosophy](docs/PHILOSOPHY.md): why this exists, and the rules it won't break
- [Architecture](docs/ARCHITECTURE.md): how the system fits together
- [Models](docs/MODELS.md): which models run where
- [Security and privacy](docs/SECURITY_PRIVACY.md): what data is handled and how
- [Database](docs/DATABASE.md): the planned SQLite schema
- [Terminal UI](docs/TUI.md): the planned dashboard and its theme

## Contributing

Contributions are welcome from anyone. Read [CONTRIBUTING.md](CONTRIBUTING.md)
first; AI agents should also read [AGENTS.md](AGENTS.md).

Found a security problem? Don't open a public issue; follow
[SECURITY.md](SECURITY.md).

## License

No license has been chosen yet, so for now the code is not licensed for reuse.
It will be an OSI-approved open-source license
([ARCHITECTURE.md §16](docs/ARCHITECTURE.md#16-known-gaps--scope-not-yet-decided)).
