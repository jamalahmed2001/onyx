---
title: Doctor Directive
tags:
  - system
  - directive
  - doctor
  - onyx
  - preflight
type: directive
replaces: src/cli/doctor.ts
lines_replaced: 271
version: 0.1
created: 2026-04-24
updated: 2026-04-24
graph_domain: system
up: System Hub
status: draft
migration_stage: 1
---
## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]
**Related:** [[08 - System/ONYX Master Directive.md|ONYX Master Directive]] · [[08 - System/Operations/_tools.md|Tool Catalog]] · [[08 - System/ONYX - Decomposition Plan.md|Decomposition Plan]]

# Doctor Directive

> **Role.** You are running pre-flight health checks on an ONYX installation. Read this file, execute every check in order, and report a structured status. Do not skip checks. Do not invent fixes — if a check fails, report the exact fix command listed here.
>
> **Output format.** For every check, emit one line:
> ```
> [✓|⚠|✗] <check label>
>          Fix: <one-line fix command or instruction>   (only if not ✓)
> ```
> End with a summary line: `All checks passed` or `N fix(es) needed`.
>
> **Exit behaviour.** If any ✗ (hard fail) check fails, tell the caller to fix before proceeding. ⚠ (warn) checks are non-blocking.

---

## 1. Repository + config

### Check 1.1 — `onyx.config.json` found
Use Read on `onyx.config.json` in the current working directory.
- ✓ if file exists
- ✗ if missing
- **Fix:** `cp onyx.config.json.example onyx.config.json`

### Check 1.2 — `onyx.config.json` is valid JSON
Parse the file contents.
- ✓ if parses cleanly
- ✗ if parse error
- **Fix:** Check for syntax errors in onyx.config.json

Extract `vault_root` (or `vaultRoot`) and `agent_driver` (or `agentDriver`, default `claude-code`) for later checks.

### Check 1.3 — `.env` file found
Use Read on `.env`.
- ✓ if exists
- ✗ if missing
- **Fix:** `cp .env.example .env` then fill in your keys

---

## 2. Vault

### Check 2.1 — `vault_root` configured
Check either `ONYX_VAULT_ROOT` environment variable OR `vault_root` field in `onyx.config.json`.
- ✓ if at least one is set
- ✗ if both missing
- **Fix:** Set `vault_root` in `onyx.config.json`, or `ONYX_VAULT_ROOT` in `.env`

### Check 2.2 — Vault directory exists
Use Read / Glob on the resolved vault root path.
- ✓ if directory exists
- ✗ if path does not exist
- **Fix:** `mkdir -p "<vault-root>"` or update `vault_root`

### Check 2.3 — Vault write access
Attempt to Write a test file `<vault-root>/.onyx-write-test` containing `ok`, then delete it via Bash `rm`.
- ✓ if write + delete both succeed
- ✗ otherwise
- **Fix:** Check permissions: `ls -la "<vault-root>"`

---

## 3. API keys + auth

### Check 3.1 — `OPENROUTER_API_KEY` set
Check for `OPENROUTER_API_KEY` OR (fallback) `ANTHROPIC_API_KEY` in environment.
- ✓ if at least one present
- ✗ if both missing
- **Fix:** Add `OPENROUTER_API_KEY=sk-or-...` to `.env`

### Check 3.2 — OpenRouter API key valid
If a key is present, use WebFetch to `https://openrouter.ai/api/v1/models` with `Authorization: Bearer <key>`, timeout 5s.
- ✓ if 2xx response
- ✗ if 4xx response → **Fix:** Check your key at https://openrouter.ai/keys
- ⚠ if network timeout → **Fix:** Network check timed out — key may still be valid; verify manually with `curl -s https://openrouter.ai/api/v1/models -H "Authorization: Bearer $OPENROUTER_API_KEY" | head -1`

---

## 4. Agent driver

