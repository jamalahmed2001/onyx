---
tags: [system, guide, openclaw]
created: 2026-03-30
---
## Navigation

→ [[Dashboard|Dashboard]]

# Using GroundZeroOS with OpenClaw

OpenClaw is the portfolio-level project management platform. GroundZeroOS is the local execution engine. Together they give you full-stack AI project management: planning and visibility in the cloud, real code execution locally.

- **OpenClaw** — project creation, phase planning, team visibility, portfolio dashboard, Linear sync
- **GroundZeroOS** — local agent execution, vault-native state, repo context injection, real code changes

---

## How They Connect

```
OpenClaw (web)
  │
  │  project specs + phases
  ▼
Linear (issues + epics)
  │
  │  gzos import <project-id>
  ▼
GroundZeroOS (local vault)
  │
  │  agents execute in your repo
  ▼
Linear uplink (phase status updates)
  │
  │  Linear state reflected in dashboard
  ▼
OpenClaw dashboard
```

The vault is the local source of truth. Linear is the integration layer. OpenClaw reads from Linear to show portfolio-level progress.

---

## User Flow 1: Start from OpenClaw

This is the recommended flow for new projects in an existing OpenClaw portfolio.

1. **Create the project in OpenClaw** — define the goal, scope, and rough phases in the dashboard. OpenClaw gives you templates and portfolio context.

2. **OpenClaw syncs to Linear** — the project becomes a Linear project with epics for each phase and issues for key deliverables.

3. **Pull it into your vault locally:**
   ```bash
   gzos import <linear-project-id>
   ```
   This creates the full vault bundle: Overview (generated from Linear project description), Kanban with phases from Linear epics, Repo Context (scaffolded, ready for your input), Docs Hub, Agent Log Hub.

4. **Open Obsidian and fill in Repo Context** — add the repo path if not auto-detected, your architecture decisions, and any constraints agents must respect. This step is important: agents will not have a clear picture of your codebase without it.

5. **Tag phases ready** — review the imported phases in the Kanban. Open each one you want to execute, check the task list looks right, then set `phase-ready` in frontmatter.

6. **Run:**
   ```bash
   gzos run
   ```
   Agents execute phase by phase in your local repo.

7. **After each phase** — the Linear uplink fires automatically. The Linear issue is marked done (or flagged if blocked). The OpenClaw dashboard reflects the Linear state.

8. **WhatsApp** — every task completion and every block sends a notification.

---

## User Flow 2: Start from GroundZeroOS, Sync to OpenClaw

For projects you start locally and want to bring into the OpenClaw portfolio later.

1. **Init locally:**
   ```bash
   gzos init "My App"
   ```

2. **Plan phases in Obsidian** — write your phases, set `phase-ready` on the first batch.

3. **Run with the atomiser:**
   ```bash
   gzos run
   ```
   If your phases do not have detailed tasks yet, the atomiser generates them from the Overview note.

4. **Linear uplink** — after each phase completes, GroundZeroOS creates/updates a Linear issue. Once a few phases are exported, a Linear project exists.

5. **Import into OpenClaw** — in the OpenClaw dashboard, connect to your Linear workspace and import the project. It now appears in your portfolio with full phase history.

6. **Ongoing sync** — each subsequent `gzos run` updates Linear. OpenClaw reads from Linear and stays current automatically.

---

## User Flow 3: Team Project via OpenClaw

For teams where multiple developers are running agents on different phases simultaneously.

1. **Team lead creates the project in OpenClaw** — defines phases, assigns rough ownership, sets scope.

2. **Each developer imports locally:**
   ```bash
   gzos import <linear-project-id>
   ```
   Everyone gets the same vault bundle structure on their own machine.

3. **Controller claims phases** — GroundZeroOS uses vault-native locking (`locked_by` in frontmatter). Each developer's controller claims the next available `phase-ready` phase. Two controllers will never claim the same phase because lock acquisition is atomic in the vault.

4. **Agents work in parallel** — each developer's agents work on separate phases simultaneously in their own repos.

5. **Team-wide visibility** — each completed phase fires a Linear uplink. The whole team sees progress in Linear and in the OpenClaw dashboard in real time.

---

## The Config Connection

These fields in `.env` and `groundzero.config.json` wire up the OpenClaw integration:

```env
# .env
LINEAR_API_KEY=lin_api_...          # from Linear → Settings → API
LINEAR_TEAM_ID=your-team-id         # from Linear → Settings → General

OPENROUTER_API_KEY=sk-or-...        # LLM for agent execution

CALLMEBOT_PHONE=+447...             # WhatsApp number
CALLMEBOT_API_KEY=...               # from CallMeBot registration
```

```json
// groundzero.config.json
{
  "linear": {
    "enabled": true,
    "teamId": "your-team-id"
  },
  "notify": {
    "whatsapp": true
  }
}
```

Run `gzos doctor` after setting these. It will confirm each integration is correctly configured before you run.

---

## What OpenClaw Sees vs What GroundZeroOS Sees

| Layer | OpenClaw | GroundZeroOS |
|---|---|---|
| Project definition | Epics, milestones, team | Phase notes, Repo Context |
| Task tracking | Linear issues | Vault checkbox tasks |
| Status | Linear issue state | `phase-ready` / `phase-active` / `phase-completed` tags |
| Execution | Delegates to gzos | Agents running in local repo |
| History | Linear timeline | Log notes in vault |
| Notifications | Dashboard | WhatsApp + stdout |

Neither system is a subset of the other. OpenClaw has the portfolio view; GroundZeroOS has the execution detail. Linear is the bridge.

---

## Setting Up the Connection

**Step by step — first time:**

1. Go to Linear → Settings → API → Create personal API key. Copy it.

2. Find your team ID. Go to Linear → Settings → General. The team ID is in the URL or shown directly on the page.

3. Add both to `.env`:
   ```env
   LINEAR_API_KEY=lin_api_...
   LINEAR_TEAM_ID=...
   ```

4. Run `gzos doctor` — the Linear row should show green with your team name.

5. Import your first project:
   ```bash
   gzos import <linear-project-id>
   ```
   The Linear project ID is the last segment of the project URL in Linear (e.g. `PRJ-123` or a UUID depending on your Linear version).

From here, every `gzos run` will automatically uplink phase status back to Linear as phases complete.
