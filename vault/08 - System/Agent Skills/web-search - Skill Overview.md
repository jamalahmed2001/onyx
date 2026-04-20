---
tool: web-search
type: native
free: true
open_source: true
tags: [tool, research, native]
up: Agent Skills Hub
---

# web-search

> Search the web using Claude's built-in `WebSearch` tool. No invocation needed — use it directly.

## Use when

- Finding recent news, research, or events (past the knowledge cutoff)
- Verifying facts with primary sources
- Broad topic discovery before narrowing to PubMed or specific sources

## Inputs

| Field | Type | Notes |
|---|---|---|
| `query` | string | Natural language or keyword query |
| `max_results` | int | Optional. Default varies by model. |

## Outputs

Array of results: `{ title, url, snippet }`. Follow URLs with `web-fetch` for full content.

## Notes

- Prefer specific queries over broad ones — "transplant rejection immunosuppression 2025" beats "transplant news"
- For medical/scientific content, follow up with `pubmed-search` for peer-reviewed sources
- Not suitable for real-time data (prices, live scores) — use a dedicated API tool instead