### Check 4.1 — Agent binary on PATH
Based on `agent_driver` from config:
- If `claude-code` (default): run `which claude` via Bash. ✓ if exit 0; ✗ otherwise. **Fix:** `npm install -g @anthropic-ai/claude-code`
- If `cursor`: run `which cursor` via Bash. ✓ if exit 0; ✗ otherwise. **Fix:** Install Cursor from https://cursor.sh and ensure CLI is in PATH

### Check 4.2 — Agent authenticated
Only runs if Check 4.1 passed.

For `claude-code`:
- Check if `ANTHROPIC_API_KEY` is in env OR `~/.claude/` directory exists and contains credentials / auth / .json files (use Glob).
- ✓ if either
- ⚠ if neither → **Fix:** `claude login` or set `ANTHROPIC_API_KEY` in `.env`

For `cursor`:
- ⚠ always (session-based, can't be checked statically) → **Fix:** If agent calls fail, open Cursor and sign in first

---

## 5. Node + build

### Check 5.1 — Node.js ≥ 18
Run `node --version` via Bash. Parse major version.
- ✓ if major ≥ 18
- ✗ otherwise
- **Fix:** Upgrade Node.js: https://nodejs.org

### Check 5.2 — Dependencies installed
Use Read / Glob on `node_modules/fast-glob`.
- ✓ if exists
- ✗ otherwise
- **Fix:** `npm install`

### Check 5.3 — Project built
Use Read on `dist/cli/onyx.js`.
- ✓ if exists
- ✗ otherwise
- **Fix:** `npm run build`

---

## 6. Vault health (only if §2 all passed)

### Check 6.1 — No stuck active phases
Use Glob `<vault>/**/Phases/*.md`. For each phase file, Read frontmatter. If `status: active` (or `phase-active` tag), parse `locked_at:` timestamp. If missing OR older than 10 minutes, count as stuck.
- ✓ if count is 0
- ⚠ if count > 0 → **Fix:** `onyx heal` (will clear stale locks). Stuck phase names: `<list>`

### Check 6.2 — All phases have `project_id`
For every phase found above, check frontmatter has `project_id:` or `project:`.
- ✓ if all do
- ⚠ if any missing → **Fix:** `onyx heal` (will backfill from Overview)

### Check 6.3 — Phase count reported
Output: `Vault: <N> phase(s) found`. Always ✓.

---

## 7. Skills + profiles (extended check, optional)

Run if `--full` flag or equivalent depth is requested.

### Check 7.1 — Every declared skill has prereqs
For each skill in `08 - System/Agent Skills/`, read its Skill Overview. If it declares required env vars or binaries, verify each is present.
- ✓ per-skill if all prereqs met
- ⚠ otherwise, listing the missing prereq

### Check 7.2 — Every project profile resolvable
Use Glob to find all `Overview.md` files in project bundles. For each, read `profile:` frontmatter field. Verify `08 - System/Profiles/<name>.md` exists.
- ✓ if all resolve
- ✗ if any project references a profile that doesn't exist

---

## 8. Summary

After all checks, count ✗ (hard fail) and ⚠ (warn) separately.

- `0 hard, 0 warn` → `All checks passed. Ready to run:` plus next-step hints (`onyx init "My Project"`, `onyx run`).
- `0 hard, N warn` → `Passed with N warning(s). Review above before running.`
- `N hard` → `Fix the N issue(s) above, then run doctor again.` Suggest the caller return non-zero.

---

## 9. How to invoke

From the CLI:
```bash
onyx doctor           # runs §1–§6
onyx doctor --full    # also runs §7
```

From an agent directly:
```
claude --append-system "$(cat '08 - System/ONYX Master Directive.md' '08 - System/Doctor Directive.md')" \
  --dir <repo-root> \
  --print "Run the Doctor Directive now."
```

---

## 10. What gets retired when this goes active

When [[08 - System/Operations/_agent-native-validation.md|the Doctor Directive probe]] passes:

- `src/cli/doctor.ts` (271 LOC) deleted.
- `onyx doctor` binary collapses to: load this directive + invoke agent with the prompt `"Run the Doctor Directive now."`

The only code remaining for health checks is the 3-line shell dispatcher.
