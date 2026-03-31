import type { PhaseNode } from '../vault/reader.js';
import { normalizeTag } from './states.js';

export type ProjectStatus = 'planning' | 'active' | 'blocked' | 'complete';

// Derive project status from all phase nodes at read time. Never stored.
// Rules from directive §10.3:
//   - If any phase is blocked → 'blocked'
//   - If any phase is active  → 'active'
//   - If all phases are completed → 'complete'
//   - Otherwise → 'planning'
export function deriveProjectStatus(phases: PhaseNode[]): ProjectStatus {
  if (phases.length === 0) return 'planning';

  const states = phases.map(p => {
    const tags = p.frontmatter['tags'];
    if (Array.isArray(tags)) {
      const phaseTag = (tags as string[]).find(t => t.startsWith('phase-'));
      if (phaseTag) return normalizeTag(phaseTag);
    }
    const status = p.frontmatter['status'];
    if (typeof status === 'string') return normalizeTag(status);
    return normalizeTag('backlog');
  });

  if (states.some(s => s === 'blocked')) return 'blocked';
  if (states.some(s => s === 'active')) return 'active';
  if (states.every(s => s === 'completed')) return 'complete';
  return 'planning';
}
