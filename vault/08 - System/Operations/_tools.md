---
title: ONYX — Tool Catalog
tags:
  - system
  - tools
  - onyx
  - runtime
type: tool-catalog
version: 0.2
created: 2026-04-24
updated: 2026-04-24
graph_domain: system
up: Operations Hub
status: draft
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]
**Related:** [[08 - System/ONYX Master Directive.md|ONYX Master Directive]] · [[08 - System/ONYX - Decomposition Plan.md|Decomposition Plan]] · [[08 - System/Operations/_agent-native-validation.md|Agent-Native Validation Log]]

# ONYX — Tool Catalog

> **What this is.** The minimum set of shell-callable tools the runtime needs that *cannot* be expressed as native agent capabilities (Read, Write, Edit, Glob, Grep, Bash) + directive prose.
>
> **The principle.** If the agent can do it with native tools + clear prose instructions, it's not a runtime tool. Tools exist only for operations that need something the agent genuinely can't provide — today, that is **one** thing: atomic concurrent-append to ExecLog.md.
>
> **Frozen surface.** After Stage 1 ships, adding an eighth tool requires an explicit phase in `08 - System/` with profile `engineering`.

---

## 1. The one tool

### 1.1 `tools/write-exec-log.sh`

**Purpose.** Atomically append one structured line to `00 - Dashboard/ExecLog.md`. The *only* reason this is a shell script: when multiple agent processes run concurrently (different phases, same vault), naive Read→modify→Write loses lines. `flock`-based append is the cleanest guarantee.

**Invocation.**
```bash
tools/write-exec-log.sh \
  --vault <path> \
  --project <id> \
  --phase <id> \
  --status COMPLETED|BLOCKED|INTEGRITY_ERROR|ABANDONED|CONTINUING|IDLE|HEAL|ACQUIRE|RELEASE|ATOMISE|BLOCKED_NOTIFY|PLAN|INIT|CONSOLIDATE|REPLAN \
  --duration-sec <int> \
  [--summary "..."]
```

**Output format.** Matches Master Directive §7:
```
<ISO-timestamp> | <project-id> | <phase-id> | <status> | <duration-seconds> | <short-summary>
```

**Implementation sketch.**
```sh
#!/usr/bin/env bash
set -euo pipefail
# parse args into VAULT, PROJECT, PHASE, STATUS, DURATION, SUMMARY
LOGFILE="$VAULT/00 - Dashboard/ExecLog.md"
LINE="$(date -u +%Y-%m-%dT%H:%M:%SZ) | ${PROJECT:--} | ${PHASE:--} | ${STATUS} | ${DURATION} | ${SUMMARY:-}"
exec 9>> "$LOGFILE"
flock -x 9
printf '%s\n' "$LINE" >&9
flock -u 9
```

**Exit codes.**
- `0` — appended
- `2` — vault path invalid
- `3` — invalid args or required arg missing
- `4` — lock acquisition failed after timeout

**Replaces.** Nothing in src/ directly — the TS runtime writes ExecLog via direct filesystem append (unsafe under concurrency). New tool, Stage 1.

**Migration status.** Stage 1.

**Dependencies.** `flock` (standard on Linux; macOS needs `brew install util-linux` or an `flock(1)` polyfill).

---

## 2. Retired tool concepts

These were in the v0.1 draft of this catalog and have been dropped. Each was replaced by either a native agent capability or a directive prose pattern. Kept here as a decision log so we remember *why* they're not tools.

### 2.1 `agent-spawn.sh` — DROPPED
**Replaced by.** The agent *is* the runtime. For specialised sub-work within a phase, the agent's native Task/Agent tool exists. Sub-process spawning was a CLI-era concept that doesn't apply when the runtime is itself an agent.

**What was at stake.** Timeout enforcement, output size capping, file-change tracking. Handled natively: agent self-paces, Task tool bounds sub-agent output, `git-ops changed` (itself dropped — see 2.3) was how filesChanged was derived.

**Probe required.** No probe — we're not substituting one mechanism for another; we're choosing not to spawn.

### 2.2 `shell-exec.sh` — DROPPED
**Replaced by.** Agent's native Bash tool + `allowed_shell:` frontmatter on each profile. Master Directive invariant requires the agent to check `profile.allowed_shell` before any Bash call.

**What was at stake.** The `isSafeShellCommand` whitelist (ls, test, grep, rg, cat, sed, awk, echo, git, pnpm, npm, npx, node, timeout, mkdir, wc) and deny list (rm, mv, cp, dd, mkfs, chmod, chown, sudo). These move into profile declarations — enforcement becomes a directive rule.

