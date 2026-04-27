---
tags:
  - system
  - convention
  - authoring-guide
graph_domain: system
created: 2026-04-19T00:00:00.000Z
updated: 2026-04-19T00:00:00.000Z
up: Conventions Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Conventions/Conventions Hub|Conventions Hub]]

# Minimal Code, Max Utility

> **The rule:** every line of code must earn its place. Directives, profiles, and skills are composed — not built. When a new capability is needed, the first question is *what existing piece can I reuse, orchestrate, or extend* — not *what new thing can I write*.

This page is the authoring guide for ONYX components. Read it before you write a single new skill, directive, or profile.

---

## The five composable primitives

ONYX is built from five things. Know which primitive you need before writing anything.

| Primitive | Lives in | What it's for | What it's **not** for |
|---|---|---|---|
| **Skill** | `~/clawd/skills/<name>/` | A single capability with a clean CLI, reused across projects (elevenlabs-tts, rss-publish, audio-master, browser-automate). | Project-specific business logic. Orchestration. |
| **Directive** | Vault, per-project `<Project>/Directives/<name>.md` | One stage's agent brief: role, inputs to read, voice/safety constraints, skill-bin calls, output shape. | Code. Invariants. Shared logic. |
| **Profile** | `08 - System/Profiles/<name>.md` | Invariants that apply across every phase of a project-type (content, engineering, audio-production, research). | Stage-specific work. Project-specific voice. |
| **Phase** | Vault, per-project `<Project>/Phases/<N>.md` | One unit of work: status, dependencies, tasks, acceptance criteria, human requirements. | Reusable capability. Voice constraints. |
| **Skill Overview** | `08 - System/Agent Skills/<name> - Skill Overview.md` | Verb-level contract for a skill (when to call, how to call, output shape). | Implementation. Internals. |

Each primitive has **one job**. Confusion between them is where codebases bloat.

---

## The rules

### 1. **Skills are single-capability and project-agnostic.**

A skill does ONE thing and does it well across every project that needs it. `elevenlabs-tts` synthesises speech. `rss-publish` writes a feed.xml. `audio-master` masters/concats/ducks audio. If your skill starts to have project-specific defaults or branching ("if this is My Podcast, do X; if this is ProjectY, do Z"), **split it**. The project-specific parts belong in a directive or in a per-project config file the skill reads as a parameter.

Examples of what belongs **in** a skill:
- Generic CLI flags (`--voice-id`, `--output`, `--count`)
- Retry logic for the underlying service
- Output schema (consistent across callers)

Examples of what does **not** belong in a skill:
- "Default to a specific voice" — no, make the caller pass the voice ID
- "Apply the My Podcast pronunciation dictionary" — no, that's a directive's pre-processing step
- "Hard-coded Suno channel config" — no, take it as `--channel-file`

### 2. **Directives orchestrate skills and write outputs to the vault. They never re-implement what a skill does.**

If a directive is running a subprocess that does complex work — mastering audio, fetching an API, rendering a video — that work should be a skill. The directive's job is:
- Read the vault (episode note, knowledge, source context)
- Decide what parameters to pass to which skills
- Sequence skill calls
- Write results back to the vault

A directive that has 50 lines of bash doing real work is doing too much. Extract it.

### 3. **Profiles are invariants, not logic.**

A profile declares constraints that every phase of this project-type satisfies. Examples:
- `content` profile: "every clinical claim must have an inline source citation"
- `audio-production` profile: "music is never louder than voice"
- `engineering` profile: "tests pass before marking the phase complete"

A profile doesn't *run* anything. It doesn't have skills. It's a list of rules a directive or runtime checks. When in doubt, if the constraint applies to *every* phase of every project of this type, it's a profile rule. If it only applies to some phases, it's a directive rule.

### 4. **Pluggable backends before bespoke builds.**

When a capability needs to work against multiple providers (Suno via gateway/selfhosted/browser; music via Suno/Udio/Stable Audio Open), build the skill with a **provider interface** from day one. Don't let the first provider become the hard-coded default.

Example: `suno-generate` has a `pickProvider()` that dispatches on `SUNO_PROVIDER`. Adding a new provider is one file, zero changes to the CLI.

Same pattern: `browser-automate` has a recipe-per-service interface. Adding Udio = write one recipe file.

### 5. **Reuse paths that already exist before writing new ones.**

Before building a skill, answer:
- Does an existing skill already do something similar that could be generalised? (`audio-master` gained a `duck` subcommand instead of a new `audio-duck` skill)
- Is the new functionality a new subcommand of an existing skill, or genuinely a new capability?
- If it's a new capability, can it be implemented as a plug-in/recipe/provider of an existing engine? (Suno → `browser-automate` recipe, not a new skill)

