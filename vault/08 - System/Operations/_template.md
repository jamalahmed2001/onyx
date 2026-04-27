---
title: Operation Directive Template
tags:
  - system
  - operations
  - onyx
  - template
type: template
version: 0.1
created: 2026-04-24
updated: 2026-04-24
graph_domain: system
up: Operations Hub
status: reference
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]

# Operation Directive Template

> **Purpose.** The canonical shape every file in `08 - System/Operations/` follows. If you're writing a new operation, copy this file verbatim and fill in each section. If you're reading one, this explains what each section means.

---

## Frontmatter (required)

```yaml
---
title: <Operation Name>
tags: [system, operation, onyx]
type: operation-directive
replaces: src/<path>/<file>.ts          # the TS module this operation supersedes
lines_replaced: <int>                   # LOC count — visible audit target
version: 0.1
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
graph_domain: system
up: Operations Hub
status: stub | draft | shadow-mode | active | deprecated
migration_stage: <int>                  # matches Decomposition Plan stages
---
```

---

## Sections

### Preconditions
Bullet list. What must be true *before* invoking this operation. Check these first; abort if any fail with a clear INTEGRITY error.

### Invocation context
When is this operation called? From which step of the Master Directive loop? With what inputs (phase path, project id, explicit override)?

### Read order
The exact files to load, in order, before executing. Usually an extract of Master Directive §8 specific to this operation. Cap each load to a reasonable size; note if any are optional.

### Procedure
Numbered steps. Each step either:
- Performs a direct vault write — specify exact frontmatter field or section marker.
- Invokes a named skill — link + the skill's declared inputs.
- Calls a tool script — tool name from the [[08 - System/Operations/_tools.md|tool catalog]] + args.
- Defers to another operation — link + context for the handoff.

Steps should be concrete enough that a cold agent can execute them from this file alone. Reference the Master Directive for cross-cutting rules (invariants, transitions) but don't duplicate them.

### Post-conditions & transitions
What must be true after a successful run. Which `status:` transition(s) are valid outcomes. Reference [[08 - System/ONYX Master Directive.md|Master Directive §4.2]] for the transition table.

### Error handling
Classify each error type:
- **RECOVERABLE** — transient (tool failure, rate limit). Retry policy: max attempts, backoff strategy. Log to ExecLog as `retry`.
- **BLOCKING** — external (missing input, ambiguous instruction, unmet dependency). Set phase-blocked, write `## Human Requirements`, notify.
- **INTEGRITY** — impossible (vault inconsistent with itself). Halt, write full report, alert via `tools/notify.sh`.

### Skills invoked
Explicit list. Every skill invoked in the Procedure must appear here. Link each to its SKILL.md.

### Tools invoked
Explicit list of shell tools used. Cross-reference [[08 - System/Operations/_tools.md|tool catalog]] entries.

### Acceptance (self-check before exit)
The conditions this operation verifies before returning control. These are the operation's own test oracle — if any fail, treat as INTEGRITY and halt without writing the final status transition.

### ExecLog entry format
The exact string format this operation appends to `00 - Dashboard/ExecLog.md`. Matches Master Directive §7.

### Shadow-mode comparison criteria
(Only required while `status: shadow-mode`.) What outputs are compared between TS runtime and directive-agent? What counts as a zero-diff day? How long must shadow mode run before the TS source can be deleted?

---

## Conventions

- Use present-tense imperative in procedures ("Read the phase file," not "The agent reads...").
- Every file path is a wikilink when inside the vault, a code-span when outside.
- Every skill reference links to the skill's SKILL.md file.
- Every tool reference cites the tool by its exact filename (e.g. `tools/notify.sh`).
- No narrative prose in the Procedure section — numbered steps only.
- Cross-operation references use wikilinks, not relative paths.
