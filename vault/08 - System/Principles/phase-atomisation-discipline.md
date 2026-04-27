---
title: phase-atomisation-discipline
tags: [principle, engineering]
type: principle
up: Principles Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Principles/Principles Hub.md|Principles Hub]]

# phase-atomisation-discipline

**Rule.** Before execution, decompose work into independent phases — each one a closed unit with explicit inputs, outputs, and an acceptance gate. Don't run an unatomised phase.

**Why.** A phase that does too much fails in non-recoverable ways: halfway through, the agent has changed five files, started two services, and hit an error. Now you don't know which changes to keep, which to roll back, and which were the real cause. A phase that does *one thing* either succeeds (commit) or fails cleanly (revert). The cost of atomisation is paid up front; the cost of *not* atomising is paid every time something goes wrong, which is most days.

**How to apply.**
- Before a phase moves out of `backlog`, the atomiser splits it into a task list. Each task is one observable change with an inputs-and-output contract.
- Acceptance gates are explicit. "It looks right" is not a gate. "Test command exits 0" is. "Lint and type-check both pass" is. "The new endpoint returns the expected JSON for these three inputs" is.
- If a phase resists atomisation — every task seems to depend on every other — the phase is too big. Split it into multiple phases first.
- Phases that are genuinely linear (must do A then B) still atomise into A-then-B; the dependency is named (`blocked_by:`), not collapsed.
- A phase that completes without an acceptance gate firing is a phase that didn't really complete.
