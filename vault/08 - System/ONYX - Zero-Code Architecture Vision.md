---
title: ONYX — Zero-Code Architecture Vision
tags: [system, architecture, vision, onyx, design]
type: design
version: 1.0
created: 2026-04-16
updated: 2026-04-16
graph_domain: system
up: System Hub
---
## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]
**Related:** [[08 - System/Agent Directives/ONYX Architecture Directive.md|ONYX Architecture Directive]] · [[08 - System/ONYX - Reference.md|ONYX Reference]] · [[08 - System/Agent Directives/Agent Directives Hub.md|Agent Directives Hub]]

# ONYX — Zero-Code Architecture Vision

> **Status:** Design hypothesis. Not an implementation plan — a thought experiment about the simplest possible ONYX that still works.
>
> **The hypothesis:** every line of orchestration code in the current ONYX runtime is encoding a *decision under constraints*. LLMs are decision engines under constraints. Therefore the TypeScript orchestrator is redundant if the constraints are expressed clearly enough in markdown for an agent to follow them.
>
> If that's true, the minimum viable ONYX is: **a vault + a single master directive + an agent with tool access**. No `dist/`. No `onyx run`. No FSM code. Just files telling an agent how to be the runtime.

---

## 1. Why this matters

The current ONYX is ~15,000 lines of TypeScript implementing a deterministic FSM: read vault state, match against a routing table, spawn an agent, capture output, write back. Every time we want a new behaviour we ship code — a new atomic step, a new phase transition, a new error class.

But we already have a working proof that this isn't always necessary:

- **My Podcast** runs end-to-end (research → script → audio → video → publish → engage → analyse) with *seven markdown directives* and a handful of thin tool scripts (`npm run audio:generate`, etc.). The "orchestration" is whichever agent is currently active reading the directive, doing the work, writing back to the phase file, and handing off.
- **<workplace> phase agents** operate the same way. The phase file itself contains the acceptance criteria, the directive tells the agent what success looks like, and the agent decides when a phase is done.

The code-based orchestrator is load-bearing in two places: (1) the run loop that picks up `phase-ready` phases and spawns agents, and (2) self-healing of vault drift. Everything else — routing, state transitions, telemetry, error classification — is *instructions that happen to be written in TypeScript instead of markdown*.

This document asks: **what if we wrote them in markdown instead?**

---

## 2. What would disappear

| Component today | Becomes |
|---|---|
| `src/routing/` — deterministic routing table | A markdown table in the master directive |
| `src/pipeline/` — atomic step catalog | Each step is a bullet under "If state is X, do Y" |
| `src/state-machine/` — FSM transitions | "Valid transitions" table in the directive |
| `src/healer/` — drift detection & repair | "Before doing anything else, check these invariants" section in the directive |
| `src/telemetry/` — ExecLog.md writes | The agent writes to ExecLog.md itself (it already knows how to write markdown) |
| `src/error-taxonomy/` — RECOVERABLE/BLOCKING/INTEGRITY | Three paragraphs: "If X, retry. If Y, block. If Z, stop and alert." |
| `onyx.config.json` + `.env` resolution | A single `System Config.md` with frontmatter |
| `onyx doctor` | A `Doctor Directive.md` the agent reads and executes as a checklist |
| `writeBundle()` single-writer guarantee | A rule in the directive: "never write a file without updating its `updated:` field and adding a line to ExecLog.md" |

The TypeScript binary shrinks from 15K lines to **one shell script** that spawns Claude with the master directive pointed at the vault.

---

## 3. What stays

Not everything compresses to prose. Three things remain as code, because they're actual I/O primitives the agent needs to *call*:

### 3.1 Tool scripts
The small, composable tools the agent invokes to affect the outside world:

- `tools/tts-generate.sh` — ElevenLabs call, returns MP3 path
- `tools/pubmed-search.sh` — API fetch, returns JSON
- `tools/git-commit.sh` — stages and commits with a message
- `tools/notify.sh` — sends a push notification

