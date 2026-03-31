# GroundZeroOS

Local agent orchestration engine that executes AI-driven development phases in your repo, using your Obsidian vault as the source of truth.

---

## Quick Start

1. **Clone and install**
   ```bash
   git clone https://github.com/jamalahmed2001/groundzeroOS-starter
   cd groundzeroOS-starter
   npm install
   # builds automatically via postinstall
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Open `.env` and set at minimum:
   - `GROUNDZERO_VAULT_ROOT` — absolute path to your Obsidian vault (e.g. `/Users/alice/Obsidian/MyVault`)
   - `OPENROUTER_API_KEY` — your OpenRouter key for LLM calls

3. **Run the doctor**
   ```bash
   gzos doctor
   ```
   Shows a green checkmark for each dependency. For anything missing it prints the exact fix command — no guessing.

4. **Initialise your first project**
   ```bash
   gzos init "My App"
   ```
   Interactive prompt: enter the repo path. GroundZeroOS auto-scans `package.json`, `README.md`, and directory structure to detect stack and key areas. A full vault bundle is created automatically.

5. **Review the Repo Context**
   Open Obsidian and navigate to `My App - Repo Context.md`. Verify what was auto-detected. Add any architecture decisions or constraints that agents should know before touching the codebase.

6. **Set phases ready**
   Open the Kanban and phase notes in Obsidian. Write tasks as checkboxes under `## Tasks`. When a phase is ready for agents, add the tag `phase-ready` to that note's frontmatter.

7. **Run**
   ```bash
   gzos run
   ```

---

## The Mental Model

**Your vault is project memory.** Everything the system knows about a project lives in Obsidian. The files are the state — not a database, not a separate config. If you want agents to know something, it goes in the vault. If you want to understand what happened, you open the vault.

**Phases are units of work for one agent session.** A phase maps roughly to what you'd hand off to a developer for a day or two: a clear goal, a set of tasks, defined acceptance criteria. One phase → one agent run → one log.

**Tasks are individual steps within a phase.** Each task is a checkbox in the phase note. The agent works through them sequentially, ticking each one as it completes and appending to the log.

**Repo Context is what you'd tell a new developer joining the project.** It contains the repo path, tech stack, key areas of the codebase, architecture decisions, and any hard constraints the agent must not violate. Every agent task gets this as context automatically.

**The graph in Obsidian shows you exactly where everything stands.** Phase notes link to the Overview, Kanban links to phases, logs link back. You can see the whole project structure at a glance without opening a dashboard.

---

## User Flow: Solo Developer

**Morning** — see where everything is:
```bash
gzos status
```
Shows each project, its current phase, and whether it is active, blocked, or waiting.

**Planning** — write phases in Obsidian. You can do this manually (open a phase note, write tasks as checkboxes), or let `gzos run` use the atomiser to generate detailed tasks from your Overview note automatically.

**Running** — `gzos run` picks up the next `phase-ready` phase, locks it, spawns an agent (Claude Code or Cursor), and hands it the full context. Agents tick tasks, write logs, and mark the phase completed when done.

**Review** — open the Log note for the phase. It contains a timestamped record of every decision, every file touched, every tool call. If you want to know why something was done a certain way, it is in the log.

**Blocked?** — the agent writes a `## Human Requirements` section in the phase note with exactly what it needs. Fix it (add a secret, make a decision, clarify a spec), then re-run.

**Maintenance** — if the vault graph looks off or links are broken:
```bash
gzos heal
```
Runs the healer, graph maintainer, and consolidator in sequence.

---

## User Flow: Using with OpenClaw

OpenClaw is the web platform that manages your AI projects at portfolio level. GroundZeroOS is the local execution engine that actually runs agents in your repos. Together:

- **OpenClaw** handles project creation, phase planning, team visibility, the portfolio dashboard, and Linear sync.
- **GroundZeroOS** handles local agent execution, vault-native state, repo context injection, and real code changes.

**The flow:**

```
OpenClaw (web)
  → project specs + phases
    → GroundZeroOS (local vault)
      → agents execute in your repo
        → status + logs sync back
          → OpenClaw dashboard
```

**Step by step:**

1. Create a project in the OpenClaw dashboard. Define the goal, scope, and rough phases.
2. OpenClaw syncs the project to Linear (epics and issues).
3. Locally, pull it into your vault:
   ```bash
   gzos import <linear-project-id>
   ```
   This creates the full vault bundle: Overview, Kanban with phases from Linear, Repo Context, Docs Hub, Agent Log Hub.
