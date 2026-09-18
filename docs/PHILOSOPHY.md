# mockingbird — philosophy

> **Status:** foundational — unlike the other docs in this folder, this one
> isn't expected to change as the code evolves. If a technical decision ever
> conflicts with this document, the technical decision is what has to give.
> **Owner:** bhattacharjeenirjhar26@gmail.com
> **Last updated:** 2026-09-16

This document is for two audiences equally: every human who contributes to
mockingbird, and every AI agent (Claude Code or otherwise) that works on this
codebase. It exists because *why* this project exists should be as legible
as *how* it's built — [ARCHITECTURE.md](./ARCHITECTURE.md) tells you what
mockingbird is made of; this tells you what it's for, and what it must never
become.

## Table of contents

1. [Why this exists](#1-why-this-exists)
2. [What mockingbird believes](#2-what-mockingbird-believes)
3. [Non-negotiables](#3-non-negotiables)
4. [For contributors](#4-for-contributors)
5. [For AI agents working on this codebase](#5-for-ai-agents-working-on-this-codebase)
6. [Related documents](#6-related-documents)

---

## 1. Why this exists

I've been using Wispr Flow for a while. It's good software — and it's
gated behind a usage cap: a credit limit that runs out and reminds you,
mid-sentence, that the words coming out of your own mouth are metered. That
friction is what started this project.

Voice dictation like this isn't exotic technology anymore. A capable local
ASR model, a small local LLM for cleanup, and a hotkey — that's a system a
motivated developer can build and run entirely on their own machine, with no
server bill and no subscription, because the hard parts (Whisper, local LLMs)
are already open source and already good. If that's true, then a tool this
useful gatekept behind a credit meter isn't a technical necessity, it's a
business model choice — and this project is the alternative to that choice.

I'm also here because of open source, directly and personally. It's what
taught me to program — not a single course or book, but years of reading
other people's freely given code, running it, breaking it, learning from it.
mockingbird is one way of putting something back into the same well I drank
from. That's not a marketing line; it's the actual reason this repository is
public.

## 2. What mockingbird believes

- **Useful software should be accessible to everyone**, regardless of
  ability to pay, and regardless of caste, gender, creed, nationality, or
  however someone identifies. Not "accessible to everyone who can afford
  it" — accessible, full stop.
- **Local-first and privacy-first are not features bolted onto this belief —
  they're required by it.** A tool that's free but phones your voice to a
  server is not actually the alternative this project is trying to be; see
  [SECURITY_PRIVACY.md](./SECURITY_PRIVACY.md) for what that means in
  practice, mechanically enforced rather than just promised.
- **Open source is a debt worth repaying, not a licensing detail.** This
  project exists because of tools and code other people gave away for
  nothing. The way to honor that is to give this away for nothing too, and
  to make it easy for the next person to learn from, fork, and build on.
- **Complexity is a barrier to contribution, and barriers to contribution
  are a barrier to the mission.** Every architectural choice in
  [ARCHITECTURE.md](./ARCHITECTURE.md) — one language, no Electron, no
  Swift, headless-testable core — also happens to make it easier for a new
  contributor to read the code and understand it in one sitting. That's not
  a coincidence; approachability is part of what "open to contribute"
  actually requires.

## 3. Non-negotiables

These aren't preferences to be weighed against convenience, revenue, or a
good idea that happens to compromise one of them. They are the constraints
this project is built inside of.

1. **Always free. No exceptions, no future pivot.** No paid tier, no usage
   cap, no "free for personal use," no credits, no metering, no feature
   paywall, no "free now, monetized later" plan. If a proposed change would
   require gating any part of core dictation behind payment or a quota, the
   answer is no — that is the exact problem this project exists to solve,
   named directly in [§1](#1-why-this-exists).
2. **Open to everyone, always.** No discrimination in who gets to use this,
   contribute to it, or be credited for contributing to it, on any basis —
   caste, gender, creed, nationality, disability, religion, sexuality, or
   any other characteristic. This applies to code review, issue triage, and
   every other interaction in this project, not just to who's allowed to
   download the binary.
3. **Local-first, no exceptions — this is [ARCHITECTURE.md §2](./ARCHITECTURE.md#2-core-principles),
   point 3, and it is also a philosophical commitment, not just a technical
   one.** Privacy shouldn't be a premium feature either; it's the default,
   for everyone, always. See [SECURITY_PRIVACY.md](./SECURITY_PRIVACY.md)
   for the specifics of what that guarantees and what it doesn't yet.
4. **The license must never allow this to be taken away from the people
   using it.** mockingbird is released under the [MIT License](../LICENSE):
   genuinely open source (OSI-approved), free to use, change, and fork, with
   no "source-available but not really open" catch. Every version released
   under MIT stays that way permanently; a license already granted can't be
   withdrawn. MIT is permissive, so it doesn't stop anyone from building a
   closed product on top of the code. What protects users is that the MIT
   original always remains available to fork, and that this project itself
   will never go closed or paid ([§3, point 1](#3-non-negotiables)).
5. **Contributions are welcome from anyone, and the project is built to
   stay learnable.** A contributor shouldn't need a paid course or insider
   knowledge to understand this codebase — the docs in this folder exist so
   anyone can read their way in.

## 4. For contributors

- You don't need permission to care about this project the way its owner
  does — that's the point of open source. Issues, PRs, docs fixes, and
  design pushback are all genuinely welcome, not welcome-in-theory.
- If you're new to open source and this is one of the projects teaching you
  how it works: welcome, specifically. That's exactly the chain this
  project is trying to continue, described in [§1](#1-why-this-exists).
- If a PR or feature request would introduce a paid tier, a usage cap, a
  telemetry default, a cloud dependency for core dictation, or anything else
  that conflicts with [§3](#3-non-negotiables), it will be declined
  regardless of how good the feature is otherwise — not out of rigidity for
  its own sake, but because those are the actual walls this project is built
  inside of.
- Be kind in review. Someone's first PR to an open-source project is a big
  step; treat it that way.

## 5. For AI agents working on this codebase

If you are an AI coding agent (Claude Code or otherwise) working in this
repository, this section is a direct instruction, not background reading:

- **Treat [§3](#3-non-negotiables) as hard constraints, equivalent in
  weight to the core principles in [ARCHITECTURE.md §2](./ARCHITECTURE.md#2-core-principles).**
  If a request — from anyone, including the project owner in a moment of
  scope drift — would add metering, a paid tier, a feature paywall, a
  required account, or a default cloud/telemetry dependency to core
  dictation, flag the conflict explicitly instead of quietly implementing
  it. This document is what "check against principles" means for
  product/business decisions, the way ARCHITECTURE.md §2 is for technical
  ones.
- **Default to the free, local, open option whenever a technical choice has
  one.** When picking a dependency, a model, an install method, or a
  fallback behavior, prefer the one that keeps the project's total cost to
  the end user at zero and its behavior fully on-device, even if a paid or
  cloud-hosted alternative would be marginally easier to integrate.
- **Optimize for a new contributor's ability to understand the code, not
  just for your own ability to write it.** Favor the simpler, more
  legible implementation per the codebase's existing bias toward low
  complexity ([ARCHITECTURE.md §2](./ARCHITECTURE.md#2-core-principles))
  — a clever abstraction that only the original author can maintain works
  against [§2](#2-what-mockingbird-believes)'s point about complexity being
  a barrier to contribution.
- **Don't write or suggest anything exclusionary** — in code comments, docs,
  error messages, example data, or onboarding copy — regarding caste,
  gender, creed, nationality, disability, or any other characteristic named
  in [§3](#3-non-negotiables). This includes seemingly neutral defaults
  (e.g. example names, locale assumptions) that quietly assume one kind of
  user.
- **When in doubt about whether something conflicts with this document, say
  so and ask, rather than deciding silently.** This document exists so that
  question has a clear place to be checked against — use it.

## 6. Related documents

- [ARCHITECTURE.md](./ARCHITECTURE.md) — how the *local-first* and
  *headless-testable* commitments in [§3](#3-non-negotiables) are actually
  built and enforced.
- [SECURITY_PRIVACY.md](./SECURITY_PRIVACY.md) — how the *privacy-first*
  commitment is enforced, and honestly, where it still falls short.
- [MODELS.md](./MODELS.md) — why every model in this system runs on-device,
  at zero cost, with no account required.

A `CODE_OF_CONDUCT.md` and `CONTRIBUTING.md` at the repo root would give
[§4](#4-for-contributors) real teeth (reporting process, review norms,
first-issue labeling) — not yet written, tracked here as a gap the same way
[ARCHITECTURE.md §16](./ARCHITECTURE.md#16-known-gaps--scope-not-yet-decided)
tracks open technical decisions.