Each tool is a single file, does one thing, returns its result on stdout. The agent decides *when* to call them; the tool just executes.

### 3.2 File-watch trigger
Something has to notice when a phase file's frontmatter flips to `phase-ready` and wake the agent. Options:

- A cron job (`*/5 * * * *`) that invokes Claude with "scan the vault for phase-ready work"
- An inotify watcher: `fswatch vault/ | xargs -I{} claude --resume`
- Manual: just type `/loop` or call the agent when you want it to work

The file-watch is *not* orchestration. It's a doorbell. The agent does everything that happens after the doorbell rings.

### 3.3 Authentication carriers
API keys, OAuth tokens, IMAP passwords. These live in `.env` and are injected into tool calls. The directive references them by name ("use `$ELEVENLABS_API_KEY`") but doesn't store them.

That's it. Everything else is markdown.

---

## 4. The vault as runtime

Current ONYX treats the vault as a *mirror* of state held in the TypeScript runtime. Zero-code ONYX treats the vault as *the runtime itself*. The agent reads the vault, reasons, writes back, and the vault's new state is the program counter.

```
┌───────────────────────────────────────────────────┐
│                   THE VAULT                       │
│                                                   │
│  Master Directive  ──────┐                        │
│                          ▼                        │
│  Profiles  ──────▶  AGENT  ◀──────  Phase Files   │
│                          │                        │
│                          ▼                        │
│  Tools (shell)  ◀────────┘                        │
│                          │                        │
│                          ▼                        │
│  Phase Files (updated)  +  ExecLog.md (appended)  │
└───────────────────────────────────────────────────┘
```

The agent's "working memory" is the vault open on disk. Its "program" is the master directive. Its "state" is whatever the frontmatter currently says. Its "execution" is writing new frontmatter and appending to logs.

---

## 5. The minimum file set

A working zero-code ONYX needs exactly these files. Everything else is project-specific and layered on top.

```
vault/
├── System/
│   ├── ONYX Master Directive.md     ← the whole runtime, in prose
│   ├── System Config.md             ← paths, defaults, feature flags
│   ├── Doctor Directive.md          ← health check procedure
│   ├── Profiles/                    ← per-project mechanical contracts
│   │   ├── engineering.md
│   │   ├── content.md
│   │   └── research.md
│   └── Directives/                  ← per-role directives
│       ├── researcher.md
│       ├── script-writer.md
│       ├── audio-producer.md
│       └── ...
├── Projects/
│   └── <ProjectName>/
│       ├── Overview.md              ← what this project is
│       ├── Knowledge.md             ← what has been learned
│       ├── Phases/                  ← work unit queue
│       │   ├── P01 - Do the thing.md
│       │   └── P02 - Do the next thing.md
│       └── Logs/
│           └── L01 - Phase completion report.md
└── ExecLog.md                       ← append-only run trail
```

The master directive + the phase file + the project's profile and knowledge are sufficient context for any agent to execute any phase. Nothing else is required.

---

## 6. The Master Directive: runtime-in-prose

This is the file that replaces `src/cli/onyx.ts` + `src/pipeline/*` + `src/state-machine/*`. A sketch:

