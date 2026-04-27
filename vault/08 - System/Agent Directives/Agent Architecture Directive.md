---
tags: [system, status-active]
graph_domain: system
created: 2026-03-17
updated: 2026-03-25
status: active
version: 3.0
up: Agent Directives Hub
owner: <the-author>
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Directives/Agent Directives Hub.md|Agent Directives Hub]]

# Agent Architecture Directive

> Technical reference for the full ONYX execution system — FSM, routing table, phase lifecycle, self-healing, and vault-as-state-mirror.

---

## 1. System Overview

ONYX is a three-layer system:

```
┌─────────────────────────────────────┐
│  Intelligence Layer (Claude)        │  Reasoning, planning, decision-making
├─────────────────────────────────────┤
│  Runtime Layer (TypeScript)         │  FSM, routing, file I/O, agent spawning
├─────────────────────────────────────┤
│  State Layer (Vault + Orchestrator) │  Persistent state, history, config
└─────────────────────────────────────┘
```

TypeScript handles all deterministic operations. Claude handles judgment. Neither layer absorbs the other's responsibilities. The Orchestrator.json is the message bus — the full execution history is always readable in plain files.

---

## 2. Entry Points

### controller.ts — `handleMessage(text, opts?)`

The primary entry point for agent execution. Given user text and optional context:

1. **Intent classification** — `classifyIntent()` extracts projectId, kind, phaseNumber, replanRequested
2. **Mode resolution** — `resolveMode()` maps intent → `ControllerMode`
3. **Recipe selection** — `selectRecipeCore()` maps mode → `PipelineRecipeKey` (7 recipe types)
4. **Lock acquisition** — `acquireLock('project', projectId)` prevents concurrent work on the same project
5. **Self-healing** — `runSelfHealer()` runs before every pipeline; repairs drift automatically
6. **Pipeline execution** — `runPipeline(recipe, ctx)` runs ordered `PipelineStep[]`
7. **Postcondition verification** — `verifyPostconditions()` checks invariants after full-execute
8. **Lock release** — guaranteed in `finally` block
9. **Return** — `FlowResult { status, actions_taken, changes_applied, blockers, phasesExecuted }`

### controllerKernel.ts — `runKernel(options)`

The autonomous batch loop. Scans all Orchestrator.json files in the vault and dispatches work:

1. **Load manifests** — scan vault for `*Orchestrator.json` files
2. **Deterministic dispatch** — `shouldDispatch(manifest)` → priority score + mode (see §4)
3. **Order candidates** — sort by priority score, highest first
4. **Dispatch with circuit breaker** — max 3 consecutive failures → 30-min cooldown per project
5. **Iteration limit** — hard cap of 20 iterations per kernel run
6. **Return** — `KernelResult { iterations, dispatched[], halted, haltReason, circuitBreaks[] }`

---

## 3. FSM: State Machines

All state changes are FSM-gated. Illegal transitions throw and are never applied.

### Phase FSM

```
planned ──plan_created──→ ready ──execution_started──→ active
                                                          │      ↑
                                                  blocker_detected  blocker_cleared
                                                          │      │
                                                          ↓      │
                                                        blocked ─┘
                                                          │
                                              acceptance_satisfied
                                                          ↓
                                                       complete
```

States: `planned | ready | active | blocked | complete`

### Task FSM

```
todo ──started──→ in_progress ──blocked──→ blocked
                      │                      │
                   checked              unblocked
                      ↓                      ↓
                     done             in_progress
```

States: `todo | in_progress | blocked | done`

### Project FSM

```
draft → active → blocked ⇄ active → complete → archived
```

States: `draft | active | blocked | complete | archived`

### FSM Guarantees (fsm.ts)

- `transitionPhase(from, to, reason)` — validates against transition table, returns `TransitionResult`
- `applyPhaseStateToRaw(content, state)` — mutates frontmatter atomically in file content
- `appendTransitionLog(content, transition)` — records every FSM transition in `## 📝 Agent Log`
- `normalizePhaseState(raw)` — converts any raw frontmatter value to canonical state

---

## 4. Deterministic Routing Table

Given immutable project state, the same input always produces the same dispatch decision.

```
(status, pipeline_atoms, phases) → (dispatch?, mode, priority)

blocked | archived | complete    →  skip                         (never dispatch)
active, atom.status=active       →  dispatch, mode=atomToMode(), p=10
active, atom.status=pending      →  dispatch, mode=status,       p=5
active, no atoms, phases>0       →  dispatch, mode=execute-phase, p=8
active, no atoms, no phases      →  dispatch, mode=status,        p=3
```

