---
project: Engineering — Greenfield Service
phase_number: 7
phase_name: Hardening
status: backlog
profile: engineering
directive: security-analyst
blocked_by: [6]
tags:
  - project-phase
  - phase-backlog
created: 2026-04-27T00:00:00Z
up: Engineering — Greenfield Service - Phases Hub
---
## 🔗 Navigation

**UP:** [[Engineering — Greenfield Service - Phases Hub|Phases Hub]]

# P7 — Hardening

## Overview

Move the service from "works for me" to "works under real conditions". Secrets externalised. Error paths tested. Lints clean. Security headers correct. Rate limits sane. Logging informative.

This phase uses the `security-analyst` directive — it's a defence-in-depth pass, not just code review.

## Tasks

- [ ] Move every secret out of code into the deploy target's secret store (env vars / secret manager). Confirm with `grep` that no secrets remain in the repo.
- [ ] Add input validation at the public interface — reject malformed inputs early with explicit error responses.
- [ ] Set security headers (HSTS, CSP, X-Content-Type-Options, etc.) for HTTP services. For non-HTTP services, document the equivalent.
- [ ] Add rate limiting at the public interface — sane defaults; document the cap.
- [ ] Log structured (JSON or equivalent), one line per request / event, with a correlation ID.
- [ ] Run security-relevant lints (`npm audit`, `pip-audit`, `gosec`, etc. — whatever applies).
- [ ] Document operational runbook: how to roll back, how to flush a stuck state, how to read the logs, where alerts fire.

## Acceptance Criteria

- [ ] No secrets in the repo (`grep` clean for known-secret patterns).
- [ ] Security lints pass (or known issues acknowledged in `Phases/P7 - Hardening - Decisions.md`).
- [ ] Logs are structured and include correlation IDs.
- [ ] Rate limit configured.
- [ ] Operational runbook committed.
- [ ] `test_command` exits 0.

## Human Requirements

<!-- None — phase completed successfully -->
