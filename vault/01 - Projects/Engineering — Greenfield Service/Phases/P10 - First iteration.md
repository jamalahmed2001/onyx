---
project: Engineering — Greenfield Service
phase_number: 10
phase_name: First iteration
status: backlog
profile: engineering
directive: general
blocked_by: [9]
tags:
  - project-phase
  - phase-backlog
created: 2026-04-27T00:00:00Z
up: Engineering — Greenfield Service - Phases Hub
---
## 🔗 Navigation

**UP:** [[Engineering — Greenfield Service - Phases Hub|Phases Hub]]

# P10 — First iteration

## Overview

After a week of real-or-realistic usage, look at what the service told you. What got hit a lot? What broke? What's clearly the next thing to add or fix? Don't guess — read the dashboards and the logs.

The output of this phase is *not* code. It's a prioritised list of next-iteration phases, ready to be the start of a follow-up project.

## Tasks

- [ ] Wait for ≥ 1 week of real usage (or a stress test if "real users" is far away).
- [ ] Pull the observability data: top errors, latency outliers, most-used / least-used paths.
- [ ] Read the logs for surprising signals — anything you didn't expect to see.
- [ ] Talk to a real user / caller if you can — what worked, what was confusing, what's missing.
- [ ] Synthesise into a short prioritised list — top 3 things worth doing next, with rough effort estimate and expected impact.
- [ ] Write `Phases/P10 - First iteration - Findings.md` with the list.
- [ ] Decide: is the next iteration significant enough to start a new project (with this Knowledge.md as the seed for Cross-Project Knowledge), or a few more phases here?

## Acceptance Criteria

- [ ] Findings doc exists with at least 3 prioritised next-steps.
- [ ] Each next-step backed by observed data, not gut feel.
- [ ] Decision recorded: continue here vs new project.

## Human Requirements

<!-- None — phase completed successfully -->
