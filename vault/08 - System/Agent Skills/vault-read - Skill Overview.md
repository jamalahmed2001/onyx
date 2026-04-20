---
tool: vault-read
type: native
free: true
open_source: true
tags: [tool, vault, native]
up: Agent Skills Hub
---

# vault-read

> Read, search, and navigate vault files using Claude's built-in `Read`, `Grep`, and `Glob` tools.

## Use when

- Loading a Knowledge, Source Context, or phase file into context
- Searching for a specific string or pattern across vault files
- Listing files matching a path pattern

## Operations

| Operation | Tool | Example |
|---|---|---|
| Read a file | `Read` | Read `03 - Ventures/Personal/Core/ManiPlus Weekly/ManiPlus Weekly - Knowledge.md` |
| Search content | `Grep` | Search for `safety_rules` in `08 - System/Profiles/` |
| Find files | `Glob` | `03 - Ventures/**/Phases/*.md` |

## Notes

- Always prefer `Read` over `Bash cat` — it shows line numbers and respects permissions
- Use `Grep` with `output_mode: files_with_matches` for broad discovery, then `Read` for content
- Vault root: `$ONYX_VAULT_ROOT`
