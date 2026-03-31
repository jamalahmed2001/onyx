import path from 'path';
import { discoverActivePhases } from '../vault/discover.js';
import { setLockFields, setPhaseTag } from '../vault/writer.js';
import { appendAuditEvent } from './trail.js';
import type { HealAction } from '../healer/index.js';

function isPidRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function recoverOrphanedLocks(vaultRoot: string, projectsGlob: string): HealAction[] {
  const active = discoverActivePhases(vaultRoot, projectsGlob);
  const actions: HealAction[] = [];

  for (const phase of active) {
    const pid = phase.frontmatter['lock_pid'];
    if (typeof pid !== 'number') continue;
    if (isPidRunning(pid)) continue;

    // PID is gone — clear the lock
    setPhaseTag(phase.path, 'phase-ready');
    setLockFields(phase.path, '', '');
    appendAuditEvent(vaultRoot, {
      ts:            new Date().toISOString(),
      event:         'lock_force_cleared',
      phaseNotePath: phase.path,
      projectId:     String(phase.frontmatter['project_id'] ?? phase.frontmatter['project'] ?? ''),
      pid,
      detail:        `PID ${pid} no longer running — lock cleared`,
    });
    actions.push({
      type:        'stale_lock_cleared',
      phaseNotePath: phase.path,
      description: `Crash-recovered lock for ${path.basename(phase.path)} (PID ${pid} gone)`,
      applied:     true,
    });
  }

  return actions;
}
