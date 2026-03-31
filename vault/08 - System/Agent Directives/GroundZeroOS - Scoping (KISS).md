---
tags: [system, groundzeroos, directive, status-active]
graph_domain: system
created: 2026-03-30
updated: 2026-03-30
status: active
version: 1.0
up: Agent Directives Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Directives/Agent Directives Hub.md|Agent Directives Hub]]

# GroundZeroOS — Scoping (KISS)

GroundZeroOS is a **minimal**, directive-driven way to keep an Obsidian vault in a shape where agents can reliably:
- discover executable work (phase nodes)
- plan + atomize tasks against a real codebase
- execute tasks and **append full outputs** to log nodes
- keep vault structure consistent over time via maintenance skills

**Vault = source of truth.** State lives in Obsidian frontmatter + directory structure + markdown checkboxes.

> **v1.0 note:** This version incorporates learnings from shipping the TypeScript implementation. Additions are strictly additive — each one exists because a concrete failure mode proved it necessary. Where v0.1 deferred things (concurrency, FSM, lock semantics), v1.0 closes them vault-natively.

---

## How It All Works (Big Picture)

The entire system is one loop: **read vault → heal → route → act → write vault → repeat**.
Agents don't coordinate with each other. They coordinate through the vault.

```mermaid
flowchart TD
    Human([👤 Human\nintent / new project]) -->|triggers| Controller

    Controller --> Heal["🩹 Self-Healer\nclear stale locks\nfix drift"]
    Heal --> Discover["🔍 Discover\nscan vault for\nphase-ready / phase-active"]

    Discover --> NoWork{work\nfound?}
    NoWork -->|no| Idle([💤 Idle\nnotify human])

    NoWork -->|yes| Route{phase\nstate?}

    Route -->|backlog| Atomise["⚛️ P2 Atomiser\nexpand into\n6–12 atomic tasks"]
    Route -->|ready| Execute["⚙️ E1 Executor\nacquire lock\nrun task loop"]
    Route -->|blocked| Surface["🚨 Surface to human\nor M3 Safe Repair"]
    Route -->|completed| Consolidate["📚 P3 Consolidator\nwrite learnings\nto Knowledge.md"]

    Atomise -->|sets phase-ready| Vault
    Execute -->|ticks tasks + appends log| Vault
    Surface -->|sets phase-ready| Vault
    Consolidate -->|appends Knowledge| Vault

    Vault[(🗄️ Vault\nmarkdown files)] --> Guard{iteration\nlimit hit?}
    Guard -->|no| Discover
    Guard -->|yes| Halt([🛑 Halt\nnotify human])

    style Vault fill:#2d4a2d,color:#fff,stroke:#5a9a5a
    style Human fill:#1a3a5c,color:#fff,stroke:#4a8ab5
    style Idle fill:#3a3a1a,color:#fff,stroke:#8a8a1a
    style Halt fill:#5c1a1a,color:#fff,stroke:#b54a4a
```

**Three rules that make this simple:**
1. The vault is the only state. No sidecar files.
2. Agents can only write to their own phase note and its log note.
3. `phase-active` tag + `locked_by` field = that phase is taken. No lock service needed.

---

## 1) Design Principles

### 1.1 Keep It Simple
- Prefer **conventions** over frameworks.
- Prefer **Obsidian-native** features (frontmatter, tags, links, folders).
- **Avoid parallel state systems.** One source of truth: the vault.

### 1.2 Vault Is the Database
- No Orchestrator.json as authority.
- No separate lock files. **The phase note is the lock.**
- No separate event store. **The log note is the event store.**
- Execution reads from the vault and writes back to the vault.
- If you need to know whether something is in-flight, read the vault.

### 1.3 Structure Is Portable
- Backlinks/navigation should be derivable from **directory placement**.
- A project folder can move; links can be rebuilt by maintenance.

### 1.4 Opt-in Enforcement
Only enforce GroundZeroOS rules for notes that are explicitly part of the execution system:
- either by **tags**
- or by explicit frontmatter fields

Everything else in the vault remains structural or notes docs etc.

### 1.5 Code Enforces, Vault Defines (learned)
TypeScript/code may validate and enforce the rules described here.
But the vault document is the authoritative spec — not the code.
If code and vault diverge on what a state means, the vault wins.

---

## 2) Interfaces (Execution Surfaces)

GroundZeroOS must be operable from:
- **Claude Code** (coding execution)
- **Cursor** (coding execution)
- **Web dashboard** (visibility + quick actions)
- **OpenClaw** (controller/routing surface)

All interfaces must use the same underlying contract: **phase nodes** + **logs** in the vault.
A minimal CLI can unify all modes — the interface is thin, the vault contract is the substance.

```mermaid
graph LR
    CC["⌨️ Claude Code"] --> Vault
    CU["⌨️ Cursor"] --> Vault
    WD["🌐 Web Dashboard"] --> Vault
    OC["🤖 OpenClaw CLI"] --> Vault
    Vault[(🗄️ Vault)] --> CC
    Vault --> CU
    Vault --> WD
    Vault --> OC

    style Vault fill:#2d4a2d,color:#fff,stroke:#5a9a5a
```

The vault is the bus. Interfaces are thin readers/writers — they don't hold state. the vault is the state machine 

---

## 3) Storage

### 3.1 Primary storage
- **Obsidian vault markdown files** (the only source of truth)

