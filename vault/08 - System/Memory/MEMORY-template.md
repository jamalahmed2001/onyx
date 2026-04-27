<!--
TEMPLATE: Memory Index

Copy to your agent's memory store as MEMORY.md (e.g. ~/.claude/projects/<project>/memory/MEMORY.md).

This is the index — one line per memory file, kept under ~150 chars. Memory bodies live in
sibling files (user_role.md, feedback_*.md, project_*.md, reference_*.md, etc.).

The index is loaded into the agent's context at the start of every session; the body files
are loaded on demand. Keep the index concise — lines past ~200 get truncated.
-->

# Memory Index

<!-- One line per memory: -->
<!-- - [Title](filename.md) — one-line hook describing when this memory is relevant -->

<!-- Examples (delete on first real use): -->

- [User role](user_role.md) — software engineer, prefers terse responses, frames frontend in backend analogues
- [Feedback: tests must hit real DB](feedback_no-mock-db.md) — never mock the database in integration tests
- [Project: Q2 deadline](project_q2-deadline.md) — non-critical merges freeze 2026-06-01 for product launch
- [Reference: error tracking](reference_sentry.md) — production errors live in Sentry project "main-api"
