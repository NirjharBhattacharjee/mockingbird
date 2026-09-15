# mockingbird docs

This folder is the project's living design record.

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — the bible. Stack, architecture, state
  ownership, packaging, deployment, CI/CD, and open scope. Every architectural
  decision should end up reflected here before or shortly after it lands in code.
  This document is expected to change constantly as v1 becomes v2 becomes v3 —
  see its changelog at the top for how edits are tracked.

If a decision made in code contradicts this doc, the doc is wrong and should be
fixed in the same PR that makes the change. Nobody should have to read git log
to understand why the system is shaped the way it is.