```markdown
# ONYX Master Directive

You are the ONYX runtime. When invoked, execute this loop:

## Step 1 — Heal the vault
Read `Doctor Directive.md` and run every check it lists. If any check fails,
fix it before proceeding. Do not skip this step; drift compounds silently.

## Step 2 — Find work
Scan `Projects/*/Phases/*.md` for files whose frontmatter contains
`status: phase-ready` and no `lock:` field. Of those, pick:
1. The oldest by `created:` within the highest-priority project
2. Priority is determined by the project's `Overview.md` frontmatter `priority:` (1 highest, 5 lowest)

If no work is found, exit cleanly and append a line to `ExecLog.md`.

## Step 3 — Acquire the phase
Write a `lock:` field to the phase frontmatter with the current ISO timestamp and
your agent ID. This prevents other agents from picking up the same phase.
Write `status: phase-active`.

## Step 4 — Load context
Read in order:
1. The phase file itself (including the `## Work` section)
2. `Profiles/<project.profile>.md` — mechanical contract
3. `Directives/<phase.directive>.md` — role you're playing
4. `Projects/<project>/Knowledge.md` — what the project has learned so far
5. Any files linked via `[[wikilinks]]` in the phase file

## Step 5 — Execute
Follow the directive. Call tools as needed. Write intermediate state to the
phase file's `## Progress` section as you go — never hold work-in-progress only
in your own context window.

## Step 6 — Complete or block
When finished, set `status: phase-done` and fill in `## Outcome`.
If blocked, set `status: phase-blocked`, fill in `## Human Requirements`,
and describe exactly what is needed to unblock.

## Step 7 — Record
Append one line to `ExecLog.md`:
`YYYY-MM-DD HH:MM | <project> | <phase> | <status> | <duration> | <notes>`

## Step 8 — Loop
Return to Step 1 unless a stop condition is met (see §9).

## Error handling
- **RECOVERABLE** (transient tool failure, rate limit): retry with exponential
  backoff, max 3 attempts. Log to ExecLog as `retry`.
- **BLOCKING** (missing input, ambiguous requirement): set phase-blocked,
  describe in Human Requirements, exit.
- **INTEGRITY** (vault is inconsistent with itself): stop everything, set
  `status: phase-integrity-error`, write a full report, alert via `notify.sh`.

## Invariants
- Never delete a phase file. Archive by moving to `Projects/<name>/Archive/`.
- Never write to a file without updating its `updated:` frontmatter.
- Never hold a phase lock for more than 30 minutes — if you're still working,
  refresh the lock with a new timestamp.
- Never call a tool without recording the call + result in the phase's
  `## Progress` section.
```

That's it. The whole runtime. Give this file to an agent, point it at the vault, and the system runs.

---

## 7. Profiles as mechanical constraints

A **profile** defines *how* an agent should operate in a given project context — what's allowed, what's forbidden, what conventions apply. Think of it as the project's constitution.

`Profiles/content.md` example:

```markdown
# Content Profile

Applies when: project.profile = "content"

## Conventions
- Scripts live in `vault/scripts/<episode-id>.json` (flat ScriptSchema format)
- Audio outputs live in `output/audio/<episode-id>/full.mp3`
- Sources must cite PubMed ID or authoritative URL — no unsourced medical claims

## Forbidden
- Generating medical advice
- Publishing without safety flag review
- Skipping the pronunciation dictionary pass before TTS

## Tool permissions
- Allowed: tts-generate, pubmed-search, rss-fetch, ffmpeg, git
- Denied: shell commands outside `tools/`, direct API calls to unknown endpoints

## Completion criteria
A phase is only `phase-done` if:
1. All acceptance criteria in the phase file are met
2. A log entry exists at `Projects/<name>/Logs/L<N> - <phase>.md`
3. Any produced artefacts are linked from the phase file
```

The profile is a *filter* on what the agent can do. It's the same mechanism as CLAUDE.md files in code repos, but scoped to a project archetype instead of a codebase.

---

## 8. Directives as role contracts

A **directive** defines *who the agent is being* for a specific phase. It's a role with success criteria.

Directives already work this way today in My Podcast. The shape is:

```markdown
# Directive: <Role Name> (<Phase Code>)

## Role
One paragraph: who you are, what you produce.

## Read First
The exact files to read, in order, before acting. This is the context
bootstrap sequence.

## Constraints
What you must not do. What must remain true across your work.

## Tool Calls
The exact commands this role is allowed to invoke, with example invocations.

## Output
What must exist when you're done. Where it goes. Which frontmatter
fields must be updated.

## Phase Completion
The rule for closing the phase cleanly. Usually "write `<!-- None -->` in
Human Requirements if clean; otherwise describe the block."
```

An agent loaded with a directive becomes that role for the duration of the phase. When the phase ends, the role ends. The next phase may have a different directive and a different role.

This is cleaner than the current system where the directive *informs* the TypeScript runtime. Here, the directive *is* the runtime for that phase.

---

## 9. The agent loop without code

The current `onyx run` is:

```typescript
while (true) {
  const phase = await findReadyPhase()
  if (!phase) break
  const result = await executePhase(phase)
  await writeResult(result)
}
```

The zero-code equivalent is a sentence in the master directive:

> After completing a phase, check if another phase is ready. If yes, pick it up. If no, exit.

The agent is the loop. There is no outer runtime. When the agent runs out of ready work, it stops. When a human (or a cron trigger) invokes it again, it resumes.

**Stop conditions** the directive specifies:
- No phase-ready work anywhere
- A phase returned INTEGRITY (halt and alert)
- The agent has been running for more than the configured max (e.g. 2 hours) — prevents runaway sessions
- A `System Config.md` flag `paused: true` is set

---

## 10. Self-healing in prose

The current `onyx heal` does things like: detect stale locks, reconcile broken links, repair orphaned logs, fix phase IDs that drifted from filenames.

Each of these is a paragraph in `Doctor Directive.md`:

```markdown
# Doctor Directive

Before each run, check:

## Stale locks
For every phase file with `lock:` set, compare the lock timestamp to now.
If older than 30 minutes, remove the lock field and append to ExecLog:
`healed | stale-lock | <phase-id>`

## Orphaned logs
For every file in `Projects/*/Logs/`, confirm its `phase:` frontmatter
points to an existing phase file. If not, move to `Projects/<name>/Archive/`.

## Broken wikilinks
Grep `[[...]]` across all phase and log files. For each match, confirm
the target file exists. If not, mark the source file with
`drift: broken-link` in frontmatter and append to ExecLog.

## Phase ID drift
For each phase file, confirm `filename prefix == frontmatter.id`.
If not, rename the file to match the frontmatter — frontmatter is
the source of truth.
```