### 3.2 Link strategy
- Structure/backlinks are derived from **folder hierarchy**.
- Maintenance skill can rebuild nav and standard links after moves.

### 3.3 No parallel stores (learned)
The following are anti-patterns learned from the v0.1 implementation and must not be re-introduced:
- Separate `.lock.json` files outside the vault
- Separate orchestration event logs (`.jsonl` files) outside the vault
- TypeScript FSM state that is not immediately derived from vault frontmatter
- Agent/cursor session files as durable state (ephemeral only)

If you feel the need for one of these, the correct answer is: put it in the vault as a frontmatter field or a log note entry.

---

## 4) Vault Top-Level Subroots

Top-level folders are subroots anchored to the central dashboard node.

Example set (names can vary; concept must hold):
- Dashboard
- Life
- Fanvue
- Ventures
- Planning
- Finance
- System
- Archive
- Openclaw

---

## 5) Execution Bundle (Project Folder Contract)

A project that is executable by agents is represented as a **project bundle folder**.

### 5.1 Bundle layout

```
<Project>/
  <Project> - Overview.md
  <Project> - Knowledge.md
  <Project> - Kanban.md
  Phases/
    P1 - <Phase Name>.md
    P2 - <Phase Name>.md
  Logs/
    L1 - P1 - <Phase Name>.md
    L2 - P2 - <Phase Name>.md
  Docs/
    D1 - <Context>.md
    D2 - <Context>.md
```

```mermaid
graph TD
    Bundle["📁 My Project"] --> OV["📄 Overview.md\nhuman anchor · scope · iterations"]
    Bundle --> KN["📄 Knowledge.md\ndecisions · gotchas · doc links"]
    Bundle --> KB["📄 Kanban.md\nWIP visibility"]
    Bundle --> PH["📁 Phases/"]
    Bundle --> LG["📁 Logs/"]
    Bundle --> DC["📁 Docs/"]

    PH --> P1["📄 P1 - Setup.md\ntags: phase-ready\nlocked_by: ‹empty›"]
    PH --> P2["📄 P2 - Build.md\ntags: phase-backlog"]
    PH --> P3["📄 P3 - Ship.md\ntags: phase-backlog"]

    LG --> L1["📄 L1 - P1 - Setup.md\nappend-only event store"]
    LG --> L2["📄 L2 - P2 - Build.md"]

    DC --> D1["📄 D1 - API Design.md"]

    P1 -. "[[Log link]]" .-> L1
    P2 -. "[[Log link]]" .-> L2

    style Bundle fill:#1a3a5c,color:#fff,stroke:#4a8ab5
    style P1 fill:#2d4a2d,color:#fff,stroke:#5a9a5a
    style L1 fill:#2d4a2d,color:#fff,stroke:#5a9a5a
```

