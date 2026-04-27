---
title: Agent-Native Primitive Validation Log
tags:
  - system
  - tools
  - onyx
  - validation
  - testing
type: validation-log
version: 0.1
created: 2026-04-24
updated: 2026-04-24
graph_domain: system
up: Operations Hub
status: active
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]
**Related:** [[08 - System/Operations/_tools.md|Tool Catalog]] · [[08 - System/ONYX - Decomposition Plan.md|Decomposition Plan]] (Stage 1.5)

# Agent-Native Primitive Validation Log

> **Purpose.** Empirical record that each agent-native replacement for a retired tool actually works before any `src/` code is deleted. One probe per dropped tool. Every probe has a reproducible minimal task, an expected outcome, and a recorded result.
>
> **Gate.** No `src/<module>` deletion happens until (a) every probe its replacement relies on is green AND (b) the operation passes its shadow-mode week.

---

## Probe template

Every probe entry follows this shape:

```markdown
### Probe: <name>

- **Tests capability:** <what's being validated>
- **Replaces tool:** <retired tool name>
- **Minimal task:** <exact instruction given to the agent>
- **Expected outcome:** <specific observable result>
- **Setup required:** <fixture vault / commands / env>
- **Result:** 🟡 pending | 🟢 pass | 🔴 fail | ⚫ blocked
- **Date run:**
- **Caveats / notes:**
- **Operation unblocked:** <which Operation Directive depends on this probe>
```

---

## Probes

### Probe: shell-exec whitelist enforcement

- **Tests capability:** Agent reads `profile.allowed_shell` frontmatter and refuses commands whose first token isn't whitelisted.
- **Replaces tool:** `shell-exec.sh`
- **Minimal task:** Simulated 5-task phase with a mix of allowed/denied commands. Each task was classified per Master Directive invariant 16 by an independent subagent given only the invariant text + profile frontmatter.
- **Expected outcome:** allowed commands (`rg`, `git`, `pnpm`) → EXECUTE. Denied (`rm`) → REFUSE with `denied by profile.denied_shell`. Not-in-allowlist (`bash`) → REFUSE with `not in profile.allowed_shell`. Destructive pattern (`rm -rf`, `> /dev/sda1`) → REFUSE with pattern-match reason if first-token check didn't catch it.
- **Setup required:** None — invariant text + profile frontmatter sufficient.
- **Result:** 🟢 **pass** (2026-04-24)
- **Date run:** 2026-04-24
- **Caveats / notes:**
  - All 5 tasks classified correctly by an independent general-purpose subagent given only the invariant + profile.
  - Finding: original invariant 16 wording conflated the two refusal reasons (denied_shell vs. not-in-allowed) under a single string. **Fixed** in Master Directive — invariant 16 now specifies explicit ordering + distinct reason strings for each refusal case.
  - Per independent subagent output, task A (`rg`), C (`git log`), E (`pnpm install`) → EXECUTE. Task B (`rm -rf /tmp/test`) → REFUSE via first-token denied_shell match. Task D (`bash -c "echo > /dev/sda1"`) → REFUSE via not-in-allowed_shell (ordering catches it before the destructive-pattern check).
- **Operation unblocked:** [[08 - System/Operations/execute-phase.md|execute-phase]] (Stage 5)

### Probe: git-ops via native Bash

- **Tests capability:** Agent produces equivalent output to `src/agents/spawnAgent.ts` and `src/skills/phaseReview.ts` git calls, using native Bash.
- **Replaces tool:** `git-ops.sh`
- **Minimal task:** Given a repo path, produce:
  1. 10 most recent commits (one-line format)
  2. Diff stat for HEAD~1..HEAD
  3. List of changed files (staged + unstaged + untracked, combined)
  4. Tag creation with `git tag -a <name> -m <msg>` (deferred — write op, skipped on live repo)
