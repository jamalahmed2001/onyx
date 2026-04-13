#!/usr/bin/env node
// onyx heal
// M2 + M3: Scan and repair vault drift.

import { loadConfig } from '../config/load.js';
import { runAllHeals } from '../healer/index.js';

const config = loadConfig();
const result = runAllHeals(config);
console.log(`Heal complete: ${result.applied} applied, ${result.detected} detected.`);
for (const action of result.actions) {
  const mark = action.applied ? '✓' : '!';
  console.log(`  [${mark}] ${action.type}: ${action.description}`);
}