The agent reads this, does each check, and moves on. Self-healing is not a separate module — it's just "things the agent does before starting work."

---

## 11. What breaks at scale

This approach has real failure modes. Being honest about them:

### 11.1 Determinism
The current ONYX is *deterministic* — given the same vault state, routing always produces the same result. A zero-code ONYX is *probabilistic* — the same state could yield slightly different decisions across runs because the agent is an LLM.

**Mitigation:** The master directive includes a decision table that's essentially a routing table in prose. The agent must check it before deciding. Temperature can be set low. Key decisions (status transitions) can be expressed as hard rules ("you MUST set status to X when Y") rather than suggestions.

### 11.2 Speed
Reading a master directive + profile + directive + phase file + knowledge file on every phase is expensive. The code version does this once at startup.

**Mitigation:** Prompt caching. The master directive + profiles + common directives are stable across phases. The agent's cache hit rate should be high. For very fast phases, the file-watch trigger can pass context directly so the agent doesn't re-read everything.

### 11.3 Token cost
Every phase now costs an LLM call to *decide* what to do, in addition to the LLM call to *do* it. If phases are short, this overhead dominates.

**Mitigation:** Group related phases into a single agent invocation. The master directive permits batch mode: "if you find N consecutive phases that share a directive, execute them in one session."

### 11.4 Non-agent consumers
Today the dashboard reads vault state via the TypeScript runtime's APIs. If there's no runtime, the dashboard has to parse the vault directly.

**Mitigation:** This is actually fine — the vault is already markdown with structured frontmatter. A dashboard can use gray-matter or similar to read it. The runtime was never adding value there; it was just a layer.

### 11.5 Parallel agents
Today ONYX coordinates multiple agents via the lock file and the dispatcher.

**Mitigation:** The lock mechanism still works in prose — the directive instructs each agent to acquire a lock before starting. Multiple agents reading the same master directive can coordinate through the vault's file system, because file writes are atomic on Linux.

---

## 12. A practical minimum viable version

To test this idea without rebuilding everything:

