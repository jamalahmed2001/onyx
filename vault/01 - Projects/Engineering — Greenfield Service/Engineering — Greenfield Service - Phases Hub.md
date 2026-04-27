---
project: Engineering — Greenfield Service
type: hub-project
tags:
  - hub-subdomain
  - phases-hub
created: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:00:00Z
up: Engineering — Greenfield Service - Overview
---
## 🔗 Navigation

**UP:** [[Engineering — Greenfield Service - Overview|Overview]]

# Engineering — Greenfield Service — Phases Hub

10 phases from empty repo to first deployed production iteration. Linear by default — each phase is `blocked_by` the previous — but you can split into parallel streams once schema (P3) lands.

## Phases

- [[Phases/P1 - Discovery|P1 — Discovery]]
- [[Phases/P2 - Architecture|P2 — Architecture]]
- [[Phases/P3 - Schema|P3 — Schema]]
- [[Phases/P4 - Skeleton|P4 — Skeleton]]
- [[Phases/P5 - Core feature|P5 — Core feature]]
- [[Phases/P6 - Tests|P6 — Tests]]
- [[Phases/P7 - Hardening|P7 — Hardening]]
- [[Phases/P8 - Deploy|P8 — Deploy]]
- [[Phases/P9 - Observability|P9 — Observability]]
- [[Phases/P10 - First iteration|P10 — First iteration]]

## How phases relate

```
P1 Discovery
    └── P2 Architecture
            └── P3 Schema
                    ├── P4 Skeleton
                    │       └── P5 Core feature
                    │               └── P6 Tests
                    │                       └── P7 Hardening
                    │                               └── P8 Deploy
                    │                                       └── P9 Observability
                    │                                               └── P10 First iteration
                    │
                    └── (P4-P6 can run in parallel with P7 prep once P3 lands)
```

## Acceptance gates

The `engineering` profile's gate is `test_command exits 0`. Each phase tightens that:

| Phase | Acceptance |
|---|---|
| P1 Discovery | Decisions doc exists; stack pinned; risks named. |
| P2 Architecture | One-page architecture; data flows; component boundaries. |
| P3 Schema | Schema files committed; migration tooling decided; rollback documented. |
| P4 Skeleton | Repo runs locally with one no-op endpoint / entry point; CI green. |
| P5 Core feature | Feature works end-to-end against the schema; manual exercise documented. |
| P6 Tests | `test_command` exits 0; coverage acceptable for stack. |
| P7 Hardening | Error paths tested; secrets externalised; security headers / lint clean. |
| P8 Deploy | Deployed; health endpoint live; rollback rehearsed. |
| P9 Observability | Logs structured; one alert wired; one dashboard. |
| P10 First iteration | Three prioritised next-steps from real usage / first-week telemetry. |
