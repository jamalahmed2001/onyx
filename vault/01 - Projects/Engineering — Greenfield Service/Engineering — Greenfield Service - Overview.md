---
project: Engineering — Greenfield Service
type: overview
profile: engineering
status: active
repo_path: /path/to/your/repo
test_command: <your test command — e.g. npm test, pytest, go test ./...>
tags:
  - onyx-project
  - starter
created: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:00:00Z
up: Engineering — Greenfield Service - Phases Hub
---
## 🔗 Navigation

**UP:** [[Engineering — Greenfield Service - Phases Hub|Phases Hub]]

# Engineering — Greenfield Service — Overview

## What this starter is

A 10-phase scaffold for building a greenfield service from empty repo to first deployed production iteration. Language-agnostic — phase tasks reference your `test_command` rather than a specific language toolchain. Fork it for any new service, library, or tool you're building.

The starter demonstrates how ONYX runs on real engineering work:
- Phase atomisation discipline (each phase has explicit inputs / outputs / acceptance)
- Profile-routed shell whitelist (engineering profile's `allowed_shell` gates every Bash call)
- QC gate at every phase boundary (the `qc-reviewer` directive runs between phases)
- No features beyond task (each phase does its scoped work and nothing else)
- Fail and fix, not bypass (failing tests block; `--no-verify` is forbidden)

## How to fork this starter

1. Copy this folder, rename it to your real service name.
2. Edit this Overview's frontmatter:
   - `project:` your service name
   - `repo_path:` absolute path to your codebase
   - `test_command:` the command that runs your full test suite (must exit 0 for phases to complete)
3. Read the Show Bible / Phase 1 (Discovery) — fill in the unknowns.
4. Run `onyx atomise` on Phase 1, then `onyx run`.

The healer normalises frontmatter drift on the first iteration; you don't need to get every field right by hand.

## Goal

A first iteration of a new service: scoped, scaffolded, schema-defined, skeleton-built, core-feature-shipped, tested, hardened, deployed, observed, and reviewed for what to do next.

## Why now

Filled in by you when you fork. Examples: "this stack needs a service to handle X"; "we have a manual process that needs an API"; "spinning up a new product line".

## Scope

**In scope:**
- A single greenfield service.
- A single deploy target (one environment — staging or prod, your call).
- The minimum viable feature that lets a real user / caller exercise the service end-to-end.

**Out of scope:**
- Multi-service migrations.
- Brownfield refactors of an existing system.
- Production-scale rollout to all users (Phase 8 deploys to a deploy target; broader rollout is a follow-up project).
- "Nice to have" features beyond the core feature (per [[08 - System/Principles/no-features-beyond-task.md|no-features-beyond-task]]).

## Success criteria

- [ ] `test_command` exits 0 on the final state.
- [ ] The deployed service responds correctly to a documented end-to-end exercise (the `Phase 9 — Observability` checks pass).
- [ ] The repo's README explains how to run, test, and deploy the service.
- [ ] `Phase 10 — First iteration` ships a documented, prioritised list of next-iteration work based on real usage.

## Dependencies / preconditions

Filled in by you. Common ones:
- Cloud account / project provisioned.
- Secrets / credentials available (and stored in a way the agent can use without leaking).
- DNS / domain decisions made (or deferred to deploy).
- Stack choice made (the agent doesn't choose your language for you in the Discovery phase — you decide; Discovery confirms and documents).

## Risks

(Top 3, real for your service.)

- **Risk 1:** <e.g. "Schema decisions in Phase 3 are hard to reverse — invest the time">
- **Risk 2:** <e.g. "Test fixture data may leak across runs — sandbox carefully">
- **Risk 3:** <e.g. "Deploy target's free tier rate limits may bite — confirm before Phase 8">

## Knowledge & decisions

This project's accumulated learnings live in `Engineering — Greenfield Service - Knowledge.md`. As you discover things — schema decisions, third-party gotchas, test patterns that worked — append them there. `consolidate` will surface anything that generalises across projects to your Cross-Project Knowledge.

## Skills the project expects

- Native: `read_file`, `write_file`, `edit_file`, `grep`, `glob`, `bash` (governed by `engineering` profile's `allowed_shell` whitelist).
- Engineering: whatever your stack needs. The starter doesn't pin a language.
- Optional: `linear-fetch` / `linear-uplink` for issue-tracker integration, `notion-context` for design-doc context.
