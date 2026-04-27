---
title: verifiable-contact-details-only
tags: [principle, storytelling, content]
type: principle
up: Principles Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Principles/Principles Hub.md|Principles Hub]]

# verifiable-contact-details-only

**Rule.** Phone numbers, helplines, deep URLs, postcodes, and named contacts may only appear in published content when verified live from the publisher's own page during this run. Never pass through contact details from prior briefs, model recall, or web caches.

**Why.** Helpline numbers change. Charities rebrand. Deep URLs rot. A confidently-stated helpline number that turns out to be wrong is worse than no number at all — at the moment a listener actually needs the line, they get a disconnected tone or someone else's office. Model recall is unreliable for exact strings; old briefs go stale. The only safe rule is: every contact detail in the script traces to a live fetch in the brief.

**How to apply.**
- The research / brief phase verifies any contact detail it lists. The script writer can only print details that came through that verification.
- When the brief doesn't carry a verified contact, the script signposts generically: "details on the [organisation] website" — not an invented or recalled number.
- Generic root domains (`nhs.uk`, `gov.uk`, the BBC, a charity's main site) are safe to mention by name without verification — the lookup is one step from there.
- Phone numbers, deep URLs, named individuals, and named NHS-trust contacts always need verification.
- Encode the rule as a script-writer directive forbidden pattern: "no helpline numbers unless the brief carries a live-fetched URL".
