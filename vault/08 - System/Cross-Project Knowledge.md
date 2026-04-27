---
title: Cross-Project Knowledge
tags:
  - system
  - knowledge
  - onyx
type: knowledge-store
graph_domain: system
up: System Hub
status: active
---
## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]

# Cross-Project Knowledge

> **What lives here.** Principles and learnings that have proven themselves across more than one project. This is the graduation target for findings that started in a single project's Knowledge.md and turned out to generalise.

> **Started empty.** A fresh ONYX install ships this file as a placeholder. As you run projects, the [[08 - System/Operations/consolidate.md|consolidate]] operation will surface cross-project candidates here. Don't pre-fill it — let the patterns emerge.

---

## How an entry gets here

1. A project's `Knowledge.md` accumulates a learning during a phase.
2. `consolidate` runs (per-phase or on bundle ship) and looks at recent learnings.
3. If a learning matches the cross-project promotion criteria below, it's proposed here.
4. You review and accept (or reject) the promotion. Accepted entries live below.

### Promotion criteria

A learning generalises when **all** of these hold:

- It applies in at least two different project contexts (not just two phases of the same project).
- It is not a fact about a specific stack, library, or vendor — those belong in the project's Knowledge.md or a directive.
- It is short enough to state in 1–3 sentences plus a one-line *Why* and *How to apply*.
- A future you, on a future project, would want to know it without having to remember the original incident.

If those hold, write the entry in the shape below.

---

## Entry shape

```markdown
### <Short principle title — five words or fewer>

<One sentence stating the principle as a rule.>

**Why.** <One sentence — the reason or the incident that proved it.>

**How to apply.** <One sentence — when to invoke the rule and what to do.>

**First seen.** <project name, YYYY-MM-DD>
```

Keep entries short. If a principle is load-bearing for the whole framework (not just one type of work), promote it again to [[08 - System/Principles/Principles Hub.md|Principles]].

---

## Entries

*(Empty. Populated by `consolidate` proposals + your accepts.)*