`atomToMode()` maps atom string → ControllerMode:
- `Sync-State` → `status`
- `Phase-Executor` → `execute-phase`
- `Phase-Planner` → `plan-phase`
- `Linear-Import` → `import-linear`

No randomness. Kernel processes highest-priority projects first each iteration.

---

## 5. Pipeline Recipes (pipelines.ts)

Seven declarative pipelines. Each is an ordered list of `PipelineStep` objects.

| Recipe | Steps | Purpose |
|--------|-------|---------|
| `full-execute` | refiner → placement → sync → onboarding → consolidator → atomiser → plannerWide → plannerPhaseTarget → executor → notify | Complete workflow: place → atomise → plan → execute |
| `plan-phase` | placement → plannerPlanPhase → notify | Plan a single phase with agent |
| `status` | status → notify | Report current project state |
| `import-linear` | linearImport → placement → atomiser → sync → plannerWide → linearUplink → notify | Import Linear issues as phases |
| `uplink` | linearUplink → notify | Push state to Linear |
| `sync-linear` | linearSync → notify | Sync project-Linear mappings |
| `placement-only` | placement → placementOnlyHint → notify | Store intent without executing |

**full-execute step detail:**
```
1. refinerStep        — validate + repair Orchestrator.json schema
2. placementStep      — ensure bundle exists, update active_phase
3. syncStep           — sync phase states from task checkbox state
4. onboardingWizard   — run setup wizard if flagged
5. consolidatorStep   — archive completed phases
6. atomiserStep       — generate phase skeletons from Linear issues
7. plannerWideStep    — plan all incomplete phases with agent
8. plannerPhaseTarget — detailed plan for active_phase specifically
9. executorStep       — loop: findNextTask → executeTaskWithAgent → tickTask
10. notifyStep        — dispatch status notification
```

---

## 6. Phase Lifecycle

### 6.1 Planning (phasePlanner.ts)

Triggered when phases are empty or a new phase is needed:
- Reads Overview + Knowledge for context
- Spawns Cursor agent with QMD context (capped 4000 chars)
- Agent generates task list: 8–10 granular tasks, each with Files/Symbols/Steps/Validation metadata
- Tasks injected between `<!-- AGENT_WRITABLE_START:phase-plan -->` markers
- Output: `Phases/Phase N - <Name>.md` files + Orchestrator.json `phases` map populated

### 6.2 Execution (phaseExecutor.ts)

Task discovery priority:
1. Tasks under `## 📋 Implementation Plan → ### Implementation Tasks`
2. Tasks under `## 📂 Tasks`
3. Fallback: any `- [ ]` outside Acceptance Criteria / Blockers / Agent Log / fenced code

Task loop:
```
while unchecked task exists:
  findNextTask()
  → executeTaskWithAgent()  (Cursor agent, scoped workdir, QMD context)
  → tickTask()              (replace "- [ ]" with "- [x]")
  → appendAgentLog()
if acceptanceCriteriaSatisfied():
  completePhase()
  transitionPhaseNode(→ complete)
```

### 6.3 Consolidation (contextOrchestrator.ts)

Runs automatically by Controller between phases:
- Reads completed phase file + current Knowledge note
- Summarises decisions, changes, learnings
- Writes updated `[Project] - Knowledge.md`
- Never deletes source phase files

### 6.4 Advancement (controllerKernel.ts)

After phase complete:
- Increment `active_phase` to next pending phase
- If no phases remain: `status → complete`
- If next phase is blocked: trigger self-healer before advancing
- If `flags.paused`: halt and report to user

---

## 7. Self-Healer (selfHealer.ts)

`runSelfHealer()` executes **before every pipeline** — not only on error flags. Repairs are idempotent and non-fatal.

| Repair Type | Detection | Action |
|-------------|-----------|--------|
| `stale_lock` | `.lock.json` age > 15 min | Delete lock file |
| `stale_session` | `.session.json` mtime > 7 days | Delete session file |
| `frontmatter_drift` | `status ≠ phase_status_tag` in frontmatter | Apply canonical FSM state to both fields |
| `orphaned_phase` | Phase `active` AND 0 unchecked tasks | Transition → `complete` |
| `corrupt_lock` | `.lock.json` unparseable | Delete file |

Failed repairs are logged as `repaired: false` but do not throw. Healing continues even if bundle load fails.

Vault-level repair (separate from runtime self-healer):
```bash
npx tsx src/onyx/vault/vaultMaintenance.ts --apply-force
```
Repairs: nav blocks, frontmatter fields, Orchestrator.json stale paths after bundle moves.

---

