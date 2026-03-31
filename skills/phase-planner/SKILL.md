# P1 — Phase Planner

## Purpose
Break a project Overview into a set of executable phase notes.

## When to invoke
Automatically when the controller finds a project bundle with no phases.

## Input
- `PROJECT - Overview.md` — the human-written project goal and scope
- Optional: repo scan (file tree, key files)

## Output
Creates `Phases/P1 - Phase Name.md` through `Phases/PN - Phase Name.md`:
- Each phase note uses the Phase Note Template
- Tag: `phase-backlog`
- Sections populated: Overview, Human Requirements (placeholders), Tasks (skeleton), Acceptance Criteria (skeleton)
- Log link added

## Rules
- Phase names should be meaningful (not "Part 1", "Part 2")
- Aim for 3–7 phases per project
- Each phase should be independently executable
- Do not write tasks — that is the Atomiser's job (P2)
- Write phases to `phase-backlog` — human sets them to `phase-ready` when ready

## Next step
Human reviews phases, sets desired ones to `phase-ready`.
Controller picks them up and routes to P2 Atomiser.
