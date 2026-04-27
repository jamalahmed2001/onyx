---
title: consolidate
tags:
  - system
  - operation
  - onyx
type: operation-directive
replaces: src/planner/consolidator.ts
lines_replaced: 238
version: 0.2
created: 2026-04-24
updated: 2026-04-27T10:09:17Z
graph_domain: system
up: Operations Hub
status: draft
migration_stage: 4
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]
**Related:** [[08 - System/Operations/consolidate-bundle.md|consolidate-bundle]] — bundle-level cousin: collapses an entire shipped bundle (episode/album/project) into one node + archives sources. This phase-level operation is invoked by `consolidate-bundle` Step 0 to flush each phase's learnings to Knowledge.md before the bundle collapses.

# Operation: consolidate

> Extract learnings / decisions / gotchas from a completed (or blocked) phase's log + body, merge them into the project's Knowledge.md, and propagate genuinely-new cross-project principles to the global principles file. **Phase-level**: one phase → Knowledge.md merge. For collapsing an entire bundle once it ships, use [[08 - System/Operations/consolidate-bundle.md|consolidate-bundle]].

## Preconditions
- Phase `status:` is `active` transitioning to `completed` (inline call), OR `completed` already (standalone call), OR `blocked` (we still consolidate — failure teaches).
- Project bundle has a `Knowledge.md` file (or will be created with seed frontmatter).
- Phase's log file exists at its canonical location (heal-migrate-logs may have moved it).

## Invocation context
- Inline from [[08 - System/Operations/execute-phase.md|execute-phase]] at step 5 before the `active → completed` transition. Master Directive invariant 6 requires this.
- Standalone via `onyx consolidate <project>` for the most recent `completed` phase (manual rerun).
- From [[08 - System/Operations/route.md|route]] fallback when a `completed` phase's learnings aren't in Knowledge.md yet.

## Read order
1. Phase file — full content (Outcome, Progress, Tasks with final check states, Human Requirements).
2. Phase log file — path derived from `<bundle>/Logs/L<N> - <phase_name>.md` (canonical per [[heal-migrate-logs]]).
3. Project Knowledge.md — existing sections so we don't duplicate.
4. `08 - System/Cross-Project Knowledge.md` — existing principles (for dedup), if present.

## Procedure

### Step 1 — Resolve paths
1. From phase frontmatter: extract `project` (fallback: bundle folder name), `phase_name` (fallback: filename stem), `phase_number` (fallback: 0).
2. Compute log path: `<bundle>/Logs/L<phase_number> - <phase_name>.md`. If missing, use literal `"No log for: <phase_name>"` as log content.
3. Compute Knowledge path: `<bundle>/<project> - Knowledge.md`. If missing, plan to create one with seed frontmatter (`type: knowledge`, `project: <id>`, `up: <project> - Overview`).

### Step 2 — Extract learnings
Invoke [[08 - System/Agent Skills/_onyx-runtime/knowledge-merge/knowledge-merge.md|knowledge-merge]] with:
- `phase_content` = full phase file body
- `log_content` = log file content (or placeholder)
- `phase_label` = `phase_name`
- `phase_outcome` = `completed` | `blocked` | `failed`
- `knowledge_existing` = current Knowledge.md body (for de-dup during merge)

The skill produces a JSON structure:
```json
{
  "learnings": ["..."],
  "decisions": ["..."],
  "gotchas": ["..."]
}
```

Rules (enforced in the skill):
- Be concrete and specific.
- Decisions are architectural/design choices that affect future phases.
- Gotchas are failure modes, API quirks, constraints — especially important for blocked/failed phases.
- Learnings are general reusable techniques.
- Categories may be empty arrays.

### Step 3 — Append to Knowledge.md
For each non-empty category:
1. Build a dated reference line: `_<YYYY-MM-DD> — P<N>: <phase_name>_`.
2. Build an entry block: the dated line + each item as a bullet `- <item>`.
3. If a `## <Category>` heading already exists in Knowledge.md → inject the block inside that section (before any subsequent `##`).
4. Else → append the new section with `## <Category>` heading + block.

Categories: `## Learnings`, `## Decisions`, `## Gotchas`.

Write Knowledge.md. Bump `updated:`.

### Step 4 — Cross-project propagation (optional but default-on)
If `08 - System/Cross-Project Knowledge.md` exists AND `(learnings + gotchas).length > 0`:

