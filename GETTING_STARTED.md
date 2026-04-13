# Getting Started with ONYX

> The orchestration layer for Obsidian. Install in 10 minutes. First project running in another 5.

---

## What you're setting up

ONYX is a local CLI that runs AI agents against your projects — phase by phase, under your direction — with an Obsidian vault as the single source of truth. After setup:

- `onyx run` — executes all `phase-ready` phases autonomously
- `onyx status` — shows every project and its current state
- Obsidian — shows the live execution, logs, and accumulated knowledge

---

## Prerequisites

| Requirement | Minimum | Install |
|---|---|---|
| Node.js | 18+ | https://nodejs.org |
| npm | 8+ | comes with Node |
| Claude Code | latest | `npm install -g @anthropic-ai/claude-code` |
| Obsidian | latest | https://obsidian.md (recommended, not required for headless use) |
| OpenRouter API key | — | https://openrouter.ai |

Verify:
```bash
node --version    # v18+
npm --version     # v8+
claude --version  # installed
```

If `claude` isn't installed: `npm install -g @anthropic-ai/claude-code`, then `claude login`.

---

## Step 1 — Install

```bash
git clone https://github.com/jamalahmed2001/onyx
cd onyx
npm install
```

`npm install` triggers `postinstall` which runs `tsc`. Build output goes to `dist/`. The `onyx` binary is now available locally.

Verify:
```bash
node dist/cli/onyx.js --help | head -5
```

---

## Step 2 — Configure `.env`

```bash
cp .env.example .env
```

Edit `.env`:

```bash
ONYX_VAULT_ROOT=/absolute/path/to/your/obsidian/vault
OPENROUTER_API_KEY=sk-or-...
```

Don't have an Obsidian vault? Use the bundled starter vault:
```bash
ONYX_VAULT_ROOT=/absolute/path/to/onyx/vault
```

**Agent driver keys are not required if you're logged in:**
- Claude Code uses session auth from `claude login`
- Cursor uses your Cursor account session

---

## Step 3 — Configure `onyx.config.json`

```json
{
  "vault_root": "/absolute/path/to/your/vault",
  "agent_driver": "claude-code",
  "llm": { "model": "anthropic/claude-sonnet-4-6" },
  "model_tiers": {
    "planning": "anthropic/claude-opus-4-6",
    "light":    "anthropic/claude-haiku-4-5-20251001",
    "standard": "anthropic/claude-sonnet-4-6",
    "heavy":    "anthropic/claude-opus-4-6"
  },
  "max_iterations": 20,
  "stale_lock_threshold_ms": 300000,
  "projects_glob": "{02 - Fanvue/**,03 - Ventures/**,10 - OpenClaw/**}"
}
```

Match `vault_root` to `ONYX_VAULT_ROOT` from `.env`. The `projects_glob` defines which vault areas ONYX scans for project bundles.

---

## Step 4 — Make `onyx` global

```bash
# Option A: npm link (recommended)
npm link

# Option B: shell alias
echo 'alias onyx="node /absolute/path/to/onyx/dist/cli/onyx.js"' >> ~/.bashrc
source ~/.bashrc
```

Verify:
```bash
onyx --help
```

---

## Step 5 — Run doctor

```bash
onyx doctor
```

Every dependency gets a green ✓ or a red ✗ with the exact fix command. Fix everything red before proceeding.

Common issues:

| Error | Fix |
|---|---|
| `vault_root not set` | Set in `.env` and `onyx.config.json` |
| `claude CLI not found` | `npm install -g @anthropic-ai/claude-code` |
| `OPENROUTER_API_KEY missing` | Set in `.env` |
| `vault_root path does not exist` | Create the directory or correct the path |

---

## Step 6 — Create your first project

```bash
onyx init "My First Project"
```

Interactive prompt asks for the repo path. Enter the absolute path to the codebase you want ONYX to work on.

ONYX auto-scans `package.json`, `README.md`, and directory structure. It detects stack, extracts key areas, and creates a full bundle in your vault:

```
{Area}/My First Project/
├── My First Project - Overview.md          ← source of truth
├── My First Project - Knowledge.md         ← learnings compound here
├── My First Project - Kanban.md            ← phase state board
├── My First Project - Agent Log Hub.md     ← log index
├── My First Project - Repo Context.md      ← engineering profile doc
├── Phases/
└── Logs/
```

---

## Step 7 — Review the Overview

Open Obsidian and find `My First Project - Overview.md`.

