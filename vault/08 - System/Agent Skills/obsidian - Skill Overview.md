---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: obsidian
source_skill_path: ~/clawd/skills/obsidian/SKILL.md
updated: 2026-03-25
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# obsidian

> Read, write, and search Obsidian vault markdown files

# Obsidian Skill

Interact with Obsidian vaults by reading, writing, and searching markdown files.

For OnyxVault, **all writes must obey the Vault Architect Directive** in:
`08 - System/Agent Directives/Vault Architect Directive.md`.
This means:
- Respecting the project bundle structure (Overview, Kanban, Knowledge, Docs Hub, Docs, Phases).
- Preserving YAML frontmatter and navigation blocks.
- Using the Docs Hub + Docs/ patterns for project docs.
Whenever possible, let higher-level skills (Vault Skill, Project Atomiser, Phase Planner, Phase Executor) decide *what* to write; this skill is the IO layer that executes those decisions.

## How Obsidian Works

Obsidian stores all notes as markdown files in a vault folder. This skill provides direct file access to those notes.

## Usage

### Read a note
```
Read the note "Project Ideas" from my vault
```

### Create or update a note
```
Create a note called "Daily Notes - 2026-01-28" with content:
## Today's Tasks
- [ ] Call Sarah about the project
- [ ] Review pull requests
```

### Search notes
```
Search my vault for notes containing "project proposal"
```

### List all notes
```
List all notes in my vault
```

## Vault Location

By default, this skill looks for Obsidian vaults in:
- `$ONYX_VAULT_ROOT` (primary ONYX project vault)
- `~/Obsidian/` (other Obsidian vaults)
- `~/Documents/Obsidian/`

If your vault is elsewhere, specify the path:
```
Read "My Note" from vault at ~/path/to/vault
```

When used in the **ONYX Orchestrator** context, this skill is the **main interface** for:
- Reading project bundles (Overview/Kanban/Knowledge/Docs Hub/Docs/Phases)
- Checking/syncing vault structure against the codebase
- Writing and updating notes according to the Vault Architect Directive
Higher‑level skills (Project Health, Vault Skill, Atomiser, Phase Planner, Phase Executor) should call this skill for all vault IO rather than manipulating files directly.

## Links

Obsidian supports `[[wikilink]]` syntax. When creating notes, use this format for internal links:
```markdown
See [[Project Ideas]] for more details
```

## Frontmatter

Many Obsidian notes include YAML frontmatter:
```markdown
---
tags: [work, project]
status: active
---
```

This skill preserves frontmatter when reading and writing notes.name: obsidian
description: Read, write, and search Obsidian vault markdown files (default OnyxVault at $ONYX_VAULT_ROOT, can be overridden per request)
