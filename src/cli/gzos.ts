#!/usr/bin/env node
// gzos — GroundZeroOS CLI
//
// Consistent arg pattern: gzos <verb> [project] [--flags]
// Global flags: --json (machine-readable output), --verbose/-v
//
// ── CORE ─────────────────────────────────────────────────────────────────────
//   gzos plan <project> [n] [--extend]   Plan phases / atomise tasks
//   gzos run  [project] [--phase n]      Execute (auto-implies --once with --phase)
//   gzos status [project] [--json]       Show state
//
// ── MAINTENANCE ──────────────────────────────────────────────────────────────
//   gzos heal [--json]                   Fix vault drift, stale locks
//   gzos doctor [--json]                 Pre-flight checks
//   gzos reset <project> [--phase n]     Unstick a phase → ready
//   gzos set-state <path> <state>        Programmatic state change
//   gzos logs [project]                  Show execution log

import { runInit } from './init.js';
import { runDoctor } from './doctor.js';
import { runPlan } from './plan.js';

import { runPlanPhase } from './plan-phase.js';
import { runExecute } from './execute.js';
import { runCapture } from './capture.js';
import { runResearch } from './research.js';
import { runConsolidate } from './consolidate.js';
import { runReset } from './reset.js';
import { runAtomiseProject } from './atomise-project.js';
import { runPlanProject } from './plan-project.js';
import { runLogs } from './logs.js';
import { runRefreshContext } from './refresh-context.js';
import { runLinearUplink } from './linear-uplink.js';
import { loadConfig } from '../config/load.js';
import { runLoop } from '../controller/loop.js';
import { runAllHeals } from '../healer/index.js';
import { maintainVaultGraph } from '../vault/graphMaintainer.js';
import { consolidateVaultNodes } from '../vault/nodeConsolidator.js';
import { discoverAllPhases } from '../vault/discover.js';
import { stateFromNode } from '../fsm/nodeAdapter.js';
import { importLinearProject } from '../linear/import.js';
import { setVerbose } from '../utils/log.js';
import { countTasks } from '../shared/vault-parse.js';
import { stateFromFrontmatter } from '../shared/vault-parse.js';
import { setPhaseTag } from '../vault/writer.js';
import { readPhaseNode } from '../vault/reader.js';
import { normalizeTag, toTag } from '../fsm/states.js';
import path from 'path';

// Format task progress from shared countTasks
function taskProgress(content: string): string {
  const { done, total } = countTasks(content);
  if (total === 0) return '';
  return ` (${done}/${total} tasks)`;
}

