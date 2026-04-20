---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: suno
source_skill_path: ~/clawd/skills/suno/SKILL.md
updated: 2026-04-19
up: Agent Skills Hub
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# suno

> API-shaped CLI for Suno (music generation). Full-library walk, track download, new-track generation, and grouped analytics across persona / model / gen_type / is_public. Drives the signed-in web UI via browser-automate CDP — no paid gateways, no unofficial API keys.

## When a directive should call this

- Generating a backing soundbed or album track under the user's paid Suno Pro subscription
- Listing or downloading previously-generated tracks
- Any "music from prompt" workflow

## When NOT to call this

- Voice / speech synthesis → `elevenlabs-tts`
- Sound effects → use an SFX library directly
- High-volume batch generation — Suno caps per-account; this is one-account work

## How to call it

```bash
# Full-library walk — paginates /api/feed/v2 (0-indexed) via captured bearer; 429 backoff.
# Auto-enriches persona_name; workspace_name filled when --workspace is passed.
suno library [--workspace <id>|default] [--limit 9999] [--since <iso>] [--public-only|--private-only] [--skip-names] [--output tracks.json]

# Workspaces (Suno calls them "projects" internally) with names + clip counts.
suno workspaces [--output ws.json]

# Personas (custom voices) with names.
suno personas [--output personas.json]

suno track --id <uuid>

suno download --id <uuid> --output ./track.mp3 [--with-cover] [--with-metadata]

# Grouped summary — by persona / workspace / project / model / gen_type / user / is_public.
# Uses resolved names when available (via library enrichment), else UUIDs.
suno groups --by persona [--library ./tracks.json] [--output grouped.json] [--min-count 2]

# Move one or more tracks into a workspace. Endpoint: POST /api/project/<src>/clips.
# --from-workspace defaults to 'default' — server figures the real source out from clip_ids.
suno move --track <uuid> --workspace <target-id>
suno move --tracks <uuid1>,<uuid2> --workspace <target-id> [--from-workspace <src-id>] [--dry-run]

suno generate \
  --prompt "warm British piano, 60 bpm, hopeful-melancholy" \
  --style "ambient piano, minimal, contemplative, instrumental" \
  --title "maniplus-bed-01" \
  --instrumental --count 2 \
  --output-dir ./out/
```

### Track metadata fields

Each track in `library` output has: `id`, `title`, `created_at`, `duration`, `tags`, `is_public`, `audio_url`, `image_url`, `workspace_id`, `workspace_name`, `persona_id`, `persona_name`, `project_id`, `user_id`, `model` (e.g. `chirp-fenix`, `chirp-crow`), `gen_type` (`gen` / `upload` / `edit_v3_export`), `prompt`, `parent_id`, `is_liked`.

### Endpoint cheat-sheet (for recipe maintenance)

- **Feed (global):** `GET https://studio-api-prod.suno.com/api/feed/v2?page=N` (0-indexed) → `{clips, num_total_results, has_more}`
- **Project (workspace):** `GET https://studio-api-prod.suno.com/api/project/<id>?page=N` (1-indexed!) → `{project_clips: [{clip}], clip_count}`
- **Workspaces list:** `GET /api/project/me?page=N&sort=max_created_at_last_updated_clip`
- **Personas list:** `GET /api/persona/get-personas/?page=N`
- **Playlists list:** `GET /api/playlist/me?page=N`
- **Clip detail:** `GET /api/clips/get_songs_by_ids?ids=<uuid>&ids=<uuid>...`
- **Move tracks into workspace:** `POST /api/project/<src-id>/clips` with body `{"update_type":"move","metadata":{"clip_ids":[...], "target_project_id":"<dest-id>"}}`

Host is `studio-api-prod.suno.com` (hyphen, not dot).

### Known gaps (roadmap)

- **Track → workspace membership** isn't exposed via the global feed endpoint. `suno library --workspace <id>` walks one workspace at a time; full-library-with-workspace-tags requires walking each workspace and merging — easy to wire up as a `--all-workspaces` flag if the need comes up.
- **Delete / trash track** endpoints not yet sniffed; similar pattern — sniff a UI trash action and wire up.
- **Workspace create / rename / delete** — not yet sniffed.

## Prerequisites

- Signed in to `suno.com` in daily Chrome (daemon inherits on first start)
- `browser-automate daemon` running (auto-starts)

## Output

Stdout JSON. `library` returns `{ ok, count, tracks }`; `download` returns `{ ok, mp3Path, bytes, metadata? }`; `generate` returns `{ ok, provider, tracks }` with local file paths.

See `~/clawd/skills/suno/SKILL.md` for full flag reference.
