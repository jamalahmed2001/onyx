---
tags: [onyx, system, reference, status-active]
graph_domain: system
created: 2026-04-15
updated: 2026-04-16
type: reference
---

## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]

# ONYX — Artifact Reference

> Every artifact in the ONYX system: what it is, what it looks like, how it's used, and when to create one. With concrete examples throughout.

---

## The one-line mental model

```
Tool  →  how to call one thing
Skill →  how to do a class of task (uses tools)
Directive →  who the agent IS for a phase (uses skills + tools)
Profile →  what kind of project this is (shapes the whole lifecycle)
Bundle →  the container for one project
Phase  →  one unit of work inside a bundle
```

Each layer adds specificity. A Tool does one thing. A Skill sequences tools into a procedure. A Directive gives the agent an identity. A Profile sets the mechanical rules for the project type.

---

## The capability stack

```
Tool             raw, atomic — "call this API with these inputs, get this output"
  ↓ composed into
Skill            procedure — "to do this class of task, follow this sequence"
  ↓ specialised by
System Directive domain identity — "in this domain, you are this kind of agent"
  ↓ overridden by
Bundle Directive project identity — "for this specific project, here is your exact brief"
```

**Example chain — My Podcast research phase:**

| Layer | Artifact | What it contributes |
|---|---|---|
| Tool | `web-search` | "Call WebSearch(query). Return [{title, url, date, snippet}]." |
| Tool | `pubmed-search` | "Run npm run research:fetch. Reads research-briefs/{date}-raw.json." |
| Skill | `researcher` | "Search → select top 5 sources → summarise each → cite inline." |
| System directive | `clinical-researcher` | "Prefer PubMed. Cite every clinical claim. Never give personal medical advice." |
| Bundle directive | `my-podcast-researcher` | "Focus: kidney/dialysis/transplant health. Audience: patients and carers. Faith-aware. Write to vault/research-briefs/{date}.json." |

---

## Artifacts A–Z

---

### 1. Tool

**What it is:** The smallest unit in the system. A Tool documents one invocable capability — one API call, one script, one native function. It describes what inputs to provide and what output to expect. The agent reads the tool doc and knows how to call it.

**What it is NOT:** A procedure (that's a Skill). A role (that's a Directive). An identity (that's a Directive). A Tool just defines: "this thing exists, here's how to call it."

**Where it lives:** `08 - System/Tools/{name}.md`

**How it enters the agent's context:** Declared in `tools:` on a phase, skill, or directive. ONYX auto-injects the tool file into the prompt.

**Example tool file — `web-search.md`:**

```markdown
---
type: tool
name: web-search
kind: native
---

# Tool: web-search

## What it does
Searches the web for current information. Returns ranked results with titles, URLs, dates, and snippets.

## How to call it
Use Claude's built-in WebSearch tool:
```
WebSearch(query="your search query")
```

## Returns
Array of results: `[{ title, url, date, snippet }]`

## When to use it
- Finding current events, news, recent data
- Discovering sources before fetching full content
- Cross-referencing claims against multiple sources

## Pair with
`web-fetch` to download full content from the best results.
```

**Example tool file — `pubmed-search.md`:**

```markdown
---
type: tool
name: pubmed-search
kind: npm-script
command: npm run research:fetch
---

# Tool: pubmed-search

## What it does
Queries PubMed via the NCBI E-utilities API. Downloads abstracts, author lists, and PMIDs.

## How to call it
```bash
npm run research:fetch -- --query "kidney transplant outcomes" --max 20
```

## Output location
`vault/research-briefs/{date}-raw.json`

## Returns
JSON array: `[{ pmid, title, authors, abstract, pub_date, journal }]`

## Notes
- Rate-limited to 3 requests/second without API key
- Set NCBI_API_KEY in .env to lift the limit
```

**Existing tools:**

| Tool | Kind | What it does |
|---|---|---|
| `web-search` | native | WebSearch — current web info |
| `web-fetch` | native | Download full page content from a URL |
| `vault-read` | native | Read any file from the Obsidian vault |
| `vault-write` | native | Write or update a vault file |
| `pubmed-search` | npm script | Query PubMed for medical/clinical literature |
| `pdf-extract` | script | Extract text from PDF files |
| `image-resize` | script | Resize/optimise images locally |
| `tts-generate` | script | Text-to-speech audio generation |
| `video-render` | script | Compose and render video |
| `rss-fetch` | API | Fetch entries from RSS/Atom feeds |
| `rss-publish` | API | Push content to an RSS feed |
| `screenshot` | headless | Capture webpage screenshots |
| `notify` | script | Send WhatsApp or email notifications |
| `comments-fetch` | API | Pull comments from social platforms |
| `comments-post` | API | Reply to comments on social platforms |
| `youtube-publish` | API | Upload and schedule YouTube videos |
| `analytics-pull` | API | Pull data from PostHog/Amplitude/GA4 |

**When to create a new Tool:** When you want to make a raw capability available to agents across multiple projects — an API you call, a script that processes files, a native function. Keep it narrow. One tool = one action.

---

### 2. Skill

**What it is:** A Skill is a reusable procedure built from one or more Tools. It documents *how* to accomplish a class of task — the sequence, the quality bar, the error-handling. A skill doesn't say who the agent is (that's a Directive). It says: "when you need to do this kind of work, here's the procedure."