// Extract a brief blocked reason from a phase note's ## Human Requirements or ## Blockers section.
function extractBlockedReason(content: string): string {
  const hrMatch = content.match(/## Human Requirements([\s\S]*?)(?=\n##|\s*$)/);
  if (hrMatch) {
    const hr = hrMatch[1]!.trim();
    if (hr && hr !== '(none)' && hr !== 'None.' && hr !== '- (none)') {
      return hr.split('\n')[0]!.trim().slice(0, 80);
    }
  }
  const blMatch = content.match(/## Blockers([\s\S]*?)(?=\n##|\s*$)/);
  if (blMatch) {
    const bl = blMatch[1]!.trim();
    if (bl && bl !== '(none)') return bl.split('\n')[0]!.trim().slice(0, 80);
  }
  return '';
}

// Render a single phase line for human-readable status output.
function renderPhaseLine(phase: ReturnType<typeof discoverAllPhases>[number], indent: string): void {
  const state = stateFromNode(phase);
  const name = String(phase.frontmatter['phase_name'] ?? path.basename(phase.path, '.md'));
  const num = phase.frontmatter['phase_number'] ? `P${phase.frontmatter['phase_number']} — ` : '';
  const lock = phase.frontmatter['locked_by'] ? ` [locked: ${phase.frontmatter['locked_by']}]` : '';
  const risk = phase.frontmatter['risk'] ? ` [${phase.frontmatter['risk']}]` : '';
  const icon = state === 'completed' ? '✓' : state === 'active' ? '▶' : state === 'blocked' ? '✗' : '○';
  const progress = (state === 'active' || state === 'ready') ? taskProgress(phase.content) : '';
  console.log(`${indent}${icon}  [${state}] ${num}${name}${progress}${risk}${lock}`);
  if (state === 'blocked') {
    const reason = extractBlockedReason(phase.content);
    if (reason) console.log(`${indent}       ↳ ${reason}`);
  }
}

// Filter out global flags before dispatching
const rawArgs = process.argv.slice(2);
const globalFlags = new Set(['--verbose', '-v', '--json']);
const filteredArgs = rawArgs.filter(a => !globalFlags.has(a));
if (rawArgs.includes('--verbose') || rawArgs.includes('-v')) setVerbose(true);
const jsonMode = rawArgs.includes('--json');

const [command = '', ...args] = filteredArgs;

switch (command) {
  // ── init ──────────────────────────────────────────────────────────────────
  case 'init': {
    await runInit(args[0]);
    break;
  }

  // ── dashboard ─────────────────────────────────────────────────────────────
  case 'dashboard': {
    const { execSync: execDash } = await import('child_process');
    const dashDir = new URL('../../dashboard', import.meta.url).pathname;
    const port = args[0] ?? '7070';
    console.log(`[gzos] Dashboard → http://localhost:${port}`);
    try { execDash(`npm run dev -- --port ${port}`, { cwd: dashDir, stdio: 'inherit' }); } catch { /* killed */ }
    break;
  }

  // ── doctor ────────────────────────────────────────────────────────────────
  case 'doctor': {
    await runDoctor();
    break;
  }

  // ── run ───────────────────────────────────────────────────────────────────
  case 'run': {
    const config = loadConfig();
    const dryRun = args.includes('--dry-run');
    let once = args.includes('--once');

    // Project filter: --project <name> or first positional arg (if not a flag)
    const projectIdx = args.indexOf('--project');
    const positionalProject = args[0] && !args[0].startsWith('--') ? args[0] : undefined;
    const projectFilter = (projectIdx !== -1 ? args[projectIdx + 1] : positionalProject) ?? undefined;

    // Phase filter: --phase <n>
    const phaseIdx = args.indexOf('--phase');
    const phaseFilterRaw = phaseIdx !== -1 ? args[phaseIdx + 1] : undefined;
    const phaseFilter = phaseFilterRaw !== undefined ? parseInt(phaseFilterRaw, 10) : undefined;

    // Auto-imply --once when targeting a specific phase
    if (phaseFilter !== undefined) once = true;

    if (!jsonMode) {
      if (dryRun) console.log('[gzos] Dry run — showing what would execute without running agents');
      if (once) console.log('[gzos] --once mode: will stop after first actionable phase');
      console.log('[gzos] Starting controller loop...');
    }
    const results = await runLoop(config, { projectFilter, phaseFilter, dryRun, once });
    const acted = results.reduce((n, r) => n + r.phasesActedOn.length, 0);
    if (jsonMode) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(`[gzos] Done. ${results.length} iteration(s), ${acted} phases acted on.`);
    }
    break;
  }

  // ── heal ──────────────────────────────────────────────────────────────────
  case 'heal': {
    const config = loadConfig();
    if (!jsonMode) console.log('[gzos] Running healer...');

    const healResult = runAllHeals(config);
    const graphResult = await maintainVaultGraph(config);
    const consolidateResult = await consolidateVaultNodes(config);

    if (jsonMode) {
      console.log(JSON.stringify({
        locksCleared: healResult.actions.filter(a => a.type === 'stale_lock_cleared' && a.applied).length,
        driftFixed: healResult.applied,
        driftDetected: healResult.detected,
        graphRepairs: graphResult.repairs.length,
        wrongLinksRemoved: graphResult.wrongLinksRemoved,
        hubsSplit: graphResult.hubsSplit,
        phasesArchived: consolidateResult.phasesArchived,
        docsMerged: consolidateResult.docsMerged,
      }, null, 2));
    } else {
      console.log(`  Healer: ${healResult.applied} applied, ${healResult.detected} detected`);
      for (const a of healResult.actions) {
        console.log(`    [${a.applied ? '✓' : '!'}] ${a.type}: ${a.description}`);
      }
      console.log(`  Graph: ${graphResult.repairs.length} link repairs, ${graphResult.wrongLinksRemoved} wrong links removed, ${graphResult.hubsSplit} hubs split`);
      if (consolidateResult.actions.length > 0) {
        console.log(`  Consolidate: ${consolidateResult.phasesArchived} phases archived, ${consolidateResult.docsMerged} docs merged`);
      }
      console.log('[gzos] Vault is healthy.');
    }
    break;
  }

  // ── status ────────────────────────────────────────────────────────────────
  case 'status': {
    const config = loadConfig();
    const phases = discoverAllPhases(config.vaultRoot, config.projectsGlob);

    if (jsonMode) {
      // Machine-readable snapshot
      const byProject = new Map<string, typeof phases>();
      for (const phase of phases) {
        const proj = String(phase.frontmatter['project'] ?? path.basename(path.dirname(path.dirname(phase.path))));
        if (!byProject.has(proj)) byProject.set(proj, []);
        byProject.get(proj)!.push(phase);
      }

      const snapshot = {
        timestamp: new Date().toISOString(),
        projects: Array.from(byProject.entries()).map(([projectId, projectPhases]) => {
          const completedCount = projectPhases.filter(p => stateFromNode(p) === 'completed').length;
          const bundleDir = projectPhases[0] ? path.dirname(path.dirname(projectPhases[0].path)) : '';
          return {
            projectId,
            bundleDir,
            phases: projectPhases.map(p => {
              const { done, total } = countTasks(p.content);
              const phaseState = stateFromFrontmatter(p.frontmatter);
              const deps = p.frontmatter['depends_on'];
              const depsArr: number[] = Array.isArray(deps) ? (deps as unknown[]).map(Number) : [];
              return {
                path: p.path,
                phaseNumber: Number(p.frontmatter['phase_number'] ?? 0),
                phaseName: String(p.frontmatter['phase_name'] ?? ''),
                milestone: String(p.frontmatter['milestone'] ?? ''),
                phaseType: String(p.frontmatter['phase_type'] ?? 'slice'),
                risk: String(p.frontmatter['risk'] ?? 'medium'),
                status: `phase-${phaseState}`,
                tasksTotal: total,
                tasksDone: done,
                dependsOn: depsArr,
                blockedReason: phaseState === 'blocked' ? extractBlockedReason(p.content) : '',
                lockedBy: String(p.frontmatter['locked_by'] ?? ''),
                lockedAt: String(p.frontmatter['locked_at'] ?? ''),
              };
            }),
            phasesComplete: completedCount,
            phasesTotal: projectPhases.length,
          };
        }),
      };
      console.log(JSON.stringify(snapshot, null, 2));
    } else if (phases.length === 0) {
      console.log('No project phases found. Run: gzos init "My Project"');
    } else {
      // Human-readable output with milestone grouping
      const byProject = new Map<string, typeof phases>();
      for (const phase of phases) {
        const proj = String(phase.frontmatter['project'] ?? path.basename(path.dirname(path.dirname(phase.path))));
        if (!byProject.has(proj)) byProject.set(proj, []);
        byProject.get(proj)!.push(phase);
      }
      for (const [project, projectPhases] of byProject) {
        const totalPhases = projectPhases.length;
        const completedPhases = projectPhases.filter(p => stateFromNode(p) === 'completed').length;
        console.log(`\n${project}`);

        // Separate phases with and without milestones
        const milestoneGroups = new Map<string, typeof phases>();
        const ungrouped: typeof phases = [];
        for (const phase of projectPhases) {
          const ms = String(phase.frontmatter['milestone'] ?? '').trim();
          if (ms) {
            if (!milestoneGroups.has(ms)) milestoneGroups.set(ms, []);
            milestoneGroups.get(ms)!.push(phase);
          } else {
            ungrouped.push(phase);
          }
        }

        // Render milestone groups first
        for (const [ms, msPhases] of milestoneGroups) {
          console.log(`  [${ms}]`);
          for (const phase of msPhases) {
            renderPhaseLine(phase, '    ');
          }
        }

        // Then ungrouped phases
        for (const phase of ungrouped) {
          renderPhaseLine(phase, '  ');
        }

        console.log(`  — ${completedPhases}/${totalPhases} phases complete`);
      }
      console.log('');
    }
    break;
  }

  // ── daily-plan ────────────────────────────────────────────────────────────
  // gzos daily-plan [YYYY-MM-DD]        — daily time-blocked plan (writes to 04 - Planning)
  case 'daily-plan': {
    const config = loadConfig();
    await runPlan(config, args[0]);
    break;
  }

  // ── plan ──────────────────────────────────────────────────────────────────
  // gzos plan <project> [n] [--extend]  — state-aware project planning
  case 'plan': {
    if (!args[0] || args[0].startsWith('--')) {
      console.error('Usage: gzos plan "<project>" [phaseNumber] [--extend]');
      console.error('Tip: for daily planning use: gzos daily-plan');
      process.exit(1);
    }
    const extend = args.includes('--extend');
    const phaseArg = args.slice(1).find(a => !a.startsWith('--') && /^\d+$/.test(a));
    await runPlanProject(args[0], phaseArg, { extend });
    break;
  }

  // ── capture ───────────────────────────────────────────────────────────────
  case 'capture': {
    await runCapture(args.join(' '));
    break;
  }

  // ── research ──────────────────────────────────────────────────────────────
  case 'research': {
    await runResearch(args[0]);
    break;
  }

  // ── consolidate ────────────────────────────────────────────────────────────
  case 'consolidate': {
    await runConsolidate(args);
    break;
  }

  // ── import ────────────────────────────────────────────────────────────────
  case 'import': {
    const linearId = args[0];
    if (!linearId) {
      console.error('Usage: gzos import <linearProjectId>');
      process.exit(1);
    }
    const config = loadConfig();
    if (!config.linear) {
      console.error('Linear not configured. Add "linear": { "api_key": "...", "team_id": "..." } to groundzero.config.json');
      process.exit(1);
    }
    console.log(`[gzos] Importing Linear project ${linearId}...`);
    const bundle = await importLinearProject(linearId, config);
    console.log(`[gzos] Imported "${bundle.projectId}"`);
    console.log(`  ${bundle.phases.length} phases created in: ${bundle.bundleDir}`);
    console.log(`  Next: gzos run`);
    break;
  }

  // ── reset ─────────────────────────────────────────────────────────────────
  case 'reset': {
    await runReset(args[0]);
    break;
  }

  // ── set-state ─────────────────────────────────────────────────────────────
  // Programmatic state change (used by dashboard, scripts, orchestrators)
  // gzos set-state <path> <state> [--json]
  case 'set-state': {
    const phasePath = args[0];
    const newState = args[1];
    if (!phasePath || !newState) {
      console.error('Usage: gzos set-state <phasePath> <state>');
      console.error('States: backlog, planning, ready, active, blocked, completed');
      process.exit(1);
    }
    const normalized = normalizeTag(newState);
    const node = readPhaseNode(phasePath);
    if (!node.exists) {
      const msg = `Phase note not found: ${phasePath}`;
      if (jsonMode) console.log(JSON.stringify({ error: msg }));
      else console.error(`[gzos] ${msg}`);
      process.exit(1);
    }
    const previous = stateFromFrontmatter(node.frontmatter);
    setPhaseTag(phasePath, toTag(normalized));
    if (jsonMode) {
      console.log(JSON.stringify({ path: phasePath, previous, new: normalized }));
    } else {
      console.log(`[gzos] ${phasePath}: ${previous} → ${normalized}`);
    }
    break;
  }

  // ── deprecated aliases — kept for backward compat ────────────────────────
  case 'atomise':
  case 'atomize': {
    console.warn('[gzos] Deprecated: use "gzos plan <project>" instead');
    await runAtomiseProject(args[0]);
    break;
  }
  case 'plan-phase': {
    console.warn('[gzos] Deprecated: use "gzos plan <project> --phase <n>" instead');
    await runPlanPhase(args[0], args[1]);
    break;
  }
  case 'plan-project': {
    console.warn('[gzos] Deprecated: use "gzos plan <project>" instead');
    await runPlanProject(args[0]);
    break;
  }
  case 'execute': {
    console.warn('[gzos] Deprecated: use "gzos run <project> --phase <n> --once" instead');
    await runExecute(args[0], args[1]);
    break;
  }

  // ── logs ──────────────────────────────────────────────────────────────────
  case 'logs': {
    await runLogs(args[0]);
    break;
  }

  // ── refresh-context ───────────────────────────────────────────────────────
  case 'refresh-context': {
    await runRefreshContext(args[0]);
    break;
  }

  // ── linear-uplink ─────────────────────────────────────────────────────────
  case 'linear-uplink': {
    await runLinearUplink(args[0]);
    break;
  }

  // ── help / unknown ────────────────────────────────────────────────────────
  default: {
    const known = [
      'init', 'run', 'heal', 'status', 'doctor', 'plan', 'capture', 'research',
      'consolidate', 'import', 'reset', 'atomise', 'atomize', 'plan-phase',
      'plan-project', 'execute', 'logs', 'refresh-context', 'linear-uplink',
      'daily-plan', 'dashboard', 'set-state',
    ];
    if (command && !known.includes(command)) {
      console.error(`Unknown command: ${command}`);
    }
    console.log(`
gzos — GroundZeroOS

Usage: gzos <command> [project] [options]

Global flags: --json (machine-readable output)  --verbose/-v (debug logging)

── Planning ─────────────────────────────────────────────────────────────────────

  plan <project>              Create phases + atomise tasks (all-in-one)
  plan <project> <n>          Atomise a single backlog phase only
  plan <project> --extend     Add new phases from updated Overview

── Execution ────────────────────────────────────────────────────────────────────

  run [project]               Full loop: plan backlog → execute ready → consolidate done
  run <project> --phase <n>   Execute a specific phase (auto-implies --once)
  run --dry-run               Preview what would run (no changes)
  run --once                  Single iteration, then exit

── Monitoring ───────────────────────────────────────────────────────────────────

  status [project]            Show all projects and phase states
  logs [project]              Show execution log for a phase

── Maintenance ──────────────────────────────────────────────────────────────────

  init <name>                 Create a new project bundle
  heal                        Fix stale locks, nav links, graph drift
  doctor                      Pre-flight checks
  reset <project> [--phase n] Reset a blocked/active phase → ready
  set-state <path> <state>    Programmatic state change (for scripts/dashboard)

── Other ────────────────────────────────────────────────────────────────────────

  daily-plan [date]           Write a time-blocked daily plan
  capture <text>              Quick capture to Obsidian Inbox
  import <id>                 Import a Linear project
  dashboard [port]            Launch web dashboard (default: 7070)

── Examples ─────────────────────────────────────────────────────────────────────

  gzos init "My App"                    # create project bundle
  gzos plan "My App"                    # scan repo → phases → tasks → ready
  gzos run "My App"                     # execute ready phases
  gzos run "My App" --phase 3           # execute P3 only
  gzos run                              # full loop, all projects
  gzos status --json                    # machine-readable snapshot
  gzos heal --json                      # fix vault, return counts
`);
    process.exit(command && !known.includes(command) ? 1 : 0);
  }
}
