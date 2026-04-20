---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: music-distro
source_skill_path: ~/clawd/skills/music-distro/SKILL.md
updated: 2026-04-19
up: Agent Skills Hub
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# music-distro

> Music release distribution across services without public upload APIs (DistroKid, TuneCore, Amuse, RouteNote, UnitedMasters, Ditto). Pluggable provider via `MUSIC_DISTRO_PROVIDER`. Default: DistroKid.

## When a directive should call this

- Shipping a finished master (Suno or otherwise) to streaming platforms via an indie distributor the user pays for
- Listing or checking status of releases in the distributor's dashboard

## When NOT to call this

- Podcast distribution → `spotify-creators`
- Label/enterprise distribution with a real contract → use the label's provided tools
- Large batch (50+ releases in a week) — distributors throttle this

## How to call it

```bash
export MUSIC_DISTRO_PROVIDER=distrokid   # default; or tunecore, amuse, etc.

music-distro release-create \
  --audio ./mastered.mp3 \
  --title "Quiet Resolve" \
  --artist "Mani+" \
  --art ./cover-3000.jpg \
  --release-date 2026-05-20 \
  --genre "Alternative" \
  --language "English" \
  --ai-generated

music-distro release-list [--limit 50] [--output releases.json]
music-distro release-status --release-id <id>
```

## Safety defaults

- **Does NOT auto-click "Confirm & Distribute"** — fills the form and leaves the wizard open in the daemon Chrome for manual review. Prevents accidental release of misconfigured tracks.
- **Release date** defaults to today + 4 weeks (DistroKid's minimum for Spotify editorial + pre-save).

## Providers

Implemented: **distrokid** ✅
Stubs: tunecore, amuse, routenote, unitedmasters, ditto (add recipe function in `src/cli.ts` to activate)

## Prerequisites

- Signed in to your distributor in daily Chrome (daemon inherits)
- `browser-automate daemon` running (auto-starts)
- Cover art ≥ 3000×3000 (most distributors enforce)
- AI disclosure flag required since 2025 — use `--ai-generated`

See `~/clawd/skills/music-distro/SKILL.md` for full reference.
