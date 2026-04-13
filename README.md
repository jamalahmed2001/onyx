# ONYX

> **The orchestration layer for Obsidian.** Turn your vault into an autonomous execution surface for AI agents — engineering, content, research, or anything else.

---

## What is ONYX?

ONYX is a CLI + vault convention that makes your Obsidian vault the **single source of truth** for project state, decisions, and execution history. A controller loop reads phase notes, dispatches AI agents (Claude Code, Cursor, or custom), writes results back to the vault, and compounds learnings in Knowledge notes.

Not a SaaS. Not a framework. A local CLI + a naming convention + a markdown state machine.

```
read vault → heal → discover → route → act → write vault → consolidate → repeat
```

---

## Why it exists

Knowledge work has no operating layer. You have:
- **Project tools** (Jira, Linear, Notion) — track work, but don't execute it
- **AI agents** (Claude, Cursor) — execute work, but forget everything between sessions
- **Knowledge bases** (Obsidian, wikis) — store facts, but don't do anything

ONYX is the thinnest possible layer that connects all three. Plans live in the vault. Agents read the plans, do the work, write results back. Knowledge compounds automatically.

---

## The three ideas

**1. The vault is the only state.** Phase tags are the FSM. Frontmatter fields are the lock. Log notes are the audit trail. No external databases, no sidecar files, no SaaS dependencies. If it's not in the vault, ONYX doesn't know about it.

**2. The phase is sacred.** Every project — code, content, research, ops — decomposes into phases: the smallest reviewable execution unit with explicit goals, tasks, acceptance criteria, and a linked log. Same structure everywhere.

**3. Profiles specialize without fragmenting.** One execution model. Different domains add extra frontmatter keys and verification strategies. Engineering adds `repo_path` and test commands. Content adds `voice_profile` and safety rules. Research adds citation requirements. The core phase lifecycle never changes.

---

## What you get

| Capability | Mechanism |
|---|---|
| **Autonomous phase execution** | `onyx run` loops over all `phase-ready` phases, spawns agents, verifies acceptance |
| **Safe multi-project coordination** | Per-phase locks prevent collisions across agents and projects |
| **Compounding knowledge** | Consolidator extracts learnings/decisions/gotchas after every completed phase |
| **Self-healing vault** | `onyx heal` fixes stale locks, normalizes drift, repairs broken links |
| **Observable by default** | Everything visible in Obsidian — no special tooling required |
| **Agent-agnostic** | Swap Claude Code for Cursor for a custom binary. Vault doesn't care |

---

## Quick start

```bash
git clone https://github.com/jamalahmed2001/onyx
cd onyx
npm install                       # builds automatically via postinstall
cp .env.example .env              # set ONYX_VAULT_ROOT + OPENROUTER_API_KEY
onyx doctor                       # verify every dependency
onyx init "My First Project"      # create a bundle in your vault
onyx run                          # execute phase-ready phases
```

Full setup: [`GETTING_STARTED.md`](./GETTING_STARTED.md)

---

## Core concepts

- **Project bundle** — a folder in your vault with `Overview`, `Knowledge`, `Kanban`, `Agent Log Hub`, `Phases/`, `Logs/`, `Docs/`
- **Phase** — the smallest reviewable execution unit with goals, tasks, acceptance criteria, and a linked log
- **Log note** — append-only timestamped record of phase execution
- **Knowledge note** — accumulated learnings, decisions, and gotchas (the compounding layer)
- **Profile** — a string field on Overview (`engineering`, `content`, `research`, ...) that selects extra frontmatter keys, templates, and verification strategy

---

## Lifecycle (the FSM)

```
backlog → planning → ready → active → completed
                                ↘ blocked → planning
```

- `backlog` — phase exists, no tasks yet
- `planning` — atomiser generating task plan (transient)
- `ready` — approved for execution; `onyx run` picks these up
- `active` — agent holds the lock, executing
- `completed` — all acceptance criteria passed; learnings consolidated
- `blocked` — agent hit a blocker; `## Human Requirements` written

---

## Example use cases

**Software engineering.** Profile: `engineering`. Agent builds features phase by phase, runs tests as verification. Knowledge accumulates architecture decisions.

**Content production.** Profile: `content`. Agent follows a pipeline (research → script → audio → video → publish), enforces voice and safety rules. Knowledge accumulates audience insights.

