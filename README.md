# mockingbird

Local voice dictation for macOS. Hold a key, speak, let go, and the cleaned-up
text is typed into whatever app you're in. Your audio and text never leave your
machine: no account, no cloud, no usage limits, free forever.

It's an open-source alternative to tools like Wispr Flow. Why it exists and
what it will never become: [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md).

> **Status: early development.** You can't dictate with mockingbird yet. What
> works today is the transcription pipeline on its own: an audio file goes
> through voice detection, speech-to-text, and cleanup, and comes out as text.
> The hotkey, microphone capture, typing into apps, history, and terminal UI
> are still to be built. See [What works today](#what-works-today).

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
| Microphone capture | Not started |
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
   brew install whisper-cpp ollama
   ```

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

## Try it

Run the pipeline against the sample recordings in `bench/fixtures/`:

```sh
bun run test:integration
```

This starts `whisper-server`, runs each clip through the full pipeline, and
prints the result:

```json
{
  "rawText": "Umm, so hello world, this is a test of the Mockingbird dictation pipeline.",
  "finalText": "Hello world, this is a test of the Mockingbird dictation pipeline.",
  "vadMs": 25,
  "asrMs": 200,
  "llmMs": 1075,
  "llmOutcome": "cleaned"
}
```

`rawText` is what Whisper heard, `finalText` is what would be typed, and the
`*Ms` fields are how long each step took. `llmOutcome` is `skipped` for short
phrases, and `failed` or `rejected` when the transcript was used as-is because
cleanup didn't work.

The first run can take 15 seconds or so to start `whisper-server` while macOS
compiles its GPU code. Later runs start in about a second.

The sample clips are generated with the macOS `say` voice. To regenerate them:

```sh
bun run fixtures
```

### Settings

The tests read these environment variables:

| Variable | Default | What it sets |
|---|---|---|
| `MOCKINGBIRD_HOME` | `~/.mockingbird` | Where `models/` is |
| `MOCKINGBIRD_LLM_URL` | `http://127.0.0.1:11434` | Ollama address |
| `MOCKINGBIRD_LLM_MODEL` | `qwen3:4b-instruct-2507-q4_K_M` | Cleanup model |

## Development

| Command | What it does |
|---|---|
| `bun run typecheck` | Type-check every package |
| `bun run lint` | Lint and check formatting (Biome) |
| `bun run format` | Fix formatting |
| `bun test` | Unit tests; no models needed |
| `bun run test:integration` | Unit and integration tests with the real models |

Code layout:

```
apps/daemon/       the background service; today, the pipeline in src/pipeline.ts
packages/audio/    reading and writing WAV audio
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
