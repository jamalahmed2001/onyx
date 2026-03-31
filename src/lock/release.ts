import { readPhaseNode } from '../vault/reader.js';
import { setLockFields, setPhaseTag, appendToLog } from '../vault/writer.js';
import type { PhaseTag } from '../fsm/states.js';

// Release lock: clear locked_by/locked_at, set nextTag, append log entry.
// No-op if locked_by !== runId.
export function releaseLock(phaseNotePath: string, runId: string, nextTag: PhaseTag): void {
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
}
