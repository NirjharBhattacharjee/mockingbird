# mockingbird docs

This folder is the project's living design record.

- **[PHILOSOPHY.md](./PHILOSOPHY.md)** — why this project exists and what it
  must never become: always free, open to everyone, local-first and
  privacy-first by belief, not just by design. Read this before proposing
  anything that touches monetization, access, or inclusion — for humans and
  AI agents alike.
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — the bible. Stack, architecture, state
  ownership, packaging, deployment, CI/CD, and open scope. Every architectural
  decision should end up reflected here before or shortly after it lands in code.
  This document is expected to change constantly as v1 becomes v2 becomes v3 —
  see its changelog at the top for how edits are tracked.
- **[SECURITY_PRIVACY.md](./SECURITY_PRIVACY.md)** — threat model, data
  inventory, network/storage/permissions policy, and the open privacy risks
  that local-first design does not by itself close.
- **[MODELS.md](./MODELS.md)** — every model mockingbird runs (VAD, ASR,
  cleanup LLM): what each one does, where it sits in the pipeline, how it's
  invoked, and its licensing.

If a decision made in code contradicts this doc, the doc is wrong and should be
fixed in the same PR that makes the change. Nobody should have to read git log
to understand why the system is shaped the way it is.
