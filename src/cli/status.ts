#!/usr/bin/env node
// groundzeros status
// Show all projects and their phase states.

import { loadConfig } from '../config/load.js';
import { discoverAllPhases } from '../vault/discover.js';
import { stateFromNode } from '../fsm/nodeAdapter.js';
import path from 'path';

const config = loadConfig();
const phases = discoverAllPhases(config.vaultRoot, config.projectsGlob);

if (phases.length === 0) {
  console.log('No GroundZeroOS phase notes found.');
} else {
  for (const phase of phases) {
    const state = stateFromNode(phase);
    const project = phase.frontmatter['project'] ?? path.basename(path.dirname(path.dirname(phase.path)));
    const name = phase.frontmatter['phase_name'] ?? path.basename(phase.path, '.md');
    const lock = phase.frontmatter['locked_by'] ? ` [locked by ${phase.frontmatter['locked_by']}]` : '';
    console.log(`  ${project} · ${name}: ${state}${lock}`);
  }
}
