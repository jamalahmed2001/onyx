---
tags:
  - hub
  - hub-subdomain
  - system
  - convention
graph_domain: system
created: 2026-04-19T00:00:00.000Z
updated: 2026-04-27T10:52:05Z
up: System Hub
---
## 🔗 Navigation

**UP:** [[08 - System/System Hub|System Hub]]

# Conventions Hub

> Load-bearing cross-cutting conventions for building, composing, and running ONYX. Read these before writing a new skill, directive, or profile.

## Core conventions

- [[Minimal Code Max Utility]] — authoring principle for skills/directives/profiles. Start here.
- [[Browser Automation for Services Without APIs]] — the CDP-attach pattern for services that refuse APIs.

## Graph + identity conventions

- [[Project ID Convention]] — the `project_id` slug contract: kebab-case, ≤30 chars, unique vault-wide. All hub names derive from it.
- [[Fractal Linking Convention]] — single-parent tree shape, hub-as-index pattern, the 5-check fractal audit.
- [[Tag Convention]] — tag families and `phase-*` / `hub-*` naming.