## 8. Vault as State Mirror

The filesystem is source of truth. All mutations are atomic full-file writes via `writeBundle()`. No in-memory caching of bundle state.

| Vault Artefact | What It Represents |
|----------------|-------------------|
| `[Project] - Orchestrator.json` | Manifest: status, active_phase, phases map, pipeline_atoms |
| `Phases/Phase N - <Name>.md` | Task list, FSM state, acceptance criteria, blockers, agent log |
| `[Project] - Kanban.md` | Visual WIP board |
| `[Project] - Knowledge.md` | Accumulated context across all phases |
| `[Project] - Overview.md` | Project identity, goals, domain placement |
| `[Project] - Docs Hub.md` | Index of all supporting documentation |

**Write discipline:**
- Every vault mutation reads fresh state first (no stale writes)
- `writeBundle()` always writes full file content (never partial)
- Concurrent reads allowed; last write wins
- Phase task checkboxes updated in real-time during execution
- Knowledge note written only by Context Orchestrator

---

## 9. Orchestrator.json — ManifestV2 Schema

```typescript
interface ManifestV2 {
  manifest_version: 2;
  project_id: string;
  repo_path: string;
  status: 'draft' | 'active' | 'blocked' | 'complete' | 'archived';
  health: 'healthy' | 'degraded' | 'critical';
  active_phase: number | null;
  phases: {
    [phaseNumber: string]: {
      title: string;
      status: 'planned' | 'ready' | 'active' | 'blocked' | 'complete';
      file: string;           // vault-relative path to phase .md
      tasks_total?: number;
      tasks_done?: number;
      tasks_blocked?: number;
    }
  };
  pipeline_atoms: Array<{
    atom: string;             // e.g. "Phase-Executor", "Sync-State"
    predicate: string;        // human description of what this atom does
    status: 'pending' | 'active' | 'complete' | 'blocked';
  }>;
  config: {
    test_cmd?: string;
    lint_cmd?: string;
    build_cmd?: string;
  };
  last_run: {
    run_id: string;
    timestamp: string;
    outcome: string;
    phase?: number;
    task?: string;
  } | null;
  created: string;
  updated: string;
}
```

V1 manifests (phases as `Record<string, filePath>`) are auto-migrated by `migrateV1ToV2()` on first read.

---

## 10. Agent Context Assembly (QMD Format)

Context passed to each Cursor agent invocation is structured as a YAML-like query block:

```
```query
phase:
  file: "Phases/Phase 2 - Build API.md"
  excerpt: |
    ## 📋 Implementation Plan
    - [ ] **Task 1: Define schema**
      - Files: src/schemas.ts
      - Symbols: UserSchema
      - Steps: Add User interface, export

knowledge:
  excerpts: |
    Relevant historical learnings from Knowledge.md...

files:
  task_files:
    - path: src/schemas.ts
      symbols: UserSchema
      excerpt: |
        [first 24 lines containing target symbols]

exec_log:
  recent_entries: |
    [2026-03-25] Phase 1 completed: 4 tasks done
```
```

Size caps: plan mode 4000 chars, execute mode 3200 chars. File snippets: 24 lines max per file.

---

## 11. Error Classification & Recovery

```typescript
enum FailureClass {
  INTEGRITY,    // Schema errors, disk corruption, missing files → halt kernel
  RECOVERABLE,  // Network, timeout, rate limits → increment counter, continue
  BLOCKING      // Needs user action → increment counter, skip project
}
```

Circuit breaker: 3 consecutive failures per project → 30-min cooldown. Any non-error result resets the counter.

`INTEGRITY` failure → halt entire kernel immediately. All other failures → continue to next project.

---

## 12. Event-Driven Message Flow

```
User / Scheduler
  → controller.ts
      classifyIntent() → resolveMode() → selectRecipeCore()
      acquireLock()
      runSelfHealer()              ← repairs drift before execution
      runPipeline(recipe, ctx)
        ├── refinerStep            ← validate/fix Orchestrator schema
        ├── placementStep          ← ensure bundle + active_phase
        ├── plannerStep            ← Cursor agent: generate tasks
        ├── executorStep           ← Cursor agent: execute tasks
        │     findNextTask()
        │     executeTaskWithAgent()  ← scoped context, focused workdir
        │     tickTask()              ← "- [ ]" → "- [x]"
        │     completePhase() if done
        └── notifyStep             ← surface result to user
      verifyPostconditions()
      releaseLock()
  → FlowResult
```

No message broker, no queue. Orchestrator.json is the message bus. Every layer reads it before acting, writes it after completing. Full history is always readable in plain files.
