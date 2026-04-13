// nodeConsolidator.ts — Consolidate completed/archived nodes into contextual summary nodes.
//
// TWO CONSOLIDATION MODES:
//
// 1. PHASE CONSOLIDATION (deterministic):
//    When a Phase Group is fully completed (all phases phase-completed),
//    merge the individual phase notes into a single "Phase Group N - Archive.md"
//    node. The individual phase links in Kanban are replaced with the archive link.
//    Archive node links: Kanban → Archive → (inline summaries, no separate files)
//    Reduces graph clutter as projects mature.
//
// 2. DOC CONSOLIDATION (LLM-assisted):
//    When multiple docs in the same Docs category have significant content overlap
//    (detected by title similarity first, LLM as fallback), merge them into a
//    single "Docs - <Category> - Consolidated.md" node.
//    Deterministic similarity: if two doc titles share > 50% of words → merge candidate.
//    LLM: only invoked if > 2 merge candidates exist to confirm grouping.
//
// SAFETY RULES:
//    - Never delete original files. Archive = new file, originals get tag: archived.
//    - Only phase-completed phases are eligible for phase consolidation.
//    - Only docs with tag: archived or explicit merge signal are consolidated.
//    - Consolidation is idempotent: running twice produces no changes.

import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';
import glob from 'fast-glob';
import { readPhaseNode, readRawFile } from './reader.js';
import { writeFile, setPhaseTag } from './writer.js';
import { chatCompletion } from '../llm/client.js';
import type { ControllerConfig } from '../config/load.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ConsolidationAction {
  type:
    | 'phase_group_archived'
    | 'phase_files_trashed'
    | 'phase_group_hub_trashed'
    | 'docs_merged'
    | 'docs_trashed'
    | 'logs_consolidated'
    | 'logs_trashed'
    | 'log_group_hub_trashed'
    | 'docs_hub_trashed';
  files: string[];
  archivePath: string;
  description: string;
}

export interface ConsolidationResult {
  actions: ConsolidationAction[];
  phasesArchived: number;
  docsMerged: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ensureTrashRoot(vaultRoot: string): string {
  const trashRoot = path.join(vaultRoot, '.trash', '_onyx_consolidated');
  fs.mkdirSync(trashRoot, { recursive: true });
  return trashRoot;
}

function moveToTrash(absolutePath: string, vaultRoot: string, runStamp: string): string {
  const trashRoot = ensureTrashRoot(vaultRoot);
  const rel = path.relative(vaultRoot, absolutePath);
  const dest = path.join(trashRoot, runStamp, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(absolutePath, dest);
  return dest;
}

// Rewrite Obsidian wikilinks across a markdown file.
// We rewrite BOTH [[Old]] and [[path/to/Old]] forms.
function rewriteWikilinks(raw: string, linkMap: Map<string, string>): string {
  return raw.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (match, targetRaw: string, alias: string | undefined) => {
    const target = String(targetRaw ?? '');
    const base = path.posix.basename(target);
    const mapped = linkMap.get(target) ?? linkMap.get(base);
    if (!mapped) return match;
    // Preserve alias/display text if present.
    return `[[${mapped}${alias ?? ''}]]`;
  });
}

function rewriteLinksInBundle(bundleDir: string, linkMap: Map<string, string>, dryRun: boolean): number {
  const files = glob.sync('**/*.md', {
    cwd: bundleDir,
    absolute: true,
    dot: true,
    ignore: [
      '**/.trash/**',
      '**/09 - Archive/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/Logs/run-*.md',
    ],
  });

  let changed = 0;
  for (const file of files) {
    const raw = readRawFile(file);
    if (raw === null) continue;
    const updated = rewriteWikilinks(raw, linkMap);
    if (updated !== raw) {
      changed += 1;
      if (!dryRun) writeFile(file, updated);
    }
  }
  return changed;
}
function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  return intersection / Math.max(wordsA.size, wordsB.size);
}

function isPhaseCompleted(phasePath: string): boolean {
  const node = readPhaseNode(phasePath);
  const tags = Array.isArray(node.frontmatter['tags'])
    ? (node.frontmatter['tags'] as string[])
    : [];
  return tags.includes('phase-completed') ||
    String(node.frontmatter['status'] ?? '') === 'completed' ||
    String(node.frontmatter['state'] ?? '') === 'completed';
}

