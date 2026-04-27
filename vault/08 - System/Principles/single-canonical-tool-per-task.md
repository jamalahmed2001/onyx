---
title: single-canonical-tool-per-task
tags: [principle, universal-pipeline]
type: principle
up: Principles Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Principles/Principles Hub.md|Principles Hub]]

# single-canonical-tool-per-task

**Rule.** Every recurring task has exactly one canonical tool that does it. No `/tmp` scripts, no ad-hoc one-shots, no shadow implementations.

**Why.** When the same task has two implementations, drift is guaranteed. One gets bug fixes; the other doesn't. One gets performance tuning; the other doesn't. The next person — including future-you — won't know which is canonical and will pick the wrong one half the time. Worse: an automation that worked yesterday breaks today because it called the wrong implementation. The cure is always cheaper before the second copy exists.

**How to apply.**
- When you write a task script that solves a problem you'll have again, lift it to a skill (`~/clawd/skills/<name>/bin/<name>`) the same day.
- If you find yourself writing a `/tmp/X.py` to do something a skill already does, stop — extend the skill instead.
- If two existing implementations diverge, declare one canonical and delete the other. Never merge by silently keeping both.
- Directives reference the canonical tool by its bin path (or by skill name if the runtime resolves), never by inline shell.
- If the task is one-shot (genuinely never repeats), name it that way: `migrate-2026-04-x.sh`, and delete it after.
