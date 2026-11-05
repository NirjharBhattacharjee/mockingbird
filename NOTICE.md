# Third-party notices

mockingbird ships no third-party files in this repository. `mockingbird
models pull` and `models pull chrome` download these to
`~/.mockingbird/` when you run them, each pinned and checked against its
sha256 (`apps/daemon/src/models.ts`).

## Fonts

From [google/fonts](https://github.com/google/fonts) at commit
`023eedd8780dd254e5905901473ed55e5475ee73`, into `~/.mockingbird/fonts/`,
for the pages and captions the engine renders (#156). Every one is under the
[SIL Open Font License 1.1](https://openfontlicense.org), which allows using,
bundling and redistributing a font with any software. Each family's
`OFL.txt` in google/fonts names its copyright holders.

| Family | Files | Used for |
|---|---|---|
| Inter | `Inter[opsz,wght].ttf`, `Inter-Italic[opsz,wght].ttf` | captions; a sans for pages |
| Charis SIL | Regular, Italic, Bold, BoldItalic | a serif for pages |
| JetBrains Mono | `JetBrainsMono[wght].ttf` | a monospace for pages |
| Noto Sans Bengali, Devanagari, Arabic, Hebrew, Thai, Tamil | `NotoSans<Script>[wdth,wght].ttf` | text in those scripts |
| Noto Sans SC, JP, KR | `NotoSans<SC/JP/KR>[wght].ttf` | Chinese, Japanese, Korean |

## Programs and models

| What | License | Where from |
|---|---|---|
| Whisper models (whisper.cpp's ggml files) | MIT | Hugging Face, `ggerganov/whisper.cpp` |
| Silero VAD | MIT | GitHub, `snakers4/silero-vad` |
| chrome-headless-shell | BSD-3-Clause (Chromium) and its third-party notices | Chrome for Testing |