**What it is NOT:** An identity (that's a Directive). A single capability (that's a Tool). A Skill is the recipe; the Tool is an ingredient.

**Where it lives:** `08 - System/Agent Skills/{name} - Skill Overview.md`

**How it enters the agent's context:** Declared in `skills:` on a directive or phase. ONYX injects the skill file and all tools the skill declares.

**Example skill file — `researcher - Skill Overview.md`:**

```markdown
---
type: skill
name: researcher
tools:
  - web-search
  - web-fetch
  - vault-read
---

# Skill: researcher

## What this skill does
Finds, evaluates, and summarises information from online sources. Used by research phases across all profiles.

## Procedure

### Step 1 — Search
Run 3–5 distinct search queries covering the topic from different angles.
Collect results. Note dates — prefer sources from the last 2 years unless the topic is historical.

### Step 2 — Select
From all search results, select the 4–6 most credible and relevant sources.
Credibility signals: peer-reviewed, institutional, first-hand reporting, known publication.
Discard: opinion pieces without evidence, SEO content farms, undated pages.

### Step 3 — Fetch and read
WebFetch the full content of each selected source.
Extract the key claims, data points, and quotes relevant to the research question.

### Step 4 — Summarise
Write a structured summary for each source:
- Core claim or finding
- Supporting evidence
- Any caveats or limitations
- Inline citation: (Author/Publication, Year, URL)

### Step 5 — Synthesise
Combine across sources. Identify consensus, contradiction, and gaps.
State confidence level: high (multiple independent sources) / medium / low.

## Quality bar
- Minimum 3 sources per topic
- Every factual claim must be sourced
- No synthesis without citation
- Flag any claim you could only find from a single source

## Output format
Markdown with H2 headers per source, followed by synthesis section.
```

**Core skills in the system:**

| Skill | What it's for |
|---|---|
| `onyx-controller` | Master orchestration loop — runs the whole system |
| `phase-planner` | Decomposes an Overview into phase stubs |
| `atomiser` | Breaks a phase stub into 6–12 concrete tasks |
| `phase-executor` | Executes a phase: lock → task loop → release |
| `consolidator` | Synthesises a completed phase into Knowledge.md |
| `safe-repair` | Self-healer: clears stale locks, fixes drift |
| `drift-scan` | Detects vault consistency issues without fixing |
| `vault-architect` | Maintains graph structure and nav links |
| `init-bundle` | Creates a new project bundle from a profile |
| `claude-code-spawn` | Spawns Claude Code agent with phase context |
| `cursor-spawn` | Spawns Cursor agent with phase context |
| `notify-phase` | Sends notifications on phase events |
| `linear-import` | Imports a Linear project as a vault bundle |
| `linear-uplink` | Syncs phases ↔ Linear issues |
| `phase-review` | Manual review interface for a phase |
| `plan-my-day` | Generates a time-blocked daily plan |

**Optional/integration skills** (need separate setup):

| Skill | What it's for |
|---|---|
| `mailcow-imap` | Read email via IMAP from a Mailcow server |
| `headless-browser` | Control a browser for screenshots and scraping |
| `whisper-groq` | Transcribe audio files via Groq Whisper |
| `prayer-times` | Calculate prayer times for scheduling |
| `remind-me` | Set reminders and timed notifications |
| `project-health` | Generate project health reports |

**When to create a new Skill:** When you find yourself writing the same procedure in multiple directives — "search, then fetch, then summarise" appearing in 3 different directives means it should be a skill. Extract it. Reference it from the directives.

---

### 3. Directive (System)

