---
name: general
type: profile
version: 1.0
required_fields: []
phase_fields:
  - output_location
  - review_required
init_docs:
  - Project Context
tags: [onyx-profile]
allowed_shell:
  - ls
  - test
  - grep
  - cat
  - mkdir
  - find
  - which
  - head
  - tail
  - wc
  - echo
  - git
  - bun
  - node
  - npm
  - jq
  - timeout
denied_shell:
  - rm
  - mv
  - cp
  - dd
  - mkfs
  - chmod
  - chown
  - sudo
  - curl
  - wget
---

## 🔗 Navigation

**UP:** [[08 - System/Profiles/Profiles Hub.md|Profiles Hub]]

# Profile: general

> The catch-all profile. Use this when you are unsure which profile fits, when the project spans multiple domains, or when you want to start quickly without committing to a specific mechanical contract. No required frontmatter fields. Acceptance is task-completion based. You can always migrate to a more specific profile later.

---

## When to use this profile

- You are unsure what profile to use — start here
- The project spans multiple domains (e.g. a tool that also involves research + content output)
- You want to prototype a workflow before formalising it
- Lightweight admin, coordination, or one-off tasks
- Personal projects that don't fit a defined category
- Learning and exploration — getting familiar with ONYX

If your project clearly builds software → use `engineering`.
If it produces recurring content → use `content`.
If it involves structured investigation → use `research`.
When in doubt, use `general` and add a directive per phase for the agent's role.

---

## Required Overview fields

None required. Recommended:

```yaml
profile: general
goal: "One sentence describing what this project produces or achieves"
owner: "Who is responsible"
```

`goal` is highly recommended even though it isn't enforced. Without it, agents lack a reference point for checking whether their work is aligned with what you actually want.

---

## Phase fields

Optional per-phase frontmatter:

```yaml
output_location: "Where the deliverable goes (folder, file, system)"
review_required: true     # true | false — marks phases that need human sign-off before continuing
```

`review_required: true` on any phase causes ONYX to pause and request human confirmation before proceeding to the next phase. Use it for anything that touches external systems, sends communications, or makes commitments.

---

## Bundle structure

When `onyx init` creates a general project:

```
My Project/
├── My Project - Overview.md          ← goal, owner, any project-specific context
├── My Project - Knowledge.md         ← learnings compound here
├── My Project - Project Context.md   ← background, prior work, constraints, stakeholders
├── Phases/
│   ├── P1 - [First phase].md
│   └── ...
└── Logs/
    ├── L1 - [First phase].md
    └── ...
```

**Project Context** is the general-purpose equivalent of a Research Brief or Source Context. Populate it with whatever background the agent needs: who the stakeholders are, what has already been tried, what constraints exist, what success looks like.

---

## When creating a new bundle

For the LLM generating the Overview at `onyx init` time:

The Overview.md for a general project must include:
1. A `## Goal` section — what this project produces or achieves, stated precisely
2. A `## Why it matters` section — what decision or outcome this work feeds into
3. A `## Constraints` section — time, resources, technical, political — anything that bounds the work
4. A `## Out of scope` section — explicitly naming what isn't being done prevents scope creep
5. A `## Success criteria` section — how you'll know the project is complete

The Project Context note starts with this template:
```
# Project Context — [Project Name]

## Background
[Why does this project exist? What triggered it?]

## Stakeholders
[Who cares about the output? Who can unblock things?]

## Prior work
[What's been tried before? What already exists?]

## Constraints
[Hard limits: time, budget, access, technology]

## Dependencies
[What must exist or be true for this project to succeed?]
```

---

## Acceptance verification

General projects don't have a mechanical acceptance gate like a test command or source count. Acceptance is:

1. **All tasks checked** — every `- [ ]` in the Tasks section is ticked
2. **Output location documented** — if `output_location` is set, the deliverable exists there
3. **`review_required: true` phases** — the agent marks them complete and writes a review request in the log; the human confirms before proceeding
4. **Knowledge.md updated** — any learning worth compounding is written to Knowledge.md

If the phase output is ambiguous (the agent isn't sure if it's done), it should write an explicit `## Status` note at the end of the phase log explaining what it produced, what's uncertain, and what would constitute a clearer completion.

---

## Context the agent receives

ONYX injects these into the agent's context:

1. This profile file
2. The phase directive (if `directive:` is set on the phase)
3. Project Overview.md
4. Project Knowledge.md (prior learnings)
5. Project Context.md (if it exists)
6. The phase file

For general projects, the directive is especially important — without a profile-specific acceptance gate, the directive's acceptance criteria are the primary quality check.

---

## Notes for the agent

- No required fields means no mechanical safety net. Compensate by reading the goal carefully and checking your work against it before marking a phase complete.
- `review_required: true` is not optional. If a phase has it set, stop and write a review request. Do not proceed to the next phase.
- When the project type becomes clear mid-stream, note in Knowledge.md that this project would benefit from migrating to a more specific profile. Don't do the migration yourself.
- This profile is intentionally permissive. Use the directive to add the constraints the profile doesn't impose.
