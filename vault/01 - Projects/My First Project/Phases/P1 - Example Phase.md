---
tags:
  - project-phase
  - example
  - phase-completed
project: My First Project
phase_number: 1
phase_name: Example Phase
status: completed
created: 2026-01-01T00:00:00.000Z
replan_count: 0
---
## 🔗 Navigation

- [[My First Project - Kanban|Kanban]]
- [[L1 - P1 - Example Phase|L1 — Execution Log]]

# P1 — Example Phase

## Overview

Demonstration phase. Pre-atomised and tagged `phase-ready`. Run `gzos run` to execute it.

The agent will create a file called `hello.txt` in the repo directory configured in the Overview note.

## Human Requirements

None. No credentials, no env vars, no approvals needed.

> Make sure `repo_path` in `My First Project - Overview.md` is set to a valid directory before running.

## Tasks

- [x] Create a file called `hello.txt` containing exactly the text `GroundZeroOS is running.` (no newline)

## Acceptance Criteria

- [x] `hello.txt` exists in the repo directory
- [x] `hello.txt` contains `GroundZeroOS is running.`

## Blockers

(none)