If the answer is "yes, I could extend an existing thing" — do that. One more subcommand is cheaper than one more skill to install, build, test, document.

### 6. **Vault-first state. No parallel databases. No config drift.**

Every piece of project state lives in the vault as markdown + frontmatter. Episode progress, phase status, knowledge learned, content decisions — all in files. This guarantees:
- One source of truth (the git-tracked vault)
- Operator can edit state with Obsidian
- Agents can read state without running a server
- Search is free
- Recovery is free

If you find yourself wanting to store state "temporarily" in `/tmp` or `output/` across runs, stop. That state belongs in the vault.

Exceptions: binary artifacts (MP3s, MP4s, images) and tool-internal caches live outside the vault, referenced from vault notes by absolute path.

### 7. **First pass: works. Second pass: clean. No third pass unless paid for.**

Ship the verb with a DOM-driven recipe. Then sniff the real endpoint and swap to direct HTTP. Then maybe swap the provider for a local model. That's three passes — and most components stop at pass 1 or 2 because pass 3 isn't worth the effort relative to the value.

Don't prematurely optimise. Don't over-abstract. But don't build a permanent hack either — leave yourself a roadmap note in the vault API doc so the next person knows what's next.

### 8. **Document the interface, not the implementation.**

The skill overview (`08 - System/Agent Skills/<name> - Skill Overview.md`) describes verbs, flags, output shape. It does not describe which ffmpeg filter chain or which DOM selector makes it work. Implementation details live in the skill's code and `~/clawd/skills/<name>/SKILL.md`. This lets you rewrite the implementation (pass 1 → pass 2) without updating a single directive.

---

## Example — the My Podcast R3.5 music stack applied to the rules

**The task:** generate backing music for a My Podcast episode's voice track.

What we did NOT do:
- ❌ Write a My Podcast-specific Suno client (violates rule 1)
- ❌ Put the music prompt defaults in the Suno skill (violates rule 1)
- ❌ Make the music-producer directive do the HTTP call itself (violates rule 2)
- ❌ Start with one provider hard-coded (violates rule 4)

What we did:
- ✅ Built `suno` as a generic skill with verbs (library, download, generate) — rule 1
- ✅ Built `browser-automate` as a generic engine; `suno` is one of many recipes — rule 4, 5
- ✅ Extended `audio-master` with a `duck` subcommand instead of a new skill — rule 5
- ✅ The My Podcast Music Style Guide lives in the bundle and is the only My Podcast-specific input — rule 6
- ✅ The `my-podcast-music-producer` directive is 200 lines of markdown orchestrating three skill calls — rule 2
- ✅ `audio-production` profile declares invariants (voice-first, LUFS, licensing) — rule 3
- ✅ [[suno - Skill Overview|suno]] skill overview describes verbs, not implementation — rule 8
- ✅ Direct-HTTP generation is in the roadmap; DOM-driven `generate` ships today — rule 7

If a new show wants backing music, they write their own Music Style Guide + music-producer directive and **reuse every skill and profile** unchanged.

---

## The authoring checklist

Before opening an editor to write a new skill/directive/profile, answer these:

1. **Which primitive?** Skill, directive, profile, phase, or API doc? (If unclear, it probably shouldn't exist yet — something simpler covers it.)
2. **Does this already exist somewhere?** Grep `~/clawd/skills/` and the vault. Be surprised.
3. **Is there a general pattern this fits?** (Browser-automation recipe? Audio-master subcommand? Profile add-on?)
4. **What's the minimum I can ship?** Pass 1. Is there a roadmap for pass 2?
5. **What's the vault contract?** Write the API doc or phase doc first, then implement backwards from it.
6. **What state lives where?** Vault = markdown. Skills = pure, stateless where possible. Outputs = binary files referenced by path.
7. **If someone else needed this capability in a different project, would it work for them unchanged?** If no, your abstraction isn't quite right.

---

## What "bad" looks like

Anti-patterns to catch in review:

- A "My Podcast-specific" skill. Skills are cross-project.
- A directive that includes inline Node.js or Python code running external APIs. Extract to a skill.
- A profile with rules that only one project would ever enforce. That's a directive rule.
- A phase file with orchestration logic. Phases describe WHAT; directives describe HOW.
- Two skills doing the same thing with slightly different flags. Collapse.
- A skill with `if (project === 'X')` branches. Parameterise instead.
- State stored in a skill's local filesystem that persists across runs (except caches). Push to vault.
- An API doc that shows how the skill is implemented. Show what it does.

If you see these, refactor. Every case where you resist is a case where bloat compounds.

---

## Related reading

- [[Browser Automation for Services Without APIs]] — the CDP-attach pattern, exemplifies rule 4 (pluggable backends)
- [[08 - System/ONYX Master Directive|ONYX Master Directive]] — runtime that enforces these structurally
