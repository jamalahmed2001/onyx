#!/usr/bin/env node
// groundzeros import-linear <linearProjectId>
// L1: Import a Linear project as a vault bundle.

import { loadConfig } from '../config/load.js';
import { importLinearProject } from '../linear/import.js';

const [,, linearProjectId] = process.argv;
if (!linearProjectId) {
  console.error('Usage: groundzeros import-linear <projectId>');
  process.exit(1);
}

const config = loadConfig();
if (!config.linear) {
  console.error('linear config missing in groundzero.config.json');
  process.exit(1);
}

const bundle = await importLinearProject(linearProjectId, config);
console.log(`Imported "${bundle.projectId}" → ${bundle.bundleDir}`);
console.log(`  ${bundle.phases.length} phases created`);
