---
title: qc-gate-between-every-phase
tags: [principle, universal-pipeline]
type: principle
up: Principles Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Principles/Principles Hub.md|Principles Hub]]

# qc-gate-between-every-phase

**Rule.** Every phase boundary has a QC gate. The next phase doesn't start until the previous phase's output has been reviewed against an explicit checklist.

**Why.** Errors compound. A character drift in shot 3 becomes an incoherent ensemble in shot 12 if shot 3 isn't caught. A wrong stat citation in research becomes a wrong claim in script becomes a wrong claim in published audio. Catching the error one phase late is often 10× the cost of catching it on the boundary; catching it three phases late is sometimes unrecoverable. The QC gate is the cheapest insurance the pipeline can buy.

**How to apply.**
- Add a `qc-reviewer` directive that runs at every phase-completion transition.
- The QC checklist is specific to the artefact type, not generic. Different artefacts → different checklists.
- The reviewer either approves (phase completes) or surfaces concrete blockers (phase becomes `blocked`, with each blocker enumerated under `## Human Requirements`).
- Reviewers can be automated (LLM-pass against a checklist) or human (operator approves in `reviews/`). Either way, *something* between every phase.
- If a class of QC failure recurs, encode the lesson in the upstream directive — don't keep catching the same drift downstream.