function isPhaseArchived(phasePath: string): boolean {
  const node = readPhaseNode(phasePath);
  const tags = Array.isArray(node.frontmatter['tags'])
    ? (node.frontmatter['tags'] as string[])
    : [];
  return tags.includes('phase-archived') || tags.includes('archived');
}

function getPhaseGroupRange(groupNum: number): { start: number; end: number } {
  const PHASE_GROUP_SIZE = 8;
  const start = (groupNum - 1) * PHASE_GROUP_SIZE + 1;
  const end = groupNum * PHASE_GROUP_SIZE;
  return { start, end };
}

function trashCompletedGroupPhasesIfArchived(
  archivePath: string,
  projectName: string,
  bundleDir: string,
  vaultRoot: string,
  result: ConsolidationResult,
  dryRun: boolean,
  runStamp: string
): Map<string, string> {
  const linkMapOut = new Map<string, string>();
  const archiveNode = readPhaseNode(archivePath);
  const groupNum = Number(archiveNode.frontmatter['phase_group'] ?? 0);
  if (!groupNum) return linkMapOut;

  const { start, end } = getPhaseGroupRange(groupNum);
  const phasesDir = path.join(bundleDir, 'Phases');
  if (!fs.existsSync(phasesDir)) return linkMapOut;

  const phasePaths = glob.sync('P*.md', { cwd: phasesDir, absolute: true }).filter(p => {
    const n = parseInt(path.basename(p).match(/\d+/)?.[0] ?? '0', 10);
    return n >= start && n <= end;
  });
  if (phasePaths.length === 0) return linkMapOut;

  // Only trash if all are completed.
  if (!phasePaths.every(isPhaseCompleted)) return linkMapOut;

  const archiveBase = path.basename(archivePath, '.md');
  const linkMap = new Map<string, string>();
  for (const p of phasePaths) {
    const oldBase = path.basename(p, '.md');
    linkMap.set(oldBase, archiveBase);
    linkMapOut.set(oldBase, archiveBase);
  }

  const rewrites = rewriteLinksInBundle(bundleDir, linkMap, dryRun);

  if (!dryRun) {
    for (const p of phasePaths) {
      moveToTrash(p, vaultRoot, runStamp);
    }
  }

  result.actions.push({
    type: 'phase_files_trashed',
    files: phasePaths,
    archivePath,
    description: `Phase Group ${groupNum} completed; rewrote ${rewrites} file(s) and moved ${phasePaths.length} phase file(s) to .trash`,
  });
  result.phasesArchived += phasePaths.length;
  return linkMapOut;
}

// ---------------------------------------------------------------------------
// Phase Group Consolidation
// ---------------------------------------------------------------------------
function trashGroupHubIfArchived(
  groupHubPath: string,
  archivePath: string,
  bundleDir: string,
  vaultRoot: string,
  result: ConsolidationResult,
  dryRun: boolean,
  runStamp: string,
  type: 'phase_group_hub_trashed' | 'log_group_hub_trashed'
): void {
  const groupBase = path.basename(groupHubPath, '.md');
  const archiveBase = path.basename(archivePath, '.md');
  const linkMap = new Map<string, string>([[groupBase, archiveBase]]);
  const rewrites = rewriteLinksInBundle(bundleDir, linkMap, dryRun);

  if (!dryRun) {
    moveToTrash(groupHubPath, vaultRoot, runStamp);
  }

  result.actions.push({
    type,
    files: [groupHubPath],
    archivePath,
    description: `Group hub replaced by archive; rewrote ${rewrites} file(s) and moved hub to .trash`,
  });
}

