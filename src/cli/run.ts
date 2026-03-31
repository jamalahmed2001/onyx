#!/usr/bin/env node
// groundzeros run
// Loads config, runs controller loop.

import { loadConfig } from '../config/load.js';
import { runLoop } from '../controller/loop.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const config = loadConfig();
const projectFilter = arg('--project');
const phaseFilterRaw = arg('--phase');
const dryRun = process.argv.includes('--dry-run');
const once = process.argv.includes('--once');

const phaseFilter = phaseFilterRaw ? Number(phaseFilterRaw) : undefined;

const results = await runLoop(config, { projectFilter, phaseFilter, dryRun, once });
console.log(`Done. ${results.length} iterations.`);
