# P2 — Atomiser

## Purpose
Break a phase note into 6–12 atomic, codebase-grounded tasks.

## When to invoke
Automatically when controller finds a `phase-backlog` or `phase-ready` phase with no grounded tasks.

## Input
- Phase note (Overview + current task skeletons)
- Repo scan (grep, file tree, key symbols)

## Output
Rewrites the `## Tasks` section of the phase note with:
- 6–12 atomic tasks (each as a `- [ ]` checkbox)
- Each task includes: files/symbols to touch, specific steps, validation command

## Lock behaviour
- Set `phase-planning` tag on start (note is locked from other agents)
- Set `phase-ready` tag on success
- Set `phase-backlog` tag on failure (allows retry)
- Append `atomise_started` / `atomise_done` to log note

## Rules
- Never touch `## Overview` or `## Human Requirements`
- Only rewrite `## Tasks` section
- Tasks must be parallelisable where possible
- Each task must reference a specific file path or symbol — no vague tasks
- Maximum 12 tasks. If more needed, split into two phases.

## Linear uplink (if configured)
After writing tasks, automatically sync updated phase note back to Linear.
Runs `linear/uplink.ts` — creates new Linear issues for new phases, updates existing ones.
