---
title: audio-first-pipeline
tags: [principle, universal-pipeline]
type: principle
up: Principles Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Principles/Principles Hub.md|Principles Hub]]

# audio-first-pipeline

**Rule.** When a pipeline produces both audio and visual content, generate the audio first and derive every downstream timing from its actual length. Don't pre-decide visual durations and force audio to fit.

**Why.** Audio is the medium with strict perceptual constraints — pacing, breath, syllable rhythm, music phrasing. Stretching or compressing it to fit a pre-set visual timeline produces obvious artefacts. Visual timing is comparatively elastic — a held shot, a cross-fade, an extra beat between cuts can absorb almost any audio length without the viewer noticing.

**How to apply.**
- The first phase that produces a duration-bearing artefact is the audio synthesis phase.
- Subsequent visual phases read the audio's actual duration from frontmatter (`target_duration_s` or equivalent) and never overwrite it.
- If a regen is needed and the audio length changes, all downstream visual artefacts must be regenerated too — don't try to patch the visuals to match the new audio.
- For pipelines without audio (pure visual), substitute "the artefact with the strictest perceptual constraints" — usually the script or storyboard.
