import { readPhaseNode } from '../vault/reader.js';
import { setLockFields, setPhaseTag } from '../vault/writer.js';

export type LockResult =
  | { ok: true; runId: string }
  | { ok: false; reason: 'already_locked'; lockedBy: string; lockedAt: string }
  | { ok: false; reason: 'not_ready'; currentTag: string };

// Attempt to acquire vault-native lock on a phase note.
// 1. Read frontmatter
// 2. If locked_by is set and !== runId → return already_locked
// 3. If locked_by === runId → return ok (re-entrant)
// 4. If phase-ready → write phase-active + locked_by + locked_at
// 5. Read back to verify (race condition check)
export function acquireLock(phaseNotePath: string, runId: string): LockResult {
  const node = readPhaseNode(phaseNotePath);

  if (!node.exists) {
    return { ok: false, reason: 'not_ready', currentTag: 'missing' };
  }

  const existingLockedBy = node.frontmatter['locked_by'];
  if (typeof existingLockedBy === 'string' && existingLockedBy !== '') {
    if (existingLockedBy === runId) {
      // Re-entrant: we already hold the lock
      return { ok: true, runId };
    }
    // Someone else holds it
    return {
      ok: false,
      reason: 'already_locked',
      lockedBy: existingLockedBy,
      lockedAt: String(node.frontmatter['locked_at'] ?? ''),
    };
  }

  // Check the phase is in a lockable state (ready or active with no lock)
  const tags = node.frontmatter['tags'];
  const status = node.frontmatter['status'];
  const tagList: string[] = Array.isArray(tags) ? (tags as string[]) : typeof tags === 'string' ? [tags] : [];
  const hasReadyTag = tagList.includes('phase-ready') || status === 'ready';
  const hasActiveTag = tagList.includes('phase-active') || status === 'active';

  if (!hasReadyTag && !hasActiveTag) {
    const currentTag = tagList.find(t => t.startsWith('phase-')) ?? String(status ?? 'backlog');
    return { ok: false, reason: 'not_ready', currentTag };
  }

  // Write the lock: set phase-active + locked_by + locked_at
  const lockedAt = new Date().toISOString();
  setPhaseTag(phaseNotePath, 'phase-active');
  setLockFields(phaseNotePath, runId, lockedAt);

  // Read back to verify we won the race
  const verified = readPhaseNode(phaseNotePath);
  const verifiedLockedBy = verified.frontmatter['locked_by'];

  if (verifiedLockedBy !== runId) {
    return {
      ok: false,
      reason: 'already_locked',
      lockedBy: String(verifiedLockedBy ?? ''),
      lockedAt: String(verified.frontmatter['locked_at'] ?? ''),
    };
  }

  return { ok: true, runId };
}
