---
name: phase-review
description: After a phase completes, review all code changes made and send a concise diff review via WhatsApp. Covers what changed, why it matters, any concerns, and a quality signal.
---

# Phase Review

Run this after a phase completes to get a concise review of all changes made.

## Inputs

Required (read from context or arguments):
- `repo_path` — the repo where changes were made
- `project_id` — project name
- `phase_label` — phase name/number
- `whatsapp_number` — recipient phone (E.164 format)
- `whatsapp_api_url` — CallMeBot or equivalent API URL

## What to do

### Step 1 — Get the diff

Run:
```bash
git -C <repo_path> diff HEAD~1 --stat
git -C <repo_path> diff HEAD~1 -- '*.ts' '*.tsx' '*.js' '*.py' '*.go' '*.rs' '*.md'
```

If `HEAD~1` fails (first commit), use:
```bash
git -C <repo_path> show --stat HEAD
```

### Step 2 — Analyse the changes

Review the diff and write a concise assessment covering:

**Changed:** List the files modified, grouped by concern (e.g. "API routes", "UI components", "tests").

**What it does:** 1–2 sentences on the functional change.

**Quality signals:**
- ✅ Tests added/updated
- ✅ Types correct
- ⚠️ No tests for new logic
- ⚠️ Large function (>50 lines)
- 🚫 TODO left in code
- 🚫 Hardcoded values that should be config

**Concerns:** Any specific issues to review.

**Verdict:** `LGTM` / `REVIEW NEEDED` / `NEEDS WORK`

### Step 3 — Format for WhatsApp

Keep it under 1000 chars. Format:

```
🔍 Phase Review: [phase_label]
Project: [project_id]

Changed: [file count] files
[brief what it does]

Quality:
[signal emojis and brief notes]

Verdict: [LGTM/REVIEW NEEDED/NEEDS WORK]
```

### Step 4 — Send via WhatsApp

Use the notify configuration from `onyx.config.json`:

```bash
curl -s "<whatsapp_api_url>?phone=<number>&text=<url-encoded-message>&apikey=<key>"
```

Or the onyx notify helper is invoked automatically from `src/skills/phaseReview.ts` when the phase completes.

### Step 5 — Write review to log note

Append the full review to the phase log note:
`<bundle_dir>/Logs/L<num> - <phase_name>.md`

Format:
```markdown
### [timestamp] — PHASE REVIEW

**Verdict:** LGTM

[full review text]
```

## Auto-invocation

This skill runs automatically in `src/controller/loop.ts` after a phase completes, if `config.llm.apiKey` is set. No manual invocation needed.

## Configuration

In `onyx.config.json`:
```json
{
  "notify": {
    "whatsapp": {
      "apiUrl": "https://api.callmebot.com/whatsapp.php",
      "recipient": "+447700900000"
    }
  }
}
```

Or via environment variables:
```env
WHATSAPP_RECIPIENT=+447700900000
WHATSAPP_API_KEY=your-callmebot-key
```
