---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: project-health
source_skill_path: ~/clawd/skills/project-health/SKILL.md
updated: 2026-03-25
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# project-health

> Run project and workspace health checks (OpenClaw, trading bot, usage snapshots) via local scripts in ~/clawd.

# Project Health & Usage Skill

Use this skill to run health checks on your OpenClaw / ONYX setup and related bots.

## Scope

Covers:
- High-level project health report for active repos
- Snapshot of OpenClaw usage and session stats
- Trading bot health check (read-only status)

All commands are run from `~/clawd`.

## Scripts

### 1. Project Health Report

Generates a consolidated project health report (per-project status, key checks, etc.).

Run:
```bash
cd ~/clawd && bash scripts/project-health.sh
```

Use when:
- You want a quick overview of active projects and their status
- Before or after bigger refactors/deployments

### 2. Usage Snapshot

Captures a snapshot of OpenClaw usage/session stats via the helper Node script.

Run:
```bash
cd ~/clawd && node scripts/snapshot-usage.js
```

Use when:
- You want to inspect recent model usage and session patterns
- Preparing cost/usage reports or debugging heavy usage

### 3. Trading Bot Health (Optional)

If the trading bot is in scope for a health check, you can include its dedicated script:

Run:
```bash
cd ~/clawd && bash scripts/trading-bot-health.sh
```

Use when:
- You want a quick status report on the Kraken / trading-bot stack
- Before market open or when debugging recent trades

## Interaction Pattern

- Run `project-health.sh` for a human-readable overview.
- Use `snapshot-usage.js` when you specifically care about usage/cost signals.
- Run `trading-bot-health.sh` when looking at trading infrastructure health.

These scripts are read-only with respect to code and config; they should not mutate repos or configs, only report state.
