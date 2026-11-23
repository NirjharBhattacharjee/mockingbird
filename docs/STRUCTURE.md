# Code structure: domains and import rules

This page says where each capability lives in the engine and which code may
import which. The goal: to change one capability, you read its folder and
nothing unrelated. `scripts/imports.ts` checks the rules below as part of
`bun run lint`, so CI fails on a wrong import. Line limits per file are in
[AGENTS.md §File size](../AGENTS.md#file-size), checked by
`scripts/file-size.ts`.

The engine is moving into this layout one domain at a time
([#300](https://github.com/NirjharBhattacharjee/mockingbird/issues/300)).
Until a domain has moved, its code is still in `apps/daemon/src/mcp.ts` or
in a file at the root of `apps/daemon/src/`.

## Layers

| Layer | Where | What goes in it |
|---|---|---|
| Package | `packages/*/src/` | Reusable mechanics with explicit inputs: decoding, VAD, Whisper, Chrome, project files. Knows nothing about MCP or the commands. |
| Domain | `apps/daemon/src/<domain>/` | The engine's decisions for one capability: which clips, which model, which filter graph. Knows nothing about MCP. |
| Tool surface | `apps/daemon/src/<domain>/tools.ts`, `<name>.schema.ts` | Each tool's schema and a thin handler: check the arguments, call the domain, format the reply. |
| MCP server | `apps/daemon/src/mcp/` | JSON-RPC (`server.ts`), prompts, the shared `Tool` type (`types.ts`) and argument parsers (`args.ts`), and `tools.ts`, which lists every domain's tools. |
| Entry point | `apps/daemon/src/cli.ts`, `agent.ts`, `motion/runner.ts` | Started as a process; nothing imports it. |

## Domain map

`D` is `apps/daemon/src`. "Today" is where the code is before its move.

| Domain | Subdomain | Tools | Today | Folder |
|---|---|---|---|---|
| Transcript | speech to text, word cache, dictionary | transcribe, dictionary_list, dictionary_add | moved: `transcript/tools.ts`, `transcribe.ts`, `words.ts`, `clips.ts`, `dictionary.ts`; `transcribe.ts` at `D` stays as the command; `packages/{asr,vad,store}` | `D/transcript/` |
| Inspection | picture: frames, scenes, scopes | frames, scenes, scopes | moved: `inspect/tools.ts`, `frames.ts`, `scenes.ts`, `scopes.ts`, `probe.ts` | `D/inspect/` |
| | sound: pauses, measure, stats, sync | pauses, measure, audio_stats, sync | moved: `inspect/pauses.ts`, `audio-stats.ts`, `sync.ts` | `D/inspect/` |
| | tracking | track | moved: `inspect/track.ts` | `D/inspect/` |
| Screen recording | inspection | screen_frames, screen_changes, screen_privacy, screen_watch | moved: `screen/tools.ts`, `screen/inspection/` | `D/screen/` |
| | normalise, render | screen_normalize, screen_render | moved: `screen/tools.ts`, `screen/render.ts`; `packages/video` | `D/screen/` |
| Project | edit ops, export | edit, export | moved: `project/tools.ts`, `edit.ts`, `export.ts`; `packages/timeline` | `D/project/` |
| Captions | cues from words, style, fonts | captions | moved: `captions/tools.ts`, `cues.ts`, `style.ts`, `style.schema.ts`, `burn.ts`; drawing itself is in render's `renderCut` (mcp.ts) until render moves; `packages/captions` | `D/captions/` |
| Effects | catalog, filters, masks, subject mattes | effects | moved: `effects/tools.ts`, `catalog.ts`, `filters.ts`, `masks.ts`, `subject.ts`; `packages/matte` | `D/effects/` |
| Motion | HTML pages, the kit, the sandbox | motion | moved: `motion/tools.ts`, `run.ts`, `kit.ts`, `runner.ts`; `packages/motion` | `D/motion/` |
| | look boards | look | moved: `motion/look.ts` | `D/motion/` |
| Render | types, camera movement (framing, moves), filter graph, mix | render, the make_short prompt | mcp.ts | `D/render/` |
| | loudness to −14 LUFS | | mcp.ts | `D/render/` |
| | music beds | music | mcp.ts | `D/render/` |
| | stream copy, segment cache, drafts | | mcp.ts | `D/render/` |
| | HTML overlays on clips | | mcp.ts | `D/render/` |
| Install | models, Chrome, fonts, whisper-server, runtime | status | models.ts, runtime.ts | `D/install/` |
| Playbooks | the plugin's skills | guide | guide.ts | `D/guide.ts` |

Three words that mean more than one thing here:

- **Normalising** is three separate jobs: loudness to −14 LUFS (render),
  a screen recording to constant frame rate and square pixels
  (`screen_normalize`), and HDR to SDR (`inspect/hdr.ts`: `frames`,
  `scopes` and `probe` need it too, and inspect can't import effects).
- **Music** made by a generator is sound mixed under the cut, so it sits
  with loudness in render. Motion is pictures.
- **Voices**: there's no voice or speech-synthesis code, only
  `mockingbird record` (the mic to a file). A domain gets a folder when it
  has code.

The setup, doctor, agents, uninstall and retire commands stay at the root
of `D` until a change splits them.

## Import rules

The row may import the column:

| from \ to | package | domain | tool surface | MCP server | entry point |
|---|---|---|---|---|---|
| package | the package graph below | no | no | no | no |
| domain | yes | the domain graph below | no | no | no |
| tool surface | yes | yes | its own folder's `*.schema.ts` | `mcp/types.ts`, `mcp/args.ts` | no |
| MCP server | yes | `guide.ts` | only `mcp/tools.ts`, every `*/tools.ts` | yes | no |
| entry point | yes | yes | yes | yes | no |

Tests may import anything.

**Package graph.** `audio`, `store`, `matte` and `motion` import no package.
`asr`, `vad` and `video` may import `audio`; `captions` may import
`motion`; `timeline` may import `captions`.

**Domain graph** (folders under `D`):

| Domain | May import |
|---|---|
| install | — |
| inspect | install |
| transcript | inspect, install |
| effects | inspect (track's path points), install |
| motion | inspect (`probe`, HDR to SDR), install |
| screen | motion, install |
| captions | transcript, motion, install |
| project | transcript, captions, inspect (`probe`, for export), install |
| render | effects, captions, motion, project, transcript, inspect, install |

A file at the root of `D` is legacy: it may import any domain, and any
domain may import it, until it moves.

## A list that only shrinks

`MCP_IMPORTERS` in `scripts/imports.ts` names the only files that may
import the legacy `mcp.ts`: `mcp/tools.ts`, which lists the tools still
defined there, `transcribe.ts`, and the tests that reach into it,
including the characterization tests in `apps/daemon/test/characterize/`,
which pin today's behaviour so each move can show it changed nothing. An
entry that no longer imports it fails the check, so the list gets shorter
as the move goes on. New code imports from the domain's folder, and any
folder under `D` must be in the domain graph.

## Adding a domain or an edge

Add the folder or the arrow to this page and to `DOMAINS` or `PACKAGES` in
`scripts/imports.ts` in the same PR, and say why in the PR description. An
edge that would make a cycle means the shared code belongs lower down:
move it instead.
