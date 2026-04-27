---
name: Error tracking lives in Sentry
description: Production errors and crash reports for the main-api service are tracked in Sentry project "main-api".
type: reference
---

Production errors and crash reports for the main-api service are tracked in Sentry, project name `main-api`. The user is on the team and can grant view access on request.

When the user mentions a recent error, a crashloop, or "what's blowing up in prod", check Sentry first. The dashboard URL is on their internal wiki under "Production observability".

The other services (`worker`, `scheduler`) are separate Sentry projects with the same naming convention.
