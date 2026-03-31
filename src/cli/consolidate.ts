#!/usr/bin/env node
// gzos consolidate
// Run the node consolidator (phase group archiving + doc merges).
// Defaults to dry-run.

import { loadConfig } from '../config/load.js';
import { consolidateVaultNodes } from '../vault/nodeConsolidator.js';

export async function runConsolidate(args: string[]): Promise<void> {
  const dryRun = !args.includes('--apply');
  const config = loadConfig();

  const projectIdx = args.findIndex(a => a === '--project');
  const projectFilter = projectIdx >= 0 ? (args[projectIdx + 1] ?? '') : '';

  const result = await consolidateVaultNodes(config, { dryRun, projectFilter, includeLogs: true, includeDocsHubCleanup: true });

  const mode = dryRun ? 'DRY RUN' : 'APPLY';
  console.log(`\n[gzos] Consolidator (${mode})`);
  console.log(`  actions: ${result.actions.length}`);
  console.log(`  phases archived: ${result.phasesArchived}`);
  console.log(`  docs merged: ${result.docsMerged}`);

  for (const a of result.actions) {
    console.log(`\n- ${a.type}: ${a.description}`);
    console.log(`  archive: ${a.archivePath}`);
    for (const f of a.files.slice(0, 20)) {
      console.log(`   - ${f}`);
    }
    if (a.files.length > 20) console.log(`   … +${a.files.length - 20} more`);
  }
}
