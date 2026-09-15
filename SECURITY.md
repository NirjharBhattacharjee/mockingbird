# Security Policy

mockingbird is a local-first, privacy-first voice dictation tool — see
[docs/SECURITY_PRIVACY.md](./docs/SECURITY_PRIVACY.md) for the full threat
model, data inventory, and known open risks. This file is the short,
canonical entry point GitHub and contributors look for.

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.** Public issues
are for bugs and features that don't expose users to risk while the fix is
pending; a vulnerability report needs to stay private until a fix ships.

Report privately, by either:

- **GitHub Private Vulnerability Reporting** — if enabled on this repo, use
  the "Report a vulnerability" button under the Security tab at
  [github.com/NirjharBhattacharjee/mockingbird/security](https://github.com/NirjharBhattacharjee/mockingbird/security).
- **Email** — bhattacharjeenirjhar26@gmail.com. Include what you found,
  affected version/commit, and reproduction steps if you have them.

You'll get an acknowledgement as soon as possible. This is a small
open-source project without a dedicated security team, so please be patient
— but every report is taken seriously, especially given how much local
access this tool requires (microphone, Accessibility, Input Monitoring; see
[docs/SECURITY_PRIVACY.md §4](./docs/SECURITY_PRIVACY.md#4-macos-permissions-tcc)).

## Scope

In scope: mockingbird's own code (daemon, TUI, packages), its release/build
process, and its install scripts.

Likely out of scope, but still worth a heads-up: vulnerabilities in
third-party dependencies we merely consume (`whisper.cpp`, `llama.cpp`,
Ollama, `ffmpeg`) — please report those upstream too, and let us know so we
can track exposure and update our bundled/pinned versions.

## Supported versions

Pre-1.0: only the latest release is supported. This section will be
expanded once there's a version history to maintain a policy over.

## What "secure" means for this project

Read [docs/SECURITY_PRIVACY.md](./docs/SECURITY_PRIVACY.md) — in
particular §1 (threat model: what's in scope vs. explicitly not) and §8
(known, already-acknowledged privacy gaps, like unencrypted SQLite at rest).
If what you found is already listed there, it's known and tracked, not
news — but a *concrete exploit path* for something listed there is still
worth reporting privately, since "theoretical gap" and "here's how to
actually abuse it" are different severities.
