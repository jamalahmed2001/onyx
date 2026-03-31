import type { ControllerConfig } from '../config/load.js';
import { runAllHeals } from '../healer/index.js';
import { maintainVaultGraph } from '../vault/graphMaintainer.js';
import { discoverAllPhases, dependenciesMet } from '../vault/discover.js';
import { routePhase } from './router.js';
import { runPhase } from '../executor/runPhase.js';
import { atomisePhase } from '../planner/atomiser.js';
import { consolidatePhase } from '../planner/consolidator.js';
import { consolidateVaultNodes } from '../vault/nodeConsolidator.js';
import { replanPhase } from '../planner/replan.js';
import { notify } from '../notify/notify.js';
import { readBundle } from '../vault/reader.js';
import { runPhaseReview } from '../skills/phaseReview.js';
import { randomBytes } from 'crypto';
import path from 'path';

// Shutdown flag — set by SIGINT/SIGTERM handlers
let _shutdownRequested = false;

export function requestShutdown(): void {
  _shutdownRequested = true;
}

export function isShutdownRequested(): boolean {
  return _shutdownRequested;
}

export interface IterationResult {
  iteration: number;
  phasesActedOn: string[];
  healed: { applied: number; detected: number };
  graphRepairs: number;
  nodesConsolidated: number;
  halted: boolean;
  haltReason?: string;
}

export interface RunOptions {
  projectFilter?: string;
  phaseFilter?: number;
  dryRun?: boolean;
  once?: boolean;
}

export function generateRunId(): string {
  return 'gz-' + Date.now() + '-' + randomBytes(3).toString('hex');
}

