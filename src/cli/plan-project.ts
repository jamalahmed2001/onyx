// gzos plan <project> [phase-number] [--extend]
//
// State-aware planning command:
//   • No phases exist        → reads Overview + repo → creates P1..Pn phase stubs
//   • Phases exist, backlog  → generates task plans for them → marks ready
//   • All phases have tasks  → suggests --extend (or runs it if flag passed)
//   • --extend               → reads current Overview + knowledge → adds new phases
//
// The Overview.md is the source of truth for project direction.
// Update it with new scope, then run `gzos plan <project> --extend` to generate
// additional phases that continue the work and reflect the updated scope.

import { loadConfig } from '../config/load.js';
import { discoverBundles } from '../vault/reader.js';
import { discoverAllPhases } from '../vault/discover.js';
import { planPhases, planNewPhases } from '../planner/phasePlanner.js';
import { atomisePhase } from '../planner/atomiser.js';
import { stateFromNode } from '../fsm/nodeAdapter.js';
import { generateRunId } from '../controller/loop.js';
import path from 'path';
import fs from 'fs';

export async function runPlanProject(projectArg?: string, phaseArg?: string, opts?: { extend?: boolean }): Promise<void> {
  if (!projectArg) {
    console.log('Usage: gzos plan <project> [phase-number] [--extend]');
    console.log('');
    console.log('  No flags:     creates phase stubs (if none exist) then atomises all backlog phases.');
    console.log('  --extend:     reads current Overview + knowledge → adds new phases continuing the work.');
    console.log('  phase-number: atomises that specific phase only (generates tasks, marks ready).');
    console.log('');
    console.log('The Overview.md is the source of truth. Update it with new scope, then run --extend.');
    console.log('');
    console.log('Examples:');
    console.log('  gzos plan "GZ Demo"           — full plan: create phases + write tasks');
    console.log('  gzos plan "GZ Demo" 2          — atomise P2 only');
    console.log('  gzos plan "GZ Demo" --extend   — add new phases based on current Overview');
    process.exit(0);
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error('[gzos] Failed to load config:', (err as Error).message);
    console.error('       Run: gzos doctor');
    process.exit(1);
  }

  const apiKey = config.llm?.apiKey ?? process.env['OPENROUTER_API_KEY'];
  if (!apiKey) {
    console.error('[gzos] No LLM API key configured. Set OPENROUTER_API_KEY in your .env');
    process.exit(1);
  }

  const bundles = discoverBundles(config.vaultRoot, config.projectsGlob);
  const bundle = bundles.find(b => b.projectId.toLowerCase().includes(projectArg.toLowerCase()));
  if (!bundle) {
    console.error(`No project found matching "${projectArg}"`);
    console.log('Projects:');
    for (const b of bundles) console.log(`  - ${b.projectId}`);
    process.exit(1);
  }

  const runId = generateRunId();
  const phasesDir = path.join(bundle.bundleDir, 'Phases');

  // ── If targeting a specific phase, skip creation and just atomise it ────────
  if (phaseArg) {
    const phaseNum = parseInt(phaseArg, 10);
    if (isNaN(phaseNum)) {
      console.error(`Invalid phase number: "${phaseArg}"`);
      process.exit(1);
    }

    const allPhases = discoverAllPhases(config.vaultRoot, config.projectsGlob);
    const projectPhases = allPhases.filter(p =>
      String(p.frontmatter['project'] ?? '').toLowerCase() === bundle.projectId.toLowerCase() ||
      p.path.startsWith(path.relative(config.vaultRoot, bundle.bundleDir))
    );

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
      console.log(`Phase P${phaseNum} is "${state}" — only backlog phases can be planned.`);
      console.log(`  To re-plan it: gzos reset "${bundle.projectId}" ${phaseNum} → then re-run`);
      return;
    }

    console.log(`\nPlanning P${phaseNum} — ${phaseNode.frontmatter['phase_name']}...`);
    const result = await atomisePhase(phaseNode, runId, config);
    if (result === 'ready') {
      console.log(`  ✓ Tasks written, phase marked ready`);
      console.log(`\n  Next: gzos run --project "${bundle.projectId}"`);
    } else {
      console.error('  ✗ Planning failed — check your LLM API key and try again');
      process.exit(1);
    }
    return;
  }

  // ── Full flow: create phases if needed, then atomise all backlog ────────────

  // Step 1: create phase stubs if Phases/ is empty
  const existingPhaseFiles = fs.existsSync(phasesDir)
    ? fs.readdirSync(phasesDir).filter(f => f.match(/^P\d+/) && f.endsWith('.md'))
    : [];

  if (existingPhaseFiles.length === 0) {
    console.log(`\n[1/2] No phases found — generating phase structure from Overview...`);
    const created = await planPhases(bundle, runId, config);
    if (created.length === 0) {
      console.error('  ✗ Phase creation failed — check your LLM API key and Overview content');
      process.exit(1);
    }
    console.log(`  ✓ ${created.length} phases created`);
  } else {
    console.log(`\n[1/2] Phases already exist (${existingPhaseFiles.length}) — skipping creation`);
  }

  // Step 2: atomise all backlog phases
  const allPhases = discoverAllPhases(config.vaultRoot, config.projectsGlob);
  const projectPhases = allPhases.filter(p =>
    String(p.frontmatter['project'] ?? '').toLowerCase() === bundle.projectId.toLowerCase() ||
    p.path.startsWith(path.relative(config.vaultRoot, bundle.bundleDir))
  );

  const backlogPhases = projectPhases.filter(p => stateFromNode(p) === 'backlog');

  if (backlogPhases.length === 0) {
    if (opts?.extend) {
      // --extend: Overview is source of truth — read it (may have new scope) and add phases
      console.log(`\n[2/2] Extending project with new phases from Overview...`);
      console.log(`  (Overview.md is the source of truth — scope updates there drive new phases)`);
      const newPhases = await planNewPhases(bundle, runId, config);
      if (newPhases.length === 0) {
        console.error('  ✗ Extension failed — check your LLM API key and Overview content');
        process.exit(1);
      }
      console.log(`  ✓ ${newPhases.length} new phase(s) added`);
      console.log(`\n  Run: gzos plan "${bundle.projectId}"  to generate tasks for the new phases`);
      console.log(`  Then: gzos run --project "${bundle.projectId}"`);
      return;
    }

    console.log(`\n[2/2] No backlog phases to atomise — all phases already have tasks`);
    console.log('\nPhase states:');
    for (const p of projectPhases) {
      const icon = stateFromNode(p) === 'completed' ? '✓' : '○';
      console.log(`  ${icon} P${p.frontmatter['phase_number']} — ${p.frontmatter['phase_name']} [${stateFromNode(p)}]`);
    }
    console.log(`\n  To add new phases: update Overview.md with new scope, then run:`);
    console.log(`    gzos plan "${bundle.projectId}" --extend`);
    console.log(`\n  Next: gzos run --project "${bundle.projectId}"`);
    return;
  }

  console.log(`\n[2/2] Atomising ${backlogPhases.length} backlog phase(s)...`);

  let succeeded = 0;
  for (const phaseNode of backlogPhases) {
    const label = `P${phaseNode.frontmatter['phase_number']} — ${phaseNode.frontmatter['phase_name']}`;
    process.stdout.write(`  ${label}... `);
    const result = await atomisePhase(phaseNode, runId, config);
    if (result === 'ready') {
      console.log('✓ ready');
      succeeded++;
    } else {
      console.log('✗ failed');
    }
  }

  console.log(`\nDone. ${succeeded}/${backlogPhases.length} phases planned and ready.`);
  if (succeeded > 0) {
    console.log(`\n  Next: gzos run --project "${bundle.projectId}"`);
  }
}