This is the **source of truth for project direction**. Verify the auto-detected fields. Add:
- `## Scope` — what you want built
- `## Goals` — success criteria
- `## Architecture Notes` — patterns agents must follow
- `## Agent Constraints` — hard rules agents must never violate

Everything ONYX does flows from this file.

---

## Step 8 — Generate phases

```bash
onyx plan "My First Project"
```

ONYX reads your Overview and proposes 4-8 phase stubs. Each appears under `Phases/` as `P{n} - {name}.md` tagged `phase-backlog`.

Run the command again to atomise each backlog phase into tasks:

```bash
onyx plan "My First Project"
```

Each phase now has atomic tasks with files, steps, validation, and definition of done.

---

## Step 9 — Review tasks

Open each phase note in Obsidian. Under `## Tasks` you'll see checkboxes the agent will execute.

**Edit anything that looks wrong before running.** The agent treats these tasks as the contract.

When a phase looks ready, change its tag from `phase-backlog` to `phase-ready` in frontmatter.

---

## Step 10 — Execute

```bash
onyx run
```

ONYX now loops over all `phase-ready` phases, acquires locks, spawns Claude Code, runs the task loop, verifies acceptance, consolidates learnings, and moves to the next phase.

Watch the log note fill up in real time in Obsidian.

---

## What success looks like

| During execution | Obsidian shows |
|---|---|
| Lock acquired | `locked_by` + `locked_at` appear in phase frontmatter; tag flips to `phase-active` |
| Task started | New timestamped entry in log note |
| Task completed | Checkbox ticks in phase note |
| Acceptance passed | All acceptance checkboxes tick, tag flips to `phase-completed` |
| Learnings extracted | New entries in `Knowledge.md` under `## Learnings`, `## Decisions`, `## Gotchas` |

---

## Everyday commands

```bash
onyx run                                # full autonomous loop
onyx run --once                         # single pass then exit (for cron)
onyx run --project "My First Project"   # scope to one project
onyx run --dry-run                      # preview without executing
onyx status                             # all projects + states
onyx logs --recent                      # most recent execution logs
onyx heal                               # fix vault drift, stale locks
onyx reset <phase-number>               # reset blocked/active to ready
```

---

## When scope changes

Update `Overview.md` first. Add the new direction. Then:

```bash
onyx plan "My First Project" --extend
```

ONYX reads the updated Overview + existing phases + Knowledge.md and proposes 2-4 new phases aligned with the new scope.

---

## When a phase blocks

Agent writes the blocker under `## Human Requirements` and sets tag to `phase-blocked`.

You:
1. Read the blocker in Obsidian
2. Resolve it (add info, update Overview, fix environment, etc.)
3. Change tag back to `phase-ready`
4. `onyx run` again

The replanner retries 2 times automatically before blocking.

---

## Running unattended

Cron:
```bash
*/30 * * * * cd ~/clawd/onyx && onyx run --once >> /var/log/onyx.log 2>&1
```

Persistent:
```bash
onyx run   # loops until idle
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `onyx run` exits immediately | No `phase-ready` phases. Edit a phase note's tags in Obsidian |
| Phase stuck as `phase-active` | `onyx heal` — auto-clears locks older than 5 min |
| Agent failed 3x on a task | Edit task in Obsidian to be more specific, `onyx reset <n>`, rerun |
| Atomiser wrote bad tasks | Improve Overview Summary/Scope, reset to backlog, rerun `onyx plan` |
| Knowledge.md not updating | Consolidator runs automatically on `phase-completed`; check lock status |
| TypeScript build fails | `npm run build` and read errors |
| `onyx doctor` shows red | Follow the printed fix command |

---

## Next steps

- Open `./vault/` in Obsidian → read `00 - Dashboard/What is ONYX.md`
- Read `08 - System/ONYX - Summary.md` for one-page reference
- Read `08 - System/ONYX - Inner Workings.md` for the complete technical reference
- Read `08 - System/ONYX — The Orchestration Layer for Obsidian.md` for full philosophy + architecture

---

## Architecture glance

```
ONYX Core (shared)
├── phase lifecycle
├── logging
├── knowledge compounding
├── FSM
└── healing

+ Profile (engineering, content, research, operations, ...)
├── extra frontmatter keys
├── extra templates
└── verification strategy

= Bundle (your project in the vault)
```

**Core = nervous system. Profile = specialized region. Bundle = instantiated project.**

That's ONYX.
