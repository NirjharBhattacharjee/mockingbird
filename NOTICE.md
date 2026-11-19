# Third-party notices

mockingbird ships one third-party file in this repository, three.js (below).
`mockingbird models pull` and `models pull chrome` download the rest to
`~/.mockingbird/` when you run them, each pinned and checked against its
sha256 (`apps/daemon/src/models.ts`).

## Fonts

From [google/fonts](https://github.com/google/fonts) at commit
`023eedd8780dd254e5905901473ed55e5475ee73`, into `~/.mockingbird/fonts/`,
for the pages and captions the engine renders (#156). Every one is under the
[SIL Open Font License 1.1](https://openfontlicense.org), which allows using,
bundling and redistributing a font with any software. Each family's
`OFL.txt` in google/fonts names its copyright holders.

Noto Color Emoji is the COLRv1 build (`Noto-COLRv1.ttf`, 5 MB) from
[googlefonts/noto-emoji](https://github.com/googlefonts/noto-emoji) at commit
`99701e07d3d1fe1bdbcdb14964547f0fd592966f`, under the same licence: its
fonts are OFL 1.1 (the repository's tools are Apache 2.0, and none of them
is used).

| Family | Files | Used for |
|---|---|---|
| Inter | `Inter[opsz,wght].ttf`, `Inter-Italic[opsz,wght].ttf` | captions; a sans for pages |
| Charis SIL | Regular, Italic, Bold, BoldItalic | a serif for pages |
| JetBrains Mono | `JetBrainsMono[wght].ttf` | a monospace for pages |
| Noto Sans Bengali, Devanagari, Arabic, Hebrew, Thai, Tamil | `NotoSans<Script>[wdth,wght].ttf` | text in those scripts |
| Noto Sans SC, JP, KR | `NotoSans<SC/JP/KR>[wght].ttf` | Chinese, Japanese, Korean |
| Anton, Bebas Neue, Oswald, Archivo Black, Bangers | one file each (Oswald variable) | display type in the motion styles (#276) |
| Montserrat, Space Grotesk, Nunito | variable | geometric and rounded sans in the styles; Montserrat in caption presets |
| Playfair Display, Cormorant Garamond, Fraunces | variable, roman and italic | display serifs in the styles |
| Caveat, Kalam (Bold), Comic Neue | Caveat variable; Comic Neue Regular, Bold | handwriting and marker in the styles |
| Courier Prime, Space Mono, VT323, Silkscreen, Arvo | Regular and Bold where there are two | typewriter, terminal, pixel and slab faces in the styles |

## Programs and models

| What | License | Where from |
|---|---|---|
| Whisper models (whisper.cpp's ggml files) | MIT | Hugging Face, `ggerganov/whisper.cpp` |
| Silero VAD | MIT | GitHub, `snakers4/silero-vad` |
| chrome-headless-shell | BSD-3-Clause (Chromium) and its third-party notices | Chrome for Testing |

## three.js

[three.js](https://threejs.org) 0.187.0, MIT licence (Copyright © 2010-2026
three.js authors), in
[`plugin/skills/motion-graphics/vendor/`](plugin/skills/motion-graphics/vendor/).
It's bundled into one file with `bun build --minify` from the npm package, and
its licence is in `three.LICENSE` beside it. It's shipped rather than
downloaded because motion pages run with no network; `motion` fills in a
page's `from "THREE"` with it (#270). Six of its add-ons from the same
version (`RoomEnvironment`, `EffectComposer`, `RenderPass`,
`UnrealBloomPass`, `BokehPass`, `OutputPass`) are bundled the same way into
`three-addons.min.js` for `from "THREE_ADDONS"` (#275).

