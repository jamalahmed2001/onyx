// graphMaintainer.ts — Vault graph self-maintenance.
//
// GRAPH PATTERN (star topology per project):
//
//   Dashboard (root)
//     └── Domain Hub
//           └── Overview  ← MAIN NODE per project
//                 ├── Docs Hub ──── Knowledge
//                 │              ├── Repo Context
//                 │              └── (other docs)
//                 ├── Kanban ──── P1
//                 │              ├── P2
//                 │              └── ...
//                 │   [if > 8]   Phase Group 1 ── P1..P8
//                 │              Phase Group 2 ── P9..P16
//                 └── Agent Log Hub ── L1
//                                  ├── L2
//                                  └── ...
//                     [if > 12]   Log Group 1 ── L1..L12
//
// LINK RULES (nav section fully rewritten each run):
//
//   Dashboard       → Domain Hubs, system notes (no parent)
//   Domain Hub      → Dashboard
//   Overview        → Knowledge, Kanban, Agent Log Hub  (3 hubs)
//   Knowledge       → Overview + all docs               (docs hub — lists all children)
//   Repo Context    → Knowledge
//   Other doc       → Knowledge
//   Kanban          → Overview + all phases (or Phase Groups if > 8)   (phase hub)
//   Phase Group     → Kanban
//   Agent Log Hub   → Overview + all logs (or Log Groups if > 12)      (log hub)
//   Log Group       → Agent Log Hub
//   Phase           → Kanban (or Phase Group) + its Log
//   Log             → Phase + Agent Log Hub (or Log Group)
//
// SPLITTING (deterministic):
//   Kanban > 8 phases     → Phase Groups of 8 (P1-P8, P9-P16 ...)
//   Log Hub > 12 logs     → Log Groups matching Phase Groups
//   Docs Hub > 8 docs     → numbered Doc Groups (1..8, 9..16) — LLM used only
//                           if docs have enough content to categorise by topic
//
// Body content is NEVER touched. Only ## 🔗 Navigation is rewritten.

import path from 'path';
import fs from 'fs';
import glob from 'fast-glob';
import matter from 'gray-matter';
import { readPhaseNode, readRawFile } from './reader.js';
import { writeFile } from './writer.js';
import { chatCompletion } from '../llm/client.js';
import type { ControllerConfig } from '../config/load.js';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------
const PHASE_GROUP_SIZE    = 8;
const LOG_GROUP_THRESHOLD = 12;
const DOCS_SPLIT_THRESHOLD = 8;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------
export interface GraphRepairAction {
  file: string;
  action: string;
}

export interface GraphMaintainResult {
  repairs: GraphRepairAction[];
  wrongLinksRemoved: number;
  hubsSplit: string[];
}

// ---------------------------------------------------------------------------
// Nav section helpers
// ---------------------------------------------------------------------------
interface NavLink { target: string; display: string; }

