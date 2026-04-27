---
project: Engineering — Greenfield Service
phase_number: 5
phase_name: Core feature
status: backlog
profile: engineering
directive: general
blocked_by: [4]
tags:
  - project-phase
  - phase-backlog
created: 2026-04-27T00:00:00Z
up: Engineering — Greenfield Service - Phases Hub
---
## 🔗 Navigation

**UP:** [[Engineering — Greenfield Service - Phases Hub|Phases Hub]]

# P5 — Core feature

## Overview

The single feature that makes the service useful. Reads from / writes to the schema. Runs end-to-end against a real (test-mode) instance of the chosen persistence. Manual exercise documented.

This is the phase that demonstrates the service does its job. Not "all the features"; not "perfectly tuned"; the *one* feature that makes shipping the rest of the project worthwhile.

## Tasks

- [ ] Implement the feature end-to-end: request comes in, schema is read / written, response goes out.
- [ ] Real persistence connection (test instance, sandboxed credentials — never prod).
- [ ] Document a manual end-to-end exercise in the README: "to test the service locally, do these three steps and verify these three outputs".
- [ ] Run the manual exercise yourself; capture the output.
- [ ] Run `test_command` — it should pass (tests come in P6, but the smoke test from P4 must still pass).

## Acceptance Criteria

- [ ] Manual exercise from README runs cleanly against a local instance.
- [ ] `test_command` exits 0.
- [ ] No new infrastructure added beyond what P3-P4 specified.
- [ ] Feature only — no "while we're at it" extras (per [[08 - System/Principles/no-features-beyond-task.md|no-features-beyond-task]]).

## Human Requirements

<!-- None — phase completed successfully -->
