// onyx decompose / onyx atomise / onyx plan
//
// Two explicit commands that give the user clear control:
//
//   onyx decompose <project>            Overview → P1..Pn phase stubs (backlog)
//   onyx decompose <project> --extend   Updated Overview → add new phases
//   onyx atomise <project>              All backlog phases → tasks → ready
//   onyx atomise <project> 3            Just P3 → tasks → ready
//
// `onyx plan` is a convenience shortcut that runs decompose then atomise.

import { loadConfig } from '../config/load.js';
import { discoverBundles } from '../vault/reader.js';
import { discoverAllPhases } from '../vault/discover.js';
import { planPhases, planNewPhases } from '../planner/phasePlanner.js';
import { atomisePhase } from '../planner/atomiser.js';
import { stateFromFrontmatter } from '../shared/vault-parse.js';
import { generateRunId } from '../controller/loop.js';
import type { ControllerConfig } from '../config/load.js';
import type { VaultBundle } from '../vault/reader.js';
import path from 'path';
import fs from 'fs';

// ── Shared: load config + resolve bundle ─────────────────────────────────────

function loadConfigOrExit(): ControllerConfig {
  try {
    return loadConfig();
  } catch (err) {
    console.error('[onyx] Failed to load config:', (err as Error).message);
    console.error('       Run: onyx doctor');
    process.exit(1);
  }
}

function requireApiKey(config: ControllerConfig): void {
  const apiKey = config.llm?.apiKey ?? process.env['OPENROUTER_API_KEY'];
  if (!apiKey) {
    console.error('[onyx] No LLM API key configured. Set OPENROUTER_API_KEY in your .env');
    process.exit(1);
  }
}

function resolveBundle(projectArg: string, config: ControllerConfig): VaultBundle {
  const bundles = discoverBundles(config.vaultRoot, config.projectsGlob);
  const bundle = bundles.find(b => b.projectId.toLowerCase().includes(projectArg.toLowerCase()));
  if (!bundle) {
    console.error(`No project found matching "${projectArg}"`);
    console.log('Projects:');
    for (const b of bundles) console.log(`  - ${b.projectId}`);
    process.exit(1);
  }
  return bundle;
}

function findProjectPhases(config: ControllerConfig, bundle: VaultBundle) {
  const allPhases = discoverAllPhases(config.vaultRoot, config.projectsGlob);
  return allPhases.filter(p =>
    String(p.frontmatter['project'] ?? '').toLowerCase() === bundle.projectId.toLowerCase() ||
    p.path.startsWith(bundle.bundleDir)
  );
}

// ── decompose: Overview → phase stubs ────────────────────────────────────────

