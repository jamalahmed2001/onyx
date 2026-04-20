---
tags: [hub-subdomain, status-active]
graph_domain: system
status: active
---
## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]

# Agent Skills Hub

> Registered skills. Each entry points at a Skill Overview describing what the skill does, how it's invoked, and where it lives. Implementation source is under `~/clawd/skills/<name>/` (or in this repo's `skills/` for controller-internal skills).

---

## Agent Execution

- [[agent-spawn - Skill Overview|agent-spawn]] — Spawn Claude Code or Cursor agent against a repo.
- [[onyx-controller - Skill Overview|onyx-controller]] — Top-level ONYX orchestrator: placement → sync → atomiser → planner → executor → notify.
- [[context-orchestrator - Skill Overview|context-orchestrator]] — Generate compact QMD context packets for ONYX phase tasks.

## Integrations

- [[linear-fetch - Skill Overview|linear-fetch]] — Fetch Linear projects and issues via GraphQL.
- [[linear-uplink - Skill Overview|linear-uplink]] — Bidirectional sync from vault to Linear (create issues, update states, add comments).
- [[notion-context - Skill Overview|notion-context]] — Fetch project-scoped context from Notion via REST API.
- [[notify-phase - Skill Overview|notify-phase]] — Compose and deliver ONYX run summaries.
- [[rss-fetch - Skill Overview|rss-fetch]] — Fetch and parse RSS/Atom feeds.

## Media & Content

- [[whisper-groq - Skill Overview|whisper-groq]] — Transcribe audio files via Groq Whisper API.
- [[elevenlabs-tts - Skill Overview|elevenlabs-tts]] — Text-to-speech via ElevenLabs.
- [[audio-master - Skill Overview|audio-master]] — Audio mastering chain (ffmpeg): LUFS normalisation, limiter, ducking.
- [[suno - Skill Overview|suno]] — Music generation + library management via Suno (CDP-attached Chrome).
- [[pubmed-search - Skill Overview|pubmed-search]] — Query PubMed / research databases.
- [[remotion-best-practices - Skill Overview|remotion-best-practices]] — Reference doc for Remotion video rendering.

## Distribution

- [[spotify-creators - Skill Overview|spotify-creators]] — Upload/list podcast episodes on Spotify for Creators.
- [[music-distro - Skill Overview|music-distro]] — Ship music releases to DistroKid / TuneCore / Amuse (pluggable providers).
- [[rss-publish - Skill Overview|rss-publish]] — Generate / update a podcast RSS feed.
- [[youtube-publish - Skill Overview|youtube-publish]] — Upload a video to YouTube.
- [[youtube-comments - Skill Overview|youtube-comments]] — Fetch top comments / metrics.
- [[tiktok-publish - Skill Overview|tiktok-publish]] — Post a short-form video to TikTok.
- [[instagram-publish - Skill Overview|instagram-publish]] — Post to Instagram (Reels / feed).
- [[analytics-pull - Skill Overview|analytics-pull]] — Pull per-episode metrics from YouTube.

## Personal & Productivity

- [[plan-my-day - Skill Overview|plan-my-day]] — Generate energy-optimized, time-blocked daily plan.

## Infrastructure & Tooling

- [[headless-browser - Skill Overview|headless-browser]] — Launch and control headless Chrome for screenshots, PDFs, debugging.
- [[browser-automate - Skill Overview|browser-automate]] — Generic Playwright engine with per-site recipes; CDP daemon mode.
- [[cloudflare-dns-sync - Skill Overview|cloudflare-dns-sync]] — Idempotent Cloudflare DNS record upsert (DDNS, static MX/SPF/DMARC).
- [[housekeeping - Skill Overview|housekeeping]] — Run local cleanup scripts (backups, logs, disk usage, cron sanity checks).
- [[obsidian - Skill Overview|obsidian]] — Read, write, search Obsidian vault markdown files directly.
- [[project-health - Skill Overview|project-health]] — Run health checks on ONYX setup, integrations, usage snapshots.

## Utilities

- [[prompt-optimizer - Skill Overview|prompt-optimizer]] — Evaluate and optimize prompts using proven techniques.
- [[clawdbot-cost-tracker - Skill Overview|clawdbot-cost-tracker]] — Track token usage and estimate API costs across sessions.
- [[image-resize - Skill Overview|image-resize]] — Resize / crop / format-convert images.
- [[pdf-extract - Skill Overview|pdf-extract]] — Extract text and structure from PDF files.
- [[comment-safety-filter - Skill Overview|comment-safety-filter]] — Classify / filter user comments for moderation pipelines.
- [[notify - Skill Overview|notify]] — Send notification via WhatsApp / email / desktop.

## Native (Claude built-ins, documented for reference)

- [[vault-read - Skill Overview|vault-read]] — Built-in `Read` / `Grep` / `Glob` against the vault.
- [[vault-write - Skill Overview|vault-write]] — Built-in `Write` / `Edit` against vault markdown.
- [[web-fetch - Skill Overview|web-fetch]] — Built-in `WebFetch` for HTTP(S) GETs.
- [[web-search - Skill Overview|web-search]] — Built-in `WebSearch` for general queries.
