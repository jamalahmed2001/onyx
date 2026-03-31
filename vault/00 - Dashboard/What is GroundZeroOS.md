---
tags: [system, guide, overview]
created: 2026-03-30
updated: 2026-03-30
---
## Navigation

**HUB:** [[Dashboard|Dashboard]] | **SETUP:** [[Getting Started|Getting Started]] | **RULES:** [[AGENTS|Agent Operating Rules]]

# What is GroundZeroOS?

---

## The One-Sentence Answer

GroundZeroOS is a **local, vault-native execution engine** that runs AI coding agents against your repos — phase by phase, under your direction, with the Obsidian vault as the single source of truth.

---

## The Mental Model

Think of it as a **factory floor controller**, not an AI.

You design the work. You decide what gets built and when. GZOS is the machinery that makes sure the agents do exactly what you specified, log everything they did, and stop cleanly when they need a human decision.

```
You                  → write phase notes in Obsidian
GZOS (controller)    → discovers, locks, dispatches, heals
Agent (Claude/Cursor) → executes tasks, writes code, ticks checkboxes
Vault                → records everything; is the source of truth
```

The agents are the hands. You are the mind. GZOS is the nervous system in between.

---

## What GZOS Actually Does

### 1. Discovers work
Scans all phase notes in your vault for `phase-ready`. Finds the next phase to run. Skips locked, blocked, or completed phases automatically.

### 2. Heals the vault first
Before every run, the self-healer clears stale locks, fixes tag drift, and normalises vault structure. You never need to manually untangle the state.

### 3. Assembles context
Pulls together the phase note (tasks + acceptance criteria), Repo Context (stack, key paths, constraints), the Knowledge note (accumulated learnings from prior phases), and any relevant previous log output. This assembled context becomes the agent's system prompt.

### 4. Spawns the agent
Starts Claude Code or Cursor in the repo with the full context. The agent works through each task, ticks checkboxes in the phase note, and appends structured output to the log note.

### 5. Manages completion and failure
- **All tasks ticked** → sets `phase-completed`, clears the lock, fires Linear uplink, sends notification.
- **Agent cannot proceed** → sets `phase-blocked`, writes what it needs into `## Human Requirements`, clears the lock, notifies you.

### 6. Loops
Picks up the next `phase-ready` phase and repeats until the queue is empty.

---

## What GZOS Is NOT

Getting this right prevents a lot of confusion.

| It is not this | Why this matters |
|---|---|
| **An AI assistant** | GZOS does not generate ideas, suggest tasks, or answer questions. Claude and Cursor do the AI work. GZOS is the orchestration layer beneath them. |
| **A project management tool** | GZOS does not own your roadmap. That lives in Obsidian (and optionally Linear/OpenClaw). GZOS only executes what you have already planned. |
| **An autonomous agent** | GZOS does not decide what to build. It is human-directed by design. If there is no `phase-ready` work, it idles. It never invents scope. |
| **A CI/CD pipeline** | GZOS is not triggered by git events. It is triggered by you running `gzos run`. It is not a deployment system. |
| **A cloud service** | GZOS runs on your machine. Agents run in your repos. Nothing is sent to a remote execution environment. |
| **A replacement for code review** | Agents write code; you review it. GZOS logs what was done and why, but it does not validate quality on your behalf. |
| **A database** | There is no separate datastore. The vault is the database. Frontmatter tags are the state machine. Markdown is the log. |
| **A general-purpose automation tool** | GZOS is specifically designed for software development phases — atomised, sequential, agent-driven. It is not a cron runner or workflow engine. |

---

## The Core Design Constraints

These are not limitations to be worked around. They are intentional decisions that make GZOS reliable.

**1. Vault is the only state.**
No sidecar databases, no SQLite, no Redis. If it is not in a markdown file in your vault, GZOS does not know about it. This means you can always open Obsidian and see the exact system state.

**2. Agents write to exactly two files per phase.**
The phase note (to tick tasks and update tags) and its paired log note (to record output). Agents cannot modify other vault files. This prevents agents from corrupting unrelated project state.

**3. Lock lives in frontmatter.**
`locked_by: <runId>` and `locked_at: <timestamp>` on the phase note. No lock service, no file system locks. Any lock older than 5 minutes is stale and the healer clears it. Safe for multiple controllers on the same vault (e.g., a team sharing a synced vault).