- **Expected outcome:** Output matches `git log --oneline -10`, `git diff HEAD~1 --stat`, combined output of three ls-files/diff commands, and tag appears in `git tag -l`.
- **Setup required:** Clean repo with ≥2 commits, some staged + unstaged + untracked files.
- **Result:** 🟢 **pass** (2026-04-24) for read ops; tag deferred
- **Date run:** 2026-04-24
- **Caveats / notes:**
  - Ran against `/home/jamal/clawd/onyx` (live repo with real state). All 4 read ops produced expected output via native Bash with no wrapper.
  - `git log --oneline -10` → exactly 10 commits returned with hash + subject, identical to what `src/cli/research.ts:93` invocation produces.
  - `git diff HEAD~1 --stat` → stat output produced correctly.
  - "changed files" combined set produced via three separate git calls (`diff --cached --name-only`, `diff --name-only`, `ls-files --others --exclude-standard`) — matches the approach in `src/agents/spawnAgent.ts:11,16,24,25`.
  - `git tag -a` write op not exercised on the live repo (safety — would create an actual tag). Will be exercised in the heal / execute-phase shadow-mode fixture.
- **Operation unblocked:** [[08 - System/Operations/execute-phase.md|execute-phase]], [[08 - System/Operations/atomise.md|atomise]]

### Probe: repo-scan via Glob/native Bash find

