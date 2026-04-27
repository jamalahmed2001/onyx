---
title: absorb-shots (redirect)
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

# Operation: absorb-shots (superseded)

> **Superseded 2026-04-27 by [[consolidate]] v1.0.** Absorbing shot files into an episode parent IS consolidating children into a parent — the same single principle as bundle collapse. The "absorb-shots" name was specific to one media-bundle shape; the unified [[consolidate]] handles every children-into-parent case generically.
>
> This file remains as a redirect so existing wikilinks resolve.

## What changed

- The agent reads the children, picks the right shape (table for structured children like shots/takes/beats; prose for narrative ones; mixed for both), and writes a single info-dense parent node.
- Idempotency markers (`<atom>s_absorbed_count`, `<atom>s_archive_path`) still work — the unified operation reads them as before.
- Already-absorbed E01 / E02 shot tables need no migration.

See [[consolidate]] for the canonical procedure.
