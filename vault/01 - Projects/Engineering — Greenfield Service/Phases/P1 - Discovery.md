---
project: Engineering — Greenfield Service
phase_number: 1
phase_name: Discovery
status: backlog
profile: engineering
directive: general
tags:
  - project-phase
  - phase-backlog
created: 2026-04-27T00:00:00Z
up: Engineering — Greenfield Service - Phases Hub
---
## 🔗 Navigation

**UP:** [[Engineering — Greenfield Service - Phases Hub|Phases Hub]]

# P1 — Discovery

## Overview

Pin the unknowns before code: what is this service actually doing, who calls it, what does it depend on, what stack should it be in, what are the real risks. The deliverable is a one-page decisions doc, not the start of code.

If you can't fill in P1, you're not ready for P2. If you can fill in P1 in 20 minutes, you've probably already done the thinking.

## Tasks

- [ ] Read the parent project's Overview — understand the goal and scope.
- [ ] Define the service in one sentence ("a service that does X for callers Y when condition Z").
- [ ] Identify the callers — name them, characterise their usage shape (request/sec, payload size, latency tolerance).
- [ ] Identify upstream dependencies — what data, what services, what APIs.
- [ ] Identify downstream consumers — what receives this service's output.
- [ ] Pin the stack — language, framework, persistence, deploy target. Justify each choice in one line.
- [ ] List the top 3 risks with one mitigation each.
- [ ] Write `Phases/P1 - Discovery - Decisions.md` (a sibling artefact in this Phases folder) with all of the above.

## Acceptance Criteria

- [ ] `Phases/P1 - Discovery - Decisions.md` exists and is complete.
- [ ] Stack pinned (language + framework + persistence + deploy target).
- [ ] Top 3 risks named with mitigations.
- [ ] No code written.

## Human Requirements

<!-- None — phase completed successfully -->
