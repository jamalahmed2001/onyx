import type { ControllerConfig } from '../config/load.js';
import { healStaleLocks } from './staleLocks.js';
import { healDrift } from './drift.js';
import { healMigrateLogs } from './migrateLogs.js';
import { repairMissingProjectIds } from './repairProjectId.js';
import { recoverOrphanedLocks } from '../audit/recover.js';

export interface HealAction {
  type:
    | 'stale_lock_cleared'
    | 'frontmatter_drift_fixed'
    | 'tag_normalized'
    | 'missing_section_detected'
    | 'orphaned_lock_field_cleared'
    | 'replan_count_reset'
    | 'duplicate_nav_removed'
    | 'project_id_repaired';
  phaseNotePath: string;
  description: string;
  applied: boolean;
}

export interface HealResult {
  actions: HealAction[];
  applied: number;
  detected: number;
}

// Run all healers. Called at controller startup and by `groundzeros heal` CLI.
export function runAllHeals(config: ControllerConfig): HealResult {
  const staleLockActions = healStaleLocks(
    config.vaultRoot,
    config.projectsGlob,
    config.staleLockThresholdMs
  );
  const driftActions = healDrift(config.vaultRoot, config.projectsGlob);
  const logMigrationActions = healMigrateLogs(config.vaultRoot, config.projectsGlob);
  const projectIdActions = repairMissingProjectIds(config.vaultRoot, config.projectsGlob);
  const crashRecoveryActions = recoverOrphanedLocks(config.vaultRoot, config.projectsGlob);

  const actions: HealAction[] = [
    ...staleLockActions,
    ...driftActions,
    ...logMigrationActions,
    ...projectIdActions,
    ...crashRecoveryActions,
  ];

  const applied = actions.filter(a => a.applied).length;
  const detected = actions.length;

  return { actions, applied, detected };
}
