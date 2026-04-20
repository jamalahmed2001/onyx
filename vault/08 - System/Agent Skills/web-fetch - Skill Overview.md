---
tool: web-fetch
type: native
free: true
open_source: true
tags: [tool, research, native]
up: Agent Skills Hub
---

# web-fetch

> Fetch the content of a URL using Claude's built-in `WebFetch` tool. Returns page text, stripped of most HTML.

## Use when

- Reading a specific article, paper, or page found via `web-search`
- Checking the full content of a source before summarising
- Scraping structured data from a known URL (no JS rendering needed)

## Inputs

| Field | Type | Notes |
|---|---|---|
| `url` | string | Full URL including scheme |

## Outputs

Page text content. HTML tags are stripped; markdown structure is preserved where possible.

## Notes

- For JavaScript-heavy pages (SPAs, paywalled content), use `screenshot` instead
- For PDFs served at a URL, download and pipe through `pdf-extract`
- Rate-limit heavy crawls — add delays between sequential fetches