4. Open Obsidian, fill in the Repo Context with architecture notes and constraints.
5. `gzos run` — agents execute phase by phase in your local repo.
6. After each phase, the Linear uplink fires: issue state updates in Linear, OpenClaw dashboard reflects the progress.
7. WhatsApp notification fires on every task completion and every block.

**Two other flows:**

- **Start local, sync to OpenClaw**: `gzos init` → plan in vault → `gzos run` → Linear uplink exports phases → OpenClaw imports from Linear.
- **Team project**: team lead creates project in OpenClaw, each developer runs `gzos import <project-id>` on their own machine. The vault-native lock prevents phase conflicts across machines.

---

## Phase Anatomy

A phase note looks like this:

```markdown
---
tags: [phase-ready]
locked_by: ""
locked_at: ""
---

# Phase 3 — Authentication

## Human Requirements
<!-- Agents write blockers here. Check this if a phase stalls. -->

## Tasks
- [ ] Scaffold NextAuth config
- [ ] Add GitHub OAuth provider
- [ ] Protect /dashboard route
- [ ] Write integration test for redirect flow

## Acceptance Criteria
- User can sign in with GitHub
- Unauthenticated requests to /dashboard redirect to /login
- Session persists across page refresh

## Blockers
<!-- Any known blockers before starting -->
```

**Key fields:**
- `tags` — this is the FSM. Valid values: `phase-backlog`, `phase-ready`, `phase-active`, `phase-completed`, `phase-blocked`.
- `locked_by` / `locked_at` — set by the controller when a phase starts. Prevents two agents claiming the same phase.
- `## Human Requirements` — the agent's message to you when it cannot proceed without input.
- `## Tasks` — checkbox list. The agent ticks these as it works.
- `## Acceptance Criteria` — defines done. The agent checks these before marking phase-completed.

---

## Repo Context

The Repo Context note is created automatically by `gzos init` and stored at `<Project Name> - Repo Context.md` inside the project bundle.

**What gets auto-detected:**
- Stack (from `package.json` dependencies, framework detection)
- Key source areas (from directory structure scan)
- Project name and description (from `package.json` and `README.md`)
- Repo path (absolute, used to scope agent file access)

**What you should fill in:**
- Architecture decisions that are not obvious from the code
- Constraints the agent must never violate (e.g. "never modify the auth module", "all API routes must use the existing middleware chain")
- Third-party service dependencies and their purpose
- Known landmines or legacy debt areas

**How it is used:**
Every agent task receives the Repo Context as the first item in its system prompt. Agents always know where the repo is, what the stack is, and what constraints apply — without you repeating this in every phase note.

---

## Commands Reference

| Command | What it does |
|---|---|
| `gzos doctor` | Pre-flight checks: vault path, API keys, agent driver, Linear config. Prints exact fix commands for anything missing. |
| `gzos init "Name"` | Interactive project init. Prompts for repo path, auto-scans stack, creates full vault bundle. |
| `gzos plan "<project>"` | Generate phases from an Overview note + atomise tasks. All-in-one: backlog → tasks → phase-ready. |
| `gzos plan "<project>" <n>` | Atomise a single phase by number only. |
| `gzos plan "<project>" --extend` | Add new phases to an in-progress project from an updated Overview. |
| `gzos run` | Main loop. Picks next phase-ready phase, locks it, spawns agent, runs to completion, uplinks. |
| `gzos run --project <name>` | Run only phases for a specific project. |
| `gzos run --phase <n>` | Execute a specific phase number only (auto-implies --once). |
| `gzos run --dry-run` | Preview what would run without executing anything. |
| `gzos run --once` | Single iteration then exit. |
| `gzos status` | Shows all projects, their current phase, and phase status (active / ready / blocked / completed). |
| `gzos heal` | Vault maintenance: healer + graph maintainer + consolidator. Safe to run at any time. |
| `gzos reset "<project>"` | Reset a blocked or stuck phase back to phase-ready. |
| `gzos import <id>` | Imports a project from a Linear project ID. Creates full vault bundle from Linear epics and issues. |
| `gzos logs [project]` | Show execution log for a project or phase. |
| `gzos research <topic>` | Run a research step and write findings to the vault. |
| `gzos consolidate` | Manually trigger vault consolidation (archive completed phases, merge docs). |
| `gzos refresh-context "<project>"` | Re-scan the repo and update the Repo Context note. |
| `gzos linear-uplink "<project>"` | Sync vault phases to Linear issues. |
| `gzos daily-plan [date]` | Write a time-blocked daily plan to the vault (uses LLM). |
| `gzos capture "<text>"` | Quick-capture a note to the vault Inbox. |
| `gzos dashboard [port]` | Launch the web dashboard (default port 7070). |

