---
title: no-features-beyond-task
tags: [principle, engineering]
type: principle
up: Principles Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Principles/Principles Hub.md|Principles Hub]]

# no-features-beyond-task

**Rule.** A phase does the task it's scoped to and nothing else. No surrounding cleanup, no opportunistic refactors, no features-for-future-needs, no abstractions designed for hypothetical extension.

**Why.** Surrounding work hides inside a phase that's scoped to one thing, and the review can't tell which changes are the task and which are extras. Reverting becomes hard. Bisecting becomes hard. Reasoning about what shipped becomes hard. Worse: the extras are usually under-tested (because the phase's tests cover the *task*, not the extras) and under-considered (because the operator's attention was on the task). Most cleanup that "would be quick to also do" is neither quick nor benign once it lands.

**How to apply.**
- A bug fix changes the lines that were wrong. It doesn't reformat the file.
- A feature addition adds the feature. It doesn't refactor the surrounding module.
- A refactor refactors the named scope and stops at the scope edge.
- Three similar lines is fine — don't extract a helper unless the duplication has cost beyond appearance.
- If you notice surrounding work that should happen, surface it as a follow-up phase. Don't fold it into the current one.
- If you can't avoid touching surrounding code (a renamed function with many call sites, an interface that genuinely must change), name the cross-cutting work in the phase frontmatter so the review knows.