**4. Human requirements are explicit.**
When an agent is blocked, it writes exactly what it needs in a `## Human Requirements` section in the phase note. You do not need to read a log to find out why it stopped. The blocker is right there.

---

## What Good Use Looks Like

GZOS works well when:
- You write clear, scoped phase notes with explicit acceptance criteria
- Phases have 6–12 tasks, not 40
- Repo Context is accurate and up to date
- You review log notes after each phase rather than running blindly ahead
- Blocked phases get read and unblocked promptly

GZOS struggles when:
- Phase notes are vague ("improve the code")
- Tasks are not atomic (one testable change per task)
- Repo Context is missing or stale (agents lose codebase orientation)
- Multiple phases are tagged `phase-ready` with interdependencies (the executor does not enforce ordering beyond phase tags)

---

## Future Improvements

These are known gaps and planned additions. They are not in the current v0.1.0 release.

### Near-term
- **Parallel phase execution** — currently the controller runs one phase at a time per `gzos run` invocation. A concurrent mode running N phases in parallel (on N agent instances) is planned but requires conflict-safe vault writes.
- **Auto-commit after phase completion** — a git integration step that commits all changes at phase boundary with a generated commit message based on the log note summary.
- **Richer blocker surface** — when a phase is blocked, notify with a structured summary (what was done, what specifically is missing) rather than just a notification that it blocked.
- **`gzos plan` ↔ atomiser integration** — the `gzos plan` command currently ranks phases manually. It should call the atomiser for backlog phases automatically and present the result for review before you tag things `phase-ready`.

### Medium-term
- **Multi-repo phase execution** — phases that span multiple repos (e.g., an API phase and a frontend phase that are interdependent). Currently each phase assumes one repo.
- **Agent feedback loop** — after a phase completes, an automated review step that reads the log and the code diff together and surfaces any obvious gaps before the phase is marked complete.
- **Knowledge graph queries** — the Knowledge node currently accumulates learnings as a flat document. A structured format with per-topic entries would let the context assembler do targeted retrieval rather than dumping the full file into every prompt.
- **Phase template library** — canned phase templates for common patterns (API endpoint, UI component, data migration, infra provisioning) with pre-written task structures that the atomiser can refine rather than generating from scratch.

### Long-term
- **Web-based vault viewer** — a lightweight read-only web UI for the vault for teams who do not use Obsidian, showing project status, phase states, and log output without needing the desktop app.
- **Agent driver plugins** — currently Claude Code and Cursor are hardcoded drivers. A plugin interface would let any agent runtime (e.g., a local model via Ollama, or a custom agent) be plugged in against the same vault contract.
- **Policy-driven execution gates** — rules like "never run `phase-active` after midnight" or "require human review before executing phases in the `payments` domain" configured in `groundzero.config.json`.
- **Self-improving Repo Context** — after each phase, the agent appends what it learned about the repo to Repo Context automatically, keeping the context document accurate without manual maintenance.

---

## How This Differs From Other Agent Frameworks

| Framework | What it does | Key difference from GZOS |
|---|---|---|
| LangChain / LangGraph | Composable agent pipelines in Python | In-process orchestration; no vault; no human-directed phase loop |
| AutoGPT / CrewAI | Fully autonomous multi-agent | Self-directing scope; GZOS is intentionally human-directed |
| OpenHands / Devin | Cloud-hosted AI dev environments | Remote execution; GZOS runs in your local repo |
| GitHub Copilot | Inline code suggestion | Single-file, interactive; GZOS runs unattended across a codebase |
| Claude Projects | Persistent context + tools in Claude.ai | Conversation-based; GZOS is programmatic, vault-backed, logged |

GZOS's distinguishing characteristic is the combination of: **vault-native state** + **human-defined work** + **local agent execution** + **structured audit log**. None of the above frameworks offer all four together.

---

*For setup instructions: [[Getting Started|Getting Started]]*
*For the technical FSM and scoping spec: [[GroundZeroOS - Scoping (KISS)|KISS Directive]]*
*For OpenClaw portfolio integration: [[Using with OpenClaw|Using with OpenClaw]]*
