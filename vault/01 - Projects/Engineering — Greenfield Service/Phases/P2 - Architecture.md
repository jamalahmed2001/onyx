---
project: Engineering — Greenfield Service
phase_number: 2
phase_name: Architecture
status: backlog
profile: engineering
directive: general
blocked_by: [1]
tags:
  - project-phase
  - phase-backlog
created: 2026-04-27T00:00:00Z
up: Engineering — Greenfield Service - Phases Hub
---
## 🔗 Navigation

**UP:** [[Engineering — Greenfield Service - Phases Hub|Phases Hub]]

# P2 — Architecture

## Overview

Turn P1's decisions into a one-page architecture: components, data flow, public interface, internal boundaries, deploy topology. No code. Decisions made here that turn out wrong are the most expensive ones in the project — invest the time.

## Tasks

- [ ] Read `Phases/P1 - Discovery - Decisions.md`.
- [ ] Sketch the components — one box per service / module / persistent store / external dependency.
- [ ] Sketch the data flows — request enters here, transforms via these steps, exits here.
- [ ] Define the public interface — endpoints / message shapes / library surface. The shape, not the implementation.
- [ ] Define internal boundaries — what's a private implementation detail vs what's a stable internal contract.
- [ ] Sketch the deploy topology — which components run where, what scales together, what state persists where.
- [ ] Document everything in `Phases/P2 - Architecture - Diagram.md` (markdown with ASCII / mermaid diagrams + prose).
- [ ] Identify the 2-3 architectural decisions that are *one-way doors* (hard to reverse) and explicitly justify them.

## Acceptance Criteria

- [ ] `Phases/P2 - Architecture - Diagram.md` exists with components, data flows, public interface, internal boundaries, deploy topology.
- [ ] One-way-door decisions called out explicitly.
- [ ] Architecture is one page (or close — long architectures usually mean undecided, not thorough).
- [ ] No code written.

## Human Requirements

<!-- None — phase completed successfully -->
