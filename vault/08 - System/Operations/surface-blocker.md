---
title: surface-blocker
tags:
  - system
  - operation
  - onyx
type: operation-directive
replaces: src/notify/ (the phase_blocked dispatch path) + inline blocker-population logic
lines_replaced: 50
version: 0.2
created: 2026-04-24
updated: 2026-04-24
graph_domain: system
up: Operations Hub
status: draft
migration_stage: 3
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]

# Operation: surface-blocker

> Make a blocked phase visible. Ensure `## Human Requirements` is populated with something actionable, dispatch a notification, record in ExecLog. No state transitions — a blocked phase stays blocked until a human clears it.

## Preconditions
- Phase `status:` is `blocked`.
- Phase file exists and has parseable frontmatter.

## Invocation context
- From [[08 - System/Operations/route.md|route]] when `status: blocked`.
- Implicitly from [[08 - System/Operations/execute-phase.md|execute-phase]] at the moment it transitions a phase to blocked (execute-phase calls this inline before releasing the lock).

## Read order
1. Phase file — full content, especially `## Human Requirements`, `## Log`, `## Progress`.
2. Project Overview.md — just enough to resolve the human-facing project name for the notification.

## Procedure

### Step 1 — Check Human Requirements
Read `## Human Requirements` section.
- If non-empty → proceed to Step 3.
- If empty or missing → go to Step 2.

### Step 2 — Infer and populate
Scan `## Log` and `## Progress` for the most recent non-trivial entry describing what failed. Write to `## Human Requirements`:

```markdown
## Human Requirements

- **Blocker:** <one-sentence summary from log/progress>
- **What's needed:** <specific input or action; infer from blocker if possible>
- **Where it's blocking:** <task number or acceptance criterion reference if parseable>
- **Unblock by:** resolve the above and run `onyx reset "<project>"`, or set `status: ready` manually.
```

If nothing useful can be inferred from log/progress, populate with:
```markdown
## Human Requirements

- **Blocker:** Unknown — phase was marked blocked without a recorded reason.
- **What's needed:** Manual review required.
- **Unblock by:** investigate the phase file + log, then run `onyx reset "<project>"` or set `status: ready`.
```

Bump `updated:` frontmatter.

### Step 3 — Notify
Dispatch via native Bash per Master Directive §15:
```bash
openclaw \
  --event phase_blocked \
  --project <project_id> \
  --phase <phase_number> \
  --severity warn \
  --message "[WARN] <project_id>/<phase_id>: <first line of Human Requirements.Blocker>"
```

If `openclaw` is not on PATH, append to Log as `notify_skipped: openclaw unavailable` and continue. Notification-dispatch failure is not blocking.

### Step 4 — Log
Call `tools/write-exec-log.sh`:
```
--status BLOCKED_NOTIFY
--project <project_id>
--phase <phase_number>
--summary "blocker=<short-reason-snippet>"
```

### Step 5 — Do nothing else
Do NOT modify phase `status:`. The phase stays `blocked`. Do NOT release any locks (execute-phase owns the lock lifecycle).

## Post-conditions & transitions
- No status transitions. Phase remains `blocked`.
- `## Human Requirements` is non-empty.
- Notification attempted.
- ExecLog entry appended.

## Error handling
- **RECOVERABLE:** `openclaw` non-zero exit → log `notify_failed: <exit code>`; retry once with a 1s backoff; then continue.
- **BLOCKING:** never — this IS the blocking operation.
- **INTEGRITY:** phase file unreadable or frontmatter corrupt. Halt; heal next.

## Skills invoked
None. All logic inlined above.

## Tools invoked
- `tools/write-exec-log.sh` — Step 4.

## Native primitives relied on
- **Read** — phase frontmatter + body.
- **Edit** — populate `## Human Requirements` if empty; bump `updated:`.
- **Bash `openclaw ...`** — notification dispatch (subject to profile `allowed_shell`).

## Acceptance (self-check before exit)
- `## Human Requirements` section exists and contains at least a `**Blocker:**` line.
- Notification was attempted (success logged, or failure logged without halting).
- ExecLog line appended.
- `status:` still `blocked`.

## ExecLog entry format
```
<ISO> | <project> | <phase> | BLOCKED_NOTIFY | <duration-sec> | blocker=<short-reason>
```

## Shadow-mode comparison criteria
For the same `blocked` phase, TS and directive agents must produce:
- The same `## Human Requirements` content (semantic match allowed).
- The same notification event (same event name, severity, project, phase — `message` text may differ in wording).
- Both ExecLog entries.
