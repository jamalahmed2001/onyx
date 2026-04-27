import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';
import glob from 'fast-glob';
import { readRawFile } from '../vault/reader.js';
import { writeFile } from '../vault/writer.js';
import type { HealAction } from './index.js';

// Detect vault nodes that are completely disconnected (no inbound AND no outbound links)
// and auto-attach them to the nearest project hub (Overview/Knowledge) when possible.
//
// Why: Obsidian graph clutter often comes from duplicate / stray nodes that were created
// during healing/consolidation and left unlinked (e.g. "Untitled" notes). We prefer:
// - deterministic attachment when we can infer a hub
// - otherwise: detect + alert (no destructive moves)

const IGNORE_GLOBS = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/.trash/**',
  '**/_Archive/**',
  '**/.obsidian/**',
];

function extractWikilinks(raw: string): string[] {
  const out: string[] = [];
  raw.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g, (_m, target: string) => {
    const t = String(target ?? '').trim();
    if (t) out.push(t);
    return _m;
  });
  return out;
}

function hasNavBlock(body: string): boolean {
  return /\n## 🔗 Navigation\b/.test(body) || body.startsWith('## 🔗 Navigation');
}

function ensureNavWithHubLink(raw: string, hubLink: string): string {
  const parsed = matter(raw);
  let body = parsed.content ?? '';

  const linkLine = `- [[${hubLink}]]`;

  if (hasNavBlock(body)) {
    // Insert into existing nav block (idempotent)
    if (!body.includes(`[[${hubLink}]]`)) {
      body = body.replace(/## 🔗 Navigation\n?/g, (m) => `${m}${linkLine}\n`);
    }
  } else {
    // Create a nav block near the top (after first H1 if present)
    const nav = `## 🔗 Navigation\n\n${linkLine}\n\n`;
    // If the file starts with a title, keep it at top; otherwise prepend.
    const h1 = body.match(/^# .+\n/);
    if (h1 && h1.index === 0) {
      const h1Line = h1[0];
      body = `${h1Line}\n${nav}${body.slice(h1Line.length)}`;
    } else {
      body = `${nav}${body}`;
    }
  }

  // Basic whitespace tidy
  body = body.replace(/\n{4,}/g, '\n\n\n');

  return matter.stringify(body.trimStart(), parsed.data as Record<string, unknown>);
}

function findNearestProjectRootHub(filePath: string, vaultRoot: string): { overview?: string; knowledge?: string } {
  // Walk up to vault root looking for project-level "*Overview*.md" / "*Knowledge*.md".
  let dir = path.dirname(filePath);
  const stop = path.resolve(vaultRoot);

  while (path.resolve(dir).startsWith(stop)) {
    const overview = glob.sync('*Overview*.md', { cwd: dir, absolute: true, onlyFiles: true });
    const knowledge = glob.sync('*Knowledge*.md', { cwd: dir, absolute: true, onlyFiles: true });

    // Heuristic: the closest match is best.
    const out: { overview?: string; knowledge?: string } = {};
    if (overview.length > 0) out.overview = overview[0];
    if (knowledge.length > 0) out.knowledge = knowledge[0];
    if (out.overview || out.knowledge) {
      return {
        overview: out.overview ? path.basename(out.overview, '.md') : undefined,
        knowledge: out.knowledge ? path.basename(out.knowledge, '.md') : undefined,
      };
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return {};
}

function ensureFolderOverviewHub(
  folderDir: string,
  vaultRoot: string,
  seedFromFilePath: string,
  createIfMissing: boolean
): { hubTitle: string | null; created: boolean } {
  // Rule:
  // - If folder already has an Overview note, that's the hub.
  // - Else: create "<Project> - <Folder> Hub.md" (or "<Folder> - Hub.md") and use it as hub.

  const existingOverview = glob.sync('*Overview*.md', { cwd: folderDir, absolute: true, onlyFiles: true });
  if (existingOverview.length > 0) {
    return { hubTitle: path.basename(existingOverview[0]!, '.md'), created: false };
  }

  if (!createIfMissing) return { hubTitle: null, created: false };

  const folderName = path.basename(folderDir);
  const roots = findNearestProjectRootHub(seedFromFilePath, vaultRoot);
  const projectPrefix = roots.overview?.replace(/\s-\sOverview$/, '') ?? roots.knowledge?.replace(/\s-\sKnowledge$/, '');
  const hubBase = projectPrefix ? `${projectPrefix} - ${folderName} Hub` : `${folderName} - Hub`;
  const hubPath = path.join(folderDir, `${hubBase}.md`);

  if (fs.existsSync(hubPath)) {
    return { hubTitle: hubBase, created: false };
  }

  const lines: string[] = [];
  lines.push('---');
  lines.push('tags: [hub]');
  if (projectPrefix) lines.push(`project: "${projectPrefix}"`);
  lines.push('---');
  lines.push('');
  lines.push('# ' + hubBase);
  lines.push('');
  lines.push('## 🔗 Navigation');
  lines.push('');
  if (roots.overview) lines.push(`- [[${roots.overview}|Overview]]`);
  if (roots.knowledge) lines.push(`- [[${roots.knowledge}|Knowledge]]`);
  lines.push('');
  lines.push('## Contents');
  lines.push('');

  try {
    writeFile(hubPath, lines.join('\n'));
    return { hubTitle: hubBase, created: true };
  } catch {
    return { hubTitle: null, created: false };
  }
}

function appendHubContentsLinks(hubPath: string, folderDir: string): boolean {
  // Ensure hub has links to all markdown files in that folder.
  // Idempotent: only adds missing links.
  const raw = readRawFile(hubPath);
  if (raw === null) return false;

  const hubTitle = path.basename(hubPath, '.md');

  const mdFiles = glob.sync('*.md', { cwd: folderDir, absolute: true, onlyFiles: true })
    .filter(p => path.basename(p, '.md') !== hubTitle);

  const existing = new Set<string>();
  for (const t of extractWikilinks(raw)) existing.add(path.posix.basename(t));

  const toAdd = mdFiles
    .map(p => path.basename(p, '.md'))
    .filter(t => !existing.has(t));

  if (toAdd.length === 0) return false;

  const insert = toAdd.map(t => `- [[${t}]]`).join('\n') + '\n';

  // Append under "## Contents" if present, else append at end.
  let updated = raw;
  const marker = '\n## Contents\n';
  const idx = updated.indexOf(marker);
  if (idx !== -1) {
    const after = idx + marker.length;
    updated = updated.slice(0, after) + '\n' + insert + updated.slice(after);
  } else {
    updated = updated.trimEnd() + '\n\n## Contents\n\n' + insert;
  }

  try {
    writeFile(hubPath, updated);
    return true;
  } catch {
    return false;
  }
}

export function healOrphanNodes(vaultRoot: string, projectsGlob: string): HealAction[] {
  // Scope to project bundles first (keeps system notes from being aggressively modified).
  const base = projectsGlob.replace('/**', '').replace('/**/*', '');
  const bundleDirs = glob.sync(base, { cwd: vaultRoot, onlyDirectories: true, deep: 2 });

  const allMarkdown = glob.sync('**/*.md', {
    cwd: vaultRoot,
    absolute: true,
    ignore: IGNORE_GLOBS,
  });

  // Build global referenced targets from all markdown.
  const referenced = new Set<string>();
  for (const fp of allMarkdown) {
    const raw = readRawFile(fp);
    if (raw === null) continue;
    for (const t of extractWikilinks(raw)) {
      referenced.add(t);
      referenced.add(path.posix.basename(t));
    }
  }

  const actions: HealAction[] = [];

  // Candidate: within a project bundle, not an obvious hub, and isolated.
  for (const fp of allMarkdown) {
    const rel = path.relative(vaultRoot, fp);

    const inBundle = bundleDirs.some(d => {
      const abs = path.join(vaultRoot, d);
      return fp.startsWith(abs + path.sep);
    });
    if (!inBundle) continue;

    const baseName = path.basename(fp, '.md');
    if (/Overview$/.test(baseName) || / - Overview$/.test(baseName)) continue;
    if (baseName.includes('Kanban')) continue;

    const raw = readRawFile(fp);
    if (raw === null) continue;

    const outgoing = extractWikilinks(raw);
    const inbound = referenced.has(baseName) || referenced.has(rel.replace(/\\/g, '/'));

    // Isolated = no outbound AND no inbound.
    if (outgoing.length > 0 || inbound) continue;

    // Folder-hub rule:
    // - If the folder has an Overview, use it.
    // - Else create a Hub note in that folder.
    const folderDir = path.dirname(fp);
    const hubInfo = ensureFolderOverviewHub(folderDir, vaultRoot, fp, true);

    if (!hubInfo.hubTitle) {
      actions.push({
        type: 'orphan_node_detected',
        phaseNotePath: fp,
        description: `Isolated node detected (no links in/out) but could not create/find a folder hub: ${rel}`,
        applied: false,
      });
      continue;
    }

    // Keep the hub up to date: it should link to all md files in its folder.
    const hubPath = path.join(folderDir, `${hubInfo.hubTitle}.md`);
    appendHubContentsLinks(hubPath, folderDir);

    const action: HealAction = {
      type: 'orphan_node_attached',
      phaseNotePath: fp,
      description: `Attached isolated node to folder hub [[${hubInfo.hubTitle}]] (nav link): ${rel}${hubInfo.created ? ' (hub created)' : ''}`,
      applied: false,
    };

    try {
      const updated = ensureNavWithHubLink(raw, hubInfo.hubTitle);
      if (updated !== raw) writeFile(fp, updated);
      action.applied = true;
    } catch {
      action.applied = false;
    }

    actions.push(action);
  }

  return actions;
}
