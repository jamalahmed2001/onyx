---
title: Operations Hub
tags:
  - system
  - operations
  - onyx
  - hub
type: hub
version: 0.1
created: 2026-04-24
updated: 2026-04-24
graph_domain: system
up: System Hub
status: active
---
## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]
**Related:** [[08 - System/ONYX Master Directive.md|ONYX Master Directive]] · [[08 - System/ONYX - Decomposition Plan.md|Decomposition Plan]] · [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# Operations Hub

> **What lives here.** One markdown file per runtime operation. Each file is the complete contract + procedure for that operation — read it end-to-end before executing. Together, these are the "middle layer" between the [[08 - System/ONYX Master Directive.md|Master Directive]] (the loop) and the [[08 - System/Agent Skills/Agent Skills Hub.md|runtime skills]] (the atomic how-tos).
>
> **When you're the runtime.** Master Directive §5 routes each phase to one operation based on `status:`. Open the linked file, follow it exactly, return to the loop.

---

## The eight operations

| Status → | Operation | Directive | Replaces (src/) | Lines in TS | Stage | Status |
|---|---|---|---|---|---|---|
| `backlog` | atomise | [[08 - System/Operations/atomise.md]] | `src/planner/atomiser.ts` | 498 | 4 | **draft** (atomise-phase + repo-scan) |
| `planning` | *(wait, no-op)* | — | — | — | — | in Master Directive §6.2 |
| `ready` / `active` | execute | [[08 - System/Operations/execute-phase.md]] | `src/executor/runPhase.ts` + `selectTask.ts` | 833 | 5 | **draft** (task loop + selection inlined; lock-lifecycle shared skill) |
| `blocked` | surface_blocker | [[08 - System/Operations/surface-blocker.md]] | `src/notify/*` (partial) | ~50 | 3 | **draft** (inline-only, no skills) |
| `completed` | consolidate *(on transition)* | [[08 - System/Operations/consolidate.md]] | `src/planner/consolidator.ts` | 238 | 4 | **draft** (knowledge-merge + monthly-rollup) |
| *(whole project)* | decompose-project | [[08 - System/Operations/decompose-project.md]] | `src/planner/phasePlanner.ts` | 785 | 6 | **draft** (phase-decompose shared with replan) |
| *(blocked → re-atomise)* | replan | [[08 - System/Operations/replan.md]] | `src/planner/replan.ts` | 226 | 6 | **draft** (inline-only, no new skills) |
| *(every iteration, step 1)* | heal | [[08 - System/Operations/heal.md]] | `src/healer/*.ts` | 882 | 3 | **draft** (7 heal-* skills) |
| *(every iteration, step 5)* | route | [[08 - System/Operations/route.md]] | `src/controller/router.ts` | 38 | 2 | **draft** (inline-only, no skills) |

Total TS replaced at end of migration: **~3,550 LOC** across these operations. Remaining code surface: doorbell + agent spawner + tool scripts + read-only parsers + dashboard.

---

## Support documents

- [[08 - System/Operations/_tools.md|Tool Catalog]] — the **one** irreducible shell tool operations invoke (`write-exec-log.sh`); everything else uses native agent primitives
- [[08 - System/Operations/_template.md|Operation Directive Template]] — the canonical shape every operation file follows
- [[08 - System/Operations/_agent-native-validation.md|Validation Log]] — probe-by-probe record of agent-native replacements for retired tools

---

## How operations relate

```
Master Directive
     │  (§5 Routing)
     ▼
┌────────────────────────────┐
│ heal  (step 1, always)     │
├────────────────────────────┤
│ route (step 5, dispatcher) │
│   ├─ atomise               │
│   ├─ execute               │
│   │    └─ consolidate      │  (on completion)
│   ├─ surface_blocker       │
│   └─ replan                │  (explicit)
└────────────────────────────┘
         │
         ▼
 Runtime Skills (_onyx-runtime/*)
         │
         ▼
 Tool scripts (tools/*.sh)
```

- **heal** runs every iteration before work starts.
- **route** maps phase status → operation.
- **execute** is the hot path; **consolidate** runs when execute transitions to `completed`.
- **atomise** / **decompose-project** / **replan** are planner operations.
- **surface_blocker** makes a blocked phase visible to a human.

---

## Contribution rules

1. Operations are only added or modified via a phase in `08 - System/` with profile `engineering`, reviewed by a human. (Master Directive invariant 9.)
2. Operations must not duplicate logic — if two operations need the same procedure, extract it into a skill under `08 - System/Agent Skills/_onyx-runtime/` and reference it.
3. Each operation's `replaces:` frontmatter points at its src/ source so migration status is auditable.
4. When an operation migrates from `stub` → `draft` → `shadow-mode` → `active`, its src/ source is deleted only after a shadow-mode week with zero behavioural diff.
5. Operations may only invoke: other operations, skills listed in their `Skills Invoked` section, and tools in [[08 - System/Operations/_tools.md|the tool catalog]]. Nothing else.
