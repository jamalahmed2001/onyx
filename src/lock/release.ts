import matter from 'gray-matter';
import fs from 'fs';
import { readPhaseNode } from '../vault/reader.js';
import { appendToLog } from '../vault/writer.js';
import { appendAuditEvent } from '../audit/trail.js';
import type { PhaseTag } from '../fsm/states.js';

// Release lock: in a single file write, set next state + clear all lock fields.
// No-op if we don't hold the lock (locked_by !== runId).
//
// Single write matters: the old two-write sequence (setPhaseTag → setLockFields)
// left a window where another process could read a half-updated file.
export function releaseLock(phaseNotePath: string, runId: string, nextTag: PhaseTag, vaultRoot?: string): void {
  const node = readPhaseNode(phaseNotePath);
  if (!node.exists) return;

  if (node.frontmatter['locked_by'] !== runId) return; // don't own the lock

  const stateValue = nextTag.replace('phase-', '');
  const existingTags = Array.isArray(node.frontmatter['tags'])
    ? (node.frontmatter['tags'] as string[])
    : [];

  // One read-modify-write: state transition + lock clear in a single pass
  const fm: Record<string, unknown> = {
    ...node.frontmatter,
    state:  stateValue,
    status: stateValue,          // legacy compat
    tags:   [...existingTags.filter(t => !t.startsWith('phase-')), nextTag],
  };
  delete fm['locked_by'];
  delete fm['locked_at'];
  delete fm['lock_pid'];
  delete fm['lock_hostname'];
  delete fm['lock_ttl_ms'];

  const raw = fs.readFileSync(phaseNotePath, 'utf-8');
  const parsed = matter(raw);
  fs.writeFileSync(phaseNotePath, matter.stringify(parsed.content, fm), 'utf-8');

  appendToLog(phaseNotePath, { runId, event: 'lock_released', detail: `→ ${nextTag}` });

  if (vaultRoot) {
    appendAuditEvent(vaultRoot, {
      ts: new Date().toISOString(),
      event: 'lock_released',
      phaseNotePath,
      runId,
      projectId: String(node.frontmatter['project_id'] ?? node.frontmatter['project'] ?? ''),
      detail: `→ ${nextTag}`,
    });
  }
}
