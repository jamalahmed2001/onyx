// gzos plan-phase <project> [phase-number]
// Atomises a single backlog phase — generates tasks from the phase description
// and advances it from backlog → ready. Safe to re-run (idempotent if already ready).

import { loadConfig } from '../config/load.js';
import { discoverBundles } from '../vault/reader.js';
import { discoverAllPhases } from '../vault/discover.js';
import { atomisePhase } from '../planner/atomiser.js';
import { stateFromNode } from '../fsm/nodeAdapter.js';
import { generateRunId } from '../controller/loop.js';
import path from 'path';

export async function runPlanPhase(projectArg?: string, phaseArg?: string): Promise<void> {
  if (!projectArg) {
    console.log('Usage: gzos plan-phase <project> [phase-number]');
    console.log('       Generates tasks for a backlog phase and marks it ready.');
    process.exit(0);
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error('[gzos] Failed to load config:', (err as Error).message);
    process.exit(1);
  }

  const apiKey = config.llm?.apiKey ?? process.env['OPENROUTER_API_KEY'];
  if (!apiKey) {
    console.error('[gzos] No LLM API key configured. Set OPENROUTER_API_KEY in your .env');
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
    // Plan a specific phase
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
    if (state !== 'backlog') {
      console.log(`Phase P${phaseNum} is already "${state}" — skipping atomise.`);
      console.log(`  If you want to re-plan it, reset it first: gzos reset`);
      return;
    }

    console.log(`Planning P${phaseNum} — ${phaseNode.frontmatter['phase_name']}...`);
    const result = await atomisePhase(phaseNode, runId, config);
    if (result === 'ready') {
      console.log(`Done. Phase is now ready to execute.`);
      console.log(`  Next: gzos execute "${bundle.projectId}" ${phaseNum}`);
    } else {
      console.error('Planning failed. Check your LLM API key and try again.');
      process.exit(1);
    }
  } else {
    // Plan all backlog phases for this project
    const backlogPhases = projectPhases.filter(p => stateFromNode(p) === 'backlog');
    if (backlogPhases.length === 0) {
      console.log(`No backlog phases to plan for "${bundle.projectId}".`);
      console.log('Phases:');
      for (const p of projectPhases) {
        console.log(`  P${p.frontmatter['phase_number']} — ${p.frontmatter['phase_name']} [${stateFromNode(p)}]`);
      }
      return;
    }

    console.log(`Planning ${backlogPhases.length} backlog phase(s) for "${bundle.projectId}"...`);
    let succeeded = 0;
    for (const phaseNode of backlogPhases) {
      process.stdout.write(`  P${phaseNode.frontmatter['phase_number']} — ${phaseNode.frontmatter['phase_name']}... `);
      const result = await atomisePhase(phaseNode, runId, config);
      if (result === 'ready') { console.log('ready'); succeeded++; }
      else { console.log('failed'); }
    }
    console.log(`\nDone. ${succeeded}/${backlogPhases.length} phases planned.`);
  }
}
