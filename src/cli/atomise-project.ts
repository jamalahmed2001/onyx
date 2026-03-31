// gzos atomise <project-name>
// Reads the Overview note for the project and generates phase notes using the LLM.

import { loadConfig } from '../config/load.js';
import { discoverBundles } from '../vault/reader.js';
import { planPhases } from '../planner/phasePlanner.js';
import { generateRunId } from '../controller/loop.js';

export async function runAtomiseProject(projectArg?: string): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error('[gzos] Failed to load config:', (err as Error).message);
    console.error('       Run: gzos doctor');
    process.exit(1);
  }

  const bundles = discoverBundles(config.vaultRoot, config.projectsGlob);

  if (!projectArg) {
    console.log('Usage: gzos atomise <project-name>');
    console.log('Projects:');
    for (const b of bundles) console.log(`  - ${b.projectId}`);
    return;
  }

  const bundle = bundles.find(b => b.projectId.toLowerCase().includes(projectArg.toLowerCase()));
  if (!bundle) {
    console.error(`No project found matching "${projectArg}"`);
    process.exit(1);
  }

  const apiKey = config.llm?.apiKey ?? process.env['OPENROUTER_API_KEY'];
  if (!apiKey) {
    console.error('[gzos] No LLM API key configured. Set OPENROUTER_API_KEY in your .env');
    process.exit(1);
  }

  console.log(`Generating phases for: ${bundle.projectId}...`);
  const runId = generateRunId();
  const created = await planPhases(bundle, runId, config);
  console.log(`Done. ${created.length} phases created.`);
  console.log('Review the generated phases in Obsidian before setting them phase-ready.');
}