// Main controller loop:
// 1. notify controller_started
// 2. runAllHeals → notify heal_complete
// 3. maintainVaultGraph (ensure fractal link pattern intact)
// 4. discoverAllPhases
// 5. If none: notify controller_idle, return
// 6. For each phase: routePhase → execute/atomise/consolidate/surface
// 7. After each action: notify
// 8. Repeat until no work or maxIterations hit
// 9. If maxIterations hit: notify controller_halted
export async function runLoop(config: ControllerConfig, opts: RunOptions = {}): Promise<IterationResult[]> {
  const runId = generateRunId();
  const results: IterationResult[] = [];

  // Reset shutdown flag for this run
  _shutdownRequested = false;

  // Register SIGINT/SIGTERM handlers for graceful shutdown
  const sigintHandler = () => {
    console.log('\n[gzos] Shutdown requested — finishing current task then exiting cleanly...');
    _shutdownRequested = true;
  };
  process.once('SIGINT', sigintHandler);
  process.once('SIGTERM', sigintHandler);

  try {
    await notify({ event: 'controller_started', runId }, config);

    // Heal first
    const healResult = runAllHeals(config);
    await notify({
      event: 'heal_complete',
      detail: `applied:${healResult.applied} detected:${healResult.detected}`,
      runId,
    }, config);

    // Maintain graph links (fractal pattern enforcement)
    const graphResult = await maintainVaultGraph(config);
    if (graphResult.repairs.length > 0) {
      await notify({
        event: 'heal_complete',
        detail: `graph: ${graphResult.repairs.length} link repairs, ${graphResult.wrongLinksRemoved} wrong links removed`,
        runId,
      }, config);
    }

    // Consolidate completed phase groups and duplicate docs
    const consolidateResult = await consolidateVaultNodes(config);
    if (consolidateResult.actions.length > 0) {
      await notify({
        event: 'heal_complete',
        detail: `consolidate: ${consolidateResult.phasesArchived} phases archived, ${consolidateResult.docsMerged} docs merged`,
        runId,
      }, config);
    }

    for (let iteration = 1; iteration <= config.maxIterations; iteration++) {
      // Check shutdown before each iteration
      if (_shutdownRequested) {
        await notify({ event: 'controller_halted', detail: 'Shutdown requested by user', runId }, config);
        break;
      }

      const phases = discoverAllPhases(config.vaultRoot, config.projectsGlob);

      if (phases.length === 0) {
        await notify({ event: 'controller_idle', detail: 'No phase notes found', runId }, config);
        results.push({
          iteration,
          phasesActedOn: [],
          healed: { applied: healResult.applied, detected: healResult.detected },
          graphRepairs: graphResult.repairs.length,
          nodesConsolidated: consolidateResult.actions.length,
          halted: false,
          haltReason: 'No phases found',
        });
        break;
      }

      const phasesActedOn: string[] = [];
      let anyWork = false;
      let onceDone = false;

      for (const phase of phases) {
        // Apply optional filters
        if (opts.projectFilter) {
          const projectId = String(phase.frontmatter['project'] ?? '');
          if (!projectId.toLowerCase().includes(opts.projectFilter.toLowerCase())) continue;
        }
        if (opts.phaseFilter !== undefined) {
          const phaseNum = Number(phase.frontmatter['phase_number'] ?? -1);
          if (phaseNum !== opts.phaseFilter) continue;
        }

        // Check depends_on before routing — skip phase if deps not yet completed
        const projectId = String(phase.frontmatter['project'] ?? '');
        const bundleDir = path.dirname(path.dirname(phase.path));
        const projectPhases = phases.filter(p => {
          const pProj = String(p.frontmatter['project'] ?? '');
          const pBundle = path.dirname(path.dirname(p.path));
          return pProj === projectId || pBundle === bundleDir;
        });
        if (!dependenciesMet(phase, projectPhases)) continue;

        const operation = routePhase(phase);

        // Dry run: log what would happen and skip execution
        if (opts.dryRun) {
          if (operation.op !== 'wait' && operation.op !== 'skip') {
            const projectId = String(phase.frontmatter['project'] ?? '');
            const phaseLabel = String(phase.frontmatter['phase_name'] ?? path.basename(phase.path, '.md'));
            console.log(`[dry-run] would ${operation.op}: [${projectId}] ${phaseLabel}`);
          }
          continue;
        }

        switch (operation.op) {
          case 'atomise': {
            const result = await atomisePhase(operation.phaseNode, runId, config);
            phasesActedOn.push(phase.path);
            anyWork = true;
            onceDone = true;
            await notify({
              event: result === 'ready' ? 'atomise_done' : 'phase_blocked',
              projectId: String(phase.frontmatter['project'] ?? ''),
              phaseLabel: String(phase.frontmatter['phase_name'] ?? path.basename(phase.path, '.md')),
              runId,
            }, config);
            break;
          }

          case 'execute': {
            const result = await runPhase(operation.phaseNode, runId, config);
            phasesActedOn.push(phase.path);
            anyWork = true;
            onceDone = true;
            if (result.status === 'completed') {
              await notify({
                event: 'phase_completed',
                projectId: String(phase.frontmatter['project'] ?? ''),
                phaseLabel: String(phase.frontmatter['phase_name'] ?? ''),
                detail: `${result.tasksCompleted} tasks done`,
                runId,
              }, config);
              // Auto-fire consolidator to extract learnings into Knowledge.md
              if (config.llm?.apiKey) {
                try {
                  const bundleDir = path.dirname(path.dirname(phase.path));
                  const projectId = String(phase.frontmatter['project'] ?? path.basename(bundleDir));
                  const bundle = readBundle(bundleDir, projectId);
                  await consolidatePhase(operation.phaseNode, bundle, runId, config);
                } catch (err) {
                  console.warn('[gzos] Consolidation failed (non-fatal):', (err as Error).message);
                }
              }
              // Phase review skill — after consolidation
              await runPhaseReview(operation.phaseNode, result.repoPath, runId, config).catch(() => {});
            } else if (result.status === 'blocked') {
              // Attempt auto-replan before giving up — rewrites task list, sets back to phase-ready
              const replanResult = await replanPhase(operation.phaseNode, runId, config);
              if (replanResult !== 'replanned') {
                // Replan not possible — surface for human review
                await notify({
                  event: 'phase_blocked',
                  projectId: String(phase.frontmatter['project'] ?? ''),
                  phaseLabel: String(phase.frontmatter['phase_name'] ?? ''),
                  detail: replanResult === 'max_reached'
                    ? `Max replans reached — needs human review`
                    : (result.blockers[0] ?? 'Blocked'),
                  runId,
                }, config);
              }
            }
            break;
          }

          case 'consolidate': {
            const bundleDir = path.dirname(path.dirname(phase.path));
            const projectId = String(phase.frontmatter['project'] ?? path.basename(bundleDir));
            const bundle = readBundle(bundleDir, projectId);
            await consolidatePhase(operation.phaseNode, bundle, runId, config);
            phasesActedOn.push(phase.path);
            anyWork = true;
            onceDone = true;
            break;
          }

          case 'surface_blocker': {
            await notify({
              event: 'phase_blocked',
              projectId: String(phase.frontmatter['project'] ?? ''),
              phaseLabel: String(phase.frontmatter['phase_name'] ?? path.basename(phase.path, '.md')),
              detail: String(phase.frontmatter['blocker'] ?? 'Phase is blocked'),
              runId,
            }, config);
            break;
          }

          case 'wait':
          case 'skip':
            break;
        }

        // --once: stop after first actionable phase
        if (opts.once && onceDone) break;
      }

      results.push({
        iteration,
        phasesActedOn,
        healed: { applied: healResult.applied, detected: healResult.detected },
        graphRepairs: graphResult.repairs.length,
        nodesConsolidated: consolidateResult.actions.length,
        halted: false,
      });

      // --once mode: break after first iteration that did work
      if (opts.once && onceDone) {
        break;
      }

      if (!anyWork) {
        await notify({ event: 'controller_idle', detail: 'No actionable phases', runId }, config);
        break;
      }
    }

    if (results.length >= config.maxIterations && results[results.length - 1]?.halted === false) {
      const last = results[results.length - 1];
      if (last) {
        last.halted = true;
        last.haltReason = `maxIterations (${config.maxIterations}) reached`;
      }
      await notify({ event: 'controller_halted', detail: `Hard limit of ${config.maxIterations} iterations reached`, runId }, config);
    }

    return results;
  } finally {
    // Always remove SIGINT/SIGTERM handlers when loop exits
    process.off('SIGINT', sigintHandler);
    process.off('SIGTERM', sigintHandler);
  }
}
