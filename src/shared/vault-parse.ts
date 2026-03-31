// Shared vault parsing functions.
// Both CLI and dashboard import from here — single implementation, no drift.

import type { PhaseState, PhaseTag } from './types.js';

// ---------------------------------------------------------------------------
// State derivation
// ---------------------------------------------------------------------------

/** Normalize a raw state string (with or without 'phase-' prefix) to a PhaseState. */
export function normalizeState(raw: string): PhaseState {
  const stripped = raw.startsWith('phase-') ? raw.slice('phase-'.length) : raw;
  // Handle 'complete' → 'completed' (seen in wild)
  const normalized = stripped === 'complete' ? 'completed' : stripped;
  const valid: PhaseState[] = ['backlog', 'planning', 'ready', 'active', 'blocked', 'completed'];
  if (valid.includes(normalized as PhaseState)) return normalized as PhaseState;
  return 'backlog';
}

/** Convert a PhaseState to its frontmatter tag. */
export function stateToTag(state: PhaseState): PhaseTag {
  return `phase-${state}` as PhaseTag;
}

/**
 * Derive PhaseState from frontmatter.
 * Priority: state field > tags array > status field > 'backlog' default.
 */
export function stateFromFrontmatter(fm: Record<string, unknown>): PhaseState {
  // 1. New canonical 'state' field
  const stateField = fm['state'];
  if (typeof stateField === 'string' && stateField.length > 0) {
    return normalizeState(stateField);
  }

  // 2. Tags array — find first phase-* tag
  const tags = fm['tags'];
  if (Array.isArray(tags)) {
    const phaseTag = (tags as string[]).find(t => typeof t === 'string' && t.startsWith('phase-'));
    if (phaseTag) return normalizeState(phaseTag);
  }
  if (typeof tags === 'string' && tags.startsWith('phase-')) {
    return normalizeState(tags);
  }

  // 3. Fallback: status field
  const status = fm['status'];
  if (typeof status === 'string' && status.length > 0) {
    return normalizeState(status);
  }

  return 'backlog';
}

// ---------------------------------------------------------------------------
// Task counting
// ---------------------------------------------------------------------------

export interface TaskCount {
  done: number;
  total: number;
  nextTask?: string;
}

/**
 * Count tasks in phase note content.
 * Prefers AGENT_WRITABLE plan block; falls back to ## Tasks section.
 */
export function countTasks(content: string): TaskCount {
  let done = 0;
  let total = 0;
  let nextTask: string | undefined;

  // Strategy 1: AGENT_WRITABLE plan block (granular agent tasks)
  const planStart = content.indexOf('<!-- AGENT_WRITABLE_START:phase-plan -->');
  const planEnd   = content.indexOf('<!-- AGENT_WRITABLE_END:phase-plan -->');
  if (planStart !== -1 && planEnd !== -1) {
    const block = content.slice(planStart, planEnd);
    for (const line of block.split('\n')) {
      if (/^\s*-\s*\[x\]/i.test(line)) { done++; total++; }
      else if (/^\s*-\s*\[ \]/.test(line)) {
        total++;
        if (!nextTask) {
          nextTask = line.replace(/^\s*-\s*\[ \]\s*/, '').trim().slice(0, 90) || undefined;
        }
      }
    }
    // Fill nextTask from continuation line when bare "- [ ]"
    if (!nextTask && total > done) {
      const lines = block.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*-\s*\[ \]/.test(lines[i]!) && !lines[i]!.replace(/^\s*-\s*\[ \]\s*/, '').trim()) {
          const cont = lines.slice(i + 1).find(l => l.trim().length > 0 && !/^\s*-\s*\[/.test(l) && !/^<!--/.test(l));
          if (cont) { nextTask = cont.trim().slice(0, 90); break; }
        }
      }
    }
    return { done, total, nextTask };
  }

  // Strategy 2: ## Tasks section only — skip Acceptance Criteria / Blockers / etc.
  const SKIP = new Set(['acceptance criteria', 'blockers', 'verification', 'log', 'notes']);
  let inTasks = false;
  let inSkip = false;
  let foundTasks = false;
  for (const line of content.split('\n')) {
    const h = line.match(/^#{1,4}\s+(.+)$/);
    if (h) {
      const t = h[1]!.replace(/^[\p{Emoji}\p{So}\s]+/u, '').trim().toLowerCase();
      inTasks = t === 'tasks';
      inSkip = SKIP.has(t);
      if (inTasks) foundTasks = true;
      continue;
    }
    if (foundTasks && !inTasks) continue;
    if (inSkip) continue;
    if (/^\s*-\s*\[x\]/i.test(line)) { done++; total++; }
    else if (/^\s*-\s*\[ \]/.test(line)) {
      total++;
      if (!nextTask) {
        nextTask = line.replace(/^\s*-\s*\[ \]\s*/, '').trim().slice(0, 90) || undefined;
      }
    }
  }
  return { done, total, nextTask };
}
