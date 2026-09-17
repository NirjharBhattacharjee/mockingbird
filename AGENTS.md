# Agent workflow

> This file governs every agent working in this repository — human-invoked
> or automated, including the skills in [`agent-skills/`](./agent-skills)
> (`new-feature`, `code-structure`, `evidence-driven-testing`,
> `before-and-after`, `greploop`/`greploop-apps`, `unslop`). It's the
> repo-specific fill-in that collection's own template asks for.
> **Read [docs/PHILOSOPHY.md](./docs/PHILOSOPHY.md) and
> [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) first**, plus
> [docs/DATABASE.md](./docs/DATABASE.md) for any change touching `data.db`
> and [docs/TUI.md](./docs/TUI.md) for any change touching `apps/tui` — this
> file condenses all four into checklist form; it doesn't replace them.

## Workflow

1. **Isolate — `/new-feature`.** Every new feature starts in a fresh Git
   worktree branched from `origin/main`. Never build on `main`. Worktrees
   live in `.worktrees/` (already gitignored), branch prefix `agent/`.
2. **Build — `/code-structure`.** Maps onto this repo's existing split
   ([ARCHITECTURE.md §10](./docs/ARCHITECTURE.md#10-repository-layout)):
   `packages/*` (`asr`, `llm`, `inject`, `vad`, `audio`, `store`) **is** the
   service layer — reusable mechanics, explicit inputs, structured returns,
   no reaching into daemon state. `apps/daemon` (the FSM, the supervisor,
   the pipeline stages) **is** the orchestration layer — it owns *when* to
   capture, *when* the LLM Gate skips cleanup, *when* to inject. Don't let
   platform-specific logic leak out of `asr`/`inject`/`context`/`audio`
   into orchestration code, and don't let `packages/*` import from `apps/*`
   — that boundary is load-bearing, not a style preference. `apps/tui`
   fits the same split from the other side: it's a pure read-only client
   over the daemon's IPC socket and direct (read-only) SQLite queries — see
   [DATABASE.md §1](./docs/DATABASE.md#1-design-goals-for-this-schema) and
   [TUI.md §1](./docs/TUI.md#1-what-the-tui-is-structurally). It never opens
   a write transaction against `data.db` itself; a TUI action that needs to
   persist something (e.g. the dictionary editor) asks the daemon to write,
   over IPC, same as any other write path.
3. **Prove — `/evidence-driven-testing`.** For pipeline/daemon code (no
   GUI yet), evidence means measured numbers: WER and per-stage latency
   from `bench/`, not screenshots. Once `apps/tui` exists, evidence for a
   TUI change means a recording (or scripted capture) showing the actual
   screen named in [TUI.md §5](./docs/TUI.md#5-screens--what-each-one-controls)
   — Dashboard, History browser, Dictionary editor, or Latency waterfall —
   behaving as claimed, in the Catppuccin theme described there.
4. **Ship — `/before-and-after`, then `/greploop`.** `before-and-after`
   only applies once the TUI exists; until then, ship with measured
   before/after numbers in the PR description instead. Run `/greploop` (or
   `/greploop-apps` for huge PRs) until Greptile reports 5/5 with zero
   unresolved comments — but read [§Hard invariants](#hard-invariants)
   first: greploop fixes whatever Greptile flags with no awareness of this
   repo's constraints, so the fixing agent (you) is the actual check
   against a Greptile suggestion crossing one of them.

## Writing for humans

Run `/unslop` over anything a person will read before committing, posting,
or sending it: commit messages, PR title/body, doc edits, code comments,
closing replies. Apply it to text you wrote or changed, not prose you
didn't touch.

## Hard invariants

Non-negotiable. If a Greptile comment, a feature request, or your own
judgment call would cross one of these, **stop and flag it — do not
silently implement it**, regardless of how reasonable the suggestion looks
in isolation. This list exists specifically so automated loops like
greploop have something to check a "fix" against.

**Product / philosophy** — from [PHILOSOPHY.md §3](./docs/PHILOSOPHY.md#3-non-negotiables):

- No paywall, usage cap, credits, metering, or "free now, paid later" plan,
  ever, for any core dictation feature.
- No discriminatory content or behavior, anywhere in the project, on any
  basis.
- No telemetry/analytics by default; if ever added, opt-in and separate
  from onboarding.
- No required account, login, or license server.
- No exception to local-first: the *only* network call anywhere in the
  system is the explicit, user-triggered `mockingbird models pull`
  ([ARCHITECTURE.md §9](./docs/ARCHITECTURE.md#9-everything-is-local)).
- No CLA — contributor licensing is DCO-only
  ([CONTRIBUTING.md §11](./CONTRIBUTING.md#11-contributor-licensing--dco-not-a-cla)).

**Technical** — from [ARCHITECTURE.md §2](./docs/ARCHITECTURE.md#2-core-principles):

- 100% TypeScript on Bun. Third-party binaries are consumed as subprocesses
  or prebuilt native modules — never a `.swift`/`.mm`/`.go`/`.rs` file we
  write or compile ourselves.
- No Electron, no native GUI toolkit — feedback is audio cues + the OpenTUI
  terminal UI only.
- `packages/*` never imports from `apps/*`.
- The pipeline (VAD → ASR → LLM → format) must run and be testable with
  zero OS integration — a change that breaks headless testability is a
  design problem to raise, not merge around.
- A dependency dying degrades functionality; it never crashes dictation
  outright ("degrade, don't break").
- **The daemon is the only writer to `data.db`.** No other process —
  `apps/tui` included — opens a write transaction against it directly; see
  [DATABASE.md §1](./docs/DATABASE.md#1-design-goals-for-this-schema) and
  the code-structure mapping in [§Workflow](#workflow), step 2.
- Any PR changing architecture, data handling, a model, or the TUI must
  update the relevant doc (`ARCHITECTURE.md` / `SECURITY_PRIVACY.md` /
  `MODELS.md` / `DATABASE.md` / `TUI.md`) in the same PR
  ([ARCHITECTURE.md §17](./docs/ARCHITECTURE.md#17-versioning--how-this-doc-evolves)).

## Multi-agent rules

- Never commit directly to `main`.
- One worktree and one branch per task and per agent — never reuse or
  modify another agent's worktree, branch, or uncommitted work.
- **Scope check** before starting: `gh pr list` and skim changed files
  (`gh pr diff <n> --name-only`); check for uncommitted work in shared
  checkouts. On overlap, stop and ask for direction.
- Never force-push to `main`, never plain `--force` anywhere — only
  `--force-with-lease`, only on your own task branch.
- Resolve lockfile (`bun.lock`) conflicts by regenerating, never by
  hand-merging.
- Worktrees don't isolate shared resources: confirm a dev-server port
  answers *your* process (`lsof -i :<port>`) before trusting it, and don't
  run schema experiments against a shared `data.db`.
- If a conflict can't be resolved confidently, stop and report instead of
  guessing.

## Completing a task

1. Keep changes limited to the assigned task.
2. Run the checks in [§Commands & checks](#commands--checks).
3. Assemble evidence into a before/after pair (measured numbers until the
   TUI exists).
4. Commit with a clear message (run it through `/unslop`), rebase onto
   latest `origin/main`, rerun the checks.
5. Push (`git push -u origin <branch>`; after rebasing an already-pushed
   branch, `--force-with-lease`).
6. Open the PR — body explains what changed, how it was tested, before/after
   proof, and risks/follow-up. Run title and body through `/unslop`.
7. Run `/greploop` (or `/greploop-apps`) until 5/5, zero unresolved comments.
8. End by presenting the PR URL.

Do not merge the PR unless explicitly instructed. Keep the worktree until
the PR is merged or closed.

## Commands & checks

Mirrors [ARCHITECTURE.md §14](./docs/ARCHITECTURE.md#14-cicd-pipeline) /
[CONTRIBUTING.md §8](./CONTRIBUTING.md#8-tests--ci-gate), which also lists
the local setup the integration tests need.

| Check | Command | In CI |
|---|---|---|
| Install (deterministic) | `bun install --frozen-lockfile` | yes |
| Typecheck, all workspaces | `bun run typecheck` | yes |
| Lint + format (Biome) | `bun run lint` (`bun run format` to fix) | yes |
| Unit tests | `bun test` | yes |
| Integration tests (real VAD, whisper-server, Ollama) | `bun run test:integration` | no — run locally for any change to `packages/{vad,asr,llm}` or the pipeline |
| Build smoke test | `bun build --compile` | not yet — no daemon entry point |

Integration tests are the evidence for pipeline work: they print each
utterance's `vadMs`/`asrMs`/`llmMs`, which is the before/after number a PR
should quote.

## Environment quick reference

- Runtime: Bun ≥ 1.2 — full stack table in
  [ARCHITECTURE.md §3](./docs/ARCHITECTURE.md#3-technology-stack).
- Target platform: macOS only for v1 (arm64 primary, x64 best-effort).
- Data dir: `~/.mockingbird/` — `data.db` (schema:
  [DATABASE.md](./docs/DATABASE.md)), `models/`, `bin/`, `logs/`, socket,
  PID file.
- TUI: `@opentui/react`, Catppuccin theme (Mocha default) — full palette,
  semantic color mapping, and screen breakdown in
  [TUI.md](./docs/TUI.md). Verify any hardcoded hex value there against the
  canonical Catppuccin palette before shipping a theme file.
- **No `LICENSE` file yet** — open decision
  ([ARCHITECTURE.md §16](./docs/ARCHITECTURE.md#16-known-gaps--scope-not-yet-decided)).
  Don't assume specific license terms in code headers or docs until this
  is resolved; the DCO-not-CLA stance in
  [CONTRIBUTING.md §11](./CONTRIBUTING.md#11-contributor-licensing--dco-not-a-cla)
  holds regardless of which OSI license is eventually picked.

## Local test infrastructure

- `bench/fixtures/` — two synthetic clips (`hello.wav`, `short.wav`) made
  with macOS `say`; regenerate with `bun run fixtures`. The WER/latency
  harness and a corpus of real voices
  ([ARCHITECTURE.md §14](./docs/ARCHITECTURE.md#14-cicd-pipeline)) don't
  exist yet, so the LLM gate thresholds are provisional.
- Integration tests use `base.en`, not the shipping-size `large-v3-turbo`
  (see [MODELS.md](./docs/MODELS.md)).
- Pipeline unit tests (`apps/daemon/test/pipeline.test.ts`) inject fake
  VAD/ASR/LLM dependencies — copy that pattern rather than mocking modules.
- No mic, hotkey, or GUI needed to exercise most pipeline logic — that's
  the point of "headless-testable core."

## What can't be tested locally / in CI

- macOS TCC permission prompts (Mic, Accessibility, Input Monitoring) —
  can't be scripted; verify manually on a real machine.
- Actual keystroke injection into other GUI apps — needs a real logged-in
  GUI session, not available on typical CI runners.
- Real hotkey detection via `uiohook-napi`/CoreGraphics event taps — needs
  physical or simulated key events outside typical CI sandboxes.

## Skill sources

The skills live in [`agent-skills/`](./agent-skills), a git submodule of
[NirjharBhattacharjee/skills](https://github.com/NirjharBhattacharjee/skills).
It's a separate repo on purpose: it has its own history and pull requests,
and `before-and-after` is PolyForm Shield licensed, which mockingbird's
code can't be (see [PHILOSOPHY.md §3](./docs/PHILOSOPHY.md#3-non-negotiables)).
Nothing in `apps/` or `packages/` imports from it.

Fetch it and make the skills available to Claude Code in this project:

```sh
git submodule update --init
mkdir -p .claude/skills
for f in agent-skills/*/SKILL.md; do d="$(dirname "$f")"; ln -sfn "../../$d" ".claude/skills/$(basename "$d")"; done
```

To move to a newer version of the skills, run
`git -C agent-skills pull` and commit the updated `agent-skills` pointer.

| Skill | Source |
|---|---|
| `new-feature`, `code-structure`, `evidence-driven-testing` | the skills repo itself |
| `before-and-after` | vendored there from `vercel-labs/before-and-after` (PolyForm Shield 1.0.0) |
| `greploop` | vendored there from `greptileai/skills` (MIT) |
| `greploop-apps` | local variant there, for huge PRs (MIT) |
| `unslop` | vendored there from `cursor/plugins (pstack)` (MIT) |