function stripNavSections(content: string): string {
  // Remove ALL ## 🔗 Navigation blocks (handles duplicates from previous buggy runs).
  // A nav section ends at the next ## or # heading, or end of string.
  // NOTE: no 'm' flag — '$' must match end-of-string only, not end-of-line.
  //       With 'm', '$' matches every line ending, causing the regex to stop
  //       at the nav heading itself and leave the link lines in the body.
  return content
    .replace(/## 🔗 Navigation[\s\S]*?(?=\n##|\n# (?!#)|$)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimStart();
}

function rewriteNavSection(raw: string, links: NavLink[]): string {
  const parsed = matter(raw);

  // Deduplicate links by target (first occurrence wins)
  const seen = new Set<string>();
  const deduped = links.filter(l => { if (seen.has(l.target)) return false; seen.add(l.target); return true; });

  const navBlock = deduped.length > 0
    ? '## 🔗 Navigation\n\n' + deduped.map(l => `- [[${l.target}|${l.display}]]`).join('\n') + '\n\n'
    : '';

  // Strip ALL existing nav sections from the body (before AND after the title)
  const cleanBody = stripNavSections(parsed.content);

  return matter.stringify(navBlock + cleanBody, parsed.data as Record<string, unknown>);
}

function countWrongLinks(raw: string, canonical: NavLink[]): number {
  // Count ALL wikilinks across all nav sections that aren't in the canonical set
  const allNavLinks: string[] = [];
  for (const navMatch of raw.matchAll(/## 🔗 Navigation[\s\S]*?(?=\n##|\n# (?!#)|$)/g)) {
    allNavLinks.push(...[...navMatch[0].matchAll(/\[\[([^\]|]+)/g)].map(m => m[1] ?? ''));
  }
  const allowed = new Set(canonical.map(l => l.target));
  return allNavLinks.filter(e => !allowed.has(e)).length;
}

function applyNav(
  filePath: string,
  canonical: NavLink[],
  result: GraphMaintainResult,
  label: string
): void {
  const raw = readRawFile(filePath);
  if (raw === null) return;
  result.wrongLinksRemoved += countWrongLinks(raw, canonical);
  writeFile(filePath, rewriteNavSection(raw, canonical));
  result.repairs.push({ file: filePath, action: `nav synced (${label})` });
}

// ---------------------------------------------------------------------------
// Discovery helpers
// ---------------------------------------------------------------------------
function discoverBundles(vaultRoot: string, projectsGlob: string): string[] {
  const base = projectsGlob.replace('/**', '').replace('/**/*', '');
  return glob.sync(`${base}/**/*Overview*.md`, { cwd: vaultRoot, absolute: true });
}

function discoverDomainHub(projectsRoot: string): string | null {
  const hubs = glob.sync('*Hub.md', { cwd: projectsRoot, absolute: true });
  return hubs[0] ?? null;
}

function discoverPhases(bundleDir: string): string[] {
  const phasesDir = path.join(bundleDir, 'Phases');
  if (!fs.existsSync(phasesDir)) return [];
  return glob.sync('P*.md', { cwd: phasesDir, absolute: true }).sort((a, b) => {
    const na = parseInt(path.basename(a).match(/\d+/)?.[0] ?? '0', 10);
    const nb = parseInt(path.basename(b).match(/\d+/)?.[0] ?? '0', 10);
    return na - nb;
  });
}

function discoverLogs(bundleDir: string): string[] {
  const logsDir = path.join(bundleDir, 'Logs');
  if (!fs.existsSync(logsDir)) return [];
  return glob.sync('L[0-9]*.md', { cwd: logsDir, absolute: true }).sort((a, b) => {
    const na = parseInt(path.basename(a).match(/\d+/)?.[0] ?? '0', 10);
    const nb = parseInt(path.basename(b).match(/\d+/)?.[0] ?? '0', 10);
    return na - nb;
  });
}

// Daily notes follow YYYY-MM-DD (or YYYY.MM.DD / YYYY_MM_DD) naming — never touch them.
const DAILY_NOTE_RE = /^\d{4}[-_.]\d{2}[-_.]\d{2}$/;
function isDailyNote(filePath: string): boolean {
  return DAILY_NOTE_RE.test(path.basename(filePath, '.md'));
}

function discoverDocs(bundleDir: string, projectName: string): string[] {
  // Knowledge is the docs hub. Docs can live in Docs/ subdirectory OR bundle root.
  // Standard hub files and phase/log groups are excluded.
  const standardFiles = new Set([
    `${projectName} - Overview.md`,
    `${projectName} - Knowledge.md`,
    `${projectName} - Kanban.md`,
    `${projectName} - Agent Log Hub.md`,
    `${projectName} - Docs Hub.md`,   // legacy Docs Hub — exclude; treat as doc pointing to Knowledge
    `${projectName} - Repo Context.md`, // handled explicitly
  ]);

  const docs: string[] = [];

  // Docs/ and docs/ subdirectories
  for (const dir of [path.join(bundleDir, 'Docs'), path.join(bundleDir, 'docs')]) {
    if (fs.existsSync(dir)) {
      docs.push(...glob.sync('*.md', { cwd: dir, absolute: true }).filter(p => !isDailyNote(p)));
    }
  }

  // Bundle root docs (any .md not in standard set, not a daily note)
  const rootDocs = glob.sync('*.md', { cwd: bundleDir, absolute: true })
    .filter(p =>
      !standardFiles.has(path.basename(p)) &&
      !path.basename(p).includes('Phase Group') &&
      !path.basename(p).includes('Log Group') &&
      !path.basename(p).includes('Docs -') &&
      !isDailyNote(p)
    );
  docs.push(...rootDocs);

  return [...new Set(docs)].sort((a, b) => a.localeCompare(b));
}

function phaseGroupNum(phaseNumber: number): number {
  return Math.ceil(phaseNumber / PHASE_GROUP_SIZE);
}

function phaseGroupLabel(projectName: string, groupNum: number): string {
  const start = (groupNum - 1) * PHASE_GROUP_SIZE + 1;
  const end = groupNum * PHASE_GROUP_SIZE;
  return `${projectName} - Phase Group ${groupNum} (P${start}-P${end})`;
}

// ---------------------------------------------------------------------------
// Phase Group splitting (deterministic)
// ---------------------------------------------------------------------------
function splitPhaseGroups(
  phasePaths: string[],
  projectName: string,
  bundleDir: string,
  result: GraphMaintainResult
): Map<number, string> {
  // Returns: phaseGroupNum → groupFilePath
  const groupMap = new Map<number, string>();
  const today = new Date().toISOString().slice(0, 10);

  // Group phases by group number
  const groups = new Map<number, string[]>();
  for (const phasePath of phasePaths) {
    const node = readPhaseNode(phasePath);
    const n = typeof node.frontmatter['phase_number'] === 'number'
      ? node.frontmatter['phase_number']
      : parseInt(path.basename(phasePath).match(/\d+/)?.[0] ?? '1', 10);
    const g = phaseGroupNum(n);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(phasePath);
  }

  for (const [groupNum, groupPhases] of groups.entries()) {
    const groupName = phaseGroupLabel(projectName, groupNum);
    const groupPath = path.join(bundleDir, `${groupName}.md`);
    groupMap.set(groupNum, groupPath);

    const phaseLinks = groupPhases.map(p => {
      const node = readPhaseNode(p);
      const n = node.frontmatter['phase_number'] ?? '?';
      const name = String(node.frontmatter['phase_name'] ?? path.basename(p, '.md'));
      return `- [[${path.basename(p, '.md')}|P${n} — ${name}]]`;
    }).join('\n');

    if (!fs.existsSync(groupPath)) {
      writeFile(groupPath, `---
tags: [hub-phase-group]
project: "${projectName}"
phase_group: ${groupNum}
created: ${today}
---
## 🔗 Navigation

- [[${projectName} - Kanban|Kanban]]

# ${groupName}

## Phases

${phaseLinks}
`);
      result.hubsSplit.push(groupPath);
      result.repairs.push({ file: groupPath, action: `created Phase Group ${groupNum}` });
    } else {
      // Update nav + phase list
      applyNav(groupPath, [{ target: `${projectName} - Kanban`, display: 'Kanban' }], result, `Phase Group ${groupNum} → Kanban`);
    }
  }

  return groupMap;
}

// ---------------------------------------------------------------------------
// Log Group splitting (deterministic, mirrors phase groups)
// ---------------------------------------------------------------------------
function splitLogGroups(
  logPaths: string[],
  projectName: string,
  bundleDir: string,
  phaseGroupExists: boolean,
  result: GraphMaintainResult
): Map<number, string> {
  const groupMap = new Map<number, string>();
  if (!phaseGroupExists) return groupMap;

  const today = new Date().toISOString().slice(0, 10);
  const groups = new Map<number, string[]>();

  for (const logPath of logPaths) {
    const node = readPhaseNode(logPath);
    const n = typeof node.frontmatter['phase_number'] === 'number'
      ? node.frontmatter['phase_number']
      : parseInt(path.basename(logPath).match(/\d+/)?.[0] ?? '1', 10);
    const g = phaseGroupNum(n);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(logPath);
  }

  for (const [groupNum, groupLogs] of groups.entries()) {
    const start = (groupNum - 1) * PHASE_GROUP_SIZE + 1;
    const end = groupNum * PHASE_GROUP_SIZE;
    const groupName = `${projectName} - Log Group ${groupNum} (L${start}-L${end})`;
    const groupPath = path.join(bundleDir, 'Logs', `${groupName}.md`);
    groupMap.set(groupNum, groupPath);

    const logLinks = groupLogs.map(p => {
      const node = readPhaseNode(p);
      const n = node.frontmatter['phase_number'] ?? '?';
      const name = String(node.frontmatter['phase_name'] ?? path.basename(p, '.md'));
      return `- [[${path.basename(p, '.md')}|L${n} — ${name}]]`;
    }).join('\n');

    if (!fs.existsSync(groupPath)) {
      writeFile(groupPath, `---
tags: [hub-log-group]
project: "${projectName}"
log_group: ${groupNum}
created: ${today}
---
## 🔗 Navigation

- [[${projectName} - Agent Log Hub|Agent Log Hub]]

# ${groupName}

## Logs

${logLinks}
`);
      result.hubsSplit.push(groupPath);
      result.repairs.push({ file: groupPath, action: `created Log Group ${groupNum}` });
    } else {
      applyNav(groupPath, [{ target: `${projectName} - Agent Log Hub`, display: 'Agent Log Hub' }], result, `Log Group ${groupNum} → Log Hub`);
    }
  }

  return groupMap;
}

// ---------------------------------------------------------------------------
// Docs Hub splitting — deterministic by default, LLM only if titles ambiguous
// ---------------------------------------------------------------------------
async function splitDocsHub(
  docPaths: string[],
  projectName: string,
  bundleDir: string,
  config: ControllerConfig,
  result: GraphMaintainResult
): Promise<Map<string, string[]>> {
  // categoryName → docPaths
  const categoryMap = new Map<string, string[]>();
  const today = new Date().toISOString().slice(0, 10);

  const docTitles = docPaths.map(p => path.basename(p, '.md'));

  // Try deterministic grouping first: look for common prefixes/patterns
  // e.g. "API - foo", "API - bar" → "API" group; "Design - foo" → "Design" group
  const prefixGroups = new Map<string, string[]>();
  for (const p of docPaths) {
    const title = path.basename(p, '.md');
    const prefix = title.includes(' - ') ? (title.split(' - ')[0] ?? 'General') : 'General';
    if (!prefixGroups.has(prefix)) prefixGroups.set(prefix, []);
    prefixGroups.get(prefix)!.push(p);
  }

  // If prefix grouping creates 2+ groups with > 1 member, use it deterministically
  const meaningfulGroups = [...prefixGroups.entries()].filter(([, docs]) => docs.length > 1);

  let groups: Map<string, string[]>;

  if (meaningfulGroups.length >= 2) {
    // Deterministic prefix-based grouping
    groups = new Map(prefixGroups);
  } else {
    // Fall back to LLM categorisation
    const apiKey = config.llm.apiKey ?? process.env['OPENROUTER_API_KEY'];
    if (!apiKey) {
      // No LLM available — number the groups sequentially
      groups = new Map();
      const chunkSize = DOCS_SPLIT_THRESHOLD;
      for (let i = 0; i < docPaths.length; i += chunkSize) {
        const chunk = docPaths.slice(i, i + chunkSize);
        const groupNum = Math.floor(i / chunkSize) + 1;
        groups.set(`Group ${groupNum}`, chunk);
      }
      if (groups.size === 0) groups = new Map([['General', docPaths]]);
    } else {
      const prompt = `Given these document titles from a project named "${projectName}", group them into 2-4 logical categories.
Titles: ${docTitles.join(', ')}

Output ONLY a JSON object: { "CategoryName": ["doc title 1", "doc title 2"], ... }
Use short, clear category names (1-3 words). Every title must appear in exactly one category.`;

      try {
        const output = await chatCompletion({
          model: config.llm.model,
          apiKey,
          baseUrl: config.llm.baseUrl,
          maxTokens: 512,
          messages: [
            { role: 'system', content: 'You are a document organiser. Output only valid JSON.' },
            { role: 'user', content: prompt },
          ],
        });

        const jsonMatch = output.match(/\{[\s\S]+\}/);
        if (!jsonMatch) throw new Error('no JSON in output');
        const raw = JSON.parse(jsonMatch[0]) as Record<string, string[]>;

        groups = new Map<string, string[]>();
        for (const [cat, titles] of Object.entries(raw)) {
          const matched = (titles as string[])
            .map(title => docPaths.find(p => path.basename(p, '.md') === title))
            .filter((p): p is string => p !== undefined);
          if (matched.length > 0) groups.set(cat, matched);
        }
        // Any unmatched docs → 'General'
        const allMatched = new Set([...groups.values()].flat());
        const unmatched = docPaths.filter(p => !allMatched.has(p));
        if (unmatched.length > 0) groups.set('General', unmatched);
      } catch {
        // LLM failed — number sequentially
        groups = new Map();
        const chunkSize = DOCS_SPLIT_THRESHOLD;
        for (let i = 0; i < docPaths.length; i += chunkSize) {
          groups.set(`Group ${Math.floor(i / chunkSize) + 1}`, docPaths.slice(i, i + chunkSize));
        }
      }
    }
  }

  // Create category sub-hub files
  for (const [category, docs] of groups.entries()) {
    const catName = `${projectName} - Docs - ${category}`;
    const catPath = path.join(bundleDir, `${catName}.md`);
    categoryMap.set(category, docs);

    const docLinks = docs.map(p => `- [[${path.basename(p, '.md')}|${path.basename(p, '.md')}]]`).join('\n');

    if (!fs.existsSync(catPath)) {
      writeFile(catPath, `---
tags: [hub-docs-category]
project: "${projectName}"
docs_category: "${category}"
created: ${today}
---
## 🔗 Navigation

- [[${projectName} - Docs Hub|Docs Hub]]

# ${projectName} — Docs: ${category}

${docLinks}
`);
      result.hubsSplit.push(catPath);
      result.repairs.push({ file: catPath, action: `created Docs category: ${category}` });
    }
  }

  return categoryMap;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function maintainVaultGraph(config: ControllerConfig): Promise<GraphMaintainResult> {
  const result: GraphMaintainResult = { repairs: [], wrongLinksRemoved: 0, hubsSplit: [] };
  const { vaultRoot, projectsGlob } = config;

  const projectsBase = projectsGlob.replace('/**', '').replace('/**/*', '');
  const projectsRoot = path.join(vaultRoot, projectsBase);
  const domainHubPath = discoverDomainHub(projectsRoot);
  const overviewPaths = discoverBundles(vaultRoot, projectsGlob);
  const today = new Date().toISOString().slice(0, 10);

  for (const overviewPath of overviewPaths) {
    const overviewNode = readPhaseNode(overviewPath);
    const projectName = String(
      overviewNode.frontmatter['project'] ?? path.basename(path.dirname(overviewPath))
    );
    const bundleDir = path.dirname(overviewPath);

    const kanbanPath     = path.join(bundleDir, `${projectName} - Kanban.md`);
    const logHubPath     = path.join(bundleDir, `${projectName} - Agent Log Hub.md`);
    const knowledgePath  = path.join(bundleDir, `${projectName} - Knowledge.md`);

    const phasePaths = discoverPhases(bundleDir);
    const logPaths   = discoverLogs(bundleDir);
    const docPaths   = discoverDocs(bundleDir, projectName);

    // ------------------------------------------------------------------
    // Overview — Option B: link ONLY to sub-hubs (petal flower)
    // ------------------------------------------------------------------
    applyNav(overviewPath,
      [
        { target: `${projectName} - Knowledge`,       display: 'Knowledge'  },
        { target: `${projectName} - Kanban`,          display: 'Kanban'     },
        { target: `${projectName} - Agent Log Hub`,   display: 'Agent Logs' },
      ],
      result, 'Overview → Knowledge + Kanban + Agent Log Hub'
    );

    const repoContextPath = path.join(bundleDir, `${projectName} - Repo Context.md`);

    // ------------------------------------------------------------------
    // Knowledge — Overview + all docs (Docs/ + docs/ + Repo Context)
    // ------------------------------------------------------------------
    if (fs.existsSync(knowledgePath)) {
      const knowledgeLinks: NavLink[] = [
        { target: `${projectName} - Overview`, display: 'Overview' },
      ];
      for (const docPath of docPaths) {
        knowledgeLinks.push({ target: path.basename(docPath, '.md'), display: path.basename(docPath, '.md').replace(`${projectName} - `, '') });
      }
      applyNav(knowledgePath, knowledgeLinks, result, 'Knowledge → Overview + docs');
    }

    // Repo Context is treated as a doc; it should point to Knowledge
    if (fs.existsSync(repoContextPath) && fs.existsSync(knowledgePath)) {
      applyNav(repoContextPath,
        [{ target: `${projectName} - Knowledge`, display: 'Knowledge' }],
        result, 'Repo Context → Knowledge'
      );
    }

    // Use phase/log groups for large projects
    const usePhaseGroups = phasePaths.length > PHASE_GROUP_SIZE;
    const useLogGroups   = logPaths.length > LOG_GROUP_THRESHOLD;

    // ------------------------------------------------------------------
    // Kanban — Overview + all phases (or Phase Groups if > PHASE_GROUP_SIZE)
    // ------------------------------------------------------------------
    let phaseGroupMap = new Map<number, string>();
    if (usePhaseGroups) {
      phaseGroupMap = splitPhaseGroups(phasePaths, projectName, bundleDir, result);
    }

    if (fs.existsSync(kanbanPath)) {
      const kanbanLinks: NavLink[] = [
        { target: `${projectName} - Overview`, display: 'Overview' },
      ];

      // If completed phase groups were consolidated, surface the archives on Kanban.
      const phaseGroupArchives = glob.sync('*Phase Group* - Archive.md', { cwd: bundleDir, absolute: true });
      for (const ap of phaseGroupArchives) {
        kanbanLinks.push({ target: path.basename(ap, '.md'), display: path.basename(ap, '.md').replace(`${projectName} - `, '') });
      }
      if (usePhaseGroups) {
        // Link to Phase Groups instead of individual phases
        for (const [groupNum, groupPath] of phaseGroupMap.entries()) {
          const start = (groupNum - 1) * PHASE_GROUP_SIZE + 1;
          const end = groupNum * PHASE_GROUP_SIZE;
          kanbanLinks.push({ target: path.basename(groupPath, '.md'), display: `Phase Group ${groupNum} (P${start}–P${end})` });
        }
      } else {
        // Link directly to each phase
        for (const phasePath of phasePaths) {
          const node = readPhaseNode(phasePath);
          const n = node.frontmatter['phase_number'] ?? path.basename(phasePath).match(/\d+/)?.[0] ?? '?';
          const name = String(node.frontmatter['phase_name'] ?? path.basename(phasePath, '.md'));
          kanbanLinks.push({ target: path.basename(phasePath, '.md'), display: `P${n} — ${name}` });
        }
      }
      applyNav(kanbanPath, kanbanLinks, result, 'Kanban → Overview + phases');
    }

    // ------------------------------------------------------------------
    // Agent Log Hub — Overview + all logs + consolidated log archives
    // ------------------------------------------------------------------
    const logGroupMap = new Map<number, string>(); // unused in flat mode (kept for compatibility)

    if (!fs.existsSync(logHubPath)) {
      writeFile(logHubPath, `---
tags: [hub-logs]
project: "${projectName}"
created: ${today}
---
## 🔗 Navigation

- [[${projectName} - Overview|Overview]]

# ${projectName} — Agent Log Hub

## Logs

`);
      result.repairs.push({ file: logHubPath, action: 'auto-created Agent Log Hub' });
    } else {
      const logHubLinks: NavLink[] = [
        { target: `${projectName} - Overview`, display: 'Overview' },
      ];

      // Surface consolidated log archives (created by consolidator)
      const logArchives = glob.sync('*Log Group* - Archive.md', { cwd: path.join(bundleDir, 'Logs'), absolute: true });
      for (const ap of logArchives) {
        logHubLinks.push({ target: path.basename(ap, '.md'), display: path.basename(ap, '.md').replace(`${projectName} - `, '') });
      }

      // Then link remaining individual logs
      for (const logPath of logPaths) {
        const node = readPhaseNode(logPath);
        const n = node.frontmatter['phase_number'] ?? path.basename(logPath).match(/\d+/)?.[0] ?? '?';
        const name = String(node.frontmatter['phase_name'] ?? path.basename(logPath, '.md'));
        logHubLinks.push({ target: path.basename(logPath, '.md'), display: `L${n} — ${name}` });
      }

      applyNav(logHubPath, logHubLinks, result, 'Agent Log Hub → Overview + log archives + logs');
    }

    // ------------------------------------------------------------------
    // Phases — bridge: Phase Group (or Kanban) + their Log
    // ------------------------------------------------------------------
    for (const phasePath of phasePaths) {
      const phaseNode = readPhaseNode(phasePath);
      const phaseNum = typeof phaseNode.frontmatter['phase_number'] === 'number'
        ? phaseNode.frontmatter['phase_number']
        : parseInt(path.basename(phasePath).match(/\d+/)?.[0] ?? '1', 10);
      const phaseName = String(phaseNode.frontmatter['phase_name'] ?? path.basename(phasePath, '.md'));

      // Link to Phase Group if groups exist, otherwise Kanban
      const groupPath = usePhaseGroups ? phaseGroupMap.get(phaseGroupNum(phaseNum)) : undefined;
      const parentTarget = groupPath ? path.basename(groupPath, '.md') : `${projectName} - Kanban`;
      const parentDisplay = groupPath ? path.basename(groupPath, '.md') : 'Kanban';

      const logBase = `L${phaseNum} - ${phaseName}.md`;
      const logPath = path.join(bundleDir, 'Logs', logBase);

      // Auto-create log note if missing
      if (!fs.existsSync(logPath)) {
        const logParent = `${projectName} - Agent Log Hub`;
        writeFile(logPath, `---
tags: [project-log]
project: "${projectName}"
phase_number: ${phaseNum}
phase_name: "${phaseName}"
created: ${today}
---
## 🔗 Navigation

- [[${path.basename(phasePath, '.md')}|P${phaseNum} — ${phaseName}]]
- [[${logParent}|Agent Log Hub]]

# L${phaseNum} — ${phaseName}

## Entries

`);
        result.repairs.push({ file: logPath, action: `auto-created log note for P${phaseNum}` });
      }

      applyNav(phasePath,
        [
          { target: parentTarget, display: parentDisplay },
          { target: path.basename(logPath, '.md'), display: `L${phaseNum} — Execution Log` },
        ],
        result, `Phase P${phaseNum} → ${parentDisplay} + Log`
      );
    }

    // ------------------------------------------------------------------
    // Logs — stamen: Phase + Log Group (or Agent Log Hub)
    // ------------------------------------------------------------------
    for (const logPath of logPaths) {
      const logNode = readPhaseNode(logPath);
      const phaseNum = typeof logNode.frontmatter['phase_number'] === 'number'
        ? logNode.frontmatter['phase_number']
        : parseInt(path.basename(logPath).match(/\d+/)?.[0] ?? '1', 10);
      const phaseName = String(logNode.frontmatter['phase_name'] ?? '');

      const phaseBase = `P${phaseNum} - ${phaseName}`;

      const logParent = `${projectName} - Agent Log Hub`;
      const logParentDisplay = 'Agent Log Hub';

      applyNav(logPath,
        [
          { target: phaseBase, display: `P${phaseNum} — ${phaseName}` },
          { target: logParent, display: logParentDisplay },
        ],
        result, `Log L${phaseNum} → Phase + ${logParentDisplay}`
      );
    }

    // ------------------------------------------------------------------
    // Docs — nav points to Knowledge (docs hub)
    // ------------------------------------------------------------------
    if (fs.existsSync(knowledgePath)) {
      for (const docPath of docPaths) {
        // Skip repo context (handled explicitly above)
        if (path.basename(docPath) === `${projectName} - Repo Context.md`) continue;
        applyNav(docPath,
          [{ target: `${projectName} - Knowledge`, display: 'Knowledge' }],
          result, 'Doc → Knowledge'
        );
      }
    }
  }

  // ------------------------------------------------------------------
  // Domain Hub — back to Dashboard; lists all project Overviews in body
  // ------------------------------------------------------------------
  if (domainHubPath && fs.existsSync(domainHubPath)) {
    applyNav(domainHubPath, [{ target: 'Dashboard', display: 'Dashboard' }], result, 'Domain Hub → Dashboard');
    let hubRaw = readRawFile(domainHubPath) ?? '';
    // Build a set of wikilink targets already present in the body (avoid duplicates)
    const existingLinks = new Set([...hubRaw.matchAll(/\[\[([^\]|]+)/g)].map(m => m[1]!.trim()));
    let changed = false;
    for (const overviewPath of [...new Set(overviewPaths)]) {
      const node = readPhaseNode(overviewPath);
      const pName = String(node.frontmatter['project'] ?? path.basename(path.dirname(overviewPath)));
      const overviewBase = path.basename(overviewPath, '.md');
      if (!existingLinks.has(overviewBase)) {
        hubRaw = hubRaw.trimEnd() + `\n- [[${overviewBase}|${pName}]]\n`;
        existingLinks.add(overviewBase);
        changed = true;
      }
    }
    if (changed) {
      writeFile(domainHubPath, hubRaw);
      result.repairs.push({ file: domainHubPath, action: 'project overviews listed in Domain Hub' });
    }
  }

  // ------------------------------------------------------------------
  // Dashboard — root; ensure domain hubs are listed
  // ------------------------------------------------------------------
  const dashboardPath = path.join(vaultRoot, '00 - Dashboard', 'Dashboard.md');
  if (fs.existsSync(dashboardPath) && domainHubPath) {
    const raw = readRawFile(dashboardPath);
    if (raw !== null) {
      const domainBase = path.basename(domainHubPath, '.md');
      if (!raw.includes(`[[${domainBase}`)) {
        writeFile(dashboardPath, raw.trimEnd() + `\n- [[${domainBase}|${domainBase}]]\n`);
        result.repairs.push({ file: dashboardPath, action: `domain hub linked in Dashboard` });
      }
    }
  }

  return result;
}
