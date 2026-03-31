import { discoverActivePhases } from '../vault/discover.js';
import { readPhaseNode } from '../vault/reader.js';
import { setLockFields, setPhaseTag, appendToLog } from '../vault/writer.js';
import type { HealAction } from './index.js';
import matter from 'gray-matter';
import { readRawFile } from '../vault/reader.js';
import path from 'path';
import fs from 'fs';

// Check the last modification time of the log note for a phase.
// Returns 0 if the log note doesn't exist or can't be read.
function getLastLogActivity(phaseNotePath: string): number {
  const raw = readRawFile(phaseNotePath);
  if (!raw) return 0;
  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;
  const phasesDir = path.dirname(phaseNotePath);
  const bundleDir = path.dirname(phasesDir);
  const logsDir = path.join(bundleDir, 'Logs');
  const phaseNumber = fm['phase_number'] ?? 0;
  const baseName = path.basename(phaseNotePath);
  const logPath = path.join(logsDir, `L${phaseNumber} - ${baseName}`);
  try {
    return fs.statSync(logPath).mtimeMs;
  } catch {
    return 0;
  }
}

// Scan all phase-active notes across the vault.
// For each: check locked_at age. If stale: clear fields, set phase-ready, append log.
export function healStaleLocks(
  vaultRoot: string,
  projectsGlob: string,
  thresholdMs: number
): HealAction[] {
  const activePhases = discoverActivePhases(vaultRoot, projectsGlob);
  const now = Date.now();
  const actions: HealAction[] = [];

  for (const phase of activePhases) {
    // Re-read to get fresh frontmatter
    const node = readPhaseNode(phase.path);
    if (!node.exists) continue;

    const lockedAt = node.frontmatter['locked_at'];
    const lockedBy = node.frontmatter['locked_by'];

    if (typeof lockedAt !== 'string' || lockedAt === '') {
      // Active with no locked_at — treat as stale
      const action: HealAction = {
        type: 'stale_lock_cleared',
        phaseNotePath: phase.path,
        description: `phase-active but no locked_at — clearing lock, setting phase-ready`,
        applied: false,
      };
      try {
        setPhaseTag(phase.path, 'phase-ready');
        setLockFields(phase.path, '', '');
        appendToLog(phase.path, {
          runId: 'healer',
          event: 'stale_lock_cleared',
          detail: 'No locked_at found, reset to phase-ready',
        });
        action.applied = true;
      } catch {
        // Ignore write errors during heal
      }
      actions.push(action);
      continue;
    }

    const lockedAtMs = new Date(lockedAt).getTime();
    if (isNaN(lockedAtMs)) continue;

    const ageMs = now - lockedAtMs;
    if (ageMs < thresholdMs) continue;

    // Check log activity — if there's been a recent log entry, the lock is still active
    const lastLogMs = getLastLogActivity(phase.path);
    if (lastLogMs > 0 && (now - lastLogMs) < thresholdMs) continue;

    const action: HealAction = {
      type: 'stale_lock_cleared',
      phaseNotePath: phase.path,
      description: `Stale lock by ${lockedBy ?? 'unknown'} (locked ${Math.round(ageMs / 1000)}s ago) — clearing, setting phase-ready`,
      applied: false,
    };

    try {
      setPhaseTag(phase.path, 'phase-ready');
      setLockFields(phase.path, '', '');
      appendToLog(phase.path, {
        runId: 'healer',
        event: 'stale_lock_cleared',
        detail: `Lock by ${lockedBy ?? 'unknown'} was ${Math.round(ageMs / 60000)}min old`,
      });
      action.applied = true;
    } catch {
      // Ignore write errors during heal
    }

    actions.push(action);
  }

  return actions;
}
