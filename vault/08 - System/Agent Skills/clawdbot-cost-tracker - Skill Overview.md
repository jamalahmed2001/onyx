---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: clawdbot-cost-tracker
source_skill_path: ~/clawd/skills/clawdbot-cost-tracker/SKILL.md
updated: 2026-03-25
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# clawdbot-cost-tracker

> Track Clawdbot AI model usage and estimate costs. Use when reporting daily/weekly costs, analyzing token usage across sessions, or monitoring AI spending. Supports Claude (opus/sonnet), GPT, and Codex models.

# Clawdbot Cost Tracker

Track token usage and estimate API costs across all Clawdbot sessions.

## ⚡ Quick Reference (Most Accurate)

```bash
# 1. Get ALL sessions (high limit)
sessions_list --limit 100

# 2. For each session, read transcript to find:
#    - Actual model used
#    - Total tokens consumed
#    Read: .clawdbot/agents/main/sessions/{sessionId}.jsonl

# 3. Calculate cost per model
#    Claude Sonnet: tokens × $11.4 / 1,000,000 (30% input, 70% output)
#    Claude Opus: tokens × $57 / 1,000,000 (30% input, 70% output)
#    GPT-4o: tokens × $7.75 / 1,000,000 (30% input, 70% output)

# 4. Sum all costs → total estimated cost
# 5. Verify against OpenRouter dashboard
```

## Quick Start

### Get Current Usage

**CRITICAL:** Use `sessions_list` with a HIGH limit to capture ALL sessions including subagents:

```bash
# Get ALL sessions (subagents are often >50)
sessions_list --limit 100 --messageLimit 0
```

**Then read transcript files for actual model usage:**
- `sessions_list` only shows summary data
- Subagent sessions may use different models than main session
- Read transcript JSONL files to get accurate model names and tokens

### Calculate Cost

**Model pricing (USD per million tokens):**

| Provider/Model | Input | Output | Notes |
|----------------|-------|--------|-------|
| **Anthropic** | | | |
| claude-opus-4-5 | $15.00 | $75.00 | Premium |
| claude-sonnet-4 | $3.00 | $15.00 | Standard |
| claude-haiku-4 | $0.80 | $4.00 | Fast |
| **OpenAI** | | | |
| gpt-4o | $2.50 | $10.00 | Flagship |
| gpt-4o-mini | $0.15 | $0.60 | Budget |
| gpt-4-turbo | $10.00 | $30.00 | Legacy |
| **OpenRouter Models** | | | |
| z-ai/glm-4.7 | $? | $? | CHECK PRICING |
| openai/gpt-4o | $2.50 | $10.00 | Via OpenRouter |

**Cost formula (assuming 30% input, 70% output):**
```
cost = tokens * (0.3 * input_price + 0.7 * output_price) / 1,000,000
```

**⚠️ WARNING:** Always verify actual model pricing from provider dashboard. Estimates can be wrong by 10-100x.

## Daily Tracking

### ⚠️ CRITICAL: Accurate Cost Tracking

**The problem with simple snapshots:**
1. `sessions_list` may miss subagent sessions (limit too low)
2. Model field may not reflect actual model used (agent can override)
3. Need to read transcript files to get TRUE token counts and models

### Step 1: Get All Sessions

```bash
# Get ALL sessions (use high limit)
sessions_list --limit 100 --messageLimit 0
```

### Step 2: Read Transcript Files

For each session, read the transcript to get actual usage:

```json
// Transcript format (JSONL lines)
{
  "role": "assistant",
  "model": "anthropic/claude-sonnet-4",
  "usage": {
    "inputTokens": 50000,
    "outputTokens": 20000,
    "totalTokens": 70000
  }
}
```

### Step 3: Calculate Accurate Costs

```bash
# Sum all usage across ALL transcript files
# Use ACTUAL model name, not session model
# Apply correct pricing for each model
```

### Save Usage Snapshot

Store comprehensive snapshots in `memory/usage/YYYY-MM-DD.json`:

