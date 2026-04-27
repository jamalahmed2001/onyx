---
project: Engineering — Greenfield Service
phase_number: 6
phase_name: Tests
status: backlog
profile: engineering
directive: general
blocked_by: [5]
tags:
  - project-phase
  - phase-backlog
created: 2026-04-27T00:00:00Z
up: Engineering — Greenfield Service - Phases Hub
---
## 🔗 Navigation

**UP:** [[Engineering — Greenfield Service - Phases Hub|Phases Hub]]

# P6 — Tests

## Overview

Make the test suite cover the core feature and its boundaries. Unit tests for pure logic, integration tests for things that touch persistence / network. Coverage by happy-path and at least one failure path per branch that matters.

## Tasks

- [ ] List the failure modes of the core feature — bad input, missing input, persistence unavailable, downstream timeout, malformed response. One test each that proves the failure is handled.
- [ ] Add unit tests for any pure-logic transforms (input → output without side effects).
- [ ] Add integration tests for the schema-touching paths (real test DB, not mocks — see [[08 - System/Principles/single-canonical-tool-per-task.md|single-canonical-tool]] for why mocked DB tests miss schema bugs).
- [ ] Add a test for the manual exercise from P5 — automate what was previously manual.
- [ ] Run `test_command` — must exit 0.
- [ ] Confirm coverage is acceptable for the stack (don't chase 100%; chase "every behaviour that matters has a test").

## Acceptance Criteria

- [ ] `test_command` exits 0.
- [ ] Each failure mode listed has a test.
- [ ] The manual exercise from P5 is now an automated test.
- [ ] No tests that mock the database for paths that touch real schema constraints.

## Human Requirements

<!-- None — phase completed successfully -->
