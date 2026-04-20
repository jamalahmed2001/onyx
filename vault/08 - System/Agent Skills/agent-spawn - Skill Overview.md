---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: agent-spawn
updated: 2026-04-14
up: Agent Skills Hub
---
# agent-spawn

> Spawn a Claude Code or Cursor agent against a repo or vault path. Driver is selectable per invocation.

## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

---

## Drivers

| Driver | Binary | When to use |
|---|---|---|
| `claude-code` | `claude` | Default. All engineering phases in ONYX. Interactive + headless. |
| `cursor` | `agent` | When project is configured with `agent_driver: cursor` in Overview frontmatter. |

Select driver via `agent_driver` in the project's Overview frontmatter or `onyx.config.json` global default.

---

## User Consent (Non-Autonomous Invocation)

When invoked manually (not by ONYX orchestrator), this skill **requires explicit user approval before applying changes**:

1. State intent — repo, task, model, whether files will change
2. Wait for "yes"
3. Default to read-only (`--permission-mode default` / `CS_PLAN`) unless apply is confirmed
4. Show diff before committing

ONYX orchestrator invocations (CS_PLAN / CS_EXEC) are pre-authorised by the Agent Architecture Directive and run without additional consent.

---

## Claude Code Driver

### Mode → command mapping

| Mode | Command | Use for |
|---|---|---|
| `ask` (read-only) | `claude --print --permission-mode default "prompt" --model <m>` | Review before applying |
| `apply` | `claude --print --permission-mode dontAsk "prompt" --model <m>` | Apply confirmed changes |
| `plan` | `claude --print --permission-mode plan "prompt" --model <m>` | Architecture / design |

### Model routing

| Task | Model |
|---|---|
| Trivial / exploratory | `auto` (omit flag) |
| Bug fix / feature / refactor | `sonnet-4.6` |
| Code review (read-only) | `sonnet-4.6` |
| Architecture / design planning | `opus-4.6-thinking` |

### Headless commands

```bash
# Read-only first
cd <repo> && claude --print --permission-mode default "task" --model sonnet-4.6

# Apply (after confirmation)
cd <repo> && claude --print --permission-mode dontAsk "task" --model sonnet-4.6

# Plan mode
cd <repo> && claude --print --permission-mode plan "Design X" --model opus-4.6-thinking
```

### Session management

```bash
claude list                     # list previous sessions
claude continue                 # resume latest
claude resume <session-id>      # resume specific
```

### Troubleshooting

| Symptom | Fix |
|---|---|
| `claude: command not found` | `npm install -g @anthropic-ai/claude-code` |
| Auth error | `claude auth login` |
| Wrong model | `claude models` to list available |

---

## Cursor Driver

### Orchestrator entrypoints (ONYX-managed)

**CS_PLAN** — generate implementation plan for a phase (read-only)
```bash
echo "$PLAN_PROMPT" | scripts/cursor-agent.sh "$REPO" CS_PLAN
```
Model: Cursor default (extended reasoning). Output: structured markdown plan written into phase note.

**CS_EXEC** — execute one task from a phase (applies changes)
```bash
echo "$EXEC_PROMPT" | scripts/cursor-agent.sh "$REPO" sonnet-4.6 CS_EXEC
```
Model: Cursor default (balanced). Output: structured result object `{ status, completed_tasks, blockers, summary }`.

### Agent Architecture Directive rules (enforced by orchestrator)

- File cap: ≤ 20 files in context (orchestrator pre-selects)
- One worker per phase per run — no concurrent workers on same phase
- Vault nodes are authority — agent must not re-derive structure
- CS_EXEC returns structured result object — mandatory
- No code edits in CS_PLAN mode

### Troubleshooting

| Symptom | Fix |
|---|---|
| `agent: command not found` | Install Cursor Agent CLI from cursor.com/docs/cli |
| Silent exit code 1 | Check Cursor auth (`cursor auth status`); omit `--model` flag to use Cursor default |
| Model not found | Run `agent list-models` to see available names |

---

## ONYX Integration

ONYX reads `agent_driver` from the project Overview frontmatter and selects the driver automatically. This skill documents how both drivers work — you do not invoke this skill manually when running `onyx run`.

```yaml
# In Overview.md frontmatter — selects driver for all phases in this project
agent_driver: claude-code   # or cursor
```
