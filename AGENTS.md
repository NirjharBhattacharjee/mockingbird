# Agent workflow

> This file governs every agent working in this repository — human-invoked
> or automated, including the skills in [`agent-skills/`](./agent-skills)
> (`new-feature`, `code-structure`, `evidence-driven-testing`,
> `before-and-after`, `greploop`/`greploop-apps`, `unslop`). It's the
> repo-specific fill-in that collection's own template asks for.
> **Read [docs/PHILOSOPHY.md](./docs/PHILOSOPHY.md) and
> [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) first**, plus
> [docs/DATABASE.md](./docs/DATABASE.md) for any change touching `data.db`
> and [docs/MCP.md](./docs/MCP.md) for any change to a tool — this file
> condenses them into checklist form; it doesn't replace them.

## Workflow

1. **Isolate — `/new-feature`.** Every new feature starts in a fresh Git
   worktree branched from `origin/main`. Never build on `main`. Worktrees
   live in `.worktrees/` (already gitignored), branch prefix `agent/`.
2. **Build — `/code-structure`.** Maps onto this repo's existing split
   ([ARCHITECTURE.md §10](./docs/ARCHITECTURE.md#10-repository-layout)):
   `packages/*` (`asr`, `vad`, `audio`, `captions`, `motion`, `store`)
   **is** the service layer — reusable mechanics, explicit inputs,
   structured returns. `apps/daemon` (the engine: the MCP server, its tools
   and the commands) **is** the orchestration layer — it owns *which* clips,
   *which* model, *what* filter graph. Don't let platform-specific logic
   leak out of `audio`/`captions`/`motion` into the engine, and don't let
   `packages/*` import from `apps/*` — that boundary is load-bearing, not a
   style preference. `apps/cli` (Go) only finds the engine and hands it each
   command; it never opens `data.db`.
3. **Prove — `/evidence-driven-testing`.** Evidence for an engine change is
   measured: render time, loudness, WER, a frame from the output, or the
   tool's output before and after, not a claim. A change to what a render
   looks like gets stills from the real output.
4. **Ship — `/before-and-after`, then `/greploop`.** Use `before-and-after`
   for a change to what a render looks like (two stills); otherwise ship
   with measured before/after numbers in the PR description. Run `/greploop` (or
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

- No paywall, usage cap, credits, metering, license key, or "free now, paid
  later" plan, ever, for any feature — enterprise features included. Open
  source, not open core.
- No discriminatory content or behavior, anywhere in the project, on any
  basis.
- No telemetry/analytics by default; if ever added, opt-in and separate
  from onboarding.
- No required account, login, or license server.
- No exception to local-first: the *only* network calls anywhere in the
  system are explicit, user-approved downloads: `mockingbird models pull`,
  and `mockingbird setup`, which runs that same download and `brew install`
  only after the user says yes (or passes `--yes`)
  ([ARCHITECTURE.md §9](./docs/ARCHITECTURE.md#9-everything-is-local)).
- No CLA — contributor licensing is DCO-only
  ([CONTRIBUTING.md §11](./CONTRIBUTING.md#11-contributor-licensing--dco-not-a-cla)).

**Technical** — from [ARCHITECTURE.md §2](./docs/ARCHITECTURE.md#2-core-principles):

- Two languages, each in its own place. The engine (`apps/daemon` and every
  `packages/*`) is TypeScript on Bun. The user-facing command (`apps/cli`)
  is Go. Go lives nowhere else, and never a `.swift`/`.mm`/`.rs` file we
  write or compile ourselves. Third-party binaries are consumed as
  subprocesses or prebuilt native modules.
- No Electron, no native GUI toolkit — a future preview is a local page in
  the browser.
- `packages/*` never imports from `apps/*`.
- Every editing tool must run and be testable with no GUI, mic or
  permission prompt — a change that breaks headless testability is a design
  problem to raise, not merge around.
- A dependency dying degrades functionality; it never breaks every tool
  ("degrade, don't break").
- **Only the engine writes `data.db`**, through `packages/store` (any engine
  process may; WAL serialises them). `apps/cli` never opens it; see
  [DATABASE.md §1](./docs/DATABASE.md#1-design-goals-for-this-schema).
- Any PR changing architecture, data handling, a model, or a tool must
  update the relevant doc (`ARCHITECTURE.md` / `SECURITY_PRIVACY.md` /
  `MODELS.md` / `DATABASE.md` / `MCP.md`) in the same PR
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
3. Assemble evidence into a before/after pair (measured numbers, or stills
   from a render).
4. Commit with a clear message, signed off (`git commit -s`, the `dco` CI
   job checks it; run the message through `/unslop`), rebase onto
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
| Integration tests (real VAD, whisper-server, ffmpeg) | `bun run test:integration` | no — run locally for any change to `packages/{audio,vad,asr,captions,motion}` or a tool |
| Build smoke test | `bun build --compile` | not yet — onnxruntime's dylib isn't embedded |
| Go command (`apps/cli`) | `cd apps/cli && gofmt -l . && go vet ./... && go test -race ./...` | yes |
| Whisper model comparison | `bun run bench:models` | no — run locally before changing the default model (MODELS.md §6) |

For render work, the evidence is the render's time, its loudness
(`ffmpeg -af ebur128`) and stills from it, before and after. For
transcription, WER and time from `bench:models`.

## Environment quick reference

- Runtime: Bun ≥ 1.2 — full stack table in
  [ARCHITECTURE.md §3](./docs/ARCHITECTURE.md#3-technology-stack).
- Platforms: macOS, Linux (x64, arm64) and Windows (x64). Development and
  the measured numbers are on an Apple Silicon Mac; CI runs all three.
- Data dir: `~/.mockingbird/` — `data.db` (schema:
  [DATABASE.md](./docs/DATABASE.md)), `models/`, `logs/` (install logs).
- **License: MIT** ([LICENSE](./LICENSE)). Don't add per-file license
  headers, and don't copy in code under a license that isn't MIT-compatible
  (e.g. GPL); third-party code with a different license goes in its own
  repo, like `agent-skills`.

## Local test infrastructure

- `bench/fixtures/` — two synthetic clips (`hello.wav`, `short.wav`) made
  with macOS `say`; regenerate with `bun run fixtures`. There's no corpus
  of real footage or edit-quality eval yet.
- Integration tests use `base.en`, not the shipping-size `large-v3`
  (see [MODELS.md](./docs/MODELS.md)).
- Tool tests (`apps/daemon/test/mcp.test.ts`) check the ffmpeg filter graph
  a tool builds as a string, and the integration tests run it on fixtures —
  copy that pattern rather than mocking modules.
- No mic, GUI or permission is needed for any tool.

## What can't be tested locally / in CI

- Whether an edit is *good* (pacing, framing, caption placement) — needs a
  person watching the render; the plugin's reviewer agent
  (`plugin/agents/reviewer.md`) checks what can be measured.
- The upgrade from v0.3.2 (`retire.ts` removing the launchd agent and giving
  Fn back) — needs a Mac that ran dictation; the unit tests fake `launchctl`
  and `defaults`.

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
