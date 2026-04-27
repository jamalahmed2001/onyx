---
project: Engineering — Greenfield Service
phase_number: 4
phase_name: Skeleton
status: backlog
profile: engineering
directive: general
blocked_by: [3]
tags:
  - project-phase
  - phase-backlog
created: 2026-04-27T00:00:00Z
up: Engineering — Greenfield Service - Phases Hub
---
## 🔗 Navigation

**UP:** [[Engineering — Greenfield Service - Phases Hub|Phases Hub]]

# P4 — Skeleton

## Overview

Smallest viable runnable. The repo runs locally, has one no-op endpoint or entry point, has CI configured. No business logic — just the runtime working end-to-end so future phases can fill it in without fighting infrastructure.

## Tasks

- [ ] Initialise the repo per the chosen stack (package manager, project layout, lockfile committed).
- [ ] Add a single no-op entry point (one HTTP endpoint, one CLI subcommand, one library function — whatever the service exposes).
- [ ] Wire the chosen test framework — at minimum, one passing smoke test.
- [ ] Wire CI to run `test_command` on every push (GitHub Actions, GitLab CI, whatever the deploy target uses).
- [ ] Add a README skeleton — how to install, how to run locally, how to test.
- [ ] Confirm the no-op endpoint responds locally.
- [ ] Confirm CI is green on the initial push.
- [ ] Commit with a tag `v0.0.1-skeleton` so future bisect can find this clean baseline.

## Acceptance Criteria

- [ ] `test_command` exits 0.
- [ ] CI is green on the latest push.
- [ ] No-op entry point responds locally (documented exercise in README).
- [ ] Tag `v0.0.1-skeleton` exists.

## Human Requirements

<!-- None — phase completed successfully -->
