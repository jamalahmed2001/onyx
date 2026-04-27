---
title: vault-frontmatter-is-source-of-truth
tags: [principle, universal-pipeline]
type: principle
up: Principles Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Principles/Principles Hub.md|Principles Hub]]

# vault-frontmatter-is-source-of-truth

**Rule.** Relationships between vault artefacts live in frontmatter, not in body wikilinks. The runtime, the healer, and the consolidator all read frontmatter; body links are for the human reader.

**Why.** Body wikilinks are unstructured prose embedded in a graph. They drift, they break on rename, and they don't survive auto-generation. Frontmatter is structured, validated by the healer, and queryable. When the runtime needs to know "which directive does this phase use?", reading `directive: <name>` from frontmatter is one step. Searching the body for `[[<directive-name>]]` is many steps and produces false positives.

**How to apply.**
- Frontmatter fields express load-bearing relationships: `up:`, `directive:`, `profile:`, `project:`, `phase_ref:`, `based_on:`.
- The body's `## Navigation` block is UP-only — a single link to the parent. No sideways links.
- Plain-text mentions in body prose ("see the audio-producer directive") are fine — they're for human reading, not graph queries.
- A `[[wikilink]]` in body prose is a load-bearing reference — heal-fractal-links will check it. Don't put load-bearing references there; put them in frontmatter.
- When you add a new relationship type, add a new frontmatter field. Don't smuggle it into a body section.