Invoke [[08 - System/Agent Skills/_onyx-runtime/knowledge-merge/knowledge-merge.md|knowledge-merge]] in **dedup-check mode** (same skill, different method). It:
1. Extracts existing principle names from Cross-Project Knowledge.md.
2. Asks the LLM to compare new items against them and return an array of genuinely-new principles.
3. Returns a JSON array `[{ name, rule, why, first_seen }, ...]`, possibly empty.

For each returned principle, append to Cross-Project Knowledge.md under a new section:
```
## New Principles — <date> (from <project>)
---
### <name>
**Rule:** <rule>
**Why it matters:** <why>
**First seen:** <first_seen>
```

Cross-project propagation is **non-blocking** — if it fails (LLM unavailable, file malformed), log a warning but do not fail consolidate. The project-level merge in Step 3 is the primary commitment; cross-project is a nice-to-have.

### Step 5 — Log & notify
1. Summary string: built from non-empty counts — e.g. `"3 learnings, 1 decision, 2 gotchas"`. If all empty: `"nothing extracted"`.
2. Append to phase log: `consolidate_done run=<runId> detail=Knowledge updated: <summary>`.
3. Notification: event `consolidate_done`, project, phase, summary.
4. Call `tools/write-exec-log.sh` with status `CONSOLIDATE`, summary `sections=<N> project=<id>`.

### Step 6 — Return
Operation returns without performing any phase status transition. That's the caller's job (execute-phase → `completed`). Consolidate is a pure side-effect on Knowledge.md.

## Post-conditions & transitions
- No phase status transitions performed here.
- Knowledge.md updated (or created) with at least the new dated reference line under at least one category, OR log entry notes `nothing extracted`.
- `updated:` bumped on Knowledge.md if modified.
- Cross-Project Knowledge.md optionally updated (non-blocking).

## Error handling
- **RECOVERABLE:** LLM timeout in Step 2 — retry once. If still fails, log `consolidate_done: skipped — LLM unavailable` and return (do not block phase completion).
- **RECOVERABLE:** malformed JSON output from LLM — fallback: treat raw text as a single bullet under Learnings.
- **BLOCKING:** phase has no log AND no Outcome AND no Progress — extractor has nothing to work with. Log `consolidate_done: empty phase`, return. Do not block completion.
- **INTEGRITY:** Knowledge.md frontmatter corrupt on read. Escalate to INTEGRITY error (heal will catch on next run).

## Skills invoked
- [[08 - System/Agent Skills/_onyx-runtime/knowledge-merge/knowledge-merge.md|knowledge-merge]] — extraction + dedup-check.
- [[08 - System/Agent Skills/_onyx-runtime/monthly-rollup/monthly-rollup.md|monthly-rollup]] — used only by the monthly-consolidate invocation path.

## Tools invoked
- `tools/write-exec-log.sh` — Step 5.

## Native primitives relied on
- **Read** — phase, log, Knowledge.md, Cross-Project Knowledge.md.
- **Edit** — inject category blocks into Knowledge.md, append to Cross-Project file.
- **Write** — if Knowledge.md needs creating from template.
- **WebFetch** / agent-native LLM call — the knowledge-merge skill wraps the LLM invocation.

## Acceptance (self-check before exit)
- Knowledge.md is writable and its frontmatter still parseable after the append.
- Every item returned by the extractor appears in Knowledge.md under the appropriate heading OR in the log as "nothing extracted".
- A dated reference line exists for this phase in Knowledge.md (so we can `grep` for which phases contributed what).
- Cross-Project propagation either added new principles or failed silently — never corrupts the existing file.

## ExecLog entry format
```
<ISO> | <project> | <phase> | CONSOLIDATE | <duration-sec> | sections=<count> cross_project=<added-count>
```

## Shadow-mode comparison criteria
For the same completed phase + same Knowledge.md starting state:
- Both implementations produce a dated reference line in Knowledge.md for this phase.
- The **set** of extracted learnings overlaps semantically (exact wording will differ; compare via LLM-judge at ≥ 80% semantic match).
- The **category assignment** matches within one reclassification (a "decision" in TS might be a "gotcha" in directive — allow one such drift per phase).
- Cross-Project additions: directive produces ≤ TS count (directive tends to be stricter on de-dup; allow a smaller set).
- `updated:` bumped in both.

Zero semantic diff on category counts (±1 per phase) = green for deletion.