**What it is:** A system directive defines a **reusable domain identity** for an agent. It answers: "who is this agent in this domain?" — the role, the constraints, the persona, the output format. System directives live in `08 - System/Agent Directives/` and are available to any project.

**What it is NOT:** A procedure (that's a Skill). A project-specific brief (that's a bundle directive). A mechanical contract (that's a Profile). A system directive is a domain persona that any project can pick up.

**Where it lives:** `08 - System/Agent Directives/{name}.md`

**How it enters the agent's context:** Set `directive: name` in a phase's frontmatter. ONYX checks the bundle's `Directives/` folder first, then falls back to system directives.

**Example system directive — `clinical-researcher.md`:**

```markdown
---
type: directive
name: clinical-researcher
skills:
  - researcher
tools:
  - pubmed-search
  - web-search
  - web-fetch
---

# Directive: clinical-researcher

## Role
You are a clinical research specialist. Your job is to find and synthesise evidence from peer-reviewed medical literature and trusted clinical sources.

## What you read first
Before starting any task, read in this order:
1. The project's Knowledge.md — what prior research found
2. The Research Brief (if present) — the specific question and constraints
3. The phase file — what to find this phase

## Behavioural rules
- **PubMed first.** For every clinical claim, prefer PubMed-indexed literature over web sources.
- **Cite everything.** Every factual medical claim must have an inline citation: (Author, Journal, Year, PMID or URL).
- **Never give personal medical advice.** You describe research findings. You don't diagnose or recommend treatment.
- **State uncertainty.** If the evidence is limited or contradictory, say so explicitly.
- **Faith-aware sourcing.** When relevant, note if interventions have halal/haram considerations.

## Source hierarchy
1. Cochrane Reviews and meta-analyses (highest weight)
2. RCTs published in major journals (NEJM, Lancet, JAMA, BMJ)
3. Prospective cohort studies
4. NHS / WHO / CDC guidelines
5. Expert consensus statements
6. Web sources (lowest weight — always cross-reference)

## Output format
Each source: H3 heading with title, then: Claim | Evidence | Confidence | Citation
Synthesis section: Key consensus | Contradictions | Gaps | Overall confidence

## What you must not do
- Do not fabricate citations. If you're unsure of a PMID, say "verify PMID".
- Do not simplify away important caveats to make findings sound cleaner.
- Do not recommend specific brands, doses, or products.
```

**All system directives:**

| Directive | Domain | What it makes the agent |
|---|---|---|
| `general` | Any | Default fallback — capable generalist |
| `knowledge-keeper` | Any | Structured wiki maintainer for Knowledge.md |
| `experimenter-researcher` | Experimenter | Proposes what to test; writes experiment specs |
| `experimenter-engineer` | Experimenter | Executes experiments; records raw results |
| `experimenter-analyzer` | Experimenter | Interprets results; updates Cognition Store |
| `clinical-researcher` | Research | Medical literature specialist |
| `legal-researcher` | Research | Legal research and citation specialist |
| `investment-analyst` | Trading/Finance | Financial analysis and market research |
| `accountant` | Accounting | Financial records, trial balance, compliance |
| `security-analyst` | Engineering | Vulnerability analysis and security review |
| `data-analyst` | Research | Statistical analysis and data interpretation |
| `journalist` | Content | Investigative research and news writing |
| `marketing-strategist` | Content | Campaign strategy and audience analysis |
| `vault-architect` | System | Vault structure maintenance |
| `observer` | System | Read-only system state analysis |
| `SOUL` | Identity | Agent personality and cognitive discipline |
| `AGENTS` | Identity | Operating rules for every session |

**When to create a new system directive:** When you want a domain identity that multiple different projects might reuse — a legal researcher role, a security analyst role, a content strategist role. Keep it domain-specific but project-agnostic.

---

### 4. Directive (Bundle)

**What it is:** A bundle directive is the most specific layer — a project-scoped agent identity. It answers: "for *this* project, who is this agent exactly?" It encodes the specific voice, audience, output location, source preferences, and safety rules for one project. It can extend a system directive concept without formal inheritance — it just gets resolved first.

**What it is NOT:** A system-wide role (that's a system directive). A procedure (that's a skill).

**Where it lives:** `{bundle}/Directives/{name}.md`

**How it enters context:** Same as system directives — set `directive: name` in phase frontmatter. The bundle's `Directives/` folder is checked *before* `08 - System/Agent Directives/`. So `my-podcast-researcher` resolves before `clinical-researcher`.

**Example bundle directive — `My Podcast/Directives/my-podcast-researcher.md`:**

```markdown
---
type: directive
name: my-podcast-researcher
extends: clinical-researcher    # conceptual note — not a formal field
skills:
  - researcher
tools:
  - pubmed-search
  - web-search
---

# Directive: my-podcast-researcher

## Role
You are the My Podcast research specialist. Your job is to find evidence-based information about kidney health, renal failure, dialysis, and transplantation — written for patients and their families, not clinicians.

## What you read first
1. `My Podcast - Source Context.md` — the show's identity, audience, voice, safety rules
2. `My Podcast - Knowledge.md` — what prior research phases found; don't duplicate
3. The Research Brief if present
4. The phase file — what to research this phase

## Topic focus
Primary: kidney disease (CKD), dialysis (haemodialysis, peritoneal dialysis), transplantation, renal diet
Secondary: related conditions (hypertension, diabetes as kidney disease triggers), quality of life, mental health for renal patients
Out of scope: general medical topics not related to kidneys/renal system

## Audience
Patients and family carers. Most have some medical knowledge from living with the condition but are not clinicians. Write for comprehension, not credentials.

## Behavioural rules
- PubMed first (inherited from clinical-researcher model)
- Cite everything inline (inherited)
- Never give personal medical advice (inherited)
- **Faith-aware:** When dietary or treatment interventions arise, note any halal/haram considerations. Our audience includes Muslim patients.
- **Carer perspective:** Always consider the impact on carers, not just the patient.
- **Patient voice:** Flag if findings contradict common patient beliefs — these make good episode topics.

## Output location
Write research brief to: `My Podcast/Research/{date} - {topic}.md`

## Citation format
(Author Surname, Journal Abbreviation, Year, PMID if available)
Example: (Smith et al., Lancet, 2024, PMID 38042891)

## What you must not do
- Don't write about topics outside the kidney/renal scope
- Don't assume UK-only context — our audience is international
- Don't use clinical jargon without explanation
```

**When to create a bundle directive:** Almost always for content and research projects where the voice, audience, and scope are project-specific. Engineering projects often use system directives directly, but content projects need a project-specific voice layer.

---

### 5. Profile

**What it is:** A Profile is the mechanical contract for a *type* of project. It tells ONYX how to handle a whole class of project: what fields the Overview must have, what "done" means for this domain, what bundle structure to create at `onyx init`, and what context to inject. Profiles extend ONYX's core behaviour without changing it.

**What it is NOT:** An agent identity (that's a Directive). A project document (that's an Overview or bundle). A Profile is about the *machinery* of running a project type — the rules ONYX enforces automatically.

**Where it lives:** `08 - System/Profiles/{name}.md`

**How it enters context:** Set `profile:` in `Overview.md` frontmatter. ONYX reads the profile at phase dispatch and injects it before the Overview.

**All 9 profiles:**

| Profile | Domain | Required Overview fields | Acceptance gate |
|---|---|---|---|
| `general` | Anything | none | all tasks checked off |
| `engineering` | Software, repos | `repo_path`, `test_command` | test command exits 0 |
| `content` | Podcast, newsletter, video | `voice_profile`, `pipeline_stage` | safety filter + voice check |
| `research` | Investigation, synthesis | `research_question`, `source_constraints`, `output_format` | source count + confidence declared |
| `operations` | Infra, incidents, maintenance | `monitored_systems`, `runbook_path` | runbook followed + outcome documented |
| `trading` | Strategies, exchange bots | `exchange`, `strategy_type`, `risk_limits`, `backtest_command` | backtest passes + risk limits met |
| `experimenter` | A/B testing, ML, prompt eng | `hypothesis`, `success_metric`, `baseline_value` | result recorded + Cognition Store updated |
| `accounting` | Financial records | `reporting_period`, `accounting_standards`, `entity_type` | trial balance checks + human sign-off |
| `legal` | Legal research, compliance | `jurisdiction`, `matter_type` | citations verified + human review required |

**Example profile — `engineering.md` (excerpted):**

```markdown
---
type: profile
name: engineering
---

# Profile: engineering

## Required Overview fields
```yaml
profile: engineering
repo_path: /absolute/path/to/repo
test_command: pnpm test     # exits 0 = phase accepted
stack: TypeScript, Node, Prisma
```

## Bundle structure on init
- {project} - Overview.md
- {project} - Knowledge.md
- {project} - Repo Context.md    ← auto-populated from repo scan
- Phases/
- Logs/

## Acceptance gate
A phase is complete when:
1. `test_command` exits 0
2. All task checkboxes are ticked
3. Agent has appended learnings to Knowledge.md

## Context injected each phase
1. Profile (this file)
2. Directive (from phase frontmatter)
3. {project} - Repo Context.md (current file tree + recent changes)
4. {project} - Overview.md
5. {project} - Knowledge.md
6. Phase file

## Agent behaviour
- Has read/write access to repo_path
- Must run tests after every non-trivial change
- Architecture phases: set `complexity: heavy` to route to Opus
- Never modifies CI/CD without explicit task
```

**Example Overview for an engineering project:**

```yaml
---
title: KrakenBot
project_id: KrakenBot
profile: engineering
repo_path: ~/workspace/projects/krakenbot
test_command: pnpm test
stack: TypeScript, Fastify, WebSocket, Kraken API
status: active
---
```

**When to create a new Profile:** When you have a whole *class* of projects with the same structural needs — same required fields, same acceptance rules, same bundle structure. Don't create a profile for one project — that's what an Overview + directive is for.

---

### 6. Bundle

**What it is:** A Bundle is the folder for one project. Everything related to one project lives inside its bundle: the Overview, phases, knowledge, directives, outputs, and logs. Bundles are the namespacing unit. Each bundle is one project.

**Where it lives:** Anywhere inside the vault paths covered by `projects_glob` in `onyx.config.json`. Typically: `02 - <workplace>/ProjectName/`, `03 - Ventures/Personal/ProjectName/`, `10 - OpenClaw/ProjectName/`.

**How to create one:**

```bash
onyx init "KrakenBot" --profile trading
# Creates:
# 03 - Ventures/Personal/KrakenBot/
# ├── KrakenBot - Overview.md
# ├── KrakenBot - Knowledge.md
# ├── KrakenBot - Strategy Context.md
# ├── Phases/
# │   └── P1 - Bootstrap.md
# ├── Directives/          ← empty, ready for project-specific directives
# └── Logs/
```

**Standard bundle structure for each profile:**

| Profile | Extra docs created |
|---|---|
| general | Overview, Knowledge |
| engineering | + Repo Context.md |
| content | + Source Context.md |
| research | + Research Brief.md |
| operations | + Operations Context.md |
| trading | + Strategy Context.md, Risk Model.md |
| experimenter | + Experiment Log.md, Cognition Store.md |
| accounting | + Account Ledger.md |
| legal | + Legal Precedent.md |

---

### 7. Overview

**What it is:** The Overview is the north star document for a project. It defines what the project is, what it's trying to achieve, who it's for, and what the safety rules are. ONYX injects it into every phase — every agent reads it before starting work.

**Where it lives:** `{bundle}/{project} - Overview.md`

**Example Overview — content project:**

```markdown
---
title: My Podcast
project_id: My Podcast
profile: content
voice_profile: Directives/voice-guide.md
pipeline_stage: research
safety_rules:
  - no-medical-advice
  - cite-all-claims
  - faith-aware
status: active
---

# My Podcast — Overview

## What is this project
A podcast about kidney health for patients and their families. Bilingual (English/Arabic). Published fortnightly.

## Mission
Make evidence-based kidney health information accessible to Muslim patients in the UK and internationally, delivered with warmth and cultural sensitivity.

## Target audience
- Patients with CKD, on dialysis, post-transplant, or at risk
- Their family carers and support networks
- Primarily Muslim; international audience

## Episode pipeline
Research → Script → Record → Edit → Publish

## Safety rules (non-negotiable)
- Never give personal medical advice
- Cite every clinical claim
- Flag any intervention with halal/haram considerations
- Do not reference specific brands unless editorially justified

## Voice
Warm, knowledgeable, direct. Like a trusted friend who happens to be a health professional. Not clinical. Not preachy.
```

---

### 8. Phase

**What it is:** A Phase is a unit of work. Every project is broken into phases. Each phase has a clear goal, a set of concrete tasks, acceptance criteria, and a state. The phase note is what ONYX reads to determine what work exists and whether it's ready to run.

**Where it lives:** `{bundle}/Phases/P{n} - {name}.md`

**Full phase file format:**

```markdown
---
project_id: "My Podcast"
phase_number: 3
phase_name: "Write script for episode 12 — Faith and Dialysis"
state: ready
tags: [onyx-phase, phase-ready]
directive: my-podcast-script-writer
priority: 7
risk: medium
complexity: standard
depends_on: [2]            # won't run until P2 is completed
---

## Summary

Write the full script for episode 12. Topic: balancing dialysis schedules with Ramadan fasting. Based on research from P2.

## Acceptance Criteria

- [ ] Script is 1,200–1,500 words
- [ ] All clinical claims cite a source from the P2 Research Brief
- [ ] Passes all safety_rules from Overview (no medical advice, faith-aware)
- [ ] Audio-ready format: no visual cues, no "as you can see"
- [ ] Knowledge.md updated with voice notes from this episode

## Tasks

- [ ] Read Source Context (My Podcast - Source Context.md) for voice calibration
- [ ] Read Research Brief from P2 (Research/2026-04-10 - Ramadan and Dialysis.md)
- [ ] Read last 3 episode scripts for tone consistency
- [ ] Write script: hook → patient story → evidence → expert context → takeaway → CTA
- [ ] Self-review against safety rules — fix any violations
- [ ] Write to: Episodes/E12 - Faith and Dialysis.md
- [ ] Append voice notes to Knowledge.md

## Human Requirements

(empty — no human input needed before this phase runs)

## Agent Log

(none yet — populated when phase runs)
```

**FSM states — what each means:**

| State | Tag | Meaning | How to move |
|---|---|---|---|
| `backlog` | `phase-backlog` | Phase exists but tasks not yet written | `onyx atomise` writes tasks → `ready` |
| `planning` | — | ONYX is currently decomposing/atomising | Automatic |
| `ready` | `phase-ready` | Tasks written, waiting to run | `onyx run` picks it up |
| `active` | `phase-active` | Agent is currently executing | Automatic (lock held) |
| `completed` | `phase-done` | Phase finished, can't re-run | Automatic on completion |
| `blocked` | `phase-blocked` | Human input required | Fix issue → `onyx reset "Project"` |

**Key frontmatter fields:**

| Field | Values | What it does |
|---|---|---|
| `state` | backlog/ready/active/completed/blocked | FSM state |
| `directive` | any directive name | Which directive to inject |
| `priority` | 0–10 (default 5) | Run order when multiple phases are ready |
| `risk` | low/medium/high | Tiebreaker for scheduling |
| `complexity` | light/standard/heavy | Which model tier to use |
| `depends_on` | [1, 2] | Phase numbers that must complete first |
| `cycle_type` | learn/design/experiment/analyze | Experimenter only: auto-wires directive |

---

### 9. Knowledge

**What it is:** Knowledge.md is the project's memory. Every agent reads it at the start of every phase and appends to it at the end. It accumulates: what worked, voice refinements, source quality notes, failed approaches, safety edge cases. It compounds across every phase run.

**Where it lives:** `{bundle}/{project} - Knowledge.md`

**How it grows:** The agent appends learnings at the end of each phase. Use `directive: knowledge-keeper` on a dedicated maintenance phase to restructure it into a searchable wiki instead of a flat append-log.

**Example (engineering project):**

```markdown
# KrakenBot — Knowledge

## Architecture decisions
**2026-04-10 (P3):** Switched from polling to WebSocket for order book updates.
Reason: polling at 500ms was hitting rate limits during high volatility. WS gives sub-100ms.
Impact: Requires reconnect logic — see /src/ws/reconnect.ts.

## Gotchas
**2026-04-12 (P4):** Kraken's OHLC endpoint returns candles in UTC. Our local timezone
calculation was off by 1h during BST. Fixed in commit a3f9b2. Add timezone test for any
future time-based logic.

## What to do differently next time
- Always check Kraken's API changelog before implementing a new endpoint — they deprecate quietly.
- Integration tests need a mock WS server. Using real Kraken in CI caused flaky tests during maintenance windows.
```

**Example (content project):**

```markdown
# My Podcast — Knowledge

## Voice refinements
- "Kidney journey" resonates better than "kidney disease" — less clinical, more lived experience
- Start episodes with a patient question, not a statistic — higher listener retention
- The word "haemodialysis" should always be followed by a plain-English explanation in parentheses on first use

## Research findings (recurring)
- PubMed has strong coverage of RCT data for fistula outcomes; weak on patient experience studies
- For qualitative patient data, Kidney Care UK patient stories are reliable and citable
- The Ramadan fasting + dialysis literature is thin — best source remains the 2016 consensus statement

## Safety notes
- Avoid any statement about whether fasting is safe for a specific patient — this is always "consult your nephrologist"
- ANNA Trust fundraising campaigns: do not mention without editorial sign-off
```

---

### 10. Source Context

**What it is:** Source Context is the stable identity document for a content project. It encodes what doesn't change: the show's format, the audience, the tone, the brand rules, the safety constraints. Written once; updated only when the brand changes. Different from Knowledge (which accumulates). Source Context is the anchor.

**Where it lives:** `{bundle}/{project} - Source Context.md`

**Only used by:** `content` profile projects.

**Example:**

```markdown
# My Podcast — Source Context

## Format
Audio-first podcast. Episodes 18–22 minutes. Published fortnightly on Spotify, Apple Podcasts, YouTube (with subtitles).

## Audience
Muslim patients with kidney disease (CKD stages 3–5, dialysis, post-transplant) and their family carers. Primarily UK and Gulf region but international. Mixed health literacy — some medically sophisticated, some newly diagnosed.

## Voice
Warm, knowledgeable, human. Like a trusted friend who happens to know a lot about kidneys.
- Not clinical: avoid jargon without explanation
- Not preachy: never tell people what to do; present evidence and let them decide
- Direct: get to the point; our listeners have enough to deal with

## Non-negotiable safety rules
1. Never give personal medical advice ("you should..."). Describe what the research says.
2. Cite every clinical claim.
3. Always recommend consulting their nephrologist for personal decisions.
4. Flag halal/haram considerations when relevant (diet, medication, fasting).
5. Do not mention specific brands without editorial approval.

## Episode structure
1. Hook (patient question or striking fact, 30s)
2. Topic framing (what we're covering and why it matters, 60s)
3. Evidence deep-dive (the research, 8–12 min)
4. Expert context (what a specialist would say, 3–5 min)
5. Patient takeaways (practical, faith-aware, 2–3 min)
6. CTA (subscribe, share, consult your care team)
```

---

### 11. Output / Episode

**What it is:** The deliverable that a phase produces. It's what the agent writes as the result of the work — a script, a report, a piece of code, an analysis. Output files are *not* injected back into the agent context (that would create noise). They're the product, not the process.

**Where it lives:** `{bundle}/Episodes/` (content), `{bundle}/output/` (general), or in the repo path (engineering).

**Note:** The agent writes to the output location. The next phase reads it if it needs to — this is how pipelines work. A script-writing phase writes to `Episodes/E12.md`. An audio-editing phase reads from `Episodes/E12.md`.

---

### 12. Log

**What it is:** The audit trail for a phase. Written by the agent when a phase completes. Records what happened, what was produced, what the safety result was, and how long it took. Logs are never injected into the agent's context — they're retrospective.

**Where it lives:** `{bundle}/Logs/L{n} - {name}.md`

**Example:**

```markdown
# Log: L3 — Script for Episode 12

**Phase:** P3 — Write script for episode 12
**Completed:** 2026-04-15 14:32
**Duration:** ~47 minutes
**Model:** claude-sonnet-4-6 (standard tier)

## What was done
1. Read Source Context and last 3 episode scripts for voice calibration
2. Read P2 Research Brief (Ramadan and Dialysis, 2026-04-10)
3. Wrote full script — 1,347 words
4. Self-reviewed against safety rules — 2 minor adjustments made (changed "you can safely fast" to "some patients fast with medical approval")
5. Appended voice notes to Knowledge.md

## Output
`Episodes/E12 - Faith and Dialysis.md` — 1,347 words

## Safety result
Pass — no medical advice given, all claims cited, 1 halal note added

## Knowledge update
Appended: "Muslim patient episodes consistently outperform general episodes in social shares. Lean into cultural specificity."
```

---

## How it all connects — context assembly order

When ONYX dispatches an agent for a phase, it assembles the prompt in this exact order:

```
1. Directive       ← who the agent is (bundle-local checked first, then system)
2. Profile         ← mechanical rules for this project type
3. Skills + Tools  ← procedures and capabilities declared on directive + phase
4. Overview        ← project goals, voice, safety constraints
5. Knowledge       ← everything learned in prior phases
6. Source Context  ← stable brand identity (content profile only)
7. Phase file      ← the actual work order: tasks + acceptance criteria
```

The agent reads identity → rules → capabilities → project → history → task. Every phase starts with complete context. The directive comes before the Overview so the agent knows who it is before reading what the project is.

---

## Directive resolution order

When a phase says `directive: my-podcast-researcher`, ONYX checks:

```
1. {bundle}/Directives/my-podcast-researcher.md   ← project-specific (checked first)
2. 08 - System/Agent Directives/my-podcast-researcher.md ← system (fallback)
```

If a bundle directive has the same name as a system directive, the bundle version wins. This is how you specialise: you create `my-podcast-researcher.md` in the bundle and it automatically overrides `clinical-researcher` without any formal inheritance — it just gets resolved first.

---

## Decision guide — which artifact do you need?

| You want to… | Create a… |
|---|---|
| Make a raw API/script capability available | **Tool** in `08 - System/Tools/` |
| Document a reusable procedure (sequence of steps) | **Skill** in `08 - System/Agent Skills/` |
| Give agents a consistent domain identity across projects | **System Directive** in `08 - System/Agent Directives/` |
| Give an agent a project-specific identity and voice | **Bundle Directive** in `{bundle}/Directives/` |
| Define the rules for a whole class of project | **Profile** in `08 - System/Profiles/` |
| Start a new project | **Bundle** via `onyx init` |
| Define one unit of work | **Phase** in `{bundle}/Phases/` |
| Record what a project has learned | **Knowledge** (auto-managed; just tell the agent to append) |
| Define a show/brand's stable identity | **Source Context** (content projects only) |

---

## What each artifact does NOT do

| Artifact | Does NOT… |
|---|---|
| **Tool** | Define how to do a task or who the agent is — just defines one callable action |
| **Skill** | Give the agent a domain identity or project-specific constraints — that's a directive |
| **System Directive** | Encode project-specific voice or audience — that's a bundle directive |
| **Bundle Directive** | Be reusable across unrelated projects — that's a system directive |
| **Profile** | Define the agent's role — that's a directive |
| **Knowledge** | Stay stable — it grows every phase; for stable facts, use Source Context |
| **Source Context** | Accumulate learning — for that, use Knowledge |
| **Phase** | Produce output directly — deliverables go in Episodes/ or output/, not the phase note |
| **Log** | Define work — it records what happened; the phase defines what to do |

---

## Tool `kind:` field — allowed values

Tool files use `kind:` in frontmatter to signal *how* the tool is invoked. This affects injection rules and agent expectations:

| `kind:` value | Meaning | Example | Ready to use? |
|---|---|---|---|
| `native` | Built into Claude Code (WebSearch, WebFetch, Bash, Read, Write, Edit) | `web-search`, `web-fetch` | Always — no setup needed (Tier 1) |
| `npm-script` | Invoked via `npm run <script>` in the project repo | `research:fetch`, `audio:generate` | Requires the repo to be built and deps installed |
| `script` | Shell/Python script at a known path | `tools/tts-generate.sh` | Depends on script availability on PATH |
| `api` | Direct API call via a shell tool (curl/fetch) + API key | PubMed, Linear, UNOS | Needs API key in `.env` (Tier 2) |
| `headless` | Headless browser-driven (Chromium, Playwright) | scraping targets without APIs | Needs Playwright installed (Tier 3) |
| `integration` | Full OAuth/SDK integration, long-lived session | Linear, Fitbit | Needs OAuth + possibly build-first setup (Tier 3) |

> When a tool's `kind:` implies setup isn't complete, the pre-flight (`onyx doctor`) should flag it before a run. If it doesn't yet, see §Changes Needed below.

---

## Tool context caps

To prevent tool-file bloat from pushing out phase content:

| Context slot | Max chars | Overflow behaviour |
|---|---|---|
| Tool injected into **executor** context | 3,200 per tool | Truncate with `… [truncated]` marker |
| Tool injected into **planner** context | 4,000 per tool | Truncate |
| Skill injected into any context | 6,000 | Truncate |
| Directive (system or bundle) | 8,000 | Truncate |
| Profile | 4,000 | Truncate |

These caps exist in the context assembler. If a tool doc exceeds the cap, the agent sees a truncated version — keep tool files concise, link to longer refs if needed.

---

## Roadmap

- **Tool inventory audit.** Cross-reference every tool named in this doc against `08 - System/Tools/*.md`. Mark each ✅ (exists) or 📋 (planned). Tools often mentioned but not yet implemented: `pdf-extract`, `image-resize`, `tts-generate`, `video-render`, `linear-sync`.
- **Enforce tool context caps.** The cap numbers above (3,200 / 4,000 / 6,000 / 8,000 / 4,000) reflect design intent. Verify `src/agents/contextAssembler.ts` truncates at injection time; if not, implement it so the caps are load-bearing.
- **Write `accounting.md` and `legal.md` profiles** — tracked across all System docs.
