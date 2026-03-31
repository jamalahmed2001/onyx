import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';
import { discoverAllPhases } from '../vault/discover.js';
import { writeFrontmatter } from '../vault/writer.js';
import type { HealAction } from './index.js';

function findOverviewProjectId(phaseDir: string): string | null {
  // Walk up: phase is at BundleDir/Phases/P1.md → BundleDir/
  const bundleDir = path.dirname(path.dirname(phaseDir));
  const files = fs.existsSync(bundleDir) ? fs.readdirSync(bundleDir) : [];
  const overviewFile = files.find(f => f.includes('Overview') && f.endsWith('.md'));
  if (!overviewFile) return null;
  try {
    const raw = fs.readFileSync(path.join(bundleDir, overviewFile), 'utf-8');
    const fm = matter(raw).data as Record<string, unknown>;
    return String(fm['project_id'] ?? fm['project'] ?? '').trim() || null;
  } catch { return null; }
}

export function repairMissingProjectIds(vaultRoot: string, projectsGlob: string): HealAction[] {
  const phases = discoverAllPhases(vaultRoot, projectsGlob);
  const actions: HealAction[] = [];

  for (const phase of phases) {
    if (phase.frontmatter['project_id']) continue; // already has it

    const projectId = findOverviewProjectId(phase.path);
    if (!projectId) continue;

    const updatedFm = { ...phase.frontmatter, project_id: projectId };
    writeFrontmatter(phase.path, updatedFm);
    actions.push({
      type: 'project_id_repaired',
      phaseNotePath: phase.path,
      description: `Added project_id "${projectId}" to ${path.basename(phase.path)}`,
      applied: true,
    });
  }

  return actions;
}
