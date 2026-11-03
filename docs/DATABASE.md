# mockingbird — database schema

> **Owner:** bhattacharjeenirjhar26@gmail.com
> **Last updated:** 2026-11-03 (dictation tables dropped, #135)

`~/.mockingbird/data.db` is one SQLite file opened with `bun:sqlite`
(`packages/store`). It holds the user's dictionary and the choices they made
with a command. Video, renders and models are files, not rows. If the code
and this file disagree, this file is wrong and gets fixed in the same PR.

The dictation-era schema (utterances, learned corrections, calibration takes)
is in git: `git show v0.3.2:docs/DATABASE.md`.

## 1. Design goals for this schema

- **Any mockingbird process may write.** There's no daemon any more. A
  `mockingbird dictionary add` and an MCP server's `dictionary_add` can run
  at once; WAL mode and a 5-second busy timeout serialise them. `apps/cli`
  (Go) never opens `data.db`; it runs the engine's commands.
- **Two tables.** `dictionary` and `settings`. A new table needs a tool or a
  command that reads it.
- **Natural keys.** `dictionary.term`, `settings.key`.
- **Self-contained values.** Nothing in a row points at a path on this
  machine except a model file name, so `data.db` can be copied between
  machines.

## 2. `dictionary`

Words transcription should spell a particular way.

```sql
CREATE TABLE dictionary (
  term        TEXT PRIMARY KEY COLLATE NOCASE,  -- how to write it
  heard       TEXT,                             -- what Whisper writes instead, if it's always the same
  hint        TEXT,                             -- a note for whoever reads the list ("a person")
  created_at  INTEGER NOT NULL,                 -- ms since the epoch
  updated_at  INTEGER NOT NULL
);
```

Adding a term that's already there (in any case) updates it, keeping a
`heard` or `hint` the new entry leaves out. Listed alphabetically.

## 3. `settings`

```sql
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
```

| Key | Written by | Value |
|---|---|---|
| `asr_model` | `mockingbird models use <file>` | a Whisper file name in `models/`; deleted by `--default` |

Rows from dictation (`llm_model`, `vad_threshold`) may still be in an old
`data.db`. Nothing reads them.

## 4. Migrations

`PRAGMA user_version` counts the steps in `MIGRATIONS`
(`packages/store/src/index.ts`) that have run; opening `data.db` runs the
rest in one immediate transaction, so two processes opening it at once can't
both migrate. Steps are appended, never edited.

| # | Step |
|---|---|
| 1 | `dictionary` |
| 2 | `correction`, `dictionary.learned` (dictation learning, #62) |
| 3 | `settings` |
| 4 | `calibration` (#106) |
| 5 | drops `correction`, `calibration`, `dictionary.learned` and `dictionary.uses` (#135). Learned words stay as ordinary ones. |

## 5. Retention

Nothing expires. `mockingbird dictionary remove` deletes a word;
`mockingbird uninstall` offers to copy the dictionary out, then deletes
`~/.mockingbird`.
