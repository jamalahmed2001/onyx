---
title: backwards-compat-only-at-boundaries
tags: [principle, engineering]
type: principle
up: Principles Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Principles/Principles Hub.md|Principles Hub]]

# backwards-compat-only-at-boundaries

**Rule.** Backwards-compatibility shims belong only at system boundaries — public APIs, persisted data, third-party contracts. Internal renames, restructures, and refactors don't need shims; just change the code.

**Why.** Internal compat shims compound: every rename leaves a re-export, every restructure leaves a forwarder, every refactor leaves a deprecated wrapper. Six months later a third of the codebase is shims that nobody calls but nobody dares delete. The cost of changing internal APIs cleanly is small; the cost of dragging shims forever is large. The boundary case is real — you can't break a public API without notice — but most code isn't a public API.

**How to apply.**
- **Public API / persisted data / third-party contract → shim.** Rename `getUser` to `getAccount` in a public SDK and you keep `getUser` as a deprecated re-export until the next major version.
- **Everything else → just change.** Internal function rename? Update every caller. Internal type rename? Update every reference. Internal file move? Update every import. Don't leave forwarders, re-exports, or `// deprecated` comments behind.
- "Just in case some external code imports this internal thing" is not a reason to shim. Search for callers; there aren't any (it's internal); change it.
- Half-finished migrations are forbidden. If a rename is in flight, the migration phase ends with everything renamed — never with two parallel names that both work.
- The only `// removed: <thing>` comments worth leaving are at genuine public boundaries with a release-note pointer.