**Research & synthesis.** Profile: `research`. Agent gathers sources under explicit constraints, declares confidence gaps, produces structured memos. Knowledge accumulates methodology improvements.

**Operations & monitoring.** Profile: `operations`. Agent follows runbooks, documents incidents, escalates when needed. Knowledge accumulates operational patterns.

**Long-running specialized agents.** Early phases use generic agents to build a project-specific CLI tool. Later phases use that CLI as the agent. The vault is the shared memory between the generic phase and the specialized phase.

---

## Commands

| Command | What it does |
|---|---|
| `onyx run` | Autonomous loop — heal, discover, route, execute, consolidate |
| `onyx run --once` | Single iteration then exit (for cron) |
| `onyx run --project <name>` | Scope to one project |
| `onyx plan <project>` | Create phases from Overview, or atomise backlog phases |
| `onyx plan <project> --extend` | Add new phases based on current scope |
| `onyx init <name>` | Create a new project bundle |
| `onyx status` | Show all projects, phases, states |
| `onyx heal` | Fix stale locks, drift, broken links |
| `onyx doctor` | Pre-flight dependency check |
| `onyx consolidate` | Archive completed phases, extract learnings |
| `onyx logs [phase]` | Show execution logs |

---

## Configuration

Two files:
- **`.env`** — secrets (`OPENROUTER_API_KEY`, `ONYX_VAULT_ROOT`)
- **`onyx.config.json`** — behavior (`agent_driver`, `model_tiers`, `projects_glob`)

See [`GETTING_STARTED.md`](./GETTING_STARTED.md) for details.

---

## Architecture (three layers)

```
┌─────────────────────────────────────────────────────┐
│                   ONYX Core                          │
│  Shared: phase lifecycle, logging, knowledge, FSM,   │
│  healing, discovery, consolidation                   │
└─────────────────────────────────────────────────────┘
               ▲               ▲              ▲
      ┌────────┴────┐  ┌───────┴────┐  ┌──────┴─────┐
      │ Engineering │  │  Content   │  │  Research  │
      │  Profile    │  │  Profile   │  │  Profile   │
      └────────┬────┘  └───────┬────┘  └──────┬─────┘
               ▼               ▼              ▼
       ┌──────────┐     ┌──────────┐   ┌──────────┐
       │ Bundles  │     │ Bundles  │   │ Bundles  │
       │(projects)│     │(projects)│   │(projects)│
       └──────────┘     └──────────┘   └──────────┘
```

- **Core** — shared execution model; never changes across domains
- **Profile** — named extension: extra frontmatter keys + templates + verification
- **Bundle** — instantiated project folder in the vault

---

## First principles

1. **Vault is the only state.** If it's not in the vault, it didn't happen.
2. **Phase is sacred.** Smallest reviewable execution unit. No profile redefines it.
3. **Profiles are thin.** Extra fields, extra templates, extra verification. Nothing more.
4. **Knowledge compounds.** Every completed phase teaches the next one.
5. **Agents are disposable.** Swap the driver; the vault doesn't care.
6. **Human in the loop.** Blocked phases surface requirements. The system asks instead of guessing.
7. **Observable by default.** Everything visible in Obsidian.
8. **Convention over configuration.** Name things right, the system finds them.
9. **Domain agnostic.** Engineering is not special. The execution model is universal.
10. **Least mechanism.** A string in frontmatter beats a profile service. A markdown file beats a database table.

---

## Documentation

- **[`GETTING_STARTED.md`](./GETTING_STARTED.md)** — step-by-step setup + first project
- **[`CLAUDE.md`](./CLAUDE.md)** — setup instructions for an AI agent doing the install
- **Bundled vault** — open `./vault/` in Obsidian for the full interactive documentation
  - `00 - Dashboard/What is ONYX.md` — intro
  - `00 - Dashboard/Getting Started.md` — first project walkthrough
  - `08 - System/ONYX - Summary.md` — one-page reference
  - `08 - System/ONYX - Inner Workings.md` — complete technical reference
  - `08 - System/ONYX — The Orchestration Layer for Obsidian.md` — philosophy + architecture

---

## License

MIT

---

**ONYX Core = the nervous system. Profiles = specialized regions. Bundles = instantiated functional structures.**
