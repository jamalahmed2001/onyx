import { readPhaseNode } from '../vault/reader.js';
import { setLockFields, setPhaseTag, appendToLog } from '../vault/writer.js';
import { appendAuditEvent } from '../audit/trail.js';
import type { PhaseTag } from '../fsm/states.js';

// Release lock: clear locked_by/locked_at, set nextTag, append log entry.
// No-op if locked_by !== runId.
export function releaseLock(phaseNotePath: string, runId: string, nextTag: PhaseTag, vaultRoot?: string): void {
  const node = readPhaseNode(phaseNotePath);

  if (!node.exists) return;

  const existingLockedBy = node.frontmatter['locked_by'];
  if (existingLockedBy !== runId) {
    // We don't hold this lock — no-op
    return;
  }

  // Set the next state tag
  setPhaseTag(phaseNotePath, nextTag);
  // Clear lock fields
  setLockFields(phaseNotePath, '', '');

  // Append log entry
  appendToLog(phaseNotePath, {
    runId,
    event: 'lock_released',
    detail: `Released to ${nextTag}`,
  });

  // Append audit trail
  if (vaultRoot) {
    appendAuditEvent(vaultRoot, {
      ts:            new Date().toISOString(),
      event:         'lock_released',
      phaseNotePath,
      runId,
      projectId:     String(node.frontmatter['project_id'] ?? node.frontmatter['project'] ?? ''),
      detail:        `Released to ${nextTag}`,
    });
  }
}
