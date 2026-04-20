---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: onyx-controller
version: 3.1.0
source_skill_path: ~/clawd/skills/onyx-controller/SKILL.md
updated: 2026-03-25
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# onyx-controller

> Top-level orchestrator that links Placement, Sync, Atomiser, Planner/Replanner, Executor, Consolidate, and Notify via handleMessage.

# ONYX Controller Skill

> Top-level orchestrator for the ONYX pipeline. It composes directive-aligned flows while preserving the Observer Directive distinction between **direct flows** and **controller-composed flows**.

## Role & Responsibilities

- **Classify** incoming text into `status`, `project`, `task`, or `action` intent.
- **Resolve mode** into one of:
  - `status`
  - `plan-phase`
  - `replan-phase`
  - `execute-phase`
  - implicit placement-only / full autonomous flow
- **Orchestrate** Placement → Sync → Atomiser → Planner/Replanner → Executor → Consolidate → Notify where appropriate.
- **Return** a structured `ControllerResult`.
- **Never** write vault files directly — all vault IO via Vault Skill.
- **Never** spawn agents directly — all agent spawning via Cursor Spawn / execution helpers.

## API

```ts
import { handleMessage, classifyIntent, ControllerMode, ControllerResult, ClassifiedIntent } from '~/clawd/src/onyx/controller.ts';

export type ControllerMode = 'auto' | 'status' | 'plan-phase' | 'replan-phase' | 'execute-phase';

export interface ClassifiedIntent {
  kind: 'status' | 'project' | 'task' | 'action';
  projectId?: string;
  phaseNumber?: number;
  executeRequested: boolean;
  replanRequested?: boolean;
}

export interface ControllerResult {
  actionsTaken: string[];
  projectsTouched: string[];
  phasesExecuted: { projectId: string; phaseNumber: number }[];
  messagesForJamal: string[];
}
```

## Intent classification

### Signals

| Signal group | Examples | Effect |
|---|---|---|
| STATUS | `status`, `health`, `check on`, `progress on` | status intent |
| SYNC | `sync`, `check` without execute signals | status intent |
| PLAN | `plan phase N` | `plan-phase` |
| REPLAN | `replan phase N`, `refresh plan`, `rewrite plan` | `replan-phase` + `forceReplan` |
| EXECUTE | `run phase N`, `execute phase N`, `kick off` | execute intent |
| BUILD | `build`, `implement`, `deploy` | execute/full-flow intent |
| TASK | `fix`, `refactor`, `improve`, `add task` | task placement or execute |

## Observer Directive alignment

### 1. Status / Sync request
Controller flow:
- Sync/status only
- Notify

### 2. Placement-only request
Controller flow:
- Placement only
- Notify

### 3. Plan phase request
Controller flow:
- Placement
- Resolve exact phase when possible
- Plan that phase only
- Notify

### 4. Replan phase request
Controller flow:
- Placement
- Resolve exact phase when possible
- Force overwrite of existing implementation plan for that phase
- Notify

### 5. Execute phase request
Controller flow:
1. Placement
2. Sync
3. Resolve exact phase
4. If executable task exists → Execute that phase
5. If no executable task exists → Plan that phase only → Execute it
6. Notify

### 6. Fanvue import-linear pipeline
Controller flow:
1. Linear fetch (Fanvue snapshot via `getFanvueImportSnapshot()`)
2. Project Placement (ensure bundle `Fanvue/<Project>` exists in vault)
3. Unified project atomiser (Fanvue-aware, structured Linear issue input → 4 canonical phases)
4. Phase Planner (runs immediately after atomiser with `forceReplan: true`)
5. Linear uplink / Notify

The `bundleProjectId` (e.g. `Fanvue/Creator Agent Eval Suite`) is threaded through the entire chain so the vault bundle — not the Linear UUID — is used for all vault reads/writes.

### 7. Full autonomous pipeline
Controller flow:
- Placement → Sync → Atomiser → Planner → Executor → Consolidate → Notify

This is composed mode, not the default for every request.

## Pipeline behaviour

### Status-only
- Calls `getStatus(projectId, vaultRoot)`
- No vault mutation beyond status-side sync helpers
- Notifies with `info`

### Placement-only
- Calls `placeIntent(...)`
- Does not atomise/plan/execute
- Notifies with `info`

### Plan-phase
- Resolves exact phase when a phase number exists
- Calls `planProject(projectId, phaseRel)`
- Skips execution
- Notifies with `info`

### Replan-phase
- Resolves exact phase when a phase number exists
- Calls `planProject(projectId, phaseRel, vaultRoot, { forceReplan: true })`
- Overwrites existing implementation plan blocks for that phase
- Skips execution
- Notifies with `info`

### Execute-phase
- Never broadens to whole-project planning unless explicitly in autonomous/full mode
- If requested phase has no executable task, planner runs for that exact phase only, then execution continues
- Notifies with `complete`, `blocked`, or `info` based on outcome

## How sub-skills/helpers are called

| Sub-skill / helper | Call site | Status |
|-----------|-----------|--------|
| Fanvue snapshot (profile) | `getFanvueImportSnapshot()` from `skills/FanvueProjectSync/scripts/fanvue-component.js` | ✅ for Fanvue projects (snapshot-only) |
| Fanvue import flow | Fanvue snapshot → Project Placement → Unified project atomiser → Phase Planner | ✅
| Project Placement | `placeIntent()` from `projectPlacement.ts` | ✅ |
| Project Sync | `getStatus()` / `sync()` from `projectSync.ts` | ✅ |
| Project Atomiser | `runAtomiserForProject()` | ✅ |
| Phase Planner | `planProject(..., { forceReplan })` | ✅ |
| Phase Executor | `runExecutorOnce()` / `runExecutorForPhase()` | ✅ |
| Consolidate | `vault-consolidator.cjs` wrapper | ✅ partial |
| Notify | `notify-phase.sh` via `runNotifyStep()` | ✅ |

## Direct-call surface

The directive wants clean isolated flows. The controller now aligns with these conceptual direct operations:

- `place`
- `sync`
- `atomise`
- `plan-phase`
- `replan-phase`
- `execute-phase`
- `consolidate`
- `notify`

The controller is the composed orchestrator over that surface, not a replacement for it.

## CLI examples

```bash
# Status
pnpm onyx:controller -- --text "status of openclaw-backup" --project-id openclaw-backup --mode status

# Plan exact phase
pnpm onyx:controller -- --text "plan phase 2 for almani" --project-id almani --mode plan-phase

# Replan exact phase
pnpm onyx:controller -- --text "replan phase 2 for almani" --project-id almani --mode replan-phase

# Execute exact phase
pnpm onyx:controller -- --text "run phase 2 for almani" --project-id almani --mode execute-phase
```

## Constraints

- No direct `fs` writes to OnyxVault.
- Notify must be treated as a first-class flow, not a TODO string builder.
- Replanning must be explicit and destructive only to the implementation-plan block, not the rest of the phase note.
- Execute-phase must stay phase-scoped when the user asks for an exact phase.
- Runtime and skill docs must stay in sync with the Observer Directive.