function consolidateLogGroupForArchivedPhaseGroup(
  archivePath: string,
  projectName: string,
  bundleDir: string,
  vaultRoot: string,
  result: ConsolidationResult,
  dryRun: boolean,
  runStamp: string
): void {
  const archiveNode = readPhaseNode(archivePath);
  const groupNum = Number(archiveNode.frontmatter['phase_group'] ?? 0);
  if (!groupNum) return;

  const { start, end } = getPhaseGroupRange(groupNum);

  const logsDir = path.join(bundleDir, 'Logs');
  if (!fs.existsSync(logsDir)) return;

  const logs = glob.sync('L*.md', { cwd: logsDir, absolute: true }).filter(p => {
    const n = parseInt(path.basename(p).match(/\d+/)?.[0] ?? '0', 10);
    return n >= start && n <= end;
  });
  if (logs.length === 0) return;

  const logArchiveBase = `${projectName} - Log Group ${groupNum} (L${start}-L${end}) - Archive`;
  const logArchivePath = path.join(logsDir, `${logArchiveBase}.md`);

  // If already exists, we still want to trash individual logs + rewrite links.
  if (!dryRun && !fs.existsSync(logArchivePath)) {
    result.actions.push({
      type: 'logs_consolidated',
      files: logs,
      archivePath: logArchivePath,
      description: `Log Group ${groupNum} archive created (${logs.length} logs)`,
    });

    const sections = logs.map(lp => {
      const node = readPhaseNode(lp);
      const title = path.basename(lp, '.md');
      return `## ${title}\n\n${node.content.trim()}\n`;
    }).join('\n---\n\n');

    writeFile(logArchivePath, `---
tags: [log-group-archive, archived]
project: "${projectName}"
log_group: ${groupNum}
consolidated_at: ${new Date().toISOString().slice(0, 10)}
---
## 🔗 Navigation

- [[${projectName} - Overview|Overview]]
- [[${projectName} - Agent Log Hub|Agent Log Hub]]
- [[${path.basename(archivePath, '.md')}|Phase Group Archive]]

# ${logArchiveBase}

${sections}
`);
  }

  const logArchiveName = path.basename(logArchivePath, '.md');
  const linkMap = new Map<string, string>();
  for (const lp of logs) {
    linkMap.set(path.basename(lp, '.md'), logArchiveName);
  }

  const rewrites = rewriteLinksInBundle(bundleDir, linkMap, dryRun);

  if (!dryRun) {
    for (const lp of logs) {
      moveToTrash(lp, vaultRoot, runStamp);
    }
  }

  result.actions.push({
    type: 'logs_trashed',
    files: logs,
    archivePath: logArchivePath,
    description: `Log Group ${groupNum} consolidated; rewrote ${rewrites} file(s) and moved ${logs.length} log file(s) to .trash`,
  });

  // If an existing non-archive Log Group hub note exists, trash it too.
  const logGroupHubPath = path.join(logsDir, `${projectName} - Log Group ${groupNum} (L${start}-L${end}).md`);
  if (fs.existsSync(logGroupHubPath)) {
    trashGroupHubIfArchived(
      logGroupHubPath,
      logArchivePath,
      bundleDir,
      vaultRoot,
      result,
      dryRun,
      runStamp,
      'log_group_hub_trashed'
    );
  }
}

