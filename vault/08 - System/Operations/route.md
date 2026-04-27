---
title: route
tags:
  - system
  - operation
  - onyx
type: operation-directive
replaces: src/controller/router.ts
lines_replaced: 38
version: 0.2
created: 2026-04-24
updated: 2026-04-24
graph_domain: system
up: Operations Hub
status: draft
migration_stage: 2
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]

# Operation: route

> Pure dispatch. Given a phase file, decide which of the five operations applies based on `status:` frontmatter. No writes, no side effects. The smallest operation in the suite — inline-only, no skills.

## Preconditions
- Phase file exists and has parseable frontmatter.
- `status:` frontmatter value is present.

## Invocation context
Master Directive §3 step 5. Invoked once per phase in the iteration's work-queue.

## Read order
1. Phase file — frontmatter only (no body read needed).

## Procedure

1. Read `status:` field from phase frontmatter.
2. Return the next operation per this table. No writes.

| `status:` value | Dispatch to | Notes |
|---|---|---|
| `backlog` | [[08 - System/Operations/atomise.md\|atomise]] | Generates task plan |
| `planning` | *wait* | Atomiser in flight; skip this iteration |
| `ready` | [[08 - System/Operations/execute-phase.md\|execute-phase]] | Acquire lock + run tasks |
| `active` | [[08 - System/Operations/execute-phase.md\|execute-phase]] | Resume (stale lock should have been cleared by heal in step 1) |
| `blocked` | [[08 - System/Operations/surface-blocker.md\|surface-blocker]] | Ensure Human Requirements populated + notify |
| `completed` | *skip* or [[08 - System/Operations/consolidate.md\|consolidate]] | Skip by default; consolidate only if Knowledge.md is missing this phase's reference |

Any other `status:` value → INTEGRITY error per Master Directive §9.

## Post-conditions & transitions
No transitions performed by this operation. Its return value directs the caller.

## Error handling
- **INTEGRITY:** `status:` not present, not a string, or not one of the six valid states. Halt iteration; heal's job to repair on next run.

## Skills invoked
None — routing is trivial and fully inlined above.

## Tools invoked
None.

## Native primitives relied on
- **Read** — phase frontmatter.

## Acceptance (self-check before exit)
- Returned dispatch target is one of the five operations above OR `wait` OR `skip`.

## ExecLog entry format
Route does not log directly. The caller (Master Directive loop step 5) is responsible for logging once an operation is chosen, under that operation's status tag.

## Shadow-mode comparison criteria
For every `status:` value `src/controller/router.ts` routes, the directive agent must produce the same routing decision 100% of the time. Deterministic check — no tolerance.
