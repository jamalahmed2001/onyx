---
title: fail-and-fix-not-bypass
tags: [principle, engineering]
type: principle
up: Principles Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Principles/Principles Hub.md|Principles Hub]]

# fail-and-fix-not-bypass

**Rule.** When a check fails (test, hook, lint, type, gate), find the root cause and fix it. Don't skip the check.

**Why.** Bypass flags exist for genuine emergencies, not for convenience. `--no-verify` skipping a pre-commit hook means the next commit might land broken code; `--force` overriding a merge conflict means the change might silently delete someone's work; disabling a flaky test rather than fixing it means the next genuine bug to hit that code path goes undetected. Each bypass is technical debt with compound interest: the cost of fixing the underlying issue grows the longer it's bypassed, and the bypass becomes a load-bearing habit no one remembers introducing.

**How to apply.**
- A failing test means the test or the code is wrong. Diagnose which. Fix that.
- A failing hook means the hook found something. Read what it found.
- A merge conflict means two changes need reconciling. Reconcile them; don't pick one and discard the other.
- If a check is genuinely flaky (fails non-deterministically), fix the flake — quarantine the test, fix the race, stabilise the fixture — don't just retry until it passes.
- Bypass flags require explicit user authorisation. They are never the agent's default response to friction.
- "We can fix this later" is the operator's call to make, not the agent's. If the agent makes it unilaterally, that's a bypass.
