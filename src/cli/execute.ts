// gzos execute <project> [phase-number]
// Runs the agent executor against a single ready phase.
// Spawns the agent driver, executes tasks, writes log, advances FSM.

import { loadConfig } from '../config/load.js';
import { discoverBundles } from '../vault/reader.js';
import { discoverAllPhases } from '../vault/discover.js';
import { runPhase } from '../executor/runPhase.js';
import { stateFromNode } from '../fsm/nodeAdapter.js';
import { generateRunId } from '../controller/loop.js';
import path from 'path';

export async function runExecute(projectArg?: string, phaseArg?: string): Promise<void> {
  if (!projectArg) {
    console.log('Usage: gzos execute <project> [phase-number]');
    console.log('       Runs the agent driver against a ready phase.');
    process.exit(0);
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error('[gzos] Failed to load config:', (err as Error).message);
    process.exit(1);
  }

  // Find the project bundle
  const bundles = discoverBundles(config.vaultRoot, config.projectsGlob);
  const bundle = bundles.find(b => b.projectId.toLowerCase().includes(projectArg.toLowerCase()));
  if (!bundle) {
    console.error(`No project found matching "${projectArg}"`);
    process.exit(1);
  }

  // Discover all phases for this project
  const allPhases = discoverAllPhases(config.vaultRoot, config.projectsGlob);
  const projectPhases = allPhases.filter(p =>
    String(p.frontmatter['project'] ?? '').toLowerCase() === bundle.projectId.toLowerCase() ||
    p.path.startsWith(path.relative(config.vaultRoot, bundle.bundleDir))
  );

  if (projectPhases.length === 0) {
    console.error(`No phases found for "${bundle.projectId}". Run: gzos atomise "${bundle.projectId}"`);
    process.exit(1);
  }

  const runId = generateRunId();

  if (phaseArg) {
    const phaseNum = parseInt(phaseArg, 10);
    const phaseNode = projectPhases.find(p => Number(p.frontmatter['phase_number']) === phaseNum);
    if (!phaseNode) {
      console.error(`Phase ${phaseNum} not found in "${bundle.projectId}"`);
      console.log('Available phases:');
      for (const p of projectPhases) {
        console.log(`  P${p.frontmatter['phase_number']} — ${p.frontmatter['phase_name']} [${stateFromNode(p)}]`);
      }
      process.exit(1);
    }

    const state = stateFromNode(phaseNode);
    if (state !== 'ready' && state !== 'active') {
      console.error(`Phase P${phaseNum} is "${state}" — can only execute ready or active phases.`);
      if (state === 'backlog') {
        console.log(`  Plan it first: gzos plan-phase "${bundle.projectId}" ${phaseNum}`);
      }
      process.exit(1);
    }

    console.log(`Executing P${phaseNum} — ${phaseNode.frontmatter['phase_name']} for "${bundle.projectId}"...`);
    const result = await runPhase(phaseNode, runId, config);
    console.log(`\nResult: ${result.status}`);
    console.log(`  Tasks completed: ${result.tasksCompleted}`);
    if (result.blockers.length > 0) {
      console.log('  Blockers:');
      for (const b of result.blockers) console.log(`    - ${b}`);
    }
    if (result.logNotePath) {
      const rel = path.relative(process.cwd(), result.logNotePath);
      console.log(`  Log: ${rel}`);
    }
  } else {
    // Execute the first ready phase for this project
    const readyPhases = projectPhases.filter(p => {
      const s = stateFromNode(p);
      return s === 'ready' || s === 'active';
    });

    if (readyPhases.length === 0) {
      console.log(`No ready phases for "${bundle.projectId}".`);
      const backlogPhases = projectPhases.filter(p => stateFromNode(p) === 'backlog');
      if (backlogPhases.length > 0) {
        console.log(`  ${backlogPhases.length} phase(s) in backlog. Plan them first:`);
        console.log(`  gzos plan-phase "${bundle.projectId}"`);
      } else {
        console.log('  All phases are either completed or blocked.');
      }
      return;
    }

    const phaseNode = readyPhases[0]!;
    console.log(`Executing P${phaseNode.frontmatter['phase_number']} — ${phaseNode.frontmatter['phase_name']} for "${bundle.projectId}"...`);
    const result = await runPhase(phaseNode, runId, config);
    console.log(`\nResult: ${result.status}`);
    console.log(`  Tasks completed: ${result.tasksCompleted}`);
    if (result.blockers.length > 0) {
      console.log('  Blockers:');
      for (const b of result.blockers) console.log(`    - ${b}`);
    }
  }
}
