import type { VaultBundle } from '../vault/reader.js';
import { readPhaseNode } from '../vault/reader.js';
import type { ControllerConfig } from '../config/load.js';
import { notify } from '../notify/notify.js';
import { writeFile } from '../vault/writer.js';
import { planningCall, planningUsesAgent } from '../llm/planningRouter.js';
import { scanRepoFiles } from '../vault/repoScanner.js';
import path from 'path';
import fs from 'fs';

// Find the highest existing phase_number in the Phases/ directory, return max+1.
function nextPhaseNumber(phasesDir: string): number {
  if (!fs.existsSync(phasesDir)) return 1;
  const files = fs.readdirSync(phasesDir).filter(f => f.endsWith('.md'));
  let max = 0;
  for (const f of files) {
    const m = f.match(/^P(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return max + 1;
}

// scanRepoFiles imported from ../vault/repoScanner.js

const PLANNER_SYSTEM_PROMPT = `You are a senior technical architect decomposing a software project into implementation phases.

Rules:
- 4-8 phases maximum
- Each phase must be independently deliverable and testable
- Phases ordered by dependency (earlier phases unblock later ones)
- Phase name: 3-6 words, action-oriented (e.g. "Ship authentication layer")
- Use the repo file structure to ground phase boundaries in what actually exists
- For each phase, write 2-4 acceptance criteria as measurable, binary done conditions
  (e.g. "All existing tests pass", "GET /api/foo returns 200 with correct shape")
- Output ONLY valid JSON — no prose, no markdown fences

GROUNDING RULES:
- Phase boundaries must align with actual repo structure — don't create phases for code that doesn't exist yet unless the phase explicitly creates it
- acceptance_criteria must be verifiable with commands available in the repo (check package.json scripts, test framework, etc.)
- context field should reference specific files/patterns from the repo tree, not abstract descriptions
- If the overview mentions technologies not visible in the repo, the FIRST phase must set them up

Format:
[
  {
    "number": 1,
    "name": "Short phase name",
    "summary": "2-3 sentences on what this phase builds and why it comes first.",
    "context": "Key facts the agent must know: existing patterns to follow, constraints, prior work to build on.",
    "acceptance_criteria": ["Measurable done condition", ...]
  },
  ...
]`;

interface PhaseSpec {
  number: number;
  name: string;
  summary: string;
  context?: string;
  acceptance_criteria?: string[];
}

// Resolve the repo path from bundle overview frontmatter
function resolveRepoPath(bundle: VaultBundle, config: ControllerConfig): string {
  if (bundle.overview.exists) {
    const explicit = String((bundle.overview as unknown as Record<string, unknown>)['repo_path'] ?? '').trim();
    if (explicit && fs.existsSync(explicit)) return explicit;
  }
  // Parse frontmatter manually from raw overview
  const m = bundle.overview.raw?.match(/^repo_path:\s*["']?([^"'\n]+)["']?/m);
  if (m) {
    const p = m[1]!.trim();
    if (p && fs.existsSync(p)) return p;
  }
  // Fuzzy fallback via reposRoot
  const reposRoot = config.reposRoot;
  if (reposRoot && fs.existsSync(reposRoot)) {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '');
    const needle = norm(bundle.projectId);
    const entries = fs.readdirSync(reposRoot, { withFileTypes: true });
    let best: { p: string; s: number } | null = null;
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const candidate = norm(ent.name);
      let score = 0;
      if (candidate === needle) score = 100;
      else if (candidate.includes(needle) || needle.includes(candidate)) score = 60;
      if (score > 0 && (!best || score > best.s)) best = { p: path.join(reposRoot, ent.name), s: score };
    }
    if (best) return best.p;
  }
  return '';
}

// Step 1: call LLM with Overview + repo scan → create P1..Pn phase notes in GZOS format.
// All phases start as phase-backlog (no tasks yet — atomiser fills those in).
// Returns paths of created phase notes.
export async function planPhases(
  bundle: VaultBundle,
  runId: string,
  config: ControllerConfig
): Promise<string[]> {
  // Guard: if phases already exist, skip to prevent duplicates.
  const phasesDir = path.join(bundle.bundleDir, 'Phases');
  if (fs.existsSync(phasesDir)) {
    const existingPhases = fs.readdirSync(phasesDir).filter(f => f.match(/^P\d+/) && f.endsWith('.md'));
    if (existingPhases.length > 0) {
      console.log(`[plan] ${bundle.projectId}: ${existingPhases.length} phases already exist — skipping creation.`);
      console.log(`  To rebuild: delete ${phasesDir} and re-run.`);
      return [];
    }
  }

  await notify({ event: 'atomise_started', projectId: bundle.projectId, detail: 'Planning phases', runId }, config);

  const overviewContent = bundle.overview.exists ? bundle.overview.raw : `# ${bundle.projectId}\n\nNo overview.`;
  const repoPath = resolveRepoPath(bundle, config);

  if (!planningUsesAgent(config, repoPath)) {
    const apiKey = config.llm.apiKey ?? process.env['OPENROUTER_API_KEY'];
    if (!apiKey) throw new Error('planPhases: set OPENROUTER_API_KEY');
  }

  const repoTree = scanRepoFiles(repoPath);
  const repoSection = planningUsesAgent(config, repoPath)
    ? `You have full read access to the repo at ${repoPath} — use Read, Glob, and Grep as needed to understand the codebase.`
    : `Repo file structure (${repoPath || 'path unknown'}):\n${repoTree}`;

  const userPrompt = `Project overview:\n\n${overviewContent}\n\n---\n\n${repoSection}\n\nDecompose this into implementation phases.`;

  const output = await planningCall({
    config,
    repoPath,
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 3000,
  });

  let phases: PhaseSpec[];
  try {
    const jsonMatch = output.match(/\[[\s\S]+\]/);
    if (!jsonMatch) throw new Error('No JSON array in LLM output');
    phases = JSON.parse(jsonMatch[0]) as PhaseSpec[];
  } catch (err) {
    throw new Error(`planPhases: parse error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const logsDir = path.join(bundle.bundleDir, 'Logs');
  const createdPaths: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  let nextNum = nextPhaseNumber(phasesDir);

  for (const phase of phases) {
    const n    = nextNum++;
    const name = typeof phase.name === 'string' ? phase.name : `Phase ${n}`;
    const summary = typeof phase.summary === 'string' ? phase.summary : '';
    const context = typeof phase.context === 'string' ? phase.context : '_Fill in: key facts the agent must know before executing this phase._';

    const acceptanceCriteria = Array.isArray(phase.acceptance_criteria) && phase.acceptance_criteria.length > 0
      ? phase.acceptance_criteria.map(c => `- [ ] ${c}`).join('\n')
      : '- [ ] All tasks complete and validated';

    // depends_on: P1 has no deps, each subsequent depends on previous
    const dependsOn = n === 1 ? '[]' : `[${n - 1}]`;

    const phaseContent = `---
project: "${bundle.projectId}"
phase_number: ${n}
phase_name: "${name}"
milestone: ""
phase_type: slice
risk: low
status: backlog
depends_on: ${dependsOn}
locked_by: ""
locked_at: ""
replan_count: 0
tags:
  - gz-phase
  - phase-backlog
created: ${today}
---
## 🔗 Navigation

- [[${bundle.projectId} - Kanban|Kanban]]
- [[L${n} - ${name}|L${n} — Execution Log]]

# P${n} — ${name}

## 📋 Summary

${summary}

## 🧠 Context Pack (do not skip)

${context}

## ✅ Acceptance Criteria

${acceptanceCriteria}

## 📂 Tasks

<!-- AGENT_WRITABLE_START:phase-plan -->
- [ ] _(tasks will be generated by \`gzos plan "${bundle.projectId}" ${n}\`)_
<!-- AGENT_WRITABLE_END:phase-plan -->

## Agent Log

- ${today} phase_created — created by \`gzos plan\`
`;

    const phaseFile = `P${n} - ${name}.md`;
    writeFile(path.join(phasesDir, phaseFile), phaseContent);

    writeFile(path.join(logsDir, `L${n} - ${name}.md`), `---
tags: [project-log]
project: "${bundle.projectId}"
phase_number: ${n}
phase_name: "${name}"
created: ${today}
---
## 🔗 Navigation

- [[P${n} - ${name}|P${n} — ${name}]]
- [[${bundle.projectId} - Agent Log Hub|Agent Log Hub]]

# L${n} — ${name}

## Log

- ${today} **phase_created** — Phase created by \`gzos plan\`
`);

    createdPaths.push(path.join(phasesDir, phaseFile));
  }

  await notify({ event: 'atomise_done', projectId: bundle.projectId, detail: `${createdPaths.length} phases created`, runId }, config);
  return createdPaths;
}

// ── planNewPhases ─────────────────────────────────────────────────────────────
// Extends an in-progress project with new phases.
//
// The Overview is the source of truth: update it with new scope/direction, then
// call planNewPhases. It reads:
//   - Current Overview (may have changed — this drives new phase direction)
//   - Existing phases (so new phases don't duplicate completed work)
//   - Knowledge.md (learnings/decisions/gotchas inform new phase context)
//   - Repo file tree (grounds phases in what actually exists)
//
// Writes P(N+1)..P(N+k) as backlog phase stubs ready for `gzos plan <project> <n>`.

const EXTEND_SYSTEM_PROMPT = `You are a senior technical architect extending an in-progress software project with additional implementation phases.

You will be given:
- The project Overview (current scope and goals — this is the source of truth, it may have been updated)
- A list of existing phases with their status
- Accumulated learnings, decisions, and gotchas from completed phases
- The current repo file structure

Your job: propose 2-4 additional phases that continue the work given the CURRENT scope.

Rules:
- Do NOT duplicate or redo existing phases
- Phases must logically follow from what has already been built
- Align with the CURRENT Overview scope (not historical — the overview may have changed)
- Use learnings and gotchas to inform phase context (help the agent avoid known pitfalls)
- Each phase must be independently deliverable and testable
- Phase name: 3-6 words, action-oriented
- 2-4 acceptance criteria per phase — measurable, binary done conditions
- Output ONLY valid JSON — no prose, no markdown fences
- Format:
[
  {
    "number": <N>,
    "name": "Short phase name",
    "summary": "2-3 sentences on what this phase builds and why it comes next.",
    "context": "Key facts the agent must know: patterns to follow, gotchas to avoid, prior decisions to respect.",
    "acceptance_criteria": ["Measurable done condition", ...]
  },
  ...
]`;

export async function planNewPhases(
  bundle: VaultBundle,
  runId: string,
  config: ControllerConfig
): Promise<string[]> {
  await notify({ event: 'atomise_started', projectId: bundle.projectId, detail: 'Extending phases from Overview', runId }, config);

  const phasesDir = path.join(bundle.bundleDir, 'Phases');

  // 1. Read Overview — this is the current scope (may have been updated by user)
  const overviewContent = bundle.overview.exists ? bundle.overview.raw : `# ${bundle.projectId}\n\n(No overview found)`;

  // 2. Summarise existing phases so the LLM doesn't duplicate them
  const existingPhaseSummaries: string[] = [];
  if (fs.existsSync(phasesDir)) {
    const phaseFiles = fs.readdirSync(phasesDir)
      .filter(f => /^P\d+/i.test(f) && f.endsWith('.md'))
      .sort();
    for (const f of phaseFiles) {
      const node = readPhaseNode(path.join(phasesDir, f));
      const num = node.frontmatter['phase_number'] ?? '?';
      const name = node.frontmatter['phase_name'] ?? f;
      const tags = Array.isArray(node.frontmatter['tags']) ? node.frontmatter['tags'] as string[] : [];
      const stateTag = tags.find((t: string) => t.startsWith('phase-')) ?? String(node.frontmatter['status'] ?? 'unknown');
      const summary = node.content.match(/## 📋 Summary([\s\S]*?)(?=\n##|\s*$)/)?.[1]?.trim() ??
                      node.content.match(/## Summary([\s\S]*?)(?=\n##|\s*$)/)?.[1]?.trim() ?? '';
      existingPhaseSummaries.push(`P${num}: "${name}" [${stateTag}]${summary ? ` — ${summary.slice(0, 120)}` : ''}`);
    }
  }

  // 3. Read Knowledge.md — learnings, decisions, gotchas from completed work
  let knowledgeSummary = '';
  const knowledgePath = bundle.knowledge?.path;
  if (knowledgePath && fs.existsSync(knowledgePath)) {
    const knRaw = fs.readFileSync(knowledgePath, 'utf8');
    const learnings = knRaw.match(/## Learnings([\s\S]*?)(?=\n##|\s*$)/)?.[1]?.trim() ?? '';
    const decisions = knRaw.match(/## Decisions([\s\S]*?)(?=\n##|\s*$)/)?.[1]?.trim() ?? '';
    const gotchas   = knRaw.match(/## Gotchas([\s\S]*?)(?=\n##|\s*$)/)?.[1]?.trim() ?? '';
    knowledgeSummary = [
      learnings ? `### Learnings\n${learnings.slice(0, 800)}` : '',
      decisions ? `### Decisions\n${decisions.slice(0, 500)}` : '',
      gotchas   ? `### Gotchas\n${gotchas.slice(0, 500)}`   : '',
    ].filter(Boolean).join('\n\n');
  }

  // 4. Scan repo file tree
  const repoPath = resolveRepoPath(bundle, config);

  if (!planningUsesAgent(config, repoPath)) {
    const apiKey = config.llm.apiKey ?? process.env['OPENROUTER_API_KEY'];
    if (!apiKey) throw new Error('planNewPhases: set OPENROUTER_API_KEY');
  }

  const repoTree = scanRepoFiles(repoPath);
  const repoSection = planningUsesAgent(config, repoPath)
    ? `You have full read access to the repo at ${repoPath} — use Read, Glob, and Grep as needed to understand what has been built.`
    : `Repo file structure (${repoPath || 'path unknown'}):\n${repoTree}`;

  const nextNum = nextPhaseNumber(phasesDir);

  const userPrompt = `Project: ${bundle.projectId}

## Current Project Overview (source of truth — may reflect updated scope)

${overviewContent}

---

## Existing Phases (do not duplicate)

${existingPhaseSummaries.length > 0 ? existingPhaseSummaries.join('\n') : '(none yet)'}

---

## Accumulated Knowledge from Completed Work

${knowledgeSummary || '(none yet)'}

---

## Repo

${repoSection}

---

Propose additional phases starting from P${nextNum}. The phases must continue logically from the existing work and reflect the current Overview scope.`;

  const output = await planningCall({
    config,
    repoPath,
    systemPrompt: EXTEND_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 3000,
  });

  let phases: PhaseSpec[];
  try {
    const jsonMatch = output.match(/\[[\s\S]+\]/);
    if (!jsonMatch) throw new Error('No JSON array in LLM output');
    phases = JSON.parse(jsonMatch[0]) as PhaseSpec[];
  } catch (err) {
    throw new Error(`planNewPhases: parse error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const logsDir = path.join(bundle.bundleDir, 'Logs');
  const createdPaths: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  let n = nextNum;

  for (const phase of phases) {
    const name = typeof phase.name === 'string' ? phase.name : `Phase ${n}`;
    const summary = typeof phase.summary === 'string' ? phase.summary : '';
    const context = typeof phase.context === 'string' ? phase.context : '_Fill in: key facts the agent must know before executing this phase._';
    const acceptanceCriteria = Array.isArray(phase.acceptance_criteria) && phase.acceptance_criteria.length > 0
      ? phase.acceptance_criteria.map(c => `- [ ] ${c}`).join('\n')
      : '- [ ] All tasks complete and validated';
    const dependsOn = n === 1 ? '[]' : `[${n - 1}]`;

    const phaseContent = `---
project: "${bundle.projectId}"
phase_number: ${n}
phase_name: "${name}"
milestone: ""
phase_type: slice
risk: low
status: backlog
depends_on: ${dependsOn}
locked_by: ""
locked_at: ""
replan_count: 0
tags:
  - gz-phase
  - phase-backlog
created: ${today}
---
## 🔗 Navigation

- [[${bundle.projectId} - Kanban|Kanban]]
- [[L${n} - ${name}|L${n} — Execution Log]]

# P${n} — ${name}

## 📋 Summary

${summary}

## 🧠 Context Pack (do not skip)

${context}

## ✅ Acceptance Criteria

${acceptanceCriteria}

## 📂 Tasks

<!-- AGENT_WRITABLE_START:phase-plan -->
- [ ] _(tasks will be generated by \`gzos plan "${bundle.projectId}" ${n}\`)_
<!-- AGENT_WRITABLE_END:phase-plan -->

## Agent Log

- ${today} phase_created — extended by \`gzos plan --extend\`
`;

    const phaseFile = `P${n} - ${name}.md`;
    writeFile(path.join(phasesDir, phaseFile), phaseContent);

    writeFile(path.join(logsDir, `L${n} - ${name}.md`), `---
tags: [project-log]
project: "${bundle.projectId}"
phase_number: ${n}
phase_name: "${name}"
created: ${today}
---
## 🔗 Navigation

- [[P${n} - ${name}|P${n} — ${name}]]
- [[${bundle.projectId} - Agent Log Hub|Agent Log Hub]]

# L${n} — ${name}

## Log

- ${today} **phase_created** — Phase extended by \`gzos plan --extend\`
`);

    createdPaths.push(path.join(phasesDir, phaseFile));
    n++;
  }

  await notify({ event: 'atomise_done', projectId: bundle.projectId, detail: `${createdPaths.length} new phase(s) created`, runId }, config);
  return createdPaths;
}
