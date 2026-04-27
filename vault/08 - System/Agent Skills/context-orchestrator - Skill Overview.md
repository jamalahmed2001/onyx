---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: context-orchestrator
source_skill_path: ~/clawd/skills/context-orchestrator/SKILL.md
updated: 2026-03-25
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# context-orchestrator

> Generate compact Query Markdown context packets for ONYX controller/phase-executor tasks by pulling focused snippets from the vault (phases, Knowledge, Docs) and file system search results.

# Context Orchestrator Skill (Query Markdown)

## Purpose

This skill produces **Query Markdown (QMD)** context packets for a given ONYX project/phase/task. It is designed to sit under the ONYX controller and Phase Executor so Cursor/LLM runs see only tightly scoped, tool-prepared context instead of full files or the entire vault.

It offloads:
- Phase + Knowledge extraction to **Vault Skill**
- File search/match to deterministic tools (**Node/fs**, `rg`/`grep`)
- Prompt scaffolding to a small helper

so that LLMs focus on **decision + code** rather than raw scanning.

## Inputs

The controller (or any caller) should supply:

- `project_id` (string)
  - Vault bundle id, e.g. `Example Brand`, `OpenClaw/OpenClaw Workspace Migration`.
- `phase_rel` (string)
  - Vault-relative Phase note path within the bundle, e.g.
    - `10 - OpenClaw/Platform/OpenClaw Ops/Phases/Phase 5 - Cron and Runtime Validation.md`
- `task_line` (string)
  - The exact `- [ ] ...` line from the phase tasks section, e.g.
    - `- [ ] Update cron job commands, environment setup, and working directories to use openclaw-config or the new canonical paths where needed`
- Optional `intent` (string)
  - Short hint to bias file search, e.g. `paths`, `cron`, `vault-root`, `scripts`.

## Outputs

A single **Markdown string** containing:

1. A **prompt block**:

```markdown
```prompt
You are a Cursor coding agent working on <project_id>.

Implement exactly this task from <phase_label>:
- <cleaned task line>

Follow ONYX Agent Architecture Directive and Vault Architect Directive, but do not reorganise other phases or projects.
```
```

2. One or more **Query Markdown blocks** (```query```), e.g.:

```markdown
```query
phase:
  file: 10 - OpenClaw/Platform/OpenClaw Ops/Phases/Phase 5 - Cron and Runtime Validation.md
  excerpt: |
    ## 📂 Tasks
    - [x] Inventory cron jobs, shell wrappers...
    - [ ] Update cron job commands, environment setup...
```

```query
knowledge:
  file: 10 - OpenClaw/Platform/OpenClaw Ops/OpenClaw Ops - Knowledge.md
  excerpts:
    - "Phase 5 Cron and Automation Inventory: ... no old vault paths remain."
    - "Workspace config: vault_root=$ONYX_VAULT_ROOT, projects_root=/path/to/your/repos."
```

```query
files:
  matches:
    - path: scripts/walk-reminder.sh
      lines:
        - 5: LOG_DIR="~/clawd/logs"
    - path: scripts/cleanup-logs.sh
      lines:
        - 4: ROOT="~/clawd"
```
```

Callers should treat this entire string as stdin to Cursor/LLM (e.g. via `cursor-agent.sh`).

## Behaviour

### 1. Phase extraction

Given `project_id`, `phase_rel`, and `task_line`:

- Use Vault Skill `readBundle(project_id, vaultRoot)` to load the project bundle.
- Locate the phase node identified by `phase_rel`.
- Extract:
  - Phase title
  - The `## 📂 Tasks` block
  - The specific `task_line` and surrounding lines
  - Optionally `## 📋 Summary` / `## 📋 Implementation Plan` snippets
- Emit them as the `phase` section in a ````query` block.

### 2. Knowledge / Docs snippets

- From the same bundle, use `readBundle` or a helper to access:
  - Knowledge node (`<Project> - Knowledge.md`)
  - Optional Docs Hub (`<Project> - Docs Hub.md`) if present
- Search paragraphs for:
  - Keywords from `task_line` (e.g. `cron`, `cron job`, `openclaw-config`, `vault_root`, `projects_root`)
- Emit up to **3–6** relevant snippets in the `knowledge` section of a ````query` block.

### 3. File match search (tool offload)

- Use deterministic tools (Node `fs`, `glob`, optionally `rg`/`grep`) to find candidate files:
  - Start with any file paths explicitly listed in the phase note under "Relevant files" / "Scripts" sections.
  - If none listed, use the `intent` and project type to infer:
    - For `cron` tasks → scripts/cron helpers, `~/.openclaw/cron/jobs.json`.
    - For `paths` / `vault-root` tasks → `scripts/`, skill scripts, config files.
- Within those files, search for patterns implied by the task, e.g.:
  - `"~/clawd"`, `"~/Obsidian/OnyxVault"`, `"OnyxVault"`, `"projects_root"`.
- Emit only the matched lines (with line numbers) in a `files` section of a ````query` block.

### 4. Prompt scaffolding

The skill also generates a **short prompt header** (` ```prompt`) that:

- Names the project and phase.
- Restates the cleaned task:
  - Removes `- [ ]` / `- [x]` and quotes.
- Reminds Cursor of ONYX/Vault constraints in **1–3 lines**:

```text
Follow ONYX Agent Architecture Directive and Vault Architect Directive, but do not reorganise other phases or projects.
```

This allows `onyx-orchestrator-phase.sh` to use a very small wrapper prompt and avoid re-sending long boilerplate.

---

## Integration with ONYX Controller

In `scripts/onyx-orchestrator-phase.sh`, replace the current prompt build with a call to the compiled context orchestrator helper, for example:

```bash
CONTEXT_MD=$(npx tsx "$REPO_ROOT/src/onyx/contextOrchestrator.ts" \
  --project-id "$PROJECT_ID" \
  --phase-rel "$PHASE_NOTE_REL" \
  --task-line "$TASK_LINE")

echo "$CONTEXT_MD" | "$SCRIPT_DIR/cursor-agent.sh" "$REPO" composer-1.5 force
```

This way, each Cursor run gets:
- A compact prompt
- A phase snippet
- Focused Knowledge excerpts
- File match snippets

…without scanning the whole vault or repo.

---

## Implementation Sketch (TS helper)

The helper `src/onyx/contextOrchestrator.ts` should roughly:

1. Parse CLI args: `--project-id`, `--phase-rel`, `--task-line`, optional `--intent`.
2. Use Vault Skill helpers to:
   - `readBundle(projectId, vaultRoot)`.
   - Locate phase node, Knowledge node, Docs Hub.
3. Build `phase` and `knowledge` query sections using string slices.
4. Use Node `fs` + simple pattern search to find relevant files for the task.
5. Assemble a Markdown string:
   - A `prompt` block
   - One or more `query` blocks
6. Write to stdout.

The skill file (this SKILL.md) should be kept in sync with actual helper behaviour over time.

---

## Notes

- This skill is **project-agnostic**: it relies solely on Vault Skill bundle structure and phase/knowledge conventions from the Vault Architect Directive.
- It is intended for internal use by controllers, planners, and other skills; it is not a user-facing chatbot.
- It is a key building block for **token-cost optimisation**: more work done by tools, less by LLM context scanning.