---

## Configuration

### `.env` — secrets and paths

```env
# Required
GROUNDZERO_VAULT_ROOT=/absolute/path/to/your/obsidian/vault
OPENROUTER_API_KEY=sk-or-...

# Optional: Linear integration
LINEAR_API_KEY=lin_api_...
LINEAR_TEAM_ID=your-team-id

# Optional: WhatsApp notifications via CallMeBot
CALLMEBOT_PHONE=+447...
CALLMEBOT_API_KEY=...

# Optional: agent driver (default: claude-code)
AGENT_DRIVER=claude-code
```

### `groundzero.config.json` — project settings

```json
{
  "vault_root": "/absolute/path/to/vault",
  "agent_driver": "claude-code",
  "llm": {
    "model": "anthropic/claude-sonnet-4-6"
  },
  "projects_glob": "{01 - Projects/**,02 - Areas/**}",
  "notify": {
    "stdout": true
  }
}
```

To enable Linear:
```json
{
  "linear": {
    "enabled": true,
    "api_key": "lin_api_...",
    "team_id": "your-team-id"
  }
}
```

Any [OpenRouter](https://openrouter.ai/models) model works. Change it in config or with the `GZOS_MODEL` env var.

---

## Agent Drivers

GroundZeroOS supports two agent drivers:

**Claude Code** (default, recommended)
```env
AGENT_DRIVER=claude-code
```
Requires the `claude` CLI. Install:
```bash
npm install -g @anthropic-ai/claude-code
claude login   # authenticate once
```
Runs non-interactively via `--print` mode. Full file system access scoped to the repo path. Works headlessly — no desktop app required.

**Cursor**
```env
AGENT_DRIVER=cursor
```
Requires the **Cursor desktop app** and its shell command to be installed:
1. Download and install [Cursor](https://cursor.sh)
2. Open Cursor → **Cursor menu → Install Shell Command**
3. Verify: `cursor --version`

Cursor runs headlessly via `cursor agent --print --yolo`. It uses your existing Cursor account and model settings — no extra API key needed.

> **Note:** The Cursor CLI (`cursor` in your PATH) is what GroundZeroOS calls — not the desktop app directly. Step 2 above is required, not optional.

To switch drivers: update `agent_driver` in `groundzero.config.json`. You can run `gzos doctor` to confirm the selected driver is available.

---

## Vault Maintenance

`gzos heal` runs three subsystems in sequence:

1. **Healer** — clears stale locks (phase-active with `locked_at` older than 5 minutes), fixes frontmatter drift, normalises tags.

2. **Graph maintainer** — ensures all wikilinks are valid. Rebuilds missing links between Overview → Phases, Overview → Docs Hub, etc. Removes dead links. Auto-creates missing hub notes.

3. **Consolidator** — merges fragmented log entries, archives completed phase groups into single archive nodes, ensures the Kanban reflects current phase states.

Run `gzos heal` any time the graph looks wrong, after a crash, or after manually restructuring vault files. It does not delete notes.

---

## Linear Integration

Linear sync is optional but recommended when using OpenClaw or working in a team.

**To enable:**
1. Generate an API key in Linear → Settings → API
2. Find your team ID (Settings → General, or from the Linear URL)
3. Add to `.env`:
   ```env
   LINEAR_API_KEY=lin_api_...
   LINEAR_TEAM_ID=...
   ```
4. `gzos doctor` — confirm Linear shows green

**What syncs:**
- Phase completion → Linear issue marked done
- Phase blocked → Linear issue flagged
- `gzos import <id>` → Linear project pulled into vault as a full bundle

---

## WhatsApp Notifications

GroundZeroOS sends WhatsApp notifications via CallMeBot on every significant event: task completed, phase completed, phase blocked, heal run finished.

**To enable:**
1. Register your number with CallMeBot: https://www.callmebot.com/blog/free-api-whatsapp-messages/
2. Get your API key from the confirmation message
3. Add to `.env`:
   ```env
   CALLMEBOT_PHONE=+447...
   CALLMEBOT_API_KEY=...
   ```

Notifications fire from the `notify` step in the pipeline. If WhatsApp is not configured, this step is silently skipped.