**Probe required.** Yes — verify the agent refuses forbidden commands when given a task that would invoke them. See [[08 - System/Operations/_agent-native-validation.md|validation log]].

### 2.3 `git-ops.sh` — DROPPED
**Replaced by.** Agent invokes `git` via native Bash. Examples documented in operation stubs: `git log --oneline -10`, `git diff HEAD~1 --stat`, `git ls-files --others --exclude-standard`, `git tag -a <name> -m <msg>`.

**What was at stake.** Structured JSON output for `changed` (staged + unstaged + untracked). Replaced by the agent running three `git` commands and interpreting output directly — it has the reasoning capability the wrapper was faking.

**Probe required.** Yes — confirm the agent produces equivalent results for the 5 git use-cases in src/ (log, diff, show, changed, tag).

### 2.4 `repo-scan.sh` — DROPPED
**Replaced by.** Native Glob + Grep tools.

**What was at stake.** `find <path> -type f \( -name "*.ts" -o ... \) | grep -v node_modules | head -80`. Glob pattern `**/*.{ts,tsx,js,py}` with exclude filter does the same — and is the agent's native capability.

**Probe required.** Yes — trivial but included for completeness.

### 2.5 `notify.sh` — DROPPED
**Replaced by.** Agent runs `openclaw <args>` via native Bash. Event-format standardisation moves to **Master Directive §15 Notifications** (table of event names, required fields, severity levels). Each operation references §15 by link.

**What was at stake.** Consistent notification format across callers. Was a shell wrapper; becomes a directive table — every operation reads the same spec.

**Probe required.** Yes — verify agent's `openclaw` invocation matches TS behaviour; confirm push notifications arrive.

### 2.6 `doctor-check.sh` — DROPPED
**Replaced by.** [[08 - System/Doctor Directive.md|Doctor Directive]] — procedural checklist the agent reads and executes. This aligns with Zero-Code Vision §5's original design (Doctor Directive was always supposed to be a directive, never a shell script).

**What was at stake.** Checks: which binaries on PATH, which env vars set, vault path valid + writable, skill prerequisites present, profile references resolvable. All of these are things the agent can do natively (Bash `which`, env var tests, Read on vault paths).

**Probe required.** Yes — run Doctor Directive against a real system, compare output to `onyx doctor`.

---

## 3. What stays agent-native

For reference, here's every runtime capability the agent handles via its native tool surface, no shell wrapper involved:

| Capability | Native tool |
|---|---|
| Read any file | Read |
| Write / overwrite a file | Write |
| Modify part of a file | Edit |
| Find files by pattern | Glob |
| Search file contents | Grep |
| Run shell command (subject to profile whitelist) | Bash |
| Spawn sub-agent for parallelisable work | Task / Agent |
| Fetch a URL | WebFetch |
| Call Claude API | *(not needed — the agent IS Claude)* |
| Atomic append to shared log | **`tools/write-exec-log.sh`** (the one exception) |

---

## 4. File layout

```
onyx/
├── tools/
│   └── write-exec-log.sh          # the only runtime tool
└── scripts/
    └── (legacy one-off scripts — not frozen, not part of tool surface)
```

No `tools/lib/` needed — a single script doesn't justify shared helpers.

---

## 5. Migration checklist

Tracks Stage 1 of the [[08 - System/ONYX - Decomposition Plan.md|Decomposition Plan]].

- [ ] Create `tools/` directory
- [ ] Implement `tools/write-exec-log.sh` with `flock`-based atomic append
- [ ] Add a fixture test: two processes appending concurrently, verify no lines lost
- [ ] Verify macOS compatibility (flock polyfill if needed)
- [ ] Update `README.md` to document the tool surface (1 tool, not 7)
- [ ] Update `CLAUDE.md` Step 2.5 to mention `tools/` exists after install

After this gate, no new tools without explicit sign-off.

---

## 6. What "retiring src/ code" is gated on

Per [[08 - System/ONYX - Decomposition Plan.md|Decomposition Plan]] Stage 1.5: a `src/<module>` is only deleted after BOTH:

1. **Probe passes** — every agent-native primitive the operation relies on has a green entry in [[08 - System/Operations/_agent-native-validation.md|validation log]].
2. **Shadow-mode week passes** — the directive-agent produces behaviourally-identical writes to the TS runtime for a full week of real work.

Passing just one isn't enough. Probe proves the primitive works in isolation; shadow-mode proves it works under real vault pressure.
