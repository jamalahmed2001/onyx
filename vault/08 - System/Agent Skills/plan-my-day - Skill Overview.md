---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: plan-my-day
version: 1.3.0
author: theflohart
source_skill_path: ~/clawd/skills/plan-my-day/SKILL.md
updated: 2026-04-02
up: Agent Skills Hub
---
# plan-my-day

> Generate an energy-optimized, time-blocked daily plan (high-level outcomes, not task soup)

## Intent

Generate a clean **time-blocked** plan for the day that is **ONYX-native**:
- The daily plan is a **steering document** (outcomes + constraints + time blocks)
- ONYX (and project phases/kanban) carries the detailed task decomposition
- Keep the plan readable enough that you can follow it under low energy

This skill is **vault-aware** and must pull priorities across the vault (domains/projects), **biased toward deadlines + blockers**, then write the plan back into the vault.

---

## Usage

```
/plan-my-day [optional: YYYY-MM-DD]
```

If no date is provided, assume **today** (Europe/London).

---

## Vault Integration (Authoritative)

### Vault root resolution

Use this order:
1. `$ONYX_VAULT_ROOT/` (primary)
2. `$ONYX_VAULT_ROOT/` (fallback / mirrored runtime vault)

If both exist, prefer **Obsidian** path for reads/writes.

### Planning hubs (expected)

- `04 - Planning/Daily Plans Hub.md` (index)
- `00 - Dashboard/Central Dashboard.md` (top navigation)

### Daily plan storage (canonical)

Until a non-legacy daily folder is activated, treat the canonical plan file as:

- `09 - Archive/Daily Archive (Legacy)/Daily - YYYY-MM-DD.md`

Yes, it’s in “Archive (Legacy)”, but it is currently the live daily-plan surface referenced by the planning hub. Don’t fight the system: write where the user actually reads.

**Optional future migration target (only if/when the folder exists and the hub is updated to point to it):**
- `04 - Planning/Daily/Daily - YYYY-MM-DD.md`

---

## Write-Back Behaviour

When generating a plan for date `D`:

1. **Write/append to the daily plan file**
   - Path: `09 - Archive/Daily Archive (Legacy)/Daily - D.md`
   - If missing: create it with the plan content
   - If exists: append a revision block (never overwrite history)

   Use:
   ```markdown
   ---

   ## Revised Plan (HH:MM)

   [full plan here]
   ```

2. **Update the Daily Plans Hub (light touch)**
   - Path: `04 - Planning/Daily Plans Hub.md`
   - Ensure today’s plan is listed under **Recent Daily Plans** (prepend if not present)
   - Do not duplicate entries

---

## Planning Principles (ONYX-native)

1. **Outcomes over tasks**
   - Each block defines an outcome + 1–3 “next actions” max.
   - Detailed subtasks belong in project phases/kanban.

2. **Deadlines and blockers first**
   - If something has a near deadline, it must appear either as a deep-work block or be explicitly deferred.

3. **Time blocks stay**
   - Keep the hour-by-hour structure (including prayer blocks).

4. **80/20 scheduling**
   - Plan ~80% of the day; keep buffers for interrupts and recovery.

5. **Whole-vault coverage, but shallow**
   - Do a quick sweep across domains to ensure nothing urgent is missed.
   - Only pull detail for the chosen Top 3.

---

## Context Gathering (What to Read)

### Required reads

1. `04 - Planning/Daily Plans Hub.md` (to keep indexing consistent)
2. `00 - Dashboard/Central Dashboard.md`
3. The relevant work/life hubs linked from Central Dashboard (follow the hub tree)

### Project-level reads (selective)

From the hubs, follow links down only as needed:
- `<Project>/<Project> - Overview.md` (look for goals, deadlines, status)
- `<Project>/<Project> - Kanban.md` (current WIP + blockers)
- `<Project>/Phases/*.md` (only if you need the *next action* to be concrete)

### Deadline detection

Treat any of these as “deadline signals”:
- Explicit dates like `YYYY-MM-DD`, “by Friday”, “EOW”, “end of month”
- Frontmatter fields like `due:`, `deadline:`, `launch:` (if present)
- Kanban columns like “Due Soon”, “Blocked”, “This Week”

If no structured deadline metadata exists, fall back to textual detection.

---

## Build the Plan (Method)

1. **Sweep the vault (5–10 minutes in plan-time)**
   - Identify: (a) near deadlines, (b) blockers, (c) one “move-the-needle” initiative.

2. **Select Top 3 outcomes**
   Each must be phrased as a finish line:
   - “PR merged”, “tests green”, “spec approved”, “invoice sent”, “phase completed”, etc.

3. **Construct time blocks**
   - Put the hardest outcome in the first deep-work window.
   - Add prayer blocks (Preston, UK) and keep them protected.
   - Add one admin/shallow-work block for capture → cards.

4. **Within each block: keep it high-level**
   For each block:
   - Outcome (1 sentence)
   - Next actions (1–3 checkboxes)
   - “Stop rule” (what not to do / what counts as done)

5. **Add a “Deadline Radar” section**
   - List deadlines in the next 7–14 days (or “none found”).
   - If something is at risk, note the mitigation.

---

## Output Format (Template)

```markdown
# Daily Plan - [Day], [Date] [Month] [Year]

## Today's Mission

**Primary Goal:** [one sentence]

**Top 3 Outcomes (finish lines):**
1. [Outcome 1]
2. [Outcome 2]
3. [Outcome 3]

---

## Deadline Radar (next 7–14 days)
- [Project] — [deadline] — [risk/next step]

---

## Time-Blocked Schedule

### [TIME] - [TIME]: Morning Routine
- [ ] Water + breakfast
- [ ] Open vault → confirm Top 3 outcomes (no new scope)

### [TIME] - [TIME]: Deep Work — [Outcome 1]
**Outcome:** [finish line]
- [ ] Next action 1
- [ ] Next action 2
- [ ] Next action 3
**Stop rule:** [what “done” means / what not to expand]

### [TIME] - [TIME]: Break

### [TIME] - [TIME]: Deep Work — [Outcome 2]
...

### 🕌 [Prayer]
...

### [TIME] - [TIME]: Shallow Work — Admin / Inbox
**Outcome:** Everything captured becomes a durable card/note.
- [ ] Convert captures → project cards (1 next action each)
- [ ] Schedule/follow-ups (no building)

### [TIME] - [TIME]: Day Close
- [ ] Tick off outcomes
- [ ] Park outputs/links in the vault
- [ ] Set tomorrow’s first 10-minute action

---

## Success Criteria

### Must-Have
- [ ] Outcome 1 complete
- [ ] Outcome 2 complete
- [ ] Prayers on time

### Should-Have
- [ ] Inbox processed to zero

### Nice-to-Have
- [ ] Draft tomorrow’s Top 3
```

---

## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]
