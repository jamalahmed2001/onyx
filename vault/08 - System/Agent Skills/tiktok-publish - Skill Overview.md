---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: tiktok-publish
source_skill_path: ~/clawd/skills/tiktok-publish/SKILL.md
updated: 2026-04-17
up: Agent Skills Hub
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# tiktok-publish

> Upload to TikTok via the Content Posting API. Asynchronous — returns a `publish_id`; poll `--check-status` until the video is live.

## When a directive should call this

- Publishing a 9:16 clip to a specific TikTok account
- Draft mode (`--privacy SELF_ONLY`) — safest default, video lands in drafts for human review
- Public mode — requires the TikTok app to be approved for public posting

## When NOT to call this

- Anything requiring a live URL immediately — TikTok processes asynchronously; use status polling
- Cross-posting to other platforms — call the sister skills separately

## How to call it

```bash
~/clawd/skills/tiktok-publish/bin/tiktok-publish \
  --account-ref maniplus \
  --video ./out-9x16.mp4 \
  --title "Episode 8 — 60s preview" \
  --privacy PUBLIC_TO_EVERYONE \
  --cover-timestamp-ms 1500

# Later — poll status
~/clawd/skills/tiktok-publish/bin/tiktok-publish \
  --account-ref maniplus \
  --check-status <publish_id>
```

Emits structured JSON on stdout (success) or stderr (error with classification).

## Credentials

`~/.credentials/tiktok-<account-ref>.env` with `TIKTOK_ACCESS_TOKEN` (Content Posting scope — `video.publish`). Tokens expire; refresh via your OAuth flow.

## Currently used by

| Project | Directive | Which video(s) |
|---|---|---|
| ManiPlus | `maniplus-distributor` | Short clips from each episode |
| Cartoon Remakes | `cartoon-launch-ops` | Every episode as TikTok post (primary platform) |

## See also

- [[youtube-publish - Skill Overview|youtube-publish]]
- [[instagram-publish - Skill Overview|instagram-publish]]
