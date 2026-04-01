import os from 'os';
import { readPhaseNode } from '../vault/reader.js';
import { setLockFields, setPhaseTag, writeFrontmatter } from '../vault/writer.js';
// setLockFields and setPhaseTag still used for TTL-expired lock clearing above
import { appendAuditEvent } from '../audit/trail.js';
import { validatePhaseForExecution } from '../shared/schemas.js';
import type { PhaseTag } from '../fsm/states.js';

export type LockResult =
  | { ok: true; runId: string }
  | { ok: false; reason: 'already_locked'; lockedBy: string; lockedAt: string }
  | { ok: false; reason: 'not_ready'; currentTag: string }
  | { ok: false; reason: 'schema_invalid'; errors: string[] };

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Attempt to acquire vault-native lock on a phase note.
// 1. Validate schema — reject if project_id or required fields are missing
// 2. Read frontmatter
// 3. If locked_by is set and !== runId → check TTL expiry; if expired, clear and re-acquire
// 4. If locked_by === runId → return ok (re-entrant)
// 5. If phase-ready → write phase-active + locked_by + locked_at + lock_pid + lock_hostname + lock_ttl_ms
// 6. Read back to verify (race condition check)
export function acquireLock(
  phaseNotePath: string,
  runId: string,
  vaultRoot?: string,
  ttlMs: number = DEFAULT_TTL_MS,
): LockResult {
  const node = readPhaseNode(phaseNotePath);
  if (!node.exists) return { ok: false, reason: 'not_ready', currentTag: 'missing' };

  // Schema validation — refuse to lock a phase with missing required fields
  const schemaCheck = validatePhaseForExecution(node.frontmatter);
  if (!schemaCheck.valid) {
    return { ok: false, reason: 'schema_invalid', errors: schemaCheck.errors };
  }

  const existingLockedBy = node.frontmatter['locked_by'];
  if (typeof existingLockedBy === 'string' && existingLockedBy !== '') {
    if (existingLockedBy === runId) return { ok: true, runId };

    // Check TTL
    const lockedAt  = node.frontmatter['locked_at'];
    const lockTtl   = Number(node.frontmatter['lock_ttl_ms'] ?? DEFAULT_TTL_MS);
    const elapsed   = lockedAt ? Date.now() - new Date(String(lockedAt)).getTime() : Infinity;

    if (elapsed > lockTtl) {
      // TTL expired — auto-clear
      setPhaseTag(phaseNotePath, 'phase-ready');
      setLockFields(phaseNotePath, '', '');
      if (vaultRoot) {
        appendAuditEvent(vaultRoot, {
          ts: new Date().toISOString(),
          event: 'lock_expired',
          phaseNotePath,
          projectId: String(node.frontmatter['project_id'] ?? node.frontmatter['project'] ?? ''),
          detail: `Lock held by ${existingLockedBy} expired after ${Math.round(elapsed / 60000)}min`,
        });
      }
      // fall through to acquire below
    } else {
      return {
        ok: false,
        reason: 'already_locked',
        lockedBy: existingLockedBy,
        lockedAt: String(lockedAt ?? ''),
      };
    }
  }

  // Check the phase is in a lockable state (ready or active with no lock)
  const tags    = node.frontmatter['tags'];
  const status  = node.frontmatter['status'];
  const tagList: string[] = Array.isArray(tags) ? (tags as string[]) : typeof tags === 'string' ? [tags] : [];
  const hasReadyTag  = tagList.includes('phase-ready')  || status === 'ready';
  const hasActiveTag = tagList.includes('phase-active') || status === 'active';

  if (!hasReadyTag && !hasActiveTag) {
    const currentTag = tagList.find(t => t.startsWith('phase-')) ?? String(status ?? 'backlog');
    return { ok: false, reason: 'not_ready', currentTag };
  }

  // Single atomic write: state transition + all lock fields at once.
  // No partial state visible to other processes between writes.
  const lockedAt = new Date().toISOString();
  const existingTags = Array.isArray(node.frontmatter['tags'])
    ? (node.frontmatter['tags'] as string[])
    : [];
  writeFrontmatter(phaseNotePath, {
    ...node.frontmatter,
    state:         'active',
    status:        'active',
    tags:          [...existingTags.filter(t => !t.startsWith('phase-')), 'phase-active'],
    locked_by:     runId,
    locked_at:     lockedAt,
    lock_pid:      process.pid,
    lock_hostname: os.hostname(),
    lock_ttl_ms:   ttlMs,
  });

  // Read back to verify we won the race
  const verified = readPhaseNode(phaseNotePath);
  if (verified.frontmatter['locked_by'] !== runId) {
    return {
      ok: false,
      reason: 'already_locked',
      lockedBy: String(verified.frontmatter['locked_by'] ?? ''),
      lockedAt: String(verified.frontmatter['locked_at'] ?? ''),
    };
  }

  if (vaultRoot) {
    appendAuditEvent(vaultRoot, {
      ts:            new Date().toISOString(),
      event:         'lock_acquired',
      phaseNotePath,
      projectId:     String(node.frontmatter['project_id'] ?? node.frontmatter['project'] ?? ''),
      runId,
      pid:           process.pid,
      hostname:      os.hostname(),
    });
  }

  return { ok: true, runId };
}

// Re-export PhaseTag to satisfy any consumers that imported it from here
export type { PhaseTag };
