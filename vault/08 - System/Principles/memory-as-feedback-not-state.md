---
title: memory-as-feedback-not-state
tags: [principle, universal-pipeline]
type: principle
up: Principles Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Principles/Principles Hub.md|Principles Hub]]

# memory-as-feedback-not-state

**Rule.** The agent's persistent memory is for cross-session feedback (what helped, what didn't, who the user is, how they like to work) — not for in-session state. State lives in plans, tasks, and vault frontmatter.

**Why.** Memory and conversation state look superficially similar — both are written by the agent, both carry context. But they live on different timescales. Conversation state is bounded by the current task and is best held in a plan or task list (where it can be inspected, revised, and discarded when the task ends). Memory persists across sessions and shapes future behaviour — putting in-progress work there pollutes future runs with stale context, and putting cross-session feedback in tasks loses it the moment the task ends.

**How to apply.**
- **Use a task or plan** when the information is bounded by the current goal — "which files I've read", "what the next step is", "what I tried that didn't work this session".
- **Use memory** when the information should change *future* behaviour — "the user prefers terse responses", "this codebase uses a specific lint rule", "this person is a security researcher, not a hobbyist".
- **Use vault frontmatter** when the information is structured fact about a vault artefact — phase status, owner, dependencies.
- When in doubt, ask: "would I want this loaded into a fresh session two weeks from now?" If yes, memory. If no, plan/task.
- Never write the same fact in two of these stores. Pick one home; if you need cross-references, make one home authoritative and the other read from it.
