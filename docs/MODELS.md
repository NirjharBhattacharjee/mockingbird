# mockingbird — models

> **Owner:** bhattacharjeenirjhar26@gmail.com
> **Last updated:** 2026-11-03 (the cleanup model is gone, #135)

Every model mockingbird runs, runs on the user's computer, loaded from
`~/.mockingbird/models/`. The thinking about an edit is done by the user's own
agent, so mockingbird runs no language model of its own. See
[SECURITY_PRIVACY.md §3](./SECURITY_PRIVACY.md#3-network-policy) for the
network guarantee this depends on.

The dictation-era version, with the cleanup model (Qwen3-4B through Ollama),
its eval and its benchmarks, is in git: `git show v0.3.2:docs/MODELS.md`.

## Table of contents

1. [Model inventory](#1-model-inventory)
2. [Speech detection — Silero VAD](#2-speech-detection--silero-vad)
3. [Speech-to-text — Whisper](#3-speech-to-text--whisper)
4. [The dictionary](#4-the-dictionary)
5. [Choosing a model](#5-choosing-a-model)
6. [Which Whisper, measured](#6-which-whisper-measured)
7. [Adapting Whisper to one voice: no-go](#7-adapting-whisper-to-one-voice-no-go)
8. [Acquisition, storage & integrity](#8-acquisition-storage--integrity)
9. [Licensing](#9-licensing)

---

## 1. Model inventory

| Model | Job | Runs via | Size |
|---|---|---|---|
| **Silero VAD** v6.2.2 | finds the speech in a file, so Whisper hears speech and not silence | `onnxruntime-node`, in-process | 2 MB |
| **Whisper `large-v3`, Q5_0** | speech to text with word times | `whisper.cpp`'s `whisper-server`, a subprocess per call on a free `127.0.0.1` port | 1.08 GB |

## 2. Speech detection — Silero VAD

`transcribe` and `captions` run Silero over the whole decoded file in 32 ms
windows (512 samples at 16 kHz, with the previous window's last 64 samples
as context), then cut the speech it finds into chunks of up to 30 seconds
for Whisper (`chunks` in `apps/daemon/src/mcp.ts`). Whisper decides per
30-second window whether a stretch is speech, so feeding it speech and not
long silences keeps it from dropping or inventing passages.

## 3. Speech-to-text — Whisper

- **Invoked as** `whisper-server`, started for each call on a free port
  (`packages/asr`), sent each chunk as a WAV to `/inference` with
  `response_format=verbose_json`, giving text and word times. It starts with
  `-nlp` when the installed version has it: without it every request runs
  the encoder twice just to report a language probability (~1.2 s per
  request with `large-v3` on an M3). The first start on a machine takes
  ~15 s while Metal compiles its shaders.
- **Which whisper-server.** On macOS, Homebrew's `whisper-cpp`, which uses
  Metal; whisper.cpp ships no macOS server. On Linux (x64, arm64) and
  Windows (x64), `models pull` downloads whisper.cpp's own CPU build of
  release b5454 (v1.9.5), checked against a pinned sha256, into
  `~/.mockingbird/bin`. The CUDA builds are 0.5 GB and need NVIDIA's
  runtime, so they're not pulled. `MOCKINGBIRD_WHISPER_SERVER` points at
  another. Time to transcribe `bench/fixtures/hello.wav` (4.5 s) with
  `base.en`, the whole `mockingbird transcribe` command, best of three:

  | System | whisper-server | Time |
  |---|---|---|
  | macOS, Apple M3 | Homebrew, Metal | 0.5 s |
  | Linux x64 (GitHub `ubuntu-latest`, 4 vCPU) | pulled, CPU | 2.1 s |
  | Linux arm64 (GitHub `ubuntu-24.04-arm`, 4 vCPU) | pulled, CPU | 3.5 s |
  | Windows x64 (GitHub `windows-latest`, 4 vCPU) | pulled, CPU | 1.9 s |
- **`large-v3` over `large-v3-turbo`, because of names.** Turbo's decoder is
  much smaller, and that's where the knowledge of unusual names lives. On
  synthetic speech naming four people, turbo wrote "Nurj Harbada Charjee"
  and "Aishwarya Venkatasan"; `large-v3` wrote "Nirjhar Bhattacharjee" and
  "Aishwarya Venkatesan" with no help. Names in captions are the first thing
  a viewer notices, so the slower model is the default.
- **Full precision is not better.** `ggml-large-v3.bin` (f16, 3.1 GB) spelled
  names worse than Q5_0 (1.08 GB) did.
- **Language.** `MOCKINGBIRD_LANGUAGE` (default `en`) pins it, so Whisper
  doesn't drift; pinned to the wrong one, it translates instead. `auto`
  detects it per chunk, slower. The `.en` models only know English, so
  `mockingbird models` hides them in another language. §5 covers picking a
  model per language.
- **Padding matters.** Cutting silences out of the middle, or trimming tight
  to the speech, produced wrong words; keeping a second either side
  produced clean sentences. `captions` pads each clip by two seconds, and
  hears clips whose padding overlaps as one stretch (#127).
- **DTW for the word cache.** The words a project is cut on are heard with
  `--dtw <preset>` (`large.v3`, `large.v3.turbo`, `base.en` and so on, from
  the model's file name): a point inside each word from the alignment heads,
  which doesn't drift the way the word times do (up to 0.5 s over a 30 s
  window on a recorded talk). DTW doesn't run with flash attention, so that
  server starts with `-nfa`: 38.9 s against 32.5 s for 4 minutes of a talk on
  an M3, about 20% slower, paid once per source. A model with no preset (a
  fine-tune) gets no points, and its words keep Whisper's times. Plain
  `transcribe` keeps flash attention.
- The integration tests use `base.en` (148 MB) to stay quick. It isn't what
  ships.

## 4. The dictionary

No model spells a name it has never heard. `mockingbird dictionary add` (or
the `dictionary_add` tool) stores the words that matter to this user in
`data.db` ([DATABASE.md §2](./DATABASE.md#2-dictionary)), and every
transcript and caption is corrected with them
(`packages/store/src/dictionary.ts`):

| Entry | What it does |
|---|---|
| `Nirjhar Bhattacharjee` | anything that sounds like it becomes it |
| `Catppuccin (a colour theme)` | the same, with a note the agent sees in `dictionary_list` |
| `cat puck => Catppuccin` | that exact phrase is replaced first, for a word Whisper always gets wrong the same way |

**Matched by sound, not spelling** (`correctNames`, `soundOf`). Whisper
writes an unfamiliar name as it hears it, never the same way twice: "Nurj
Harbada Charjee", "Nerj Herbata Chargy". `soundOf` reduces a word to its
consonant skeleton with the distinctions that don't survive mishearing
folded together (`bh`→`b`, `c`/`k`/`q`, `sh`/`ch`/`j`/`z`/`x`, `v`/`w`), and
spans of one word fewer to two words more than the term are compared by edit
distance, at 0.7 similarity or better. Both manglings above resolve to the
right name, while "llama", "Richard" and "Sid and Ash" are left alone. With
`words: true`, names are fixed one word at a time, so a name misheard as two
words stays as heard there.

The dictionary is never given to Whisper as a prompt: measured, the hint
fixed one name and bent two others the model had right ("Bhattacharjee" →
"Bhattacharje").

## 5. Choosing a model

- `mockingbird models` lists the Whisper files in `models/`, largest first,
  marking the one in use and the default.
- `mockingbird models use <file>` saves the choice as `asr_model` in
  `data.db`; `--default` clears it. The next call uses it.
- `MOCKINGBIRD_ASR_MODEL` (a file name in `models/`, or a path) wins over the
  saved choice, and `models use` says so.
- `mockingbird models use <file> --language bn` saves a model for one
  language, as `asr_model.bn`. When `MOCKINGBIRD_LANGUAGE` is that language,
  it's used; any other language keeps the choice for all. `models` lists the
  map under "By language". `--default --language bn` clears one entry.
- With nothing chosen, the default is used, or else the best earlier default
  that's downloaded, with a warning.
- Any `ggml-*.bin` Whisper model works, including community fine-tunes for
  one language. `mockingbird models pull <name or URL>` downloads one:
  - A name (`large-v3-turbo`, `small`) is whisper.cpp's own file on Hugging
    Face.
  - A Hugging Face URL works as it is, a page link (`/blob/`) too. Only
    Hugging Face's own reply is trusted for a checksum: it names the file's
    sha256 (`x-linked-etag`), size and commit (`x-repo-commit`), so the
    download is pinned to that commit and checked against that sha256.
  - Any other https URL needs the publisher's checksum with `--sha256`.
    Plain http is refused.
  - A file not named `ggml-*.bin` needs a name with `--as`.

- **Per call:** `transcribe` and `captions` take `model` and `language`
  (and `mockingbird transcribe --model --language`). They win over the
  settings and the environment, for that call only.
- **Detection:** with the language on `auto`, no `model` given, and at least
  one model mapped to a language, the call transcribes the first stretch of
  speech (up to 30 s) with the default model, reads the language Whisper
  names ("german"), and, if the map has another model for it, restarts on
  that one. That costs one extra model load, only when the model changes.
  The transcript's first line says which language and model it used.
- Mixed speech in one video is transcribed with the model chosen from the
  start. For Bangla and English in one sentence, give `language` (and the
  model) rather than rely on detection.

## 6. Which Whisper, measured

The rule for changing the default: at least as accurate **and** measurably
faster or smaller.

**Whisper,** `bun run bench:models`, on an M3 (16 GB), warm server. 64 clips:
8 dictation-style sentences (names, numbers, a list, a question) spoken by 8
macOS voices, three of them Indian English. Synthetic voices are easier than
a real one, so the error rates are optimistic; compare the rows, not the
absolute numbers. "Names" counts names spelled exactly, with no dictionary.
Word error is summed over the corpus (total edits over total words).

| Model | Disk | Ready | Memory | Median | p90 | WER | WER en_IN | Names |
|---|---|---|---|---|---|---|---|---|
| large-v3-q5_0 | 1081 MB | 1.1 s | 1437 MB | 1547 ms | 1589 ms | 3.2% | 3.6% | 17/32 |
| large-v3-turbo-q8_0 | 874 MB | 0.7 s | 960 MB | 1099 ms | 1116 ms | 4.0% | 4.3% | 13/32 |
| large-v3-turbo-q5_0 | 574 MB | 0.5 s | 773 MB | 1146 ms | 1160 ms | 4.2% | 4.3% | 13/32 |
| medium.en-q5_0 | 539 MB | 0.7 s | 807 MB | 814 ms | 850 ms | 4.3% | 4.7% | 14/32 |
| small.en-q5_1 | 190 MB | 0.5 s | 456 MB | 290 ms | 304 ms | 5.9% | 6.5% | 8/32 |
| base.en | 148 MB | 0.3 s | 322 MB | 103 ms | 109 ms | 8.5% | 7.5% | 5/32 |
| large-v3 | 3095 MB | 2.1 s | 3351 MB | 1620 ms | 1721 ms | 3.2% | 3.9% | 17/32 |

`large-v3` Q5_0 stays: the most accurate overall, on the Indian-accent
voices and on names, and full precision buys nothing for three times the
size. `large-v3-turbo` Q5_0 is half the disk and ~0.4 s faster per clip for
~1 point more word error and 4 fewer names right. Re-run `bun run
bench:models` when a new model comes out.

## 7. Adapting Whisper to one voice: no-go

Decided 2026-10-30 in #109.

**Decision: don't build it.** Fine-tuning Whisper on a user's own recordings
(a LoRA adapter) needs far more speech than calibration collects. At that
amount it barely helps, and it makes the model worse for every other voice.
It would also ship a Python training toolchain. Choosing the model and the
VAD threshold (#107) and the names page (#108) cost none of that.

**How it was measured.** The voice was `say -v Rishi` (Indian English), with
pink noise mixed in 10 dB under it, so `base.en` makes real mistakes. That's
one voice in one room, like a user at their desk. The sentences came from
PAWS (Wikipedia, 8–22 words, no digits), in three training sets of 3, 15
and 30 minutes, plus 60 held-out sentences of the same voice (1,009 words).
Another 60 sentences read clean by `say -v Moira` (Irish English, 1,013
words) checked other voices. The LoRA was rank 32 on the attention `q_proj`
and `v_proj` of `openai/whisper-base.en`, trained with Hugging Face
`transformers` + `peft` on the M3's GPU (MPS), batch 4, learning rate 5e-4,
with at least 150 steps per set. Word error rate (WER), lower is better.
One point on each test set is about 10 words.

| Trained on | Steps | Training time | Same voice, held out | Other voice |
|---|---|---|---|---|
| nothing (base.en) | — | — | 15.6% | 9.7% |
| 3 min (one calibration run) | 153 | 2.2 min | 16.7% | 12.2% |
| 15 min | 152 | 2.3 min | 15.0% | 12.5% |
| 30 min | 231 | 7.5 min | 13.3% | 10.2% |

What this says, question by question from #109:

- **Data.** One calibration run makes the model worse for both voices.
  Thirty minutes, ten runs of reading, buys 2.3 points for that voice and
  costs the other 0.5. In #107's measurements, with pink noise 14 dB under
  the voice, switching from `base.en` to `small.en` gained 2.4 points with
  no training at all. Real accents vary
  more than a synthetic voice does, so real users would likely need more
  audio than this, not less.
- **Tooling.** The training environment was 921 MB (Python 3.12, torch,
  transformers, peft), and the base weights another 281 MB in Hugging Face
  format, not ggml. The adapter would also have to be merged and converted
  to ggml for whisper-server (whisper.cpp's `convert-h5-to-ggml.py`, which
  needs whisper.cpp's source and OpenAI's `whisper` repo). That step wasn't
  tried. The installer would have to fetch all of it, through
  `mockingbird models pull`, the one download allowed.
- **Cost.** 5.25 GB of GPU memory at peak for `base.en`, and a 4.5 MB
  adapter. The default model, `large-v3`, is about 20 times the size of
  `base.en`. It wouldn't train in 16 GB this way.
- **Caveats.** It's one synthetic voice, one noise level, one model size and
  one recipe, with no hyperparameter search. A better recipe might do better.
  It won't fix needing ten times the audio, or the other voice getting worse.

Revisit only if a user has hours of their own corrected dictation and asks
for it, or whisper.cpp learns to load an adapter without a Python toolchain.
The spike's script is on #109.

## 8. Acquisition, storage & integrity

- Weights are never bundled. `mockingbird models pull` downloads Whisper
  `large-v3` Q5_0 from a pinned Hugging Face commit and Silero VAD v6.2.2
  from GitHub, prints each URL, and checks each against a pinned sha256
  (`MODEL_FILES` in `apps/daemon/src/models.ts`). An interrupted download is
  continued, and one that doesn't match is deleted. `models pull <name or
  URL>` downloads one more model the same way, against the sha256 Hugging
  Face gives or `--sha256` (§5).
- They're plain files in `~/.mockingbird/models/`. `data.db` keeps only file
  names: the one chosen for every language (`asr_model`), and one per
  language picked with `--language` (`asr_model.<code>`).
- whisper-server's build for Linux and Windows is pinned the same way
  (`pinnedWhisper` in `apps/daemon/src/runtime.ts`).

## 9. Licensing

mockingbird's code is [MIT](../LICENSE). The models and tools it runs have
their own terms:

| Component | License |
|---|---|
| `whisper.cpp` | MIT |
| Whisper weights | MIT (OpenAI) |
| Silero VAD | MIT |
| ffmpeg | LGPL or GPL depending on the build; mockingbird uses the system's and ships none |

Check a model's card before adding it to `MODEL_FILES`: weights and the code
that runs them often carry different licenses.