1. **Pick one project** (My Podcast is the ideal candidate — it already works this way).
2. **Write the Master Directive** (§6) pointed at that project's vault section.
3. **Strip its tool invocations** to pure shell scripts (already done for My Podcast).
4. **Invoke the agent manually** with: `claude --append-system "$(cat Master\ Directive.md)" --dir vault/`
5. **Watch what happens** when you mark a phase `phase-ready`.

If the agent correctly picks up the phase, loads context, executes, writes back, and moves to the next one — the hypothesis is validated. If it fails, the failures teach you what the current TypeScript code is actually doing that the directive didn't capture.

The gap between "directive agent can do it" and "TypeScript agent can do it" is the true minimum code surface of ONYX. Everything else can go.

---

## 13. The deeper claim

This is not really about ONYX. It's about a general pattern:

> **Anywhere a rule-based system coordinates work between agents, that coordination can probably be expressed as a directive to a meta-agent instead.**

The code-based ONYX is load-bearing because we didn't yet trust the agent to do the coordination. My Podcast is proof we can. If the profiles, directives, and constraints are tight enough, the orchestrator doesn't need to be a compiled binary — it can be a paragraph.

The end state is: **the vault runs itself, guided by its own documentation.**

---

## 14. Open questions

- **Who writes the Master Directive?** The agent itself, from observing the current runtime? Or hand-written by a human who understands both?
- **How do you test a prose runtime?** Markdown has no type system. Snapshot testing of agent outputs against reference vaults might be the answer.
- **Can the agent modify its own Master Directive?** The knowledge-compounding loop (§22 in the Architecture Directive) says yes — but only into a `proposed-changes/` folder that a human reviews before merging.
- **What's the smallest tool surface?** If we had to pick five tools, which five would they be? (Probably: read-file, write-file, shell-exec, fetch-url, notify.)
- **Does this work if the agent changes?** A directive written for Claude may not transfer cleanly to GPT-5 or Gemini. Directives are a leaky abstraction over agent capabilities.

---

## 15. Next steps

If this vision is worth pursuing:

1. Spend a week operating My Podcast with *zero* ONYX code involvement — only the directives and tool scripts. Document what breaks.
2. Extract the minimum shell-tool surface from the current runtime into `vault/tools/`.
3. Draft the Master Directive based on what the current runtime actually does (not what its docs say it does).
4. Try running a full week of My Podcast work on the directive alone.
5. If successful, migrate one <workplace> project. If still successful, deprecate `onyx run` for simple projects and keep the TypeScript runtime only for cases that genuinely need deterministic routing.

The goal is not to delete code for its own sake. It's to reduce ONYX to its irreducible core — and discover whether that core is code at all, or just a well-written set of instructions.

---

## 16. Building the Master Directive — concrete roadmap

This section is the practical sequel to §6. §6 sketched what the Master Directive *is*; this section describes how to build it, grounded in what actually exists in `src/` as of **2026-04-16** (see [[08 - System/Agent Directives/ONYX Architecture Directive.md|Architecture Directive]] §25 for the current audit).

### 16.1 What we're actually replacing

The real code surface is smaller than the v3 docs claimed. Concretely, the Master Directive needs to express behaviour currently found in:

| Module | Lines | What it does | Master Directive translation |
|---|---|---|---|
| `src/controller/loop.ts` | ~200 | Outer run loop: heal → discover → route each phase → notify | 8-step loop section (§6) |
| `src/controller/router.ts` | ~40 | Maps phase state → operation | A 6-row decision table |
| `src/fsm/states.ts` | ~30 | Phase transitions | One table + "Valid next states" rule |
| `src/planner/atomiser.ts` | ~250 | Turns `backlog` phase → tasks | Embedded in atomise operation description |
| `src/planner/consolidator.ts` | ~150 | Post-completion Knowledge.md synthesis | Embedded in execute completion flow |
| `src/planner/phasePlanner.ts` | ~200 | Decompose Overview → phase stubs | Referenced from `onyx plan` equivalent |
| `src/planner/replan.ts` | ~100 | Adjust existing plan | Referenced from `ready/planning` transition |
| `src/executor/runPhase.ts` | ~300 | Main work unit: spawn Claude with context, capture output | The directive's "Step 5 — Execute" |
| `src/healer/index.ts` | ~120 | Stale lock cleanup + graph maintenance | "Step 1 — Heal the vault" |
| `src/vault/graphMaintainer.ts` | ~150 | Fractal link integrity | Part of heal step |
| `src/vault/discover.ts` | ~80 | Find phase files + dependency graph | "Step 2 — Find work" |
| `src/lock/*` | ~100 | Lock acquisition + release | "Step 3 — Acquire the phase" |
| `src/notify/notify.ts` | ~50 | Push notifications (openclaw CLI) | One shell tool: `tools/notify.sh` |