### 5.2 Bundle semantics
- **Overview**: inbox + scope + iterations. The human anchor.
- **Knowledge**: map of links to Docs + key learnings + decisions.
- **Kanban**: WIP visibility (not necessarily the executor source).
- **Phases/**: phase nodes with tasks + acceptance criteria.
- **Logs/**: append-only logs; stores agent outputs per phase.
- **Docs/**: deeper design/context docs (optional; linked from Knowledge).

### 5.3 Execution write rules (hard)
During execution, the agent may write only:
- the target Phase note (checkbox ticks, blockers, state tag, lock fields)
- the target Phase log note (append full output)

Agents do **not** free-write across the vault as part of execution.

---

## 6) Phase Node Contract

### 6.1 Phase structure (canonical sections)
Each phase note must contain:
- **Overview** (what this phase is)
- **Human Requirements** (secrets, env setup, approvals, anything agent cannot do)
- **Task List** (atomic, isolated, parallelisable; grounded in codebase)
- **Acceptance Criteria** (verifiable checks)
- **Blockers**
- **Log** (link to the phase log note in Logs/)

### 6.2 State model — tags are the FSM (canonical)

Tags are the **primary FSM**. The state tag is the single source of truth for what a phase is doing.

```mermaid
stateDiagram-v2
    direction LR
    [*] --> backlog : human creates phase
    backlog --> planning : atomiser starts
    backlog --> ready : already atomised
    planning --> ready : atomiser done
    planning --> backlog : atomiser failed
    ready --> active : executor acquires lock
    ready --> planning : replan requested
    active --> completed : all tasks ✓ + acceptance ✓
    active --> blocked : blocker detected
    blocked --> active : blocker cleared
    blocked --> planning : replan required
    completed --> planning : regression / reopen
    completed --> [*]

    note right of active
        locked_by: runId
        locked_at: timestamp
    end note
```

#### Required tags
- `project-phase` (marks this as an execution note)
- Exactly one state tag from the set below

#### Phase state tags and their semantics

| Tag | Meaning | Who sets it |
|---|---|---|
| `phase-backlog` | Exists but not yet scheduled | Human or planner |
| `phase-planning` | Atomiser is currently expanding this phase | Atomiser on start |
| `phase-ready` | Tasks atomised, ready to execute | Atomiser on complete |
| `phase-active` | Executor has claimed this phase and is running it | Executor on start |
| `phase-blocked` | Execution halted, needs human or replan | Executor on block |
| `phase-completed` | All tasks done, acceptance criteria met | Executor on finish |

#### Discovery rule (how agents find work)
```
tags include "project-phase"
AND tags include one of: "phase-ready" OR "phase-active"
```
`phase-active` is included so orphaned/stale executions can be detected and healed.

### 6.3 Minimal frontmatter

```yaml
---
tags: [project-phase, phase-active, fanvue]
project: Creator Agent Eval Suite
phase_number: 1
phase_name: Setup + Baseline
status: active
locked_by: run_20260330_143022_abc
locked_at: 2026-03-30T14:30:22Z
linear_identifier: FAN-123
linear_project: Creator Agent Eval Suite
---
```

`status` is a human-readable mirror of the tag (tags win on conflict). `locked_by` and `locked_at` are the vault-native lock (see §9). Both are empty string when not in-flight.

### 6.4 Logging link rule (KISS)
```md
## Log
- [[Logs/L1 - P1 - Setup + Baseline.md]]
```

---

## 7) Log Node Contract

A log note is append-only and is the **sole event store for a phase**.

### 7.1 Purpose
- Store **complete agent output** (what changed, diffs summary, commands run, tests, blockers).
- Store state transitions as timestamped entries (replaces separate orchestration log).
- Store lock acquire/release events (replaces separate lock audit trail).
- Store execution trace in plain text that the human can audit.

### 7.2 Minimal structure
```md
# L{n} — P{n} — {phase_name}

## Entries

### YYYY-MM-DD HH:MM — {runId}
**Event:** lock_acquired | task_started | task_done | state_transition | lock_released
**Task:** (if applicable)
**Result:** ...
**Files changed:** ...
**Commands / Tests:** ...
**Blockers:** ...
```

### 7.3 What goes in the log (learned)
Any event that would previously have gone to a separate `.jsonl` orchestration log goes here:
- Lock acquired / released (with runId)
- FSM state transitions (from → to + reason)
- Task start / tick / blocker
- Stale lock cleared by healer (with age)
- Acceptance criteria verified

The log note is the audit trail. There is no other audit trail.

---

## 8) Agent Roles & Skills

```mermaid
graph TD
    subgraph Maintenance["🔧 Maintenance"]
        M1["M1 Init Bundle\ncreate folder structure"]
        M2["M2 Drift Scan\ndetect issues"]
        M3["M3 Safe Repair\nfix deterministic issues"]
        M4["M4 Rebuild Links\nafter moves"]
    end

    subgraph Planning["📐 Planning"]
        P1["P1 Phase Planner\nproject → phases"]
        P2["P2 Atomiser\nphase → 6–12 atomic tasks\nsets phase-planning → phase-ready"]
        P3["P3 Consolidator\nphase complete → Knowledge.md"]
    end

    subgraph Execution["⚙️ Execution"]
        E1["E1 Phase Executor\nacquire lock\ntask loop\nappend log"]
        E2["E2 Reviewer\nPlaywright evidence\ntick acceptance criteria"]
    end

    Vault[(🗄️ Vault)] --> M2
    M2 -->|"violations found"| M3
    M3 -->|"repairs"| Vault

    Vault --> P1
    P1 -->|"creates phase notes\nphase-backlog"| Vault

    Vault --> P2
    P2 -->|"writes task list\nphase-ready"| Vault

    Vault --> E1
    E1 -->|"ticks checkboxes\nappends log\nphase-active → phase-completed"| Vault

    E1 -->|"all tasks done"| E2
    E2 -->|"ticks acceptance criteria\nappends review report"| Vault

    Vault --> P3
    P3 -->|"appends Knowledge.md"| Vault

    style Vault fill:#2d4a2d,color:#fff,stroke:#5a9a5a
```

### 8.1 Bundle / Vault Maintenance

#### (M1) Initialise Project Bundle
**Input:** project name, target subroot/domain, optional repo path
**Output:** project folder with Overview/Knowledge/Kanban + Phases/Logs/Docs folders
**Rules:** never overwrite existing content; create missing only.

#### (M2) Vault Maintenance (Drift Scan)
**Purpose:** detect issues without touching non-GZ notes.
**Checks (opt-in only):**
- Phase notes missing required tags / multiple state tags
- Missing required sections (Task List, Acceptance Criteria, Log link)
- Broken internal links inside the bundle
- Bundle missing required files
- Phase state inconsistent with checkboxes (e.g. completed tag but unchecked acceptance)
- Stale locks: `phase-active` with `locked_at` older than 5 min threshold (see §9.3)
- `locked_by` present but no `phase-active` tag (orphaned lock field)

**Output:** a report note (or console output) listing violations.

#### (M3) Vault Maintenance (Safe Repair)
**Purpose:** apply safe, deterministic fixes.
**Allowed repairs:**
- rebuild `## 🔗 Navigation` blocks
- fix missing Log link by creating log file and inserting link
- normalise tags (ensure exactly one phase state tag)
- create missing bundle files/folders
- clear stale locks: remove `locked_by`/`locked_at`, revert tag to `phase-ready`, append log entry

**Not allowed without explicit approval:**
- deleting notes
- moving project folders automatically
- rewriting human-written content beyond templated sections

#### (M4) Rebuild Links After Move
Given a moved bundle, re-derive: nav `UP` links, hub links, internal bundle links.


### 8.2 Phase Planning / Atomization / Synthesization

#### (P1) Phase Planner (Project → Phases)
**Input:** Project Overview + repo scan (optional)
**Output:** `Phases/P1..Pn` notes with objective, human requirements, task skeleton, acceptance criteria, log link.

#### (P2) Atomizer (Phase → Atomic Tasks)
**Input:** one phase note + repo context
**Output:** rewrite/insert the Task List as 6–12 atomic tasks; each with files/symbols, steps, validation command.
**Constraint:** tasks must be parallelisable where possible; avoid giant "do everything" tasks.
**Lock behaviour:** Atomizer sets `phase-planning` on start, `phase-ready` on complete.

#### (P3) Synthesizer / Consolidator
**Purpose:** after a phase completes, consolidate learnings into Knowledge + Docs.
**Output:** append to `<Project> - Knowledge.md`: decisions, gotchas, links to docs, links to phase log.


### 8.3 Execution + Review

#### (E1) Phase Executor
**Input:** a phase note
**Pre-condition:** acquire vault lock (§9) — abort if already locked by another run.
**Loop:**
1. Append `lock_acquired` entry to log note
2. Select next unchecked atomic task
3. Execute via Claude Code / Cursor
4. Tick task checkbox in phase note
5. Append full output to phase log note
6. Update blockers / phase state tag if needed
7. Loop until done or blocked

**Completion rule:** when acceptance criteria satisfied and all tasks ticked → set `phase-completed`, release lock.

#### (E2) Phase Reviewer (Playwright)
**Input:** repo + acceptance criteria
**Output:** evidence + reviewer report appended to phase log + tick verified acceptance criteria.


### 8.4 Linear Import (Optional Mode)

#### (L1) Import Linear Project → Bundle
**Input:** Linear project
**Output:** new bundle with phases seeded from epics/issues, tasks from issue checklists.
**Rule:** Linear fields optional; vault stays authoritative.

---

## 9) Vault-Native Locking (Concurrency Model)

This section closes the v0.1 open question about multi-agent concurrency. The mechanism is vault-native — no external lock files needed.

### 9.1 The lock IS the phase note

A phase is locked when:
1. Its tag is `phase-active` AND
2. Its frontmatter contains a non-empty `locked_by: <runId>` AND `locked_at: <ISO timestamp>`

There is no other lock. No `.lock.json` file. No lock directory. Reading the phase note tells you everything.

### 9.2 Lock lifecycle

```mermaid
sequenceDiagram
    participant A as Agent (runId: abc)
    participant P as Phase Note\n(Vault)
    participant L as Log Note\n(Vault)

    Note over A,L: Acquire
    A->>P: read frontmatter
    P-->>A: tags: [phase-ready], locked_by: ""
    A->>P: write phase-active\nlocked_by: abc\nlocked_at: now
    A->>L: append "lock_acquired | abc"

    Note over A,L: Execute loop
    loop each task
        A->>P: tick [ ] Task N
        A->>L: append "task_done | N | output"
    end

    Note over A,L: Release
    A->>P: write phase-completed\nlocked_by: ""\nlocked_at: ""
    A->>L: append "lock_released | abc"
```

### 9.3 Stale lock detection and healing

A lock is stale when: `phase-active` tag AND `locked_at` is older than **5 minutes** (configurable).

```mermaid
flowchart LR
    Healer["🩹 Self-Healer\n(runs at startup\n+ M2 scan)"]
    Healer -->|"find all"| Active["phase notes tagged\nphase-active"]
    Active --> Check{"locked_at\n> 5 min ago?"}
    Check -->|no| Skip["leave alone"]
    Check -->|yes| Clear["set locked_by: ''\nset locked_at: ''\nset tag → phase-ready"]
    Clear --> LogIt["append to log note:\nstale_lock_cleared\nrunId · age"]

    style Clear fill:#5c1a1a,color:#fff,stroke:#b54a4a
    style LogIt fill:#2d4a2d,color:#fff,stroke:#5a9a5a
```

The self-healer **scans phase notes, not a lock directory**. There is no lock directory.

### 9.4 Multi-agent concurrency

```mermaid
graph LR
    A1["🤖 Agent 1"] -->|"reads vault\nclaims P1 (phase-ready)"| P1["📄 P1.md\nphase-active\nlocked_by: agent1"]
    A2["🤖 Agent 2"] -->|"reads vault\nclaims P2 (phase-ready)"| P2["📄 P2.md\nphase-active\nlocked_by: agent2"]
    A2 -->|"sees P1 locked_by agent1\nskips it"| P1
    A1 -->|"sees P2 locked_by agent2\nskips it"| P2

    style P1 fill:#2d4a2d,color:#fff,stroke:#5a9a5a
    style P2 fill:#2d4a2d,color:#fff,stroke:#5a9a5a
```

Multiple agents coordinate through the vault. No central coordinator. No lock service.

---

## 10) FSM Transition Table (Canonical)

This is the authoritative FSM. Code may enforce it; this document defines it.

### 10.1 Phase transitions

```mermaid
flowchart LR
    BL([backlog]) -->|atomiser starts| PL([planning])
    BL -->|already atomised| RD([ready])
    PL -->|done| RD
    PL -->|failed| BL
    RD -->|executor locks| AC([active])
    RD -->|replan| PL
    AC -->|all done ✓| CP([completed])
    AC -->|blocker| BK([blocked])
    BK -->|cleared| AC
    BK -->|replan| PL
    CP -->|regression| PL

    style AC fill:#2d4a2d,color:#fff,stroke:#5a9a5a
    style CP fill:#1a3a5c,color:#fff,stroke:#4a8ab5
    style BK fill:#5c1a1a,color:#fff,stroke:#b54a4a
```

Illegal transitions must be refused. If code attempts a transition not listed, it is a bug.

### 10.2 Routing table (what to do given phase state)

| Phase state | Valid operations |
|---|---|
| `phase-backlog` | atomise |
| `phase-planning` | wait (atomiser in flight) |
| `phase-ready` | atomise (refine), execute |
| `phase-active` | execute, mark-blocked |
| `phase-blocked` | heal, replan |
| `phase-completed` | consolidate |

### 10.3 Project-level state — derive, don't store (learned)

Project status is **derived** from phase states at read time. Never stored as a separate field.

```mermaid
graph TD
    Phases["phase notes"] --> Derive["derive at read time"]
    Derive --> A["active\n≥1 phase is ready or active"]
    Derive --> B["blocked\n≥1 blocked, none active"]
    Derive --> C["complete\nall phases completed"]
    Derive --> D["planning\nall in backlog or planning"]
```

---

## 11) Execution Semantics (How Agents Behave)

### 11.1 The full execution loop

```mermaid
flowchart TD
    Start(["▶ controller.run()"]) --> H["🩹 heal()\nclear stale locks\nfix frontmatter drift"]
    H --> D["🔍 discover()\nquery: project-phase\nAND phase-ready OR phase-active"]
    D --> Empty{results?}
    Empty -->|none| Notify(["📣 notify human\nidle"])
    Empty -->|found| Pick["pick highest priority phase"]
    Pick --> LockCheck{"phase-active AND\nlocked_by ≠ me?"}
    LockCheck -->|yes| D
    LockCheck -->|no| Lock["write phase-active\nlocked_by · locked_at\nappend log: lock_acquired"]
    Lock --> TaskLoop["select next unchecked task"]
    TaskLoop --> Exec["execute task\n(Claude Code / Cursor)"]
    Exec --> Tick["tick ✓ in phase note\nappend full output to log"]
    Tick --> More{more\ntasks?}
    More -->|yes| TaskLoop
    More -->|no| Criteria{acceptance\ncriteria met?}
    Criteria -->|no| Block["set phase-blocked\nappend blocker to log\nrelease lock"]
    Criteria -->|yes| Complete["set phase-completed\nrelease lock\nappend log: lock_released"]
    Complete --> Consolidate["📚 P3 Consolidator\nappend Knowledge.md"]
    Consolidate --> Guard{iteration\nlimit?}
    Block --> Notify2(["📣 notify human"])
    Guard -->|under limit| D
    Guard -->|over limit| Halt(["🛑 halt + notify human"])

    style Lock fill:#2d4a2d,color:#fff,stroke:#5a9a5a
    style Complete fill:#1a3a5c,color:#fff,stroke:#4a8ab5
    style Block fill:#5c1a1a,color:#fff,stroke:#b54a4a
    style Halt fill:#5c1a1a,color:#fff,stroke:#b54a4a
```

### 11.2 Scope discipline
Only act on phase notes explicitly in the execution system. Don't touch freeform vault notes.

### 11.3 Output discipline
All execution outputs go to the phase's corresponding **log note**.
Phase note updated only for: task checkbox ticks, blockers, state tag, lock fields.

### 11.4 Iteration guard (learned)
The controller loop must have a hard iteration limit (e.g. 20 iterations per run).
Exceeding it = halt + log entry + surface to human. Never loop forever.

---

## 12) Templates (Canonical)

### 12.1 Phase Note Template

```md
---
tags: [project-phase, phase-ready, <domain>]
project: <Project Name>
phase_number: 1
phase_name: <Phase Name>
status: ready
locked_by:
locked_at:
---

## 🔗 Navigation
**UP:** [[<Project> - Overview]]

# P1 — <Phase Name>

## Overview

## Human Requirements
- (env setup, secrets, approvals, manual steps)

## Task List
- [ ] Task 1
- [ ] Task 2

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Blockers
- None

## Log
- [[Logs/L1 - P1 - <Phase Name>.md]]
```

### 12.2 Log Note Template

```md
---
tags: [phase-log, <domain>]
project: <Project Name>
phase_number: 1
phase_name: <Phase Name>
---

# L1 — P1 — <Phase Name>

## Entries

### YYYY-MM-DD HH:MM — <runId>
**Event:** lock_acquired
**RunId:** ...

---
```

---

## 13) Anti-Patterns (Learned from Implementation)

```mermaid
graph LR
    subgraph Wrong["❌ What was built (v0.1)"]
        direction TB
        V1[(Vault\ntags)] 
        L1[".lock.json\nfiles"]
        O1[".jsonl\norchestration log"]
        V1 -.->|"must stay in sync"| L1
        V1 -.->|"must stay in sync"| O1
        L1 -.->|"can drift"| V1
    end
    subgraph Right["✅ What KISS specifies (v1.0)"]
        direction TB
        V2[(Vault\nonly)]
        V2 --> FM["frontmatter:\nlocked_by · locked_at"]
        V2 --> TG["tags:\nphase state FSM"]
        V2 --> LN["log notes:\nappend-only event store"]
    end
    Wrong -->|"simplify"| Right
```

| Anti-pattern | Why it hurts | Vault-native fix |
|---|---|---|
| Separate `.lock.json` files outside the vault | Invisible in Obsidian, healer needs its own scan loop, can drift | `locked_by` + `locked_at` on the phase note — the note IS the lock |
| TypeScript FSM as primary truth | Code and vault drift; two sources of truth | Tags are primary; TypeScript validates against §10 table |
| Separate `.jsonl` orchestration event log | Third state system, invisible in vault, hard to correlate | All events appended to the phase log note |
| Project status as a stored field | Drifts from phase states, requires sync code | Derived from phase states at read time — never stored |
| Self-healer scanning a lock directory | Needs to know about a directory that shouldn't exist | Healer scans phase notes tagged `phase-active`, checks `locked_at` |
| Agent session files as durable state | Ephemeral data treated as durable, accumulates garbage | Ephemeral only; what ran is recorded in the log note |
| `status` field as independent FSM from tags | Two fields that must agree creates sync bugs | `status` is human-readable mirror; tags win on conflict |

---

## 14) Open Questions (v1.0)

Deliberately deferred — add only when a concrete failure mode proves them necessary:
- Global project registry / cross-project dependency modelling
- Automatic hub generation across the entire vault
- Phase-level parallelism within a single phase (multiple agents on different tasks in one phase)

---

## 15) Versioning

- This doc is the **v1.0** scope.
- v0.1 → v1.0 changes: §9 (vault-native locking), §10 (FSM table), §11.4 (iteration guard), §13 (anti-patterns), §3.3 (no parallel stores), §1.5 (code enforces vault defines), §10.3 (derived project state), diagrams throughout.
- Changes must be additive and justified by a concrete failure mode.
- When a new version is needed, increment `version` in frontmatter and add a note here.

---

## 16) User Flows

These flows cover every mode of use from first idea to shipped phase. Each flow is a self-contained journey — a human or agent can enter at any point.

---

### UF-1 — Project Genesis (New Project from Scratch)

> **Trigger:** Human has a new idea or initiative they want to track and execute.

```mermaid
flowchart TD
    H([👤 Human\nhas an idea]) --> Write["Write intent into\nOverview.md\n(scope, goals, why)"]
    Write --> M1["▶ M1 Init Bundle\nrun skill or CLI"]
    M1 --> Bundle["📁 Bundle created\nOverview · Knowledge · Kanban\nPhases/ · Logs/ · Docs/"]
    Bundle --> HasPhases{phases already\nknown?}
    HasPhases -->|yes, rough outline| Manual["Human adds P1..Pn stubs\ntags: phase-backlog"]
    HasPhases -->|no, let agent plan| P1["▶ P1 Phase Planner\nreads Overview + repo scan"]
    Manual --> Ready["Phases exist in vault\ntags: phase-backlog"]
    P1 --> Ready
    Ready --> Done(["✅ Project bundle live\nready for iteration scoping"])
```

**What the human writes:** Overview.md (intent, scope, why, repo path).
**What the agent creates:** all folders, all stub files, optionally the phase list.
**Vault state after:** `P1..Pn` notes exist with `phase-backlog` tag. No tasks yet.

---

### UF-2 — Iteration Scoping (Deciding What to Work on Next)

> **Trigger:** Human wants to decide which phase(s) to activate for this sprint/session.

```mermaid
flowchart TD
    H([👤 Human]) --> Review["Review Kanban.md\nor phase list in vault"]
    Review --> Pick["Pick one or more phases\nto move forward"]
    Pick --> Atomised{phase already\natomised?}

    Atomised -->|yes, tasks exist| SetReady["Set tag → phase-ready\n(human edits frontmatter\nor web dashboard action)"]
    Atomised -->|no, needs breakdown| SetAtomise["Set tag → phase-planning\nqueue for atomiser"]

    SetReady --> Live(["✅ Phase is phase-ready\ncontroller will pick it up\non next run"])
    SetAtomise --> P2["▶ P2 Atomiser\nsee UF-3"]
    P2 --> Live
```

**Key principle:** Human controls *which* phases are active. Agents control *how* they get executed.
**Vault state after:** selected phases have `phase-ready` tag. Everything else stays `phase-backlog`.

---

### UF-3 — Atomising a Phase (Phase → Atomic Tasks)

> **Trigger:** A phase exists with `phase-backlog` or `phase-ready` but tasks are not yet grounded in the codebase.

```mermaid
flowchart TD
    Start(["Phase note\ntag: phase-backlog or phase-planning"]) --> P2["▶ P2 Atomiser starts"]
    P2 --> SetPlanning["Write tag → phase-planning\nappend to log: atomiser_started"]
    SetPlanning --> Read["Read phase Overview\n+ scan repo for relevant files/symbols"]
    Read --> Draft["Draft 6–12 atomic tasks\neach with:\n· files / symbols\n· steps\n· validation command"]
    Draft --> HumanCheck{tasks look\nright?}
    HumanCheck -->|yes| Rewrite["Rewrite ## Task List\nin phase note"]
    HumanCheck -->|no, needs adjustment| Revise["Human edits tasks\nor re-runs atomiser\nwith more context"]
    Revise --> Rewrite
    Rewrite --> SetReady["Write tag → phase-ready\nappend to log: atomiser_done"]
    SetReady --> Done(["✅ Phase is phase-ready\ntasks grounded in codebase"])

    style SetReady fill:#2d4a2d,color:#fff,stroke:#5a9a5a
```

**Atomiser rules:**
- Never delete existing human-written content (Overview, Human Requirements).
- Only rewrite the `## Task List` section.
- Each task must map to a specific file path or symbol — no vague tasks.
- 6–12 tasks. If more, split into two phases.

**Vault state after:** `## Task List` populated, tag = `phase-ready`, log entry appended.

---

### UF-4 — Phase Execution (Running a Phase)

> **Trigger:** Controller finds a phase tagged `phase-ready`. Executor picks it up.

```mermaid
flowchart TD
    Find(["🔍 discover()\nfinds phase-ready note"]) --> LockCheck{"phase-active AND\nlocked_by ≠ me?"}
    LockCheck -->|taken| Skip(["skip — try next phase"])
    LockCheck -->|free| Lock["Write phase-active\nlocked_by: runId\nlocked_at: now\nAppend: lock_acquired"]

    Lock --> SelectTask["Select next unchecked task\n(top to bottom)"]
    SelectTask --> Exec["Execute task\nvia Claude Code / Cursor"]
    Exec --> Result{outcome?}

    Result -->|success| Tick["Tick ✓ in phase note\nAppend full output to log"]
    Result -->|partial / uncertain| Tick

    Tick --> More{more unchecked\ntasks?}
    More -->|yes| SelectTask

    More -->|no| Criteria{## Acceptance\nCriteria all ticked?}
    Criteria -->|yes| Complete["Write phase-completed\nlocked_by: ''\nlocked_at: ''\nAppend: lock_released"]
    Criteria -->|no — gap found| Block["Write phase-blocked\nlocked_by: ''\nlocked_at: ''\nAppend blocker detail to log"]

    Complete --> Consolidate["▶ P3 Consolidator\nsee UF-6"]
    Block --> Notify(["📣 Notify human\nsurface blocker"])

    style Lock fill:#2d4a2d,color:#fff,stroke:#5a9a5a
    style Complete fill:#1a3a5c,color:#fff,stroke:#4a8ab5
    style Block fill:#5c1a1a,color:#fff,stroke:#b54a4a
```

**What the executor touches:**
- Phase note: checkbox ticks, state tag, lock fields only.
- Log note: appends every event (lock, task output, blocker, state change).
- Nothing else in the vault.

**Vault state after (success):** tag = `phase-completed`, all tasks ticked, log is the full trace.
**Vault state after (blocked):** tag = `phase-blocked`, blocker described in log + `## Blockers` section.

---

### UF-5 — Blocked Phase Recovery

> **Trigger:** A phase is tagged `phase-blocked`. Human needs to unblock it.

```mermaid
flowchart TD
    Blocked(["Phase tagged phase-blocked"]) --> Read["Human reads\nphase note ## Blockers\n+ log note for context"]
    Read --> Decide{blocker type?}

    Decide -->|missing env / secret / access| Fix["Human takes action\n(sets env var, grants access, etc.)"]
    Decide -->|tasks are wrong / stale| Replan["▶ Replan\nHuman edits ## Task List\nor re-runs P2 Atomiser"]
    Decide -->|external dependency| Wait["Human notes in ## Blockers\nthat it is waiting on X\nleaves as phase-blocked"]
    Decide -->|design needs rethink| Scope["Human updates ## Overview\nand ## Human Requirements\nthen re-atomises"]

    Fix --> Clear["Set tag → phase-ready\nClear ## Blockers\nAppend to log: blocker_cleared"]
    Replan --> Clear
    Scope --> P2["▶ P2 Atomiser\nre-atomise with updated scope"]
    P2 --> Clear

    Clear --> Resume(["✅ Phase is phase-ready\ncontroller picks up on next run"])

    style Clear fill:#2d4a2d,color:#fff,stroke:#5a9a5a
```

**Rule:** Only humans clear blockers. Agents do not self-clear blocked phases (except stale locks, which are a different thing — see §9.3).

---

### UF-6 — Phase Consolidation (Capturing Learnings)

> **Trigger:** A phase reaches `phase-completed`. P3 Consolidator runs.

```mermaid
flowchart TD
    Done(["Phase tagged phase-completed"]) --> P3["▶ P3 Consolidator starts"]
    P3 --> ReadLog["Read the phase log note\n(full execution trace)"]
    P3 --> ReadPhase["Read the phase note\n(tasks · acceptance · blockers)"]
    ReadLog & ReadPhase --> Extract["Extract:\n· decisions made\n· gotchas encountered\n· files that matter\n· things to do differently"]
    Extract --> Append["Append to Knowledge.md\nunder ## Learnings\nwith link to phase log"]
    Extract --> Doc{durable output\nworth a Doc?}
    Doc -->|yes| CreateDoc["Create Docs/D{n} - Topic.md\nLink from Knowledge.md"]
    Doc -->|no| Skip["skip"]
    Append --> Done2(["✅ Learnings captured\nProject knowledge grows"])
    CreateDoc --> Done2
```

**What consolidation is not:** a summary of what was done (that's in the log). It's the **durable signal** — what should influence the next person or agent touching this project.

---

### UF-7 — Vault Drift Repair (Maintenance Run)

> **Trigger:** Scheduled, or human suspects something is wrong, or controller detects an issue.

```mermaid
flowchart TD
    Trigger(["M2 Drift Scan triggered"]) --> Scan["Scan all notes tagged\nproject-phase or phase-log"]
    Scan --> Issues{issues\nfound?}
    Issues -->|none| Clean(["✅ Vault is clean"])
    Issues -->|yes| List["List all violations\n(report note or console)"]
    List --> Classify{violation\ntype?}

    Classify -->|stale lock| StaleLock["locked_at > 5 min\nphase-active but no process"]
    Classify -->|orphaned lock field| OrphanLock["locked_by set but\nno phase-active tag"]
    Classify -->|tag conflict| TagConflict["multiple state tags\nor missing state tag"]
    Classify -->|missing section| MissingSection["## Task List / ## Log\nnot present"]
    Classify -->|broken link| BrokenLink["log link points to\nnon-existent file"]

    StaleLock --> M3A["M3: clear locked_by · locked_at\nset → phase-ready\nappend log: stale_lock_cleared"]
    OrphanLock --> M3B["M3: clear locked_by · locked_at"]
    TagConflict --> M3C["M3: normalise to single state tag\nbest guess from status field"]
    MissingSection --> M3D["M3: insert empty section\nwith canonical heading"]
    BrokenLink --> M3E["M3: create missing log file\nwith stub template"]

    M3A & M3B & M3C & M3D & M3E --> Report(["✅ Repairs applied\nReport written"])

    style M3A fill:#2d4a2d,color:#fff,stroke:#5a9a5a
    style M3B fill:#2d4a2d,color:#fff,stroke:#5a9a5a
    style M3C fill:#2d4a2d,color:#fff,stroke:#5a9a5a
    style M3D fill:#2d4a2d,color:#fff,stroke:#5a9a5a
    style M3E fill:#2d4a2d,color:#fff,stroke:#5a9a5a
```

**M3 never:** deletes notes, moves folders, rewrites human-written content.

---

### UF-8 — Multi-Phase Project: Full Lifecycle

> The end-to-end journey of a project from idea to completion across multiple phases.

```mermaid
flowchart LR
    subgraph Genesis["📋 Genesis"]
        G1["Human writes\nOverview.md"] --> G2["M1 Init Bundle"] --> G3["P1 creates\nP1..Pn\nphase-backlog"]
    end

    subgraph Iteration["🔁 Iteration Loop"]
        direction TB
        I1["Human scopes:\nset P{n} → phase-ready"] --> I2["P2 Atomiser:\nphase-ready tasks\ngrounded in codebase"]
        I2 --> I3["E1 Executor:\nacquire lock\ntask loop"]
        I3 --> I4{result?}
        I4 -->|"✓ complete"| I5["P3 Consolidator:\nappend Knowledge.md"]
        I4 -->|"✗ blocked"| I6["Human unblocks\nthen → phase-ready"]
        I6 --> I3
        I5 --> I7{more phases\nto do?}
        I7 -->|yes| I1
    end

    subgraph Done["🏁 Done"]
        D1["All phases\nphase-completed"] --> D2["Project derived\nstatus: complete"] --> D3["L1 Import syncs\nback to Linear\n(optional)"]
    end

    Genesis --> Iteration --> Done

    style Genesis fill:#1a1a3a,color:#fff,stroke:#4a4ab5
    style Iteration fill:#1a3a1a,color:#fff,stroke:#4ab54a
    style Done fill:#1a3a5c,color:#fff,stroke:#4a8ab5
```

---

### UF-9 — Linear Import (External Project → Bundle)

> **Trigger:** A project already exists in Linear and needs to be mirrored into the vault for execution.

```mermaid
flowchart TD
    H([👤 Human]) --> L1["▶ L1 Import\nprovide Linear project ID"]
    L1 --> Fetch["Fetch epics + issues\nfrom Linear API"]
    Fetch --> MapPhases["Map epics → Phase notes\nMap issues → task stubs\nin ## Task List"]
    MapPhases --> Create["Create bundle\nPhases/ with frontmatter:\nlinear_identifier · linear_project"]
    Create --> Flag["Mark tasks that need\nmore codebase grounding\n(≠ 'grounded in repo')"]
    Flag --> Check{needs\natomising?}
    Check -->|yes| P2["▶ P2 Atomiser\nground tasks in actual files"]
    Check -->|no, Linear tasks are specific enough| SetReady["Set tag → phase-ready"]
    P2 --> SetReady
    SetReady --> Done(["✅ Bundle live\nLinear fields preserved\nvault is authoritative"])
```

**Rule:** after import, vault is the authority. Linear becomes a display layer, not the source of truth.

---

### UF-10 — Agent Handoff (One Agent Picks Up Where Another Left Off)

> **Trigger:** A new Claude Code / Cursor session starts on a project that is mid-execution.

```mermaid
flowchart TD
    NewSession([🤖 New agent session starts]) --> ReadPhase["Read the phase note\n(frontmatter + task list)"]
    ReadPhase --> CheckLock{locked_by\nset?}

    CheckLock -->|empty| Fresh["Phase is phase-ready\nor was just released\nproceed normally"]
    CheckLock -->|my runId| Reentrant["Re-entrant — I already\nown this lock\nproceed"]
    CheckLock -->|someone else's runId| Age{locked_at\nage?}

    Age -->|"< 5 min"| Wait["Another run is live\nskip this phase\ntry another"]
    Age -->|"> 5 min"| Stale["Stale lock\nSelf-healer clears it\nphase reverts → phase-ready"]

    Fresh --> ReadLog["Read log note\nto understand what\nhas already been done"]
    Reentrant --> ReadLog
    Stale --> ReadLog

    ReadLog --> Resume(["Continue from\nnext unchecked task\nas if nothing happened"])
```

**The log note is the handoff document.** A new agent reads it and knows exactly what ran, what succeeded, and what the last state was. No separate handoff file needed.