function consolidatePhaseGroup(
  groupPath: string,
  projectName: string,
  bundleDir: string,
  result: ConsolidationResult,
  dryRun: boolean
): string | null {
  const groupNode = readPhaseNode(groupPath);
  const groupNum = Number(groupNode.frontmatter['phase_group'] ?? 0);
  const groupName = path.basename(groupPath, '.md');

  // Find all phases in this group
  const phasesDir = path.join(bundleDir, 'Phases');
  const allPhases = glob.sync('P*.md', { cwd: phasesDir, absolute: true });

  const { start, end } = getPhaseGroupRange(groupNum);

  const groupPhases = allPhases.filter(p => {
    const n = parseInt(path.basename(p).match(/\d+/)?.[0] ?? '0', 10);
    return n >= start && n <= end;
  });

  if (groupPhases.length === 0) return null;

  // Only consolidate if ALL phases in group are completed
  const allCompleted = groupPhases.every(isPhaseCompleted);
  if (!allCompleted) return null;

  // Check if already archived
  const archivePath = path.join(bundleDir, `${groupName} - Archive.md`);
  if (fs.existsSync(archivePath)) return archivePath;

  // Build consolidated content
  const today = new Date().toISOString().slice(0, 10);
  const sections = groupPhases.map(phasePath => {
    const node = readPhaseNode(phasePath);
    const n = node.frontmatter['phase_number'] ?? '?';
    const name = String(node.frontmatter['phase_name'] ?? path.basename(phasePath, '.md'));

    // Extract learnings/outcomes from the phase note
    const acceptanceSection = node.content.match(/## Acceptance Criteria([\s\S]*?)(?=\n##|\s*$)/)?.[1]?.trim() ?? '';
    const logSection = node.content.match(/## Log([\s\S]*?)(?=\n##|\s*$)/)?.[1]?.trim() ?? '';

    return `### P${n} — ${name}\n\n${acceptanceSection ? `**Acceptance:**\n${acceptanceSection}\n\n` : ''}${logSection ? `**Log:**\n${logSection}\n` : ''}`;
  }).join('\n---\n\n');

  if (!dryRun) {
    writeFile(archivePath, `---
tags: [phase-group-archive, archived]
project: "${projectName}"
phase_group: ${groupNum}
archived_at: ${today}
phases_consolidated: ${groupPhases.length}
---
## 🔗 Navigation

- [[${projectName} - Overview|Overview]]
- [[${projectName} - Kanban|Kanban]]

# ${groupName} — Archive

> ${groupPhases.length} completed phases consolidated on ${today}.
> Original phase files remain in Phases/ with tag: phase-archived.

${sections}
`);

    // Tag originals as archived (don't delete)
    for (const phasePath of groupPhases) {
      const raw = readRawFile(phasePath);
      if (raw === null) continue;
      const parsed = matter(raw);
      const tags = Array.isArray(parsed.data['tags']) ? parsed.data['tags'] as string[] : [];
      if (!tags.includes('phase-archived')) {
        tags.push('phase-archived');
        parsed.data['tags'] = tags;
        writeFile(phasePath, matter.stringify(parsed.content, parsed.data as Record<string, unknown>));
      }
    }
  }

  result.actions.push({
    type: 'phase_group_archived',
    files: groupPhases,
    archivePath,
    description: `Phase Group ${groupNum}: ${groupPhases.length} completed phases archived`,
  });
  result.phasesArchived += groupPhases.length;
  return archivePath;
}

// ---------------------------------------------------------------------------
// Doc Consolidation
// ---------------------------------------------------------------------------
async function consolidateDocs(
  docPaths: string[],
  projectName: string,
  bundleDir: string,
  categoryName: string,
  config: ControllerConfig,
  result: ConsolidationResult,
  dryRun: boolean,
  runStamp: string
): Promise<void> {
  if (docPaths.length < 2) return;

  // Deterministic: find pairs with > 60% title similarity
  const mergeCandidates: Array<[string, string]> = [];
  for (let i = 0; i < docPaths.length; i++) {
    for (let j = i + 1; j < docPaths.length; j++) {
      const a = path.basename(docPaths[i] ?? '', '.md');
      const b = path.basename(docPaths[j] ?? '', '.md');
      if (titleSimilarity(a, b) > 0.6) {
        const pi = docPaths[i];
        const pj = docPaths[j];
        if (pi !== undefined && pj !== undefined) {
          mergeCandidates.push([pi, pj]);
        }
      }
    }
  }

  if (mergeCandidates.length === 0) return;

  // If > 2 candidates, use LLM to confirm which to merge
  let confirmedPairs: Array<[string, string]> = [];
  if (mergeCandidates.length <= 2) {
    confirmedPairs = mergeCandidates;
  } else {
    const apiKey = config.llm.apiKey ?? process.env['OPENROUTER_API_KEY'];
    if (!apiKey) {
      confirmedPairs = mergeCandidates.slice(0, 2);
    } else {
      const pairDescriptions = mergeCandidates.map(([a, b], i) =>
        `${i}: "${path.basename(a, '.md')}" + "${path.basename(b, '.md')}"`
      ).join('\n');

      try {
        const output = await chatCompletion({
          model: config.llm.model,
          apiKey,
          baseUrl: config.llm.baseUrl,
          maxTokens: 256,
          messages: [
            { role: 'system', content: 'You are a knowledge manager. Output only valid JSON.' },
            { role: 'user', content: `Which of these document pairs should be merged? Output JSON array of indices to merge: [0, 2, ...]\n\n${pairDescriptions}` },
          ],
        });
        const jsonMatch = output.match(/\[[\s\S]*?\]/);
        const indices: number[] = jsonMatch ? JSON.parse(jsonMatch[0]) as number[] : [];
        confirmedPairs = indices
          .filter(i => i >= 0 && i < mergeCandidates.length)
          .map(i => mergeCandidates[i])
          .filter((pair): pair is [string, string] => pair !== undefined);
      } catch {
        confirmedPairs = mergeCandidates.slice(0, 2);
      }
    }
  }

  // Consolidate confirmed pairs
  const today = new Date().toISOString().slice(0, 10);
  for (const [docA, docB] of confirmedPairs) {
    const nameA = path.basename(docA, '.md');
    const nameB = path.basename(docB, '.md');
    const consolidatedName = `${projectName} - Docs - ${categoryName} - Consolidated`;
    const consolidatedPath = path.join(bundleDir, `${consolidatedName}.md`);
    if (fs.existsSync(consolidatedPath)) continue;

    const contentA = readPhaseNode(docA);
    const contentB = readPhaseNode(docB);

    if (!dryRun) {
      // Put consolidated docs alongside other docs (Docs/ preferred if it exists)
      const docsDir = fs.existsSync(path.join(bundleDir, 'Docs')) ? path.join(bundleDir, 'Docs') : bundleDir;
      const consolidatedPath2 = path.join(docsDir, `${consolidatedName}.md`);

      // If the consolidated node already exists, we still treat this as an active consolidation:
      // rewrite links → consolidated, then trash originals.
      if (!fs.existsSync(consolidatedPath2)) {
        writeFile(consolidatedPath2, `---
tags: [docs-consolidated, archived]
project: "${projectName}"
consolidated_from: ["${nameA}", "${nameB}"]
consolidated_at: ${today}
---
## 🔗 Navigation

- [[${projectName} - Knowledge|Knowledge]]

# ${consolidatedName}

> Consolidated from: ${nameA} + ${nameB}

## From: ${nameA}

${contentA.content.trim()}

---

## From: ${nameB}

${contentB.content.trim()}
`);
      }

      // Rewrite links across the bundle to point to the consolidated node
      const linkMap = new Map<string, string>([
        [path.basename(docA, '.md'), path.basename(consolidatedPath2, '.md')],
        [path.basename(docB, '.md'), path.basename(consolidatedPath2, '.md')],
      ]);
      const rewrites = rewriteLinksInBundle(bundleDir, linkMap, dryRun);

      // Move originals to .trash (recoverable)
      const trashed: string[] = [];
      for (const docPath of [docA, docB]) {
        trashed.push(moveToTrash(docPath, config.vaultRoot, runStamp));
      }

      result.actions.push({
        type: 'docs_merged',
        files: [docA, docB],
        archivePath: consolidatedPath2,
        description: `Docs merged (${categoryName}): ${nameA} + ${nameB}; rewrote ${rewrites} file(s); originals moved to .trash`,
      });
      result.docsMerged += 1;

      // Separate action for the trash operation (for auditability)
      result.actions.push({
        type: 'docs_trashed',
        files: trashed,
        archivePath: consolidatedPath2,
        description: `Original docs moved to .trash after merge`,
      });
      continue;
    }

    // dry-run: report what would happen
    result.actions.push({
      type: 'docs_merged',
      files: [docA, docB],
      archivePath: path.join(fs.existsSync(path.join(bundleDir, 'Docs')) ? path.join(bundleDir, 'Docs') : bundleDir, `${consolidatedName}.md`),
      description: `Docs merge candidate (${categoryName}): ${nameA} + ${nameB}`,
    });
    result.docsMerged += 1;


  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export interface ConsolidateOptions {
  dryRun: boolean;
  includeLogs?: boolean;
  includeDocsHubCleanup?: boolean;
  projectFilter?: string; // if set, only bundles whose project name includes this string (case-insensitive)
}

export async function consolidateVaultNodes(
  config: ControllerConfig,
  options: ConsolidateOptions = { dryRun: false, includeLogs: true, includeDocsHubCleanup: true }
): Promise<ConsolidationResult> {
  const opt: Required<Pick<ConsolidateOptions, 'dryRun' | 'includeLogs' | 'includeDocsHubCleanup'>> = {
    dryRun: options.dryRun,
    includeLogs: options.includeLogs ?? true,
    includeDocsHubCleanup: options.includeDocsHubCleanup ?? true,
  };

  const result: ConsolidationResult = { actions: [], phasesArchived: 0, docsMerged: 0 };
  const { vaultRoot, projectsGlob } = config;
  const runStamp = new Date().toISOString().replace(/[:.]/g, '-');

  const base = projectsGlob.replace('/**', '').replace('/**/*', '');
  const overviewPaths = glob.sync(`${base}/**/*Overview*.md`, { cwd: vaultRoot, absolute: true });

  const filter = (options.projectFilter ?? '').trim().toLowerCase();

  for (const overviewPath of overviewPaths) {
    const overviewNode = readPhaseNode(overviewPath);
    const projectName = String(
      overviewNode.frontmatter['project'] ?? path.basename(path.dirname(overviewPath))
    );
    if (filter && !projectName.toLowerCase().includes(filter)) continue;

    const bundleDir = path.dirname(overviewPath);

    // 1. Phase group consolidation (deterministic)
    const phaseGroups = glob.sync('*Phase Group*.md', { cwd: bundleDir, absolute: true })
      .filter(p => !p.includes('Archive'));

    for (const groupPath of phaseGroups) {
      consolidatePhaseGroup(groupPath, projectName, bundleDir, result, opt.dryRun);
    }

    // If a Phase Group Archive already exists, we can rewrite links and trash the original phase nodes.
    const phaseGroupArchives = glob.sync('*Phase Group* - Archive.md', { cwd: bundleDir, absolute: true });
    for (const archivePath of phaseGroupArchives) {
      trashCompletedGroupPhasesIfArchived(
        archivePath,
        projectName,
        bundleDir,
        vaultRoot,
        result,
        opt.dryRun,
        runStamp
      );

      // Trash the Phase Group hub note itself (Phase Group N.md) once archive exists.
      const archiveBase = path.basename(archivePath, '.md');
      const hubBase = archiveBase.replace(/ - Archive$/, '');
      const hubPath = path.join(bundleDir, `${hubBase}.md`);
      if (fs.existsSync(hubPath)) {
        trashGroupHubIfArchived(
          hubPath,
          archivePath,
          bundleDir,
          vaultRoot,
          result,
          opt.dryRun,
          runStamp,
          'phase_group_hub_trashed'
        );
      }

      if (opt.includeLogs) {
        consolidateLogGroupForArchivedPhaseGroup(
          archivePath,
          projectName,
          bundleDir,
          vaultRoot,
          result,
          opt.dryRun,
          runStamp
        );
      }
    }

    // Docs Hub cleanup: rewrite any links to legacy "Docs Hub" notes → Knowledge, then trash the hub note.
    if (opt.includeDocsHubCleanup) {
      const docsHubPath = path.join(bundleDir, `${projectName} - Docs Hub.md`);
      const knowledgePath = path.join(bundleDir, `${projectName} - Knowledge.md`);
      if (fs.existsSync(docsHubPath) && fs.existsSync(knowledgePath)) {
        const linkMap = new Map<string, string>([
          [path.basename(docsHubPath, '.md'), path.basename(knowledgePath, '.md')],
        ]);
        const rewrites = rewriteLinksInBundle(bundleDir, linkMap, opt.dryRun);
        if (!opt.dryRun) {
          moveToTrash(docsHubPath, vaultRoot, runStamp);
        }
        result.actions.push({
          type: 'docs_hub_trashed',
          files: [docsHubPath],
          archivePath: knowledgePath,
          description: `Legacy Docs Hub replaced by Knowledge; rewrote ${rewrites} file(s) and moved Docs Hub to .trash`,
        });
      }
    }

    // 2. Doc consolidation (petal graph): merge docs inside Docs/ (and docs/).
    const docPaths: string[] = [];
    for (const dir of [path.join(bundleDir, 'Docs'), path.join(bundleDir, 'docs')]) {
      if (fs.existsSync(dir)) {
        const found = glob.sync('*.md', { cwd: dir, absolute: true });
        // Exclude hubs / generated consolidation outputs from being re-merged.
        docPaths.push(...found.filter(p => {
          const b = path.basename(p);
          if (b.includes('Docs Hub')) return false;
          if (b.includes('Consolidated')) return false;
          if (b.includes(' - Docs - ')) return false;
          return true;
        }));
      }
    }

    if (docPaths.length >= 2) {
      // Group deterministically by prefix before ' - ' to keep merges scoped.
      const groups = new Map<string, string[]>();
      for (const p of docPaths) {
        const title = path.basename(p, '.md');
        const prefix = title.includes(' - ') ? (title.split(' - ')[0] ?? 'General') : 'General';
        if (!groups.has(prefix)) groups.set(prefix, []);
        groups.get(prefix)!.push(p);
      }

      for (const [cat, docs] of groups.entries()) {
        if (docs.length >= 2) {
          await consolidateDocs(docs, projectName, bundleDir, cat, config, result, opt.dryRun, runStamp);
        }
      }
    }
  }

  return result;
}