Total: ~1,800 lines of TypeScript. The Master Directive target: **~400 lines of markdown**. The compression ratio (~4.5×) is a reasonable pressure test — if the directive blows up past ~800 lines, we're probably doing something wrong and should rethink.

### 16.2 Staged migration — 5 milestones

Rather than try to replace everything at once, migrate in stages. Each milestone is a working state the system can live in for weeks.

**Milestone 1 — Audit the current runtime (preparation)**
- Read each file in the table above; summarise what it actually does (not what v3 docs claim).
- Produce `System/Runtime Audit.md` listing every side effect: file writes, stdout, notifications, API calls.
- This audit becomes the test oracle for the Master Directive — if the directive agent does all these side effects in the right order, behaviour is preserved.

**Milestone 2 — Freeze the tool surface**
- Create `vault/tools/` (or `08 - System/Tools/shell/`).
- Extract every shell-callable behaviour from `src/` into a small script:
  - `heal-stale-locks.sh` — replicates `src/healer/staleLocks.ts`
  - `maintain-graph.sh` — replicates `src/vault/graphMaintainer.ts`
  - `discover-phases.sh` — grep-based replacement for `src/vault/discover.ts`
  - `atomise-phase.sh` — wraps the current atomiser with stdin JSON → stdout diff
  - `consolidate-knowledge.sh` — wraps the consolidator
  - `notify.sh` — already exists (openclaw wrapper)
  - `write-exec-log.sh` — append one line to `ExecLog.md`
- Each script takes args + env, emits structured output, exits with a clear code. No hidden state.
- The script catalog is frozen — new scripts are a deliberate decision, not a reflex.

**Milestone 3 — Write Master Directive v0.1**
- Draft the directive from the §16.1 table and the Runtime Audit.
- Structure:
  1. Preamble (this is the runtime — act accordingly)
  2. Invariants (never-ever rules)
  3. The 8-step loop (§6)
  4. Operation descriptions (atomise / execute / surface_blocker / wait / skip)
  5. Error taxonomy (RECOVERABLE / BLOCKING / INTEGRITY)
  6. Tool reference (inline catalog of `vault/tools/*` scripts)
- **Test**: run the directive on My Podcast (which already operates this way). The first divergence from the current runtime is the first bug to fix in the directive, not the agent.

**Milestone 4 — Run in shadow mode**
- For one week, have *both* the TS runtime and the directive-agent process phases, but only the TS runtime writes to the vault.
- Dump the directive agent's planned writes to a diff file; compare against what the TS runtime actually wrote.
- Fix divergences in the directive until the diff is consistently empty.

**Milestone 5 — Flip the switch**
- Stop `onyx run` for My Podcast; make directive-agent the primary runtime.
- Keep TS runtime for engineering projects initially (they exercise more edge cases — git ops, test runners).
- After 2 weeks of stable directive-runtime My Podcast operation, migrate one engineering project.
- After 4 weeks, deprecate `onyx run` for anything that doesn't use the pipeline-recipe layer (which doesn't actually exist, per §25).

### 16.3 First draft structure of the Master Directive

Concrete skeleton to start from:

