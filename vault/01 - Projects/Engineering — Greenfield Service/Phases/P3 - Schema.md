---
project: Engineering — Greenfield Service
phase_number: 3
phase_name: Schema
status: backlog
profile: engineering
directive: general
blocked_by: [2]
tags:
  - project-phase
  - phase-backlog
created: 2026-04-27T00:00:00Z
up: Engineering — Greenfield Service - Phases Hub
---
## 🔗 Navigation

**UP:** [[Engineering — Greenfield Service - Phases Hub|Phases Hub]]

# P3 — Schema

## Overview

The data the service holds, the messages it exchanges, the shapes it persists. Schema is hard to change once data exists in production — get it close, with explicit space for the next evolution.

## Tasks

- [ ] Read P2's architecture diagram — the public interface and the persistence components.
- [ ] Define data schemas — table / collection / type definitions for everything persistent.
- [ ] Define message schemas — request / response / event shapes for the public interface.
- [ ] Decide migration tooling — what runs migrations, where they live, who runs them in prod.
- [ ] Document rollback strategy — how do you undo a migration that turns out to be wrong.
- [ ] Add a "schema versioning" decision — how the service handles its own schema evolving (numbered migrations, breaking-change policy, deprecation cadence).
- [ ] Commit schema files to the repo (alongside an empty migration runner if applicable).
- [ ] Run the test command if there's anything to test yet (`test_command` from project Overview); it should pass even if there are no tests yet.

## Acceptance Criteria

- [ ] Schema files committed to the repo.
- [ ] Migration tooling chosen + documented.
- [ ] Rollback strategy documented in `Phases/P3 - Schema - Decisions.md`.
- [ ] `test_command` exits 0.
- [ ] Schema is close enough to ship; not waiting on perfect.

## Human Requirements

<!-- None — phase completed successfully -->
