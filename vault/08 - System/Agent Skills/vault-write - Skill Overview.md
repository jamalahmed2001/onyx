---
tool: vault-write
type: native
free: true
open_source: true
tags: [tool, vault, native]
up: Agent Skills Hub
---

# vault-write

> Write or edit vault markdown files using Claude's built-in `Write` and `Edit` tools.

## Use when

- Writing a new episode note, research brief, or output file
- Updating frontmatter state on a phase
- Appending to Knowledge.md after a phase completes

## Operations

| Operation | Tool | When |
|---|---|---|
| Create new file | `Write` | Output files, new notes |
| Edit existing file | `Edit` | Frontmatter updates, appending sections |

## Rules (from the Vault Architect Directive)

- **Read before editing** — always `Read` a file before using `Edit` on it
- **Respect bundle structure** — outputs go in `Episodes/`, `Issues/`, or `output/`, not in the phase note
- **Preserve frontmatter** — never overwrite the full frontmatter block when you only need to change one field
- **Knowledge appends only** — never overwrite `Knowledge.md`, only append new sections

## Notes

- Vault root: `$ONYX_VAULT_ROOT`
- For large writes (scripts, briefs), prefer `Write` over multiple `Edit` calls
