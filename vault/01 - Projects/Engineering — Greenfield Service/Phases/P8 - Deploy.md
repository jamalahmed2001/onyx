---
project: Engineering — Greenfield Service
phase_number: 8
phase_name: Deploy
status: backlog
profile: engineering
directive: general
blocked_by: [7]
tags:
  - project-phase
  - phase-backlog
created: 2026-04-27T00:00:00Z
up: Engineering — Greenfield Service - Phases Hub
---
## 🔗 Navigation

**UP:** [[Engineering — Greenfield Service - Phases Hub|Phases Hub]]

# P8 — Deploy

## Overview

Push to the deploy target. Verify live. Rehearse the rollback. The agent does not auto-deploy without operator authorisation — deploy is one of the actions [[08 - System/ONYX Master Directive.md|Master Directive]] flags as risky.

## Tasks

- [ ] Confirm the deploy target is provisioned and credentials are available.
- [ ] Build the deploy artefact (container image / package / bundle / etc. per stack).
- [ ] **Surface for operator approval** — show what will be deployed and ask before pushing. Don't auto-push to prod.
- [ ] After approval: deploy. Capture the deploy log.
- [ ] Hit the deployed health endpoint — confirm 200 / equivalent.
- [ ] Run the manual exercise from P5/P6 against the deployed instance — confirm it works.
- [ ] **Rehearse the rollback**: redeploy the previous version (or simulate). Confirm the rollback path works *now*, before a real incident.
- [ ] Record the deploy in `Phases/P8 - Deploy - Ledger.md` — what version, what target, what time, what verified.

## Acceptance Criteria

- [ ] Deployed artefact is live and reachable.
- [ ] Health endpoint returns 200 (or equivalent).
- [ ] Manual exercise passes against the deployed instance.
- [ ] Rollback rehearsed and confirmed to work.
- [ ] Deploy ledger committed.

## Human Requirements

<!-- None — phase completed successfully -->
