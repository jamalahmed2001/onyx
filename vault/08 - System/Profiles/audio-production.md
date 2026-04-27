---
name: audio-production
type: profile
version: 1.0
required_fields:
  - voice_target_lufs
  - music_style_guide
phase_fields:
  - audio_input
  - audio_output
  - mix_mode
  - music_provider
init_docs:
  - Music Style Guide
tags: [onyx-profile]
---

## 🔗 Navigation

**UP:** [[08 - System/Profiles/Profiles Hub.md|Profiles Hub]]

# Profile: audio-production

> For phases that produce, master, mix, or layer audio — TTS narration, music generation, voice-over-music mixing, loudness-normalised podcast audio. This profile is an *add-on* to `content` for content projects that need audio pipelines; it can also be used standalone for non-narrative audio work (meditation tracks, music beds, podcast-only shows).

---

## When to use this profile

- A phase calls `elevenlabs-tts`, `suno-generate`, `audio-master`, `whisper-groq`, or any audio skill that produces/transforms audio files.
- A phase needs consistent loudness targets across episodes or tracks.
- A phase mixes multiple audio sources (voice + music, multiple voice takes, narration + SFX).

Use in combination with `content` for narrated podcast projects. Use alone for music-only or SFX-only projects.

---

## Required Overview fields

```yaml
profile: audio-production
voice_target_lufs: -16                                 # Apple Podcasts spec; YouTube re-normalises
music_style_guide: "./My Podcast - Music Style Guide.md" # relative path to project's music aesthetic doc
```

`voice_target_lufs` controls the mastering target in every audio stage. Typical values:
- `-14` — Spotify / YouTube Music
- `-16` — Apple Podcasts (default for spoken word)
- `-19` — broadcast / audiobook

`music_style_guide` tells every music-generating agent what the project's aesthetic is. Without it, the music producer has no design input and will produce inconsistent beds across episodes.

---

## Optional Overview fields

```yaml
music_provider: gateway                 # gateway | selfhosted — matches SUNO_PROVIDER
default_music_full_db: -18              # music level when voice is silent
default_music_duck_db: -32              # music level when voice is present
default_tail_seconds: 4                 # seconds of music after the final word
licence_tier: pro                       # suno tier the project operates under (pro | premier)
```

---

## Invariants (non-negotiable)

1. **Voice-first.** Music is never in front of the voice. If `--music-full-db > -10`, the phase must block for operator review — something is wrong.
2. **LUFS-normalised output.** Every audio artifact that leaves this profile has been through `audio-master master` at the project's `voice_target_lufs`. Raw TTS / raw Suno output is never shipped.
3. **No unlicensed music.** If `music_provider` is set, `licence_tier` must be `pro` or `premier` for commercial use. Free-tier output is for internal review only and must not be published.
4. **Preserve intermediates.** When the canonical `full.mp3` is replaced (voice-only → mixed), the voice-only version is renamed to `full-voice.mp3`, not deleted. This lets R4/R5 recover if a mix is rejected post-render.
5. **Deterministic mixing.** The same voice + same music + same parameters must produce an identical mix. No random passes. ffmpeg's filter chain is deterministic by default — do not introduce randomisation.
6. **HITL gates.** Music generation is non-deterministic (Suno picks). The phase must either pause for human take-selection OR the operator must explicitly set `music_auto: true` on the episode to skip that gate.

---

## Safety rules

- **Commercial licence.** Before publishing, verify the music licence tier matches the distribution intent. Self-hosted Suno output for a personal vault? Fine. Published to Spotify under a brand account? Pro or Premier required.
- **Voice cloning.** If `elevenlabs-tts` is used with a cloned voice, the voice-cloning consent must be documented in the project's Knowledge.md. This profile does not enforce that — the consent is a legal matter owned by the operator.
- **No auto-publish without review.** The final mixed audio goes through at least one listening pass by a human before it hits a publishing phase. This profile does not gate that — R3.5 music-producer and R3 audio-producer directives specify the HITL pauses, and the profile assumes they will.

---

## Phase-level fields (frontmatter)

When a phase uses `audio-production` profile, it may set:

```yaml
profile: audio-production
audio_input: "output/audio/{episode-id}/full-voice.mp3"   # upstream voice track
audio_output: "output/audio/{episode-id}/full.mp3"        # target (may overwrite input)
mix_mode: voice-over-music                                # voice-over-music | voice-only | music-only
music_provider: gateway
```

`mix_mode` tells the runtime which skills the phase will chain:
- `voice-only` — just `elevenlabs-tts` + `audio-master master` + `audio-master concat`
- `music-only` — just `suno-generate` + `audio-master master`
- `voice-over-music` — all of the above + `audio-master duck`

---

## Init docs

- `Music Style Guide.md` — project's musical aesthetic (required if `music_provider` is set).

A project starting a new audio-production phase for the first time must have a Music Style Guide in the vault. The `suno-generate` prompt is derived from it, not generated fresh. This is what gives a show its consistent sonic identity across episodes.

---

## Typical stacks

**My Podcast weekly podcast (narrated + soundbed):**
- R3 Audio Producer: `voice-only` mix_mode — produces `full-voice.mp3`
- R3.5 Music Producer: `voice-over-music` mix_mode — consumes `full-voice.mp3`, produces `full.mp3`
- R4 Video Composer: reads `full.mp3` (mixed), renders over branded visuals

**Meditation track project:**
- Single phase: `music-only` mix_mode — `suno-generate` + `audio-master master` only

**Voice-only audiobook:**
- Single or multi-chapter phase: `voice-only` mix_mode — TTS + master + concat per chapter

---

Project bundles that adopt this profile declare it in their phase frontmatter (`profile: audio-production`). The bundle-local Music Style Guide and bundle-specific directives own the show-specific aesthetic; this profile owns the mechanical constraints only.