```markdown
---
title: ONYX Master Directive
type: master-directive
version: 0.1
entry_point: true
---

# ONYX Master Directive

You are the ONYX runtime. This document is your program. Execute it deterministically.

## 0. Preamble
[2-3 paragraphs: your scope, what the vault is, what "one iteration" means]

## 1. Invariants (read every time)
- Never write a file without updating its `updated:` frontmatter
- Never hold a phase lock for more than 30 minutes without refreshing
- Never delete a phase file — archive to Projects/<name>/Archive/
- Never skip the heal step (§3)
- Never call a tool without recording the call + result in the phase's ## Progress section
- Never advance a phase past `completed` without consolidating its learnings

## 2. One iteration of the runtime
[The 8 steps from §6, expanded]

## 3. Heal step (always first)
[Detailed list of checks — stale locks, broken links, orphan logs, frontmatter drift]

## 4. Discover step
[Dependency graph rules, priority ordering, lock acquisition]

## 5. Operations
### 5.1 atomise
[What "backlog → ready" means; acceptance criteria for atomisation]
### 5.2 execute
[The big one — how to run a phase end to end]
### 5.3 surface_blocker
[Blocked phase handling]
### 5.4 wait
[When atomiser is in flight]
### 5.5 skip
[Completed or invalid state]

## 6. Error taxonomy
[RECOVERABLE / BLOCKING / INTEGRITY with examples]

## 7. Tool reference (inline catalog)
[One short block per `vault/tools/*` script — purpose, args, output, exit codes]

## 8. State transition reference
[The PHASE_TRANSITIONS table verbatim, plus the routePhase decision table]

## 9. Log format
[Exact lines to append to ExecLog.md; exact format of the phase ## Progress section]

## 10. Stop conditions
[When to halt one iteration vs stop entirely]

## 11. Known limitations
[Things the agent should explicitly ask a human about rather than guessing]
```

### 16.4 Open design decisions (for the draft)

These are live questions the first draft of the Master Directive must answer:

1. **Lock mechanism.** Current TS runtime uses filesystem-based locks. Does the directive use the same primitive, or is "acquire the phase" just "write `lock: <timestamp>` to frontmatter"? The latter is simpler but loses atomicity.
2. **Concurrency.** Can two directive-agents run at once? If yes, the `lock` field plus read-modify-write discipline should be enough — but we need a stress test.
3. **LLM call from within the agent.** The atomiser currently calls the LLM to generate task lists. In a directive-runtime, is the meta-agent also the atomiser, or does it invoke a sub-agent? Simpler: meta-agent does it. Cost: larger context per iteration.
4. **Determinism gate.** Should a subset of transitions be enforced by a pre-commit hook (rejecting vault writes that violate `PHASE_TRANSITIONS`)? That hybrid gives us directive-driven orchestration + a safety net.
5. **Change log.** How does the directive change? Propose: all edits go through a regular phase in `08 - System/` with the `engineering` profile, so the directive's own evolution is visible in the same system that it governs.

### 16.5 Success criteria for the migration

The directive-runtime is a success if, after 4 weeks of primary operation:

- Zero phases have drifted into an invalid state (all `PHASE_TRANSITIONS` respected)
- Zero vault integrity issues that weren't caught by the heal step
- ExecLog.md is complete and parseable (no missing entries)
- Every Knowledge.md update can be traced to a completed phase
- The TypeScript runtime's `src/planner/`, `src/controller/`, `src/executor/` directories can be safely deleted without affecting My Podcast or at least one engineering project
- Someone other than the author can read the Master Directive and understand how ONYX works in under 30 minutes

If any of these fail, the directive isn't yet a drop-in replacement — revert to TS runtime and iterate.

### 16.6 Relationship to the Architecture Directive

Once the Master Directive exists:

- [[08 - System/Agent Directives/ONYX Architecture Directive.md|Architecture Directive]] becomes *historical* — a record of the TS-runtime era, kept for archaeology and for projects that still use `onyx run`
- The Master Directive (this doc's §6 + §16.3) becomes the authoritative runtime spec
- [[08 - System/ONYX - Reference.md|ONYX Reference]] stays — it's the user-facing reference; it just points at a different underlying implementation

The goal isn't to delete the Architecture Directive. It's to make it no longer load-bearing.
