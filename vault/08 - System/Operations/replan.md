---
title: replan
tags:
  - system
  - operation
  - onyx
type: operation-directive
replaces: src/planner/replan.ts
lines_replaced: 226
version: 0.2
created: 2026-04-24
updated: 2026-04-24
graph_domain: system
up: Operations Hub
status: draft
migration_stage: 6
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]

# Operation: replan

> A phase blocked. Rewrite its task list so a fresh attempt can succeed. All logic inline — no new skills; the algorithm is small and specialised.

## Preconditions
- Phase `status:` is `blocked` OR `ready` (explicit replan after human cleared a blocker).
- Phase `replan_count:` < `MAX_REPLANS` (default 3).
- `## Blockers` or `## Human Requirements` section is non-empty (we need something to replan against).

## Invocation context
- Explicit: `onyx replan <project> <n>` or `onyx reset <project>` (which can trigger replan on the reactivated phase).
- From [[08 - System/Operations/execute-phase.md|execute-phase]] when a task kept failing but the project wants an automatic second attempt (not default — must be configured per phase).

## Read order
1. Phase file — full content (current Tasks, Blockers, Human Requirements, Acceptance Criteria).
2. Phase log file — last 1500 chars (most recent events — why it blocked).
3. Project Overview.md — for profile (picks prompt variant).
4. Project Knowledge.md — learnings that might inform the new plan.

## Procedure

### Step 1 — Guard checks
1. Read `replan_count` from phase frontmatter (default 0). If `≥ MAX_REPLANS` (3) → dispatch notification `phase_blocked` with detail `"Max replans reached — needs human review"`. Do not proceed. Return `max_reached`.
2. Resolve profile. If Overview unreadable → return `error`.

### Step 2 — Gather blocker evidence
1. Extract current `## Tasks` content (or the AGENT_WRITABLE plan block).
2. Extract `## Acceptance Criteria` content.
3. Extract `## Blockers` content if present (otherwise fall back to `## Human Requirements`).
4. Read the phase's log file; take the last 1500 chars (recency bias — most informative).

### Step 3 — Build the replan prompt
Use this system prompt (the replan prompt is specialised — don't use phase-decompose):

```
You are a technical project planner. A phase in an autonomous agent system
has blocked. Your job is to rewrite the task list so a fresh agent attempt
can succeed.

Rules:
- Output ONLY the new task list as markdown checkboxes (- [ ] task)
- Each task must be concrete and independently executable by a CLI agent
- Break down any task that previously failed into smaller steps
- If the blocker was an environment issue, add a prerequisite verification task first
- Maximum 8 tasks
- Output ONLY the checkbox list — no headings, no commentary
```

User prompt:
```
Phase: P<phase_number> — <phase_name>

Acceptance criteria (what must still hold):
<acceptance_criteria>

Previous task list:
<current_tasks>

Blocker / failure evidence:
<blockers OR human_requirements>

Recent log excerpt (last 1500 chars):
<log_tail>

Generate a replanned task list.
```

### Step 4 — Invoke LLM
Call standard-tier LLM, `max_tokens: 1500`.

Parse output: extract all lines matching `^\s*-\s*\[\s*[x ]?\s*\]\s*(.+)$`. Collect the content after the checkbox as individual task strings.

If zero tasks parsed → return `parse_error`. Do not mutate the phase.

### Step 5 — Inject replanned tasks

Priority order — same as atomise's inject logic:

1. **If the AGENT_WRITABLE plan block exists** → replace its content:
   ```
   <!-- AGENT_WRITABLE_START:phase-plan -->
   
   ## Replanned Tasks
   
   - [ ] <new task 1>
   - [ ] <new task 2>
   ...
   
   <!-- AGENT_WRITABLE_END:phase-plan -->
   ```
   The markers themselves stay; only the inside changes.

2. **Else if `## Tasks` exists** → rewrite its content with the new checklist.

3. **Else if `## Acceptance Criteria` exists** → insert a new `## Tasks` section immediately before it.

4. **Else** → append `## Tasks` at end of file.

Task text sanitisation: strip any leading `- [ ]`, `- [x]`, `-`, `*` characters before wrapping — the LLM sometimes leaks its own checkbox chars.

### Step 6 — Reset blockers + frontmatter
1. In body: replace `## Blockers` content with `(none)` (if that section exists).
2. In frontmatter:
   - Increment `replan_count` by 1.
   - Bump `updated:`.
   - Transition `status:` / `state:` / phase-tag: `blocked → ready` (via Master Directive §4.2 `blocked → planning → ready` — use planning as intermediate OR, per current TS behaviour, direct `blocked → ready` on replan, which is a known shortcut).
3. Leave `## Human Requirements` in place (moved to `## Log` if desired — not required).

### Step 7 — Notify + log
1. Dispatch notification: event `replan_started` with detail `"Replan #<count> for <phase>"`.
2. Append to phase log: `replan_done tasks=<count>`.
3. Call `tools/write-exec-log.sh`:
   ```
   --status REPLAN
   --project <project_id>
   --phase <phase_number>
   --summary "replan_count=<N> tasks=<count>"
   ```

## Post-conditions & transitions
- `blocked → ready` (after replan).
- `replan_count` incremented.
- Task list replaced.
- `## Blockers` cleared if it existed.
- Notification dispatched.

## Error handling
- **RECOVERABLE:** LLM timeout or empty output on first try → retry once. Still empty → return `parse_error`; phase stays `blocked`.
- **BLOCKING:** `replan_count >= MAX_REPLANS` → halt with `max_reached` result; notify; phase stays `blocked`.
- **INTEGRITY:** phase frontmatter corrupt or file unreadable.

## Skills invoked
None. All logic inlined. (Did not reuse phase-decompose — that's project-level granularity; replan is task-level.)

## Tools invoked
- `tools/write-exec-log.sh` — Step 7.

## Native primitives relied on
- **Read** — phase, log, Overview, Knowledge.
- **Edit** — inject new tasks, clear blockers, update frontmatter.
- **WebFetch** / agent-native LLM call.

## Acceptance (self-check before exit)
- Phase `## Tasks` (or plan block) has at least one new `- [ ]` checkbox.
- `replan_count` incremented and under MAX_REPLANS.
- `status:` is `ready` (or `blocked` if max reached — phase didn't transition).
- `## Blockers` cleared or containing `(none)`.
- Notification dispatched.

## ExecLog entry format
```
<ISO> | <project> | <phase> | REPLAN | <duration-sec> | replan_count=<N> tasks=<count>
```

## Shadow-mode comparison criteria
For a `blocked` phase with the same task history + same blocker evidence:
- TS and directive must produce semantically-equivalent replanned task lists (LLM wording varies; number of tasks within ±2).
- Both increment `replan_count` identically.
- Both cap at `MAX_REPLANS` and emit `max_reached` notification when exceeded.
- Task-preservation check: completed tasks from prior attempts should NOT reappear in the replanned list (both implementations should avoid re-doing done work).
