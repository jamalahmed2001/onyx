---
tags: [system, guide]
created: 2026-03-30
---
## Navigation

**HUB:** [[Dashboard|Dashboard]] | **RULES:** [[AGENTS|Agent Operating Rules]]

# Getting Started with GroundZeroOS

---

## Five-Minute Setup

These are the exact commands in order. Run them once and you are done.

```bash
# 1. Clone and install
git clone https://github.com/openclaw/groundzeroOS-starter
cd groundzeroOS-starter
npm install

# 2. Configure secrets
cp .env.example .env
# Open .env — set GROUNDZERO_VAULT_ROOT and OPENROUTER_API_KEY

# 3. Pre-flight check
gzos doctor

# 4. Create your first project
gzos init "My App"

# 5. Run
gzos run
```

`gzos doctor` will tell you exactly what is missing and how to fix it before you proceed. Do not skip it.

---

## The Vault Structure

Every project lives in `01 - Projects/` as a self-contained bundle. The bundle is a cluster of linked notes that forms a flower shape in Obsidian's graph view.

```
My App/
├── My App - Overview.md         ← main node — goal, context, current status
├── My App - Kanban.md           ← phase-level WIP view
├── My App - Agent Log Hub.md    ← links to all execution logs
├── My App - Docs Hub.md         ← links to knowledge and repo context
├── My App - Knowledge.md        ← accumulated learnings across phases
├── My App - Repo Context.md     ← stack, key areas, constraints (NEW)
├── Phases/
│   └── P1 - Phase Name.md       ← tagged phase-ready, contains tasks
└── Logs/
    └── L1 - P1 - Phase Name.md  ← append-only execution log
```

**Repo Context** is a new addition and one of the most important files. It stores the repo path, detected stack, key source directories, architecture notes, and agent constraints. Every agent task receives it as part of its system prompt automatically. See the dedicated section below.

**Phase notes** are the unit of work. They contain the task list, acceptance criteria, and any human requirements (blockers the agent discovered and cannot resolve itself).

**Log notes** are append-only event stores. The agent writes to the log during execution — never edit these manually.

**The Kanban** reflects phase states derived from frontmatter tags. It is a read view, not the source of truth.

---

## Your First Project

After running `gzos init "My App"`:

1. **Open Obsidian** and navigate to `01 - Projects/My App/`
2. **Open `My App - Repo Context.md`** — verify the auto-detected stack and key areas are accurate. Add any architecture decisions or constraints that agents must know.
3. **Open `My App - Overview.md`** — write the project goal in plain English. The atomiser uses this to generate detailed phases if you do not write them manually.
4. **Open or create a phase note** under `Phases/`. Write tasks as a checkbox list under `## Tasks`. Fill in `## Acceptance Criteria`.
5. **Set the phase ready**: add `phase-ready` to the `tags` array in the note's frontmatter.
6. Run `gzos run`.

If you have no phases yet, `gzos run` will use the atomiser to generate them from the Overview. Review and tag the generated phases `phase-ready` before running again.

---

## Running the Controller

```bash
gzos run
```

What happens internally, step by step:

1. **Heal** — the healer runs first on every `gzos run`. Clears stale locks, fixes tag drift, normalises vault structure.
2. **Discover** — scans all phase notes across all projects for the `phase-ready` tag.
3. **Lock** — writes `phase-active` + `locked_by: <runId>` + `locked_at: <timestamp>` to the phase note frontmatter.
4. **Context assembly** — reads Repo Context, phase note, Knowledge note, and any previous log output. Assembles the full agent prompt.
5. **Execute** — spawns the agent driver (Claude Code or Cursor) with the assembled context. The agent works through each unchecked task in `## Tasks`.
6. **Tick and log** — as each task completes, the agent ticks the checkbox in the phase note and appends output to the log note.
7. **Completion** — when all tasks are ticked and acceptance criteria pass: sets `phase-completed`, clears the lock, fires Linear uplink, sends WhatsApp notification.
8. **Blocked** — if the agent cannot proceed: sets `phase-blocked`, writes what it needs into `## Human Requirements`, clears the lock, notifies you.
9. **Loop** — picks up the next `phase-ready` phase and repeats.

---

## Day-to-Day Workflow

The actual loop once you are set up:

1. **Status** — `gzos status` to see what is active, ready, blocked
2. **Plan** — write or review phases in Obsidian; set `phase-ready` on what you want done
3. **Run** — `gzos run`; agents work while you do other things
4. **Review** — open the Log notes to see exactly what was done and why
5. **Unblock** — if a phase is `phase-blocked`, open its note, read `## Human Requirements`, fix it, change tag back to `phase-ready`
6. **Heal** — `gzos heal` if anything looks off in the vault (broken links, stale locks, graph drift)

That is the full loop. Most days it is just step 1, 2, 3.

---

## When Things Go Wrong

**Stale lock** — a phase is stuck as `phase-active` with no running agent.
```bash
gzos heal
```
The healer detects `locked_at` older than 5 minutes and clears the lock automatically. The phase returns to its previous state.

**Blocked phase** — the agent set `phase-blocked` and wrote a note in `## Human Requirements`.
Open the phase note. Read what the agent needs. Fix it (add a secret to `.env`, clarify the spec, make a decision). Change the tag from `phase-blocked` to `phase-ready`. Run again.

**Wrong links in the graph** — a note was moved or renamed manually and wikilinks broke.
```bash
gzos heal
```
The graph maintainer rebuilds correct nav links and removes dead ones.

**Phase ran but tasks are not ticked** — something crashed mid-execution.
Open the log note — it will show where execution stopped. Fix the underlying issue. Reset the phase tag to `phase-ready` (clear `locked_by` and `locked_at` to empty strings). Run again.

**`gzos doctor` shows red** — follow the printed fix command exactly. Common causes: vault path wrong in `.env`, `claude` CLI not installed, missing API key.

---

## Key Rules

| Rule | Detail |
|---|---|
| Vault is the source of truth | State lives in frontmatter tags and note content, nowhere else |
| Tags are the FSM | `phase-backlog` → `phase-ready` → `phase-active` → `phase-completed` |
| Lock lives in frontmatter | `locked_by: runId` + `locked_at: timestamp` on the phase note |
| Log notes are append-only | Never edit a log note manually; the agent appends, you read |
| Agents write two files only | The phase note (ticks, tag, lock) and its log note |
| Repo Context drives the prompt | Agents read it before every task; keep it accurate |
| Project status is derived | Computed from phase tag states at read time — never stored separately |

---

For team and portfolio workflows: [[Using with OpenClaw|Using with OpenClaw]]

For the full agent operating specification: [[AGENTS|Agent Operating Rules]]