export async function runDecompose(projectArg?: string, opts?: { extend?: boolean; force?: boolean }): Promise<void> {
  if (!projectArg) {
    console.log('Usage: onyx decompose <project> [--extend] [--force]');
    console.log('');
    console.log('  Reads the Overview and generates phase stubs (status: backlog).');
    console.log('  --extend: reads updated Overview + knowledge → adds new phases.');
    console.log('  --force:  delete existing phases and re-decompose from scratch.');
    console.log('');
    console.log('Examples:');
    console.log('  onyx decompose "My Project"           — create P1..Pn from Overview');
    console.log('  onyx decompose "My Project" --extend   — add new phases from updated scope');
    console.log('  onyx decompose "My Project" --force    — re-decompose (replaces all phases)');
    process.exit(0);
  }

  const config = loadConfigOrExit();
  requireApiKey(config);
  const bundle = resolveBundle(projectArg, config);
  const runId = generateRunId();

  if (opts?.extend) {
    console.log(`\nExtending "${bundle.projectId}" with new phases from Overview...`);
    console.log('  (Overview.md is the source of truth — scope updates there drive new phases)');
    const newPhases = await planNewPhases(bundle, runId, config);
    if (newPhases.length === 0) {
      console.error('  ✗ Extension failed — check your LLM API key and Overview content');
      process.exit(1);
    }
    console.log(`  ✓ ${newPhases.length} new phase(s) added`);
    console.log(`\n  Next: onyx atomise "${bundle.projectId}"  — to generate tasks for the new phases`);
    return;
  }

  const phasesDir = path.join(bundle.bundleDir, 'Phases');
  const existingPhaseFiles = fs.existsSync(phasesDir)
    ? fs.readdirSync(phasesDir).filter(f => f.match(/^P\d+/) && f.endsWith('.md'))
    : [];

  if (existingPhaseFiles.length > 0 && !opts?.force) {
    console.log(`\nPhases already exist (${existingPhaseFiles.length}) for "${bundle.projectId}".`);
    console.log('  To add new phases: update Overview.md, then run:');
    console.log(`    onyx decompose "${bundle.projectId}" --extend`);
    console.log('  To generate tasks for existing backlog phases:');
    console.log(`    onyx atomise "${bundle.projectId}"`);
    console.log('  To re-decompose from scratch (replaces all phases):');
    console.log(`    onyx decompose "${bundle.projectId}" --force`);
    return;
  }

  if (opts?.force && existingPhaseFiles.length > 0) {
    const trashDir = path.join(bundle.bundleDir, '.onyx-backups', `pre-redecompose-${Date.now()}`);
    fs.mkdirSync(trashDir, { recursive: true });
    for (const f of existingPhaseFiles) {
      fs.renameSync(path.join(phasesDir, f), path.join(trashDir, f));
    }
    console.log(`\n[decompose] Moved ${existingPhaseFiles.length} existing phase(s) to ${path.relative(bundle.bundleDir, trashDir)}`);
  }

  console.log(`\nDecomposing Overview into phases for "${bundle.projectId}"...`);
  const created = await planPhases(bundle, runId, config);
  if (created.length === 0) {
    console.error('  ✗ Phase creation failed — check your LLM API key and Overview content');
    process.exit(1);
  }
  console.log(`  ✓ ${created.length} phases created (all backlog)`);
  console.log(`\n  Review in Obsidian, then run: onyx atomise "${bundle.projectId}"`);
}

// ── atomise: backlog phases → tasks → ready ──────────────────────────────────

export async function runAtomiseCommand(projectArg?: string, phaseArg?: string): Promise<void> {
  if (!projectArg) {
    console.log('Usage: onyx atomise <project> [phase-number]');
    console.log('');
    console.log('  Generates concrete tasks for backlog phases and marks them ready.');
    console.log('  With a phase number: atomises just that one phase.');
    console.log('');
    console.log('Examples:');
    console.log('  onyx atomise "My Project"     — all backlog phases → tasks → ready');
    console.log('  onyx atomise "My Project" 2   — just P2 → tasks → ready');
    process.exit(0);
  }

  const config = loadConfigOrExit();
  requireApiKey(config);
  const bundle = resolveBundle(projectArg, config);
  const runId = generateRunId();

  // ── Single phase ──────────────────────────────────────────────────────────
  if (phaseArg) {
    const phaseNum = parseInt(phaseArg, 10);
    if (isNaN(phaseNum)) {
      console.error(`Invalid phase number: "${phaseArg}"`);
      process.exit(1);
    }

    const projectPhases = findProjectPhases(config, bundle);
    const phaseNode = projectPhases.find(p => Number(p.frontmatter['phase_number']) === phaseNum);
    if (!phaseNode) {
      console.error(`Phase ${phaseNum} not found in "${bundle.projectId}"`);
      console.log('Available phases:');
      for (const p of projectPhases) {
        console.log(`  P${p.frontmatter['phase_number']} — ${p.frontmatter['phase_name']} [${stateFromFrontmatter(p.frontmatter)}]`);
      }
      process.exit(1);
    }

    const state = stateFromFrontmatter(phaseNode.frontmatter);
    if (state !== 'backlog') {
      console.log(`Phase P${phaseNum} is "${state}" — only backlog phases can be atomised.`);
      console.log(`  To re-atomise: onyx reset "${bundle.projectId}" ${phaseNum} → then re-run`);
      return;
    }

    console.log(`\nAtomising P${phaseNum} — ${phaseNode.frontmatter['phase_name']}...`);
    const result = await atomisePhase(phaseNode, runId, config);
    if (result === 'ready') {
      console.log('  ✓ Tasks written, phase marked ready');
      console.log(`\n  Next: onyx run --project "${bundle.projectId}"`);
    } else {
      console.error('  ✗ Atomisation failed — check your LLM API key and try again');
      process.exit(1);
    }
    return;
  }

  // ── All backlog phases ────────────────────────────────────────────────────
  const projectPhases = findProjectPhases(config, bundle);
  const backlogPhases = projectPhases.filter(p => stateFromFrontmatter(p.frontmatter) === 'backlog');

  if (backlogPhases.length === 0) {
    console.log(`\nNo backlog phases to atomise in "${bundle.projectId}".`);
    console.log('\nPhase states:');
    for (const p of projectPhases) {
      const icon = stateFromFrontmatter(p.frontmatter) === 'completed' ? '✓' : '○';
      console.log(`  ${icon} P${p.frontmatter['phase_number']} — ${p.frontmatter['phase_name']} [${stateFromFrontmatter(p.frontmatter)}]`);
    }
    console.log(`\n  To add new phases: onyx decompose "${bundle.projectId}" --extend`);
    return;
  }

  console.log(`\nAtomising ${backlogPhases.length} backlog phase(s) for "${bundle.projectId}"...`);

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

  console.log(`\nDone. ${succeeded}/${backlogPhases.length} phases atomised and ready.`);
  if (succeeded > 0) {
    console.log(`\n  Next: onyx run --project "${bundle.projectId}"`);
  }
}