```json
{
  "date": "2026-02-02",
  "timestamp": "2026-02-02T11:00:00+00:00",
  "sessions": {
    "agent:main:main": {
      "model": "openrouter/z-ai/glm-4.7",
      "totalTokens": 38745,
      "channel": "whatsapp",
      "verified": true
    },
    "agent:main:subagent:project-monitor": {
      "model": "anthropic/claude-sonnet-4",
      "totalTokens": 55200,
      "channel": "background",
      "verified": true
    }
  },
  "summary": {
    "totalSessions": 50,
    "totalTokens": 500000,
    "byModel": {
      "anthropic/claude-sonnet-4": 300000,
      "openrouter/z-ai/glm-4.7": 200000
    }
  },
  "estimatedCost": {
    "anthropic/claude-sonnet-4": 300000 * (0.3*3 + 0.7*15) / 1000000,
    "openrouter/z-ai/glm-4.7": 200000 * (0.3*? + 0.7*?) / 1000000,
    "totalUSD": 3.9
  },
  "disclaimer": "Estimates only. Check OpenRouter dashboard for actual costs."
}
```

## Scripts

### `scripts/snapshot-usage.js`

Creates a usage snapshot from current session data.

```bash
node scripts/snapshot-usage.js [output-dir]
# Default output: memory/usage/YYYY-MM-DD.json
```

### `scripts/calculate-cost.js`

Calculates cost for a date range.

```bash
node scripts/calculate-cost.js [date]
# Default: today
# Output: JSON with token delta and estimated cost
```

## Integration with Daily Report

Add to HEARTBEAT.md:
1. Call `sessions_list` to get current tokens
2. Load previous day's snapshot from `memory/usage/`
3. Calculate delta and estimate cost
4. Include in daily report format:
   ```
   💰 **Clawdbot Cost** (yesterday)
   • Used: 45.2k tokens
   • Estimated: ~$1.23
   ```

## Color Conventions (Chinese Style)

For financial displays in Chinese context:
- 🔴 Red = Up/Increase
- 🟢 Green = Down/Decrease

---

## 🚨 Troubleshooting Cost Estimates

### Problem: Estimate is way off (e.g., $0.08 vs actual $100)

**Common causes:**

1. **Missing Sessions**
   - `sessions_list` limit too low (subagents not captured)
   - Fix: Use `--limit 100` or higher

2. **Wrong Model Pricing**
   - Using GLM 4.7 pricing, but subagents used Claude Sonnet/Opus
   - Fix: Read transcript files to get ACTUAL model names

3. **Subagent Visibility**
   - Subagents spawn their own sessions
   - Fix: Check for sessions with `kind: subagent` or `sessionKey: agent:main:subagent:*`

4. **Incorrect Pricing Table**
   - OpenRouter GLM pricing not documented
   - Fix: Check OpenRouter pricing page or use provider dashboard

### How to Debug

```bash
# 1. Get all sessions (high limit)
sessions_list --limit 100

# 2. Check transcript path for each session
#    Look at: .clawdbot/agents/main/sessions/{sessionId}.jsonl

# 3. Read transcript to find actual model
grep '"model"' .clawdbot/agents/main/sessions/*.jsonl | sort | uniq -c

# 4. Sum tokens by actual model used
grep '"totalTokens"' .clawdbot/agents/main/sessions/*.jsonl
```

### Verification Steps

1. **Compare with Provider Dashboard**
   - OpenRouter dashboard shows actual daily spend
   - If estimate is 10x+ different, something is wrong

2. **Check Subagent Activity**
   - Use `sessions_list --kinds subagent` to find subagents
   - Subagents often use more expensive models

3. **Verify Model Overrides**
   - Agents can override default model via `model` parameter
   - Check transcript for actual `model` field value

### Example Debug Session

```
User: "My estimate is $0.08 but dashboard shows $100"

Fix:
1. sessions_list --limit 100 → Found 50 sessions (was only showing 10)
2. Read transcripts → Found subagents used Claude Sonnet, not GLM
3. Recalculate:
   - GLM sessions: 168k tokens × $0.465/M = $0.08
   - Claude sessions: 6M tokens × $11.4/M = $68.40
   - Total estimate: $68.48 (closer to $100, remaining discrepancy from other models)
```

---

## Best Practices

1. **Always use high limit in sessions_list** (≥100)
2. **Read transcript files** to get actual models
3. **Check provider dashboard** for ground truth
4. **Document pricing assumptions** in snapshot files
5. **Include disclaimer** that estimates are approximate
6. **Update pricing table** when models/prices change
