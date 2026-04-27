---
tool: analytics-pull
type: npm
repo: /path/to/your/repo
script: analytics:pull
free: true
open_source: true
tags: [tool, analytics, npm]
up: Agent Skills Hub
---

# analytics-pull

> Pull weekly analytics from YouTube Studio and/or Google Analytics 4. Writes a structured JSON file for the analyst agent (R7) to process.

## Invocation

```bash
cd /path/to/your/repo
npm run analytics:pull -- --week 2026-04-14
```

## Inputs

| Flag | Type | Required | Notes |
|---|---|---|---|
| `--week` | date | yes | ISO date of the Monday starting the week (`YYYY-MM-DD`) |
| `--dry-run` | flag | no | Fetch but don't write output |

## Outputs

Writes to `vault/analytics/<week>.json`:

```json
{
  "week": "2026-04-14",
  "views": 1240,
  "watchTimeHours": 312,
  "subscribers": { "gained": 18, "lost": 3 },
  "topEpisode": { "id": "E08", "views": 540 }
}
```

## Auth

Requires in `.env`:
```
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REFRESH_TOKEN=...
GA4_PROPERTY_ID=...        # optional, for web analytics
GOOGLE_SERVICE_ACCOUNT_KEY=... # optional, for GA4
```

## Notes

- YouTube Analytics API is free (part of Data API v3 quota)
- Run once per week, typically as part of R7 (Learn phase)
