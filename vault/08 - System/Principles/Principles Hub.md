---
tags: [hub-subdomain, status-active, principles]
graph_domain: system
status: active
up: System Hub
---
## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]

# Principles Hub

> **What lives here.** Framework-canonical principles — distilled wisdom that ships with ONYX and applies to anyone running the framework. Each principle is a short markdown file with a rule, a why, and a how-to-apply.

> **Cross-Project Knowledge vs Principles.** [[08 - System/Cross-Project Knowledge.md|Cross-Project Knowledge]] is *operator-specific* — what *you* learned across *your* projects. Principles are *universal* — what helps anyone running the framework. The graduation is **per-project Knowledge.md → Cross-Project Knowledge → Principles**, with the last step requiring a maintainer-accepted PR.

> **How to use principles.** Directives wikilink them. Phases reference them. Read them once when you set up your first project; read them again when you hit the situation they describe. They're not read every iteration — they're read when needed.

---

## Universal pipeline

Apply across video, audio, podcast, code, research — anything that produces an artefact through staged work.

- [[08 - System/Principles/audio-first-pipeline.md|audio-first-pipeline]] — derive video / visual timing from audio, not vice versa
- [[08 - System/Principles/qc-gate-between-every-phase.md|qc-gate-between-every-phase]] — automated review at every phase boundary
- [[08 - System/Principles/single-canonical-tool-per-task.md|single-canonical-tool-per-task]] — no /tmp scripts; canonical bin paths
- [[08 - System/Principles/vault-frontmatter-is-source-of-truth.md|vault-frontmatter-is-source-of-truth]] — relationships live in frontmatter, not body wikilinks
- [[08 - System/Principles/memory-as-feedback-not-state.md|memory-as-feedback-not-state]] — when to use memory vs plan vs task

## Engineering

Apply when shipping software through ONYX (any language, any stack).

- [[08 - System/Principles/phase-atomisation-discipline.md|phase-atomisation-discipline]] — break into independent phases before execution
- [[08 - System/Principles/fail-and-fix-not-bypass.md|fail-and-fix-not-bypass]] — root cause, not `--no-verify`
- [[08 - System/Principles/backwards-compat-only-at-boundaries.md|backwards-compat-only-at-boundaries]] — internal renames are fine; only system boundaries need shims
- [[08 - System/Principles/no-features-beyond-task.md|no-features-beyond-task]] — bug fix doesn't need surrounding cleanup
- [[08 - System/Principles/cdp-attach-over-persistent-profile.md|cdp-attach-over-persistent-profile]] — for any session-auth automation

## Storytelling / content *(M2b — coming next)*

Apply to any project producing narrative content for an audience.

## Video / animation *(M2c)*

Apply to animated short / serial-video pipelines.

## Music / audio *(M2c)*

Apply to album / track / podcast audio pipelines.

---

## Writing a new principle

If you're proposing a principle to the framework via PR:

1. The principle must hold across multiple work shapes — not just one project type, not just one operator's experience.
2. Use the shape: **rule** (one-line statement), **Why** (one-line reason — abstract, no incident references), **How to apply** (one-line invocation).
3. Avoid first-person framing. Write as universal advice, not as a war story.
4. Avoid dates and version numbers. Principles outlive the incidents that produced them.
5. One principle per file. Filename is the rule itself in kebab-case.

If your candidate principle only applies to your own work, it belongs in your Cross-Project Knowledge, not here.
