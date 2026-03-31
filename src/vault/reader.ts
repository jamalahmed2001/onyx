import matter from 'gray-matter';
import fs from 'fs';
import path from 'path';
import glob from 'fast-glob';

// Re-export types from shared for backward compatibility
export type { PhaseNode, VaultBundle } from '../shared/types.js';
import type { PhaseNode, VaultBundle } from '../shared/types.js';

// Read any file as raw text. Returns null when file missing.
// This is the canonical path for ALL fs.readFileSync calls in the codebase.
export function readRawFile(absolutePath: string): string | null {
  if (!fs.existsSync(absolutePath)) return null;
  return fs.readFileSync(absolutePath, 'utf-8');
}

// Read a single file as a PhaseNode. Returns exists:false when file missing.
export function readPhaseNode(absolutePath: string): PhaseNode {
  if (!fs.existsSync(absolutePath)) {
    return {
      path: absolutePath,
      exists: false,
      frontmatter: {},
      content: '',
      raw: '',
    };
  }

  const raw = fs.readFileSync(absolutePath, 'utf-8');
  const parsed = matter(raw);

  return {
    path: absolutePath,
    exists: true,
    frontmatter: parsed.data as Record<string, unknown>,
    content: parsed.content,
    raw,
  };
}

// Read a full project bundle by directory.
// Files are named "PROJECT - Overview.md", "PROJECT - Kanban.md" etc.
export function readBundle(bundleDir: string, projectId: string): VaultBundle {
  const p = (suffix: string) => path.join(bundleDir, `${projectId} - ${suffix}.md`);

  const overview   = readPhaseNode(p('Overview'));
  const docsHub    = readPhaseNode(p('Docs Hub'));
  const kanban     = readPhaseNode(p('Kanban'));
  const knowledge  = readPhaseNode(p('Knowledge'));
  const repoContext = readPhaseNode(p('Repo Context'));
  const agentLogHub = readPhaseNode(p('Agent Log Hub'));

  const phasesDir = path.join(bundleDir, 'Phases');
  const logsDir   = path.join(bundleDir, 'Logs');

  let phases: PhaseNode[] = [];
  if (fs.existsSync(phasesDir)) {
    const phaseFiles = glob.sync('*.md', { cwd: phasesDir, absolute: false });
    phaseFiles.sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
      const numB = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
      return numA - numB;
    });
    phases = phaseFiles.map(f => readPhaseNode(path.join(phasesDir, f)));
  }

  return {
    projectId,
    bundleDir,
    overview,
    docsHub,
    kanban,
    knowledge,
    repoContext,
    agentLogHub,
    phases,
    logsDir,
  };
}

// Convenience: discover all Overview files and return their bundles.
export function discoverBundles(vaultRoot: string, projectsGlob: string): VaultBundle[] {
  // Build a glob pattern that searches for Overview files within each brace arm.
  // Input: "{01 - Projects/**,02 - Fanvue/**,...}" or "10 - OpenClaw/**"
  // Output: "{01 - Projects/**/*Overview*.md,02 - Fanvue/**/*Overview*.md,...}"
  let overviewGlob: string;
  if (projectsGlob.includes('/**')) {
    // Replace trailing /** in each brace arm (or simple glob) with /**/*Overview*.md
    overviewGlob = projectsGlob.replace(/\/\*\*(?=[,}]|$)/g, '/**/*Overview*.md');
  } else {
    overviewGlob = `${projectsGlob}/**/*Overview*.md`;
  }
  const overviews = glob.sync(overviewGlob, { cwd: vaultRoot, absolute: true });
  const bundles: VaultBundle[] = [];
  for (const overviewPath of overviews) {
    const bundleDir = path.dirname(overviewPath);
    const node = readPhaseNode(overviewPath);
    const projectId = String(node.frontmatter['project'] ?? path.basename(bundleDir));
    bundles.push(readBundle(bundleDir, projectId));
  }
  return bundles;
}
