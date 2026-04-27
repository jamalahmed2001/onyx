---
title: consolidate-children (redirect)
tags:
  - system
  - operation
  - onyx
  - consolidate
  - redirect
type: operation-directive
version: 0.3
created: 2026-04-27
updated: 2026-04-27
graph_domain: system
up: Operations Hub
status: superseded
superseded_by: "[[consolidate]]"
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]

# Operation: consolidate-children (superseded)

> **Superseded 2026-04-27 by [[consolidate]] v1.0.** Tabulating shots/takes/beats into a parent node IS consolidating children into a parent — same operation as bundle-collapse. The previous "tier 3" distinction was artificial. Use [[consolidate]] instead.
>
> This file remains as a redirect to keep existing wikilinks resolvable.

## What changed

- **Tier/mode artifice removed.** The agent reads the children and picks the right shape (tables for structured children, prose for narrative ones, mixed for both) — that's not a mode, it's just doing the job intuitively.
- **Idempotency markers unchanged.** `<atom>s_absorbed_count` + `<atom>s_archive_path` still work — the new operation reads them as before.
- **Archived artefacts unaffected.** E01 + E02 shot tables (absorbed under the previous version) need no migration.

See [[consolidate]] for the canonical procedure.
