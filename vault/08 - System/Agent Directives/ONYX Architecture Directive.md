---
title: ONYX Architecture Directive
tags: [system, directive, architecture, onyx]
type: directive
version: 4.0
updated: 2026-04-16
graph_domain: system
up: Agent Directives Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Directives/Agent Directives Hub.md|Agent Directives Hub]]
**Related:** [[08 - System/ONYX - Zero-Code Architecture Vision.md|Zero-Code Architecture Vision]] — future direction

# ONYX Architecture Directive

> **Audience:** Any developer or AI agent working on or with the ONYX system.
>
> This document describes ONYX as it exists today: the runtime loop, the FSM, routing, the self-healer, and the CLI. §22 lists forward-looking work.

---

## Table of Contents

1. [System Philosophy](#1-system-philosophy)
2. [Three-Layer Architecture](#2-three-layer-architecture)
3. [Vault as State Mirror](#3-vault-as-state-mirror)
4. [State Machines (FSM)](#4-state-machines-fsm)
5. [Deterministic Routing Table](#5-deterministic-routing-table)
6. [Entry Points](#6-entry-points)
7. [Self-Healer](#7-self-healer)
8. [Error Taxonomy & Retry Policy](#8-error-taxonomy--retry-policy)
9. [Context Orchestration (QMD)](#9-context-orchestration-qmd)
10. [Vault I/O Layer](#10-vault-io-layer)
11. [Telemetry & Exec Log](#11-telemetry--exec-log)
12. [Notification Chain](#12-notification-chain)
13. [Linear Integration](#13-linear-integration)
14. [Utility Layer](#14-utility-layer)
15. [Constants & Configuration](#15-constants--configuration)
16. [Public API Reference](#16-public-api-reference)
17. [Developer Guide](#17-developer-guide)
18. [Profiles & Directives System](#18-profiles--directives-system)
19. [Knowledge Compounding & Experimenter Loop](#19-knowledge-compounding--experimenter-loop)
20. [Phase Scheduling & Control](#20-phase-scheduling--control)
21. [CLI Reference](#21-cli-reference)
22. [Roadmap](#22-roadmap)

---

## 1. System Philosophy

ONYX is a **deterministic, FSM-driven autonomous agent runtime** for managing software projects.

**Start here for roles/permissions:** [[08 - System/Agent Directives/Agent Roles & Contracts Directive.md|Agent Roles & Contracts Directive]].

Its core principles:

| Principle | Implementation |
|-----------|----------------|
| **Vault as source of truth** | All state lives in Obsidian markdown files. No database. |
| **Deterministic routing** | Given (project_state, atoms, phases) → always the same mode. No LLM routing. |
| **Self-healing** | Detect and repair drift on every run, before touching anything else. |
| **Single writer** | All vault writes go through `writeBundle()`. Never `fs.writeFileSync` directly. |
| **Error taxonomy** | Every failure is RECOVERABLE, BLOCKING, or INTEGRITY — never "unknown". |
| **Atomic steps** | Each pipeline step is independently testable, has a `shouldRun()` guard, and is optionally retriable. |
| **Observability** | Every dispatch logged to ExecLog.md. Every step telemetry'd to JSONL. Every error classified. |

---

## 2. Three-Layer Architecture

```mermaid
graph TB
    subgraph Intelligence["🧠 Intelligence Layer"]
        CC[Claude / Cursor Agent]
        LLM[LLM Planning & Execution]
    end

    subgraph Runtime["⚙️ Runtime Layer (src/onyx/)"]
        direction TB
        K[controllerKernel.ts<br/>Autonomous Loop]
        C[controller.ts<br/>Single Dispatch]
        IC[intentClassifier.ts<br/>Weighted Signal Scoring]
        PR[pipelineRunner.ts<br/>Step Execution Engine]
        SH[selfHealer.ts<br/>Drift Repair]
        ST[stateTools.ts<br/>Routing Table]
        STEPS[steps/*.ts<br/>Atomic Pipeline Steps]
        CO[contextOrchestrator.ts<br/>QMD Context Builder]
        AB[agentBridge.ts<br/>Agent Spawner]
    end

    subgraph State["📁 State Layer (Vault)"]
        direction TB
        VS[vaultSkill.ts<br/>Sole IO Gateway]
        OJ[Orchestrator.json<br/>Project Manifest]
        PH[Phase Notes *.md<br/>Task Checklists + Plans]
        KN[Knowledge.md<br/>Consolidated Context]
        EL[ExecLog.md<br/>Append-only Event Log]
    end

    CC -->|invoke| C
    K -->|batch dispatch| C
    C -->|classify| IC
    C -->|run| PR
    C -->|repair first| SH
    PR -->|execute| STEPS
    STEPS -->|build context| CO
    CO -->|spawn| AB
    AB -->|call| CC
    STEPS -->|read/write| VS
    SH -->|read/write| VS
    VS -->|file I/O| OJ
    VS -->|file I/O| PH
    VS -->|file I/O| KN
    VS -->|file I/O| EL
    K -->|evaluate| ST
```

**Rule:** Intelligence layer (Claude/Cursor) only touches vault files via the agent bridge or direct writes inside `<!-- AGENT_WRITABLE_* -->` markers. The runtime layer owns all structural state transitions.

---

## 3. Vault as State Mirror

Every piece of project state lives as a human-readable markdown file. The Orchestrator.json is the message bus — it declares intent, and the runtime makes it real.

### Bundle Structure

```
03 - Ventures/
└── {Namespace}/{ProjectName}/
    ├── Orchestrator.json           ← Project manifest / message bus
    ├── {ProjectName} - Overview.md ← One-paragraph summary + top-level goals
    ├── {ProjectName} - Kanban.md   ← (optional) Kanban view
    ├── {ProjectName} - Knowledge.md← Consolidated context, decisions, Q&A
    ├── Phase 01 - {Name}.md        ← Phase note (plan + tasks + log)
    ├── Phase 02 - {Name}.md
    ├── ExecLog.md                  ← Append-only dispatch log
    └── Docs/                       ← Supporting documentation
```

### Orchestrator.json Schema (ManifestV2)

```jsonc
{
  "project_id": "OpenClaw/Almani",        // Unique project identifier
  "repo_path": "/home/jamal/dev/almani",  // Absolute path to code repo
  "bundle_path": "10 - OpenClaw/Ventures/Almani", // Vault-relative
  "status": "active",                     // ProjectState FSM value
  "active_phase": 2,                      // Which phase is currently executing
  "health": "healthy",                    // 'healthy' | 'degraded' | 'unknown'
  "default_branch": "main",
  "phases": {                             // Phase number → vault-relative path
    "1": "10 - OpenClaw/Ventures/Almani/Phase 01 - Setup.md",
    "2": "10 - OpenClaw/Ventures/Almani/Phase 02 - Core API.md"
  },
  "pipeline_atoms": [                     // Discrete work atoms (from Linear/atomiser)
    { "atom": "import-linear", "status": "complete" },
    { "atom": "plan", "status": "complete" },
    { "atom": "execute", "status": "active" }
  ],
  "linear_project_id": "PROJ-123",        // Linear project ID
  "linear_epic_id": "LIN-456",            // Root Linear epic
  "test_command": "pnpm test",
  "lint_command": "pnpm lint"
}
```

### Phase Note Structure

```markdown
---
status: active
phase_status_tag: active
phase_name: Core API
linear_issue_id: LIN-789
---

# Phase 02 — Core API

## 📂 Tasks
- [x] **High-level goal 1** ← Auto-ticked on phase completion
- [ ] **High-level goal 2**

## 📋 Implementation Plan
<!-- AGENT_WRITABLE_START:phase-plan -->
- [ ] **Task 1:** Set up Express router structure
  - Files: `src/api/router.ts`, `src/api/middleware.ts`
  - Symbols: `createRouter`, `authMiddleware`
  - Steps: Create file → define routes → add middleware
  - Validation: `GET /health` returns 200

- [ ] **Task 2:** Implement auth middleware
  ...
<!-- AGENT_WRITABLE_END:phase-plan -->

## ✅ Acceptance Criteria
- [ ] All endpoints return typed responses
- [ ] Auth middleware covers all routes

## 🚧 Blockers
(none)

## Agent Log
- 2026-03-25T10:00:00Z — Phase transitioned: planned → ready (plan_created)
- 2026-03-25T10:05:00Z — Phase transitioned: ready → active (execution_started)
```

---

## 4. State Machines (FSM)

Three independent FSMs track state at different granularities.

### 4.1 Project State

```mermaid
stateDiagram-v2
    [*] --> draft : genesis()
    draft --> active : start_project
    active --> blocked : blocker_raised
    active --> complete : all_phases_done
    blocked --> active : blocker_cleared
    complete --> archived : archive_requested
```

| State | Meaning | Kernel Action |
|-------|---------|---------------|
| `draft` | Created, not yet active | `placement-only` (just record intent) |
| `active` | Work in progress | `full-execute` (run the full pipeline) |
| `blocked` | Manual intervention needed | `status` (surface blocker, don't advance) |
| `complete` | All phases done | `uplink` (sync completion to Linear) |
| `archived` | No further work | `null` (skip entirely) |

### 4.2 Phase State

```mermaid
stateDiagram-v2
    [*] --> backlog : phase_created
    backlog --> planning : atomisation_started
    backlog --> ready : atomisation_skipped
    planning --> ready : atomisation_complete
    planning --> backlog : atomisation_failed
    ready --> active : execution_started
    ready --> planning : replan_requested
    active --> completed : all_tasks_done
    active --> blocked : blocker_raised
    blocked --> active : blocker_cleared
    blocked --> planning : replan_requested
    completed --> planning : re_open_for_replan
```

Authoritative transition table — from `src/fsm/states.ts`:

```typescript
export const PHASE_TRANSITIONS: Record<PhaseState, PhaseState[]> = {
  backlog:   ['planning', 'ready'],
  planning:  ['ready', 'backlog'],
  ready:     ['active', 'planning'],
  active:    ['completed', 'blocked'],
  blocked:   ['active', 'planning'],
  completed: ['planning'],                // Not terminal from a routing POV
};
```

| State | Valid Next States | Routing Operation (from `routePhase`) | Healer Touches? |
|-------|-------------------|---------------------------------------|-----------------|
| `backlog`   | planning, ready       | `atomise`          | No |
| `planning`  | ready, backlog        | `wait` (atomiser in flight) | No |
| `ready`     | active, planning      | `execute`          | No |
| `active`    | completed, blocked    | `execute` (stale-lock recovery path) | Yes — clears stale locks so next tick re-acquires cleanly |
| `blocked`   | active, planning      | `surface_blocker`  | Yes — frontmatter drift only |
| `completed` | planning              | `skip`             | No |

> **Terminal state:** `completed` (per `isTerminal()` in `src/fsm/states.ts`). Routing treats it as skip-able, but the transition table still permits `completed → planning` so a phase can be re-opened for replanning without creating a new phase.

### 4.3 Task State

```mermaid
stateDiagram-v2
    [*] --> todo : task_discovered
    todo --> in_progress : task_started
    todo --> done : task_completed
    in_progress --> blocked : blocker_raised
    in_progress --> done : task_completed
    blocked --> in_progress : blocker_cleared
```

### 4.4 Key FSM Functions

Module: `src/fsm/states.ts`.

```typescript
// src/fsm/states.ts
export const PHASE_TRANSITIONS: Record<PhaseState, PhaseState[]>
export function canTransition(from: PhaseState, to: PhaseState): boolean
export function isTerminal(state: PhaseState): boolean
// Re-exported from src/shared/vault-parse.js:
export { normalizeState as normalizeTag, stateToTag as toTag }
```

Frontmatter mutation lives in `src/vault/writer.ts`. Transition log appending happens inline inside the executor.

---

## 5. Deterministic Routing Table

The dispatcher is `routePhase()` in `src/controller/router.ts`. Given a phase's frontmatter `status`, it returns exactly one of five operations — `atomise`, `wait`, `execute`, `surface_blocker`, or `skip`. Routing is per-phase; there is no project-level routing table.

```mermaid
flowchart TD
  P[PhaseNode] --> S{frontmatter.status}
  S -->|backlog|    ATM[op: atomise]
  S -->|planning|   WAIT[op: wait<br/>reason: Atomiser in flight]
  S -->|ready|      EX1[op: execute]
  S -->|active|     EX2[op: execute<br/>stale-lock recovery]
  S -->|blocked|    SB[op: surface_blocker]
  S -->|completed|  SK[op: skip<br/>reason: Already completed]
```

### Routing Code (verbatim from `src/controller/router.ts`)

```typescript
export type Operation =
  | { op: 'atomise';         phaseNode: PhaseNode }
  | { op: 'execute';         phaseNode: PhaseNode }
  | { op: 'surface_blocker'; phaseNode: PhaseNode }
  | { op: 'wait';            phaseNode: PhaseNode; reason: string }
  | { op: 'skip';            reason: string };

export function routePhase(phaseNode: PhaseNode): Operation {
  const state = stateFromFrontmatter(phaseNode.frontmatter);
  switch (state) {
    case 'backlog':   return { op: 'atomise',         phaseNode };
    case 'planning':  return { op: 'wait',            phaseNode, reason: 'Atomiser in flight' };
    case 'ready':     return { op: 'execute',         phaseNode };
    case 'active':    return { op: 'execute',         phaseNode };
    case 'blocked':   return { op: 'surface_blocker', phaseNode };
    case 'completed': return { op: 'skip',            reason: 'Already completed' };
  }
}
```

### Controller Loop (from `src/controller/loop.ts`)

The outer loop (`runLoop`) wraps routing:

```
1. notify controller_started
2. runAllHeals → notify heal_complete
3. maintainVaultGraph (fractal link integrity)
4. discoverAllPhases → dependenciesMet filter → cycle detection
5. If no ready phases: notify controller_idle, return
6. For each actionable phase: routePhase → dispatch to atomiser/executor/consolidator/surface
7. notify per-action event
8. Repeat until no work OR maxIterations OR SIGINT/SIGTERM
```

Consolidation is **not** a separate routing op — it runs inline inside the executor path immediately after a phase transitions to `completed`. There is no `PROJECT_STATE_RECIPE` or `PHASE_STATE_OPS` map in the current codebase.


---

## 6. Entry Points

ONYX is invoked exclusively through the CLI. Each command maps to a function call inside `src/`:

### 6.1 `onyx run` — the loop

The primary autonomous entry point. Calls `runLoop()` in `src/controller/loop.ts`.

```typescript
// src/controller/loop.ts
export async function runLoop(config: ControllerConfig, opts: RunOptions = {}): Promise<IterationResult[]>

export interface RunOptions {
  projectFilter?: string;
  phaseFilter?: number;
  dryRun?: boolean;
  once?: boolean;
}
```

Each iteration:

```mermaid
flowchart LR
  A[notify controller_started] --> B[runAllHeals]
  B --> C[maintainVaultGraph]
  C --> D[discoverAllPhases]
  D --> E{any phase actionable?}
  E -->|no| I[notify controller_idle → exit]
  E -->|yes| F[routePhase → op]
  F --> G[dispatch op to atomiser / executor / consolidator / surface]
  G --> H[notify per-action event]
  H --> E
```

Halt conditions (from `runLoop`):
- No actionable phases discovered
- `opts.once` is true after one iteration
- `config.max_iterations` reached
- `SIGINT` / `SIGTERM` (graceful — finishes current action)

### 6.2 `onyx next` — pick the next ready phase

`src/cli/onyx.ts` → prints the highest-priority ready phase without executing. Useful for dashboards and scripts.

### 6.3 Plan commands

| CLI | Internal call | Purpose |
|---|---|---|
| `onyx plan <project>` | `phasePlanner.planProject()` | Decompose `Overview.md` → phase stubs, then atomise each phase |
| `onyx plan <project> <n>` | `atomiser.atomisePhase(n)` | Atomise a single phase |
| `onyx plan <project> --extend` | `phasePlanner.extendProject()` | Append new phases to an existing plan |
| `onyx decompose <project>` | `phasePlanner.decompose()` | Generate phase stubs only (no atomisation) |
| `onyx atomise <project> [n]` | `atomiser.atomisePhase(n)` | Explicit atomise |

### 6.4 State control commands

| CLI | Purpose |
|---|---|
| `onyx ready <project> [phase]` | Flip `backlog` (or `planning`) → `ready` |
| `onyx block <project> "<reason>"` | Flip active phase → `blocked` with reason recorded |
| `onyx reset [project]` | Unblock → `ready` |
| `onyx set-state <path> <state>` | Force state transition (dashboard/scripts) |

### 6.5 Integrity commands

| CLI | Internal call | Purpose |
|---|---|---|
| `onyx doctor` | pre-flight checks | Validates config, vault, API keys, `claude` CLI availability |
| `onyx heal` | `runAllHeals()` | Clears stale locks + runs graph maintenance |
| `onyx check <project>` | bundle validator | Read-only: validates bundle shape + frontmatter |

### 6.6 Observability

| CLI | Purpose |
|---|---|
| `onyx status [project]` | Phase states for all projects (or one) |
| `onyx explain [project]` | Plain-English summary |
| `onyx logs <project> [--audit]` | Execution log (add `--audit` for full trail) |

### 6.7 Knowledge + capture

| CLI | Purpose |
|---|---|
| `onyx consolidate <project>` | Manually run the consolidator for a project |
| `onyx monthly-consolidate` | Roll up monthly logs |
| `onyx refresh-context <project>` | Re-scan the repo, update Repo Context |
| `onyx capture "<text>"` | Append to `00 - Dashboard/Inbox.md` |
| `onyx research <topic>` | Research-step dispatch |
| `onyx daily-plan [date]` | Time-blocked daily plan |

### 6.8 Linear integration

| CLI | Purpose |
|---|---|
| `onyx import <linearProjectId>` | Import Linear project as vault bundle |
| `onyx linear-uplink [project]` | Push vault phase state to Linear |

### 6.9 Introspection

| CLI | Purpose |
|---|---|
| `onyx phase <project> <name>` | Print a phase with its resolved context |
| `onyx directive <name>` | Print a directive (bundle-local or system) |
| `onyx profile <name>` | Print a profile |

### 6.10 Dashboard

| CLI | Purpose |
|---|---|
| `onyx dashboard [port]` | Next.js dashboard (default `:7070`) |

### 6.11 Project bootstrap

| CLI | Internal call | Purpose |
|---|---|---|
| `onyx init [name]` | bundle generator | Interactive project creation (prompts for profile) |

---


## 7. Self-Healer

Runs as the first action of every `runLoop` iteration, before phase discovery.

```typescript
// src/healer/index.ts
export function runAllHeals(config: ControllerConfig): { applied: number; detected: number }
```

```mermaid
flowchart LR
    SH[runAllHeals] --> SL[clear stale locks<br/>age > stale_lock_threshold_ms]
    SH --> GM[maintainVaultGraph<br/>fractal parent↔child wikilinks]
```

### Current repair types

| Type | Detection | Repair |
|------|-----------|--------|
| `stale_lock` | Lock file mtime > `stale_lock_threshold_ms` (default 5 min) | Delete lock file |
| `graph_drift` | Parent note missing a wikilink back from a child, or vice versa | Rewrite the link into the correct note |

All vault repairs go through the vault writer (`src/vault/writer.ts`) — never direct `fs.writeFileSync`.

Potential future repair types (see §22): `frontmatter_drift`, `orphaned_phase`, `stale_session`, `broken_wikilink`.

---

## 8. Error Taxonomy & Retry Policy

### Three Failure Classes

```mermaid
graph TD
    ERR[Error] --> CLASS{classifyError}
    CLASS -->|corruption / schema mismatch / FSM_INVALID / vault structure| I[INTEGRITY\nHalt kernel immediately]
    CLASS -->|timeout / ETIMEDOUT / 429 / rate-limit / ENOENT spawn| R[RECOVERABLE\nRetry with backoff]
    CLASS -->|everything else| B[BLOCKING\nSkip project, increment circuit breaker]
```

```typescript
// src/onyx/errors.ts
enum FailureClass {
  RECOVERABLE = 'RECOVERABLE',  // Transient: will self-resolve
  BLOCKING    = 'BLOCKING',     // Needs human triage
  INTEGRITY   = 'INTEGRITY',    // Structural corruption — halt now
}
```

### Error Classes

```typescript
class GZError extends Error {
  failureClass: FailureClass;
  component: string;
  retryable: boolean;
}
class RecoverableError extends GZError { } // failureClass = RECOVERABLE
class BlockingError    extends GZError { } // failureClass = BLOCKING
class IntegrityError   extends GZError { } // failureClass = INTEGRITY
```

### Retry Policies

| Policy | Max Attempts | Backoff | Retries On |
|--------|-------------|---------|------------|
| `RECOVERABLE_POLICY` | 3 | `1000 × 2^n + rand(0-500ms)` | RECOVERABLE only |
| `AGENT_POLICY` | 2 | `2000 × 2^n + rand(0-1000ms)` | RECOVERABLE only |
| `NO_RETRY` | 1 | none | never |

```typescript
withRetry<T>(fn: () => Promise<T>, policy: RetryPolicy, onRetry?: (attempt, err) => void): RetryResult<T>
```

### FlowResult Error Codes

| Code | Class | Meaning |
|------|-------|---------|
| `REFINER_FATAL` | INTEGRITY | Orchestrator.json corrupted — kernel halts |
| `FSM_INVALID_TRANSITION` | INTEGRITY | Illegal phase state transition |
| `PIPELINE_CRASH` | BLOCKING | Unhandled exception in pipeline |
| `CHECKS_FAILED` | BLOCKING | Postcondition violations after execute |
| `LINEAR_IMPORT_FAILED` | RECOVERABLE | Linear API error during import |
| `LINEAR_UPLINK_FAILED` | RECOVERABLE | Linear API error during uplink |
| `LINEAR_SYNC_FAILED` | RECOVERABLE | Linear sync API error |

---

## 9. Context Orchestration (QMD)

Every agent invocation receives a structured context string (QMD format) that scopes exactly what the agent needs.

```typescript
// src/onyx/contextOrchestrator.ts
buildQMDContext(
  projectId: string,
  phaseRel: string,
  taskLine?: string,
  intent?: string,
  vaultRoot?: string
): string
```

### QMD Block Types

```yaml
```query
phase:
  file: 10 - OpenClaw/Ventures/Almani/Phase 02 - Core API.md
  excerpt: |
    ## 📋 Implementation Plan (scoped)
    - [ ] **Task 3:** Implement auth middleware
      - Files: src/api/middleware.ts
      - Symbols: authMiddleware, JWTPayload
```

```query
knowledge:
  file: 10 - OpenClaw/Ventures/Almani/Knowledge.md
  excerpts: |
    JWT tokens use HS256. Secret in ONYX_JWT_SECRET env.
    Auth middleware must attach decoded payload to req.user.
```

```query
exec_log:
  recent_entries: |
    2026-03-25T10:05:00Z | COMPLETE | executor | task=Task 2 done

```query
files:
  task_files:
    - path: src/api/router.ts
      symbols: createRouter
      excerpt: |
        export function createRouter() {
          const router = Router();
```
```

### Context Assembly Priority

```mermaid
flowchart TD
    BQ[buildQMDContext] --> PQ[buildPhaseQuery\nphase + excerpt]
    BQ --> KQ[buildKnowledgeQuery\nkeyword-matched paras]
    BQ --> EL[buildExecLogContext\nlast 5 log entries]
    BQ --> AL[buildAgentLogContext\nlast 10 agent log lines]
    BQ --> FQ[buildFilesQuery\ntask Files metadata → snippets]
    PQ & KQ & EL & AL & FQ --> COMBINE[Combine + escapeTripleBackticks]
    COMBINE --> OUT[QMD string\ncapped at 3200 chars for executor\n4000 chars for planner]
```

**Task scoping:** When `taskLine` is provided, the Implementation Plan excerpt is scoped to only the matching task block (not the full plan), keeping context tight.

---

## 10. Vault I/O Layer

**Rule:** All reads and writes to the vault MUST go through `vaultSkill.ts`. No step or healer may call `fs.readFileSync` / `fs.writeFileSync` on vault files directly.

```typescript
// src/onyx/vaultSkill.ts — sole IO gateway

// Read entire bundle (all files as BundleNode objects)
readBundle(projectId: string, vaultRoot: string): VaultBundle

// Write any bundle node atomically
writeBundle(opts: {
  projectId: string;
  node: 'phase' | 'overview' | 'knowledge' | 'config' | 'execlog';
  phaseFile?: string;       // Required when node='phase'
  frontmatter?: Record<string, unknown>;
  content: string;
}, vaultRoot: string): void

// Read Orchestrator.json config
readOrchestratorConfig(projectId: string, vaultRoot: string): ProjectOrchestratorConfig

// Resolve bundle directory path
resolveBundlePath(projectId: string, vaultRoot: string): string
```

### BundleNode

Every file in the vault is loaded as a `BundleNode`:

```typescript
interface BundleNode {
  path: string;                          // Absolute path
  exists: boolean;                       // false if file missing
  frontmatter: Record<string, unknown>;  // Parsed YAML frontmatter
  content: string;                       // Body after frontmatter strip
  raw: string;                           // Full file including frontmatter
}
```

### VaultBundle

```typescript
interface VaultBundle {
  projectId: string;
  bundleDir: string;
  overview: BundleNode;
  kanban: BundleNode;
  knowledge: BundleNode;
  docsHub?: BundleNode;
  phases: BundleNode[];    // Sorted by filename (Phase 01, Phase 02, ...)
  docs: BundleNode[];
}
```

---

## 11. Telemetry & Exec Log

### Exec Log (`ExecLog.md`)

Every dispatch is appended to the project's `ExecLog.md` as a markdown H3 block. Human-readable and parseable.

```markdown
### 2026-03-25T10:05:00.000Z | COMPLETE | controller
run_id: abc123 | mode: execute-phase | status: complete | actions: 7 | phases_executed: P2
```

**Log Levels:** `DISPATCH | COMPLETE | ERROR | BLOCKED | SYNC | GENESIS | DRY-RUN | FATAL | INFO`

```typescript
appendExecLog(projectId: string, entry: ExecLogEntry, vaultRoot?: string): void
appendRunLog(projectId: string, runId: string, content: string, vaultRoot?: string): void
queryExecLog(projectId: string, level?: LogLevel, vaultRoot?: string): string[]
```

### Telemetry (JSONL)

Machine-readable structured events written to `.onyx-telemetry/YYYY-MM-DD.jsonl`:

```json
{"type":"step_start","timestamp":"2026-03-25T10:05:00.000Z","run_id":"abc123","project_id":"OpenClaw/Almani","component":"executorStep","phase_number":2}
{"type":"step_end","timestamp":"2026-03-25T10:05:04.123Z","run_id":"abc123","project_id":"OpenClaw/Almani","component":"executorStep","duration_ms":4123,"metadata":{"task":"Task 3 done"}}
```

**Event Types:** `step_start | step_end | step_error | step_retry | pipeline_start | pipeline_end | self_heal | circuit_break | dispatch`

```typescript
emitStepStart(runId, projectId, component, phaseNumber?): () => void  // returns end fn
emitStepError(runId, projectId, component, error, metadata?)
emitSelfHeal(runId, projectId, description)
emitCircuitBreak(projectId, failures, cooldownUntil)
readTelemetryLog(date?: string): TelemetryEvent[]
```

---

## 12. Notification Chain

```mermaid
flowchart LR
    NS[notifyStep] --> BNP[buildNotifyPayload\ninfer status from actions]
    BNP --> DN[dispatchNotification]
    DN --> STDOUT[Always: stdout log]
    DN --> FILE[Always: onyx-notifications.jsonl\none entry per notification]
    DN --> WA[Try: WhatsApp\nnon-blocking — failure → stderr only]
```

### NotifyPayload

```typescript
interface NotifyPayload {
  projectId: string;
  phaseLabel: string;
  status: 'complete' | 'blocked' | 'info';
  summary: string;
  blockers?: string;
  completedTasks?: string;
  runId?: string;
  wizardReportPath?: string;
}
```

**Status inference:** If `phasesExecuted.length > 0` → `complete`. If `blockers.length > 0` → `blocked`. Otherwise → `info`.

**Invariant (2026-03-26):** WhatsApp delivery failures are written to `stderr` only — never to `onyx-notifications.jsonl`. This prevents duplicate entries in the dashboard Activity feed. Previous behaviour (writing a second JSONL entry on failure) has been removed.

---

## 13. Linear Integration

```mermaid
graph LR
    subgraph Import["Import Flow"]
        direction TB
        LI[Linear Issues] -->|linearImportStep| VP[Vault Phases\nPhase N .md files]
        VP -->|atomiserStep| OS[Orchestrator.json\nphases map updated]
    end

    subgraph Uplink["Uplink Flow"]
        direction TB
        VP2[Vault Phase Notes] -->|linearUplinkStep| LI2[Linear Issues\nfindOrCreateIssue idempotent]
        VP2 -->|linearUplinkStep| LT[Linear Tasks\none per checkbox task]
    end

    subgraph Sync["Sync Flow"]
        direction TB
        VP3[Vault Phase States] -->|linearSyncStep| LS[Linear Issue States\naligned to vault FSM state]
    end
```

### Idempotency

All Linear operations use `normalizeIssueTitleForDedupe()` to dedup by title before creating issues. Running `uplink` twice produces no duplicates.

### Phase ↔ Linear Issue Mapping

- Phase note frontmatter: `linear_issue_id: LIN-789`
- Persisted via `withPhaseLinearIssueId()` + `writeBundle()`
- All checkbox tasks under a phase become child issues of the phase issue

---

## 14. Utility Layer

### `utils/phaseParser.ts` — Canonical Task Discovery

The single implementation replacing three previous duplicates. All consumers import from here.

```typescript
findNextTask(phaseContent: string): string | null
parseCheckboxTasks(content: string): CheckboxTask[]
acceptanceCriteriaSatisfied(content: string): boolean
isCheckboxLine(trimmed: string): boolean
isUncheckedTask(trimmed: string): boolean
isSectionHeading(line: string, titleFragment: string): boolean
toggleCodeFence(line: string, inCode: boolean): boolean
```

**Task discovery priority (all functions):**
1. `## 📋 Implementation Plan` → `### Implementation Tasks`
2. `## 📂 Tasks` (only when no Implementation Plan exists)
3. Fallback: any `- [ ]` outside excluded headings (Acceptance Criteria, Blockers, Agent Log)

### `utils/sectionUtils.ts` — Section Manipulation

```typescript
findSectionRange(content, heading): { start: number; end: number } | null
appendBulletToSection(content, heading, bullet): string
ensureSection(content, heading): string
replaceSection(content, heading, newBody): string
upsertProseSection(content, heading, newBody): string
```

### `utils/workdirUtils.ts` — Working Directory Resolution

```typescript
// Resolve focused workdir from task Files: metadata
resolveFocusedWorkdir(taskLine: string, repoPath: string): string

// Find deepest common ancestor of a list of absolute paths
commonAncestorDir(absPaths: string[]): string
```

**Heuristic:** Extract paths from `Files:` line in task metadata → resolve relative to repo → find common ancestor → return as focused workdir for agent.

---

## 15. Constants & Configuration

```typescript
// src/onyx/constants.ts

// Timeouts
LOCK_STALE_MS          = 15 * 60 * 1000      // 15 min — stale lock cleanup
REFINER_LOCK_STALE_MS  = 20 * 60 * 1000      // 20 min — refiner-specific lock
SESSION_STALE_MS       = 7 * 24 * 60 * 60 * 1000  // 7 days — cursor session
CIRCUIT_COOLDOWN_MS    = 30 * 60 * 1000      // 30 min — circuit breaker cooldown
CIRCUIT_MAX_FAILURES   = 3                    // trips circuit
MAX_KERNEL_ITERATIONS  = 20                   // per runKernel() call

// Section headings (used everywhere — single source of truth)
SECTION = {
  IMPLEMENTATION_PLAN: '📋 Implementation Plan',
  IMPL_TASKS_SUB:      'Implementation Tasks',
  TASKS:               '📂 Tasks',
  ACCEPTANCE_CRITERIA: '✅ Acceptance Criteria',
  BLOCKERS:            '🚧 Blockers',
  AGENT_LOG:           'Agent Log',
  OUTCOMES:            'Phase Outcomes (Definition of Done)',
}

// Agent-writable boundary markers
AGENT_WRITABLE = {
  START: '<!-- AGENT_WRITABLE_START:phase-plan -->',
  END:   '<!-- AGENT_WRITABLE_END:phase-plan -->',
}

// Headings excluded from task discovery
EXCLUDED_TASK_HEADINGS = [
  SECTION.ACCEPTANCE_CRITERIA,
  SECTION.BLOCKERS,
  SECTION.AGENT_LOG,
]
```

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ONYX_VAULT_ROOT` | `/home/jamal/Obsidian/OnyxVault` | Vault root path |
| `ONYX_EXEC_MODELS` | `composer-2,gpt-4.1-mini,sonnet-4` | Executor model list (comma-sep, tried in order) |
| `ONYX_PLAN_MODELS` | `composer-2,gpt-4.1-mini` | Planner model list |
| `ONYX_WHATSAPP_RECIPIENT` | — | Phone number for WhatsApp notifications (e.g. `+447700000000`). If unset, WhatsApp delivery is silently skipped. |
| `DEBUG_ONYX` | `0` | Set to `1` for verbose stderr output |
| `ONYX_JWT_SECRET` | — | JWT secret for auth middleware context |
| `LINEAR_API_KEY` | — | Linear GraphQL API key |

---

## 16. Public API Reference

```typescript
// src/onyx/index.ts — grouped by concern

// ── Entry Points ──────────────────────────────────────────────────────────
export { handleMessage }       from './controller.js'       // single-project dispatch
export { runKernel }           from './controllerKernel.js' // multi-project autonomous loop

// ── Intent Classification ─────────────────────────────────────────────────
export { classifyIntent, resolveMode, loadKnownProjectIds } from './intentClassifier.js'
export type { ClassifiedIntent }                            from './intentClassifier.js'

// ── Pipeline ──────────────────────────────────────────────────────────────
export { runPipeline, createPipelineContext } from './pipelineRunner.js'
export { MODE_RECIPES }                       from './pipelines.js'
export type { PipelineStep, PipelineContext, StepResult, PipelineResult } from './pipelineRunner.js'
export type { PipelineRecipeKey }             from './pipelines.js'

// ── FSM ───────────────────────────────────────────────────────────────────
export { normalizePhaseState, getPhaseStateFromFrontmatter,
         canTransitionPhase, transitionPhase,
         applyPhaseStateToRaw, appendTransitionLog }   from './fsm.js'
export { PROJECT_STATE_RECIPE, PHASE_STATE_OPS,
         evaluateRoutingTable }                         from './stateTools.js'
export type { ProjectState, PhaseState, TaskState }    from './fsm.js'

// ── Phase Operations ──────────────────────────────────────────────────────
export { ensurePhaseActive, ensurePhaseReady,
         transitionPhaseNode }                          from './phaseLifecycle.js'
export { findNextTask, tickTask, appendBlocker,
         appendAgentLog, completePhase }                from './phaseExecutor.js'
export { planPhase }                                    from './phasePlanner.js'
export { replanPhase }                                  from './replan.js'

// ── Vault I/O ─────────────────────────────────────────────────────────────
export { readBundle, writeBundle, readOrchestratorConfig,
         resolveBundlePath, parseFrontmatter }          from './vaultSkill.js'
export type { VaultBundle, BundleNode,
              ProjectOrchestratorConfig }               from './vaultSkill.js'

// ── Context ───────────────────────────────────────────────────────────────
export { buildQMDContext, buildPhaseQuery,
         buildKnowledgeQuery, buildFileSnippetQuery }   from './contextOrchestrator.js'
export { executeAgentThroughBridge }                    from './agentBridge.js'

// ── Self-Healing ──────────────────────────────────────────────────────────
export { runSelfHealer }          from './selfHealer.js'
export type { HealResult, HealAction } from './selfHealer.js'

// ── Errors & Retry ────────────────────────────────────────────────────────
export { FailureClass, classifyError, isRetryable, wrapError,
         GZError, RecoverableError, BlockingError, IntegrityError } from './errors.js'
export { withRetry, RECOVERABLE_POLICY, AGENT_POLICY, NO_RETRY }    from './retryPolicy.js'

// ── Telemetry ─────────────────────────────────────────────────────────────
export { emit, emitStepStart, emitStepError,
         emitSelfHeal, emitCircuitBreak,
         readTelemetryLog }        from './telemetry.js'
export { appendExecLog, appendRunLog, queryExecLog } from './execLog.js'

// ── Notifications ─────────────────────────────────────────────────────────
export { buildNotifyPayload, inferNotifyStatus,
         formatNotifyMessage }     from './notify.js'
export { dispatchNotification }    from './notifyAgent.js'

// ── Types ─────────────────────────────────────────────────────────────────
export type { FlowResult, ControllerMode } from './controllerTypes.js'
export type { RunContext, FlowName }       from './runContext.js'
```

---

## 17. Developer Guide

### Running the System

```bash
# Dry-run the kernel (shows what would dispatch, makes no changes)
npx tsx src/onyx/controllerKernel.ts --dry-run

# Run the kernel for a single project
npx tsx src/onyx/controllerKernel.ts --project-id "OpenClaw/Almani"

# Dispatch a single command
npx tsx src/onyx/runController.ts --text "execute phase 2 for Almani" --project-id "OpenClaw/Almani"

# Force-plan a phase
npx tsx src/onyx/runController.ts --text "plan phase 2" --project-id "OpenClaw/Almani" --mode plan-phase

# Check status
npx tsx src/onyx/runController.ts --text "status" --project-id "OpenClaw/Almani" --mode status

# Import from Linear
npx tsx src/onyx/runController.ts --text "import linear" --project-id "OpenClaw/Almani" --linear-project-id "PROJ-123"
```

### Adding a New Pipeline Step

1. Create `src/onyx/steps/myStep.ts`:

```typescript
import type { PipelineStep, StepResult } from '../pipelineRunner.js';
import { RECOVERABLE_POLICY } from '../retryPolicy.js';

export const myStep: PipelineStep = {
  name: 'myStep',

  shouldRun(ctx) {
    // Guard: only run when needed
    return ctx.state['someFlag'] === true;
  },

  async execute(ctx): Promise<StepResult> {
    // Do work...
    return {
      ok: true,
      actions: ['my-step:completed'],
      messages: ['My step finished successfully'],
    };
  },

  retryPolicy: RECOVERABLE_POLICY,  // or AGENT_POLICY or NO_RETRY
  critical: false,                  // set true to abort pipeline on failure
};
```

2. Add it to the relevant recipe in `pipelines.ts`:

```typescript
import { myStep } from './steps/myStep.js';

export const MODE_RECIPES: Record<PipelineRecipeKey, PipelineStep[]> = {
  'full-execute': [
    refinerStep,
    placementStep,
    // ...
    myStep,      // ← insert at the right point
    executorStep,
    notifyStep,
  ],
  // ...
};
```

3. Export from `index.ts` if it's part of the public API.

### Adding a New FSM State Transition

1. Update the transition table in `fsm.ts`:
```typescript
const PHASE_TRANSITIONS: Record<PhaseState, PhaseState[]> = {
  active: ['blocked', 'complete', 'my-new-state'],  // add here
  // ...
};
```

2. Handle the new state in `stateTools.ts` `PHASE_STATE_OPS`.
3. Handle it in `selfHealer.ts` if the self-healer should detect/repair it.
4. Handle it in `phaseLifecycle.ts` `ensurePhaseActive()` / `ensurePhaseReady()`.

### Debugging a Run

```bash
# Enable verbose output
DEBUG_ONYX=1 npx tsx src/onyx/controllerKernel.ts --project-id "OpenClaw/Almani"

# Read the exec log for a project
cat "~/Obsidian/OnyxVault/10 - OpenClaw/Ventures/Almani/ExecLog.md"

# Read telemetry for today
cat ".onyx-telemetry/$(date +%Y-%m-%d).jsonl" | jq .

# Check notifications
cat "onyx-notifications.jsonl" | tail -20 | jq .
```

### TypeScript Verification

```bash
# Must always compile clean
npx tsc --noEmit

# Run unit tests
npx jest --testPathPattern="src/onyx"

# Verify no subprocess spawning of contextOrchestrator
grep -r "execFileSync.*contextOrchestrator" src/onyx/ # must be empty

# Verify single writer contract
grep -r "writeFileSync.*Orchestrator" src/onyx/       # must be empty

# Verify single ControllerMode definition
grep -rn "^export type ControllerMode" src/onyx/      # must be exactly 1
```

### Common Pitfalls

| Pitfall | Correct Pattern |
|---------|----------------|
| Writing vault files directly | Always use `writeBundle()` |
| Spawning contextOrchestrator as subprocess | Import and call `buildQMDContext()` directly |
| Defining constants inline | Import from `constants.ts` |
| Implementing `findNextTask` locally | Import from `utils/phaseParser.ts` |
| Routing Linear modes per-project | Let `intentClassifier` handle all modes universally |
| Catching all errors as the same class | Use `classifyError()` to get RECOVERABLE/BLOCKING/INTEGRITY |
| Transitioning FSM state without going through `transitionPhase()` | Always gate through FSM |

---

## 18. Profiles & Directives System

The profiles and directives system is the primary mechanism for making ONYX domain-aware and agent-identity-aware without code changes.

### 21.1 Profiles

A **profile** is a vault markdown file at `08 - System/Profiles/<name>.md` that defines the mechanical contract for a project type. The profile is read at phase execution time and controls:

- `required_fields` — what the Overview must contain (preflight check fatal if missing)
- `init_docs` — what context documents to create at `onyx init` time
- Acceptance rules — domain-specific definition of "done"
- Phase field conventions — what optional frontmatter fields phases in this project carry
- Agent context ordering — what documents the agent reads and in what order

**Profile resolution** (`src/executor/runPhase.ts` → `resolveContextPaths`):
```typescript
const profileName = String(ov.frontmatter['profile'] ?? 'engineering');
const profileFilePath = path.join(vaultRoot, '08 - System', 'Profiles', `${profileName}.md`);
// required_fields read from profile frontmatter
// bundleDir always added to --add-dir (non-repo profiles can read bundle docs)
```

**Six profiles:**

| Profile | required_fields | Acceptance gate |
|---|---|---|
| `engineering` | `repo_path`, `test_command` | `test_command` exits 0 |
| `content` | `voice_profile`, `pipeline_stage` | safety filter + voice check |
| `research` | `research_question`, `source_constraints`, `output_format` | source count + confidence |
| `operations` | `monitored_systems`, `runbook_path` | `runbook_followed: true` + outcome documented |
| `trading` | `exchange`, `strategy_type`, `risk_limits`, `backtest_command` | backtest exits 0 + risk compliance |
| `experimenter` | `hypothesis`, `success_metric`, `baseline_value` | result recorded + Cognition Store updated |

**Backward compatibility:** Missing `profile:` in Overview defaults to `engineering`. Behavior is identical to pre-profile ONYX.

### 21.2 Directives

A **directive** is a vault markdown file prepended to the agent's context as the first item — before the profile, before the Overview. It gives the agent its identity for the phase: role, what to read, behavioral constraints, output format.

**Directive resolution order** (`src/executor/runPhase.ts`):
1. Read `directive:` from phase frontmatter
2. Look for `bundleDir/Directives/<name>.md` (project-local, project-specific override)
3. Fall back to `vaultRoot/08 - System/Agent Directives/<name>.md` (system-level)
4. If not found: warn + skip (not fatal)

**`cycle_type` auto-wiring** (experimenter profile only):
If `directive:` is not set but `cycle_type:` is set and `profile: experimenter`:
```typescript
const cycleMap = {
  learn: 'experimenter-researcher', design: 'experimenter-researcher',
  experiment: 'experimenter-engineer', analyze: 'experimenter-analyzer',
};
// resolves via same local-then-system lookup
```

### 21.3 Context injection order

When `runPhase` spawns an agent, files are injected in this order:
```
1. directivePath   (who the agent is)
2. profilePath     (domain rules + acceptance gate)
3. overviewPath    (project goals + required fields)
4. knowledgePath   (all prior learnings — compounds across phases)
5. profile-specific context doc (Repo Context / Source Context / Research Brief / etc.)
6. phaseNotePath   (what to do right now)
```

Implementation: `buildPrompt()` in `src/executor/runPhase.ts`, around line 580.

### 21.4 `--add-dir` multi-directory access

For non-repo profiles (content, research, operations, experimenter), the agent needs to read bundle files even without a `repo_path`. The executor always includes `bundleDir` in `--add-dir`:
```typescript
const addDirs: string[] = [bundleDir]; // always
if (repoPathValid && repoPath !== bundleDir) addDirs.push(repoPath);
```
This means the agent can read Source Context, Directives, Cognition Store etc. even if there's no git repo.

### 21.5 Preflight validation

Before acquiring the phase lock, ONYX runs profile-driven preflight checks:
```typescript
for (const field of ctx.requiredFields) {
  const val = String(ovFrontmatter[field] ?? '').trim();
  if (!val) fatal(`Missing required field "${field}" (profile: ${ctx.profileName})`);
  if (field === 'repo_path' && !fs.existsSync(val)) fatal(`repo_path does not exist: ${val}`);
}
```
For engineering: `repo_path` + `test_command` must be present. For content: `voice_profile` + `pipeline_stage`. For experimenter: `hypothesis` + `success_metric` + `baseline_value`. Missing any → phase does not run.

---

## 19. Knowledge Compounding & Experimenter Loop

### 22.1 Knowledge.md as compounding memory

Every agent reads `Knowledge.md` before starting its phase. The knowledge document accumulates across phases — what P1 discovered, P5 builds on. This is the primary mechanism by which a project gets smarter over time without human re-briefing.

**Pattern for maximum value:**
- Every phase should have a task: `- [ ] Append learnings to Knowledge.md`
- Use the `knowledge-keeper` directive on a post-phase to maintain Knowledge.md as a structured wiki rather than a flat append-log
- The knowledge-keeper detects contradictions, cross-references topics, and maintains an index — making Knowledge.md actually queryable by future agents

### 22.2 The experimenter loop (ASI-Evolve pattern)

The `experimenter` profile implements a four-phase LEARN → DESIGN → EXPERIMENT → ANALYZE cycle inspired by ASI-Evolve's autonomous research loop.

**Core insight:** every trial must be recorded in full (hypothesis, config, raw result, analysis) so future agents never re-discover what's already been found. Negative results are equally important as positive ones.

**Two persistent artifacts:**

**Cognition Store** (`Project - Cognition Store.md`) — LLM-maintained structured knowledge base. Sections: What works / What doesn't work / Open hypotheses / Heuristics. The experimenter-analyzer directive maintains this. The experimenter-researcher reads it to avoid re-testing known territory.

**Experiment Log** (`Project - Experiment Log.md`) — append-only full trial history. Each entry records: hypothesis, expected, actual, delta, configuration, raw output, anomalies, transferable lesson. Never edited — only appended.

**Cycle:**
```
P1: Bootstrap     → measure baseline, seed Cognition Store open hypotheses
P2: LEARN         → researcher reads Cognition Store + Experiment Log, maps landscape, ranks candidates
P3: DESIGN        → researcher picks best candidate, writes precise experiment spec
P4: EXPERIMENT    → engineer executes spec exactly, records Trial T[n] to Experiment Log
P5: ANALYZE       → analyzer explains delta, extracts lesson, updates Cognition Store, proposes P6
P6: LEARN (cycle 2) → researcher reads updated Cognition Store, selects next candidate
...
```

**Cold-start elimination:** The Cognition Store means cycle 5's researcher starts with everything cycles 1–4 discovered. Learning compounds across cycles, not just within a cycle.

### 22.3 Cross-project knowledge

[[08 - System/Cross-Project Knowledge.md|Cross-Project Knowledge]] captures findings that apply across all projects. Update it when you discover something general — architecture patterns, API behaviors, model capabilities, workflow improvements. This is the system-level Cognition Store.

---

## 20. Phase Scheduling & Control

### 23.1 Phase selection

`discoverReadyPhases()` (`src/vault/discover.ts`) finds all `phase-ready` phases and sorts them:

```typescript
.sort((a, b) => {
  // 1. priority (0–10, default 5) — higher runs first
  const pa = Number(a.frontmatter['priority'] ?? 5);
  const pb = Number(b.frontmatter['priority'] ?? 5);
  if (pa !== pb) return pb - pa;
  // 2. risk (high first)
  const riskOrder = { high: 0, medium: 1, low: 2 };
  // 3. phase_number (ascending)
});
```

**Control knobs available from the vault (no code changes):**

| Frontmatter field | Effect | Example |
|---|---|---|
| `priority: 9` | Runs this phase before priority-5 phases | Urgent fix |
| `priority: 1` | Only runs when nothing more important is ready | Background cleanup |
| `risk: high` | Tiebreaker: runs before medium/low risk phases | Default for critical work |
| `depends_on: [2, 3]` | Won't run until P2 and P3 are completed | Dependency ordering |
| `complexity: heavy` | Routes to Opus model | Architecture decisions |
| `complexity: light` | Routes to Haiku model | Docs, config |

### 23.2 Dependency resolution

`dependenciesMet()` checks `depends_on` by scanning all phases in the same project:
```typescript
const deps = Array.isArray(fm['depends_on']) ? fm['depends_on'] : [fm['depends_on']];
return deps.every(dep => {
  const depNum = Number(dep);
  const depPhase = projectPhases.find(p => phaseNumber(p) === depNum);
  return !depPhase || stateFromFrontmatter(depPhase.frontmatter) === 'completed';
});
```
A phase with `depends_on: [1, 2]` won't appear in the ready queue until P1 and P2 are both `completed`.

### 23.3 Lock management

Lock fields in phase frontmatter: `locked_by`, `locked_at`, `lock_pid`, `lock_hostname`, `lock_ttl_ms`.

Lock TTL: 5 minutes default. If the agent process dies, the healer detects the stale lock and resets the phase to `phase-ready` on next run.

To manually unlock: `onyx reset "Project"` or `onyx heal`.

### 23.4 `onyx explain` — system transparency

`onyx explain [project]` is a pure vault read (no LLM) that produces plain English output about project state:
- Profile + required fields
- Active phase + directive currently injected + acceptance criteria
- Queued phases with priority and auto-wired directive
- Blocked phases with resolution hint
- Knowledge.md summary + Cognition Store / Experiment Log state

This is the primary debugging tool. Before running `onyx run`, run `onyx explain` to confirm state is what you expect.

---

## 21. CLI Reference

All 22 commands as of 2026-04-14:

### Visibility
```bash
onyx explain [project]          # Plain English: profile, active phase, directive, queued, blocked
onyx status [project]           # All projects + phase states (compact)
onyx logs [project] [--recent]  # Execution log
onyx doctor                     # Pre-flight: vault_root, agent driver, API keys, Claude CLI
```

### Execution
```bash
onyx run [project] [--once] [--phase N]   # Execute ready phases
onyx run --project "X" --once             # Single iteration, safest for first run
```

### Planning
```bash
onyx plan <project> [n]         # Decompose + atomise (both steps)
onyx decompose <project>        # Overview → phase stubs (backlog)
onyx atomise <project> [n]      # Phase stubs → tasks → phase-ready
```

### Bundle management
```bash
onyx init [name] [--profile <p>]         # Create new project bundle with profile picker
onyx refresh-context [project]           # Re-scan repo, update Repo Context
onyx consolidate [args]                  # Manually trigger Knowledge consolidation
onyx monthly-consolidate [args]          # Monthly summary of daily plans
```

### State management
```bash
onyx reset [project]            # Unblock → phase-ready
onyx heal                       # Fix stale locks, drift, broken links
onyx set-state <path> <state>   # Force state change (scripts/dashboard)
```

### Integrations
```bash
onyx dashboard [port]           # Web dashboard (default :7070)
onyx import <linearProjectId>   # Import Linear project as vault bundle
onyx linear-uplink [project]    # Sync vault phases to Linear
onyx capture [text]             # Quick capture to Obsidian Inbox
onyx research <topic>           # Research step → vault
onyx daily-plan [date]          # Time-blocked daily plan
```

---

## 22. Roadmap

Forward-looking work that would extend the current runtime. Each item is a concrete decision, not a commitment.

### 22.1 Missing profile files

`accounting.md` and `legal.md` are referenced in this directive and in the other System docs but no profile files exist in `08 - System/Profiles/`. Given the Finance domain is active, `accounting.md` should be written first; `legal.md` is lower priority.

### 22.2 Self-healer extensions

Current healer clears stale locks and maintains graph links. Candidates for added repairs:
- `frontmatter_drift` — detect when phase frontmatter `status` contradicts `phase_status_tag` and normalize
- `orphaned_phase` — detect phases stuck in `active` with zero outstanding tasks and transition to `completed`
- `broken_wikilink` — flag any `[[...]]` that no longer resolves

Each detector is a small function under `src/healer/`; the loop already invokes `runAllHeals` so no routing changes are needed.

### 22.3 Postcondition verification

After each routed operation, verify the claimed state change actually happened (frontmatter updated, log appended, no partial writes). A `src/verifier/` module would sit between the operation and the next iteration. Useful if we start running multiple agents in parallel.

### 22.4 Project-level routing

Today routing is purely per-phase. If project-level priorities or gating ever become important (e.g. "don't run project X until project Y's current phase is done"), that logic belongs in `src/controller/loop.ts` as a pre-filter before phase discovery — not in the per-phase router.

### 22.5 Intent classifier

A natural-language front-door (`onyx "figure out what to do next and do it"`) would need an intent classifier that maps free text to a CLI command. Low priority — the existing structured CLI is sufficient for scripted use.

### 22.6 Toward the Zero-Code Architecture

Most of the extensions above become unnecessary if we move toward the [[08 - System/ONYX - Zero-Code Architecture Vision.md|Zero-Code Architecture Vision]]. Under that model, the runtime loop is expressed as a master directive in markdown and executed by the agent itself. Verifier, classifier, and pipeline composition all collapse into prose rules.

Before investing in §22.2–§22.5, check whether the Master Directive route would absorb the same value with less code.

### 22.7 Dashboard surface parity

The Next.js dashboard (`onyx dashboard`) reads directly from the vault but doesn't yet surface every CLI operation. Adding: trigger-buttons for `heal`, `consolidate`, `refresh-context`, and a "mark ready / block" control would let the dashboard drive the runtime without a terminal.

---

*Maintained in: `08 - System/Agent Directives/ONYX Architecture Directive.md`*
*Related: [[08 - System/ONYX - Zero-Code Architecture Vision.md|Zero-Code Architecture Vision]] · [[08 - System/ONYX Master Directive.md|ONYX Master Directive]]*
