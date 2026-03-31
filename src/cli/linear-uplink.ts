import { loadConfig } from '../config/load.js';
import { discoverBundles } from '../vault/reader.js';
import { uplinkPhasesToLinear } from '../linear/uplink.js';

export async function runLinearUplink(projectArg?: string): Promise<void> {
  if (!projectArg) {
    console.log('Usage: gzos linear-uplink <project-name>');
    return;
  }

  const config = loadConfig();

  if (!config.linear) {
    console.error('Linear not configured. Add "linear": { "api_key": "...", "team_id": "..." } to groundzero.config.json');
    process.exit(1);
  }

  const bundles = discoverBundles(config.vaultRoot, config.projectsGlob);
  const bundle = bundles.find(b => b.projectId.toLowerCase().includes(projectArg.toLowerCase()));

  if (!bundle) {
    console.error(`No project found matching "${projectArg}"`);
    process.exit(1);
  }

  console.log(`Syncing ${bundle.projectId} → Linear...`);
  const result = await uplinkPhasesToLinear(bundle, config);
  console.log(`Done. created:${result.created} updated:${result.updated} skipped:${result.skipped}`);
}
