# Contributing to mockingbird

> **Status:** v1 design, pre-code — the project is still in the docs-only
> phase described in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md). Where a
> section below describes a workflow that needs code or CI infrastructure
> that doesn't exist yet, it says so — this document is written to be
> correct on day one of real code, not rewritten from scratch then.
> **Owner:** bhattacharjeenirjhar26@gmail.com
> **Last updated:** 2026-09-16

Thank you for considering contributing. mockingbird is built on the belief
that useful software should be free and open to everyone — see
[docs/PHILOSOPHY.md](./docs/PHILOSOPHY.md) for why this project exists.
**Every contributor, human or AI agent, is expected to have read that
document and this one before opening an issue or a PR.** Not as a formality
— the non-negotiables in `PHILOSOPHY.md §3` (always free, open to everyone,
local-first, no exceptions) will be enforced in review, and knowing them up
front saves everyone a declined PR.

## Table of contents

1. [Required reading, in order](#1-required-reading-in-order)
2. [Code of Conduct](#2-code-of-conduct)
3. [Ways to contribute](#3-ways-to-contribute)
4. [Before you start — talk first for anything non-trivial](#4-before-you-start--talk-first-for-anything-non-trivial)
5. [Development workflow](#5-development-workflow)
6. [Coding standards](#6-coding-standards)
7. [Commit messages & changesets](#7-commit-messages--changesets)
8. [Tests & CI gate](#8-tests--ci-gate)
9. [Docs move in the same PR as the change](#9-docs-move-in-the-same-pr-as-the-change)
10. [Pull request process](#10-pull-request-process)
11. [Contributor licensing — DCO, not a CLA](#11-contributor-licensing--dco-not-a-cla)
12. [Reporting security issues](#12-reporting-security-issues)
13. [For AI agents contributing](#13-for-ai-agents-contributing)
14. [Recognition](#14-recognition)
15. [Open gaps in this process](#15-open-gaps-in-this-process)

---

## 1. Required reading, in order

Before anything else, read these — short, and they resolve most "would this
be accepted?" questions on your own:

1. [docs/PHILOSOPHY.md](./docs/PHILOSOPHY.md) — why this exists, and the
   non-negotiables (always free, open to everyone, local-first) that no PR
   may cross, regardless of how good the feature is otherwise.
2. [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — the stack, the core
   principles (§2), and the package boundaries your code has to respect.
3. [docs/SECURITY_PRIVACY.md](./docs/SECURITY_PRIVACY.md) — the threat
   model and data-handling rules. Any change touching audio, transcripts,
   network calls, or storage is reviewed against this doc specifically.
4. [docs/MODELS.md](./docs/MODELS.md) — if you're touching ASR/VAD/LLM code,
   know what's already there before adding a fourth model or a new
   dependency.
5. This document.

If a PR description or issue makes clear the author skipped these (proposing
a paid tier, a cloud API call, a telemetry default), it will be redirected
back to `PHILOSOPHY.md` before any code review happens.

## 2. Code of Conduct

There is no `CODE_OF_CONDUCT.md` in this repository yet — tracked as a gap
in [§15](#15-open-gaps-in-this-process). Until one is formally adopted
(most likely the [Contributor Covenant](https://www.contributor-covenant.org/)),
the standard is stated plainly here and applies with full force:

- Be respectful. No harassment, discrimination, or exclusionary behavior on
  any basis — caste, gender, creed, nationality, disability, religion,
  sexuality, or anything else — in issues, PRs, code review, or any other
  project space. This is a direct extension of
  [PHILOSOPHY.md §3, point 2](./docs/PHILOSOPHY.md#3-non-negotiables).
- Assume good faith, especially with first-time contributors. Review the
  code, not the person.
- Reports of violations go to bhattacharjeenirjhar26@gmail.com until a
  dedicated reporting channel exists.

## 3. Ways to contribute

Code isn't the only contribution that matters here:

- **Code** — features, bug fixes, performance work, new platform backends
  (see the Windows/Linux gaps in
  [ARCHITECTURE.md §16](./docs/ARCHITECTURE.md#16-known-gaps--scope-not-yet-decided)).
- **Docs** — fixing drift between the docs and reality is explicitly
  encouraged; [ARCHITECTURE.md §17](./docs/ARCHITECTURE.md#17-versioning--how-this-doc-evolves)
  treats a doc/code mismatch as a bug.
- **Bug reports** — clear repro steps matter more than a fix.
- **Design review / pushback** — disagreeing with an architectural choice,
  with reasoning, is a valid and welcome contribution on its own.
- **Triage** — helping label and reproduce issues once the tracker exists.

## 4. Before you start — talk first for anything non-trivial

- **Small fix (typo, obvious bug, small doc correction):** just open a PR.
- **Anything that adds a dependency, changes a package boundary, adds a
  model, touches the network policy, or otherwise isn't a small fix: open
  an issue first**, or comment on an existing one, before writing code.
  This project takes the "docs are the source of truth" rule in
  `ARCHITECTURE.md` seriously — a PR that contradicts it gets asked to
  update the doc or change the approach, and that conversation is cheaper
  before the code is written than after.
- Check [ARCHITECTURE.md §16](./docs/ARCHITECTURE.md#16-known-gaps--scope-not-yet-decided)
  first — it's a live list of decisions the project knows are open. If
  you're proposing to resolve one of those, say so explicitly in your
  issue/PR so it can be checked off there too.

## 5. Development workflow

The workspace follows
[ARCHITECTURE.md §10](./docs/ARCHITECTURE.md#10-repository-layout). So far
only the headless pipeline exists (`packages/{audio,vad,asr,llm}` and
`apps/daemon`); other packages get created when their work starts.

1. Fork the repository, clone your fork.
2. Create a branch off `main`, named for what it does
   (`fix/hotkey-double-tap-race`, `docs/models-licensing-table`).
3. `bun install` at the workspace root (Bun 1.4.2, the version CI pins).
4. Make your change inside the correct package/app — see
   [§6](#6-coding-standards) for the boundary rules.
5. Run the checks in [§8](#8-tests--ci-gate) locally before opening a PR.
6. Push to your fork and open a PR against `main`.

`main` is expected to require `ci.yml` green before merge
([ARCHITECTURE.md §14](./docs/ARCHITECTURE.md#14-cicd-pipeline)) — don't
rely on a maintainer catching what CI would have caught.

## 6. Coding standards

These are enforced, not stylistic suggestions:

- **TypeScript on Bun, no exceptions.** Per
  [ARCHITECTURE.md §2](./docs/ARCHITECTURE.md#2-core-principles), point 1:
  every file we write is `.ts`. Third-party binaries are consumed as
  subprocesses or prebuilt native modules, never hand-written by us in
  another language.
- **No Electron, no Swift, no native GUI toolkit.** Point 2 of the same
  section. Feedback is audio cues + the OpenTUI terminal UI.
- **Respect package boundaries:**
  `packages/*` never imports from `apps/*`
  ([ARCHITECTURE.md §10](./docs/ARCHITECTURE.md#10-repository-layout)).
  Platform-specific code stays behind the `asr`/`inject`/`context`/`audio`
  interfaces, not scattered inline.
- **Headless-testable core.** Point 4 of §2: the pipeline (VAD → ASR → LLM →
  format) must run and be testable with zero OS integration. If your change
  makes that untestable without a real mic/hotkey, that's a design problem
  to raise before merging, not after.
- **Degrade, don't break.** Point 5 of §2: a dependency dying should degrade
  functionality, not crash dictation outright. New integrations with
  external processes (a new ASR/LLM backend, say) need a defined fallback
  behavior as part of the PR, not a follow-up.
- **New dependencies must clear the stack rule** in
  [ARCHITECTURE.md §3](./docs/ARCHITECTURE.md#3-technology-stack): consumed
  via `fetch()`, `Bun.spawn()`, or a prebuilt N-API module — never a
  `.swift`/`.mm`/`.go`/`.rs` file we'd have to write or compile ourselves.
- **No dependency, default, or code path that violates
  [PHILOSOPHY.md §3](./docs/PHILOSOPHY.md#3-non-negotiables)** — no
  telemetry by default, no required account, no cloud call for core
  dictation, no usage metering.

## 7. Commit messages & changesets

- Write commit messages that explain *why*, not just *what* — the diff
  already shows what changed.
- Every user-facing or package-level change needs a
  [Changesets](https://github.com/changesets/changesets) entry once the
  tooling is in place (`bunx changeset`), per
  [ARCHITECTURE.md §14](./docs/ARCHITECTURE.md#14-cicd-pipeline) — this is
  what drives version bumps and the generated changelog, so a PR without one
  will be asked to add it rather than have a maintainer reconstruct the
  changelog entry later.
- Squash noisy "fix typo" / "wip" commit chains before requesting review, or
  expect them to be squashed on merge.

## 8. Tests & CI gate

These are the checks a PR must pass
(see [ARCHITECTURE.md §14](./docs/ARCHITECTURE.md#14-cicd-pipeline)).
`ci.yml` currently runs the first four on every push and PR:

| Check | Command | In CI |
|---|---|---|
| Install (deterministic) | `bun install --frozen-lockfile` | yes |
| Typecheck, all workspaces | `bun run typecheck` | yes |
| Lint + format check (Biome) | `bun run lint` (`bun run format` fixes) | yes |
| Unit tests, all packages | `bun test` | yes |
| Integration tests, incl. fixture WAV → VAD → ASR → LLM → text | `bun run test:integration` | not yet — needs local models |
| Build smoke test (macOS runner) | `bun build --compile` | not yet — no entry point to compile |

`bun run test:integration` needs, locally:

- `whisper-server` (`brew install whisper-cpp`)
- `~/.mockingbird/models/ggml-base.en.bin` and `~/.mockingbird/models/silero_vad.onnx`
- Ollama running with `qwen3:4b-instruct-2507-q4_K_M` pulled

Override locations with `MOCKINGBIRD_HOME`, `MOCKINGBIRD_LLM_URL`, and
`MOCKINGBIRD_LLM_MODEL`. Run the integration tests for any change that
touches `packages/{vad,asr,llm}` or the pipeline.

Run whichever of these apply to your change locally before opening a PR.
A PR that only "probably passes CI" is not ready for review — run it first.
New code needs new tests; a bug fix without a regression test that would
have caught the bug is treated as incomplete.

## 9. Docs move in the same PR as the change

This project treats documentation as load-bearing, not optional:

- Any PR that changes architecture, adds/removes a dependency, or moves
  where state lives **must** update `docs/ARCHITECTURE.md` in the same PR
  ([ARCHITECTURE.md §17](./docs/ARCHITECTURE.md#17-versioning--how-this-doc-evolves)).
- Any PR that changes data handling, storage, or network behavior must
  reconcile with `docs/SECURITY_PRIVACY.md` in the same PR.
- Any PR that adds, removes, or swaps a model must update `docs/MODELS.md`.
- If review finds the docs and the code disagree, that's a bug against the
  docs, filed and fixed like any other — don't leave it for later.

## 10. Pull request process

1. **Title:** short, specific, imperative (`Fix double-tap race in hotkey FSM`,
   not `Fixes`).
2. **Description:** what changed and why; link the issue it resolves or the
   discussion that preceded it (see [§4](#4-before-you-start--talk-first-for-anything-non-trivial)).
   State plainly if the PR touches anything in
   [PHILOSOPHY.md §3](./docs/PHILOSOPHY.md#3-non-negotiables) or
   [SECURITY_PRIVACY.md](./docs/SECURITY_PRIVACY.md) — don't make a reviewer
   go looking for that.
3. **Size:** keep PRs focused on one change. A large PR mixing a refactor
   with a feature will be asked to split.
4. **Draft PRs** are welcome for early feedback on direction before the
   work is finished — mark them as drafts so reviewers know not to do a
   final pass yet.
5. **Review:** at least one maintainer approval required before merge.
   Disagreements are resolved by checking against `PHILOSOPHY.md` and
   `ARCHITECTURE.md` first — those documents are the tie-breaker, not
   seniority or who argues longer.
6. **Merge:** squash-merge by default to keep `main` history readable,
   unless the PR's individual commits are independently meaningful.

GitHub auto-populates every new PR's description from
[`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md) —
fill in its checklist rather than deleting it. This is the actual mechanism
behind "make sure everyone goes through the guidelines": the checklist is in
front of you before you can submit, not something you have to remember to
add.

## 11. Contributor licensing — DCO, not a CLA

This project does **not** use a Contributor License Agreement. A typical CLA
assigns the maintainer extra rights — often including the ability to
relicense the project later, including into something closed or paid — which
directly conflicts with
[PHILOSOPHY.md §3, point 4](./docs/PHILOSOPHY.md#3-non-negotiables): *"the
license must never allow this to be taken away from the people using it."*
Requiring a CLA would work against the reason this project exists.

Instead, contributions will use the lightweight
[Developer Certificate of Origin](https://developercertificate.org/) (DCO):
by signing off your commits (`git commit -s`), you're certifying you wrote
the contribution or otherwise have the right to submit it under the
project's open-source license. No copyright transfer, no extra rights
granted beyond what that license already gives everyone. (DCO enforcement
in CI is not yet wired up — tracked in [§15](#15-open-gaps-in-this-process).)

The project's license itself is still an open decision — see
[ARCHITECTURE.md §16](./docs/ARCHITECTURE.md#16-known-gaps--scope-not-yet-decided)
— but per `PHILOSOPHY.md`, it will be an OSI-approved, genuinely open
license that permits forking, not a source-available or "free but
restricted" arrangement.

## 12. Reporting security issues

**Do not open a public issue for a security vulnerability.** Report
privately per [SECURITY.md](./SECURITY.md) and
[SECURITY_PRIVACY.md §10](./docs/SECURITY_PRIVACY.md#10-reporting-a-vulnerability) —
email bhattacharjeenirjhar26@gmail.com, or use GitHub's private
vulnerability reporting once it's enabled on the repo.

## 13. For AI agents contributing

If you are an AI coding agent (Claude Code or otherwise) opening issues or
PRs against this repository, the following applies to you with the same
weight as everything above — you are not exempt from any of it:

- **Read [§1](#1-required-reading-in-order) in full before making changes**,
  not just this file. `PHILOSOPHY.md §5` already gives you standing
  instructions; this file is the procedural layer on top of that.
- **Disclose AI authorship in the PR description.** If a PR is primarily
  AI-written or AI-assisted, say so plainly (e.g. "drafted with Claude
  Code, reviewed by @handle"). This isn't a mark against the contribution —
  it's information a reviewer needs, the same way they'd want to know a PR
  was auto-generated from a codemod.
- **A human is accountable for every merged change.** An AI agent does not
  get commit or merge rights. Every AI-authored PR needs a human who
  reviewed it, understands it, and takes responsibility for it — "the agent
  wrote it" is never a substitute for that review.
- **No exemption from tests, changesets, or docs updates.** Run the checks
  in [§8](#8-tests--ci-gate) for real and report actual results — don't
  claim a test suite passes without having run it.
- **Flag, don't silently resolve, conflicts with `PHILOSOPHY.md §3`.** If a
  request would add a paywall, telemetry default, required account, or
  cloud dependency, say so explicitly and ask, rather than either refusing
  silently or implementing it anyway.
- **Attribution:** commits authored with AI assistance should carry proper
  co-authorship trailers per the tool's own convention (e.g.
  `Co-Authored-By: <tool> <noreply-address>`), same as any other
  co-authored commit.

## 14. Recognition

Every contributor matters, regardless of contribution size — a one-line doc
fix from a first-time contributor is as welcome as a large feature. Once the
project has a real release history, contributors will be credited in
release notes (via the Changesets-generated changelog,
[ARCHITECTURE.md §14](./docs/ARCHITECTURE.md#14-cicd-pipeline)) and, if
there's interest, a `CONTRIBUTORS`/`AUTHORS` file or README section.

## 15. Open gaps in this process

Named explicitly rather than silently deferred, matching the style of
[ARCHITECTURE.md §16](./docs/ARCHITECTURE.md#16-known-gaps--scope-not-yet-decided):

- **`CODE_OF_CONDUCT.md`** — not yet adopted; [§2](#2-code-of-conduct) states
  the standard inline in the meantime.
- **DCO enforcement in CI** — the policy in [§11](#11-contributor-licensing--dco-not-a-cla)
  is stated but not yet mechanically checked (e.g. a DCO GitHub App/Action
  that blocks unsigned commits).
- **License file** — see
  [ARCHITECTURE.md §16](./docs/ARCHITECTURE.md#16-known-gaps--scope-not-yet-decided);
  this doc's DCO/no-CLA stance is written to hold regardless of which
  specific OSI license is ultimately chosen.
- **Issue labels** (`good first issue`, `help wanted`) — the repo
  ([github.com/NirjharBhattacharjee/mockingbird](https://github.com/NirjharBhattacharjee/mockingbird))
  is live, but labels haven't been set up yet.
- **Branch protection on `main`** — should require `ci.yml` green before
  merge, per [§8](#8-tests--ci-gate); not yet configured in GitHub settings.
- **Integration tests in CI** — they need whisper-server, Ollama, and about
  2.7 GB of models, so they only run locally for now.
