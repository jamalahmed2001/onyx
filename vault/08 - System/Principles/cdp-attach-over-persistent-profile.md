---
title: cdp-attach-over-persistent-profile
tags: [principle, engineering, browser-automation]
type: principle
up: Principles Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Principles/Principles Hub.md|Principles Hub]]

# cdp-attach-over-persistent-profile

**Rule.** For session-authenticated services that don't expose a public API (Suno, Spotify for Creators, music distributors, social-media schedulers), drive a real Chrome instance via the Chrome DevTools Protocol — don't run a Playwright "persistent profile" copy.

**Why.** Modern auth services (Clerk, Auth0, custom sessions) detect headless and Playwright fingerprints, throw bot-protection challenges, and rotate sessions aggressively. A persistent Playwright profile that worked in a clean test reliably fails in production. A real Chrome that the user already logged into — attached to via CDP — is indistinguishable from the user's own browser, because it *is* the user's own browser. Captchas trigger less; sessions persist; cookies don't drift. The cost of CDP attach is one extra setup step (a Chrome flag); the benefit is reliability that compounds across every session-auth integration.

**How to apply.**
- Launch the user's normal Chrome with `--remote-debugging-port=9222` (or whichever port the skill expects).
- The user logs in normally, just once. The session persists in the profile.
- Skills that need session auth attach to the running Chrome via CDP. They read/write the user's actual cookies, hit the user's actual auth endpoints, and look like the user.
- `browser.close()` should be in a `try/finally` — closing the user's Chrome by mistake costs them their tabs.
- For services that do offer a stable headless flow (most public APIs, most content fetches), use Playwright headless. CDP-attach is for the session-auth case specifically.
- If the daemon Chrome dies, the skill can't recover — surface a `blocked` with "restart the Chrome daemon", don't try to spin up a new one.
