---
tags:
  - system
  - convention
  - skill-pattern
graph_domain: system
created: 2026-04-19T00:00:00.000Z
updated: 2026-04-19T00:00:00.000Z
up: Conventions Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Conventions/Conventions Hub|Conventions Hub]]

# Browser Automation for Services Without APIs

> **When to apply:** A service the user pays for (or has legitimate access to) exposes no official API, or has one so limited that critical workflows require the web UI. Before building anything bespoke, follow this pattern.

## The principle

When the operator pays for a service (Suno Pro, Udio, Midjourney, Runway, etc.) but the service refuses to give them an API, **do not pay a third-party gateway** to proxy the service on their behalf. The operator's browser already has a valid authenticated session. Drive that session directly, under their own account, for free.

This pattern is the ONYX answer to "it has no API."

## The stack (top-down)

```
Directive (vault markdown)
    ↓ calls
Service skill (e.g. suno)
    ↓ shells out to
browser-automate (engine)
    ↓ attaches via CDP to
Debuggable Chrome (daemon)
    ↓ holds
User's authenticated session
    ↓ renders / scrapes / posts
Service (Suno, Udio, etc.)
```

Each layer has one job:
- **Directive** — decides *what* to do in this phase, in business terms.
- **Service skill** — exposes verbs (library, generate, download) as clean CLI commands. Hides browser plumbing.
- **browser-automate** — launches / attaches to Chrome, loads per-service recipes, handles lifecycle.
- **Daemon Chrome** — one persistent browser, seeded from the user's daily profile, kept signed-in across all automation runs.

## Why CDP attach, not persistent Playwright profiles

Early attempts used Playwright's `launchPersistentContext` with a per-recipe user-data-dir. **It does not work for Clerk-protected services** (and many others): the server binds sessions to fingerprint + client-id combinations that shift subtly between Playwright launches, and the server actively clears session cookies via a "handshake" redirect on the next load.

**CDP attach** avoids this entirely. You launch one Chrome (seeded from the user's daily profile so Clerk recognises it as the same device), leave it running, and attach to it from multiple recipe runs. The session never leaves that Chrome — we never try to re-create it on launch. It just stays signed in.

## Writing a new service API layer

For each new service, three things get created.

### 1. One recipe per capability (in browser-automate OR as external files)

A recipe is a TS/JS module exporting:
```ts
{ name, description, loginUrl?, isLoggedIn?(ctx), run(ctx, args) }
```

Prefer **network-capture** over DOM selectors:
```ts
page.on('response', async (resp) => {
  if (/\/api\/feed/.test(resp.url())) {
    const body = await resp.json();
    // walk body for tracks / items / whatever
  }
});
```

This is dramatically more stable than CSS selectors. When the site redesigns, the visual DOM changes but internal API endpoints usually don't.

Only drive the DOM when you have to *initiate* an action (clicking Create, typing a prompt). Even then, for each DOM interaction, prefer `getByRole` / `getByLabel` / `getByPlaceholder` over class selectors.

### 2. A service skill (`~/clawd/skills/<service>/`)

The service skill is a **thin CLI** that:
- Auto-starts the browser-automate daemon if needed
- Writes a temp recipe file for the requested verb
- Shells out to `browser-automate run --recipe-file`
- Post-processes the result if needed (filtering, pagination, downloads)

Pattern:
```ts
async function cmdList(): Promise<void> {
  await ensureDaemon();
  const recipeFile = await writeListRecipe();
  const result = await runBA(['run', '--recipe-file', recipeFile]);
  process.stdout.write(JSON.stringify(result) + '\n');
}
```

Exposing this as a single `<service>` CLI with subcommands gives directives a clean API surface:
```bash
suno library
suno track --id <uuid>
suno download --id <uuid> --output ./out.mp3
suno generate --prompt "..." --output-dir ./
```

### 3. A skill overview under `08 - System/Agent Skills/<name> - Skill Overview.md`

This is the interface contract for ONYX directives. See `[[suno - Skill Overview|suno]]` for the template:
1. When a directive should call this
2. When NOT to call this
3. How to call it (verbs + flags + example)
4. Prerequisites (credentials, daemon, etc.)
5. Output shape
6. Pointer to the actual SKILL.md under `~/clawd/skills/<name>/`

Directives link to this skill overview, not to the skill source. If the skill changes internals but keeps verbs, no directive needs updating.

## Graduation path: DOM → direct API

Every service-API skill starts with DOM-driven recipes for actions (generate, create, post) and network-capture for reads (list, get). Over time:

1. **Sniff the endpoint.** Run the action with network logging on. Capture the URL, method, headers, body shape.
2. **Replicate via `ctx.context.request`.** Use the authenticated Playwright request context — cookies are attached automatically, CORS is not an issue, and the payload is exactly what the site sends.
3. **Swap the recipe.** Replace DOM filling + button clicking with a single `await ctx.context.request.post(endpoint, { data: payload })`.
4. **Ship.** Faster, more stable, completely invisible to site redesigns.

Do this lazily — the DOM version ships today; the direct-HTTP version ships when the DOM version breaks OR the speed matters.

## Daemon lifecycle

One Chrome, one user-data-dir, one open port. Lifecycle:

```bash
browser-automate daemon start    # launches once, seeds from your daily profile
browser-automate daemon status   # running? what port?
browser-automate daemon stop     # kills it (user-data-dir persists)
```

Auto-start on first use: skills call `daemon start` if `daemon status` returns `running: false`. Most operators will never invoke these directly.

Profile seeding: on first `daemon start`, ONYX `rsync`s your daily Chrome profile's `Default/` folder (cookies, localStorage, IndexedDB) into `~/.cache/browser-automate/daemon-profile/Default/`. This copies your active logins without disrupting your daily browsing.

You can manually refresh the profile seed by stopping the daemon, running `rsync -a --delete ~/.config/google-chrome/Default/ ~/.cache/browser-automate/daemon-profile/Default/`, and restarting.

## When NOT to use this pattern

- **Service has an official API.** Use it. Browser automation is inherently fragile — if there's a stable HTTP alternative, take it.
- **High volume.** This is one-account, one-session work. Don't scale it beyond the operator's legitimate use. Scraping scale invites account termination.
- **Cloudflare-hardened sites with aggressive bot detection.** You'll need `playwright-extra` + stealth plugins, residential proxies, captcha-solving — which is outside this pattern's scope. If you hit this wall, escalate with a note in the service's API doc.


## Real-world examples in this vault

- [[suno - Skill Overview|suno]] — music generation, library, download. Proven in production.
- [[spotify-creators - Skill Overview|spotify-creators]] — podcast upload (canonical RSS host for ManiPlus).
- [[music-distro - Skill Overview|music-distro]] — DistroKid (default), with stubs for TuneCore/Amuse/RouteNote/UnitedMasters/Ditto.
- *(roadmap)* Udio, Runway, Midjourney web — same shape.
