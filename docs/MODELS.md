# mockingbird — models

> **Status:** v1 design, pre-code — reflects the model choices fixed in
> [ARCHITECTURE.md §3](./ARCHITECTURE.md#3-technology-stack) and
> [§6](./ARCHITECTURE.md#6-the-dictation-pipeline).
> **Owner:** bhattacharjeenirjhar26@gmail.com
> **Last updated:** 2026-09-16

Every model mockingbird runs, runs **on-device**, loaded from
`~/.mockingbird/models/` and served by a local subprocess bound to
`127.0.0.1` — never a hosted API. See
[SECURITY_PRIVACY.md §3](./SECURITY_PRIVACY.md#3-network-policy) for the
network guarantee this depends on. This doc is the inventory of *which*
models, *where* in the pipeline each one sits, and *how* it's invoked.

## Table of contents

1. [Model inventory](#1-model-inventory)
2. [Where each model sits in the pipeline](#2-where-each-model-sits-in-the-pipeline)
3. [Voice activity detection — Silero VAD](#3-voice-activity-detection--silero-vad)
4. [Speech-to-text — Whisper (whisper.cpp)](#4-speech-to-text--whisper-whispercpp)
5. [Cleanup / formatting LLM — Qwen3-4B-Instruct](#5-cleanup--formatting-llm--qwen3-4b-instruct)
6. [Vector search — sqlite-vec (not a model)](#6-vector-search--sqlite-vec-not-a-model)
7. [Model swapping & configuration](#7-model-swapping--configuration)
8. [Acquisition, storage & integrity](#8-acquisition-storage--integrity)
9. [Licensing](#9-licensing)

---

## 1. Model inventory

| Model | Role | Runs via | Runs as | Default size class |
|---|---|---|---|---|
| **Silero VAD** | Voice activity detection — decide when speech starts/stops in the audio stream | `onnxruntime-node` | native module, in-process | ~1–2 MB (ONNX) |
| **Whisper `large-v3-turbo`, Q5_0** | Speech-to-text (ASR) — audio → raw transcript | `whisper.cpp` (`whisper-server`) | subprocess, HTTP `:8771` | ~800 MB–1.5 GB quantized |
| **Qwen3-4B-Instruct, Q4** | Cleanup/formatting LLM — raw transcript → cleaned, punctuated, formatted text | Ollama **or** `llama-server` (llama.cpp) | subprocess, HTTP `:8772` | ~2.5–3 GB quantized |

Three models, three distinct jobs, three different runtimes — deliberately
not consolidated into one model, because VAD needs to be near-instant and
tiny, ASR needs to be accurate on raw audio, and the cleanup LLM needs
instruction-following on already-transcribed text, and no single model in
this size range is best at all three.

## 2. Where each model sits in the pipeline

```mermaid
sequenceDiagram
    participant RB as Ring Buffer (PCM)
    participant VAD as Silero VAD\n(in-process)
    participant ASR as whisper-server\n(large-v3-turbo Q5_0)
    participant Gate as LLM Gate
    participant LLM as llama-server / Ollama\n(Qwen3-4B-Instruct Q4)
    participant Fmt as Formatter
    participant Inj as Injector

    RB->>VAD: 32ms windows (512 samples), continuously
    VAD-->>RB: speech / silence boundary
    Note over RB,ASR: on hotkey release, segment cut
    RB->>ASR: POST /inference (WAV segment)
    ASR-->>Gate: {text, confidence, words}
    alt short + high confidence
        Gate->>Fmt: raw text (LLM skipped entirely)
    else needs cleanup
        Gate->>LLM: raw text + dictionary + app context
        LLM-->>Fmt: cleaned text
    end
    Fmt->>Inj: final text → typed into focused field
```

This mirrors [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-the-dictation-pipeline)
exactly — see that section for the full FSM context around it. The one
routing decision worth calling out here: **the LLM is conditionally skipped**
by the LLM Gate for short, high-confidence utterances, so a quick "yes" or
"ok" never pays LLM latency it doesn't need. VAD and ASR are never skipped —
every captured segment goes through both.

## 3. Voice activity detection — Silero VAD

- **Job:** classify 32ms audio windows (512 samples at 16kHz, the size
  Silero v5 requires, with the previous window's last 64 samples prepended
  as context) as speech/silence in real time, while
  the ring buffer is filling, to find utterance boundaries (and to detect
  700ms of silence as the auto-chunk boundary in `CAPTURE_LOCK` mode — see
  [ARCHITECTURE.md §5](./ARCHITECTURE.md#5-the-hotkey-state-machine)).
- **Where it's used:** continuously, in-process, on the always-running ring
  buffer — this is the only model that runs even when the hotkey isn't
  pressed (it's how the ring buffer knows what "speech" looks like for
  pre-roll purposes).
- **How it's invoked:** loaded once at daemon startup via
  `onnxruntime-node`, called synchronously per-frame from the `SEG` stage in
  [the system architecture diagram](./ARCHITECTURE.md#4-system-architecture).
  No HTTP hop — it's a native module call in the same process.
- **Why this model:** small enough to run per-frame with negligible CPU
  cost, purpose-built for VAD (not a general audio model repurposed for it),
  and ships as ONNX so it loads through the same `onnxruntime-node`
  dependency without needing a second inference runtime.

## 4. Speech-to-text — Whisper (whisper.cpp)

- **Job:** convert a cut audio segment (PCM, 16kHz) into a raw text
  transcript, plus a `confidence` score (mean probability of the spoken,
  non-punctuation words) used by the LLM Gate's skip decision.
- **Where it's used:** once per finalized utterance — triggered when the
  hotkey is released (`CAPTURE_PTT`) or a silence boundary is hit in lock
  mode (`CAPTURE_LOCK`). Never runs continuously; only on a cut segment.
- **How it's invoked:** `whisper-server`, a supervised child process running
  `whisper.cpp`, listening on `127.0.0.1:8771`. The daemon `POST`s the
  segment as a WAV upload to `/inference` (`response_format=verbose_json`)
  and gets back `{text, confidence, words}`. First start on a machine takes
  ~15s while Metal compiles its shaders (cached afterwards), which is why it
  runs as a long-lived child rather than per dictation. If
  `whisper-server` dies, the supervisor restarts it — dictation queues or
  degrades rather than silently failing, per the "degrade, don't break"
  principle in [ARCHITECTURE.md §2](./ARCHITECTURE.md#2-core-principles).
- **Model file:** `large-v3-turbo`, quantized to `Q5_0`. This is the
  accuracy/latency/size tradeoff point chosen for v1 — swappable per
  [§7](#7-model-swapping--configuration). Development and the integration
  tests currently use the much smaller `base.en` (~148 MB); `large-v3-turbo`
  hasn't been measured on this pipeline yet.

## 5. Cleanup / formatting LLM — Qwen3-4B-Instruct

- **Job:** take the raw ASR transcript plus context (user dictionary,
  frontmost-app profile) and produce the final text — punctuation,
  capitalization, disfluency removal ("um", false starts), per-app style
  (e.g. no auto-caps in Terminal), and voice-command interpretation.
- **Where it's used:** only when the LLM Gate decides cleanup is needed —
  short, high-confidence utterances skip straight from ASR to the Formatter.
  This is the one model in the pipeline that's *conditionally* invoked.
- **How it's invoked:** either Ollama or `llama-server` (llama.cpp),
  supervised subprocess, `127.0.0.1:8772`. The daemon sends the raw text
  plus the relevant slice of the `dictionary` table and the current
  `app_profile` row (see [the SQLite schema](./ARCHITECTURE.md#7-where-sqlite-fits))
  as prompt context, and gets cleaned text back.
- **Model file:** `Qwen3-4B-Instruct`, quantized to `Q4`. Chosen as an
  instruction-tuned model small enough to run acceptably on a laptop GPU/CPU
  while still following formatting instructions reliably.
- **Fallback behavior:** if this server is down, dictation falls back to raw
  ASR output rather than blocking — same degrade-don't-break principle as
  `whisper-server`.

## 6. Vector search — sqlite-vec (not a model)

`sqlite-vec` (mentioned in [ARCHITECTURE.md §7](./ARCHITECTURE.md#7-where-sqlite-fits))
is a SQLite extension for storing and querying vector embeddings, loaded
directly into `data.db` via `db.loadExtension()` — **it is not itself a
model**, and no embedding model is chosen yet. Semantic search over
utterance history and dictionary terms is listed as v1.x/optional scope; if
built, it will need its own embedding model entry in this doc (likely a
small local sentence-embedding model, on-device for the same reasons as
everything else in this file). Tracked as undecided, not silently assumed.

## 7. Model swapping & configuration

- **ASR and LLM are both swappable via config** — per
  [ARCHITECTURE.md §3](./ARCHITECTURE.md#3-technology-stack), the `asr` and
  `llm` packages are designed so the base URL and model name are
  configuration, not hardcoded, specifically so a different model size (or,
  per [ARCHITECTURE.md §13](./ARCHITECTURE.md#13-is-docker-needed), a
  `llama-server` running on a separate machine on the LAN) can be substituted
  without a code change.
- **VAD is not currently designed as swappable** — Silero via
  `onnxruntime-node` is treated as a fixed part of the pipeline, not a
  configurable choice, since its cost/accuracy profile isn't a tradeoff most
  users need to tune.
- Model choice (which Whisper size, which LLM) is expected to live in the
  `settings` table (see [state ownership map](./ARCHITECTURE.md#8-state-ownership-map))
  and be editable via the TUI or a future `mockingbird config` CLI — exact
  surface undecided, see [ARCHITECTURE.md §16](./ARCHITECTURE.md#16-known-gaps--scope-not-yet-decided).

## 8. Acquisition, storage & integrity

- Model weights are **never bundled** in the release archive — too large.
  They're fetched on demand via `mockingbird models pull <name>`, the
  **one and only** network call anywhere in the system, and always
  user-triggered and URL-transparent (see
  [SECURITY_PRIVACY.md §3](./SECURITY_PRIVACY.md#3-network-policy)).
- Downloaded weights land in `~/.mockingbird/models/` as flat files —
  filesystem-owned, no database record beyond whatever `settings` entry
  points at the active model name/path.
- **Integrity is not yet verified on download.** Per
  [SECURITY_PRIVACY.md §6](./SECURITY_PRIVACY.md#6-process--trust-boundaries),
  a model file is untrusted input to native C/C++ parsers
  (`whisper.cpp`, `onnxruntime-node`), so checksum/signature verification
  against the source repo's published hash before first load is an open
  hardening item, not yet implemented.

## 9. Licensing

Per [ARCHITECTURE.md §16](./ARCHITECTURE.md#16-known-gaps--scope-not-yet-decided),
overall repo licensing is still an open decision, and bundled/depended-on
tooling licenses need checking before shipping an archive containing them:

| Component | License (verify before release) |
|---|---|
| `whisper.cpp` | MIT |
| `llama.cpp` | MIT |
| Ollama | MIT (Apache-2.0 dependencies included — verify at release time) |
| Silero VAD weights | check upstream model card |
| Whisper `large-v3-turbo` weights | check upstream model card (OpenAI Whisper weights, MIT code / separate weight terms) |
| Qwen3 weights | check upstream model card (Qwen license terms, not plain MIT) |

Model **weights** and the **code that runs them** often carry different
licenses — this table should be double-checked at release time, not assumed
from the inference engine's license.