// ── plan: convenience shortcut (decompose + atomise) ─────────────────────────

export async function runPlanProject(projectArg?: string, phaseArg?: string, opts?: { extend?: boolean }): Promise<void> {
  if (!projectArg) {
    console.log('Usage: onyx plan <project> [phase-number] [--extend]');
    console.log('');
    console.log('  Shortcut that runs decompose then atomise.');
    console.log('  For more control, use the individual commands:');
    console.log('    onyx decompose <project>     — Overview → phase stubs');
    console.log('    onyx atomise <project> [n]    — backlog phases → tasks → ready');
    process.exit(0);
  }

  // --extend is a decompose concern
  if (opts?.extend) {
    await runDecompose(projectArg, { extend: true });
    return;
  }

  // Specific phase number → atomise only
  if (phaseArg) {
    await runAtomiseCommand(projectArg, phaseArg);
    return;
  }

  // Full flow: decompose if needed, then atomise all backlog
  const config = loadConfigOrExit();
  requireApiKey(config);
  const bundle = resolveBundle(projectArg, config);
  const runId = generateRunId();
  const phasesDir = path.join(bundle.bundleDir, 'Phases');

  // Step 1: decompose (create phase stubs if none exist)
  const existingPhaseFiles = fs.existsSync(phasesDir)
    ? fs.readdirSync(phasesDir).filter(f => f.match(/^P\d+/) && f.endsWith('.md'))
    : [];

  if (existingPhaseFiles.length === 0) {
    console.log(`\n[decompose] No phases found — generating from Overview...`);
    const created = await planPhases(bundle, runId, config);
    if (created.length === 0) {
      console.error('  ✗ Phase creation failed — check your LLM API key and Overview content');
      process.exit(1);
    }
    console.log(`  ✓ ${created.length} phases created`);
  } else {
    console.log(`\n[decompose] ${existingPhaseFiles.length} phases already exist — skipping`);
  }

  // Step 2: atomise all backlog phases
  const projectPhases = findProjectPhases(config, bundle);
  const backlogPhases = projectPhases.filter(p => stateFromFrontmatter(p.frontmatter) === 'backlog');

  if (backlogPhases.length === 0) {
    console.log(`[atomise] No backlog phases — all phases already have tasks`);
    console.log(`\n  Next: onyx run --project "${bundle.projectId}"`);
    return;
  }

  console.log(`\n[atomise] Writing tasks for ${backlogPhases.length} backlog phase(s)...`);

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

  console.log(`\nDone. ${succeeded}/${backlogPhases.length} phases atomised and ready.`);
  if (succeeded > 0) {
    console.log(`\n  Next: onyx run --project "${bundle.projectId}"`);
  }
}
