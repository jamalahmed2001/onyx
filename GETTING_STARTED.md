# Getting Started with GroundZeroOS

A human-in-the-loop agentic workflow for software development. AI agents do the implementation work; you stay in control of what gets built and when.

---

## What this is

GroundZeroOS lets you run AI coding agents (Claude Code or Cursor) against your repos — but instead of letting an agent roam freely, you define the work in structured **phase notes** in your Obsidian vault. The agent gets exactly what you wrote, does that work, logs what it did, and stops. You review. You decide what runs next.

The vault is the source of truth. Every project, every phase, every task, every agent action lives there as plain Markdown. No dashboard required. No separate database. Open Obsidian and you can see everything.

---

## 1. Prerequisites

| Requirement | Why |
|---|---|
| [Obsidian](https://obsidian.md) | Where your projects live |
| [Node.js 18+](https://nodejs.org) | Runs gzos |
| [Claude Code CLI](https://claude.ai/code) | Default agent driver |
| [OpenRouter API key](https://openrouter.ai) | LLM calls for atomising and planning |

Optional:
- **Cursor** — alternative agent driver (more interactive)
- **Linear API key** — if you want to import projects from Linear

---

## 2. Installation

```bash
git clone https://github.com/openclaw/groundzeroOS-starter
cd groundzeroOS-starter
npm install
```

`npm install` also runs `npm run build` via postinstall, so `gzos` is ready immediately.

---

## 3. Configure

```bash
cp .env.example .env
```

Open `.env` and set:

```env
GROUNDZERO_VAULT_ROOT=/absolute/path/to/your/obsidian/vault
OPENROUTER_API_KEY=sk-or-...
```

Then open `groundzero.config.json` and update `vault_root` to the same path:

```json
{
  "vault_root": "/absolute/path/to/your/obsidian/vault",
  "agent_driver": "claude-code",
  "projects_glob": "01 - Projects/**"
}
```

**Check everything is wired up:**
```bash
gzos doctor
```

All green? You're ready.

---

## 4. Open the starter vault in Obsidian

The `vault/` folder in this repo is a ready-to-use Obsidian vault. Open it:

1. Open Obsidian → **Open another vault** → **Open folder as vault**
2. Select the `vault/` folder inside this repo
3. Browse to `00 - Dashboard/Dashboard.md` — your home base

You'll see **My First Project** already set up as an example. It has an Overview, Kanban, Knowledge note, and one phase note ready to run.

Alternatively, point `vault_root` in your `.env` at an existing Obsidian vault you already use. GroundZeroOS will work alongside anything already there.

---

## 5. Your first project

### Option A — Use the example

`My First Project` is already in `01 - Projects/`. Open `Phases/P1 - Example Phase.md` in Obsidian. It has a task ready: create a file. Run it:

```bash
gzos run
```

The agent picks up the `phase-ready` phase, executes the task, and writes a log to `Logs/L1 - P1 - Example Phase.md`. Open that log in Obsidian after it finishes.

### Option B — Start your own

```bash
gzos init "My App"
```

Interactive prompt: enter the repo path (where your code lives). GroundZeroOS scans the repo and creates:

```
01 - Projects/
  My App/
    My App - Overview.md       ← describe what you're building
    My App - Repo Context.md   ← auto-filled: stack, key files, architecture
    My App - Kanban.md         ← your phases, all states at a glance
    My App - Knowledge.md      ← learnings agents write back here
    My App - Agent Log Hub.md  ← links to all execution logs
    Phases/                    ← one note per phase
    Logs/                      ← one log per phase execution
```

---

## 6. The human-in-the-loop workflow

This is the core loop. The human decides what to build. The agent builds it. The human reviews.

### Step 1 — Write a phase

Open the Kanban (`My App - Kanban.md`) and create a new phase note, or duplicate the template from `08 - System/Agent Directives/Templates/Phase Note Template.md`.

A good phase note looks like this:

```markdown
---
tags: [phase-backlog]
locked_by: ""
locked_at: ""
---

# Phase 3 — Add authentication

## Human Requirements
<!-- Leave blank. Agents write here when they are stuck and need you. -->

## Tasks
- [ ] Install NextAuth and configure GitHub OAuth provider
- [ ] Add session middleware to the Express app
- [ ] Protect /dashboard route — redirect unauthenticated requests to /login
- [ ] Write a test that confirms the redirect fires

## Acceptance Criteria
- [ ] User can sign in with GitHub from the home page
- [ ] Unauthenticated requests to /dashboard return a 302 to /login
- [ ] npm test passes

## Blockers
<!-- Note anything the agent will need before it starts -->
```

**Writing good tasks is the main skill.** Tasks should be specific enough that a developer who doesn't know the project could follow them. The agent gets the task text, the Repo Context, and any Knowledge already written — nothing else.

### Step 2 — Set it ready

When you're happy with the phase, change the frontmatter tag from `phase-backlog` to `phase-ready`:

```yaml
tags: [phase-ready]
```

That's the signal to the system that this phase is approved to run.

### Step 3 — Run

```bash
gzos run
```

The system:
1. Runs the healer (clears any stale locks, fixes broken links)
2. Discovers all `phase-ready` phases across all projects
3. Picks the highest-priority one
4. Locks it (`phase-active`)
5. Spawns the agent with: task text + Repo Context + Knowledge snippets from past phases
6. Agent works through tasks one by one, ticking checkboxes as it goes
7. Agent writes a timestamped entry to the Log note for each action
8. When all tasks and acceptance criteria are done: phase marked `phase-completed`, lock released

You can watch stdout for live updates. WhatsApp notifications fire on every task completion if configured.

### Step 4 — Review

Open the Log note in Obsidian. It contains every tool call, every file touched, every decision the agent made. This is your audit trail.

If everything looks good: move on, write the next phase.

If something looks off: open the phase note, add more context to the task text, reset the tag to `phase-ready`, and re-run.

### Step 5 — Handle blocks

If the agent cannot complete a task, it writes exactly what it needs into `## Human Requirements` and marks the phase `phase-blocked`. You will see this in stdout and get a WhatsApp notification.

Open the phase note, read `## Human Requirements`, and fix the issue:
- Add a missing environment variable
- Clarify an ambiguous task
- Make a design decision it was waiting on

Then reset to `phase-ready` and run again. The agent picks up where it left off.

---

## 7. Staying in control

**You decide what runs.** Nothing executes without a `phase-ready` tag. Setting that tag is your explicit approval.

**You see everything.** Every action the agent takes is in the Log note. The Kanban shows all phases at a glance.

**You can stop at any time.** `Ctrl+C` stops the run. The lock will be cleared by the healer on the next run (`gzos heal` or `gzos run`).

**You own the tasks.** The atomiser can generate tasks from your Overview note automatically, but you should always read and edit them before setting `phase-ready`. Treat generated tasks as a first draft.

**The vault is your memory.** If you want agents to know something (an architectural decision, a constraint, a past mistake), write it in the Knowledge note or the Repo Context. Agents read these at the start of every task.

---

## 8. Daily workflow

```
Morning
  gzos status          — see all projects and phase states at a glance
  Open Obsidian        — review any blocked phases, check logs from last night

Planning
  Write phase notes    — define what you want built next
  Set phase-ready      — approve phases you're confident in

Running
  gzos run             — let the agents work
  Watch notifications  — WhatsApp fires on every task completion and block

Review
  Open Log notes       — audit what the agent did
  Check the code       — open a PR or review the diff

Maintenance
  gzos heal            — if anything looks off in the vault graph
```

---

## 9. Commands

| Command | What it does |
|---|---|
| `gzos doctor` | Pre-flight checks. Run this first. |
| `gzos init "Name"` | Create a new project bundle interactively. |
| `gzos run` | Main loop — heal, discover, execute, log. |
| `gzos run --project <name>` | Run only phases for a specific project. |
| `gzos run --dry-run` | Preview what would run without executing. |
| `gzos run --once` | Single iteration then exit (use with cron). |
| `gzos status` | All projects and phase states (with task progress). |
| `gzos heal` | Fix stale locks, broken links, graph drift. |
| `gzos plan` | Generate a time-blocked daily plan from your vault context. |
| `gzos import <id>` | Import a Linear project as a vault bundle. |
| `gzos reset [phase]` | Reset a blocked phase to phase-ready. |
| `gzos atomise <project>` | Generate phases from an Overview note. |
| `gzos logs [phase]` | Show execution log for a phase by name or number. |
| `gzos logs --recent` | Show the most recently modified log. |
| `gzos refresh-context <proj>` | Re-scan repo and update Repo Context note. |
| `gzos linear-uplink <proj>` | Sync vault phases to Linear issues. |
| `vault-viewer.html` | Open in Chrome/Edge to browse vault in browser. |

**Cross-project knowledge** is stored at `08 - System/Cross-Project Knowledge.md` in your vault. After each phase completes, the consolidator automatically extracts broadly-applicable learnings (patterns, pitfalls, architectural decisions) and appends them here. Future phases across all projects can benefit from them.

---

## 10. Vault viewer

Open `vault-viewer.html` in Chrome or Edge to browse your vault in a browser:

- **File tree** — collapsible, with search
- **Markdown reader** — renders notes with frontmatter badges, task checkboxes, wikilink navigation
- **Force graph** — colour-coded by phase status and domain. Phase nodes show active (blue), complete (green), ready (cyan), blocked (red).
- **Edit + save** — click the pencil icon to edit any note and save it back to disk

Click a node in the graph to jump to that note in the file view.

> Works in Chrome and Edge only (uses the File System Access API). Your vault location is remembered after the first open — one click to reconnect on subsequent visits.

---

## 11. Phase FSM

Phases move through a simple state machine. You control transitions by editing the `tags` frontmatter field.

```
phase-backlog  →  phase-ready     (you: approved to run)
phase-ready    →  phase-active    (system: agent claimed it)
phase-active   →  phase-completed (system: all tasks + acceptance done)
phase-active   →  phase-blocked   (system: agent hit a blocker)
phase-blocked  →  phase-ready     (you: resolved the blocker)
phase-completed → (terminal)
```

The healer monitors `phase-active` phases. If `locked_at` is older than 5 minutes with no recent log entry, the lock is cleared automatically and the phase resets to `phase-ready`.

---

## 12. Running on a schedule (cron)

Add to crontab (`crontab -e`):

```
# Run gzos every 30 minutes, single iteration
*/30 * * * * cd /path/to/groundzeroOS-starter && gzos run --once >> /var/log/gzos.log 2>&1
```

`--once` ensures each cron invocation processes exactly one phase then exits cleanly. Without it, `gzos run` continues until no work remains, which may overlap with the next cron trigger.

---

## 13. Tips

- **Keep phases small.** One clear goal, 4–8 tasks. Larger phases are harder to review and more likely to go off-track.
- **Write acceptance criteria.** Agents check these before marking a phase done. Vague criteria leads to vague completion.
- **Read the Repo Context after `gzos init`.** Auto-detection is good but not perfect. Add architecture notes, constraints, and anything non-obvious.
- **Use the Knowledge note.** After a phase completes, write a one-liner about what was learned or decided. Agents read this in future phases.
- **Run `gzos heal` after anything unexpected.** It's safe to run any time and fixes most graph issues automatically.
- **Don't fight the lock.** If a phase is stuck in `phase-active`, run `gzos heal` — it clears stale locks cleanly.