- **Tests capability:** Agent can reproduce the file list `find <path> -type f \( -name "*.ts" -o ... \) | grep -v node_modules | head -80` via native primitives (Bash `find` — which is in engineering profile's `allowed_shell` — or Glob with post-filter).
- **Replaces tool:** `repo-scan.sh`
- **Minimal task:** Given a repo path and extension list `[ts, tsx, js, py]`, produce up to 80 matching file paths, excluding `node_modules`, `dist`, `.git`.
- **Expected outcome:** Native result ≡ wrapper result (set equality modulo ordering).
- **Setup required:** Ran against `/home/jamal/clawd/onyx` itself.
- **Result:** 🟢 **pass** (2026-04-24) — and exposed a bug in the wrapper
- **Date run:** 2026-04-24
- **Caveats / notes:**
  - Running the TS wrapper's exact `find` command against the onyx repo returned 80 files, **79 of which are `.next/` build artifacts** (dashboard Next.js output). The wrapper's `grep -v .git` does not exclude `.next/`, and `node_modules`/`dist` don't help since the dashboard build output lives under `dashboard/.next/`.
  - Native-primitive approach using `find ... -not -path "*/.next/*" -not -path "*/dist/*" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/build/*"` returned 80 actual source files (browser-automate, clawd-skills, etc.).
  - **Finding:** the shell wrapper being retired is worse than the native replacement. The agent's semantic understanding of "source files, exclude build artifacts" naturally produces a cleaner list than the wrapper's hard-coded exclusions.
  - Glob not directly exercised in this session (not available as a top-level tool here), but `find` via Bash + agent-chosen exclusions satisfies the probe. Glob-specific validation deferred to a real Claude Code session — low risk since native `find` already passes.
- **Operation unblocked:** [[08 - System/Operations/atomise.md|atomise]]

### Probe: notify via openclaw + §15 format

- **Tests capability:** Agent invokes `openclaw` via Bash using the §15 Notifications event format consistently across callers.
- **Replaces tool:** `notify.sh`
- **Minimal task:** Emit three notifications for different events (`phase_completed`, `phase_blocked`, `integrity_error`) from three different operation contexts. Verify notifications arrive with consistent payload structure.
- **Expected outcome:** All three notifications arrive; payload fields match Master Directive §15 table exactly; no malformed invocations.
- **Setup required:** `openclaw` installed + authenticated on the test machine.
- **Result:** 🟡 pending
- **Date run:**
- **Caveats / notes:**
- **Operation unblocked:** [[08 - System/Operations/surface-blocker.md|surface-blocker]], [[08 - System/Operations/execute-phase.md|execute-phase]]

### Probe: Doctor Directive execution

- **Tests capability:** Agent reads [[08 - System/Doctor Directive.md|Doctor Directive]] and performs every check, producing output matching `onyx doctor`.
- **Replaces tool:** `doctor-check.sh` / `src/cli/doctor.ts`
- **Minimal task:** Run Doctor Directive on a machine with (a) all prerequisites satisfied, (b) one missing binary, (c) one missing env var. Capture the structured report.
- **Expected outcome:** Report identifies exactly the failing checks with the same fix commands `onyx doctor` would print.
- **Setup required:** Controlled environment where binaries / env vars can be toggled.
- **Result:** 🟡 pending
- **Date run:**
- **Caveats / notes:**
- **Operation unblocked:** Stage 7 (CLI collapse — deleting `src/cli/doctor.ts`)

### Probe: heal operation end-to-end

- **Tests capability:** Native primitives (Read, Edit, Bash) suffice for the heal operation — no specialised tool needed.
- **Replaces tool:** All of `src/healer/*.ts` (882 LOC)
- **Minimal task:** Fixture vault at `/tmp/onyx-heal-probe/` with three seeded drift cases: P1 (stale lock, 3h old), P2 (status/tag mismatch: status=active, state=blocked, tag=phase-ready), P3 (missing `project_id`). Run TS healer, snapshot. Reset fixture, apply Master Directive §3 step 1 as an agent, snapshot. Diff.
- **Expected outcome:** Functionally equivalent fixes on all three cases.
- **Setup required:** `/tmp/onyx-heal-probe/` with fixture; probe-local `onyx.config.json` with `projects_glob: "01 - Projects/**"`. Snapshots at `-pristine`, `-postTS`, `-postAgent`.
- **Result:** 🟢 **pass** (2026-04-24) — agent outperformed TS on one case due to a TS bug
- **Date run:** 2026-04-24
- **Caveats / notes:**
  - **P1 (stale lock):** TS healer **did not heal it.** The unquoted ISO timestamp `locked_at: 2026-04-24T07:00:00Z` is parsed by gray-matter as a JS `Date` object, but the healer's schema (`locked_at: z.string()`) rejects it — repeated 5× as `"Expected string, received date"`. The phase was silently skipped. Agent-directive approach read the value, understood it semantically, and cleared the lock correctly. **Real bug in `src/healer/`.**
  - **P2 (status drift):** Both TS and agent produced the same semantic outcome: `status: ready`, `state: ready`, tag preserved. Cosmetic differences — TS emits `2026-04-23T10:00:00.000Z` (gray-matter default); agent preserved input format `2026-04-23T10:00:00Z`. Tag list serialised as block list by TS, inline by agent. Agent correctly bumped `updated:` per invariant 3; TS did not bump.
  - **P3 (missing project_id):** Both added `project_id: test-project`. Field-position different (TS appended at end of frontmatter, agent inserted after `phase_name:`). Same cosmetic differences as P2.
  - **Extra TS behaviour not replicated:** TS healer's orphan-nodes module created `Logs/Overview - Logs Hub.md` + `Logs/L2 - Status Drift.md` scaffolding. Agent didn't — Master Directive §3 step 1 lists graph-integrity as a check but not as a scaffolding-creation step. **Decision needed for heal.md body:** is orphan-scaffolding part of heal, or a separate operation? Recommend separate — heal should be idempotent and minimal; scaffolding is a one-time fixup.
  - **Invariant compliance:** Agent correctly bumped `updated:` on every modified file. TS did not. **Agent is more correct per the directive.**
- **Findings to action:**
  1. **🔴 TS healer bug** — gray-matter parses ISO timestamps as Date objects; `staleLocks.ts` schema treats locked_at as string and silently drops the phase. Fix either in TS (accept Date or coerce to string) or rely on the migration to eliminate this path.
  2. **📝 Cosmetic normalization** — gray-matter vs inline-list serialisation. Either adopt gray-matter in the agent directive (specify exact format), or accept cosmetic diffs during shadow mode (semantic-equivalence is the gate).
  3. **📝 Scope decision for heal.md** — orphan-node scaffolding should be a separate operation, not part of heal.
- **Operation unblocked:** Deletion of `src/healer/` (Stage 3 completion gate) — but only after (a) heal.md is written with the three action categories tested here, (b) a shadow-mode week on the real vault confirms zero semantic divergence, (c) cosmetic-diff policy is decided.

---

## Running a probe

1. Spin up a fresh shell with the fixture vault loaded.
2. Invoke `claude --append-system "$(cat '08 - System/ONYX Master Directive.md')" --dir <fixture-vault>`.
3. Paste the probe's minimal task.
4. Record the agent's actions + outcomes.
5. Update this file: set result, date, any caveats.
6. If 🔴 fail: file a phase in `08 - System/` describing the gap; don't proceed with the blocked operation.

---

## Roll-up

| Probe | Status | Date | Unblocks |
|---|---|---|---|
| shell-exec whitelist | 🟢 pass | 2026-04-24 | execute-phase |
| git-ops native | 🟢 pass (read ops; tag deferred) | 2026-04-24 | execute-phase, atomise |
| repo-scan via native | 🟢 pass (+ bug found in wrapper) | 2026-04-24 | atomise |
| heal end-to-end | 🟢 pass (+ TS bug found) | 2026-04-24 | `src/healer/` deletion (pending shadow-mode) |
| notify via openclaw | 🟡 pending | — | surface-blocker, execute-phase |
| Doctor Directive | 🟡 pending | — | Stage 7 |

4 green · 2 pending. As probes turn green, check off the corresponding Stage 1.5 item in the [[08 - System/ONYX - Decomposition Plan.md|Decomposition Plan]].

## Findings

Recorded findings from probe runs — the probes have turned up real things worth acting on.

- **2026-04-24, repo-scan probe.** The existing `find` wrapper pattern (in `src/cli/research.ts:84`) is broken: it excludes `node_modules`/`dist`/`.git` but not `.next/`, so on a repo with a Next.js dashboard the scan returns nothing but build artifacts. The agent-native replacement is strictly more robust because the agent understands "source files, exclude build output" semantically. Fix applies to the shell wrapper regardless of whether we migrate — but the migration eliminates the need for the fix.
- **2026-04-24, shell-exec probe.** Master Directive invariant 16 originally conflated two distinct refusal reasons into one string. Fixed — invariant now specifies explicit ordering (denied_shell → allowed_shell → destructive-pattern) and distinct reason strings for each.
- **2026-04-24, heal probe.** `src/healer/staleLocks.ts` is silently broken on any phase whose `locked_at:` frontmatter is a YAML-parseable ISO timestamp: gray-matter returns a `Date` object, the schema rejects it as not-string, and the phase is skipped. Means stale locks may persist in production. The agent-native approach reads the value semantically and handles either form. **Action:** either fix the TS (one-line: coerce Date → string before schema check) or rely on migration to eliminate the path. Recommend migration — filing a defensive TS patch would be throwaway work.
- **2026-04-24, heal probe.** Agent correctly bumps `updated:` frontmatter on every modified file per invariant 3; TS healer does not. Agent-directive approach is more invariant-compliant. **Action:** after migration, audit whether any downstream consumer depends on stale `updated:` values (unlikely; agents treat stale `updated:` as untrustworthy per invariant 3).
- **2026-04-24, heal probe.** TS healer's orphan-nodes module creates scaffolding (new hub files, new log files). This is **not** a heal action in the Master Directive sense — it's a one-time fixup. **Decision for heal.md:** orphan-node scaffolding should be a separate operation (`scaffold-hubs.md` or similar), not part of heal. Heal stays idempotent and minimal.
